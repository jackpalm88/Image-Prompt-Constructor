import type {
  WorkspaceAnalytics,
  WorkspaceMemberSummary,
  WorkspaceSummary,
  WorkspaceBillingSummary,
  AuditLogEntry,
} from '../types';
import { authorizedFetch } from './auth';

export interface WorkspacePayload {
  workspace: WorkspaceSummary;
  members: WorkspaceMemberSummary[];
  analytics: WorkspaceAnalytics;
  billing: WorkspaceBillingSummary;
  auditLogs: AuditLogEntry[];
}

export const fetchWorkspace = async (): Promise<WorkspacePayload> => {
  const response = await authorizedFetch('/api/workspace');
  if (!response.ok) {
    throw new Error('Unable to fetch workspace');
  }
  return (await response.json()) as WorkspacePayload;
};

export const addWorkspaceMember = async (
  email: string,
  role: WorkspaceMemberSummary['role'] = 'member',
): Promise<WorkspacePayload> => {
  const response = await authorizedFetch('/api/workspace/members', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });

  if (!response.ok) {
    throw new Error('Unable to add member');
  }

  return (await response.json()) as WorkspacePayload;
};

export const updateWorkspaceMemberRole = async (
  userId: string,
  role: WorkspaceMemberSummary['role'],
): Promise<WorkspacePayload> => {
  const response = await authorizedFetch(`/api/workspace/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    throw new Error('Unable to update member role');
  }

  return (await response.json()) as WorkspacePayload;
};

export const removeWorkspaceMember = async (userId: string): Promise<WorkspacePayload> => {
  const response = await authorizedFetch(`/api/workspace/members/${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Unable to remove member');
  }

  return (await response.json()) as WorkspacePayload;
};
