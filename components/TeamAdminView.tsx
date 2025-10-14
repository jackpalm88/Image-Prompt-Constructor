import React, { useEffect, useMemo, useState } from 'react';
import type { UserProfile, WorkspaceAnalytics, WorkspaceMemberSummary } from '../types';
import {
  addWorkspaceMember,
  fetchWorkspace,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspacePayload,
} from '../services/workspaceService';

interface TeamAdminViewProps {
  currentUser: UserProfile | null;
  onWorkspaceUpdate?: (payload: WorkspacePayload) => void;
}

const emptyAnalytics: WorkspaceAnalytics = {
  generateSuccessRate: 0,
  totalCreditsSpent: 0,
  coachingUsageCount: 0,
  batchUsageCount: 0,
};

const roleLabel: Record<WorkspaceMemberSummary['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const METADATA_PREVIEW_LIMIT = 160;

const formatMetadataValue = (value: unknown, truncate = true): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'object') {
    try {
      const serialised = JSON.stringify(value);
      if (!serialised) {
        return '—';
      }
      const normalized = serialised.replace(/\s+/g, ' ');
      if (!truncate || normalized.length <= METADATA_PREVIEW_LIMIT) {
        return normalized;
      }
      return `${normalized.slice(0, METADATA_PREVIEW_LIMIT)}…`;
    } catch (error) {
      return '[unserializable]';
    }
  }
  const stringValue = String(value).replace(/\s+/g, ' ');
  if (!truncate || stringValue.length <= METADATA_PREVIEW_LIMIT) {
    return stringValue;
  }
  return `${stringValue.slice(0, METADATA_PREVIEW_LIMIT)}…`;
};

const TeamAdminView: React.FC<TeamAdminViewProps> = ({ currentUser, onWorkspaceUpdate }) => {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceMemberSummary['role']>('member');

  const isAdmin = currentUser?.isWorkspaceAdmin ?? false;

  const loadWorkspace = async () => {
    if (!currentUser) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchWorkspace();
      setPayload(data);
      onWorkspaceUpdate?.(data);
    } catch (err) {
      setError((err as Error).message || 'Unable to load workspace');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.workspace.id]);

  const analytics = payload?.analytics ?? emptyAnalytics;
  const billing = payload?.billing ?? currentUser?.billing ?? {
    plan: 'free',
    status: 'none',
    renewalAt: null,
    stripeCustomerId: undefined,
    stripeSubscriptionId: undefined,
    abVariant: currentUser?.billing?.abVariant ?? 'v1',
    observability: currentUser?.billing?.observability ?? { creditsPerSuccess: 0, failRate: 0, latencyP99: 0 },
  };
  const auditLogs = payload?.auditLogs ?? [];

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await addWorkspaceMember(email.trim(), role);
      setPayload(data);
      onWorkspaceUpdate?.(data);
      setEmail('');
      setRole('member');
    } catch (err) {
      setError((err as Error).message || 'Failed to add member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await removeWorkspaceMember(userId);
      setPayload(data);
      onWorkspaceUpdate?.(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to remove member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: WorkspaceMemberSummary['role']) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await updateWorkspaceMemberRole(userId, nextRole);
      setPayload(data);
      onWorkspaceUpdate?.(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to update role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sortedMembers = useMemo(() => {
    if (!payload) return [] as WorkspaceMemberSummary[];
    return [...payload.members].sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      if (a.role === 'admin' && b.role === 'member') return -1;
      if (a.role === 'member' && b.role === 'admin') return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [payload]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-doma-dark-gray">Team Workspace</h1>
          <p className="text-sm text-doma-dark-gray/70">Manage pooled credits, members, and success metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-full bg-white border border-black/5 text-xs font-semibold text-doma-dark-gray/70">
            Pricing variant · <span className="uppercase text-doma-dark-gray">{billing.abVariant}</span>
          </div>
          <div className="px-4 py-2 rounded-lg bg-white shadow-sm border border-black/5 text-sm font-semibold">
            {payload?.workspace.name ?? currentUser?.workspace.name ?? 'Workspace'} · {payload?.workspace.credits ?? currentUser?.workspace.credits ?? 0} credits
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-10 text-center text-doma-dark-gray">
          Loading workspace insights…
        </div>
      ) : (
        <div className="space-y-10">
          <section className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Success Rate</h2>
              <p className="text-2xl font-bold text-doma-green mt-2">{(analytics.generateSuccessRate * 100).toFixed(1)}%</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Completed generations vs. attempts</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Credits Spent</h2>
              <p className="text-2xl font-bold text-doma-dark-gray mt-2">{analytics.totalCreditsSpent}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Total pooled credits used</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Coaching Sessions</h2>
              <p className="text-2xl font-bold text-doma-dark-gray mt-2">{analytics.coachingUsageCount}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Prompt coaching runs</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Batch Jobs</h2>
              <p className="text-2xl font-bold text-doma-dark-gray mt-2">{analytics.batchUsageCount}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">4x & 8x variant runs</p>
            </div>
            <div className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-sm font-semibold text-doma-dark-gray/70">Avg Credits / Success</h2>
              <p className="text-2xl font-bold text-doma-dark-gray mt-2">{analytics.averageCreditsPerSuccess.toFixed(2)}</p>
              <p className="text-xs text-doma-dark-gray/60 mt-1">Smart credits per successful image</p>
            </div>
          </section>

          {isAdmin && (
            <section className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <h2 className="text-lg font-semibold text-doma-dark-gray mb-4">Invite teammate</h2>
              <form onSubmit={handleAddMember} className="grid gap-4 grid-cols-1 md:grid-cols-3 items-end">
                <label className="flex flex-col text-sm font-medium text-doma-dark-gray">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 rounded-lg border border-black/10 px-3 py-2 shadow-inner-soft focus:outline-none focus:ring-2 focus:ring-doma-yellow"
                    placeholder="teammate@example.com"
                    required
                  />
                </label>
                <label className="flex flex-col text-sm font-medium text-doma-dark-gray">
                  Role
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as WorkspaceMemberSummary['role'])}
                    className="mt-1 rounded-lg border border-black/10 px-3 py-2 shadow-inner-soft focus:outline-none focus:ring-2 focus:ring-doma-yellow"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-doma-green text-white font-semibold shadow-md hover:bg-green-600 transition"
                >
                  {isSubmitting ? 'Adding…' : 'Add member'}
                </button>
              </form>
            </section>
          )}

            <section className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-doma-dark-gray">Members</h2>
                <span className="text-sm text-doma-dark-gray/70">{sortedMembers.length} people</span>
              </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-doma-dark-gray/60">
                    <th className="py-2">Member</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Credits spent</th>
                    <th className="py-2">Generations</th>
                    <th className="py-2">Batch jobs</th>
                    {isAdmin && <th className="py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {sortedMembers.map((member) => {
                    const isCurrentUser = member.id === currentUser?.id;
                    const canManage = isAdmin && !isCurrentUser && member.role !== 'owner';
                    return (
                      <tr key={member.id} className="hover:bg-doma-cream/40">
                        <td className="py-3 font-medium text-doma-dark-gray">
                          <div>{member.email ?? 'Pending invite'}</div>
                          <div className="text-xs text-doma-dark-gray/60">{new Date(member.joinedAt).toLocaleDateString()}</div>
                        </td>
                        <td className="py-3">
                          {canManage ? (
                            <select
                              value={member.role}
                              onChange={(event) => handleRoleChange(member.id, event.target.value as WorkspaceMemberSummary['role'])}
                              className="rounded-lg border border-black/10 px-3 py-1.5 shadow-inner-soft text-sm focus:outline-none focus:ring-2 focus:ring-doma-yellow"
                              disabled={isSubmitting}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className="px-3 py-1 rounded-full bg-doma-cream text-xs font-semibold text-doma-dark-gray">
                              {roleLabel[member.role]}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-doma-dark-gray">{member.totalCreditsSpent}</td>
                        <td className="py-3 text-doma-dark-gray">{member.generateCount}</td>
                        <td className="py-3 text-doma-dark-gray">{member.batchCount}</td>
                        {isAdmin && (
                          <td className="py-3">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleRemove(member.id)}
                                disabled={isSubmitting}
                                className="text-xs font-semibold text-doma-red hover:underline"
                              >
                                Remove
                              </button>
                            ) : (
                              <span className="text-xs text-doma-dark-gray/50">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </section>

            <section className="bg-white border border-black/5 rounded-2xl shadow-inner-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-doma-dark-gray">Recent audit activity</h2>
                <span className="text-xs text-doma-dark-gray/60">Last {auditLogs.length} events</span>
              </div>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-doma-dark-gray/60">No workspace changes recorded yet.</p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {auditLogs.map((log) => {
                    const metadataEntries = Object.entries(log.metadata ?? {});
                    const fullMetadataDescription = metadataEntries.length
                      ? metadataEntries
                          .map(([key, value]) => `${key}: ${formatMetadataValue(value, false)}`)
                          .join(', ')
                      : '—';
                    const metadataDescription = metadataEntries.length
                      ? metadataEntries
                          .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`)
                          .join(', ')
                      : '—';
                    return (
                      <li key={log.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm">
                        <div>
                          <p className="font-semibold text-doma-dark-gray">{log.action}</p>
                          <p className="text-xs text-doma-dark-gray/60" title={fullMetadataDescription}>
                            {metadataDescription}
                          </p>
                        </div>
                        <div className="text-xs text-doma-dark-gray/50 text-right">
                          {new Date(log.createdAt).toLocaleString()} · {log.userId?.slice(0, 8) ?? 'system'}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    );
  };

export default TeamAdminView;
