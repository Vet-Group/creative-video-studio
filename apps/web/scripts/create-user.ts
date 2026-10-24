// CVS_NEW_PASSWORD=… [CVS_NEW_TEAM=<team id>] pnpm --filter @cvs/web auth:create-user --email <e> --name <n> [--role admin|member]
// pnpm --filter @cvs/web auth:create-user --first-admin   (install.sh, plan D.5: the Admin from CVS_ADMIN_EMAIL / CVS_ADMIN_PASSWORD)
// Bootstraps the first Admin (sign-up is disabled). The password comes from the environment, not an argument,
// so it never lands in shell history. The team defaults to the seeded "unassigned" team.
import { parseArgs } from 'node:util';
import { auth, pool } from '../src/lib/auth';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'member' }, 'first-admin': { type: 'boolean', default: false } },
});
const first = values['first-admin'];
const email = first ? process.env.CVS_ADMIN_EMAIL : values.email;
const name = first ? 'Admin' : values.name;
const role = first ? 'admin' : values.role;
const password = first ? process.env.CVS_ADMIN_PASSWORD : process.env.CVS_NEW_PASSWORD;
const teamId = process.env.CVS_NEW_TEAM || undefined;
if (!email || !name || !password || (role !== 'admin' && role !== 'member')) {
  console.error('usage: CVS_NEW_PASSWORD=… [CVS_NEW_TEAM=<team id>] pnpm --filter @cvs/web auth:create-user --email <e> --name <n> [--role admin|member]');
  console.error('   or: CVS_ADMIN_EMAIL=… CVS_ADMIN_PASSWORD=… pnpm --filter @cvs/web auth:create-user --first-admin');
  process.exit(2);
}
try {
  // --first-admin runs on every install, so an email that already has an account is left as it is.
  if (first && (await pool.query('select 1 from users where lower(email) = lower($1)', [email])).rowCount) {
    console.log(`${email} already has an account; nothing changed`);
  } else {
    const { user } = await auth.api.createUser({ body: { email, name, password, role, data: { emailVerified: true, ...(teamId ? { teamId } : {}) } } });
    console.log(`created ${user.id} (${role}, team ${(user as typeof user & { teamId: string }).teamId})`);
  }
} finally {
  await pool.end();
}
