import type { PromptData } from '../types';
import { computeFieldHash, summarizePrediction, type PredictionPrompt } from '../prediction';
import { authorizedFetch } from './auth';

export interface CoachingAdvice {
  fieldHash: string;
  score: number;
  quality: 'green' | 'amber' | 'red';
  summary: string;
  suggestions: string[];
  warnings: string[];
  improvedPrompt: Partial<PromptData>;
}

const cache = new Map<string, CoachingAdvice>();
const inflight = new Map<string, Promise<CoachingAdvice>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const DEBOUNCE_MS = 500;

const toPredictionPrompt = (prompt: PromptData): PredictionPrompt => ({
  subject: prompt.subject,
  action: prompt.action,
  environment: prompt.environment,
  style: prompt.style,
  lighting: prompt.lighting,
  camera: prompt.camera,
});

const scheduleEvaluation = (key: string, task: () => Promise<CoachingAdvice>): Promise<CoachingAdvice> => {
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key)!);
  }

  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const promise = new Promise<CoachingAdvice>((resolve, reject) => {
    const timer = setTimeout(async () => {
      try {
        const result = await task();
        cache.set(key, result);
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        inflight.delete(key);
        timers.delete(key);
      }
    }, DEBOUNCE_MS);

    timers.set(key, timer);
  });

  inflight.set(key, promise);
  return promise;
};

const performEvaluation = async (promptData: PromptData, fieldHash: string): Promise<CoachingAdvice> => {
  const response = await authorizedFetch('/api/coaching/evaluate', {
    method: 'POST',
    body: JSON.stringify({ promptData, fieldHash }),
  });

  if (!response.ok) {
    throw new Error('Unable to fetch coaching feedback');
  }

  const payload = (await response.json()) as CoachingAdvice;
  cache.set(fieldHash, payload);
  return payload;
};

export const evaluatePrompt = async (promptData: PromptData): Promise<CoachingAdvice> => {
  const fieldHash = computeFieldHash(toPredictionPrompt(promptData));

  if (cache.has(fieldHash)) {
    return cache.get(fieldHash)!;
  }

  return scheduleEvaluation(fieldHash, () => performEvaluation(promptData, fieldHash));
};

export const primeCoachingCache = (promptData: PromptData) => {
  const fieldHash = computeFieldHash(toPredictionPrompt(promptData));
  if (cache.has(fieldHash) || inflight.has(fieldHash)) return;

  const prediction = summarizePrediction({ prompt: toPredictionPrompt(promptData) });
  cache.set(fieldHash, {
    fieldHash,
    score: prediction.score,
    quality: prediction.confidence,
    summary:
      prediction.score >= 0.65
        ? 'Looks ready to generate. Expect strong results.'
        : prediction.score >= 0.4
        ? 'Decent structure. Add a few more specifics for reliability.'
        : 'Prompt is sparse. Fill each field to lift the success odds.',
    suggestions: [],
    warnings: [],
    improvedPrompt: { ...promptData },
  });
};

export const clearCoachingCache = () => {
  cache.clear();
  inflight.clear();
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
};
