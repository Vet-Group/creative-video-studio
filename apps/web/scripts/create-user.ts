// CVS_NEW_PASSWORD=… [CVS_NEW_TEAM=<team id>] pnpm --filter @cvs/web auth:create-user --email <e> --name <n> [--role admin|member]
// Bootstraps the first Admin (sign-up is disabled). The password comes from the environment, not an argument,
// so it never lands in shell history. The team defaults to the seeded "unassigned" team.
import { parseArgs } from 'node:util';
import { auth, pool } from '../src/lib/auth';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'member' } } });
const password = process.env.CVS_NEW_PASSWORD;
const teamId = process.env.CVS_NEW_TEAM || undefined;
const role = values.role;
if (!values.email || !values.name || !password || (role !== 'admin' && role !== 'member')) {
  console.error('usage: CVS_NEW_PASSWORD=… [CVS_NEW_TEAM=<team id>] pnpm --filter @cvs/web auth:create-user --email <e> --name <n> [--role admin|member]');
  process.exit(2);
}
try {
  const { user } = await auth.api.createUser({ body: { email: values.email, name: values.name, password, role, data: { emailVerified: true, ...(teamId ? { teamId } : {}) } } });
  console.log(`created ${user.id} (${role}, team ${(user as typeof user & { teamId: string }).teamId})`);
} finally {
  await pool.end();
}
