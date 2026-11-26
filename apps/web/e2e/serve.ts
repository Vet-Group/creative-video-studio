// The e2e server, started by playwright.config.ts: a fresh database (migrated, with one mock video model, one mock image model and the test accounts),
// the worker on the mock provider and the web app, all on this checkout's .env. It runs until Playwright stops it.
// Run it with: node --import tsx e2e/serve.ts   (from apps/web)
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@cvs/db/testing';
import { PASSWORD, USERS } from './users';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // No .env file; the settings come from the environment.
}

// CVS_E2E_DB lets a second checkout run its specs beside another's on the same Postgres, and on the same MinIO with a bucket of the same name.
const dbName = process.env.CVS_E2E_DB ?? 'cvs_e2e';
const db = await createTestDatabase(dbName);
process.env.DATABASE_URL = db.url;
process.env.S3_BUCKET = dbName.replaceAll('_', '-'); // bucket names take no underscores
process.env.CVS_MOCK_RUN_MS = '4000';
process.env.CVS_FAKE_SUGGEST = '1'; // the worker's suggestions come from a stand-in (apps/worker/src/suggest.ts), never fal
// The specs run with no social login (no login buttons), whatever the developer's .env holds, and with a known support email on /privacy.
// They never reach a paid provider either: without these keys the e2e worker has only the mock adapters.
// Empty, not deleted: scripts/next.ts and the worker's storage load .env, which fills in a missing variable but leaves a set one.
for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_TENANT_KEY', 'FAL_KEY', 'OPENAI_API_KEY', 'BYTEPLUS_ARK_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) process.env[name] = '';
process.env.CVS_SUPPORT_EMAIL = 'support@e2e.test';

const { auth, pool } = await import('../src/lib/auth');
// The specs expect no samples, as on CI's fresh MinIO, but the bucket outlives the database: a sample a run left behind (example-12.mp4 since
// 2026-11-13) added a tile to Create's Examples, so V01's last sample still had a Next. Like the database, every run starts empty.
const { deleteObject, ensureBucket } = await import('../src/lib/storage');
const { listSamples, SAMPLE_PREFIX } = await import('../src/lib/samples');
await ensureBucket();
for (const { name } of await listSamples()) await deleteObject(SAMPLE_PREFIX + name);
// Migration 0013 enables Kling; the specs run on the mock models only.
await pool.query(`update model_configs set enabled = false where id = 'kling-o3-pro'`);
await pool.query(`update model_configs set enabled = false where id in ('veo-3.1', 'veo-3.1-vertex')`); // migration 0075 enables them; the specs list only the models seeded here
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, pass_seed_passes, pass_seed_total)
   values ('mock-e2e', 'mock', 'mock', 'Mock E2E', '{9:16,1:1}', '{5,8}', 4, '720p', 0.1, '{}', true, 8, 10),
          -- Off: the Explore spec switches it on for itself, to pick a model that does not support the form's starting choice.
          ('mock-e2e-square', 'mock', 'mock', 'Mock E2E Square', '{1:1}', '{5}', 4, '720p', 0.1, '{}', false, 0, 0)`,
);
// The mock video model also runs Marketing Studio jobs.
await pool.query(`update model_configs set features = '{video,marketing}' where id = 'mock-e2e'`);
// A second marketing-only video model whose ratio and duration do not overlap with mock-e2e's, so the page must offer the union to let it be picked.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled, features)
   values ('mock-e2e-wide', 'mock', 'mock', 'Mock E2E Wide', '{16:9}', '{10}', 2, '720p', 0.1, '{}', true, '{marketing}')`,
);
// The first mock model keeps the default prompt limit (2000); the wide one takes 1000, so a switch to it can leave the text too long.
await pool.query(`update model_configs set max_prompt_chars = 1000 where id = 'mock-e2e-wide'`);
// Image models for the specs of Try On and Image Generation (the Create picker lists video models only): a roomy one for both features and a
// one-image model for the image page, so the model pill has a second choice.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
     ('mock-image-e2e', 'mock', 'mock', 'Mock image E2E', 'image', '{image,try_on,fashion_model}', '{auto,1:1,3:4}', '{}', 4, '{"1K": "0.1500", "2K": "0.3000"}', '{}', true),
     ('mock-image-solo', 'mock', 'mock', 'Mock image Solo', 'image', '{image}', '{auto}', '{}', 1, '{"1K": "0.1000"}', '{}', true)`,
);
await pool.query(`update model_configs set max_prompt_chars = 1000 where id = 'mock-image-solo'`); // a smaller limit for the image bar spec
// Nano Banana 2.1's levels and its fal 1K prices per level (a mock row shows them at 0; the thinking spec swaps in prices), for the thinking spec
await pool.query(
  `update model_configs set thinking_levels = '{minimal,medium,high}', thinking_prices = '{"minimal": {"1K": "0.04"}, "medium": {"1K": "0.0473"}, "high": {"1K": "0.0618"}}' where id = 'mock-image-solo'`,
);
// One image model for the seven image apps, which the Apps specs run; it takes up to two images and lists every app feature.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
     ('mock-apps-e2e', 'mock', 'mock', 'Mock apps E2E', 'image', '{character_swap,model_swap,background_changer,reframe,image_upscale,face_swap,background_remover}', '{auto,1:1,9:16}', '{}', 2,
      '{"1K": "0.0500", "2K": "0.0800", "4K": "0.0800"}', '{}', true),
     ('mock-jewelry-e2e', 'mock', 'mock', 'Mock jewelry E2E', 'image', '{jewelry_try_on}', '{auto}', '{}', 4, '{"1K": "0.0500"}', '{}', true),
     ('mock-lingerie-e2e', 'mock', 'mock', 'Mock lingerie E2E', 'image', '{lingerie_try_on}', '{auto,1:1}', '{}', 4, '{"1K": "0.0500", "2K": "0.0800"}', '{}', true),
     ('mock-angles-e2e', 'mock', 'mock', 'Mock angles E2E', 'image', '{multi_angle}', '{auto}', '{}', 1, '{"1K": "0.0350"}', '{}', true),
     ('mock-breeds-e2e', 'mock', 'mock', 'Mock breeds E2E', 'image', '{breed_swap}', '{auto}', '{}', 1, '{"1K": "0.0400"}', '{}', true),
     ('mock-pets-e2e', 'mock', 'mock', 'Mock pets E2E', 'image', '{pet_portrait,mockup_pack,name_swap,pose_generator,product_recolor,listing_set}', '{auto}', '{}', 2, '{"1K": "0.1500"}', '{}', true)`,
);
// A priced model for Upscale and Reframe (and one each for the multi-angle and breed swap apps, and one for the three pet apps, the pose generator, product recolor and the listing set), which an e2e page picks to see real prices, a model's own ratios (no `auto`) and resolutions. Its provider is `fal`
// so the page shows its prices (a mock model shows 0), and the e2e worker has no fal adapter: its jobs are posted and stored, then released. Never used by another spec.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, image_prices, sources, enabled) values
     ('mock-apps-priced', 'fal', 'fal-ai/e2e-priced', 'Mock apps priced', 'image', '{image_upscale,reframe}', '{1:1,16:9}', '{}', 1, '{"2K": "0.08", "4K": "0.08"}', '{}', true),
     ('mock-angles-priced', 'fal', 'fal-ai/e2e-angles-priced', 'Mock angles priced', 'image', '{multi_angle}', '{auto}', '{}', 1, '{"1K": "0.035"}', '{}', true),
     ('mock-breeds-priced', 'fal', 'fal-ai/e2e-breeds-priced', 'Mock breeds priced', 'image', '{breed_swap}', '{auto}', '{}', 1, '{"1K": "0.04"}', '{}', true),
     ('mock-pets-priced', 'fal', 'fal-ai/e2e-pets-priced', 'Mock pets priced', 'image', '{pet_portrait,mockup_pack,name_swap,pose_generator,product_recolor,listing_set}', '{auto}', '{}', 2, '{"1K": "0.15"}', '{}', true)`,
);
// The two models of the hook effects app, on the mock provider (the worker picks the adapter by provider) with the real endpoints it holds each effect to (POST /api/jobs, GET /api/models).
// A mock job books 0 USD, so the page shows $0; the real rows' prices are checked in api/jobs/hook-effect.test.ts.
await pool.query(
  `insert into model_configs (id, provider, endpoint, label, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second, sources, enabled) values
     ('mock-hook-i2v-e2e', 'mock', 'minimax/h3-max-turbo/image-to-video', 'Mock hook I2V E2E', 'video', '{hook_effect}', '{9:16}', '{5}', 1, '720p', 0.025, '{}', true),
     ('mock-hook-reveal-e2e', 'mock', 'minimax/h3-max/reference-to-video', 'Mock hook reveal E2E', 'video', '{hook_effect}', '{9:16}', '{5}', 1, '720p', 0.05, '{}', true)`,
);
// A store the Create picker offers, for the specs that tag a clip with one.
await pool.query(`insert into stores (id, name, code, workspace_id) values ('store-e2e', 'E2E Shop', 'E2E-SEED', 'ws_vet')`);
// A store whose brand kit store-brand.e2e fills, so no other spec's store gets one.
await pool.query(`insert into stores (id, name, code, workspace_id) values ('store-brand', 'E2E Brand Shop', 'E2E-BRAND', 'ws_vet')`);
// Every spec runs jobs; the daily clip cap is not what is under test here.
await pool.query('update settings set member_daily_clip_cap = 1000 where id = 1');
// Straight through better-auth, not POST /api/admin/users, so must_change_password stays false and the specs sign in to the app itself.
for (const u of Object.values(USERS)) await auth.api.createUser({ body: { email: u.email, name: u.name, password: PASSWORD, role: u.role, data: { emailVerified: true } } });
// Those joined ws_vet through the test database's trigger, as migration 0108 files existing users; from here only the app's own paths (Admin > Users) add a membership.
await pool.query('drop trigger test_company_member on users');
// An Admin made these members template editors (Admin > Users), for preset-edit.e2e, store-brand.e2e and choices-store.e2e.
await pool.query('update users set can_edit_templates = true where email = any($1)', [[USERS.tpled.email, USERS.branded.email, USERS.chsed.email, USERS.pbared.email]]);
// The developer Admin of impersonation.e2e, as an existing developer Admin would have made them (the migration grants the flag to no one).
await pool.query('update users set can_impersonate = true where email = $1', [USERS.impdev.email]);
// The test account of library.e2e's system accounts test, as an Admin marks one on Admin > Users.
await pool.query('update users set system = true where email = $1', [USERS.syslib.email]);
// The satisfaction prompt asks after three succeeded real jobs (mock jobs never count and the specs run on the mock provider), so rating.e2e's members get them
// seeded here, dated long ago so no page's "today" figure or weekly report moves.
await pool.query(
  `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids, feature, status, created_at, workspace_id)
   select 'rating-seed-' || u.id || '-' || n, u.id, u.team_id, 'mock-image-e2e', 'mock', 'seed', '1:1', 5, '{}', 'image', 'succeeded', '2026-01-02T00:00:00Z', 'ws_vet'
     from users u cross join generate_series(1, 3) n where u.email = any($1)`,
  [[USERS.ratea.email, USERS.rateb.email, USERS.ratec.email]],
);
await pool.end();

// CVS_E2E_BUILD=1 serves a production build instead of `next dev`, so no route compiles while a spec waits on it.
const built = process.env.CVS_E2E_BUILD === '1';
if (built) {
  const b = spawnSync(process.execPath, [createRequire(import.meta.url).resolve('next/dist/bin/next'), 'build'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const children: ChildProcess[] = [
  spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: fileURLToPath(new URL('../../worker', import.meta.url)), stdio: 'inherit' }),
  spawn(process.execPath, ['scripts/next.ts', built ? 'start' : 'dev'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${fileURLToPath(new URL('keep-alive.cjs', import.meta.url)).replaceAll('\\', '/')}`.trim() },
  }),
];
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
for (const c of children) c.on('exit', (code) => process.exit(code ?? 1));
