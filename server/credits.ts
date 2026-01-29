import {
  ensureWorkspaceMembership,
  getCachedCredits,
  primeCreditCache,
  syncCredits,
  appendUsageLog,
  getWorkspaceRecord,
} from './storage';
import { trackEvent } from './analytics';

export const ensureCreditCache = async (workspaceId: string, userId?: string) => {
  const cached = await getCachedCredits(workspaceId);
  if (cached !== null) {
    return cached;
  }
  const workspace = await getWorkspaceRecord(workspaceId);
  if (workspace) {
    await primeCreditCache(workspaceId, workspace.credits);
    return workspace.credits;
  }

  if (!userId) {
    throw new Error('Workspace not found');
  }

  const membership = await ensureWorkspaceMembership(userId);
  await primeCreditCache(membership.id, membership.credits);
  return membership.credits;
};

export const getCredits = async (workspaceId: string) => {
  const cached = await ensureCreditCache(workspaceId);
  return cached;
};

export const setCredits = async (workspaceId: string, credits: number) => {
  await syncCredits(workspaceId, credits);
};

export const addCredits = async (
  workspaceId: string,
  userId: string,
  amount: number,
  action = 'credit-adjust',
  metadata: Record<string, unknown> = {},
) => {
  const current = await ensureCreditCache(workspaceId, userId);
  const newBalance = current + amount;
  await syncCredits(workspaceId, newBalance);
  await appendUsageLog(workspaceId, userId, action, -amount, metadata);
  return newBalance;
};

export const deductCredits = async (
  workspaceId: string,
  userId: string,
  amount: number,
  action: string,
  metadata: Record<string, unknown> = {},
) => {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const balance = await ensureCreditCache(workspaceId, userId);
  if (balance < amount) {
    throw new Error('Insufficient credits');
  }

  const newBalance = balance - amount;
  if (newBalance < 0) {
    throw new Error('Insufficient credits');
  }

  await syncCredits(workspaceId, newBalance);
  await appendUsageLog(workspaceId, userId, action, amount, metadata);
  await trackEvent({
    event: 'credits_spent',
    userId,
    workspaceId,
    properties: {
      amount,
      action,
      balance: newBalance,
      ...metadata,
    },
  });
  return newBalance;
};
