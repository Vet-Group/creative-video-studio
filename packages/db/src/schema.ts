import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const ROLES = ['member', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ASSET_KINDS = ['input', 'output'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const JOB_STATUSES = ['queued', 'submitting', 'running', 'succeeded', 'failed', 'failed_unknown', 'timed_out'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ASPECTS = ['9:16', '1:1'] as const;
export const PROVIDERS = ['fal', 'replicate', 'mock'] as const;
/** What a job is for. `video` and `marketing` spend the company video budget; the rest share the image and apps budget (FEATURE_BUDGET). */
export const FEATURES = [
  'video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap',
  'background_remover', 'motion_control', 'media_optimizer',
] as const;
/** The features under settings.features_monthly_cap_usd and the per-member USD caps. */
export const FEATURE_BUDGET = FEATURES.filter((f) => f !== 'video' && f !== 'marketing');
export const COST_KINDS = ['estimate', 'actual_adjustment', 'release', 'late_bill', 'bakeoff', 'manual_adjustment', 'invoice_diff', 'store_reassign'] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const VERDICTS = ['pass', 'fail'] as const;

/** The id of the "unassigned" team that migration 0002 seeds; users.team_id defaults to it. */
export const DEFAULT_TEAM_ID = 'team-unassigned';

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  costCentreCode: text('cost_centre_code'),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

// The code equals POD Studio's store_id.
export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

// Property names follow better-auth's models; apps/web/src/lib/auth.ts maps its drizzle adapter onto these tables.
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ROLES }).notNull().default('member'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: tstz('ban_expires'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    teamId: text('team_id')
      .notNull()
      .default(DEFAULT_TEAM_ID)
      .references(() => teams.id, { onDelete: 'restrict' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    index('users_team_id_idx').on(t.teamId),
    check('users_role_check', sql`${t.role} in ('member', 'admin')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tstz('access_token_expires_at'),
    refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// An uploaded input image or a generated output clip; the bytes live in MinIO under s3Key.
export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ASSET_KINDS }).notNull(),
    s3Key: text('s3_key').notNull().unique(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    index('assets_owner_id_idx').on(t.ownerId),
    check('assets_kind_check', sql`${t.kind} in ('input', 'output')`),
  ],
);

export const presets = pgTable('presets', {
  id: text('id').primaryKey(),
  /** Vietnamese UI label. */
  label: text('label').notNull(),
  /** English prompt sent to the video model. */
  prompt: text('prompt').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  isBakeoffSafe: boolean('is_bakeoff_safe').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

// The limits and price are NULL (or empty) until B.1 records them from the provider schema; such a model cannot be enabled.
export const modelConfigs = pgTable(
  'model_configs',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: PROVIDERS }).notNull(),
    /** The provider's model path. */
    endpoint: text('endpoint').notNull(),
    label: text('label').notNull(),
    ratios: text('ratios').array().notNull(),
    durationsSec: integer('durations_sec').array().notNull(),
    maxImages: integer('max_images'),
    outputResolution: text('output_resolution'),
    usdPerSecond: numeric('usd_per_second', { precision: 10, scale: 4 }),
    billedAmountField: text('billed_amount_field'),
    /** Where each fact was read: field name to { url, readAt }. */
    sources: jsonb('sources').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    passSeedPasses: integer('pass_seed_passes'),
    passSeedTotal: integer('pass_seed_total'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('model_configs_provider_check', sql`${t.provider} in ('fal', 'replicate', 'mock')`),
    check(
      'model_configs_enabled_complete_check',
      sql`not ${t.enabled} or (${t.usdPerSecond} is not null and ${t.maxImages} is not null and ${t.outputResolution} is not null and cardinality(${t.ratios}) > 0 and cardinality(${t.durationsSec}) > 0)`,
    ),
  ],
);

// One row (id = 1): the Admin-editable caps.
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    monthlyCapUsd: numeric('monthly_cap_usd', { precision: 12, scale: 4 }).notNull().default('200'),
    memberDailyClipCap: integer('member_daily_clip_cap').notNull().default(5),
    /** Hard caps on the image and apps features (FEATURE_BUDGET): the month for all members, and each member's ICT day and month. */
    featuresMonthlyCapUsd: numeric('features_monthly_cap_usd', { precision: 12, scale: 4 }).notNull().default('260'),
    memberDailyUsdCap: numeric('member_daily_usd_cap', { precision: 12, scale: 4 }).notNull().default('10'),
    memberMonthlyUsdCap: numeric('member_monthly_usd_cap', { precision: 12, scale: 4 }).notNull().default('50'),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('settings_singleton_check', sql`${t.id} = 1`)],
);

// Job rows are tombstones once purged (purged_at); they are never deleted, because the cost ledger points at them.
// There are no money columns: cost lives only in cost_entries.
export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The user's team at Run; it never changes afterwards. */
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    storeId: text('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    retryOf: text('retry_of').references((): AnyPgColumn => jobs.id, { onDelete: 'restrict' }),
    feature: text('feature', { enum: FEATURES }).notNull().default('video'),
    model: text('model')
      .notNull()
      .references(() => modelConfigs.id, { onDelete: 'restrict' }),
    provider: text('provider', { enum: PROVIDERS }).notNull(),
    presetId: text('preset_id').references(() => presets.id, { onDelete: 'restrict' }),
    prompt: text('prompt').notNull(),
    aspect: text('aspect', { enum: ASPECTS }).notNull(),
    durationS: integer('duration_s').notNull(),
    inputAssetIds: text('input_asset_ids').array().notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
    providerJobId: text('provider_job_id'),
    /** The worker instance that moved the job from queued to submitting. */
    claimedBy: text('claimed_by'),
    error: text('error'),
    isMock: boolean('is_mock').notNull().default(false),
    outputAssetId: text('output_asset_id').references(() => assets.id, { onDelete: 'restrict' }),
    posterAssetId: text('poster_asset_id').references(() => assets.id, { onDelete: 'restrict' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    /** When the job entered running; queue wait does not count. */
    startedAt: tstz('started_at'),
    finishedAt: tstz('finished_at'),
    deletedAt: tstz('deleted_at'),
    purgedAt: tstz('purged_at'),
  },
  (t) => [
    index('jobs_user_id_created_at_idx').on(t.userId, t.createdAt),
    index('jobs_status_idx').on(t.status),
    check('jobs_status_check', sql`${t.status} in ('queued', 'submitting', 'running', 'succeeded', 'failed', 'failed_unknown', 'timed_out')`),
    check('jobs_aspect_check', sql`${t.aspect} in ('9:16', '1:1')`),
    check('jobs_provider_check', sql`${t.provider} in ('fal', 'replicate', 'mock')`),
    check('jobs_feature_check', sql`${t.feature} in ('video', 'marketing', 'try_on', 'image', 'character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover', 'motion_control', 'media_optimizer')`),
  ],
);

// Soft monthly caps per feature: crossing 80% or 100% only warns the Admin; Runs are never refused by these.
export const featureCaps = pgTable('feature_caps', {
  feature: text('feature', { enum: FEATURES }).primaryKey(),
  monthlyUsd: numeric('monthly_usd', { precision: 12, scale: 4 }).notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

// The cost ledger. Append-only: a trigger (migration 0002) raises on UPDATE, DELETE and TRUNCATE. All writes go through
// packages/core/src/ledger.ts; the view job_costs sums a job's rows.
export const costEntries = pgTable(
  'cost_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind', { enum: COST_KINDS }).notNull(),
    usd: numeric('usd', { precision: 12, scale: 4 }).notNull(),
    /** ICT month 'YYYY-MM': the job's Run month, or the explicit month of a shared row. */
    month: text('month').notNull(),
    /** ICT date of the job's Run; null on shared rows. */
    day: date('day', { mode: 'string' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'restrict' }),
    teamId: text('team_id').references(() => teams.id, { onDelete: 'restrict' }),
    storeId: text('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
    provider: text('provider'),
    model: text('model'),
    /** True on the row that closes the job; shared rows are always final. */
    isFinal: boolean('is_final').notNull().default(false),
    ref: text('ref').unique(),
    note: text('note'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cost_entries_month_idx').on(t.month),
    index('cost_entries_job_id_idx').on(t.jobId),
    index('cost_entries_team_id_month_idx').on(t.teamId, t.month),
    uniqueIndex('cost_entries_job_kind_once_idx')
      .on(t.jobId, t.kind)
      .where(sql`${t.kind} in ('estimate', 'actual_adjustment', 'release', 'late_bill')`),
    check(
      'cost_entries_kind_check',
      sql`${t.kind} in ('estimate', 'actual_adjustment', 'release', 'late_bill', 'bakeoff', 'manual_adjustment', 'invoice_diff', 'store_reassign')`,
    ),
    check('cost_entries_job_shared_check', sql`(${t.jobId} is null) = (${t.kind} in ('bakeoff', 'manual_adjustment', 'invoice_diff'))`),
    check('cost_entries_manual_note_check', sql`${t.kind} <> 'manual_adjustment' or coalesce(length(trim(${t.note})), 0) > 0`),
    check('cost_entries_month_check', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check('cost_entries_shared_unattributed_check', sql`${t.jobId} is not null or (${t.userId} is null and ${t.teamId} is null and ${t.storeId} is null)`),
    check('cost_entries_day_check', sql`${t.jobId} is null or ${t.day} is not null`),
  ],
);

// Pass or Fail per job's clip. It is keyed by job so it survives a purge, which nulls output_asset_id.
export const verdicts = pgTable(
  'verdicts',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    outputAssetId: text('output_asset_id')
      .unique()
      .references(() => assets.id, { onDelete: 'restrict' }),
    verdict: text('verdict', { enum: VERDICTS }).notNull(),
    /** Required for a Fail. */
    fault: text('fault'),
    markedBy: text('marked_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('verdicts_verdict_check', sql`${t.verdict} in ('pass', 'fail')`),
    check('verdicts_fault_check', sql`${t.verdict} <> 'fail' or ${t.fault} is not null`),
  ],
);

// Who did what to whom: an Admin deleting another user's clip, any Pass/Fail edit, and the Admin changes of M.5.
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The event type, for example 'verdict.set' or 'clip.delete'. */
    action: text('action').notNull(),
    /** What the action touched, as 'kind:id' (for example 'job:<id>'). */
    target: text('target').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_entries_created_at_idx').on(t.createdAt), index('audit_entries_target_idx').on(t.target)],
);

// One row per worker instance; the UI shows "worker offline" after 60 s without a beat.
export const workerHeartbeat = pgTable('worker_heartbeat', {
  workerId: text('worker_id').primaryKey(),
  beatAt: tstz('beat_at').notNull().defaultNow(),
});

export const monthlyRates = pgTable(
  'monthly_rates',
  {
    /** ICT month 'YYYY-MM'. */
    month: text('month').primaryKey(),
    vndPerUsd: numeric('vnd_per_usd', { precision: 14, scale: 4 }).notNull(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('monthly_rates_rate_check', sql`${t.vndPerUsd} > 0`)],
);

// The provider's real invoice total for a month; the difference to the ledger is booked as an invoice_diff row.
export const providerInvoices = pgTable(
  'provider_invoices',
  {
    month: text('month').notNull(),
    provider: text('provider').notNull(),
    totalUsd: numeric('total_usd', { precision: 12, scale: 4 }).notNull(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.month, t.provider] })],
);
