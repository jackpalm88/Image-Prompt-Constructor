

export enum Tab {
  Generate = 'GENERATE',
  Edit = 'EDIT',
  Compose = 'COMPOSE',
  History = 'HISTORY',
}

export interface PromptData {
  subject: string;
  action: string;
  environment: string;
  style: string;
  lighting: string;
  camera: string;
}

export interface Template extends PromptData {
  id: string;
  name: string;
  category: string;
  tags: string[];
  favorite: boolean;
  pinned: boolean;
  usageCount: number;
  lastUsed: number;
  createdAt: number;
  updatedAt: number;
  signature: string;
  thumbnail?: string;
}

export interface ImageFile {
  file: File;
  preview: string;
  base64: string;
}

export type HistoryItem = {
  id: string;
  type: Tab;
  prompt: string;
  resultImage: string;
  inputImages: string[];
  timestamp: number;
  promptData?: PromptData;
}