import type { QualityBand } from '../pricing';
import type { PromptData } from '../types';
import { authorizedFetch } from './auth';

export type InlineImage = {
  base64: string;
  mimeType: string;
};

export type FigmaTarget = {
  fileId: string;
  artboardId: string;
  artboardWidth: number;
  artboardHeight: number;
  name?: string;
};

export type FigmaSendPayload = {
  promptData: PromptData;
  qualityBand: QualityBand;
  base?: number;
  subjectImage?: InlineImage | null;
  environmentImage?: InlineImage | null;
  figma: FigmaTarget;
};

export type FigmaSendResult = {
  inserted: boolean;
  imageUrl: string;
  prompt: string;
  price: number;
  creditsCharged: number;
  remainingCredits: number | null;
  predictionScore: number;
  confidence: 'green' | 'amber' | 'red';
  label: 'Likely' | 'Uncertain' | 'At risk';
  figma: {
    imageRef?: string;
    url?: string;
    responseStatus: number;
  };
};

export type FigmaConnectionStatus = {
  connected: boolean;
  scopes: string[] | null;
  tokenType: string | null;
  expiresAt?: string | null;
};

export type FigmaArtboardReference = {
  base64: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export const fetchFigmaStatus = async (): Promise<FigmaConnectionStatus> => {
  const response = await authorizedFetch('/api/figma/status');
  if (!response.ok) {
    throw new Error('Unable to fetch Figma connection status');
  }
  return (await response.json()) as FigmaConnectionStatus;
};

export const requestFigmaOAuthUrl = async (): Promise<{ url: string; state: string }> => {
  const response = await authorizedFetch('/api/figma/oauth/url');
  if (!response.ok) {
    throw new Error('Unable to start Figma OAuth');
  }
  return (await response.json()) as { url: string; state: string };
};

export const importFigmaArtboard = async (params: { fileId: string; nodeId: string }): Promise<FigmaArtboardReference> => {
  const query = new URLSearchParams({ fileId: params.fileId, nodeId: params.nodeId });
  const response = await authorizedFetch(`/api/figma/import?${query.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to import artboard');
  }
  return (await response.json()) as FigmaArtboardReference;
};

export const sendImageToFigma = async (payload: FigmaSendPayload): Promise<FigmaSendResult> => {
  const response = await authorizedFetch('/api/figma/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to generate image for Figma');
  }

  return (await response.json()) as FigmaSendResult;
};
