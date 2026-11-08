// Canary for BytePlus Seedance 2.x (docs/ops/adding-a-model.md): one real clip through the production adapter, then the clip's length, picture and sound, the
// time it took, and the tokens BytePlus billed, set against the row's price for the silent clip. Two questions it answers: what sound costs (generate_audio
// on), and how long a clip longer than the row's 15 s takes to make.
//   tsx scripts/byteplus-canary.ts --model seedance-2.0|seedance-2.0-fast|seedance-2.0-mini|seedance-2.5 --image <product.jpg> [--seconds 5] [--ratio 9:16] [--audio] [--out dir]
// Without --yes it only prints the plan and the worst-case cost: no call. With --yes it makes ONE paid submit; --max-usd (default 1, never above 12) refuses a
// dearer plan, where sound counts at twice the silent price. Needs BYTEPLUS_ARK_API_KEY. Prints no secret.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ModelConfig } from '@cvs/core/models';
import { createByteplusProvider } from '@cvs/core/providers/byteplus';
import { ffmpeg, isMain } from './bakeoff/common.ts';

/** The rows of migration 0056: endpoint and USD per second of the silent 720p clip (21,600 tokens a second). */
const MODELS: Record<string, { endpoint: string; usdPerSecond: number }> = {
  'seedance-2.0': { endpoint: 'dreamina-seedance-2-0-260128', usdPerSecond: 0.1512 },
  'seedance-2.5': { endpoint: 'dreamina-seedance-2-5-260628', usdPerSecond: 0.2312 },
  'seedance-2.0-fast': { endpoint: 'dreamina-seedance-2-0-fast-260128', usdPerSecond: 0.121 },
  'seedance-2.0-mini': { endpoint: 'dreamina-seedance-2-0-mini-260615', usdPerSecond: 0.0756 },
};
const TOKENS_PER_SECOND = 21_600;
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** The worst case the plan may cost: sound counted at twice the silent price until a canary measures it. */
export const worstUsd = (usdPerSecond: number, seconds: number, audio: boolean): number => Number((usdPerSecond * seconds * (audio ? 2 : 1)).toFixed(4));

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    model: { type: 'string' }, image: { type: 'string' }, seconds: { type: 'string', default: '5' }, ratio: { type: 'string', default: '9:16' },
    audio: { type: 'boolean', default: false }, prompt: { type: 'string', default: 'The camera glides slowly around @Image1 on a clean studio surface, soft light, gentle ambient music.' },
    out: { type: 'string', default: 'byteplus-canary' }, 'max-usd': { type: 'string', default: '1' }, yes: { type: 'boolean', default: false },
  } });
  const row = MODELS[values.model ?? ''];
  if (!row) throw new Error(`--model must be one of ${Object.keys(MODELS).join(', ')}`);
  if (!values.image) throw new Error('give --image <product photo>');
  const seconds = Number(values.seconds);
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 30) throw new Error('--seconds must be a whole number from 4 to 30');
  const maxUsd = Math.min(Number(values['max-usd']), 12);
  const worst = worstUsd(row.usdPerSecond, seconds, values.audio);
  if (!(worst <= maxUsd)) throw new Error(`the worst case $${worst} is over --max-usd $${maxUsd} (never above $12)`);
  console.log(`plan: ${values.model} (${row.endpoint}), ${seconds} s, ${values.ratio}, 720p, sound ${values.audio ? 'on' : 'off'}, from ${values.image}; silent price $${(row.usdPerSecond * seconds).toFixed(4)}, worst case $${worst}`);
  if (!values.yes) {
    console.log('dry run: nothing was sent; add --yes to submit once');
    return;
  }
  const apiKey = process.env.BYTEPLUS_ARK_API_KEY;
  if (!apiKey) throw new Error('set BYTEPLUS_ARK_API_KEY');

  const model: ModelConfig = { id: 'canary', provider: 'byteplus', endpoint: row.endpoint, label: 'canary', ratios: [values.ratio as '9:16'], durationsSec: [seconds], maxImages: 9, outputResolution: '720p', usdPerSecond: row.usdPerSecond, billedAmountField: 'usage.completion_tokens', sources: {} };
  const readImage = async (url: string) => ({ bytes: readFileSync(url), contentType: TYPES[extname(url).toLowerCase()] ?? 'application/octet-stream' });
  const provider = createByteplusProvider({ apiKey, readImage });
  const started = Date.now();
  const { providerJobId } = await provider.submit({ model, prompt: values.prompt!, imageUrls: [resolve(values.image)], ratio: values.ratio as '9:16', durationSec: seconds, audio: values.audio });
  console.log(`submitted ${providerJobId}`);
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const s = await provider.status({ providerJobId, model });
    const took = Math.round((Date.now() - started) / 1000);
    if (s.state === 'running' || s.state === 'queued') {
      if (i % 6 === 0) console.log(`  ${took} s: ${s.state}`);
      continue;
    }
    if (s.state !== 'succeeded') throw new Error(`after ${took} s: ${s.state}: ${'error' in s ? s.error : ''}`);
    mkdirSync(values.out!, { recursive: true });
    const file = join(values.out!, `${values.model}-${seconds}s-${values.audio ? 'audio' : 'silent'}.mp4`);
    writeFileSync(file, Buffer.from(await (await fetch(s.outputUrl)).arrayBuffer()));
    const info = (await ffmpeg(['-i', file, '-f', 'null', '-'])).stderr;
    const video = /Video: .*?(\d{3,4})x(\d{3,4})/.exec(info);
    console.log(`made in ${took} s: ${file}, ${/Duration: ([\d:.]+)/.exec(info)?.[1]}, ${video ? `${video[1]}x${video[2]}` : 'no video stream'}, sound: ${/Audio:/.test(info) ? 'yes' : 'NO'}`);
    const tokens = s.tokens;
    console.log(
      tokens
        ? `billed ${tokens} tokens = $${s.costUsd} (${(tokens / seconds).toFixed(0)} a second against ${TOKENS_PER_SECOND} for the silent row, so $${(s.costUsd / seconds).toFixed(4)} a second against $${row.usdPerSecond})`
        : `no token count in the answer; cost held at $${s.costUsd} (${s.costSource})`,
    );
    return;
  }
  throw new Error('still running after 60 minutes');
}

if (isMain(import.meta.url)) main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
