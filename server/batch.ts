import { randomUUID } from 'crypto';

import { calculateSmartCreditPrice, DEFAULT_SMART_CREDIT_CONFIG, type SmartCreditConfig } from '../pricing';
import { summarizePrediction } from '../prediction';
import type { PromptData, QualityBand } from './types';
import {
  createGenerationJobRecord,
  updateGenerationJobStatus,
  upsertGenerationResultRecord,
  ensureUserRecord,
  ensureCreditCache,
  appendUsageLog,
} from './storage';
import { deductCredits, addCredits } from './credits';
import { generateImageFromGemini } from './genai';
import { trackEvent } from './analytics';
import { recordGenerationSuccess } from './observability';

export type BatchJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type BatchResultStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BatchGenerationRequest {
  userId: string;
  workspaceId: string;
  promptData: PromptData;
  qualityBand: QualityBand;
  batchSize: number;
  base?: number;
  fieldHash?: string;
  hasSubjectReference?: boolean;
  hasEnvironmentReference?: boolean;
  subjectImage?: Parameters<typeof generateImageFromGemini>[0]['subjectImage'];
  environmentImage?: Parameters<typeof generateImageFromGemini>[0]['environmentImage'];
  pricingConfig: SmartCreditConfig;
  pricingVariant: 'v1' | 'v2';
}

export interface BatchResultItem {
  slot: number;
  status: BatchResultStatus;
  imageUrl?: string | null;
  error?: string | null;
}

export interface BatchJob {
  id: string;
  status: BatchJobStatus;
  userId: string;
  workspaceId: string;
  promptData: PromptData;
  qualityBand: QualityBand;
  batchSize: number;
  pricePerImage: number;
  creditsPerImage: number;
  creditsCharged: number;
  predictionScore: number;
  confidence: 'green' | 'amber' | 'red';
  label: 'Likely' | 'Uncertain' | 'At risk';
  remainingCredits: number;
  createdAt: number;
  updatedAt: number;
  results: BatchResultItem[];
  fieldHash?: string;
  subjectImage?: Parameters<typeof generateImageFromGemini>[0]['subjectImage'];
  environmentImage?: Parameters<typeof generateImageFromGemini>[0]['environmentImage'];
  pricingVariant: 'v1' | 'v2';
}

const ACTIVE_JOBS = new Map<string, BatchJob>();
const JOB_QUEUE: string[] = [];
let activeWorkers = 0;

const MAX_PARALLEL_JOBS = Number(process.env.BATCH_MAX_PARALLEL_JOBS ?? 2);
const MAX_VARIANT_WORKERS = Number(process.env.BATCH_VARIANT_CONCURRENCY ?? 2);

const now = () => Date.now();

const runNextJob = () => {
  if (activeWorkers >= MAX_PARALLEL_JOBS) {
    return;
  }
  const jobId = JOB_QUEUE.shift();
  if (!jobId) {
    return;
  }
  const job = ACTIVE_JOBS.get(jobId);
  if (!job) {
    return;
  }
  activeWorkers += 1;
  processJob(job)
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Batch job processing failed', error);
    })
    .finally(() => {
      activeWorkers -= 1;
      runNextJob();
    });
};

const processJob = async (job: BatchJob) => {
  job.status = 'running';
  job.updatedAt = now();
  ACTIVE_JOBS.set(job.id, job);
  await updateGenerationJobStatus(job.id, 'running');

  let successCount = 0;
  let failureCount = 0;

  const runSlot = async (slot: number) => {
    const entry = job.results[slot];
    entry.status = 'running';
    entry.error = null;
    entry.imageUrl = null;
    await upsertGenerationResultRecord({ jobId: job.id, slot, status: 'running' });

    try {
      const { imageUrl } = await generateImageFromGemini({
        promptData: job.promptData,
        subjectImage: job.subjectImage,
        environmentImage: job.environmentImage,
      });

      entry.status = 'succeeded';
      entry.imageUrl = imageUrl;
      successCount += 1;
      await upsertGenerationResultRecord({ jobId: job.id, slot, status: 'succeeded', imageUrl });
      recordGenerationSuccess(job.creditsPerImage);
    } catch (error) {
      const message = (error as Error).message ?? 'Failed to generate image';
      entry.status = 'failed';
      entry.error = message;
      failureCount += 1;
      await upsertGenerationResultRecord({ jobId: job.id, slot, status: 'failed', error: message });
      const newBalance = await addCredits(job.workspaceId, job.userId, job.creditsPerImage, 'refund-generate-failure', {
        jobId: job.id,
        slot,
      });
      job.remainingCredits = newBalance;
      await appendUsageLog(job.workspaceId, job.userId, 'generate-failure', 0, {
        mode: 'batch',
        jobId: job.id,
        slot,
      });
    } finally {
      // no-op
    }
  };

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(MAX_VARIANT_WORKERS, job.batchSize); w += 1) {
    const worker = (async () => {
      while (true) {
        const slot = job.results.findIndex((item) => item.status === 'queued');
        if (slot === -1) {
          break;
        }
        job.results[slot].status = 'running';
        await runSlot(slot);
      }
    })();
    workers.push(worker);
  }

  await Promise.all(workers);

  const remainingCredits = await ensureCreditCache(job.workspaceId, job.userId);

  job.status = successCount > 0 ? 'succeeded' : 'failed';
  job.remainingCredits = remainingCredits;
  job.updatedAt = now();
  ACTIVE_JOBS.set(job.id, job);

  await updateGenerationJobStatus(job.id, job.status, { remainingCredits });

  await appendUsageLog(job.workspaceId, job.userId, 'generate_success', 0, {
    mode: 'batch',
    batchSize: job.batchSize,
    successCount,
    failureCount,
  });
  await trackEvent({
    event: 'generate_success',
    userId: job.userId,
    workspaceId: job.workspaceId,
    properties: {
      mode: 'batch',
      batchSize: job.batchSize,
      successCount,
      failureCount,
      credits: job.creditsCharged,
      variant: job.pricingVariant,
    },
  });
};

export const startBatchGeneration = async (request: BatchGenerationRequest): Promise<BatchJob> => {
  if (![4, 8].includes(request.batchSize)) {
    throw new Error('Batch size must be 4 or 8');
  }

  await ensureUserRecord(request.userId);

  const prediction = summarizePrediction({
    prompt: request.promptData,
    hasSubjectReference: Boolean(request.hasSubjectReference),
    hasEnvironmentReference: Boolean(request.hasEnvironmentReference),
  });

  const price = calculateSmartCreditPrice(
    {
      predictionScore: prediction.score,
      qualityBand: request.qualityBand,
      base: request.base ?? DEFAULT_SMART_CREDIT_CONFIG.base,
    },
    request.pricingConfig,
  );

  const creditsPerImage = Math.max(1, Math.ceil(price));
  const totalCredits = creditsPerImage * request.batchSize;

  const remainingCredits = await deductCredits(request.workspaceId, request.userId, totalCredits, 'generate-batch', {
    batchSize: request.batchSize,
    qualityBand: request.qualityBand,
    predictionScore: prediction.score,
    price,
    variant: request.pricingVariant,
  });

  const jobId = randomUUID();
  const createdAt = now();

  const job: BatchJob = {
    id: jobId,
    status: 'queued',
    userId: request.userId,
    workspaceId: request.workspaceId,
    promptData: request.promptData,
    qualityBand: request.qualityBand,
    batchSize: request.batchSize,
    pricePerImage: price,
    creditsPerImage,
    creditsCharged: totalCredits,
    predictionScore: prediction.score,
    confidence: prediction.confidence,
    label: prediction.label,
    remainingCredits,
    createdAt,
    updatedAt: createdAt,
    results: Array.from({ length: request.batchSize }, (_, slot) => ({ slot, status: 'queued' as BatchResultStatus })),
    fieldHash: request.fieldHash,
    subjectImage: request.subjectImage,
    environmentImage: request.environmentImage,
    pricingVariant: request.pricingVariant,
  };

  ACTIVE_JOBS.set(jobId, job);

  await createGenerationJobRecord({
    id: jobId,
    userId: request.userId,
    status: 'queued',
    promptData: request.promptData,
    batchSize: request.batchSize,
    qualityBand: request.qualityBand,
    pricePerImage: price,
    creditsPerImage,
    totalCredits,
    fieldHash: request.fieldHash,
    predictionScore: prediction.score,
    confidence: prediction.confidence,
    label: prediction.label,
    remainingCredits,
  });

  await Promise.all(
    job.results.map((result) =>
      upsertGenerationResultRecord({ jobId, slot: result.slot, status: 'queued' }),
    ),
  );

  JOB_QUEUE.push(jobId);
  runNextJob();

  return job;
};

export const getBatchJob = (jobId: string) => ACTIVE_JOBS.get(jobId) ?? null;

export const serializeBatchJob = (job: BatchJob) => ({
  id: job.id,
  status: job.status,
  batchSize: job.batchSize,
  qualityBand: job.qualityBand,
  pricePerImage: job.pricePerImage,
  creditsPerImage: job.creditsPerImage,
  creditsCharged: job.creditsCharged,
  predictionScore: job.predictionScore,
  confidence: job.confidence,
  label: job.label,
  remainingCredits: job.remainingCredits,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  results: job.results.map(({ slot, status, imageUrl, error }) => ({ slot, status, imageUrl, error })),
  pricingVariant: job.pricingVariant,
});
