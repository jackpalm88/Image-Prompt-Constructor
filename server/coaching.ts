import { GoogleGenAI } from '@google/genai';

import type { PredictionPrompt } from '../prediction';
import { classifyPrediction, computeFieldHash, computePredictionScore, summarizePrediction } from '../prediction';
import type { PromptData } from './types';

export interface CoachingEvaluation {
  fieldHash: string;
  score: number;
  quality: 'green' | 'amber' | 'red';
  summary: string;
  suggestions: string[];
  warnings: string[];
  improvedPrompt: Partial<PromptData>;
}

const apiKey = process.env.API_KEY;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const cache = new Map<string, { expiresAt: number; value: CoachingEvaluation }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const summarizeFallback = (prompt: PromptData): CoachingEvaluation => {
  const promptForPrediction: PredictionPrompt = { ...prompt };
  const score = computePredictionScore({ prompt: promptForPrediction });
  const quality = classifyPrediction(score);

  const suggestions: string[] = [];
  const warnings: string[] = [];

  if (!prompt.subject.trim()) {
    suggestions.push('Add a clear subject so the model knows the primary focus.');
  }
  if (!prompt.action.trim()) {
    suggestions.push('Describe what the subject is doing to add storytelling.');
  }
  if (!prompt.environment.trim()) {
    suggestions.push('Include the environment or background for spatial context.');
  }
  if (!prompt.style.trim()) {
    suggestions.push('Specify a style reference (e.g., cinematic, watercolor, studio portrait).');
  }
  if (!prompt.lighting.trim()) {
    suggestions.push('Mention lighting or mood to guide the composition.');
  }
  if (!prompt.camera.trim()) {
    suggestions.push('Add camera or lens details to control framing.');
  }

  if (score < 0.4) {
    warnings.push('Success probability is low. Consider elaborating on each field to reach at least one descriptive phrase.');
  } else if (score < 0.65) {
    warnings.push('Prediction is uncertain. Make sure the action and environment are concrete.');
  }

  const improvedPrompt: Partial<PromptData> = { ...prompt };

  const enrich = (value: string, fallback: string) =>
    value.trim() ? value : fallback;

  improvedPrompt.subject = enrich(prompt.subject, 'A detailed hero subject, e.g., "a cyberpunk explorer in reflective armor"');
  improvedPrompt.action = enrich(
    prompt.action,
    'engaging in a specific action, e.g., "studying a holographic city map"',
  );
  improvedPrompt.environment = enrich(
    prompt.environment,
    'set within an evocative scene, e.g., "inside a neon-lit observation deck overlooking the metropolis"',
  );
  improvedPrompt.style = enrich(prompt.style, 'cinematic concept art, ultra-detailed, volumetric lighting');
  improvedPrompt.lighting = enrich(prompt.lighting, 'glowing rim light with ambient reflections');
  improvedPrompt.camera = enrich(prompt.camera, 'shot on a 35mm lens, medium close-up, dynamic angle');

  const summary =
    score >= 0.65
      ? 'This prompt is well-structured. You can generate with confidence.'
      : score >= 0.4
      ? 'The prompt is promising but could benefit from a few extra details.'
      : 'The prompt is sparse. Expand descriptions for better outcomes.';

  return {
    fieldHash: computeFieldHash(promptForPrediction),
    score,
    quality,
    summary,
    suggestions,
    warnings,
    improvedPrompt,
  } satisfies CoachingEvaluation;
};

const buildCoachingPrompt = (prompt: PromptData, score: number) => `You are a creative director helping users craft text prompts f
or generative imagery.

Provide actionable coaching for the following structured prompt fields.

Fields:
- Subject: ${prompt.subject || '(empty)'}
- Action: ${prompt.action || '(empty)'}
- Environment: ${prompt.environment || '(empty)'}
- Style: ${prompt.style || '(empty)'}
- Lighting: ${prompt.lighting || '(empty)'}
- Camera: ${prompt.camera || '(empty)'}

The current success prediction score from a heuristic model is ${(score * 100).toFixed(1)}%.

Respond strictly in JSON with keys: quality (green|amber|red), summary (string), suggestions (array of strings), warnings (array o
f strings), improvedPrompt (object with keys subject, action, environment, style, lighting, camera).

Quality guidance:
- green: strong, ready to run
- amber: workable but improvable
- red: risky or under-specified

Keep suggestions concise (max 20 words each). Include warnings only if something is missing, conflicting, or legally risky.
`;

export const evaluatePromptWithCoaching = async (
  prompt: PromptData,
  fieldHash?: string,
): Promise<CoachingEvaluation> => {
  const cacheKey = fieldHash ?? computeFieldHash(prompt);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const prediction = summarizePrediction({ prompt });

  if (!ai) {
    const fallback = summarizeFallback(prompt);
    cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: buildCoachingPrompt(prompt, prediction.score) }],
      },
    ],
    config: {
      temperature: 0.6,
      topP: 0.95,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    const fallback = summarizeFallback(prompt);
    cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  let parsed: Partial<CoachingEvaluation> | null = null;
  try {
    parsed = JSON.parse(text) as Partial<CoachingEvaluation>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse coaching response', error, text);
  }

  if (!parsed?.quality) {
    const fallback = summarizeFallback(prompt);
    cache.set(cacheKey, { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  const evaluation: CoachingEvaluation = {
    fieldHash: cacheKey,
    score: prediction.score,
    quality: parsed.quality,
    summary: parsed.summary ?? '',
    suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]).slice(0, 5) : [],
    warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]).slice(0, 5) : [],
    improvedPrompt: {
      subject: parsed.improvedPrompt?.subject ?? prompt.subject,
      action: parsed.improvedPrompt?.action ?? prompt.action,
      environment: parsed.improvedPrompt?.environment ?? prompt.environment,
      style: parsed.improvedPrompt?.style ?? prompt.style,
      lighting: parsed.improvedPrompt?.lighting ?? prompt.lighting,
      camera: parsed.improvedPrompt?.camera ?? prompt.camera,
    },
  } satisfies CoachingEvaluation;

  cache.set(cacheKey, { value: evaluation, expiresAt: Date.now() + CACHE_TTL_MS });
  return evaluation;
};
