// The end text the worker burns into a Marketing Studio clip, with the pinned ffmpeg on a small clip made here.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { burnEndText, concatClips, cutShot, endTextLayout, probeSeconds, probeSize, probeVideoSeconds, requireFfmpeg, sideBySide, spliceClips, stillSlot, trimClip, wrapText } from './media';

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

describe('Smart Remake cuts and joins', () => {
  test('cuts a shot silent and holds its last frame up to the length sent, trims it back, and puts two clips side by side', async () => {
    const shot = join(dir, 'shot.mp4');
    await cutShot(source, 2.5, 1.2, 2, shot); // a 1.2 s shot, sent as 2 s
    const s = await probe(shot);
    expect(Math.abs(Number(s.format.duration) - 2)).toBeLessThanOrEqual(0.1);
    expect(s.streams.map((x) => x.codec_type)).toEqual(['video']);
    expect(await probeSize(shot)).toEqual({ width: 360, height: 640 });

    const back = join(dir, 'back.mp4');
    await trimClip(shot, 1.2, back);
    expect(Math.abs(Number((await probe(back)).format.duration) - 1.2)).toBeLessThanOrEqual(0.1);

    const both = join(dir, 'both.mp4');
    await sideBySide(source, back, both);
    expect(await probeSize(both)).toEqual({ width: 720, height: 640 });
    expect(Math.abs(Number((await probe(both)).format.duration) - 1.2)).toBeLessThanOrEqual(0.1); // as long as the shorter
  });

  test('joins clips of other sizes into one silent clip at the first clip’s size', async () => {
    const wide = join(dir, 'wide.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=640x360:rate=30', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', wide]);
    const joined = join(dir, 'joined.mp4');
    await concatClips([source, wide], joined);
    expect(await probeSize(joined)).toEqual({ width: 360, height: 640 });
    const p = await probe(joined);
    expect(Math.abs(Number(p.format.duration) - 5)).toBeLessThanOrEqual(0.2); // 4 s + 1 s
    expect(p.streams.map((s) => s.codec_type)).toEqual(['video']); // the source's tone is dropped
  });

  test('lays remade parts over their spans of the source, at its size and length, and keeps its sound', async () => {
    const red = join(dir, 'red.mp4'); // a remade part: silent, at another rate and shorter than its span; its size is the cut's
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=360x640:rate=30', '-t', '0.8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', red]);
    const green = join(dir, 'green.mp4'); // smaller, longer than its span, and the last part reaches the end
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:size=180x320:rate=24', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', green]);
    const full = join(dir, 'full.mp4');
    await spliceClips(source, [{ start: 1, seconds: 1, clip: red }, { start: 3, seconds: 1, clip: green }], full);
    expect(await probeSize(full)).toEqual({ width: 360, height: 640 });
    const p = await probe(full);
    expect(Math.abs(Number(p.format.duration) - 4)).toBeLessThanOrEqual(0.15);
    expect(p.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
    const [before, inRed, between, inGreen] = await Promise.all([0.5, 1.5, 2.5, 3.5].map((t) => frame(full, t)));
    const src = await frame(source, 0.5);
    expect(meanDiff(before!, src)).toBeLessThan(4); // untouched spans are the source
    expect(meanDiff(between!, src)).toBeLessThan(4);
    expect(meanDiff(inRed!, src)).toBeGreaterThan(10); // a remade span is the part, held over its whole second
    expect(meanDiff(inGreen!, src)).toBeGreaterThan(10);
  }, 30_000); // four ffmpeg runs and four frame reads
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

describe("a video's real length", () => {
  test('comes from its packets, not the MP4 header the uploader writes, and a trimmed copy reads as trimmed', async () => {
    expect(await probeVideoSeconds(source)).toBeCloseTo(4, 1);
    // The same clip with its movie header (mvhd) claiming 1 s, as the upload's length reader would see it.
    const bytes = await readFile(source);
    const at = bytes.indexOf('mvhd');
    bytes.writeUInt32BE(bytes.readUInt32BE(at + 16), at + 20); // version 0: timescale at +16, duration at +20
    const lying = join(dir, 'lying.mp4');
    await writeFile(lying, bytes);
    expect(await probeSeconds(lying)).toBeCloseTo(1, 1);
    expect(await probeVideoSeconds(lying)).toBeCloseTo(4, 1);
    // A stream copy cut to 2 s keeps the cut frames behind an edit list; the length played is still 2 s.
    const trimmed = join(dir, 'trimmed.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-ss', '1', '-t', '2', '-i', source, '-c', 'copy', trimmed]);
    expect(await probeVideoSeconds(trimmed)).toBeCloseTo(2, 0);
  });
});

test('still cuts share four ffmpeg slots across calls, keep their order, and free a slot when a cut fails', async () => {
  let active = 0;
  let most = 0;
  const cut = (v: number, fail = false) => async () => {
    most = Math.max(most, ++active);
    await new Promise((done) => setTimeout(done, 10));
    active--;
    if (fail) throw new Error(`cut ${v}`);
    return v;
  };
  // Two scene picks at once, ten stills each, one of which fails.
  const a = Promise.all(Array.from({ length: 10 }, (_, i) => stillSlot(cut(i))));
  const b = Promise.allSettled(Array.from({ length: 10 }, (_, i) => stillSlot(cut(10 + i, i === 3))));
  expect(await a).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect((await b).filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(most).toBe(4);
  most = 0;
  expect(await Promise.all([1, 2, 3, 4, 5].map((v) => stillSlot(cut(v))))).toEqual([1, 2, 3, 4, 5]); // all four slots came back
  expect(most).toBe(4);
});
