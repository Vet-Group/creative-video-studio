import { accounts, sessions, users, verifications } from '@cvs/db';
import { createDb, createPool, databaseUrl } from '@cvs/db/client';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';

// One pool per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsPool?: ReturnType<typeof createPool> };
export const pool = (g.cvsPool ??= createPool(databaseUrl()));

export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  telemetry: { enabled: false },
  database: drizzleAdapter(createDb(pool), { provider: 'pg', usePlural: true, schema: { users, sessions, accounts, verifications } }),
  // No public sign-up: an Admin creates every account (Q4).
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [
    admin({
      // Q4 roles: member has the plugin's plain user rights, admin manages users.
      roles: { admin: adminAc, member: userAc },
      defaultRole: 'member',
      adminRoles: ['admin'],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
