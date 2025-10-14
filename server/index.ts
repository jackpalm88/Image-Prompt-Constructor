import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { calculateSmartCreditPrice, resolveConfigForVariant, DEFAULT_SMART_CREDIT_CONFIG } from '../pricing';
import { summarizePrediction, computeFieldHash } from '../prediction';
import { authenticate, signToken, type AuthenticatedRequest } from './auth';
import { addCredits, deductCredits, ensureCreditCache } from './credits';
import { evaluatePromptWithCoaching } from './coaching';
import { generateImageFromGemini } from './genai';
import {
  initializeStorage,
  ensureUserRecord,
  createUserRecord,
  ensureWorkspaceMembership,
  getGenerationJobWithResults,
  recordTemplateVersion,
  listWorkspaceMembersWithUsage,
  getWorkspaceAnalytics,
  findUserByEmail,
  addMemberToWorkspace,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  getWorkspaceRecord,
  getWorkspaceMembership,
  appendUsageLog,
  appendAuditLog,
  getRecentAuditLogs,
  updateWorkspaceBilling,
} from './storage';
import type { PromptData, QualityBand } from './types';
import { startBatchGeneration, getBatchJob, serializeBatchJob, type BatchGenerationRequest } from './batch';
import {
  createFigmaOAuthUrl,
  completeFigmaOAuth,
  getFigmaConnectionStatus,
  importArtboardImage,
  prepareCanvasPayload,
  pushImageToCanvas,
} from './figma';
import { trackEvent } from './analytics';
import {
  metricsMiddleware,
  metricsHandler,
  recordGenerationSuccess,
  getObservabilitySnapshot,
} from './observability';
import {
  createCheckoutSession,
  createBillingPortalSession,
  stripeWebhookHandler,
  checkoutSchema,
  getBillingSummary,
} from './billing';
import { getPricingVariant } from './featureFlags';

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);

const FREE_MONTHLY_CREDITS = Number(process.env.FREE_MONTHLY_CREDITS ?? 10);
const PRO_MONTHLY_CREDITS = Number(process.env.PRO_MONTHLY_CREDITS ?? 200);
const TOP_UP_CREDITS = Number(process.env.TOPUP_CREDIT_QUANTITY ?? 100);
const PRO_MONTHLY_PRICE = Number(process.env.PRO_MONTHLY_PRICE_USD ?? 19);
const TOP_UP_PRICE = Number(process.env.TOPUP_PRICE_USD ?? 10);

const billingPlans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    credits: FREE_MONTHLY_CREDITS,
    description: 'Starter tier with monthly refresh of Smart Credits.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: PRO_MONTHLY_PRICE,
    interval: 'month',
    credits: PRO_MONTHLY_CREDITS,
    description: 'Unlock pooled credits, analytics, and priority support for teams.',
  },
  {
    id: 'topup',
    name: 'Credit Top-up',
    price: TOP_UP_PRICE,
    interval: 'one-time',
    credits: TOP_UP_CREDITS,
    description: 'Purchase additional Smart Credits on demand.',
  },
] as const;

app.use(
  cors({
    origin: allowedOrigins?.length ? allowedOrigins : undefined,
    credentials: true,
  }),
);

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '25mb' }));
app.use(metricsMiddleware);

app.get('/metrics', metricsHandler);

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

const promptSchema = z.object({
  subject: z.string(),
  action: z.string(),
  environment: z.string(),
  style: z.string(),
  lighting: z.string(),
  camera: z.string(),
});

const imageSchema = z
  .object({
    base64: z.string(),
    mimeType: z.string(),
  })
  .nullable()
  .optional();

const memberRoleSchema = z.enum(['owner', 'admin', 'member']);
const manageableRoleSchema = z.enum(['admin', 'member']);

const isWorkspaceAdmin = (role: string | null | undefined) => role === 'owner' || role === 'admin';

const buildUserProfile = async (userId: string, preferredWorkspaceId?: string) => {
  const user = await ensureUserRecord(userId);
  let workspaceId = preferredWorkspaceId ?? user.defaultWorkspaceId ?? undefined;
  let workspaceRecord: Awaited<ReturnType<typeof ensureWorkspaceMembership>> | (Awaited<ReturnType<typeof getWorkspaceRecord>> & { role: 'owner' | 'admin' | 'member' }) | null = null;

  if (workspaceId) {
    const record = await getWorkspaceRecord(workspaceId);
    const role = await getWorkspaceMembership(workspaceId, user.id);
    if (record && role) {
      workspaceRecord = { ...record, role };
    }
  }

  if (!workspaceRecord) {
    const membership = await ensureWorkspaceMembership(user.id, user.email);
    workspaceId = membership.id;
    workspaceRecord = membership;
  }

  const credits = await ensureCreditCache(workspaceRecord.id, user.id);
  const pricingVariant = await getPricingVariant(workspaceRecord.id);
  if (workspaceRecord.pricingVariant !== pricingVariant) {
    await updateWorkspaceBilling(workspaceRecord.id, { pricingVariant });
    const refreshed = await getWorkspaceRecord(workspaceRecord.id);
    if (refreshed) {
      workspaceRecord = { ...refreshed, role: workspaceRecord.role };
    }
  }
  const billing = await getBillingSummary(workspaceRecord.id);
  return {
    id: user.id,
    email: user.email,
    credits,
    workspace: {
      id: workspaceRecord.id,
      name: workspaceRecord.name,
      credits,
      role: workspaceRecord.role,
    },
    isWorkspaceAdmin: isWorkspaceAdmin(workspaceRecord.role),
    billing,
  };
};

const buildWorkspacePayload = async (workspaceId: string, currentUserId: string) => {
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const membersWithUsage = await listWorkspaceMembersWithUsage(workspaceId);
  const analytics = await getWorkspaceAnalytics(workspaceId);
  const currentMembership = membersWithUsage.find(member => member.userId === currentUserId);
  const billing = await getBillingSummary(workspaceId);
  const auditLogs = await getRecentAuditLogs(workspaceId, 25);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      credits: workspace.credits,
      role: currentMembership?.role ?? 'member',
    },
    members: membersWithUsage.map(member => ({
      id: member.userId,
      email: member.email,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      totalCreditsSpent: member.totalCreditsSpent,
      generateCount: member.generateCount,
      batchCount: member.batchCount,
    })),
    analytics,
    billing,
    auditLogs: auditLogs.map(log => ({
      id: log.id,
      workspaceId: log.workspaceId,
      userId: log.userId,
      action: log.action,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
  };
};

app.post('/api/auth/anonymous', async (_req, res) => {
  const userId = randomUUID();
  await ensureUserRecord(userId, null);
  const profile = await buildUserProfile(userId);
  const token = signToken(profile.id, profile.workspace.id, profile.workspace.role);
  res.json({ token, user: profile });
});

app.get('/api/user', authenticate, async (req: AuthenticatedRequest, res) => {
  const profile = await buildUserProfile(req.user!.id, req.user!.workspaceId);
  res.json(profile);
});

app.get('/api/figma/status', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getFigmaConnectionStatus(req.user!.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to determine Figma status' });
  }
});

app.get('/api/figma/oauth/url', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { url, state } = await createFigmaOAuthUrl(req.user!.id);
    res.json({ url, state });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to start Figma OAuth' });
  }
});

app.post('/api/figma/oauth/callback', async (req, res) => {
  const callbackSchema = z.object({
    code: z.string(),
    state: z.string(),
    userId: z.string().optional(),
  });

  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const userId = await completeFigmaOAuth(parsed.data.code, parsed.data.state, parsed.data.userId);
    res.json({ connected: true, userId });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || 'Failed to complete Figma OAuth' });
  }
});

app.get('/api/figma/import', authenticate, async (req: AuthenticatedRequest, res) => {
  const importSchema = z.object({
    fileId: z.string(),
    nodeId: z.string(),
  });

  const parsed = importSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const artboard = await importArtboardImage(req.user!.id, parsed.data);
    res.json(artboard);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || 'Unable to import artboard' });
  }
});

app.get('/api/credits', authenticate, async (req: AuthenticatedRequest, res) => {
  const credits = await ensureCreditCache(req.user!.workspaceId, req.user!.id);
  res.json({ credits });
});

app.post('/api/credits/preview', authenticate, async (req: AuthenticatedRequest, res) => {
  const previewSchema = z.object({
    promptData: promptSchema,
    qualityBand: z.string(),
    base: z.number().positive().optional(),
    hasSubjectReference: z.boolean().optional(),
    hasEnvironmentReference: z.boolean().optional(),
  });

  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { promptData, qualityBand, base, hasSubjectReference, hasEnvironmentReference } = parsed.data;
  const prediction = summarizePrediction({
    prompt: promptData,
    hasSubjectReference,
    hasEnvironmentReference,
  });
  const variant = await getPricingVariant(req.user!.workspaceId);
  await updateWorkspaceBilling(req.user!.workspaceId, { pricingVariant: variant });
  const config = resolveConfigForVariant(variant);
  const price = calculateSmartCreditPrice({
    predictionScore: prediction.score,
    qualityBand,
    base: base ?? DEFAULT_SMART_CREDIT_CONFIG.base,
  }, config);

  res.json({
    price,
    rounded: Math.max(1, Math.ceil(price)),
    predictionScore: prediction.score,
    confidence: prediction.confidence,
    label: prediction.label,
    variant,
  });
});

app.get('/api/workspace', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const payload = await buildWorkspacePayload(req.user!.workspaceId, req.user!.id);
    res.json(payload);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message || 'Workspace not found' });
  }
});

app.post('/api/workspace/members', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isWorkspaceAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Admin permissions required' });
  }

  const memberSchema = z.object({
    email: z.string().email(),
    role: manageableRoleSchema.optional(),
  });

  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { email, role } = parsed.data;
    let targetUser = await findUserByEmail(email);
    if (!targetUser) {
      const newUserId = randomUUID();
      targetUser = await createUserRecord(newUserId, email);
    }

    await addMemberToWorkspace(req.user!.workspaceId, targetUser.id, role ?? 'member');
    await appendAuditLog(req.user!.workspaceId, req.user!.id, 'workspace-member-added', {
      memberId: targetUser.id,
      role: role ?? 'member',
    });
    const payload = await buildWorkspacePayload(req.user!.workspaceId, req.user!.id);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to add workspace member' });
  }
});

app.patch('/api/workspace/members/:memberId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isWorkspaceAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Admin permissions required' });
  }

  const rolePayload = z.object({ role: manageableRoleSchema });
  const parsed = rolePayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const { memberId } = req.params;
  if (memberId === req.user!.id) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  try {
    await updateWorkspaceMemberRole(req.user!.workspaceId, memberId, parsed.data.role);
    await appendAuditLog(req.user!.workspaceId, req.user!.id, 'workspace-member-role-updated', {
      memberId,
      role: parsed.data.role,
    });
    const payload = await buildWorkspacePayload(req.user!.workspaceId, req.user!.id);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to update member role' });
  }
});

app.delete('/api/workspace/members/:memberId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!isWorkspaceAdmin(req.user!.role)) {
    return res.status(403).json({ error: 'Admin permissions required' });
  }

  const { memberId } = req.params;
  if (memberId === req.user!.id) {
    return res.status(400).json({ error: 'Cannot remove yourself from the workspace' });
  }

  try {
    await removeWorkspaceMember(req.user!.workspaceId, memberId);
    await appendAuditLog(req.user!.workspaceId, req.user!.id, 'workspace-member-removed', {
      memberId,
    });
    const payload = await buildWorkspacePayload(req.user!.workspaceId, req.user!.id);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to remove workspace member' });
  }
});

app.get('/api/billing/summary', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const summary = await getBillingSummary(req.user!.workspaceId);
    res.json({ summary, plans: billingPlans });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to load billing summary' });
  }
});

app.post('/api/billing/checkout', authenticate, async (req: AuthenticatedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const url = await createCheckoutSession(req.user!.workspaceId, req.user!.id, parsed.data.plan, {
      quantity: parsed.data.quantity,
      email: req.user?.email ?? null,
    });
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to start checkout session' });
  }
});

app.post('/api/billing/portal', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const url = await createBillingPortalSession(req.user!.workspaceId, req.user!.id);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to open billing portal' });
  }
});

app.get('/api/observability/snapshot', authenticate, (_req: AuthenticatedRequest, res) => {
  res.json(getObservabilitySnapshot());
});

app.post('/api/figma/send', authenticate, async (req: AuthenticatedRequest, res) => {
  const figmaSendSchema = z.object({
    promptData: promptSchema,
    subjectImage: imageSchema,
    environmentImage: imageSchema,
    qualityBand: z.string(),
    base: z.number().positive().optional(),
    figma: z.object({
      fileId: z.string(),
      artboardId: z.string(),
      artboardWidth: z.number().positive(),
      artboardHeight: z.number().positive(),
      name: z.string().optional(),
    }),
  });

  const parsed = figmaSendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { promptData, subjectImage, environmentImage, qualityBand, base, figma } = parsed.data;

  const prediction = summarizePrediction({
    prompt: promptData,
    hasSubjectReference: Boolean(subjectImage),
    hasEnvironmentReference: Boolean(environmentImage),
  });

  const figmaVariant = await getPricingVariant(req.user!.workspaceId);
  await updateWorkspaceBilling(req.user!.workspaceId, { pricingVariant: figmaVariant });
  const figmaConfig = resolveConfigForVariant(figmaVariant);
  const price = calculateSmartCreditPrice(
    {
      predictionScore: prediction.score,
      qualityBand: qualityBand as QualityBand,
      base: base ?? DEFAULT_SMART_CREDIT_CONFIG.base,
    },
    figmaConfig,
  );
  const creditsToCharge = Math.max(1, Math.ceil(price));

  let remainingCredits: number | null = null;

  try {
    remainingCredits = await deductCredits(req.user!.workspaceId, req.user!.id, creditsToCharge, 'figma-send', {
      predictionScore: prediction.score,
      qualityBand,
      price,
      variant: figmaVariant,
    });
  } catch (error) {
    return res.status(402).json({ error: (error as Error).message });
  }

  try {
    const { imageUrl, prompt } = await generateImageFromGemini({
      promptData,
      subjectImage: subjectImage ?? undefined,
      environmentImage: environmentImage ?? undefined,
    });

    const canvasBuffer = await prepareCanvasPayload(imageUrl, {
      artboardWidth: figma.artboardWidth,
      artboardHeight: figma.artboardHeight,
    });

    const figmaResult = await pushImageToCanvas(req.user!.id, {
      fileId: figma.fileId,
      artboardId: figma.artboardId,
      bytes: canvasBuffer,
      width: Math.min(figma.artboardWidth, 4096),
      height: Math.min(figma.artboardHeight, 4096),
      name: figma.name,
    });

    await appendUsageLog(req.user!.workspaceId, req.user!.id, 'generate_success', 0, {
      mode: 'figma',
      qualityBand,
      predictionScore: prediction.score,
    });
    await trackEvent({
      event: 'generate_success',
      userId: req.user!.id,
      workspaceId: req.user!.workspaceId,
      properties: {
        mode: 'figma',
        qualityBand,
        predictionScore: prediction.score,
        credits: creditsToCharge,
      },
    });

    res.json({
      inserted: true,
      imageUrl,
      prompt,
      price,
      creditsCharged: creditsToCharge,
      remainingCredits,
      predictionScore: prediction.score,
      confidence: prediction.confidence,
      label: prediction.label,
      figma: figmaResult,
      variant: figmaVariant,
    });

    recordGenerationSuccess(creditsToCharge);
  } catch (error) {
    if (remainingCredits !== null) {
      await addCredits(req.user!.workspaceId, req.user!.id, creditsToCharge, 'refund-figma-failure', {
        predictionScore: prediction.score,
        qualityBand,
      });
    }
    await appendUsageLog(req.user!.workspaceId, req.user!.id, 'generate-failure', 0, {
      mode: 'figma',
      qualityBand,
      predictionScore: prediction.score,
    });
    res.status(500).json({ error: (error as Error).message || 'Failed to generate and send image to Figma' });
  }
});

app.post('/api/generate-image', authenticate, async (req: AuthenticatedRequest, res) => {
  const bodySchema = z.object({
    promptData: promptSchema,
    subjectImage: imageSchema,
    environmentImage: imageSchema,
    qualityBand: z.string(),
    base: z.number().positive().optional(),
    fieldHash: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { promptData, subjectImage, environmentImage, qualityBand, base } = parsed.data;

  const prediction = summarizePrediction({
    prompt: promptData,
    hasSubjectReference: Boolean(subjectImage),
    hasEnvironmentReference: Boolean(environmentImage),
  });

  const variant = await getPricingVariant(req.user!.workspaceId);
  await updateWorkspaceBilling(req.user!.workspaceId, { pricingVariant: variant });
  const config = resolveConfigForVariant(variant);
  const price = calculateSmartCreditPrice(
    {
      predictionScore: prediction.score,
      qualityBand: qualityBand as QualityBand,
      base: base ?? DEFAULT_SMART_CREDIT_CONFIG.base,
    },
    config,
  );
  const creditsToCharge = Math.max(1, Math.ceil(price));

  let remainingCredits: number | null = null;

  try {
    remainingCredits = await deductCredits(req.user!.workspaceId, req.user!.id, creditsToCharge, 'generate-image', {
      predictionScore: prediction.score,
      qualityBand,
      price,
      variant,
    });
  } catch (error) {
    return res.status(402).json({ error: (error as Error).message });
  }

  try {
    const { imageUrl, prompt } = await generateImageFromGemini({
      promptData,
      subjectImage: subjectImage ?? undefined,
      environmentImage: environmentImage ?? undefined,
    });

    res.json({
      imageUrl,
      prompt,
      price,
      creditsCharged: creditsToCharge,
      remainingCredits,
      predictionScore: prediction.score,
      confidence: prediction.confidence,
      label: prediction.label,
      variant,
    });

    await appendUsageLog(req.user!.workspaceId, req.user!.id, 'generate_success', 0, {
      mode: 'single',
      qualityBand,
      predictionScore: prediction.score,
    });
    recordGenerationSuccess(creditsToCharge);
    await trackEvent({
      event: 'generate_success',
      userId: req.user!.id,
      workspaceId: req.user!.workspaceId,
      properties: {
        mode: 'single',
        qualityBand,
        predictionScore: prediction.score,
        credits: creditsToCharge,
        variant,
      },
    });
  } catch (error) {
    if (remainingCredits !== null) {
      await addCredits(req.user!.workspaceId, req.user!.id, creditsToCharge, 'refund-generate-failure', {
        predictionScore: prediction.score,
        qualityBand,
      });
    }
    await appendUsageLog(req.user!.workspaceId, req.user!.id, 'generate-failure', 0, {
      mode: 'single',
      qualityBand,
      predictionScore: prediction.score,
    });
    res.status(500).json({ error: (error as Error).message || 'Failed to generate image' });
  }
});

app.post('/api/generate-batch', authenticate, async (req: AuthenticatedRequest, res) => {
  const bodySchema = z.object({
    promptData: promptSchema,
    subjectImage: imageSchema,
    environmentImage: imageSchema,
    qualityBand: z.string(),
    base: z.number().positive().optional(),
    batchSize: z.enum(['4', '8']).or(z.number().int().positive()),
    fieldHash: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { promptData, subjectImage, environmentImage, qualityBand, base, batchSize, fieldHash } = parsed.data;
  const normalizedBatchSize = typeof batchSize === 'string' ? Number(batchSize) : batchSize;
  if (![4, 8].includes(normalizedBatchSize)) {
    return res.status(400).json({ error: 'Batch size must be 4 or 8' });
  }

  try {
    const variant = await getPricingVariant(req.user!.workspaceId);
    await updateWorkspaceBilling(req.user!.workspaceId, { pricingVariant: variant });
    const config = resolveConfigForVariant(variant);
    const job = await startBatchGeneration({
      userId: req.user!.id,
      workspaceId: req.user!.workspaceId,
      promptData: promptData as PromptData,
      qualityBand: qualityBand as QualityBand,
      batchSize: normalizedBatchSize,
      base,
      fieldHash,
      hasSubjectReference: Boolean(subjectImage),
      hasEnvironmentReference: Boolean(environmentImage),
      subjectImage: (subjectImage ?? undefined) as BatchGenerationRequest['subjectImage'],
      environmentImage: (environmentImage ?? undefined) as BatchGenerationRequest['environmentImage'],
      pricingConfig: config,
      pricingVariant: variant,
    });

    res.json({
      job: serializeBatchJob(job),
    });
  } catch (error) {
    if ((error as Error).message.includes('Insufficient credits')) {
      return res.status(402).json({ error: 'Insufficient credits for batch generation' });
    }
    if ((error as Error).message.includes('Batch size must be 4 or 8')) {
      return res.status(400).json({ error: 'Batch size must be 4 or 8' });
    }
    res.status(500).json({ error: (error as Error).message || 'Failed to start batch generation' });
  }
});

app.get('/api/generate-batch/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const job = getBatchJob(id);

  if (job) {
    if (job.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Batch job not found' });
    }
    return res.json({ job: serializeBatchJob(job) });
  }

  const persisted = await getGenerationJobWithResults(id);
  if (!persisted || persisted.job.user_id !== req.user!.id) {
    return res.status(404).json({ error: 'Batch job not found' });
  }

  const serialized = {
    id: persisted.job.id,
    status: persisted.job.status,
    batchSize: persisted.job.batch_size,
    qualityBand: persisted.job.quality_band,
    pricePerImage: Number(persisted.job.price_per_image),
    creditsPerImage: Math.round(Number(persisted.job.total_credits) / Number(persisted.job.batch_size)),
    creditsCharged: Number(persisted.job.total_credits),
    predictionScore: persisted.job.prediction_score ? Number(persisted.job.prediction_score) : null,
    confidence: persisted.job.confidence,
    label: persisted.job.label,
    remainingCredits: persisted.job.remaining_credits,
    createdAt: new Date(persisted.job.created_at).getTime(),
    updatedAt: new Date(persisted.job.updated_at).getTime(),
    results: persisted.results.map((result) => ({
      slot: result.slot,
      status: result.status,
      imageUrl: result.image_url,
      error: result.error,
    })),
    pricingVariant: await getPricingVariant(req.user!.workspaceId),
  };

  return res.json({ job: serialized });
});

app.post('/api/templates/version', authenticate, async (req: AuthenticatedRequest, res) => {
  const versionSchema = z.object({
    signature: z.string(),
    version: z.number().int().positive(),
    promptData: promptSchema,
    imageUrl: z.string().optional(),
    jobId: z.string().optional(),
    slot: z.number().int().nonnegative().optional(),
    promotedAt: z.number().optional(),
  });

  const parsed = versionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { signature, version, promptData, imageUrl, jobId, slot, promotedAt } = parsed.data;

  try {
    await recordTemplateVersion({
      signature,
      version,
      promptData,
      imageUrl,
      jobId,
      slot,
      promotedAt: promotedAt ? new Date(promotedAt) : new Date(),
    });
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to persist template version' });
  }
});

app.post('/api/coaching/evaluate', authenticate, async (req: AuthenticatedRequest, res) => {
  const coachingSchema = z.object({
    promptData: promptSchema,
    fieldHash: z.string().optional(),
  });

  const parsed = coachingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { promptData, fieldHash: providedFieldHash } = parsed.data;
    const fieldHash = providedFieldHash ?? computeFieldHash(promptData as PromptData);
    const evaluation = await evaluatePromptWithCoaching(promptData as PromptData, fieldHash);
    await appendUsageLog(req.user!.workspaceId, req.user!.id, 'coaching-evaluate', 0, {
      quality: evaluation.quality,
      score: evaluation.score,
    });
    await trackEvent({
      event: 'coaching_used',
      userId: req.user!.id,
      workspaceId: req.user!.workspaceId,
      properties: {
        quality: evaluation.quality,
        score: evaluation.score,
      },
    });
    res.json(evaluation);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to evaluate prompt' });
  }
});

const port = Number(process.env.PORT ?? 8080);

export const startServer = async () => {
  await initializeStorage();
  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on port ${port}`);
      resolve();
    });
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server', error);
    process.exitCode = 1;
  });
}

export default app;
