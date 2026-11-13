// The suggestion run against a disposable database on the compose Postgres (`pnpm services:up`). The suggester is a fake: no call reaches fal.
import { readFile, writeFile } from 'node:fs/promises';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { frameTimes, type Suggester, VIDEO_FRAMES } from '@cvs/core/suggest';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { extractFrames } from './media';
import { fakeSuggester, runSuggestion } from './suggest';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url, 2);
const input = { field: 'brief', text: 'linen dress', context: '', max: 1200 };
let seq = 0;

async function queued(ageSeconds = 0, i: object = input): Promise<string> {
  const id = `run-${++seq}`;
  await pool.query(`insert into suggestion_runs (id, user_id, input, created_at) values ($1, 'u1', $2, now() - make_interval(secs => $3))`, [id, JSON.stringify(i), ageSeconds]);
  return id;
}
const row = async (id: string) => (await pool.query('select status, output, cost_usd from suggestion_runs where id = $1', [id])).rows[0];
const ledger = async (id: string) => (await pool.query(`select kind, usd::text as usd, user_id, team_id, job_id, model, is_final from cost_entries where ref = $1`, [`llm:suggestion:${id}`])).rows;

beforeAll(async () => {
  await pool.query(`insert into users (id, email, name) values ('u1', 'u1@example.test', 'u1')`);
});

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

test('writes the options and the cost of a queued run, calling the suggester once with its input', async () => {
  const calls: unknown[] = [];
  const suggest: Suggester = async (i) => (calls.push(i), { options: ['a', 'b', 'c'], costUsd: 0.0004, provider: 'fal', model: 'google/gemini-2.5-flash' });
  const id = await queued();
  await runSuggestion(pool, suggest, id);
  expect(calls).toEqual([input]);
  expect(await row(id)).toEqual({ status: 'succeeded', output: ['a', 'b', 'c'], cost_usd: '0.000400' });
  await runSuggestion(pool, suggest, id); // a repeated delivery does nothing
  expect(calls).toHaveLength(1);
  expect(await ledger(id)).toEqual([{ kind: 'llm', usd: '0.0004', user_id: 'u1', team_id: 'team-unassigned', job_id: null, model: 'google/gemini-2.5-flash', is_final: true }]);
});

test('books no ledger row for a run without a cost or a failed call', async () => {
  const free = await queued();
  await runSuggestion(pool, async () => ({ options: ['a'], costUsd: 0, provider: 'fal', model: 'google/gemini-2.5-flash' }), free);
  const unknown = await queued();
  await runSuggestion(pool, async () => ({ options: ['a'], costUsd: null, provider: 'fal', model: 'google/gemini-2.5-flash' }), unknown);
  const failing = await queued();
  await expect(runSuggestion(pool, async () => Promise.reject(new Error('down')), failing)).rejects.toThrow('down');
  for (const id of [free, unknown, failing]) expect(await ledger(id)).toEqual([]);
});

test("a failed call or a missing suggester marks the run failed; a run past the page's wait (90 s) is not sent at all", async () => {
  const failing = await queued();
  await expect(runSuggestion(pool, async () => Promise.reject(new Error('rate limited')), failing)).rejects.toThrow('rate limited');
  expect((await row(failing)).status).toBe('failed');
  const none = await queued();
  await expect(runSuggestion(pool, undefined, none)).rejects.toThrow('FAL_KEY');
  expect((await row(none)).status).toBe('failed');
  let called = false;
  const stale = await queued(91);
  await runSuggestion(pool, async () => ((called = true), { options: ['x'], costUsd: null, provider: 'fal', model: 'google/gemini-2.5-flash' }), stale);
  expect(called).toBe(false);
  expect((await row(stale)).status).toBe('queued'); // the page marks it failed when it polls
});

test('the e2e stand-in answers three options from the text, within the limit', async () => {
  expect(await fakeSuggester({ field: 'script', text: '', context: '', max: 12 })).toEqual({
    options: ['Option 1: sc', 'Option 2: sc', 'Option 3: sc'],
    meanings: ['Reading 1: script', 'Reading 2: script', 'Reading 3: script'],
    costUsd: 0,
    provider: 'mock',
    model: 'fake',
  });
  expect(await fakeSuggester({ field: 'translate', text: 'slow turn', context: '', max: 100 })).toEqual({ options: ['Translation: slow turn'], costUsd: 0, provider: 'mock', model: 'fake' });
});

test('an option with a Vietnamese reading is stored as text and vi, one without as its text', async () => {
  const id = await queued();
  await runSuggestion(pool, async () => ({ options: ['a', 'b'], meanings: ['nghĩa a', null], costUsd: 0, provider: 'fal', model: 'google/gemini-2.5-flash' }), id);
  expect((await row(id)).output).toEqual([{ text: 'a', vi: 'nghĩa a' }, 'b']);
});

// An example clip from the repo's fixtures stands in for a preset's clip in the bucket.
const clip = () => readFile(new URL('../../web/public/fixtures/examples/example-1.mp4', import.meta.url));
const videoInput = { field: 'video', text: '', context: '', max: 5000, clip: 'preset-walk-left.mp4' };

test('the stills sit in the middle of equal slices of the clip, in order', () => {
  expect(frameTimes(8, VIDEO_FRAMES)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  expect(frameTimes(3, 2)).toEqual([0.75, 2.25]);
});

test('a clip gives eight small JPEG stills and its length', async () => {
  const { seconds, stills } = await extractFrames(new Uint8Array(await clip()), VIDEO_FRAMES);
  expect(seconds).toBeGreaterThan(0);
  expect(stills).toHaveLength(8);
  for (const f of stills) {
    const { format, width = 0, height = 0 } = await sharp(f).metadata();
    expect(format).toBe('jpeg');
    expect(Math.max(width, height)).toBeLessThanOrEqual(512);
  }
});

test("a video run reads the preset's clip from the bucket, sends its stills as JPEG data URLs, and books the call like any suggestion", async () => {
  const keys: string[] = [];
  const seen: { input: unknown; frames?: string[] }[] = [];
  const suggest: Suggester = async (i, frames) => (seen.push({ input: i, frames }), { options: ['The camera tracks left.'], costUsd: 0.0012, provider: 'fal', model: 'google/gemini-2.5-flash' });
  const id = await queued(0, videoInput);
  await runSuggestion(pool, suggest, id, async (key) => (keys.push(key), new Uint8Array(await clip())));
  expect(keys).toEqual(['samples/preset-walk-left.mp4']);
  expect(seen[0]!.input).toEqual({ ...videoInput, seconds: expect.any(Number) }); // the measured length times each still in the call
  expect(seen[0]!.frames).toHaveLength(8);
  seen[0]!.frames!.forEach((f) => expect(f).toMatch(/^data:image\/jpeg;base64,\/9j\//));
  expect(await row(id)).toEqual({ status: 'succeeded', output: ['The camera tracks left.'], cost_usd: '0.001200' });
  expect(await ledger(id)).toEqual([{ kind: 'llm', usd: '0.0012', user_id: 'u1', team_id: 'team-unassigned', job_id: null, model: 'google/gemini-2.5-flash', is_final: true }]);
});

test('a clip that cannot be read fails the run without calling the suggester', async () => {
  let called = false;
  const id = await queued(0, videoInput);
  await expect(runSuggestion(pool, async () => ((called = true), { options: ['x'], costUsd: null, provider: 'fal', model: 'm' }), id, () => Promise.reject(new Error('NoSuchKey')))).rejects.toThrow('NoSuchKey');
  expect(called).toBe(false);
  expect((await row(id)).status).toBe('failed');
});

const scenesInput = { field: 'scenes', text: '', context: '', max: 0, sourceKey: 'r2:analyses/v.mp4', productKey: 'assets/p.png', times: [0.2, 1.1, 999] };
// A cut-out product: a transparent PNG, which must reach the vision call on white, not black.
const png = () => sharp({ create: { width: 900, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

// The reference video as the bucket would stream it to disk.
const saveClip = async (_key: string, file: string) => writeFile(file, await clip());

test("a scenes run reads the product and saves the video to disk, sends the product then one still per scene (a time past the end is kept inside it), and stores and books the scene numbers", async () => {
  const read: string[] = [];
  const saved: string[] = [];
  const seen: { input: unknown; frames?: string[] }[] = [];
  const suggest: Suggester = async (i, frames) => (seen.push({ input: i, frames }), { options: ['1', '3'], costUsd: 0.0009, provider: 'fal', model: 'google/gemini-2.5-flash' });
  const id = await queued(0, scenesInput);
  await runSuggestion(pool, suggest, id, async (key) => (read.push(key), new Uint8Array(await png())), async (key, file) => (saved.push(key), saveClip(key, file)));
  expect(read).toEqual(['assets/p.png']); // the video never comes into memory
  expect(saved).toEqual(['r2:analyses/v.mp4']);
  expect(seen[0]!.input).toEqual(scenesInput);
  expect(seen[0]!.frames).toHaveLength(4);
  for (const f of seen[0]!.frames!) expect(f).toMatch(/^data:image\/jpeg;base64,\/9j\//);
  const product = sharp(Buffer.from(seen[0]!.frames![0]!.split(',')[1]!, 'base64'));
  const { width = 0, height = 0 } = await product.metadata();
  expect(Math.max(width, height)).toBe(512); // the 900 px product is shrunk like the stills
  expect((await product.stats()).channels[0]!.mean).toBeGreaterThan(250); // its transparency is white
  expect(await row(id)).toEqual({ status: 'succeeded', output: ['1', '3'], cost_usd: '0.000900' });
  expect(await ledger(id)).toEqual([{ kind: 'llm', usd: '0.0009', user_id: 'u1', team_id: 'team-unassigned', job_id: null, model: 'google/gemini-2.5-flash', is_final: true }]);
});

test('a scenes run whose answer cannot be read fails with nothing booked; one whose product is missing never calls the suggester', async () => {
  const bad = await queued(0, scenesInput);
  await expect(runSuggestion(pool, async () => Promise.reject(new Error('suggest: the answer is not JSON')), bad, async () => new Uint8Array(await png()), saveClip)).rejects.toThrow('not JSON');
  expect((await row(bad)).status).toBe('failed');
  expect(await ledger(bad)).toEqual([]);
  let called = false;
  const gone = await queued(0, scenesInput);
  await expect(runSuggestion(pool, async () => ((called = true), { options: [], costUsd: null, provider: 'fal', model: 'm' }), gone, () => Promise.reject(new Error('NoSuchKey')), saveClip)).rejects.toThrow('NoSuchKey');
  expect(called).toBe(false);
  expect((await row(gone)).status).toBe('failed');
});

test('a scenes run whose download stalls stops when the queue gives up on the job, and fails without calling the suggester', async () => {
  const id = await queued(0, scenesInput);
  const queue = new AbortController();
  let saving!: () => void;
  const started = new Promise<void>((go) => (saving = go));
  // A download that never ends on its own, as a stalled bucket read: only the signal stops it.
  const stalled = (_key: string, _file: string, signal?: AbortSignal) => new Promise<void>((_, fail) => (signal!.addEventListener('abort', () => fail(signal!.reason)), saving()));
  let called = false;
  const run = runSuggestion(pool, async () => ((called = true), { options: [], costUsd: null, provider: 'fal', model: 'm' }), id, async () => new Uint8Array(await png()), stalled, queue.signal);
  await started;
  queue.abort(new Error('handler execution exceeded 60s'));
  await expect(run).rejects.toThrow('exceeded 60s');
  expect(called).toBe(false);
  expect((await row(id)).status).toBe('failed');
});

test('the e2e stand-in picks the first two scenes of a scenes run, at no cost and without a network call', async () => {
  expect(await fakeSuggester({ ...scenesInput, field: 'scenes' })).toEqual({ options: ['1', '2'], costUsd: 0, provider: 'mock', model: 'fake' });
  expect((await fakeSuggester({ ...scenesInput, field: 'scenes', times: [0.5] })).options).toEqual(['1']);
});

test('the e2e stand-in writes a house-style preset prompt from the stills without any network call', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    const out = await fakeSuggester({ field: 'video', text: '', context: '', max: 5000, clip: 'preset-x.mp4' }, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(out.options).toHaveLength(1);
    expect(out.options[0]).toMatch(/^Mock motion read from 8 stills: .* Keep the person, their face, the outfit, .* Smooth, stable camera\.$/);
    expect(out.costUsd).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
