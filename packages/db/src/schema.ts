import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const ROLES = ['member', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ASSET_KINDS = ['input', 'output'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

const tstz = (name: string) => timestamp(name, { withTimezone: true });

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
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
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
