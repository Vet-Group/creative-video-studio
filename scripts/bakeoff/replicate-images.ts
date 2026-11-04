// Replicate image round (owner-approved spend of the last Replicate credit, 2026-11-04): the CVS Image feature's product photo restyle on the Replicate twins
// of the models CVS serves on BytePlus, Vertex and fal. Generation only; nobody scores here. There is no Replicate image adapter in packages/core, so this
// file speaks the HTTP API directly, as providers/replicate.ts does, and writes the same job log (jobs.ts) with the same hard cap as run.ts.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { ImageReadError, ProviderHttpError, resolveImages, sendJson, timeout, type Fetch, type ReadImage } from '@cvs/core/providers/http';
import { shuffle } from './anonymise.ts';
import { ffmpeg } from './common.ts';
import { appendLine, latest, readLines, spend, type JobKey, type JobLine } from './jobs.ts';

const execFileAsync = promisify(execFile);
export const IMAGE_ROUND ='replicate-2026-11-images';
const API = 'https://api.replicate.com/v1';
// Without a User-Agent the API answers 403 (providers/replicate.ts).
const USER_AGENT = 'creative-video-studio/1.0';

// No fixed prompt exists for the Image feature (FEATURE_PROMPTS has none): this is the 'lifestyle-table' preset (packages/core/src/presets.ts) without its
// video-only camera words, so the restyle asks for what the video bake-off asked for.
export const RESTYLE_PROMPT =
  'Restyle this product photo: the product sits on a tidy wooden table in a bright, cozy room with natural daylight and a softly blurred background. ' +
  'Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces.';

export interface ImageModel {
  /** The CVS row this is the Replicate twin of is named in the note; the id here is only the job-log key. */
  id: string;
  endpoint: string;
  /** USD per output image at the resolution sent (https://replicate.com/<endpoint>, pricing read 2026-11-04). */
  usdPerImage: number;
  /** The model's own input fields beyond prompt, image_input, aspect_ratio and output_format. */
  extra: Record<string, unknown>;
}

export const IMAGE_MODELS: ImageModel[] = [
  { id: 'seedream-5-pro-replicate', endpoint: 'bytedance/seedream-5-pro', usdPerImage: 0.045, extra: { size: '1K' } },
  { id: 'nano-banana-2.1-replicate', endpoint: 'google/nano-banana-2.1', usdPerImage: 0.0336, extra: { resolution: '1K' } },
  { id: 'nano-banana-2-replicate', endpoint: 'google/nano-banana-2', usdPerImage: 0.067, extra: { resolution: '1K' } },
  { id: 'nano-banana-replicate', endpoint: 'google/nano-banana', usdPerImage: 0.039, extra: {} },
  // Replicate's Seedream 5 lite has no 1K size (2K or 3K), so it is the one model run above 1K.
  { id: 'seedream-5-lite-replicate', endpoint: 'bytedance/seedream-5-lite', usdPerImage: 0.035, extra: { size: '2K' } },
];

export interface ImageDeps {
  outDir: string;
  fetch: Fetch;
  apiToken: string;
  readImage: ReadImage;
  /** The `input:` URL of image n (1-based). */
  imageUrl: (n: number) => string;
  download: (url: string, dest: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  capUsd: number;
  pollMs?: number;
  /** Wait this long between two submits (Replicate throttles an account under $5 of credit to 6 creates a minute); default none. */
  submitGapMs?: number;
  maxPolls?: number;
}

export interface ImageResult {
  outcome: 'complete' | 'stopped: cap' | 'stopped: auth' | 'stopped: rate limited' | 'stopped: provider error' | 'stopped: image unreadable';
  reason?: string;
  counts: Record<string, number>;
  spentUsd: number;
}

const FINAL = ['succeeded', 'failed', 'unknown', 'refused'];

/** Runs every (model, image) job once: a key already in the log is polled or skipped, never submitted twice. */
export async function runImages(deps: ImageDeps, jobs: { model: ImageModel; image: number }[]): Promise<ImageResult> {
  const headers = { Authorization: `Bearer ${deps.apiToken}`, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT };
  const key = (j: { model: ImageModel; image: number }): JobKey => ({ image: j.image, model: j.model.id, round: IMAGE_ROUND });
  const id = (k: JobKey): string => `${k.image}|${k.model}|${k.round}`;
  const current = (k: JobKey): JobLine | undefined => latest(readLines(deps.outDir)).get(id(k));
  const line = (j: { model: ImageModel; image: number }, l: Partial<JobLine> & Pick<JobLine, 'status'>): void =>
    appendLine(deps.outDir, { ...l, ...key(j), at: new Date().toISOString(), provider: 'replicate', estimateUsd: j.model.usdPerImage, set: 'replicate-2026-11' });
  if (new Set(jobs.map((j) => id(key(j)))).size !== jobs.length) throw new Error('the plan has duplicate job keys');
  let outcome: ImageResult['outcome'] = 'complete';
  let reason: string | undefined;

  let gapped = 0;
  for (const j of jobs) {
    if (current(key(j))?.status === 'submitting') line(j, { status: 'unknown', error: 'the run stopped before the provider answered' });
    // Only a key that never reached the provider may be submitted again.
    if (current(key(j)) && current(key(j))!.status !== 'not_attempted') continue;
    const spent = spend(readLines(deps.outDir)).total;
    // Written so that a NaN stops the run instead of passing the check.
    if (!(spent + j.model.usdPerImage <= deps.capUsd + 1e-9)) {
      outcome = 'stopped: cap';
      reason = `spent $${spent.toFixed(4)} plus $${j.model.usdPerImage} for ${id(key(j))} would pass the $${deps.capUsd} cap`;
      break;
    }
    if (deps.submitGapMs && gapped++) await deps.sleep(deps.submitGapMs);
    try {
      const images = await resolveImages([deps.imageUrl(j.image)], deps.readImage);
      const input = { prompt: RESTYLE_PROMPT, image_input: images, aspect_ratio: 'match_input_image', output_format: 'png', ...j.model.extra };
      line(j, { status: 'submitting' });
      const res = (await sendJson(deps.fetch, 'replicate submit', `${API}/models/${j.model.endpoint}/predictions`, { method: 'POST', headers, body: JSON.stringify({ input }) })) as { id?: string };
      if (!res.id) throw new Error('replicate submit: no id in the response');
      line(j, { status: 'submitted', providerJobId: res.id });
    } catch (e) {
      const msg = (e as Error).message;
      const http = e instanceof ProviderHttpError ? e : null;
      if (e instanceof ImageReadError) {
        outcome = 'stopped: image unreadable';
        reason = msg;
        break;
      }
      if (http?.status === 429) {
        line(j, { status: 'not_attempted', error: msg });
        outcome = 'stopped: rate limited';
        reason = msg;
        break;
      }
      if (http && (http.status === 401 || http.status === 402 || http.status === 403)) {
        line(j, { status: 'not_attempted', error: msg });
        outcome = 'stopped: auth';
        reason = msg;
        break;
      }
      if (http && http.status < 500) {
        line(j, { status: 'failed', error: msg });
        continue;
      }
      // A 5xx or a network error may have created the prediction, so the key is never resubmitted.
      line(j, { status: 'unknown', error: msg });
      outcome = 'stopped: provider error';
      reason = msg;
      break;
    }
  }

  const pending = (): typeof jobs => jobs.filter((j) => {
    const c = current(key(j));
    return !!c?.providerJobId && !FINAL.includes(c.status);
  });
  for (let i = 0; i < (deps.maxPolls ?? 120) && pending().length; i++) {
    if (i) await deps.sleep(deps.pollMs ?? 5_000);
    for (const j of pending()) {
      const providerJobId = current(key(j))!.providerJobId!;
      try {
        const p = (await sendJson(deps.fetch, 'replicate status', `${API}/predictions/${providerJobId}`, { headers, signal: timeout() })) as { status?: string; output?: unknown; error?: unknown };
        if (p.status === 'failed' || p.status === 'canceled') {
          line(j, { status: 'failed', providerJobId, error: p.error ? String(p.error) : p.status });
        } else if (p.status === 'succeeded') {
          const url = Array.isArray(p.output) ? p.output[0] : p.output;
          if (typeof url !== 'string') {
            line(j, { status: 'failed', providerJobId, error: 'replicate prediction has no output' });
            continue;
          }
          const file = `images/image${String(j.image).padStart(2, '0')}-${j.model.id}.png`;
          mkdirSync(join(deps.outDir, 'images'), { recursive: true });
          await deps.download(url, join(deps.outDir, file));
          line(j, { status: 'succeeded', providerJobId, costUsd: j.model.usdPerImage, costSource: 'estimate', clip: file });
        }
      } catch {
        // A poll or download error leaves the job pending; the next round, or the next run, asks again.
      }
    }
  }
  for (const j of pending()) line(j, { status: 'timeout', providerJobId: current(key(j))!.providerJobId!, error: 'still unfinished when polling stopped' });

  const counts: Record<string, number> = {};
  for (const j of jobs) {
    const s = current(key(j))?.status ?? 'notSubmitted';
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return { outcome, ...(reason ? { reason } : {}), counts, spentUsd: spend(readLines(deps.outDir)).total };
}

/** Writes a downloaded output to disk; the real `download` of the CLI. */
export async function downloadTo(url: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  // shortcut: some networks cannot reach replicate.delivery's own Cloudflare addresses (this one times out on 104.18.16.86 and .17.86); REPLICATE_DELIVERY_IP
  // names another Cloudflare address to pin through curl. Without it, plain fetch.
  const ip = process.env.REPLICATE_DELIVERY_IP;
  if (ip) {
    await execFileAsync('curl', ['-sSf', '-m', '120', '--resolve', `${new URL(url).host}:443:${ip}`, '-o', dest, url]);
    return;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export interface BlindImagesOpts {
  root: string;
  outDir: string;
  /** Where the id -> model map goes; must be outside the bake-off folder, where a judge could read it. */
  mapPath: string;
  inputsDir: string;
  /** The source file of image n (inputs.json). */
  sourceFile: (n: number) => string;
  rubricPath: string;
  newId?: () => string;
  shuffle?: <T>(xs: T[]) => T[];
}

/**
 * blind/replicate-2026-11-images/image-<random>/ holds image.png (metadata stripped) and source.<ext>, plus rubric.md and BRIEF.md beside them.
 * The map is written to `mapPath` before each folder exists, as anonymise.ts does for clips.
 */
export async function blindImages(o: BlindImagesOpts): Promise<Record<string, { model: string; image: number }>> {
  if (relative(resolve(o.root), resolve(o.mapPath)).split(sep)[0] !== '..') throw new Error('the map must be outside the cvs-bakeoff folder, where a judge could read it');
  const setDir = join(o.root, 'blind', IMAGE_ROUND);
  if (existsSync(setDir) && readdirSync(setDir).length) throw new Error(`${setDir} already holds images; the id map for them would be lost`);
  const done = [...latest(readLines(o.outDir)).values()].filter((l) => l.round === IMAGE_ROUND && l.status === 'succeeded' && l.clip);
  if (!done.length) throw new Error('no succeeded images');
  const newId = o.newId ?? (() => `image-${randomBytes(4).toString('hex')}`);
  const map: Record<string, { model: string; image: number }> = {};
  mkdirSync(dirname(o.mapPath), { recursive: true });
  for (const l of (o.shuffle ?? shuffle)(done)) {
    let id = newId();
    while (map[id]) id = newId();
    map[id] = { model: l.model, image: l.image };
    writeFileSync(o.mapPath, `${JSON.stringify({ set: IMAGE_ROUND, images: map }, null, 2)}\n`);
    const dir = join(setDir, id);
    mkdirSync(dir, { recursive: true });
    await ffmpeg(['-y', '-v', 'error', '-i', join(o.outDir, l.clip!), '-map_metadata', '-1', '-frames:v', '1', join(dir, 'image.png')]);
    const src = o.sourceFile(l.image);
    copyFileSync(join(o.inputsDir, src), join(dir, `source${extname(src).toLowerCase()}`));
  }
  copyFileSync(o.rubricPath, join(setDir, 'rubric.md'));
  writeFileSync(
    join(setDir, 'BRIEF.md'),
    [
      `# Judge brief: set ${IMAGE_ROUND}`,
      '',
      'Read rubric.md first. Then judge every image folder below against its `source.<ext>` photo, using `image.png`.',
      'Do not look for, guess or record which model made an image. Do not open anything outside this folder.',
      '',
      `Write \`scores-${IMAGE_ROUND}.csv\` in this folder with the header \`id,pass,faults,note\`, one row per folder, as rubric.md describes.`,
      '',
      ...Object.keys(map).sort().map((id) => `- ${id}`),
      '',
    ].join('\n'),
  );
  return map;
}
