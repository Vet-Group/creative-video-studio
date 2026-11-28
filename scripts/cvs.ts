// cvs: Creative Video Studio from a terminal, a script, n8n or Hermes with an agent token, no MCP client (docs/AGENT-ACCESS.md "CLI").
// Zero dependencies: `node scripts/cvs.ts <command>` under Node's type stripping. The token comes only from CVS_AGENT_TOKEN and is never printed.
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

export const EXIT = { ok: 0, usage: 1, auth: 2, refused: 3, server: 4 } as const;
export type Deps = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  out: (s: string) => void;
  err: (s: string) => void;
  tty: boolean;
  ask: (question: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
};
type Json = Record<string, any>;
type Ctx = Deps & { base: string; token: string };
type Answer = { status: number; body: Json; headers: Headers; text?: string };
type Result = { data: unknown; human: string };

const USAGE = `Usage: cvs <command> [options]   (CVS_AGENT_TOKEN required; CVS_URL defaults to https://video.vetgroup.net)
  whoami                          the user, workspace and connection of the token
  limits                          Run caps used today and this month
  models [--kind video|image]     enabled models with their price
  apps                            app features and published one-tap apps
  presets [--kind video|image]    motion presets
  estimate <run.json>             price a run (dry run, nothing is charged)
  run <run.json> [--yes]          create a paid job after a confirm
  jobs [--limit N] [--status S] [--before ID]
  job <id> [--wait] [--timeout M] a job; --wait polls until it ends or M minutes pass (default 30)
  cancel <id> [--yes]             cancel a queued job
  download <id> [-o dir] [--force] save a job's result media; --force overwrites existing files
  upload <file>                   upload an image, video or audio input
  library [--limit N]             the workspace Library
Options: --json prints the raw JSON answer. Exit codes: 0 ok, 1 usage, 2 auth, 3 refused or limit, 4 server or network.`;

const ACTIVE = ['queued', 'submitting', 'running'];
const POLL_MS = 5000;
const TIMEOUT_MS = 60_000;
const BODY_TIMEOUT_MS = 10 * 60_000; // an upload or download body
const MAX_LIBRARY = 1000; // library_list (MCP) lists the newest 1000 items
const MAX_MULTIPART_VIDEO = 20 * 1024 * 1024; // POST /api/assets caps a video here; bigger ones go straight to storage (presign-video)
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

export class CliError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

/** Hide any CVS token or refresh token in text that is about to be printed. */
export const redact = (s: string) => s.replace(/cvs_(pat|oat|ort)_[A-Za-z0-9_-]+/g, 'cvs_$1_[redacted]');

export function exitFor(status: number): number {
  if (status === 401 || status === 403) return EXIT.auth;
  if ([409, 413, 415, 429].includes(status)) return EXIT.refused;
  if (status >= 500) return EXIT.server;
  return EXIT.usage;
}

function fail(a: Answer): never {
  const b = a.body;
  const retry = a.headers.get('x-retry-after');
  const text = [b.error ?? `HTTP ${a.status}`, b.message, b.code, retry && `retry after ${retry}s`].filter(Boolean).join(': ');
  throw new CliError(`${a.status} ${text}`, exitFor(a.status));
}

async function call(ctx: Ctx, method: string, path: string, opts: { json?: unknown; form?: FormData; confirm?: string; headers?: Json } = {}): Promise<Answer> {
  const headers: Json = { authorization: `Bearer ${ctx.token}`, ...opts.headers };
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  if (opts.confirm) headers['x-cvs-confirm'] = opts.confirm;
  let res: Response;
  let text: string;
  try {
    res = await ctx.fetch(`${ctx.base}${path}`, {
      method,
      headers,
      body: opts.form ?? (opts.json === undefined ? undefined : JSON.stringify(opts.json)),
      signal: AbortSignal.timeout(opts.form ? BODY_TIMEOUT_MS : TIMEOUT_MS),
    });
    text = await res.text();
  } catch (e) {
    throw new CliError(`network error: ${(e as Error).message}`, EXIT.server);
  }
  let body: Json;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: `HTTP ${res.status}`, message: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers, text };
}

async function get(ctx: Ctx, path: string): Promise<Json> {
  const a = await call(ctx, 'GET', path);
  if (a.status !== 200) fail(a);
  return a.body;
}

/** One call to a tool of /api/mcp, for the answers no REST route gives (whoami, apps). A plain JSON-RPC POST, no MCP client. */
async function tool(ctx: Ctx, name: string): Promise<Json> {
  const a = await call(ctx, 'POST', '/api/mcp', {
    json: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } },
    headers: { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
  });
  if (a.status !== 200) fail(a);
  // The SDK may answer as a one-event stream: its JSON-RPC message is the data line.
  const rpc = a.body.jsonrpc ? a.body : JSON.parse((a.text ?? '').split('\n').find((l) => l.startsWith('data: '))?.slice(6) ?? '{}');
  const r = rpc.result;
  const error = r?.structuredContent?.error;
  if (!r || r.isError) throw new CliError(`${name}: ${error ?? rpc.error?.message ?? 'no answer'}`, ['unauthenticated', 'forbidden', 'http_401', 'http_403'].includes(error) ? EXIT.auth : EXIT.server);
  return r.structuredContent;
}

/** A write behind the confirm: the first call gets the 428 dry run, the user agrees (or --yes), then the same request goes again with x-cvs-confirm. */
async function confirmed(ctx: Ctx, path: string, body: unknown, yes: boolean): Promise<Answer> {
  let a = await call(ctx, 'POST', path, { json: body });
  let sent = false;
  try {
    // A changed price (409 confirm_stale) carries a fresh token: it is shown and agreed to like the first dry run.
    for (let round = 0; a.status === 428 || (a.status === 409 && a.body.error === 'confirm_stale'); round++) {
      if (round === 3 || !a.body.confirmToken) fail(a);
      ctx.err(estimateText(a.body));
      if (!yes) {
        if (!ctx.tty) throw new CliError('refused: confirm needed; pass --yes to agree non-interactively', EXIT.refused);
        if (!/^y(es)?$/i.test((await ctx.ask('Proceed? [y/N] ')).trim())) throw new CliError('canceled', EXIT.refused);
      }
      const token = a.body.confirmToken as string;
      const send = () => call(ctx, 'POST', path, { json: body, confirm: token });
      sent = true;
      // A paid create replays its first answer to the same confirm, so one resend after a lost answer (network error, 502, 503, 504) cannot run twice.
      const first = await send().catch((e) => {
        if (!(e instanceof CliError) || e.code !== EXIT.server) throw e;
        return null;
      });
      a = first && ![502, 503, 504].includes(first.status) ? first : await send();
    }
    if (a.status === 409 && a.body.error === 'confirm_used')
      throw new CliError('409 confirm_used: this confirm was already spent. Check `cvs jobs` or `cvs job <id>` before running it again.', EXIT.refused);
    if (a.status < 200 || a.status >= 300) fail(a);
  } catch (e) {
    if (sent && e instanceof CliError && !e.message.includes('cvs jobs')) e.message += '. The job may exist already: check `cvs jobs` before running it again.';
    throw e;
  }
  if (a.headers.get('x-cvs-replay') === '1') ctx.err('note: the server replayed the first answer to this confirm; nothing new was created');
  return a;
}

function estimateText(b: Json): string {
  const usd = b.estimateUsd == null ? 'not priced upfront' : `$${Number(b.estimateUsd).toFixed(2)}`;
  const month = b.tokenMonth?.usedUsd == null ? '' : `, this connection spent $${Number(b.tokenMonth.usedUsd).toFixed(2)} this month`;
  const changed = b.error === 'confirm_stale' ? 'The price changed. ' : '';
  return `${changed}Estimate: ${usd}${month}. Confirm expires ${b.expiresAt ?? 'in 10 minutes'}.`;
}

function table(rows: Json[], cols: string[]): string {
  if (rows.length === 0) return '(none)';
  const cell = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(width[i]!)).join('  ').trimEnd();
  return [line(cols), ...rows.map((r) => line(cols.map((c) => cell(r[c]))))].join('\n');
}

async function runFile(file: string): Promise<Json> {
  let run: unknown;
  try {
    run = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new CliError(`cannot read ${file}: ${(e as Error).message}`, EXIT.usage);
  }
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new CliError(`${file} must hold a JSON object`, EXIT.usage);
  return run as Json;
}

/** The route and body of a run file: a one-tap app (customAppId) goes to its own run route with only assetIds, as job_create does. */
function runTarget(run: Json): [string, Json] {
  const { customAppId, ...body } = run;
  return customAppId ? [`/api/custom-apps/${encodeURIComponent(customAppId)}/run`, { assetIds: run.assetIds ?? [] }] : ['/api/jobs', body];
}

const assetUrl = (ctx: Ctx, id: string) => `${ctx.base}/api/assets/${encodeURIComponent(id)}/content`;
/** A job's result assets: its own output, or every output of a batch app's Run. */
const outputs = (job: Json): string[] => [...new Set([job.outputAssetId, ...((job.batchItems as Json[] | null) ?? []).map((i) => i.outputAssetId)].filter((x): x is string => typeof x === 'string'))];

function jobView(ctx: Ctx, job: Json): Result {
  const urls = outputs(job).map((id) => assetUrl(ctx, id));
  const data = { id: job.id, status: job.status, error: job.error ?? null, feature: job.feature, modelId: job.model ?? job.modelId ?? null, outputs: urls };
  return { data, human: [`${job.id}  ${job.status}${job.error ? `  ${job.error}` : ''}`, ...urls].join('\n') };
}

/** A server-sent file name made safe on any OS: its last path part, without Windows-invalid characters or device names. */
function safeName(raw: string, fallback: string): string {
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  name = (name.split(/[\\/]/).pop() ?? '').replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  if (!name) return fallback;
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) ? `_${name}` : name;
}

function need(arg: string | undefined, what: string): string {
  if (!arg) throw new CliError(`missing ${what}\n\n${USAGE}`, EXIT.usage);
  return arg;
}

async function command(ctx: Ctx, cmd: string, args: string[], o: Json): Promise<Result> {
  const kind = o.kind ?? 'video';
  if (o.kind && !['video', 'image'].includes(o.kind)) throw new CliError('--kind must be video or image', EXIT.usage);
  const limit = o.limit === undefined ? 20 : Number(o.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new CliError('--limit must be a positive whole number', EXIT.usage);
  const minutes = o.timeout === undefined ? 30 : Number(o.timeout);
  if (!(minutes > 0)) throw new CliError('--timeout must be a positive number of minutes', EXIT.usage);
  switch (cmd) {
    case 'whoami': {
      const w = await tool(ctx, 'whoami');
      return { data: w, human: `${w.user.name} <${w.user.email}> (${w.user.role})\nworkspace: ${w.workspace?.name ?? w.workspace?.workspaceId ?? ''}\nconnection: ${w.connection.name} (${w.connection.kind}), spent $${Number(w.tokenMonth?.usedUsd ?? 0).toFixed(2)} this month` };
    }
    case 'limits': {
      const l = await get(ctx, '/api/me/limits');
      return { data: l, human: JSON.stringify(l, null, 2) };
    }
    case 'models': {
      const m = await get(ctx, kind === 'video' ? '/api/models?feature=video&ratio=9%3A16&durationSec=5' : '/api/image-models?feature=image');
      return { data: m, human: table(m.models, kind === 'video' ? ['id', 'label', 'estimateUsd', 'recommended'] : ['id', 'label', 'prices', 'recommended']) };
    }
    case 'apps': {
      const a = await tool(ctx, 'apps_list');
      return { data: a, human: `${table(a.apps, ['feature', 'name'])}\n\nOne-tap apps:\n${table(a.customApps, ['customAppId', 'name'])}` };
    }
    case 'presets': {
      const p = await get(ctx, `/api/presets?feature=${kind}`);
      return { data: p, human: table(p.presets, ['id', 'label', 'group']) };
    }
    case 'estimate': {
      const [path, body] = runTarget(await runFile(need(args[0], 'run.json')));
      const a = await call(ctx, 'POST', path, { json: body });
      if (a.status !== 428) fail(a);
      const { estimateUsd = null, tokenMonth = null, summary = null } = a.body;
      return { data: { estimateUsd, tokenMonth, summary }, human: estimateText(a.body) };
    }
    case 'run': {
      const [path, body] = runTarget(await runFile(need(args[0], 'run.json')));
      const a = await confirmed(ctx, path, body, o.yes);
      return { data: a.body, human: `job ${a.body.id} ${a.body.status}\nfollow it: cvs job ${a.body.id} --wait` };
    }
    case 'jobs': {
      const rows: Json[] = [];
      for (let before = o.before; rows.length < limit; ) {
        const q = new URLSearchParams({ mine: '1', ...(o.status && { status: o.status }), ...(before && { before }) });
        const page = (await get(ctx, `/api/jobs?${q}`)).jobs as Json[];
        rows.push(...page);
        if (page.length < 20) break;
        before = page.at(-1)!.id;
      }
      const jobs = rows.slice(0, limit).map((j) => ({ id: j.id, feature: j.feature, status: j.status, modelId: j.modelId, createdAt: j.createdAt, outputAssetId: j.outputAssetId }));
      return { data: { jobs }, human: table(jobs, ['id', 'feature', 'status', 'modelId', 'createdAt']) };
    }
    case 'job': {
      const id = encodeURIComponent(need(args[0], 'job id'));
      let job = await get(ctx, `/api/jobs/${id}`);
      // shortcut: counts the sleeps only, not the polls themselves; close enough for a cap in minutes.
      for (let waited = 0; o.wait && ACTIVE.includes(job.status); waited += POLL_MS) {
        if (waited >= minutes * 60_000) throw new CliError(`job ${job.id} still ${job.status} after ${minutes} min; follow it again with cvs job ${job.id} --wait`, EXIT.server);
        ctx.err(`${job.status}...`);
        await ctx.sleep(POLL_MS);
        job = await get(ctx, `/api/jobs/${id}`);
      }
      return jobView(ctx, job);
    }
    case 'cancel': {
      const id = need(args[0], 'job id');
      if (!o.yes) {
        if (!ctx.tty) throw new CliError('refused: pass --yes to cancel non-interactively', EXIT.refused);
        if (!/^y(es)?$/i.test((await ctx.ask(`Cancel job ${id}? [y/N] `)).trim())) throw new CliError('canceled', EXIT.refused);
      }
      const a = await confirmed(ctx, `/api/jobs/${encodeURIComponent(id)}/cancel`, {}, true);
      return { data: a.body, human: `job ${id} canceled` };
    }
    case 'download': {
      const job = await get(ctx, `/api/jobs/${encodeURIComponent(need(args[0], 'job id'))}`);
      const ids = outputs(job);
      if (ids.length === 0) throw new CliError(`job ${job.id} has no result yet (${job.status})`, EXIT.usage);
      const dir = o.output ?? '.';
      await mkdir(dir, { recursive: true });
      const files: string[] = [];
      for (const assetId of ids) {
        let res: Response;
        try {
          res = await ctx.fetch(assetUrl(ctx, assetId), { headers: { authorization: `Bearer ${ctx.token}` }, signal: AbortSignal.timeout(BODY_TIMEOUT_MS) });
        } catch (e) {
          throw new CliError(`network error: ${(e as Error).message}`, EXIT.server);
        }
        if (!res.ok || !res.body) fail({ status: res.status, body: {}, headers: res.headers });
        // safeName keeps a server-sent name inside the chosen folder; two outputs with one name get -2, -3.
        const name = safeName(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? assetId, assetId);
        let file = join(dir, name);
        for (let n = 2; files.includes(file); n++) file = join(dir, `${basename(name, extname(name))}-${n}${extname(name)}`);
        try {
          await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file, { flags: o.force ? 'w' : 'wx' }));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new CliError(`${file} exists; pass --force to overwrite it`, EXIT.usage);
          await rm(file, { force: true });
          throw new CliError(`download of ${assetId} failed: ${(e as Error).message}`, EXIT.server);
        }
        files.push(file);
      }
      return { data: { files }, human: files.join('\n') };
    }
    case 'upload': {
      const file = need(args[0], 'file');
      const mime = MIME[extname(file).toLowerCase()];
      if (!mime) throw new CliError(`unsupported file type; use one of ${Object.keys(MIME).join(' ')}`, EXIT.usage);
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch (e) {
        throw new CliError(`cannot read ${file}: ${(e as Error).message}`, EXIT.usage);
      }
      const filename = basename(file);
      if (mime.startsWith('video/') && bytes.length > MAX_MULTIPART_VIDEO) {
        const p = await call(ctx, 'POST', '/api/assets/presign-video', { json: { contentType: mime, size: bytes.length } });
        if (p.status !== 200) fail(p);
        if (p.body.fallback) throw new CliError('this server takes no direct video upload; a video must be at most 20 MB here', EXIT.refused);
        let put: Response;
        try {
          put = await ctx.fetch(p.body.url, { method: 'PUT', headers: { 'content-type': mime }, body: bytes, signal: AbortSignal.timeout(BODY_TIMEOUT_MS) });
        } catch (e) {
          throw new CliError(`network error: ${(e as Error).message}`, EXIT.server);
        }
        if (!put.ok) throw new CliError(`storage upload failed: HTTP ${put.status}`, EXIT.server);
        const f = await call(ctx, 'POST', '/api/assets/finalize-video', { json: { assetId: p.body.assetId, filename } });
        if (f.status !== 200) fail(f);
        return { data: f.body.asset, human: `${f.body.asset.id}  ${filename}` };
      }
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), filename);
      const a = await call(ctx, 'POST', '/api/assets', { form });
      if (a.status !== 201) fail(a);
      const asset = a.body.assets[0];
      return { data: asset, human: `${asset.id}  ${asset.filename ?? filename}` };
    }
    case 'library': {
      const items: Json[] = [];
      const max = Math.min(limit, MAX_LIBRARY);
      for (let offset = 0; items.length < max; ) {
        const b = await get(ctx, `/api/library?offset=${offset}`);
        const clips = b.clips as Json[];
        items.push(...clips);
        offset += clips.length;
        if (!b.hasMore || clips.length === 0) break;
      }
      const rows = items.slice(0, max).map((c) => ({ id: c.id, feature: c.feature, mediaType: c.mediaType, createdAt: c.createdAt, creator: c.creator?.name, outputAssetId: c.videoAssetId }));
      return { data: { items: rows }, human: table(rows, ['id', 'feature', 'mediaType', 'creator', 'createdAt']) };
    }
    default:
      throw new CliError(`unknown command ${cmd}\n\n${USAGE}`, EXIT.usage);
  }
}

/** Runs one command line and returns its exit code; every printed line goes through redact. */
export async function main(argv: string[], deps: Deps): Promise<number> {
  const err = (s: string) => deps.err(redact(s));
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          json: { type: 'boolean' },
          yes: { type: 'boolean', short: 'y' },
          wait: { type: 'boolean' },
          timeout: { type: 'string' },
          force: { type: 'boolean' },
          kind: { type: 'string' },
          limit: { type: 'string' },
          status: { type: 'string' },
          before: { type: 'string' },
          output: { type: 'string', short: 'o' },
          help: { type: 'boolean', short: 'h' },
        },
      });
    } catch (e) {
      throw new CliError(`${(e as Error).message}\n\n${USAGE}`, EXIT.usage);
    }
    const [cmd, ...args] = parsed.positionals;
    if (!cmd || parsed.values.help) {
      deps.out(USAGE);
      return cmd || parsed.values.help ? EXIT.ok : EXIT.usage;
    }
    const token = deps.env.CVS_AGENT_TOKEN;
    if (!token) throw new CliError('CVS_AGENT_TOKEN is not set (an agent token from Settings > Connect AI)', EXIT.auth);
    const base = (deps.env.CVS_URL || 'https://video.vetgroup.net').replace(/\/+$/, '');
    // The Bearer never crosses the network in clear: plain http only to this machine.
    const url = URL.parse(base);
    if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
      throw new CliError('CVS_URL must be an https URL (plain http only for localhost, 127.0.0.1 or [::1])', EXIT.usage);
    const ctx: Ctx = { ...deps, err, base, token };
    const r = await command(ctx, cmd, args, parsed.values);
    deps.out(redact(parsed.values.json ? JSON.stringify(r.data, null, 2) : r.human));
    return EXIT.ok;
  } catch (e) {
    if (e instanceof CliError) {
      err(`cvs: ${e.message}`);
      return e.code;
    }
    err(`cvs: ${(e as Error).message}`);
    return EXIT.server;
  }
}

if (import.meta.main) {
  const ask = async (q: string) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await rl.question(q);
    } finally {
      rl.close();
    }
  };
  process.exitCode = await main(process.argv.slice(2), {
    fetch,
    env: process.env,
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    tty: Boolean(process.stdin.isTTY),
    ask,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
}
