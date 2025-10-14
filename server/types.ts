export interface PromptData {
  subject: string;
  action: string;
  environment: string;
  style: string;
  lighting: string;
  camera: string;
}

export interface ImagePayload {
  base64: string;
  mimeType: string;
}

export interface GenerateImagePayload {
  promptData: PromptData;
  subjectImage?: ImagePayload | null;
  environmentImage?: ImagePayload | null;
}

export type QualityBand = 'economy' | 'standard' | 'premium' | string;
