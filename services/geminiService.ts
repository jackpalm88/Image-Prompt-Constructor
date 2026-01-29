import { QUICK_SELECT_OPTIONS, STYLE_PRESETS } from '../constants';
import type { PromptData, ImageFile, Template } from '../types';
import { authorizedFetch } from './auth';

export interface GenerateImageOptions {
  qualityBand: string;
  base?: number;
  fieldHash?: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  prompt: string;
  price: number;
  creditsCharged: number;
  remainingCredits: number;
  predictionScore: number;
  confidence: 'green' | 'amber' | 'red';
  label: 'Likely' | 'Uncertain' | 'At risk';
  variant: 'v1' | 'v2';
}

export type BatchJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BatchResultSummary {
  slot: number;
  status: BatchJobStatus;
  imageUrl?: string | null;
  error?: string | null;
}

export interface BatchJobSummary {
  id: string;
  status: BatchJobStatus;
  batchSize: number;
  qualityBand: string;
  pricePerImage: number;
  creditsPerImage: number;
  creditsCharged: number;
  predictionScore: number | null;
  confidence: 'green' | 'amber' | 'red' | null;
  label: 'Likely' | 'Uncertain' | 'At risk' | null;
  remainingCredits: number | null;
  createdAt: number;
  updatedAt: number;
  results: BatchResultSummary[];
  pricingVariant: 'v1' | 'v2';
}

export type ParsedBulkPrompt = Omit<Template, 'id' | 'favorite' | 'pinned' | 'usageCount' | 'renderSuccessCount' | 'lastUsed' | 'createdAt' | 'updatedAt' | 'signature'>;

const randomFrom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });

export const createThumbnail = (base64Image: string, size = 256): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      let { width, height } = img;

      if (width > height) {
        if (width > size) {
          height *= size / width;
          width = size;
        }
      } else if (height > size) {
        width *= size / height;
        height = size;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = (err) => reject(err);
    img.src = base64Image;
  });

const toServerImage = (image?: ImageFile | null) =>
  image
    ? {
        base64: image.base64,
        mimeType: image.file.type,
      }
    : undefined;

export const generateImage = async (
  promptData: PromptData,
  subjectImage: ImageFile | null,
  environmentImage: ImageFile | null,
  options: GenerateImageOptions,
): Promise<GenerateImageResult> => {
  const response = await authorizedFetch('/api/generate-image', {
    method: 'POST',
    body: JSON.stringify({
      promptData,
      subjectImage: toServerImage(subjectImage) ?? null,
      environmentImage: toServerImage(environmentImage) ?? null,
      qualityBand: options.qualityBand,
      base: options.base,
      fieldHash: options.fieldHash,
    }),
  });

  if (response.status === 402) {
    const error = await response.json();
    throw new Error(error?.error ?? 'Insufficient credits');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to generate image');
  }

  return (await response.json()) as GenerateImageResult;
};

export const startBatchGeneration = async (
  promptData: PromptData,
  subjectImage: ImageFile | null,
  environmentImage: ImageFile | null,
  options: GenerateImageOptions & { batchSize: 4 | 8 },
): Promise<BatchJobSummary> => {
  const response = await authorizedFetch('/api/generate-batch', {
    method: 'POST',
    body: JSON.stringify({
      promptData,
      subjectImage: toServerImage(subjectImage) ?? null,
      environmentImage: toServerImage(environmentImage) ?? null,
      qualityBand: options.qualityBand,
      base: options.base,
      batchSize: options.batchSize,
      fieldHash: options.fieldHash,
    }),
  });

  if (response.status === 402) {
    const error = await response.json();
    throw new Error(error?.error ?? 'Insufficient credits for batch generation');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to start batch generation');
  }

  const payload = (await response.json()) as { job: BatchJobSummary };
  return payload.job;
};

export const fetchBatchJob = async (jobId: string): Promise<BatchJobSummary> => {
  const response = await authorizedFetch(`/api/generate-batch/${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Failed to load batch job');
  }

  const payload = (await response.json()) as { job: BatchJobSummary };
  return payload.job;
};

export const suggestFieldOptions = async (field: keyof PromptData, context: PromptData): Promise<string[]> => {
  const baseOptions = QUICK_SELECT_OPTIONS[field] ?? [];
  const recycled: string[] = baseOptions.slice(0, 5);

  if (context[field] && !recycled.includes(context[field])) {
    recycled.unshift(context[field]);
  }

  return Array.from(new Set(recycled)).slice(0, 5);
};

export const generateFullPromptIdea = async (
  _subjectImage: ImageFile | null,
  _environmentImage: ImageFile | null,
): Promise<PromptData> => {
  return { ...randomFrom(STYLE_PRESETS).data };
};

export const suggestTemplateMetadata = async (
  promptData: PromptData,
): Promise<{ name: string; category: string; tags: string[] }> => {
  const nameBase = promptData.subject || promptData.environment || 'Untitled Vision';
  const words = nameBase.split(/[,\-]/)[0].trim().split(' ').filter(Boolean);
  const title = words
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');

  const category = /city|urban|street/i.test(promptData.environment)
    ? 'Urban'
    : /forest|nature|mountain|valley/i.test(promptData.environment)
    ? 'Nature'
    : /studio|product/i.test(promptData.subject)
    ? 'Product'
    : 'Creative';

  const tags = Array.from(
    new Set(
      [promptData.style, promptData.lighting, promptData.camera]
        .flatMap((value) => value.split(/[,]/).map((tag) => tag.trim()))
        .filter(Boolean),
    ),
  ).slice(0, 4);

  return {
    name: title || 'Creative Vision',
    category,
    tags: tags.length ? tags : ['creative'],
  };
};

export const remixPromptIdea = async (
  currentPrompt: PromptData,
  lockedFields: Record<keyof PromptData, boolean>,
  remixHint?: string,
): Promise<PromptData> => {
  const next: PromptData = { ...currentPrompt };

  (Object.keys(next) as (keyof PromptData)[]).forEach((key) => {
    if (lockedFields[key]) return;
    const options = QUICK_SELECT_OPTIONS[key] ?? [currentPrompt[key]];
    let candidate = randomFrom(options);

    if (remixHint && !candidate.toLowerCase().includes(remixHint.toLowerCase())) {
      candidate = `${candidate}, ${remixHint}`;
    }

    next[key] = candidate;
  });

  return next;
};

export const editImage = async () => {
  throw new Error('Image editing is only available on the managed backend at this time.');
};

export const composeImages = async () => {
  throw new Error('Image composition is only available on the managed backend at this time.');
};

export const parseBulkPrompts = async (rawText: string): Promise<ParsedBulkPrompt[]> => {
  const lines = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => ({
    name: `Preset ${index + 1}`,
    category: 'Imported',
    tags: line
      .split(/[,]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 4),
    subject: line,
    action: '',
    environment: '',
    style: '',
    lighting: '',
    camera: '',
  }));
};
