// Canary for Gemini Omni 1.2 Flash on Vertex AI (docs/ops/adding-a-model.md): one real clip through the production adapter, then a check of the file and of Google's usage numbers.
//   tsx scripts/vertex-omni-canary.ts --image <product.png> [--prompt "..."] [--seconds 5] [--ratio 9:16] [--out dir]   (image-to-video, the default)
//   tsx scripts/vertex-omni-canary.ts --text --prompt "..." [--seconds 5] [--ratio 9:16] [--out dir]                    (text-to-video)
// Without --yes it only prints the plan and the worst-case cost: no token, no call. With --yes it makes ONE paid submit; --max-usd (default 0.50, never above 1) refuses a dearer plan.
// Needs GOOGLE_APPLICATION_CREDENTIALS (and GOOGLE_CLOUD_PROJECT when the key names no project). Prints no secret.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createVertexOmniProvider, VERTEX_OMNI_MODEL } from '@cvs/core/providers/vertex-omni';
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { vertexAccounts } from '@cvs/core/providers/vertex-accounts';
import type { ModelConfig } from '@cvs/core/models';
import { ffmpeg, isMain } from './bakeoff/common.ts';

/** $12.00 per 1M video output tokens (pricing page read 2026-11-06) and the row of migration 0074. */
const USD_PER_SECOND = 0.0695;
const OUTPUT_USD_PER_TOKEN = 12 / 1_000_000;
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    image: { type: 'string' }, text: { type: 'boolean', default: false }, prompt: { type: 'string', default: 'The camera glides slowly around the product on a clean studio surface, soft light, gentle ambient sound.' },
    seconds: { type: 'string', default: '5' }, ratio: { type: 'string', default: '9:16' }, out: { type: 'string', default: 'vertex-omni-canary' },
    'max-usd': { type: 'string', default: '0.5' }, yes: { type: 'boolean', default: false },
  } });
  const seconds = Number(values.seconds);
  const maxUsd = Math.min(Number(values['max-usd']), 1);
  const cost = Number((USD_PER_SECOND * seconds).toFixed(4));
  if (!values.text && !values.image) throw new Error('give --image <file> or --text');
  if (!(cost <= maxUsd)) throw new Error(`the estimate $${cost} is over --max-usd $${maxUsd} (never above $1)`);
  console.log(`plan: ${values.text ? 'text-to-video' : `image-to-video from ${values.image}`}, ${seconds} s, ${values.ratio}, 720p, estimate $${cost} (+ input and thought tokens, a few cents at most)`);
  if (!values.yes) { console.log('dry run: nothing was sent; add --yes to submit once'); return; }

  const [account] = vertexAccounts(process.env);
  if (!account) throw new Error('set GOOGLE_APPLICATION_CREDENTIALS');
  const model: ModelConfig = { id: 'canary', provider: 'vertex', endpoint: VERTEX_OMNI_MODEL, label: 'canary', ratios: ['9:16', '16:9'], durationsSec: [seconds], maxImages: 9, outputResolution: '720p', usdPerSecond: USD_PER_SECOND, billedAmountField: null, sources: {} };
  const readImage = async (url: string) => ({ bytes: readFileSync(url), contentType: TYPES[extname(url).toLowerCase()] ?? 'application/octet-stream' });
  const provider = createVertexOmniProvider({ key: account.key, project: account.project, readImage });
  const started = Date.now();
  const { providerJobId } = await provider.submit({ model, prompt: values.prompt!, imageUrls: values.text ? [] : [resolve(values.image!)], ratio: values.ratio as '9:16' | '16:9', durationSec: seconds });
  const interaction = JSON.parse(Buffer.from(providerJobId.slice('vertex-omni-v1:'.length), 'base64url').toString('utf8')).id as string;
  console.log(`submitted interaction ${interaction}`);
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const s = await provider.status({ providerJobId, model });
    console.log(`  ${Math.round((Date.now() - started) / 1000)} s: ${s.state}`);
    if (s.state === 'running' || s.state === 'queued') continue;
    if (s.state !== 'succeeded') throw new Error(`failed: ${'error' in s ? s.error : s.state}`);
    mkdirSync(values.out!, { recursive: true });
    const file = join(values.out!, `${interaction.slice(0, 24)}.mp4`);
    writeFileSync(file, Buffer.from(s.outputUrl.slice('data:video/mp4;base64,'.length), 'base64'));
    const info = (await ffmpeg(['-i', file, '-f', 'null', '-'])).stderr;
    const video = /Video: .*?(\d{3,4})x(\d{3,4})/.exec(info);
    console.log(`clip ${file}: ${/Duration: ([\d:.]+)/.exec(info)?.[1]}, ${video ? `${video[1]}x${video[2]}` : 'no video stream'}, audio stream: ${/Audio:/.test(info) ? 'yes' : 'NO'}`);
    // A free GET of the same interaction, for Google's own token count: output tokens x $12 per 1M is what the clip was billed.
    const token = await serviceAccountToken(account.key)();
    const res = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${account.project}/locations/global/interactions/${interaction}`, { headers: { Authorization: `Bearer ${token}` } });
    const usage = ((await res.json()) as { usage?: { total_output_tokens?: number; total_input_tokens?: number; total_thought_tokens?: number } }).usage;
    const out = usage?.total_output_tokens;
    console.log(`usage: ${JSON.stringify(usage)}${out ? `; output tokens cost $${(out * OUTPUT_USD_PER_TOKEN).toFixed(4)} = $${(out * OUTPUT_USD_PER_TOKEN / seconds).toFixed(4)} per second (row: $${USD_PER_SECOND})` : ''}`);
    return;
  }
  throw new Error('still running after 15 minutes');
}

if (isMain(import.meta.url)) main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
