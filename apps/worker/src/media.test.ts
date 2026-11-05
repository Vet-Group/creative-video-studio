// The end text the worker burns into a Marketing Studio clip, with the pinned ffmpeg on a small clip made here.
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { burnEndText, endTextLayout, requireFfmpeg, wrapText } from './media';

const run = promisify(execFile);
let dir = '';
let source = '';

/** One frame at `t` as 8-bit grey pixels. */
async function frame(file: string, t: number): Promise<Buffer> {
  const { stdout } = await run(requireFfmpeg(), ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
const meanDiff = (a: Buffer, b: Buffer) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) / a.length;
const probe = async (file: string) => JSON.parse((await run(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file])).stdout) as { format: { duration: string }; streams: { codec_type: string }[] };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cvs-media-test-'));
  source = join(dir, 'source.mp4');
  // A flat 4 s vertical clip with a tone, so any drawn pixel shows and the sound can be checked.
  await run(requireFfmpeg(), [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x4a7ab0:size=360x640:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source,
  ]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the end text', () => {
  test('wraps at spaces, cuts a word longer than a line, and fits 60 characters in at most 3 lines on a vertical clip', () => {
    expect(wrapText('Giảm giá  50% hôm nay', 9)).toEqual(['Giảm giá', '50% hôm', 'nay']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    const text = 'Ưu đãi cuối tuần: mua 1 tặng 1, giao hàng miễn phí toàn quốc!';
    for (const [w, h] of [[720, 1280], [1280, 720], [720, 720]] as const) {
      const { size, lines } = endTextLayout(text, w, h);
      expect(lines.length).toBeLessThanOrEqual(3);
      expect(lines.join(' ')).toBe(text);
      expect(size).toBeGreaterThanOrEqual(Math.min(w, h) * 0.035);
    }
  });

  test('is drawn over the last 2 s only, keeping the length and the sound', async () => {
    for (const position of ['bottom', 'middle', 'top'] as const) {
      const out = join(dir, `${position}.mp4`);
      // Quotes, a colon, a backslash and %{...} must come out as plain text, not filter syntax.
      await burnEndText(source, out, `Đặt ngay hôm nay: giảm 50% 'ưu đãi' \\ %{pts}`, position);
      const [before, after] = await Promise.all([probe(source), probe(out)]);
      expect(Math.abs(Number(after.format.duration) - Number(before.format.duration))).toBeLessThanOrEqual(0.2);
      expect(after.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
      expect(meanDiff(await frame(source, 1), await frame(out, 1))).toBeLessThan(1.5); // early frames are untouched, bar re-encoding
      expect(meanDiff(await frame(source, 3.5), await frame(out, 3.5))).toBeGreaterThan(4); // the band and the text in the last 2 s
    }
  });
});
