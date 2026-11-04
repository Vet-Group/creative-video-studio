// Integration test of migration 0002 on a disposable database (needs the compose Postgres: `pnpm services:up`).
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AUDIO_USD_PER_SECOND, BAKEOFF_MODELS } from '../../core/src/models';
import { tokenCost } from '../../core/src/providers/byteplus';
import { VIDEO_BODIES } from '../../core/src/providers/fal';
import { PRESETS } from '../../core/src/presets';
import { createTestDatabase } from './testing';

const testDb = await createTestDatabase();
const pool = new pg.Pool({ connectionString: testDb.url, max: 2 });

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

let seq = 0;
const next = () => `t${++seq}`;

async function insertUser(): Promise<string> {
  const id = next();
  await pool.query(`insert into users (id, email, name) values ($1, $2, $1)`, [id, `${id}@example.test`]);
  return id;
}

async function insertJob(userId: string): Promise<string> {
  const id = next();
  await pool.query(
    `insert into jobs (id, user_id, team_id, model, provider, prompt, aspect, duration_s, input_asset_ids)
     values ($1, $2, 'team-unassigned', 'kling-o3-pro', 'fal', 'p', '9:16', 5, '{}')`,
    [id, userId],
  );
  return id;
}

const entry = (kind: string, jobId: string | null, usd: string, extra: Record<string, unknown> = {}) =>
  pool.query(
    `insert into cost_entries (kind, usd, month, day, job_id, is_final, ref, note) values ($1, $2, '2026-10', $3, $4, $5, $6, $7)`,
    [kind, usd, jobId ? '2026-10-23' : null, jobId, extra.isFinal ?? false, extra.ref ?? null, extra.note ?? null],
  );

let userId = '';
beforeAll(async () => {
  userId = await insertUser();
});

describe('migration 0002 seed data', () => {
  test('seeds the unassigned team, which a new user joins by default', async () => {
    const { rows } = await pool.query(`select name, (select team_id from users where id = $1) as user_team from teams where id = 'team-unassigned'`, [userId]);
    expect(rows).toEqual([{ name: 'Chưa phân team', user_team: 'team-unassigned' }]);
  });

  test('rejects a user whose team does not exist', async () => {
    await expect(pool.query(`insert into users (id, email, name, team_id) values ('x', 'x@example.test', 'x', 'nope')`)).rejects.toThrow(/users_team_id_teams_id_fk/);
  });

  test('seeds the six presets from packages/core/src/presets.ts, the safe one flagged once', async () => {
    const { rows } = await pool.query(`select id, label, prompt, is_bakeoff_safe as "isBakeoffSafe" from presets where sort_order < 10 order by sort_order`);
    expect(rows).toEqual(PRESETS.map((p) => ({ id: p.id, label: p.label, prompt: p.prompt, isBakeoffSafe: p.isBakeoffSafe })));
    expect((await pool.query('select id from presets where is_bakeoff_safe')).rows).toHaveLength(1);
  });

  test('migration 0020 adds the 19 motion templates after the company presets, enabled, not bake-off safe, with ASCII prompts that keep the person and outfit', async () => {
    const { rows } = await pool.query(`select id, label, prompt, enabled, is_bakeoff_safe as safe, sort_order as sort from presets where sort_order >= 10 order by sort_order`);
    expect(rows).toHaveLength(19);
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual(['shoulder-sequence', 'turn-around']);
    expect(rows.at(-1)).toMatchObject({ id: 'golden-hour-wall', sort: 28 });
    for (const r of rows) {
      expect(r).toMatchObject({ enabled: true, safe: false });
      expect(r.prompt).toMatch(/^[ -~]+$/);
      expect(r.prompt).toContain('Keep the person, their face, the outfit');
    }
  });

  test('migration 0024 gives the motion templates Vietnamese labels, as the company presets have', async () => {
    const { rows } = await pool.query(`select id, label from presets where sort_order >= 10 order by sort_order`);
    expect(rows.at(0)).toEqual({ id: 'shoulder-sequence', label: 'Cận vai rồi toàn thân' });
    expect(rows.at(-1)).toEqual({ id: 'golden-hour-wall', label: 'Tường nắng hoàng hôn' });
    expect(new Set(rows.map((r) => r.label)).size).toBe(19);
    for (const r of rows) expect(r.label).not.toMatch(/^[A-Z][a-z-]+( [A-Z&][a-z-]*)+$/);
  });

  test('seeds the two models with price, limits and bake-off record (migration 0013: Kling enabled, Seedance disabled; 0022: Kling takes 7 references; 0057 adds the Replicate round to Seedance), and the settings row', async () => {
    const models = await pool.query(`select id, provider, endpoint, enabled, usd_per_second::text as usd, max_images, output_resolution, pass_seed_passes as passes, pass_seed_total as total from model_configs where id in ('kling-o3-pro', 'seedance-2.5') order by id`);
    expect(models.rows).toEqual([
      { id: 'kling-o3-pro', provider: 'fal', endpoint: 'fal-ai/kling-video/o3/pro/reference-to-video', enabled: true, usd: '0.1120', max_images: 7, output_resolution: '1080p', passes: 7, total: 10 },
      { id: 'seedance-2.5', provider: 'replicate', endpoint: 'bytedance/seedance-2.5', enabled: false, usd: '0.2312', max_images: 4, output_resolution: '720p', passes: 7, total: 12 },
    ]);
    // 0022 also widens Kling to every ratio and duration fal accepts, matching the model facts in packages/core.
    const kling = BAKEOFF_MODELS.find((m) => m.id === 'kling-o3-pro')!;
    expect((await pool.query(`select ratios, durations_sec from model_configs where id = 'kling-o3-pro'`)).rows).toEqual([{ ratios: kling.ratios, durations_sec: kling.durationsSec }]);
    expect([kling.ratios, kling.durationsSec[0], kling.durationsSec.at(-1)]).toEqual([['9:16', '1:1', '16:9'], 3, 15]);
    expect((await pool.query(`select monthly_cap_usd::text as cap, member_daily_clip_cap as daily from settings`)).rows).toEqual([{ cap: '200.0000', daily: 5 }]);
  });

  test('refuses to enable a model that has no price or limits', async () => {
    await expect(pool.query(`update model_configs set enabled = true, usd_per_second = null where id = 'seedance-2.5'`)).rejects.toThrow(/model_configs_enabled_complete_check/);
  });
});

describe('migration 0041 Kling prompt limits', () => {
  test('gives Kling O3 Pro, Kling 3.0 Pro and both Kling 3.0 Motion Control endpoints the 2500 characters of their fal schemas', async () => {
    const { rows } = await pool.query(`select endpoint, max_prompt_chars as n from model_configs where endpoint like 'fal-ai/kling-video/%' order by endpoint`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.n, r.endpoint).toBe(2500);
  });
});

describe('migration 0028 prompt limits', () => {
  test('gives each model the prompt limit of its fal schema with the source, and 2000 where the schema states none', async () => {
    const { rows } = await pool.query(`select id, endpoint, max_prompt_chars as n, sources->'maxPromptChars' as src from model_configs where id = any($1) order by id`, [
      ['nano-banana-pro', 'kling-2.6', 'minimax-hailuo-2.3-pro', 'veo-3.1', 'grok-imagine-1.5', 'kling-o3-pro'],
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.n]))).toMatchObject({ 'nano-banana-pro': 50000, 'kling-2.6': 2500, 'minimax-hailuo-2.3-pro': 2000, 'veo-3.1': 20000, 'grok-imagine-1.5': 4096, 'kling-o3-pro': 2500 });
    expect(by['kling-2.6'].src).toEqual({ url: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${by['kling-2.6'].endpoint}`, readAt: '2026-10-28' });
    // 0028 read no limit for Kling O3 Pro; 0041 found 2500 inside the schema's anyOf.
    expect(by['kling-o3-pro'].src).toEqual({ url: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${by['kling-o3-pro'].endpoint}`, readAt: '2026-10-30' });
    const seedance = (await pool.query(`select max_prompt_chars as n, sources->'maxPromptChars'->>'url' as url from model_configs where id = 'seedance-2.5'`)).rows[0];
    expect(seedance).toEqual({ n: 2000, url: 'https://replicate.com/bytedance/seedance-2.5/api/schema' }); // 0029: Replicate's own 2000
    await expect(pool.query(`update model_configs set max_prompt_chars = 0 where id = 'veo-3.1'`)).rejects.toThrow(/model_configs_max_prompt_chars_check/);
  });
});

describe('migration 0015 Fash video models', () => {
  test('adds 22 fal video models, disabled and complete, each with a request builder and its sources', async () => {
    const { rows } = await pool.query(
      `select id, endpoint, ratios, durations_sec, max_images, output_resolution, usd_per_second::float as usd, sources from model_configs where kind = 'video' and provider = 'fal' and id <> 'kling-o3-pro' and not 'motion_control' = any(features) and not enabled and id !~ '^minimax-h3-max.*-(480|1080)p$' order by id`, // 0036's resolution rows have their own test
    );
    expect(rows).toHaveLength(22);
    for (const r of rows) {
      expect(VIDEO_BODIES[r.endpoint], r.id).toBeDefined();
      expect(r.ratios.length * r.durations_sec.length * r.max_images * r.usd, r.id).toBeGreaterThan(0);
      expect(['720p', '768p', '1080p'], r.id).toContain(r.output_resolution);
      expect(Object.keys(r.sources).filter((k) => k !== 'maxPromptChars' && k !== 'passSeed').sort(), r.id).toEqual(['durationsSec', 'maxImages', 'outputResolution', 'ratios', 'usdPerSecond']); // 0028 adds the prompt limit's source, 0057 the bake-off prior's
    }
    expect(rows.find((r) => r.id === 'veo-3.1')).toMatchObject({ ratios: ['9:16', '16:9'], durations_sec: [8] }); // no 1:1, and Fash's 8 s only; 0037 adds 16:9
    await pool.query(`update model_configs set enabled = true where id = 'kling-3.0-pro'`); // complete enough for the enable check
    await pool.query(`update model_configs set enabled = false where id = 'kling-3.0-pro'`);
  });
});

describe('migration 0023 Seedance in Marketing Studio', () => {
  test('lists the two Seedance reference models for marketing with 16:9, 7 references and an audio price, and no other video model gains it', async () => {
    const { rows } = await pool.query(`select id, endpoint, ratios, max_images from model_configs where 'marketing' = any(features) and provider <> 'mock' order by id`);
    expect(rows.map((r) => [r.id, r.ratios, r.max_images])).toEqual([
      ['kling-o3-pro', ['9:16', '1:1', '16:9'], 7],
      ['seedance-2.0-reference', ['9:16', '1:1', '16:9', '4:3', '3:4'], 9], // 0037 widens both Seedance rows and gives 2.0 its 9 references
      ['seedance-2.5-reference', ['9:16', '1:1', '16:9', '4:3', '3:4'], 7],
    ]);
    for (const r of rows) expect(AUDIO_USD_PER_SECOND[r.endpoint], r.id).toBeDefined();
  });
});

describe('migration 0016 video models at 1080p', () => {
  test('FLUX 3, FLUX 3 Reference and Seedance 1.0 Pro carry the 1080p output and price their builders ask for', async () => {
    const { rows } = await pool.query(`select id, output_resolution, usd_per_second::float as usd from model_configs where id in ('flux-3', 'flux-3-reference', 'seedance-1.0-pro') order by id`);
    expect(rows).toEqual([
      { id: 'flux-3', output_resolution: '1080p', usd: 0.29 },
      { id: 'flux-3-reference', output_resolution: '1080p', usd: 0.29 },
      { id: 'seedance-1.0-pro', output_resolution: '1080p', usd: 0.124 },
    ]);
  });
});

describe('migrations 0018 and 0019 Motion Control', () => {
  test('adds the two Kling V3 Motion Control models disabled: ratio auto, 3 to 30 s, the image and the video, a request builder each', async () => {
    const { rows } = await pool.query(`select id, endpoint, features, ratios, durations_sec, max_images, usd_per_second::text as usd, enabled from model_configs where 'motion_control' = any(features) order by id`);
    expect(rows.map((r) => [r.id, r.endpoint, r.usd, r.enabled])).toEqual([
      ['kling-v3-motion-pro', 'fal-ai/kling-video/v3/pro/motion-control', '0.1680', false],
      ['kling-v3-motion-standard', 'fal-ai/kling-video/v3/standard/motion-control', '0.1260', false],
    ]);
    for (const r of rows) {
      expect([r.features, r.ratios, r.max_images, r.durations_sec[0], r.durations_sec.at(-1), r.durations_sec.length]).toEqual([['motion_control'], ['auto'], 2, 3, 30, 28]);
      expect(VIDEO_BODIES[r.endpoint], r.id).toMatchObject({ upload: true });
    }
  });

  test('an asset can carry the length of a video', async () => {
    expect((await pool.query(`select data_type, is_nullable from information_schema.columns where table_name = 'assets' and column_name = 'duration_ms'`)).rows).toEqual([{ data_type: 'integer', is_nullable: 'YES' }]);
  });
});

describe('migration 0017 GPT Image 2.5', () => {
  test('adds Flare and Sunburst disabled, with the price and ratios of GPT Image 2', async () => {
    const { rows } = await pool.query(`select id, endpoint, features, ratios, max_images, image_prices, enabled from model_configs where id like 'gpt-image-2.5%' order by id`);
    expect(rows.map((r) => [r.id, r.endpoint, r.features, r.image_prices, r.max_images, r.enabled])).toEqual([
      ['gpt-image-2.5-flare', 'openai/gpt-image-2.5/flare/edit', ['image'], { '1K': '0.21' }, 4, false],
      ['gpt-image-2.5-sunburst', 'openai/gpt-image-2.5/sunburst/edit', ['image'], { '1K': '0.21' }, 4, false],
    ]);
    for (const r of rows) expect(r.ratios).toEqual(['auto', '1:1', '9:16', '16:9', '3:4', '4:3']);
  });
});

describe('migration 0031 Vertex models', () => {
  test('adds the Vertex image models disabled, the Nano Banana ones with the features and limits of their fal twins', async () => {
    const { rows } = await pool.query(`select v.id, v.endpoint, v.label, v.kind, v.features, v.ratios, v.max_images, v.max_prompt_chars, v.image_prices, v.enabled,
      v.sources->'imagePrices'->>'readAt' as read_at, f.features = v.features and f.ratios = v.ratios and f.max_images = v.max_images and f.max_prompt_chars = v.max_prompt_chars as same_as_twin
      from model_configs v left join model_configs f on f.id = replace(v.id, '-vertex', '') and f.provider = 'fal' where v.provider = 'vertex' and v.kind = 'image' order by v.id`);
    expect(rows.map((r) => [r.id, r.endpoint, r.image_prices, r.same_as_twin])).toEqual([
      ['nano-banana-2-vertex', 'gemini-3.1-flash-image', { '1K': '0.067' }, true],
      ['nano-banana-2.1-vertex', 'gemini-nano-banana-2.1', { '1K': '0.034', '2K': '0.05' }, true],
      ['nano-banana-pro-vertex', 'gemini-3-pro-image', { '1K': '0.134', '2K': '0.134', '4K': '0.24' }, true],
      ['nano-banana-vertex', 'gemini-2.5-flash-image', { '1K': '0.039' }, true],
      ['product-recontext-vertex', 'imagen-product-recontext-preview-06-30', { '1K': '0.12' }, null],
      ['virtual-try-on-vertex', 'virtual-try-on-001', { '1K': '0.06' }, null],
    ]);
    for (const r of rows) {
      expect([r.kind, r.enabled, r.read_at], r.id).toEqual(['image', false, '2026-10-29']);
      expect(r.label, r.id).toMatch(/ \(Vertex\)$/);
    }
    const [recontext, tryOn] = rows.slice(4);
    expect([recontext.features, recontext.ratios, recontext.max_images]).toEqual([['image'], ['auto'], 3]);
    expect([tryOn.features, tryOn.ratios, tryOn.max_images]).toEqual([['try_on'], ['auto'], 2]);
  });

  test('vertex and byteplus are providers for models and jobs, and an unknown one is still refused', async () => {
    await pool.query(`update model_configs set enabled = true where id = 'virtual-try-on-vertex'`);
    await pool.query(`update model_configs set enabled = false where id = 'virtual-try-on-vertex'`);
    const user = await insertUser();
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids)
       values ($1, $2, 'team-unassigned', 'try_on', 'virtual-try-on-vertex', 'vertex', '', 'auto', 0, '{"resolution": "1K"}', '{}')`,
      [next(), user],
    );
    await expect(pool.query(`update model_configs set provider = 'openai' where id = 'virtual-try-on-vertex'`)).rejects.toThrow(/model_configs_provider_check/);
    await expect(
      pool.query(
        `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids)
         values ($1, $2, 'team-unassigned', 'try_on', 'virtual-try-on-vertex', 'openai', '', 'auto', 0, '{"resolution": "1K"}', '{}')`,
        [next(), user],
      ),
    ).rejects.toThrow(/jobs_provider_check/);
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids)
       values ($1, $2, 'team-unassigned', 'image', 'seedream-5-pro-byteplus', 'byteplus', '', '1:1', 0, '{"resolution": "1K"}', '{}')`,
      [next(), user],
    );
  });
});

describe('migration 0035 user choices', () => {
  test("keeps a member's hook or location with its limits, and drops it with the member", async () => {
    const user = await insertUser();
    const add = (kind: string, name: string, phrase: string, description: string | null = null) =>
      pool.query(`insert into user_choices (id, user_id, kind, name, phrase, description) values ($1, $2, $3, $4, $5, $6)`, [next(), user, kind, name, phrase, description]);
    await add('hook', 'x'.repeat(40), 'y'.repeat(300), 'z'.repeat(100));
    await add('location', 'n', 'p');
    expect((await pool.query(`select kind, is_company, description from user_choices where user_id = $1 order by kind`, [user])).rows.map((r) => [r.kind, r.is_company, r.description?.length ?? null])).toEqual([['hook', false, 100], ['location', false, null]]);
    await expect(add('music', 'n', 'p')).rejects.toThrow(/user_choices_kind_check/);
    await expect(add('hook', '', 'p')).rejects.toThrow(/user_choices_name_check/);
    await expect(add('hook', 'x'.repeat(41), 'p')).rejects.toThrow(/user_choices_name_check/);
    await expect(add('hook', 'n', 'y'.repeat(301))).rejects.toThrow(/user_choices_phrase_check/);
    await expect(add('hook', 'n', 'p', 'z'.repeat(101))).rejects.toThrow(/user_choices_description_check/);
    await pool.query('delete from users where id = $1', [user]);
    expect((await pool.query('select count(*)::int as n from user_choices where user_id = $1', [user])).rows[0].n).toBe(0);
  });
});

describe('migration 0007 image models', () => {
  test('seeds the seven fal image models disabled, each with its prices, ratios and features', async () => {
    const { rows } = await pool.query(`select id, endpoint, features, ratios, durations_sec, max_images, image_prices, usd_per_second, enabled, sources from model_configs where kind = 'image' and cardinality(features) > 0 and not features && ARRAY['character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover']::text[] and id not like 'gpt-image-2.5%' and provider = 'fal' order by id`);
    expect(rows.map((r) => [r.id, r.endpoint, r.features, r.image_prices])).toEqual([
      ['fashn-v1.6', 'fal-ai/fashn/tryon/v1.6', ['try_on'], { '1K': '0.075' }],
      ['gpt-image-2', 'openai/gpt-image-2/edit', ['image'], { '1K': '0.281', '2K': '0.301', '4K': '0.530' }],
      ['nano-banana', 'fal-ai/nano-banana/edit', ['image', 'try_on', 'jewelry_try_on'], { '1K': '0.0398' }],
      ['nano-banana-2', 'fal-ai/nano-banana-2/edit', ['image'], { '1K': '0.08' }],
      ['nano-banana-2.1', 'google/nano-banana-2.1/edit', ['image', 'try_on', 'jewelry_try_on'], { '1K': '0.04', '2K': '0.059' }],
      ['nano-banana-pro', 'fal-ai/nano-banana-pro/edit', ['image', 'try_on', 'jewelry_try_on', 'lingerie_try_on'], { '1K': '0.15', '2K': '0.15', '4K': '0.30' }],
      ['seedream-5-pro', 'bytedance/seedream/v5/pro/edit', ['image', 'lingerie_try_on'], { '1K': '0.0675', '2K': '0.135' }],
    ]);
    for (const r of rows) {
      expect(r.enabled).toBe(false);
      expect(r.durations_sec).toEqual([]);
      expect(r.usd_per_second).toBeNull();
      expect(r.sources.imagePrices.readAt).toBe(r.id === 'gpt-image-2' ? '2026-11-04' : '2026-10-24');
      expect(r.sources.ratios.url).toContain(`endpoint_id=${r.endpoint}`);
    }
  });

  test('a video row keeps its defaults: kind video, no image prices (features: see migration 0010)', async () => {
    expect((await pool.query(`select kind, features, image_prices from model_configs where id = 'kling-o3-pro'`)).rows).toEqual([{ kind: 'video', features: ['video', 'marketing'], image_prices: null }]);
  });

  test('an image model can be enabled with prices, a limit and a ratio, and not without them', async () => {
    await pool.query(`update model_configs set enabled = true where id = 'nano-banana-pro'`);
    await pool.query(`update model_configs set enabled = false where id = 'nano-banana-pro'`);
    for (const [what, set] of [['image_prices', `image_prices = null`], ['empty image_prices', `image_prices = '{}'::jsonb`], ['max_images', `max_images = null`], ['ratios', `ratios = '{}'`]]) {
      await expect(pool.query(`update model_configs set ${set}, enabled = true where id = 'nano-banana-pro'`), what).rejects.toThrow(/model_configs_enabled_complete_check/);
    }
    // A video row is still judged by the video rule, whatever else it carries.
    await expect(pool.query(`update model_configs set image_prices = '{"1K": "1"}'::jsonb, max_images = 4, ratios = '{9:16}', usd_per_second = null, enabled = true where id = 'seedance-2.5'`)).rejects.toThrow(/model_configs_enabled_complete_check/);
    await expect(pool.query(`update model_configs set kind = 'audio' where id = 'seedance-2.5'`)).rejects.toThrow(/model_configs_kind_check/);
  });

  test('a job takes the image ratios and params; 0 seconds and the default params are fine', async () => {
    const user = await insertUser();
    const id = next();
    await pool.query(
      `insert into jobs (id, user_id, team_id, feature, model, provider, prompt, aspect, duration_s, params, input_asset_ids)
       values ($1, $2, 'team-unassigned', 'image', 'nano-banana-pro', 'fal', 'p', '21:9', 0, '{"resolution": "2K"}', '{}')`,
      [id, user],
    );
    expect((await pool.query(`select params, duration_s from jobs where id = $1`, [id])).rows).toEqual([{ params: { resolution: '2K' }, duration_s: 0 }]);
    expect((await pool.query(`select params from jobs where id = $1`, [await insertJob(user)])).rows).toEqual([{ params: {} }]);
    await expect(pool.query(`update jobs set aspect = '7:5' where id = $1`, [id])).rejects.toThrow(/jobs_aspect_check/);
  });
});

describe('migration 0009 image app models', () => {
  test('seeds one disabled row per app with its endpoint, input count, prices and a dated source', async () => {
    const { rows } = await pool.query(`select id, endpoint, features, ratios, max_images, image_prices, enabled, sources from model_configs where features && ARRAY['character_swap', 'model_swap', 'background_changer', 'reframe', 'image_upscale', 'face_swap', 'background_remover']::text[] order by id`);
    expect(rows.map((r) => [r.id, r.endpoint, r.features, r.max_images, r.image_prices])).toEqual([
      ['bria-background-remove', 'fal-ai/bria/background/remove', ['background_remover'], 1, { '1K': '0.018' }],
      ['bria-background-replace', 'fal-ai/bria/background/replace', ['background_changer'], 2, { '1K': '0.04' }],
      ['ideogram-v3-reframe', 'fal-ai/ideogram/v3/reframe', ['reframe'], 1, { '1K': '0.03' }],
      ['nano-banana-pro-character-swap', 'fal-ai/nano-banana-pro/edit', ['character_swap'], 2, { '1K': '0.15' }],
      ['nano-banana-pro-face-swap', 'fal-ai/nano-banana-pro/edit', ['face_swap'], 2, { '1K': '0.15' }],
      ['nano-banana-pro-model-swap', 'fal-ai/nano-banana-pro/edit', ['model_swap'], 2, { '1K': '0.15' }],
      ['topaz-upscale', 'fal-ai/topaz/upscale/image', ['image_upscale'], 1, { '2K': '0.08', '4K': '0.08' }],
    ]);
    for (const r of rows) {
      expect(r.enabled).toBe(false);
      expect(r.sources.imagePrices.readAt).toBe(r.id === 'gpt-image-2' ? '2026-11-04' : '2026-10-24');
      expect(r.sources.ratios.url).toBe(`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${r.endpoint}`);
    }
    expect(rows.find((r) => r.id === 'topaz-upscale').sources.imagePrices.note).toContain('up to 24 MP');
    // Reframe is the only app with a choice of ratio; the rest take the image as it is.
    expect(rows.filter((r) => r.ratios.length > 1).map((r) => r.id)).toEqual(['ideogram-v3-reframe']);
    expect(rows.find((r) => r.id === 'ideogram-v3-reframe').ratios).not.toContain('auto');
  });

  test('every app row can be enabled', async () => {
    const ids = ['bria-background-remove', 'bria-background-replace', 'ideogram-v3-reframe', 'nano-banana-pro-character-swap', 'nano-banana-pro-face-swap', 'nano-banana-pro-model-swap', 'topaz-upscale'];
    await pool.query(`update model_configs set enabled = true where id = any($1)`, [ids]);
    await pool.query(`update model_configs set enabled = false where id = any($1)`, [ids]);
  });
});

describe('migration 0010 marketing model', () => {
  test('adds marketing to Kling O3 Pro and records the schema read', async () => {
    const { rows } = await pool.query(`select features, sources from model_configs where id = 'kling-o3-pro'`);
    expect(rows[0].features).toEqual(['video', 'marketing']);
    expect(rows[0].sources.referenceImages).toMatchObject({ readAt: '2026-10-24', url: expect.stringContaining('endpoint_id=fal-ai/kling-video/o3/pro/reference-to-video') });
  });
});

describe('migration 0011 face swap model', () => {
  test('moves Face Swap from the deprecated Easel app to a disabled Nano Banana Pro row, and the Easel row serves no feature', async () => {
    const { rows } = await pool.query(`select id, features, enabled from model_configs where 'face_swap' = any(features) or id = 'easel-advanced-face-swap' order by id`);
    expect(rows).toEqual([
      { id: 'easel-advanced-face-swap', features: [], enabled: false },
      { id: 'nano-banana-pro-face-swap', features: ['face_swap'], enabled: false },
    ]);
  });
});

describe('migration 0013 real video models', () => {
  test('the rows carry the BAKEOFF_MODELS facts and the pass counts of docs/BAKEOFF.md', async () => {
    const doc = readFileSync(new URL('../../../docs/BAKEOFF.md', import.meta.url), 'utf8');
    for (const m of BAKEOFF_MODELS) {
      const row = (await pool.query(`select *, usd_per_second::float8 as usd from model_configs where id = $1`, [m.id])).rows[0];
      expect(row, m.id).toMatchObject({
        provider: m.provider, endpoint: m.endpoint, label: m.label, ratios: m.ratios, durations_sec: m.durationsSec, max_images: m.maxImages,
        output_resolution: m.outputResolution, usd: m.usdPerSecond, billed_amount_field: m.billedAmountField, sources: m.sources,
      });
      // Later rounds (0057) add to the row, so the prior is the sum of every table row of this model.
      const counts = [...doc.matchAll(new RegExp(`\\| ${m.id} \\| (\\d+)/(\\d+) \\|`, 'g'))].map(([, p, t]): [number, number] => [Number(p), Number(t)]);
      expect(counts.length, m.id).toBeGreaterThan(0);
      expect([row.pass_seed_passes, row.pass_seed_total], m.id).toEqual(counts.reduce(([p, t], [q, u]) => [p + q, t + u], [0, 0]));
    }
  });
});

describe('migration 0057 Replicate round scores', () => {
  test('every row of a model carries the same prior, and the Replicate-round twins carry the docs/BAKEOFF.md totals', async () => {
    const twins: [number, number, string[]][] = [
      [3, 10, ['seedance-2.0', 'seedance-2.0-replicate', 'seedance-2.0-byteplus']],
      [7, 12, ['seedance-2.5', 'seedance-2.5-byteplus']],
      [1, 4, ['veo-3.1', 'veo-3.1-replicate', 'veo-3.1-vertex']],
      [8, 18, ['seedream-5-pro', 'seedream-5-pro-byteplus']],
      [10, 18, ['nano-banana-2', 'nano-banana-2-vertex']],
      [4, 18, ['nano-banana', 'nano-banana-vertex']],
      [9, 10, ['nano-banana-2.1', 'nano-banana-2.1-vertex']],
    ];
    const doc = readFileSync(new URL('../../../docs/BAKEOFF.md', import.meta.url), 'utf8');
    for (const [passes, total, ids] of twins) {
      const { rows } = await pool.query(`select id, pass_seed_passes as p, pass_seed_total as t from model_configs where id = any($1)`, [ids]);
      expect(rows.map((r) => [r.id, r.p, r.t]).sort()).toEqual([...ids].sort().map((id) => [id, passes, total]));
      if (passes !== 9) expect(doc).toContain(`${passes}/${total}`);
    }
  });
});

describe('migrations 0032 and 0034 Try On bake-off prior', () => {
  test('both Nano Banana 2.1 rows carry its Try On bake-off pass count from docs/BAKEOFF.md, above every other Try On model', async () => {
    const doc = readFileSync(new URL('../../../docs/BAKEOFF.md', import.meta.url), 'utf8');
    const [, passes, total] = /\| nano-banana-2\.1 \| (\d+)\/(\d+) \|/.exec(doc)!;
    const { rows } = await pool.query(`select id, pass_seed_passes::float8 / pass_seed_total as rate from model_configs where 'try_on' = any(features) order by rate desc nulls last, id`);
    const rate = Number(passes) / Number(total);
    expect(rows.slice(0, 2)).toEqual([{ id: 'nano-banana-2.1', rate }, { id: 'nano-banana-2.1-vertex', rate }]);
    expect(rows[2].rate).toBeLessThan(rate);
  });
});

describe('migration 0033 Seedance 2.0 on Replicate', () => {
  test('adds a disabled Replicate row at its own price that otherwise matches the fal reference twin, without Marketing Studio (no audio)', async () => {
    const pick = `select kind, features, ratios, durations_sec, max_images, max_prompt_chars, output_resolution from model_configs where id = $1`;
    const [twin] = (await pool.query(pick, ['seedance-2.0-reference'])).rows;
    const [row] = (await pool.query(pick, ['seedance-2.0-replicate'])).rows;
    // 0037 widens the fal twin from its own schema only, so the Replicate row keeps the twin's earlier ratios and 7 references.
    expect(row).toEqual({ ...twin, features: twin.features.filter((f: string) => f !== 'marketing'), ratios: ['9:16', '1:1', '16:9'], max_images: 7 });
    expect(row.features).toEqual(['video']);
    const [facts] = (await pool.query(`select provider, endpoint, enabled, usd_per_second::text as usd, sources->'usdPerSecond'->>'url' as source from model_configs where id = 'seedance-2.0-replicate'`)).rows;
    expect(facts).toEqual({ provider: 'replicate', endpoint: 'bytedance/seedance-2.0', enabled: false, usd: '0.1800', source: 'https://replicate.com/bytedance/seedance-2.0' });
  });
});

describe('migration 0036 Minimax H3 Max resolutions', () => {
  test('adds disabled 480P and 1080P rows beside each 768P Minimax H3 Max row, at the fal price, otherwise the same as their twin', async () => {
    const { rows } = await pool.query(
      `select id, endpoint, label, output_resolution as res, usd_per_second::text as usd, enabled, features, ratios, durations_sec, max_images from model_configs where id like 'minimax-h3-max%' order by id`,
    );
    expect(rows.map((r) => [r.id, r.endpoint, r.label, r.res, r.usd])).toEqual([
      ['minimax-h3-max', 'minimax/h3-max/image-to-video', 'Minimax H3 Max', '768p', '0.0800'],
      ['minimax-h3-max-1080p', 'minimax/h3-max/image-to-video', 'Minimax H3 Max 1080P', '1080p', '0.1600'],
      ['minimax-h3-max-480p', 'minimax/h3-max/image-to-video', 'Minimax H3 Max 480P', '480p', '0.0500'],
      ['minimax-h3-max-reference', 'minimax/h3-max/reference-to-video', 'Minimax H3 Max Reference', '768p', '0.0800'],
      ['minimax-h3-max-reference-1080p', 'minimax/h3-max/reference-to-video', 'Minimax H3 Max Reference 1080P', '1080p', '0.1600'],
      ['minimax-h3-max-reference-480p', 'minimax/h3-max/reference-to-video', 'Minimax H3 Max Reference 480P', '480p', '0.0500'],
    ]);
    const twin = (id: string) => rows.find((r) => r.id === id)!;
    for (const r of rows.filter((r) => r.res !== '768p')) {
      expect(r.enabled, r.id).toBe(false);
      const { features, ratios, durations_sec, max_images } = twin(r.id.replace(/-(480p|1080p)$/, ''));
      expect({ features: r.features, ratios: r.ratios, durations_sec: r.durations_sec, max_images: r.max_images }, r.id).toEqual({ features, ratios, durations_sec, max_images });
    }
  });
});

describe('migration 0037 references and ratios', () => {
  test('raises the reference limits to the fal maxItems and adds the 16:9, 4:3 and 3:4 that each endpoint lists, after the rows own', async () => {
    const { rows } = await pool.query(`select id, ratios, max_images, sources from model_configs where provider = 'fal' and kind = 'video' order by id`);
    const of = (id: string) => rows.find((r) => r.id === id)!;
    expect(['minimax-h3-max-reference', 'minimax-h3-max-reference-480p', 'minimax-h3-max-reference-1080p', 'seedance-2.0-reference', 'gemini-omni-flash-reference', 'grok-imagine-reference'].map((id) => [id, of(id).max_images])).toEqual([
      ['minimax-h3-max-reference', 9],
      ['minimax-h3-max-reference-480p', 9],
      ['minimax-h3-max-reference-1080p', 9],
      ['seedance-2.0-reference', 9],
      ['gemini-omni-flash-reference', 9],
      ['grok-imagine-reference', 7],
    ]);
    expect(of('minimax-h3-max-reference').ratios).toEqual(['9:16', '1:1', '16:9', '4:3', '3:4']);
    expect(of('gemini-omni-flash-reference').ratios).toEqual(['9:16', '16:9']); // its enum has no 4:3 or 3:4
    expect(of('kling-o3-pro').sources.ratios.readAt).not.toBe('2026-10-29'); // it already had 16:9, so it is left as it was
    expect(of('minimax-h3-max').ratios).toEqual(['9:16', '1:1']); // its endpoint has no aspect_ratio: the first image is cropped
    for (const r of rows) expect(r.ratios.every((x: string) => ['9:16', '1:1', '16:9', '4:3', '3:4', 'auto'].includes(x)), r.id).toBe(true);
    const motion = rows.filter((r) => r.ratios.includes('auto'));
    expect(motion.length).toBeGreaterThan(0);
    for (const r of motion) expect(r.ratios, r.id).toEqual(['auto']);
  });
});

describe('migration 0038 ultra-wide ratios and thinking levels', () => {
  test('gives Nano Banana 2 and 2.1 the four ultra-wide ratios and 2.1 its thinking levels, on fal and Vertex, and lets a job store the ratios', async () => {
    const { rows } = await pool.query(`select id, ratios, thinking_levels, sources from model_configs where kind = 'image' order by id`);
    const wide = ['4:1', '1:4', '8:1', '1:8'];
    const nb2 = ['nano-banana-2', 'nano-banana-2-vertex', 'nano-banana-2.1', 'nano-banana-2.1-vertex'];
    for (const r of rows) {
      expect(r.ratios.slice(-4).join() === wide.join(), r.id).toBe(nb2.includes(r.id));
      expect(r.thinking_levels, r.id).toEqual(r.id.startsWith('nano-banana-2.1') ? ['minimal', 'medium', 'high'] : []);
    }
    for (const id of nb2) expect(rows.find((r) => r.id === id)!.sources.ratios.readAt, id).toBe('2026-10-30');
    expect(rows.find((r) => r.id === 'nano-banana-2.1-vertex')!.sources.thinkingLevels.url).toBe('https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking');
    const user = await insertUser();
    const job = await insertJob(user);
    await pool.query(`update jobs set aspect = '8:1' where id = $1`, [job]);
    await pool.query(`update jobs set aspect = '1:4' where id = $1`, [job]);
    await expect(pool.query(`update jobs set aspect = '2:1' where id = $1`, [job])).rejects.toThrow(/jobs_aspect_check/);
  });
});

describe('migration 0039 thinking prices', () => {
  test('prices each thinking level of Nano Banana 2.1, Minimal at the row price and the others by Fash ratio, and no other row', async () => {
    const { rows } = await pool.query(`select id, thinking_levels, image_prices, thinking_prices, sources from model_configs where kind = 'image' order by id`);
    for (const r of rows) expect(r.thinking_prices === null, r.id).toBe(r.thinking_levels.length === 0);
    const of = (id: string) => rows.find((r) => r.id === id)!;
    expect(of('nano-banana-2.1').thinking_prices).toEqual({ minimal: { '1K': '0.04', '2K': '0.059' }, medium: { '1K': '0.0473', '2K': '0.0627' }, high: { '1K': '0.0618', '2K': '0.0774' } });
    expect(of('nano-banana-2.1-vertex').thinking_prices).toEqual({ minimal: { '1K': '0.034', '2K': '0.05' }, medium: { '1K': '0.0402', '2K': '0.0531' }, high: { '1K': '0.0525', '2K': '0.0656' } });
    for (const id of ['nano-banana-2.1', 'nano-banana-2.1-vertex']) {
      const r = of(id);
      expect(Object.keys(r.thinking_prices), id).toEqual(expect.arrayContaining(r.thinking_levels));
      expect(r.thinking_prices[r.thinking_levels[0]], id).toEqual(r.image_prices); // the default level keeps the row price
      expect(r.sources.thinkingPrices, id).toEqual({ url: 'https://fash.studio/dashboard/image-generation', readAt: '2026-10-30', note: 'ratio of Fash credits, not a provider price' });
    }
  });
});

describe('migration 0040 Veo 3.1 on Replicate', () => {
  test('adds a disabled Replicate row at $0.20 that otherwise matches the fal twin, within the Replicate enums, with an audio price', async () => {
    const pick = `select kind, features, ratios, durations_sec, max_images, max_prompt_chars, output_resolution from model_configs where id = $1`;
    const [twin] = (await pool.query(pick, ['veo-3.1'])).rows;
    const [row] = (await pool.query(pick, ['veo-3.1-replicate'])).rows;
    expect(row).toEqual(twin);
    expect(row).toMatchObject({ ratios: ['9:16', '16:9'], durations_sec: [8], max_images: 1, output_resolution: '720p' });
    const [facts] = (await pool.query(`select provider, endpoint, label, enabled, usd_per_second::text as usd, sources from model_configs where id = 'veo-3.1-replicate'`)).rows;
    expect(facts).toMatchObject({ provider: 'replicate', endpoint: 'google/veo-3.1', label: 'Google VEO 3.1 (Replicate)', enabled: false, usd: '0.2000' });
    expect(facts.sources.usdPerSecond).toEqual({ url: 'https://replicate.com/google/veo-3.1', readAt: '2026-10-30' });
    expect(facts.sources.ratios).toEqual({ url: 'https://api.replicate.com/v1/models/google/veo-3.1', readAt: '2026-10-30' });
    expect(AUDIO_USD_PER_SECOND['google/veo-3.1']).toBe(0.4);
  });
});

describe('migration 0042 Veo 3.1 on Vertex', () => {
  test('adds a disabled Vertex row at an estimated $0.20 that otherwise matches the fal twin, within what the adapter sends, with an audio price', async () => {
    const pick = `select kind, features, ratios, durations_sec, max_images, max_prompt_chars, output_resolution from model_configs where id = $1`;
    const [twin] = (await pool.query(pick, ['veo-3.1'])).rows;
    const [row] = (await pool.query(pick, ['veo-3.1-vertex'])).rows;
    expect(row).toEqual(twin);
    expect(row).toMatchObject({ ratios: ['9:16', '16:9'], durations_sec: [8], max_images: 1, output_resolution: '720p' });
    const [facts] = (await pool.query(`select provider, endpoint, label, enabled, usd_per_second::text as usd, sources from model_configs where id = 'veo-3.1-vertex'`)).rows;
    expect(facts).toMatchObject({ provider: 'vertex', endpoint: 'veo-3.1-generate-001', label: 'Google VEO 3.1 (Vertex)', enabled: false, usd: '0.2000' });
    expect(facts.sources.usdPerSecond).toMatchObject({ url: 'https://cloud.google.com/vertex-ai/generative-ai/pricing', readAt: '2026-11-01' });
    expect(facts.sources.usdPerSecond.note).toMatch(/^estimate:/);
    expect(AUDIO_USD_PER_SECOND['veo-3.1-generate-001']).toBe(0.4);
  });
});

describe('migration 0043 Seedance 2.0 label', () => {
  test('drops the provider suffix from the Replicate Seedance 2.0 label and changes nothing else', async () => {
    const { rows } = await pool.query(`select id, label from model_configs where label like 'Seedance 2.0%' and provider <> 'byteplus' order by id`);
    expect(rows).toEqual([
      { id: 'seedance-2.0', label: 'Seedance 2.0' },
      { id: 'seedance-2.0-reference', label: 'Seedance 2.0 Reference' },
      { id: 'seedance-2.0-replicate', label: 'Seedance 2.0' },
    ]);
  });
});

describe('migration 0050 Vertex accounts', () => {
  test('seeds cvs-vertex with its FreeTrial credit, starts with no active account and lets the system write an audit entry', async () => {
    const pick = `select project_id, credit_total::text as total, credit_currency, credit_expires_on::text as expires, stop_when_credits_end as stop from vertex_accounts where project_id = $1`;
    expect((await pool.query(pick, ['cvs-vertex'])).rows).toEqual([{ project_id: 'cvs-vertex', total: '7825800', credit_currency: 'VND', expires: '2026-12-30', stop: true }]);
    await pool.query(`insert into vertex_accounts (project_id) values ('next-project')`);
    expect((await pool.query(pick, ['next-project'])).rows).toEqual([{ project_id: 'next-project', total: null, credit_currency: 'USD', expires: null, stop: false }]);
    expect((await pool.query('select vertex_active_project from settings where id = 1')).rows).toEqual([{ vertex_active_project: null }]);
    await pool.query(`insert into audit_entries (actor_id, action, target) values (null, 'vertex.switch_account', 'settings:1')`);
  });
});

describe('migration 0051 provider balances', () => {
  test('starts with no Replicate credit and a 10 USD balance warning', async () => {
    const { rows } = await pool.query('select replicate_credit_usd, replicate_credit_since, balance_warning_usd::text as warning from settings where id = 1');
    expect(rows).toEqual([{ replicate_credit_usd: null, replicate_credit_since: null, warning: '10.0000' }]);
  });
});

describe('migration 0056 BytePlus', () => {
  const link = (page: string) => `https://ai.byteplus.com/ark/region:ap-southeast-1/docs/${page}.md`;

  test('adds the six Seedance rows disabled, at the list price per second of the row resolution (million-token price x tokens per second)', async () => {
    const { rows } = await pool.query(
      `select id, provider, endpoint, enabled, kind, features, ratios, durations_sec, max_images, output_resolution, usd_per_second::text as usd, billed_amount_field from model_configs where provider = 'byteplus' and kind = 'video' order by id`,
    );
    // tokens per second: 21,600 at 720p (1280x720), 48,960 at Seedance 1.0's 1080p (1920x1088); USD per million tokens from the pricing page, read 2026-11-03.
    const per = (usdPerMillion: number, tokensPerSecond: number) => (Math.ceil((usdPerMillion * tokensPerSecond) / 100) / 10_000).toFixed(4);
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const ratios = ['9:16', '1:1', '16:9', '4:3', '3:4'];
    const row = (id: string, endpoint: string, durations: number[], maxImages: number, resolution: string, usd: string) => ({
      id, provider: 'byteplus', endpoint, enabled: false, kind: 'video', features: ['video'], ratios, durations_sec: durations, max_images: maxImages, output_resolution: resolution, usd, billed_amount_field: 'usage.completion_tokens',
    });
    expect(rows).toEqual([
      row('seedance-1.0-pro-byteplus', 'seedance-1-0-pro-250528', range(2, 12), 1, '1080p', per(2.5, 48_960)),
      row('seedance-1.0-pro-fast-byteplus', 'seedance-1-0-pro-fast-251015', range(2, 12), 1, '1080p', per(1, 48_960)),
      row('seedance-2.0-byteplus', 'dreamina-seedance-2-0-260128', range(4, 15), 9, '720p', per(7, 21_600)),
      row('seedance-2.0-fast-byteplus', 'dreamina-seedance-2-0-fast-260128', range(4, 15), 9, '720p', per(5.6, 21_600)),
      row('seedance-2.0-mini-byteplus', 'dreamina-seedance-2-0-mini-260615', range(4, 15), 9, '720p', per(3.5, 21_600)),
      row('seedance-2.5-byteplus', 'dreamina-seedance-2-5-260628', range(4, 15), 9, '720p', per(10.7, 21_600)), // 4 to 30 s on the API; 15 s until a canary measures the latency (the docs' own 11 s example took 581 s)
    ]);
    // 5 s at 720p on Seedance 2.5: 108,000 tokens at $10.70 per million.
    expect(rows.find((r) => r.id === 'seedance-2.5-byteplus')!.usd).toBe('0.2312');
  });

  test('the adapter turns reported tokens into the same USD as the list price per million tokens, for every row price here', async () => {
    // The frame of each row's resolution as the API renders it (create page, pixel table): 1280x720 for Seedance 2.x at 720p, 1920x1088 for Seedance 1.0 at 1080p.
    const list: Record<string, [number, number]> = {
      'seedance-2.5-byteplus': [10.7, 1280 * 720], 'seedance-2.0-byteplus': [7, 1280 * 720], 'seedance-2.0-fast-byteplus': [5.6, 1280 * 720], 'seedance-2.0-mini-byteplus': [3.5, 1280 * 720],
      'seedance-1.0-pro-byteplus': [2.5, 1920 * 1088], 'seedance-1.0-pro-fast-byteplus': [1, 1920 * 1088],
    };
    const { rows } = await pool.query(`select id, endpoint, output_resolution, usd_per_second::float as usd from model_configs where provider = 'byteplus' and kind = 'video' order by id`);
    expect(rows.map((r) => r.id)).toEqual(Object.keys(list).sort());
    for (const r of rows) {
      const [usdPerMillion, pixels] = list[r.id]!;
      const tokens = (5 * pixels * 24) / 1024; // tokens = seconds x width x height x 24 / 1024
      const booked = tokenCost({ endpoint: r.endpoint, outputResolution: r.output_resolution, usdPerSecond: r.usd }, tokens)!;
      expect(booked, r.id).toBeCloseTo((usdPerMillion * tokens) / 1e6, 2); // the row price is rounded up to 4 decimals of USD per second
      expect(booked, r.id).toBeGreaterThanOrEqual(Number(((usdPerMillion * tokens) / 1e6).toFixed(4)));
    }
  });

  test('adds Seedream 5.0 Pro and Flash and (0059) 4.5 and 4.0 disabled, with the features, ratios and limits of the fal Pro row and the per-image list price', async () => {
    const pick = `select kind, features, ratios, max_images, max_prompt_chars from model_configs where id = $1`;
    const [twin] = (await pool.query(pick, ['seedream-5-pro'])).rows;
    for (const id of ['seedream-5-pro-byteplus', 'seedream-5-flash-byteplus', 'seedream-4.5-byteplus', 'seedream-4.0-byteplus']) expect((await pool.query(pick, [id])).rows[0], id).toEqual(twin);
    const { rows } = await pool.query(`select id, provider, endpoint, enabled, image_prices, durations_sec from model_configs where provider = 'byteplus' and kind = 'image' order by id`);
    expect(rows).toEqual([
      { id: 'seedream-4.0-byteplus', provider: 'byteplus', endpoint: 'seedream-4-0-250828', enabled: false, image_prices: { '1K': '0.03', '2K': '0.03' }, durations_sec: [] },
      { id: 'seedream-4.5-byteplus', provider: 'byteplus', endpoint: 'seedream-4-5-251128', enabled: false, image_prices: { '2K': '0.04' }, durations_sec: [] },
      { id: 'seedream-5-flash-byteplus', provider: 'byteplus', endpoint: 'dola-seedream-5-0-flash-260915', enabled: false, image_prices: { '1K': '0.018', '2K': '0.018' }, durations_sec: [] },
      { id: 'seedream-5-pro-byteplus', provider: 'byteplus', endpoint: 'dola-seedream-5-0-pro-260628', enabled: false, image_prices: { '1K': '0.045', '2K': '0.09' }, durations_sec: [] },
    ]);
  });

  test('records where each fact was read, and changes no row that is enabled today', async () => {
    const { rows } = await pool.query(`select id, sources from model_configs where provider = 'byteplus' order by id`);
    for (const { id, sources } of rows) {
      const price = sources.usdPerSecond ?? sources.imagePrices;
      expect(price, id).toMatchObject({ url: 'https://docs.byteplus.com/en/docs/modelark/model-pricing', readAt: id.startsWith('seedream-4') ? '2026-11-04' : '2026-11-03' });
      expect(sources.endpoint, id).toEqual({ url: link('model-list'), readAt: '2026-11-04' });
    }
    expect((await pool.query(`select count(*)::int as n from model_configs where provider = 'byteplus' and enabled`)).rows).toEqual([{ n: 0 }]);
  });
});

describe('cost_entries', () => {
  test('is append-only: UPDATE, DELETE and TRUNCATE raise', async () => {
    const job = await insertJob(userId);
    await entry('estimate', job, '1.5000');
    await expect(pool.query(`update cost_entries set usd = 0 where job_id = $1`, [job])).rejects.toThrow(/append-only/);
    await expect(pool.query(`delete from cost_entries where job_id = $1`, [job])).rejects.toThrow(/append-only/);
    await expect(pool.query(`truncate cost_entries`)).rejects.toThrow(/append-only/);
    expect((await pool.query(`select usd::text from cost_entries where job_id = $1`, [job])).rows).toEqual([{ usd: '1.5000' }]);
  });

  test('refuses a manual_adjustment without a note', async () => {
    await expect(entry('manual_adjustment', null, '1', { note: null })).rejects.toThrow(/cost_entries_manual_note_check/);
    await expect(entry('manual_adjustment', null, '1', { note: '   ' })).rejects.toThrow(/cost_entries_manual_note_check/);
    await entry('manual_adjustment', null, '1', { note: 'fixed a typo in the invoice' });
  });

  test('allows a job row only with a job and a shared row only without one', async () => {
    const job = await insertJob(userId);
    await expect(entry('estimate', null, '1')).rejects.toThrow(/cost_entries_job_shared_check/);
    await expect(entry('bakeoff', job, '1')).rejects.toThrow(/cost_entries_job_shared_check/);
  });

  test('blocks a second estimate, actual_adjustment, release or late_bill for one job, but not a second store_reassign', async () => {
    const job = await insertJob(userId);
    for (const kind of ['estimate', 'actual_adjustment', 'release', 'late_bill']) {
      await entry(kind, job, '1');
      await expect(entry(kind, job, '1')).rejects.toThrow(/cost_entries_job_kind_once_idx/);
    }
    await entry('store_reassign', job, '1');
    await entry('store_reassign', job, '-1');
  });

  test('keeps a shared ref unique, so a second booking of the same ref fails', async () => {
    await entry('bakeoff', null, '3', { ref: 'bakeoff-2026-08-fal' });
    await expect(entry('bakeoff', null, '3', { ref: 'bakeoff-2026-08-fal' })).rejects.toThrow(/cost_entries_ref_unique/);
  });

  test('refuses a month that is not YYYY-MM and a shared row that names a user', async () => {
    await expect(pool.query(`insert into cost_entries (kind, usd, month) values ('bakeoff', 1, '2026-13')`)).rejects.toThrow(/cost_entries_month_check/);
    await expect(pool.query(`insert into cost_entries (kind, usd, month, user_id) values ('bakeoff', 1, '2026-10', $1)`, [userId])).rejects.toThrow(/cost_entries_shared_unattributed_check/);
  });

  test('migration 0055: an llm row may go without a job but names its user, team, day and a unique ref; the other kinds keep their rules', async () => {
    const llm = (jobId: string | null, ref: string | null, o: { user?: string | null; team?: string | null; day?: string | null; isFinal?: boolean } = {}) =>
      pool.query(
        `insert into cost_entries (kind, usd, month, day, user_id, team_id, job_id, provider, model, is_final, ref) values ('llm', 0.0004, '2026-11', $1, $2, $3, $4, 'fal', 'm', $5, $6)`,
        [o.day === undefined ? '2026-11-04' : o.day, o.user === undefined ? userId : o.user, o.team === undefined ? 'team-unassigned' : o.team, jobId, o.isFinal ?? jobId === null, ref],
      );
    const job = await insertJob(userId);
    await llm(null, 'llm:suggestion:s1');
    await llm(job, 'llm:enhance:j1');
    await expect(llm(null, 'llm:suggestion:s1')).rejects.toThrow(/cost_entries_ref_unique/);
    await expect(llm(null, null)).rejects.toThrow(/cost_entries_llm_check/);
    await expect(llm(null, 'llm:x1', { user: null })).rejects.toThrow(/cost_entries_llm_check/);
    await expect(llm(null, 'llm:x2', { team: null })).rejects.toThrow(/cost_entries_llm_check/);
    await expect(llm(null, 'llm:x3', { day: null })).rejects.toThrow(/cost_entries_llm_check/);
    await expect(llm(job, 'llm:x4', { isFinal: true })).rejects.toThrow(/cost_entries_llm_check/); // a job's llm row never closes it
    await expect(llm(null, 'llm:x5', { isFinal: false })).rejects.toThrow(/cost_entries_llm_check/); // a job-less one is always final
    // The rules of the other kinds are unchanged.
    await expect(entry('store_reassign', null, '1')).rejects.toThrow(/cost_entries_job_shared_check/);
    await expect(entry('invoice_diff', job, '1')).rejects.toThrow(/cost_entries_job_shared_check/);
    await expect(pool.query(`insert into cost_entries (kind, usd, month, team_id) values ('invoice_diff', 1, '2026-10', 'team-unassigned')`)).rejects.toThrow(/cost_entries_shared_unattributed_check/);
    await expect(pool.query(`insert into cost_entries (kind, usd, month, day, job_id) values ('estimate', 1, '2026-10', null, $1)`, [job])).rejects.toThrow(/cost_entries_day_check/);
    await expect(pool.query(`insert into cost_entries (kind, usd, month, day, job_id) values ('token', 1, '2026-10', '2026-10-01', $1)`, [job])).rejects.toThrow(/cost_entries_kind_check/);
  });

  test('job_costs sums the rows of a job and is final once a row closes it', async () => {
    const job = await insertJob(userId);
    await entry('estimate', job, '2.0000');
    expect((await pool.query(`select usd::text, is_final from job_costs where job_id = $1`, [job])).rows).toEqual([{ usd: '2.0000', is_final: false }]);
    await entry('actual_adjustment', job, '0.5000', { isFinal: true });
    expect((await pool.query(`select usd::text, is_final from job_costs where job_id = $1`, [job])).rows).toEqual([{ usd: '2.5000', is_final: true }]);
  });
});
