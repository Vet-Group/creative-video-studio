// The e2e server, started by playwright.config.ts: a fresh database (migrated, with one mock model and the test accounts),
// the worker on the mock provider and the web app, all on this checkout's .env. It runs until Playwright stops it.
// Run it with: node --import tsx e2e/serve.ts   (from apps/web)
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@cvs/db/testing';
import { PASSWORD, USERS } from './users';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // No .env file; the settings come from the environment.
}

const db = await createTestDatabase('cvs_e2e');
process.env.DATABASE_URL = db.url;
process.env.S3_BUCKET = 'cvs-e2e';
process.env.CVS_MOCK_RUN_MS = '4000';
// The login page shows the Lark button only when Lark is configured; the specs assert it is absent.
process.env.LARK_APP_ID = '';
process.env.LARK_APP_SECRET = '';

const { auth, pool } = await import('../src/lib/auth');
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, pass_seed_passes, pass_seed_total)
   values ('mock-e2e', 'mock', 'mock', 'Mock E2E', '{9:16,1:1}', '{5,8}', 4, '720p', 0.1, '{}', true, 8, 10)`,
);
// Every spec runs jobs; the daily clip cap is not what is under test here.
await pool.query('update settings set member_daily_clip_cap = 1000 where id = 1');
for (const u of Object.values(USERS)) await auth.api.createUser({ body: { email: u.email, name: u.name, password: PASSWORD, role: u.role } });
await pool.end();

const children: ChildProcess[] = [
  spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: fileURLToPath(new URL('../../worker', import.meta.url)), stdio: 'inherit' }),
  spawn(process.execPath, ['scripts/next.ts', 'dev'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' }),
];
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
for (const c of children) c.on('exit', (code) => process.exit(code ?? 1));
