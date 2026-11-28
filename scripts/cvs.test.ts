import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { EXIT, exitFor, main, redact, type Deps } from './cvs.ts';

// Built at runtime so the secret scanner does not flag this fake token in the public repo.
const TOKEN = ['cvs', 'pat', 'abcdefghijkl', 'x'.repeat(43)].join('_');
type Seen = { method: string; url: string; headers: Record<string, string>; body: unknown; signal?: AbortSignal | null };

/** A fake server: each fetch takes the next answer in order and records what was sent. */
function harness(answers: Array<Response | Error>, opts: { tty?: boolean; reply?: string } = {}) {
  const seen: Seen[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  let sleeps = 0;
  const deps: Deps = {
    fetch: (async (url: string, init: RequestInit = {}) => {
      seen.push({ method: init.method ?? 'GET', url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body, signal: init.signal });
      const next = answers.shift();
      if (!next) throw new Error('no more answers');
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    env: { CVS_AGENT_TOKEN: TOKEN, CVS_URL: 'https://cvs.test/' },
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    tty: opts.tty ?? false,
    ask: async (q) => (asked.push(q), opts.reply ?? 'n'),
    sleep: async () => void sleeps++,
  };
  return { deps, seen, out, err, asked, sleeps: () => sleeps };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const dryRun = (token = 'conf-1', estimateUsd: number | null = 0.4) => json(428, { error: 'confirm_required', estimateUsd, confirmToken: token, expiresAt: '2026-11-28T10:10:00Z', tokenMonth: { usedUsd: 1.5 } });

function runFile(body: unknown = { modelId: 'veo', prompt: 'a cat', durationSec: 5 }) {
  const file = join(mkdtempSync(join(tmpdir(), 'cvs-cli-')), 'run.json');
  writeFileSync(file, JSON.stringify(body));
  return file;
}

test('argument errors are usage (1), and help prints the usage', async () => {
  for (const argv of [[], ['nope'], ['jobs', '--limit', '0'], ['models', '--kind', 'audio'], ['job'], ['jobs', '--bogus']]) {
    const h = harness([]);
    expect(await main(argv, h.deps), argv.join(' ')).toBe(EXIT.usage);
    expect(h.seen).toEqual([]);
  }
  const h = harness([]);
  expect(await main(['--help'], h.deps)).toBe(EXIT.ok);
  expect(h.out.join('\n')).toContain('Usage: cvs');
});

test('no token is an auth error and sends nothing', async () => {
  const h = harness([]);
  h.deps.env = {};
  expect(await main(['limits'], h.deps)).toBe(EXIT.auth);
  expect(h.seen).toEqual([]);
});

test('HTTP answers map to the documented exit codes', async () => {
  expect([401, 403, 409, 413, 415, 429, 500, 503, 400, 404].map(exitFor)).toEqual([2, 2, 3, 3, 3, 3, 4, 4, 1, 1]);
  const h = harness([json(429, { error: 'rate_limited' }, { 'x-retry-after': '12' })]);
  expect(await main(['limits'], h.deps)).toBe(EXIT.refused);
  expect(h.err.join('\n')).toContain('retry after 12s');
  const n = harness([new Error('ECONNREFUSED')]);
  expect(await main(['limits'], n.deps)).toBe(EXIT.server);
});

test('the token goes only in the Authorization header and is redacted from any output', async () => {
  expect(redact(`bad ${TOKEN} and cvs_ort_${'x'.repeat(43)} and cvs_oat_a-b_c`)).toBe('bad cvs_pat_[redacted] and cvs_ort_[redacted] and cvs_oat_[redacted]');
  const h = harness([json(401, { error: 'unauthenticated', message: `token ${TOKEN} is revoked` })]);
  expect(await main(['limits'], h.deps)).toBe(EXIT.auth);
  expect(h.seen[0]!.url).toBe('https://cvs.test/api/me/limits');
  expect(h.seen[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect([...h.out, ...h.err].join('\n')).not.toContain(TOKEN);
  expect(h.err.join('\n')).toContain('cvs_pat_[redacted]');
});

test('run: the 428 dry run, then the same body again with x-cvs-confirm, gives the job', async () => {
  const file = runFile();
  const h = harness([dryRun(), json(201, { id: 'job-1', status: 'queued' })]);
  expect(await main(['run', file, '--yes', '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => [s.method, s.url, s.headers['x-cvs-confirm']])).toEqual([
    ['POST', 'https://cvs.test/api/jobs', undefined],
    ['POST', 'https://cvs.test/api/jobs', 'conf-1'],
  ]);
  expect(h.seen[1]!.body).toBe(h.seen[0]!.body);
  expect(JSON.parse(h.out[0]!)).toEqual({ id: 'job-1', status: 'queued' });
  expect(h.err.join('\n')).toContain('Estimate: $0.40');
});

test('run without --yes asks on a TTY and refuses when not on one', async () => {
  const file = runFile();
  const ci = harness([dryRun()]);
  expect(await main(['run', file], ci.deps)).toBe(EXIT.refused);
  expect(ci.seen).toHaveLength(1);
  const no = harness([dryRun()], { tty: true, reply: 'n' });
  expect(await main(['run', file], no.deps)).toBe(EXIT.refused);
  expect(no.seen).toHaveLength(1);
  const yes = harness([dryRun(), json(201, { id: 'job-2', status: 'queued' })], { tty: true, reply: 'y' });
  expect(await main(['run', file], yes.deps)).toBe(EXIT.ok);
  expect(yes.asked).toEqual(['Proceed? [y/N] ']);
  expect(yes.out[0]).toContain('job job-2 queued');
});

test('a spent confirm (409 confirm_used) is never a success', async () => {
  const h = harness([dryRun(), json(409, { error: 'confirm_used' })]);
  expect(await main(['run', runFile(), '--yes'], h.deps)).toBe(EXIT.refused);
  expect(h.out).toEqual([]);
  expect(h.err.join('\n')).toContain('cvs jobs');
});

test('a lost answer is retried once with the same confirm, and the replay is reported', async () => {
  const h = harness([dryRun(), new Error('socket hang up'), json(201, { id: 'job-3', status: 'queued' }, { 'x-cvs-replay': '1' })]);
  expect(await main(['run', runFile(), '--yes', '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => s.headers['x-cvs-confirm'])).toEqual([undefined, 'conf-1', 'conf-1']);
  expect(JSON.parse(h.out[0]!).id).toBe('job-3');
  expect(h.err.join('\n')).toContain('replayed');
});

test('a changed price (409 confirm_stale) is confirmed again with its fresh token', async () => {
  const h = harness([dryRun(), json(409, { error: 'confirm_stale', estimateUsd: 0.6, confirmToken: 'conf-2' }), json(201, { id: 'job-4', status: 'queued' })]);
  expect(await main(['run', runFile(), '--yes'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => s.headers['x-cvs-confirm'])).toEqual([undefined, 'conf-1', 'conf-2']);
  expect(h.err.join('\n')).toContain('The price changed. Estimate: $0.60');
});

test('estimate only prices: one call, no confirm sent; a one-tap app goes to its run route', async () => {
  const h = harness([dryRun('t', null)]);
  expect(await main(['estimate', runFile({ customAppId: 'my-app', assetIds: ['a1'], prompt: 'ignored' }), '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen).toHaveLength(1);
  expect(h.seen[0]!.url).toBe('https://cvs.test/api/custom-apps/my-app/run');
  expect(JSON.parse(h.seen[0]!.body as string)).toEqual({ assetIds: ['a1'] });
  expect(JSON.parse(h.out[0]!).estimateUsd).toBeNull();
});

test('job --wait polls until the job ends and prints the result URLs', async () => {
  const job = (status: string, extra = {}) => json(200, { id: 'job-5', status, feature: 'video', model: 'veo', outputAssetId: null, batchItems: null, ...extra });
  const h = harness([job('queued'), job('running'), job('succeeded', { outputAssetId: 'asset-9' })]);
  expect(await main(['job', 'job-5', '--wait'], h.deps)).toBe(EXIT.ok);
  expect(h.seen).toHaveLength(3);
  expect(h.sleeps()).toBe(2);
  expect(h.out[0]).toContain('https://cvs.test/api/assets/asset-9/content');
  const once = harness([job('failed', { error: 'provider refused' })]);
  expect(await main(['job', 'job-5', '--wait'], once.deps)).toBe(EXIT.ok);
  expect(once.sleeps()).toBe(0);
});

test('cancel asks first and posts once when the route needs no confirm', async () => {
  const ci = harness([]);
  expect(await main(['cancel', 'job-6'], ci.deps)).toBe(EXIT.refused);
  expect(ci.seen).toEqual([]);
  const h = harness([json(200, { id: 'job-6', status: 'failed', canceled: true })]);
  expect(await main(['cancel', 'job-6', '--yes'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => [s.method, s.url])).toEqual([['POST', 'https://cvs.test/api/jobs/job-6/cancel']]);
  const started = harness([json(409, { error: 'started' })]);
  expect(await main(['cancel', 'job-6', '--yes'], started.deps)).toBe(EXIT.refused);
});

test('download saves each result inside the chosen folder', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'cvs-dl-')), 'out');
  const h = harness([
    json(200, { id: 'job-7', status: 'succeeded', outputAssetId: 'asset-1', batchItems: null }),
    new Response('VIDEO', { status: 200, headers: { 'content-disposition': `inline; filename="x"; filename*=UTF-8''..%2F..%2Fclip.mp4` } }),
  ]);
  expect(await main(['download', 'job-7', '-o', dir], h.deps)).toBe(EXIT.ok);
  expect(readFileSync(join(dir, 'clip.mp4'), 'utf8')).toBe('VIDEO');
  expect(h.seen[1]!.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
});

test('upload sends a small file as multipart and answers its asset id', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cvs-up-')), 'shirt.png');
  writeFileSync(file, 'PNG');
  const h = harness([json(201, { assets: [{ id: 'asset-2', filename: 'shirt.png', mime: 'image/png' }] })]);
  expect(await main(['upload', file, '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen[0]!.body).toBeInstanceOf(FormData);
  expect(JSON.parse(h.out[0]!).id).toBe('asset-2');
  const bad = harness([]);
  expect(await main(['upload', 'notes.txt'], bad.deps)).toBe(EXIT.usage);
});

test('whoami reads the whoami tool answer, also when it comes as an event stream', async () => {
  const answer = { user: { name: 'An', email: 'an@x.test', role: 'admin' }, workspace: { name: 'VET' }, connection: { name: 'n8n', kind: 'pat' }, tokenMonth: { usedUsd: 2 } };
  const rpc = { jsonrpc: '2.0', id: 1, result: { content: [], structuredContent: answer } };
  const h = harness([new Response(`event: message\ndata: ${JSON.stringify(rpc)}\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })]);
  expect(await main(['whoami'], h.deps)).toBe(EXIT.ok);
  expect(h.seen[0]!.url).toBe('https://cvs.test/api/mcp');
  expect(h.out[0]).toContain('An <an@x.test> (admin)');
});

test('a 502/503/504 after the confirmed send is resent once with the same confirm', async () => {
  const h = harness([dryRun(), json(503, { error: 'unavailable' }), json(201, { id: 'job-8', status: 'queued' }, { 'x-cvs-replay': '1' })]);
  expect(await main(['run', runFile(), '--yes', '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => s.headers['x-cvs-confirm'])).toEqual([undefined, 'conf-1', 'conf-1']);
  expect(JSON.parse(h.out[0]!).id).toBe('job-8');
});

test('any failure after the confirm points at `cvs jobs` and never starts a new dry run', async () => {
  for (const answers of [[json(500, { error: 'boom' })], [json(504, {}), json(502, {})], [new Error('reset'), new Error('reset')]]) {
    const h = harness([dryRun(), ...answers]);
    expect(await main(['run', runFile(), '--yes'], h.deps)).toBe(EXIT.server);
    expect(h.seen.slice(1).every((s) => s.headers['x-cvs-confirm'] === 'conf-1')).toBe(true);
    expect(h.err.join('\n')).toContain('cvs jobs');
  }
});

test('CVS_URL over plain http is refused unless it is this machine', async () => {
  for (const url of ['http://cvs.example.com', 'http://10.0.0.5:3000', 'ftp://cvs.test', 'not a url']) {
    const h = harness([]);
    h.deps.env.CVS_URL = url;
    expect(await main(['limits'], h.deps), url).toBe(EXIT.usage);
    expect(h.seen).toEqual([]);
    expect(h.err.join('\n')).not.toContain(TOKEN);
  }
  for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000/', 'http://[::1]:3000']) {
    const h = harness([json(200, { ok: true })]);
    h.deps.env.CVS_URL = url;
    expect(await main(['limits'], h.deps), url).toBe(EXIT.ok);
  }
});

test('every request carries a timeout, and job --wait gives up after --timeout minutes', async () => {
  const h = harness([json(200, { ok: true })]);
  expect(await main(['limits'], h.deps)).toBe(EXIT.ok);
  expect(h.seen[0]!.signal).toBeInstanceOf(AbortSignal);
  const running = () => json(200, { id: 'job-9', status: 'running', batchItems: null });
  const w = harness([running(), running(), running(), running()]);
  expect(await main(['job', 'job-9', '--wait', '--timeout', '0.1'], w.deps)).toBe(EXIT.server);
  expect(w.seen).toHaveLength(3);
  expect(w.err.join('\n')).toContain('still running');
  expect(await main(['job', 'job-9', '--wait', '--timeout', '0'], harness([]).deps)).toBe(EXIT.usage);
});

test('download saves every output of a batch Run (batchItems), with distinct safe names, and never overwrites', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cvs-dl-'));
  const file = (name: string, body: string) => new Response(body, { status: 200, headers: { 'content-disposition': `inline; filename*=UTF-8''${name}` } });
  const job = json(200, { id: 'job-10', status: 'succeeded', outputAssetId: 'a1', batchItems: [{ id: 'job-10', outputAssetId: 'a1' }, { id: 'job-11', outputAssetId: 'a2' }, { id: 'job-12', outputAssetId: 'a3' }, { id: 'job-13', outputAssetId: null }] });
  const h = harness([job, file('a%3Ab.png', 'ONE'), file('a%3Ab.png', 'TWO'), file('%E0%A4%A', 'THREE')]);
  expect(await main(['download', 'job-10', '-o', dir, '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen).toHaveLength(4);
  expect(readFileSync(join(dir, 'a_b.png'), 'utf8')).toBe('ONE');
  expect(readFileSync(join(dir, 'a_b-2.png'), 'utf8')).toBe('TWO');
  expect(readFileSync(join(dir, 'a3'), 'utf8')).toBe('THREE');
  const again = harness([json(200, { id: 'job-14', status: 'succeeded', outputAssetId: 'a1', batchItems: null }), file('a_b.png', 'NEW')]);
  expect(await main(['download', 'job-14', '-o', dir], again.deps)).toBe(EXIT.usage);
  expect(again.err.join('\n')).toContain('--force');
  expect(readFileSync(join(dir, 'a_b.png'), 'utf8')).toBe('ONE');
  const forced = harness([json(200, { id: 'job-14', status: 'succeeded', outputAssetId: 'a1', batchItems: null }), file('a_b.png', 'NEW')]);
  expect(await main(['download', 'job-14', '-o', dir, '--force'], forced.deps)).toBe(EXIT.ok);
  expect(readFileSync(join(dir, 'a_b.png'), 'utf8')).toBe('NEW');
});

test('a video over 20 MB goes by presign and is PUT without a copy', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cvs-up-')), 'clip.mp4');
  writeFileSync(file, Buffer.alloc(21 * 1024 * 1024));
  const h = harness([json(200, { url: 'https://storage.test/put', assetId: 'asset-3' }), new Response(null, { status: 200 }), json(200, { asset: { id: 'asset-3' } })]);
  expect(await main(['upload', file, '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen.map((s) => [s.method, s.url])).toEqual([['POST', 'https://cvs.test/api/assets/presign-video'], ['PUT', 'https://storage.test/put'], ['POST', 'https://cvs.test/api/assets/finalize-video']]);
  expect(Buffer.isBuffer(h.seen[1]!.body)).toBe(true);
  expect(h.seen[1]!.headers.authorization).toBeUndefined();
});

test('a tool auth error is exit 2', async () => {
  const rpc = { jsonrpc: '2.0', id: 1, result: { isError: true, content: [], structuredContent: { error: 'forbidden' } } };
  const h = harness([json(200, rpc)]);
  expect(await main(['whoami'], h.deps)).toBe(EXIT.auth);
});

test('library --limit is capped at the 1000 items MCP lists', async () => {
  const page = (n: number) => json(200, { clips: Array.from({ length: 20 }, (_, i) => ({ id: `c${n}-${i}` })), hasMore: true });
  const h = harness(Array.from({ length: 60 }, (_, n) => page(n)));
  expect(await main(['library', '--limit', '5000', '--json'], h.deps)).toBe(EXIT.ok);
  expect(h.seen).toHaveLength(50);
  expect(JSON.parse(h.out[0]!).items).toHaveLength(1000);
});
