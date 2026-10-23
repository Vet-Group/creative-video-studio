import { accounts, sessions, users, verifications } from '@cvs/db';
import { createDb, createPool, databaseUrl } from '@cvs/db/client';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { accountAuditHooks } from './account-audit';
import { larkOAuth } from './lark';

// One pool per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsPool?: ReturnType<typeof createPool> };
export const pool = (g.cvsPool ??= createPool(databaseUrl()));

// A login button shows only when its provider is wired here and its own values are set. The LARK_* variables alone also serve notifications.
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LARK_APP_ID, LARK_APP_SECRET, LARK_TENANT_KEY } = process.env;
export const googleLoginEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const larkLoginEnabled = Boolean(LARK_APP_ID && LARK_APP_SECRET && LARK_TENANT_KEY);

export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  telemetry: { enabled: false },
  database: drizzleAdapter(createDb(pool), { provider: 'pg', usePlural: true, schema: { users, sessions, accounts, verifications } }),
  // No public sign-up: an Admin creates every account (Q4).
  emailAndPassword: { enabled: true, disableSignUp: true },
  // disableSignUp, not disableImplicitSignUp: a client bypasses the latter with requestSignUp: true. A social sign-in only ever
  // enters an existing, unbanned user, whose email the provider reports; it never creates one.
  socialProviders: googleLoginEnabled
    ? { google: { clientId: GOOGLE_CLIENT_ID!, clientSecret: GOOGLE_CLIENT_SECRET!, disableDefaultScope: true, scope: ['openid', 'email', 'profile'], disableSignUp: true } }
    : {},
  account: {
    // Google stays untrusted, so better-auth links it only when Google reports email_verified. Lark is trusted: its identity is gated by
    // tenant_key and enterprise_email (lib/lark.ts). allowDifferentEmails applies to the signed-in linkSocial path only; a first
    // sign-in always links by equal email. The default requireLocalEmailVerified stays on, which is why an Admin-created user is verified.
    accountLinking: { enabled: true, trustedProviders: ['lark'], allowDifferentEmails: true, allowUnlinkingAll: false },
  },
  databaseHooks: { account: accountAuditHooks(pool) },
  // The team is changed only by an Admin, so input: false keeps /api/auth/update-user from setting it. The column default is the seeded team.
  user: { additionalFields: { teamId: { type: 'string', required: false, input: false } } },
  plugins: [
    admin({
      // Q4 roles: member has the plugin's plain user rights, admin manages users.
      roles: { admin: adminAc, member: userAc },
      defaultRole: 'member',
      adminRoles: ['admin'],
    }),
    genericOAuth({ config: larkLoginEnabled ? [larkOAuth({ appId: LARK_APP_ID!, appSecret: LARK_APP_SECRET!, tenantKey: LARK_TENANT_KEY! })] : [] }),
  ],
});

export type Session = typeof auth.$Infer.Session;
