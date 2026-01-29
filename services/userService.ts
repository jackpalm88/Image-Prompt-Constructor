import type { QualityBand } from '../pricing';
import type { PromptData, UserProfile } from '../types';
import { authorizedFetch } from './auth';

export const fetchCurrentUser = async (): Promise<UserProfile> => {
  const response = await authorizedFetch('/api/user');
  if (!response.ok) {
    throw new Error('Unable to fetch user profile');
  }
  return (await response.json()) as UserProfile;
};

export const fetchCredits = async (): Promise<number> => {
  const response = await authorizedFetch('/api/credits');
  if (!response.ok) {
    throw new Error('Unable to fetch credits');
  }
  const data = (await response.json()) as { credits: number };
  return data.credits;
};

export interface CreditPreviewResult {
  price: number;
  rounded: number;
  predictionScore: number;
  confidence: 'green' | 'amber' | 'red';
  label: 'Likely' | 'Uncertain' | 'At risk';
  variant: 'v1' | 'v2';
}

export const previewCreditPrice = async (
  promptData: PromptData,
  qualityBand: QualityBand,
  options: { base?: number; hasSubjectReference?: boolean; hasEnvironmentReference?: boolean } = {},
): Promise<CreditPreviewResult> => {
  const response = await authorizedFetch('/api/credits/preview', {
    method: 'POST',
    body: JSON.stringify({
      promptData,
      qualityBand,
      base: options.base,
      hasSubjectReference: options.hasSubjectReference,
      hasEnvironmentReference: options.hasEnvironmentReference,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to preview credit price');
  }

  return (await response.json()) as CreditPreviewResult;
};
