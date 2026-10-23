// Makes (once) and checks the fixture clips behind the Create page's Examples tab, with the repo's pinned ffmpeg-static.
// They are synthetic test patterns, not company or third-party footage: tiny, looping, and committed under a `fixtures` folder.
// Delete a file in apps/web/public/fixtures/examples and run this test to remake it.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { extractPoster, probeSize, requireFfmpeg } from './media';

const run = promisify(execFile);
const dir = fileURLToPath(new URL('../../web/public/fixtures/examples/', import.meta.url));
const MAX_BYTES = 150_000;

// Keep in step with apps/web/src/lib/examples.ts.
const CLIPS = [
  { id: 'example-1', width: 180, height: 320, hue: 0 },
  { id: 'example-2', width: 240, height: 240, hue: 60 },
  { id: 'example-3', width: 180, height: 320, hue: 120 },
  { id: 'example-4', width: 240, height: 240, hue: 180 },
  { id: 'example-5', width: 180, height: 320, hue: 240 },
  { id: 'example-6', width: 180, height: 320, hue: 300 },
  { id: 'example-7', width: 320, height: 180, hue: 30 },
  { id: 'example-8', width: 240, height: 320, hue: 90 },
  { id: 'example-9', width: 320, height: 180, hue: 150 },
  { id: 'example-10', width: 240, height: 320, hue: 210 },
];

test('the example clips exist, are tiny, and have posters', async () => {
  await mkdir(dir, { recursive: true });
  for (const c of CLIPS) {
    const mp4 = join(dir, `${c.id}.mp4`);
    if (!existsSync(mp4)) {
      await run(requireFfmpeg(), [
        '-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${c.width}x${c.height}:rate=24`, '-t', '2',
        '-vf', `hue=h=${c.hue},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34', '-g', '24',
        '-an', '-map_metadata', '-1', '-fflags', '+bitexact', '-movflags', '+faststart', mp4,
      ]);
    }
    const jpg = join(dir, `${c.id}.jpg`);
    if (!existsSync(jpg)) await extractPoster(mp4, jpg);

    expect(await probeSize(mp4)).toEqual({ width: c.width, height: c.height });
    expect(statSync(mp4).size).toBeLessThan(MAX_BYTES);
    expect(statSync(jpg).size).toBeLessThan(MAX_BYTES);
  }
}, 60_000);
