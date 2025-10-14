import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

export const INITIAL_CREDITS = Number(process.env.INITIAL_CREDITS ?? 100);

export const USERS_TABLE = 'users';
export const USAGE_LOGS_TABLE = 'usage_logs';
export const GENERATION_JOBS_TABLE = 'generation_jobs';
export const GENERATION_RESULTS_TABLE = 'generation_results';
export const TEMPLATE_VERSIONS_TABLE = 'template_versions';
export const FIGMA_TOKENS_TABLE = 'figma_tokens';
export const WORKSPACES_TABLE = 'workspaces';
export const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
export const AUDIT_LOGS_TABLE = 'audit_logs';
export const BILLING_EVENTS_TABLE = 'billing_events';

export const USER_CREDIT_KEY = (userId: string) => `users:${userId}:credits`;
export const WORKSPACE_CREDIT_KEY = (workspaceId: string) => `workspaces:${workspaceId}:credits`;

export const initializeStorage = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${WORKSPACES_TABLE} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'free',
      billing_status TEXT NOT NULL DEFAULT 'none',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      renewal_at TIMESTAMPTZ,
      pricing_variant TEXT NOT NULL DEFAULT 'v1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
      id TEXT PRIMARY KEY,
      email TEXT,
      credits INTEGER NOT NULL DEFAULT 0,
      default_workspace_id TEXT REFERENCES ${WORKSPACES_TABLE}(id),
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${WORKSPACE_MEMBERS_TABLE} (
      workspace_id TEXT NOT NULL REFERENCES ${WORKSPACES_TABLE}(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);

  await pool.query(`
    ALTER TABLE ${USERS_TABLE}
      ADD COLUMN IF NOT EXISTS default_workspace_id TEXT REFERENCES ${WORKSPACES_TABLE}(id);
  `);

  await pool.query(`
    ALTER TABLE ${USERS_TABLE}
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${USAGE_LOGS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      credits_used INTEGER NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE ${USAGE_LOGS_TABLE}
      ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES ${WORKSPACES_TABLE}(id) ON DELETE CASCADE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${GENERATION_JOBS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      prompt_data JSONB NOT NULL,
      batch_size INTEGER NOT NULL,
      quality_band TEXT NOT NULL,
      price_per_image NUMERIC(10, 2) NOT NULL,
      total_credits INTEGER NOT NULL,
      field_hash TEXT,
      template_signature TEXT,
      template_version INTEGER,
      prediction_score NUMERIC(6, 5),
      confidence TEXT,
      label TEXT,
      remaining_credits INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${GENERATION_RESULTS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES ${GENERATION_JOBS_TABLE}(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL,
      status TEXT NOT NULL,
      image_url TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, slot)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_LOGS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES ${WORKSPACES_TABLE}(id) ON DELETE CASCADE,
      user_id TEXT,
      action TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BILLING_EVENTS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES ${WORKSPACES_TABLE}(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'none';
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS renewal_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE ${WORKSPACES_TABLE}
      ADD COLUMN IF NOT EXISTS pricing_variant TEXT NOT NULL DEFAULT 'v1';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TEMPLATE_VERSIONS_TABLE} (
      signature TEXT NOT NULL,
      version INTEGER NOT NULL,
      prompt_data JSONB NOT NULL,
      image_url TEXT,
      job_id TEXT,
      slot INTEGER,
      promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (signature, version)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FIGMA_TOKENS_TABLE} (
      user_id TEXT PRIMARY KEY REFERENCES ${USERS_TABLE}(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      refresh_expires_at TIMESTAMPTZ,
      scope TEXT,
      token_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

export type UserRecord = {
  id: string;
  email: string | null;
  credits: number;
  defaultWorkspaceId: string | null;
  role: 'owner' | 'admin' | 'member';
};

export type BillingStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export type WorkspaceRecord = {
  id: string;
  name: string;
  credits: number;
  plan: 'free' | 'pro';
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  renewalAt: Date | null;
  pricingVariant: 'v1' | 'v2';
};

export type WorkspaceMemberRecord = {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
};

export const getUserRecord = async (userId: string) => {
  const result = await pool.query<{
    id: string;
    email: string | null;
    credits: number;
    default_workspace_id: string | null;
    role: 'owner' | 'admin' | 'member';
  }>(
    `SELECT id, email, credits, default_workspace_id, role FROM ${USERS_TABLE} WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (!result.rows[0]) {
    return null;
  }
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    credits: row.credits,
    defaultWorkspaceId: row.default_workspace_id,
    role: row.role,
  } satisfies UserRecord;
};

export const createUserRecord = async (userId: string, email?: string | null) => {
  const credits = INITIAL_CREDITS;
  const result = await pool.query<{
    id: string;
    email: string | null;
    credits: number;
    default_workspace_id: string | null;
    role: 'owner' | 'admin' | 'member';
  }>(
    `INSERT INTO ${USERS_TABLE} (id, email, credits)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, ${USERS_TABLE}.email)
     RETURNING id, email, credits, default_workspace_id, role`,
    [userId, email ?? null, credits],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    credits: row.credits,
    defaultWorkspaceId: row.default_workspace_id,
    role: row.role,
  } satisfies UserRecord;
};

export const ensureUserRecord = async (userId: string, email?: string | null) => {
  const user = await getUserRecord(userId);
  if (user) {
    return user;
  }
  return createUserRecord(userId, email);
};

export const getWorkspaceRecord = async (workspaceId: string) => {
  const result = await pool.query<WorkspaceRecord>(
    `SELECT
       id,
       name,
       credits,
       plan,
       billing_status AS "billingStatus",
       stripe_customer_id AS "stripeCustomerId",
       stripe_subscription_id AS "stripeSubscriptionId",
       renewal_at AS "renewalAt",
       pricing_variant AS "pricingVariant"
     FROM ${WORKSPACES_TABLE}
     WHERE id = $1
     LIMIT 1`,
    [workspaceId],
  );
  return result.rows[0] ?? null;
};

const WORKSPACE_NAME_FALLBACK = 'Creative Workspace';

const deriveWorkspaceName = (email?: string | null) => {
  if (!email) {
    return WORKSPACE_NAME_FALLBACK;
  }
  const local = email.split('@')[0] ?? email;
  return `${local}'s Workspace`;
};

export const getPrimaryWorkspaceForUser = async (userId: string) => {
  const result = await pool.query<{
    workspace_id: string;
    name: string;
    credits: number;
    role: 'owner' | 'admin' | 'member';
    plan: 'free' | 'pro';
    billing_status: BillingStatus;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    renewal_at: Date | null;
    pricing_variant: 'v1' | 'v2';
  }>(
    `SELECT
       wm.workspace_id,
       w.name,
       w.credits,
       wm.role,
       w.plan,
       w.billing_status,
       w.stripe_customer_id,
       w.stripe_subscription_id,
       w.renewal_at,
       w.pricing_variant
     FROM ${WORKSPACE_MEMBERS_TABLE} wm
     JOIN ${WORKSPACES_TABLE} w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, w.created_at
     LIMIT 1`,
    [userId],
  );

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.workspace_id,
    name: row.name,
    credits: row.credits,
    role: row.role,
    plan: row.plan,
    billingStatus: row.billing_status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    renewalAt: row.renewal_at,
    pricingVariant: row.pricing_variant,
  } satisfies WorkspaceRecord & { role: 'owner' | 'admin' | 'member' };
};

export const ensureWorkspaceMembership = async (userId: string, email?: string | null) => {
  const user = await ensureUserRecord(userId, email);
  const existing = await getPrimaryWorkspaceForUser(userId);

  if (existing) {
    if (!user.defaultWorkspaceId || user.defaultWorkspaceId !== existing.id) {
      await pool.query(
        `UPDATE ${USERS_TABLE} SET default_workspace_id = $1, updated_at = NOW() WHERE id = $2`,
        [existing.id, userId],
      );
    }
    return existing;
  }

  const workspaceId = `ws_${randomUUID()}`;
  const name = deriveWorkspaceName(user.email ?? email);

  await pool.query(
    `INSERT INTO ${WORKSPACES_TABLE} (id, name, credits) VALUES ($1, $2, $3)` ,
    [workspaceId, name, INITIAL_CREDITS],
  );

  await pool.query(
    `INSERT INTO ${WORKSPACE_MEMBERS_TABLE} (workspace_id, user_id, role) VALUES ($1, $2, 'owner')` ,
    [workspaceId, userId],
  );

  await pool.query(
    `UPDATE ${USERS_TABLE} SET default_workspace_id = $1, role = 'owner', credits = $2, updated_at = NOW() WHERE id = $3`,
    [workspaceId, INITIAL_CREDITS, userId],
  );

  await primeCreditCache(workspaceId, INITIAL_CREDITS);

  return {
    id: workspaceId,
    name,
    credits: INITIAL_CREDITS,
    role: 'owner',
    plan: 'free',
    billingStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    renewalAt: null,
    pricingVariant: 'v1',
  } satisfies WorkspaceRecord & { role: 'owner' };
};

export const getWorkspaceMembership = async (
  workspaceId: string,
  userId: string,
): Promise<'owner' | 'admin' | 'member' | null> => {
  const result = await pool.query<{ role: 'owner' | 'admin' | 'member' }>(
    `SELECT role FROM ${WORKSPACE_MEMBERS_TABLE} WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
    [workspaceId, userId],
  );
  return result.rows[0]?.role ?? null;
};

export const getCachedCredits = async (workspaceId: string) => {
  const raw = await redis.get(WORKSPACE_CREDIT_KEY(workspaceId));
  return raw === null ? null : Number(raw);
};

export const primeCreditCache = async (workspaceId: string, credits: number) => {
  await redis.set(WORKSPACE_CREDIT_KEY(workspaceId), credits);
};

export const syncCredits = async (workspaceId: string, credits: number) => {
  await pool.query(`UPDATE ${WORKSPACES_TABLE} SET credits = $1, updated_at = NOW() WHERE id = $2`, [credits, workspaceId]);
  await pool.query(
    `UPDATE ${USERS_TABLE}
       SET credits = $1, updated_at = NOW()
     WHERE id IN (
       SELECT user_id FROM ${WORKSPACE_MEMBERS_TABLE} WHERE workspace_id = $2
     )`,
    [credits, workspaceId],
  );
  await primeCreditCache(workspaceId, credits);
};

export const appendUsageLog = async (
  workspaceId: string,
  userId: string,
  action: string,
  creditsUsed: number,
  metadata: Record<string, unknown> = {},
) => {
  await pool.query(
    `INSERT INTO ${USAGE_LOGS_TABLE} (workspace_id, user_id, action, credits_used, metadata) VALUES ($1, $2, $3, $4, $5)` ,
    [workspaceId, userId, action, creditsUsed, metadata],
  );
};

export const appendAuditLog = async (
  workspaceId: string,
  userId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
) => {
  await pool.query(
    `INSERT INTO ${AUDIT_LOGS_TABLE} (workspace_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)` ,
    [workspaceId, userId, action, metadata],
  );
};

export const getRecentAuditLogs = async (workspaceId: string, limit = 50) => {
  const result = await pool.query<{
    id: string;
    workspace_id: string;
    user_id: string | null;
    action: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, workspace_id, user_id, action, metadata, created_at
     FROM ${AUDIT_LOGS_TABLE}
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  );

  return result.rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    action: row.action,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }));
};

export const recordBillingEvent = async (
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) => {
  await pool.query(
    `INSERT INTO ${BILLING_EVENTS_TABLE} (workspace_id, event_type, payload) VALUES ($1, $2, $3)` ,
    [workspaceId, eventType, payload],
  );
};

export const updateWorkspaceBilling = async (
  workspaceId: string,
  updates: Partial<{
    plan: WorkspaceRecord['plan'];
    billingStatus: WorkspaceRecord['billingStatus'];
    stripeCustomerId: WorkspaceRecord['stripeCustomerId'];
    stripeSubscriptionId: WorkspaceRecord['stripeSubscriptionId'];
    renewalAt: WorkspaceRecord['renewalAt'];
    pricingVariant: WorkspaceRecord['pricingVariant'];
  }> = {},
) => {
  if (Object.keys(updates).length === 0) {
    return;
  }

  const assignments: string[] = [];
  const values: unknown[] = [workspaceId];

  if (updates.plan) {
    assignments.push(`plan = $${assignments.length + 2}`);
    values.push(updates.plan);
  }
  if (updates.billingStatus) {
    assignments.push(`billing_status = $${assignments.length + 2}`);
    values.push(updates.billingStatus);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'stripeCustomerId')) {
    assignments.push(`stripe_customer_id = $${assignments.length + 2}`);
    values.push(updates.stripeCustomerId ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'stripeSubscriptionId')) {
    assignments.push(`stripe_subscription_id = $${assignments.length + 2}`);
    values.push(updates.stripeSubscriptionId ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'renewalAt')) {
    assignments.push(`renewal_at = $${assignments.length + 2}`);
    values.push(updates.renewalAt ?? null);
  }
  if (updates.pricingVariant) {
    assignments.push(`pricing_variant = $${assignments.length + 2}`);
    values.push(updates.pricingVariant);
  }

  const statement = assignments.join(', ');
  await pool.query(
    `UPDATE ${WORKSPACES_TABLE} SET ${statement}, updated_at = NOW() WHERE id = $1`,
    values,
  );
};

export const listWorkspaceMembersWithUsage = async (workspaceId: string) => {
  const result = await pool.query<{
    user_id: string;
    email: string | null;
    role: 'owner' | 'admin' | 'member';
    joined_at: Date;
    credits_spent: string | null;
    generate_count: string | null;
    batch_count: string | null;
  }>(
    `SELECT
       wm.user_id,
       u.email,
       wm.role,
       wm.joined_at,
       SUM(CASE WHEN l.credits_used > 0 THEN l.credits_used ELSE 0 END) AS credits_spent,
       SUM(CASE WHEN l.action = 'generate_success' THEN 1 ELSE 0 END) AS generate_count,
       SUM(CASE WHEN l.action = 'generate-batch' THEN 1 ELSE 0 END) AS batch_count
     FROM ${WORKSPACE_MEMBERS_TABLE} wm
     JOIN ${USERS_TABLE} u ON u.id = wm.user_id
     LEFT JOIN ${USAGE_LOGS_TABLE} l ON l.workspace_id = wm.workspace_id AND l.user_id = wm.user_id
     WHERE wm.workspace_id = $1
     GROUP BY wm.user_id, u.email, wm.role, wm.joined_at
     ORDER BY wm.joined_at ASC`,
    [workspaceId],
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
    totalCreditsSpent: Number(row.credits_spent ?? 0),
    generateCount: Number(row.generate_count ?? 0),
    batchCount: Number(row.batch_count ?? 0),
  }));
};

export const getWorkspaceBillingFallbackUser = async (workspaceId: string) => {
  const result = await pool.query<{ user_id: string }>(
    `SELECT user_id
     FROM ${WORKSPACE_MEMBERS_TABLE}
     WHERE workspace_id = $1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, joined_at
     LIMIT 1`,
    [workspaceId],
  );

  return result.rows[0]?.user_id ?? null;
};

export const getWorkspaceAnalytics = async (workspaceId: string) => {
  const result = await pool.query<{
    success_count: string | null;
    attempt_count: string | null;
    coaching_count: string | null;
    batch_count: string | null;
    credits_spent: string | null;
  }>(
    `SELECT
       SUM(CASE WHEN action = 'generate_success' THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN action IN ('generate-image', 'generate-batch') THEN 1 ELSE 0 END) AS attempt_count,
      SUM(CASE WHEN action = 'coaching-evaluate' THEN 1 ELSE 0 END) AS coaching_count,
      SUM(CASE WHEN action = 'generate-batch' THEN 1 ELSE 0 END) AS batch_count,
      SUM(CASE WHEN credits_used > 0 THEN credits_used ELSE 0 END) AS credits_spent
    FROM ${USAGE_LOGS_TABLE}
    WHERE workspace_id = $1`,
    [workspaceId],
  );

  const row = result.rows[0];
  const attempts = Number(row?.attempt_count ?? 0);
  const successes = Number(row?.success_count ?? 0);
  const batchUsage = Number(row?.batch_count ?? 0);
  const coachingUsage = Number(row?.coaching_count ?? 0);
  const creditsSpent = Number(row?.credits_spent ?? 0);
  const averageCreditsPerSuccess = successes > 0 ? creditsSpent / successes : 0;

  return {
    generateSuccessRate: attempts > 0 ? successes / attempts : 0,
    totalCreditsSpent: creditsSpent,
    coachingUsageCount: coachingUsage,
    batchUsageCount: batchUsage,
    averageCreditsPerSuccess,
  };
};

export const findUserByEmail = async (email: string) => {
  const result = await pool.query<{
    id: string;
    email: string | null;
    credits: number;
    default_workspace_id: string | null;
    role: 'owner' | 'admin' | 'member';
  }>(
    `SELECT id, email, credits, default_workspace_id, role FROM ${USERS_TABLE} WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const row = result.rows[0];
  return row
    ? ({
        id: row.id,
        email: row.email,
        credits: row.credits,
        defaultWorkspaceId: row.default_workspace_id,
        role: row.role,
      } satisfies UserRecord)
    : null;
};

export const addMemberToWorkspace = async (
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' = 'member',
) => {
  const workspace = await getWorkspaceRecord(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const existingMembership = await pool.query(
    `SELECT 1 FROM ${WORKSPACE_MEMBERS_TABLE} WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
    [workspaceId, userId],
  );

  if (!existingMembership.rows[0]) {
    await pool.query(
      `INSERT INTO ${WORKSPACE_MEMBERS_TABLE} (workspace_id, user_id, role) VALUES ($1, $2, $3)` ,
      [workspaceId, userId, role],
    );
  } else {
    await pool.query(
      `UPDATE ${WORKSPACE_MEMBERS_TABLE} SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId, role],
    );
  }

  await pool.query(
    `UPDATE ${USERS_TABLE} SET default_workspace_id = $1, role = $2, credits = $3, updated_at = NOW() WHERE id = $4`,
    [workspaceId, role, workspace.credits, userId],
  );

  await primeCreditCache(workspaceId, workspace.credits);
};

export const updateWorkspaceMemberRole = async (
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
) => {
  await pool.query(
    `UPDATE ${WORKSPACE_MEMBERS_TABLE} SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId, role],
  );

  const workspace = await getWorkspaceRecord(workspaceId);
  if (workspace) {
    await pool.query(
      `UPDATE ${USERS_TABLE} SET role = $2, credits = $3, updated_at = NOW() WHERE id = $1`,
      [userId, role, workspace.credits],
    );
  }
};

export const removeWorkspaceMember = async (workspaceId: string, userId: string) => {
  const membership = await pool.query<{ role: string }>(
    `SELECT role FROM ${WORKSPACE_MEMBERS_TABLE} WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
    [workspaceId, userId],
  );

  if (!membership.rows[0]) {
    return;
  }

  if (membership.rows[0].role === 'owner') {
    throw new Error('Cannot remove the workspace owner');
  }

  await pool.query(`DELETE FROM ${WORKSPACE_MEMBERS_TABLE} WHERE workspace_id = $1 AND user_id = $2`, [workspaceId, userId]);

  const user = await getUserRecord(userId);
  if (user) {
    await pool.query(
      `UPDATE ${USERS_TABLE} SET default_workspace_id = NULL, role = 'member', updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    await ensureWorkspaceMembership(userId, user.email);
  }
};

export type GenerationJobRecord = {
  id: string;
  userId: string;
  status: string;
  promptData: Record<string, unknown>;
  batchSize: number;
  qualityBand: string;
  pricePerImage: number;
  totalCredits: number;
  fieldHash?: string;
  templateSignature?: string | null;
  templateVersion?: number | null;
  predictionScore?: number | null;
  confidence?: string | null;
  label?: string | null;
  remainingCredits?: number | null;
};

export const createGenerationJobRecord = async (job: GenerationJobRecord) => {
  await pool.query(
    `INSERT INTO ${GENERATION_JOBS_TABLE} (
      id, user_id, status, prompt_data, batch_size, quality_band, price_per_image, total_credits,
      field_hash, template_signature, template_version, prediction_score, confidence, label, remaining_credits
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15
    )`,
    [
      job.id,
      job.userId,
      job.status,
      job.promptData,
      job.batchSize,
      job.qualityBand,
      job.pricePerImage,
      job.totalCredits,
      job.fieldHash ?? null,
      job.templateSignature ?? null,
      job.templateVersion ?? null,
      job.predictionScore ?? null,
      job.confidence ?? null,
      job.label ?? null,
      job.remainingCredits ?? null,
    ],
  );
};

export const updateGenerationJobStatus = async (
  jobId: string,
  status: string,
  updates: Partial<GenerationJobRecord & { metadata: Record<string, unknown>; remainingCredits: number | null }> = {},
) => {
  const fields = ['status'];
  const values: unknown[] = [status];

  if (typeof updates.remainingCredits !== 'undefined') {
    fields.push('remaining_credits');
    values.push(updates.remainingCredits);
  }
  if (typeof updates.predictionScore !== 'undefined') {
    fields.push('prediction_score');
    values.push(updates.predictionScore);
  }
  if (typeof updates.confidence !== 'undefined') {
    fields.push('confidence');
    values.push(updates.confidence);
  }
  if (typeof updates.label !== 'undefined') {
    fields.push('label');
    values.push(updates.label);
  }
  if (updates.templateVersion !== undefined) {
    fields.push('template_version');
    values.push(updates.templateVersion);
  }
  if (updates.templateSignature !== undefined) {
    fields.push('template_signature');
    values.push(updates.templateSignature);
  }
  if (updates.fieldHash !== undefined) {
    fields.push('field_hash');
    values.push(updates.fieldHash);
  }
  if (updates.promptData) {
    fields.push('prompt_data');
    values.push(updates.promptData);
  }
  if ((updates as { metadata?: Record<string, unknown> }).metadata) {
    fields.push('metadata');
    values.push((updates as { metadata: Record<string, unknown> }).metadata);
  }

  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  await pool.query(
    `UPDATE ${GENERATION_JOBS_TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1`,
    [jobId, ...values],
  );
};

export type FigmaTokenRecord = {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const getFigmaTokenRecord = async (userId: string): Promise<FigmaTokenRecord | null> => {
  const result = await pool.query(
    `SELECT user_id, encrypted_access_token, encrypted_refresh_token, expires_at, refresh_expires_at, scope, token_type, created_at, updated_at
     FROM ${FIGMA_TOKENS_TABLE}
     WHERE user_id = $1`,
    [userId],
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  return {
    userId: row.user_id,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    refreshExpiresAt: row.refresh_expires_at ? new Date(row.refresh_expires_at) : null,
    scope: row.scope ?? null,
    tokenType: row.token_type ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  } satisfies FigmaTokenRecord;
};

export const upsertFigmaTokenRecord = async (record: {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scope?: string | null;
  tokenType?: string | null;
}) => {
  await pool.query(
    `INSERT INTO ${FIGMA_TOKENS_TABLE} (
      user_id, encrypted_access_token, encrypted_refresh_token, expires_at, refresh_expires_at, scope, token_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) DO UPDATE SET
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      expires_at = EXCLUDED.expires_at,
      refresh_expires_at = EXCLUDED.refresh_expires_at,
      scope = EXCLUDED.scope,
      token_type = EXCLUDED.token_type,
      updated_at = NOW()
    `,
    [
      record.userId,
      record.encryptedAccessToken,
      record.encryptedRefreshToken ?? null,
      record.expiresAt ?? null,
      record.refreshExpiresAt ?? null,
      record.scope ?? null,
      record.tokenType ?? null,
    ],
  );
};

export type GenerationResultRecord = {
  jobId: string;
  slot: number;
  status: string;
  imageUrl?: string | null;
  error?: string | null;
};

export const upsertGenerationResultRecord = async (result: GenerationResultRecord) => {
  await pool.query(
    `INSERT INTO ${GENERATION_RESULTS_TABLE} (job_id, slot, status, image_url, error)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id, slot)
     DO UPDATE SET status = EXCLUDED.status, image_url = EXCLUDED.image_url, error = EXCLUDED.error, updated_at = NOW()`,
    [result.jobId, result.slot, result.status, result.imageUrl ?? null, result.error ?? null],
  );
};

export const getGenerationJobWithResults = async (jobId: string) => {
  const [jobResult, resultsResult] = await Promise.all([
    pool.query(
      `SELECT id, user_id, status, prompt_data, batch_size, quality_band, price_per_image, total_credits,
              field_hash, template_signature, template_version, prediction_score, confidence, label, remaining_credits,
              created_at, updated_at
       FROM ${GENERATION_JOBS_TABLE}
       WHERE id = $1
       LIMIT 1`,
      [jobId],
    ),
    pool.query(
      `SELECT slot, status, image_url, error, created_at, updated_at
       FROM ${GENERATION_RESULTS_TABLE}
       WHERE job_id = $1
       ORDER BY slot ASC`,
      [jobId],
    ),
  ]);

  if (jobResult.rowCount === 0) {
    return null;
  }

  return {
    job: jobResult.rows[0],
    results: resultsResult.rows,
  };
};

export type TemplateVersionRecord = {
  signature: string;
  version: number;
  promptData: Record<string, unknown>;
  imageUrl?: string | null;
  jobId?: string | null;
  slot?: number | null;
  promotedAt?: Date | null;
};

export const recordTemplateVersion = async (record: TemplateVersionRecord) => {
  await pool.query(
    `INSERT INTO ${TEMPLATE_VERSIONS_TABLE} (signature, version, prompt_data, image_url, job_id, slot, promoted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (signature, version)
     DO UPDATE SET prompt_data = EXCLUDED.prompt_data, image_url = EXCLUDED.image_url,
                   job_id = EXCLUDED.job_id, slot = EXCLUDED.slot, promoted_at = EXCLUDED.promoted_at`,
    [
      record.signature,
      record.version,
      record.promptData,
      record.imageUrl ?? null,
      record.jobId ?? null,
      record.slot ?? null,
      record.promotedAt ?? null,
    ],
  );
};

export const getLatestTemplateVersion = async (signature: string) => {
  const result = await pool.query(
    `SELECT signature, version, prompt_data, image_url, job_id, slot, promoted_at
     FROM ${TEMPLATE_VERSIONS_TABLE}
     WHERE signature = $1
     ORDER BY version DESC
     LIMIT 1`,
    [signature],
  );
  return result.rows[0] ?? null;
};
