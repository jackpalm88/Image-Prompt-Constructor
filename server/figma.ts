import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';

import { redis, getFigmaTokenRecord, upsertFigmaTokenRecord } from './storage';

const FIGMA_OAUTH_KEY = (state: string) => `figma:oauth:${state}`;
const OAUTH_STATE_TTL_SECONDS = 5 * 60;

type FigmaTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type FigmaConnectionStatus = {
  connected: boolean;
  scopes: string[] | null;
  tokenType: string | null;
  expiresAt?: Date | null;
};

export type FigmaArtboardImport = {
  base64: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type FigmaCanvasInsertionResult = {
  imageRef?: string;
  url?: string;
  responseStatus: number;
};

const ensureSecretKey = () => {
  const secret = process.env.FIGMA_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('FIGMA_TOKEN_SECRET must be provided and at least 16 characters long');
  }
  return createHash('sha256').update(secret).digest();
};

const encrypt = (value: string) => {
  const key = ensureSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decrypt = (payload: string) => {
  const key = ensureSecretKey();
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

const requestFigmaToken = async (body: Record<string, string>): Promise<FigmaTokenResponse> => {
  const response = await fetch('https://www.figma.com/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to retrieve Figma token (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as FigmaTokenResponse;
};

const storeTokenResponse = async (userId: string, token: FigmaTokenResponse) => {
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const refreshExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
    : null;

  await upsertFigmaTokenRecord({
    userId,
    encryptedAccessToken: encrypt(token.access_token),
    encryptedRefreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
    expiresAt,
    refreshExpiresAt,
    scope: token.scope ?? null,
    tokenType: token.token_type ?? null,
  });
};

const ensureClientConfig = () => {
  const clientId = process.env.FIGMA_CLIENT_ID;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET;
  const redirectUri = process.env.FIGMA_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('FIGMA_CLIENT_ID, FIGMA_CLIENT_SECRET, and FIGMA_REDIRECT_URI must be configured');
  }

  return { clientId, clientSecret, redirectUri };
};

export const getFigmaConnectionStatus = async (userId: string): Promise<FigmaConnectionStatus> => {
  const record = await getFigmaTokenRecord(userId);
  if (!record) {
    return { connected: false, scopes: null, tokenType: null };
  }

  const refreshExpired = record.refreshExpiresAt ? record.refreshExpiresAt.getTime() <= Date.now() : false;
  return {
    connected: !refreshExpired,
    scopes: record.scope ? record.scope.split(' ') : null,
    tokenType: record.tokenType,
    expiresAt: record.expiresAt,
  };
};

export const createFigmaOAuthUrl = async (userId: string) => {
  const { clientId, redirectUri } = ensureClientConfig();
  const state = randomUUID();
  await redis.setex(FIGMA_OAUTH_KEY(state), OAUTH_STATE_TTL_SECONDS, userId);

  const scope = encodeURIComponent('file_read file_write');
  const url = `https://www.figma.com/oauth?client_id=${encodeURIComponent(
    clientId,
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&response_type=code&prompt=consent`;

  return { url, state };
};

export const completeFigmaOAuth = async (code: string, state: string, explicitUserId?: string) => {
  const storedUserId = await redis.get(FIGMA_OAUTH_KEY(state));
  await redis.del(FIGMA_OAUTH_KEY(state));

  if (!storedUserId) {
    throw new Error('Invalid or expired OAuth state');
  }

  if (explicitUserId && storedUserId !== explicitUserId) {
    throw new Error('OAuth state does not match the authenticated user');
  }

  const { clientId, clientSecret, redirectUri } = ensureClientConfig();
  const token = await requestFigmaToken({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: 'authorization_code',
  });

  await storeTokenResponse(storedUserId, token);
  return storedUserId;
};

const refreshAccessToken = async (userId: string, refreshToken: string) => {
  const { clientId, clientSecret } = ensureClientConfig();
  const token = await requestFigmaToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  await storeTokenResponse(userId, token);
  return token;
};

const ensureAccessToken = async (userId: string): Promise<{ accessToken: string; scope: string | null }> => {
  const record = await getFigmaTokenRecord(userId);
  if (!record) {
    throw new Error('Figma account is not connected');
  }

  const expiresSoon = record.expiresAt ? record.expiresAt.getTime() <= Date.now() + 60_000 : false;
  const refreshExpired = record.refreshExpiresAt ? record.refreshExpiresAt.getTime() <= Date.now() : false;

  if (!expiresSoon) {
    return { accessToken: decrypt(record.encryptedAccessToken), scope: record.scope };
  }

  if (refreshExpired || !record.encryptedRefreshToken) {
    throw new Error('Figma session has expired. Please reconnect.');
  }

  const token = await refreshAccessToken(userId, decrypt(record.encryptedRefreshToken));
  return { accessToken: token.access_token, scope: token.scope ?? record.scope ?? null };
};

const readImageBuffer = async (imageUrl: string) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const importArtboardImage = async (
  userId: string,
  options: { fileId: string; nodeId: string },
): Promise<FigmaArtboardImport> => {
  const { accessToken } = await ensureAccessToken(userId);
  const metaResponse = await fetch(
    `https://api.figma.com/v1/files/${encodeURIComponent(options.fileId)}/nodes?ids=${encodeURIComponent(
      options.nodeId,
    )}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!metaResponse.ok) {
    throw new Error(`Failed to load artboard metadata (${metaResponse.status})`);
  }

  const meta = (await metaResponse.json()) as any;
  const node = meta?.nodes?.[options.nodeId]?.document;
  const bounds = node?.absoluteBoundingBox ?? null;

  const maxDimension = 4096;
  const longestSide = Math.max(bounds?.width ?? 0, bounds?.height ?? 0);
  const scale = longestSide > maxDimension && longestSide > 0 ? maxDimension / longestSide : 1;

  const imageResponse = await fetch(
    `https://api.figma.com/v1/images/${encodeURIComponent(options.fileId)}?ids=${encodeURIComponent(
      options.nodeId,
    )}&format=png&scale=${scale.toFixed(2)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!imageResponse.ok) {
    throw new Error(`Failed to render artboard (${imageResponse.status})`);
  }

  const imageJson = (await imageResponse.json()) as { images: Record<string, string> };
  const imageUrl = imageJson.images?.[options.nodeId];
  if (!imageUrl) {
    throw new Error('Figma did not return an image URL for the selected artboard');
  }

  const buffer = await readImageBuffer(imageUrl);
  return {
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
    width: bounds?.width ?? null,
    height: bounds?.height ?? null,
  };
};

export const pushImageToCanvas = async (
  userId: string,
  options: { fileId: string; artboardId: string; bytes: Buffer; width: number; height: number; name?: string },
): Promise<FigmaCanvasInsertionResult> => {
  const { accessToken } = await ensureAccessToken(userId);

  const response = await fetch(
    `https://api.figma.com/v1/files/${encodeURIComponent(options.fileId)}/images`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_bytes: options.bytes.toString('base64'),
        node_id: options.artboardId,
        scale_mode: 'FIT',
        width: Math.round(Math.min(options.width, 4096)),
        height: Math.round(Math.min(options.height, 4096)),
        name: options.name ?? 'DOMA Image',
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as { image_ref?: string; url?: string };

  if (!response.ok) {
    throw new Error(
      `Failed to send image to Figma (${response.status}): ${JSON.stringify(payload) || response.statusText}`,
    );
  }

  return {
    imageRef: payload.image_ref,
    url: payload.url,
    responseStatus: response.status,
  };
};

export const prepareCanvasPayload = async (
  imageUrl: string,
  options: { artboardWidth: number; artboardHeight: number },
) => {
  return readImageBuffer(imageUrl);
};
