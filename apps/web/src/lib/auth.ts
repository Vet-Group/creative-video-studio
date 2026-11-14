import { passkey } from '@better-auth/passkey';
import { accounts, passkeys, sessions, twoFactors, users, verifications } from '@cvs/db';
import { createDb, createPool, databaseUrl } from '@cvs/db/client';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin, lastLoginMethod, twoFactor } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { accountAuditHooks, authAuditHook } from './account-audit';
import { larkOAuth, refuseLikelyDuplicate } from './lark';

// One pool per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsPool?: ReturnType<typeof createPool> };
export const pool = (g.cvsPool ??= createPool(databaseUrl()));

// A login button shows only when its provider is wired here and its own values are set. The LARK_* variables alone also serve notifications.
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LARK_APP_ID, LARK_APP_SECRET, LARK_TENANT_KEY } = process.env;
export const googleLoginEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const larkLoginEnabled = Boolean(LARK_APP_ID && LARK_APP_SECRET && LARK_TENANT_KEY);

/** The auth endpoints a session with mustChangePassword may not call. In 1.7.7 Lark links through /link-social too; there is no /oauth2/link. */
const FORCED_CHANGE_CLOSED = new Set([
  '/link-social',
  '/unlink-account',
  '/update-user',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
]);

export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  telemetry: { enabled: false },
  database: drizzleAdapter(createDb(pool), { provider: 'pg', usePlural: true, schema: { users, sessions, accounts, verifications, passkeys, twoFactors } }),
  // Production is reached only through the Cloudflare tunnel (lan-guard keeps port 3400 off the LAN), and Cloudflare sets this header to the one
  // client address. The default x-forwarded-for takes what a client sends, and a forged one sends every sign-in to one shared limiter bucket.
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
  // Each passkey options request stores a challenge row, and the login page asks for one on every visit; the office shares one address.
  // A loose per-address cap on the 2FA code checks, as the office shares one address; the real guard is the plugin's 5 tries per challenge
  // and its 15-minute lock after 10 failures in a row on one account.
  rateLimit: {
    customRules: {
      '/passkey/generate-authenticate-options': { window: 60, max: 30 },
      '/two-factor/verify-totp': { window: 60, max: 30 },
      '/two-factor/verify-backup-code': { window: 60, max: 30 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = ctx.body as { currentPassword?: unknown; newPassword?: unknown; revokeOtherSessions?: unknown } | undefined;
      if (ctx.path === '/change-password') {
        // A temporary password from an Admin must really be replaced, and every session it opened must end with it.
        if (typeof body?.newPassword === 'string' && body.newPassword === body.currentPassword) {
          throw new APIError('BAD_REQUEST', { message: 'The new password must differ from the current one', code: 'PASSWORD_UNCHANGED' });
        }
        if (body?.revokeOtherSessions !== true) throw new APIError('BAD_REQUEST', { message: 'A password change signs the other sessions out', code: 'REVOKE_REQUIRED' });
      }
      // Until the temporary password is replaced, its holder may not add, keep or manage another way in, which would outlive the change.
      // A denylist, so the Google and Lark sign-in callbacks still run. The 2FA step of a sign-in has no session yet, so it is never refused here.
      if ((FORCED_CHANGE_CLOSED.has(ctx.path) || ctx.path.startsWith('/two-factor/')) && (await getSessionFromCtx(ctx))?.user.mustChangePassword) {
        throw new APIError('FORBIDDEN', { message: 'Change the temporary password first', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
    }),
    after: authAuditHook(pool),
  },
  // No public email/password sign-up: an Admin creates every password account (Q4).
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Google keeps disableSignUp: it is not tenant-gated, so it only ever enters an existing, unbanned user and never creates one.
  // Lark is different: it auto-provisions internal staff (lib/lark.ts), safe because getUserInfo gates on the company tenant.
  socialProviders: googleLoginEnabled
    ? { google: { clientId: GOOGLE_CLIENT_ID!, clientSecret: GOOGLE_CLIENT_SECRET!, disableDefaultScope: true, scope: ['openid', 'email', 'profile'], disableSignUp: true, disableIdTokenSignIn: true } }
    : {},
  account: {
    // Google stays untrusted, so better-auth links it only when Google reports email_verified. Lark is trusted: its identity is gated by
    // tenant_key and enterprise_email (lib/lark.ts). allowDifferentEmails applies to the signed-in linkSocial path only; a first
    // sign-in always links by equal email. The default requireLocalEmailVerified stays on, which is why an Admin-created user is verified.
    accountLinking: { enabled: true, trustedProviders: ['lark'], allowDifferentEmails: true, allowUnlinkingAll: false },
  },
  // user.create.before refuses a Lark auto-provision that would duplicate a staff member who has an account under another email (lib/lark.ts).
  databaseHooks: { account: accountAuditHooks(pool), user: { create: { before: refuseLikelyDuplicate(pool) } } },
  // The team is changed only by an Admin, so input: false keeps /api/auth/update-user from setting it. The column default is the seeded team.
  // mustChangePassword is set with an Admin's temporary password and cleared by /change-password (account-audit.ts); no client sets it.
  // canEditTemplates (template editor, lib/session.ts), system (an automation account) and outsideLark (not in the company's Lark organisation) are set by an Admin only (PATCH /api/admin/users/[id]).
  user: {
    additionalFields: {
      teamId: { type: 'string', required: false, input: false },
      mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      canEditTemplates: { type: 'boolean', required: false, defaultValue: false, input: false },
      system: { type: 'boolean', required: false, defaultValue: false, input: false },
      outsideLark: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  plugins: [
    admin({
      // Q4 roles: member has the plugin's plain user rights, admin manages users.
      roles: { admin: adminAc, member: userAc },
      defaultRole: 'member',
      adminRoles: ['admin'],
    }),
    genericOAuth({ config: larkLoginEnabled ? [larkOAuth({ appId: LARK_APP_ID!, appSecret: LARK_APP_SECRET!, tenantKey: LARK_TENANT_KEY! })] : [] }),
    // Adding a passkey needs a fresh session of an existing user; signing in with one never creates a user. rpID is APP_URL's host.
    passkey({
      rpName: 'Creative Video Studio',
      origin: process.env.APP_URL,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      // Since 1.7.18 the plugin demands the PIN or biometric itself (userVerification 'required' above); this is a second check, so a found security key alone signs no one in.
      authentication: {
        afterVerification: ({ ctx, verification, clientData }) => {
          if (verification.authenticationInfo.userVerified) return;
          // The plugin logs nothing for a refusal raised here. The credential id is public and finds the passkeys row.
          ctx.context.logger.error('Passkey sign-in refused: USER_NOT_VERIFIED, the authenticator did not check a PIN or biometric', { credentialId: clientData.id });
          throw new APIError('UNAUTHORIZED', { message: 'User verification required', code: 'USER_NOT_VERIFIED' });
        },
      },
    }),
    // Optional TOTP, asked only at email+password sign-in: the plugin's sign-in hook matches /sign-in/email, never OAuth or passkey sign-ins.
    // Turning it on, getting new backup codes and turning it off all need the password; a user without one cannot turn it on.
    twoFactor({ issuer: 'VET Creative Video Studio' }),
    // A cookie only (email, google, lark or passkey), so the login page can mark the method this browser used last.
    lastLoginMethod(),
  ],
});

export type Session = typeof auth.$Infer.Session;
