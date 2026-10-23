// The e2e server, started by playwright.config.ts: a fresh database (migrated, with one mock video model, one mock image model and the test accounts),
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
// The specs run with no social login (no login buttons), whatever the developer's .env holds, and with a known support email on /privacy.
for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_TENANT_KEY']) delete process.env[name];
process.env.CVS_SUPPORT_EMAIL = 'support@e2e.test';

const { auth, pool } = await import('../src/lib/auth');
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, pass_seed_passes, pass_seed_total)
   values ('mock-e2e', 'mock', 'mock', 'Mock E2E', '{9:16,1:1}', '{5,8}', 4, '720p', 0.1, '{}', true, 8, 10),
          -- Off: the Explore spec switches it on for itself, to pick a model that does not support the form's starting choice.
          ('mock-e2e-square', 'mock', 'mock', 'Mock E2E Square', '{1:1}', '{5}', 4, '720p', 0.1, '{}', false, 0, 0)`,
);
// Image models for the specs of Try On and Image Generation (the Create picker lists video models only): a roomy one for both features and a
// one-image model for the image page, so the model pill has a second choice.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
     ('mock-image-e2e', 'mock', 'mock', 'Mock image E2E', 'image', '{image,try_on}', '{auto,1:1,3:4}', '{}', 4, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true),
     ('mock-image-solo', 'mock', 'mock', 'Mock image Solo', 'image', '{image}', '{auto}', '{}', 1, '{"1K": "0.1000"}', '{}', true)`,
);
// One image model for the seven image apps, which the Apps specs run; it takes up to two images and lists every app feature.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
     ('mock-apps-e2e', 'mock', 'mock', 'Mock apps E2E', 'image', '{character_swap,model_swap,background_changer,reframe,image_upscale,face_swap,background_remover}', '{auto,1:1,9:16}', '{}', 2,
      '{"1K": "0.0500", "2K": "0.0800", "4K": "0.0800"}', '{}', true)`,
);
// A store the Create picker offers, for the specs that tag a clip with one.
await pool.query(`insert into stores (id, name, code) values ('store-e2e', 'E2E Shop', 'E2E-SEED')`);
// Every spec runs jobs; the daily clip cap is not what is under test here.
await pool.query('update settings set member_daily_clip_cap = 1000 where id = 1');
for (const u of Object.values(USERS)) await auth.api.createUser({ body: { email: u.email, name: u.name, password: PASSWORD, role: u.role, data: { emailVerified: true } } });
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
