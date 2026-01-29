

export enum Tab {
  Generate = 'GENERATE',
  Edit = 'EDIT',
  Compose = 'COMPOSE',
  History = 'HISTORY',
  Team = 'TEAM',
  Billing = 'BILLING',
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
  renderSuccessCount: number;
  lastUsed: number;
  createdAt: number;
  updatedAt: number;
  signature: string;
  thumbnail?: string;
  quality?: "Green" | "Amber" | "Red";
  variantOf?: string;
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
};

export interface UserProfile {
  id: string;
  email?: string | null;
  credits: number;
  workspace: WorkspaceSummary;
  isWorkspaceAdmin: boolean;
  billing: WorkspaceBillingSummary;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  credits: number;
  role: 'owner' | 'admin' | 'member';
}

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface WorkspaceBillingSummary {
  plan: 'free' | 'pro';
  status: SubscriptionStatus;
  renewalAt?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  abVariant: 'v1' | 'v2';
  observability: BillingUsageSnapshot;
}

export interface BillingUsageSnapshot {
  creditsPerSuccess: number;
  failRate: number;
  latencyP99: number;
}

export interface WorkspaceMemberSummary {
  id: string;
  email: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  totalCreditsSpent: number;
  generateCount: number;
  batchCount: number;
}

export interface WorkspaceAnalytics {
  generateSuccessRate: number;
  totalCreditsSpent: number;
  coachingUsageCount: number;
  batchUsageCount: number;
  averageCreditsPerSuccess: number;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
