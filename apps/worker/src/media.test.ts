// The end text the worker burns into a Marketing Studio clip, with the pinned ffmpeg on a small clip made here.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffprobe from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { burnEndText, concatClips, cutShot, endTextLayout, ensureH264, probeSeconds, probeSize, probeVideoSeconds, reframeArgs, reframeClip, requireFfmpeg, sideBySide, spliceClips, stillSlot, trimClip, wrapText } from './media';

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

  test('keeps every part on its own frames of the source, with no drift over many short spans', async () => {
    // Many spans that do not fall on 24 fps frame lines: rounding each span on its own used to add up and slide the later parts off their sound.
    const long = join(dir, 'long.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x4a7ab0:size=160x288:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', long]);
    const red = join(dir, 'red-short.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=160x288:rate=30', '-t', '0.6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', red]);
    const parts = Array.from({ length: 10 }, (_, i) => ({ start: 0.229 + i * 0.731, seconds: 0.271, clip: red }));
    const full = join(dir, 'many.mp4');
    await spliceClips(long, parts, full);
    // Each output frame's mean V (red is high, the blue source is low), so the red runs show where each part landed.
    const { stdout } = await run(ffprobe.path, ['-v', 'error', '-f', 'lavfi', '-i', `movie=${full.replaceAll('\\', '/').replace(':', '\\\\:')},signalstats`, '-show_entries', 'frame_tags=lavfi.signalstats.VAVG', '-of', 'csv=p=0'], { maxBuffer: 16 * 1024 * 1024 });
    const isRed = stdout.trim().split(/\r?\n/).map((v) => Number(v) > 160);
    expect(isRed.length).toBe(Math.round(8 * 24));
    const runs: [number, number][] = [];
    isRed.forEach((r, f) => {
      if (r && !isRed[f - 1]) runs.push([f, f + 1]);
      else if (r) runs.at(-1)![1] = f + 1;
    });
    expect(runs).toEqual(parts.map((p) => [Math.round(p.start * 24), Math.round((p.start + p.seconds) * 24)]));
  }, 30_000);
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

describe('H.264 for every stored clip', () => {
  const codecs = async (file: string) => (JSON.parse((await run(ffprobe.path, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', file])).stdout) as { streams: { codec_type: string; codec_name: string }[] }).streams.map((s) => `${s.codec_type}:${s.codec_name}`);
  /** A 2 s 320x240 clip with a tone, 10-bit HEVC as fal returns it, or any other encoder given. */
  const make = async (name: string, video: string[]) => {
    const file = join(dir, name);
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', ...video, '-c:a', 'aac', '-shortest', file]);
    return file;
  };

  test('converts an HEVC clip to H.264 at the same size and length, keeping its AAC sound', async () => {
    const hevc = await make('hevc.mp4', ['-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-x265-params', 'log-level=error']);
    expect(await codecs(hevc)).toContain('video:hevc');
    const out = join(dir, 'hevc-h264.mp4');
    const failures: unknown[] = [];
    expect(await ensureH264(hevc, out, { onFail: (e) => failures.push(e) })).toBe(out);
    expect(failures).toEqual([]);
    expect(await codecs(out)).toEqual(['video:h264', 'audio:aac']);
    expect(await probeSize(out)).toEqual(await probeSize(hevc));
    expect(Math.abs((await probeSeconds(out)) - (await probeSeconds(hevc)))).toBeLessThan(0.1);
  });

  test('converts a 10-bit or 4:2:2 H.264 clip, which browsers cannot play either, and leaves yuvj420p alone', async () => {
    for (const pix of ['yuv420p10le', 'yuv422p']) {
      const odd = await make(`odd-${pix}.mp4`, ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', pix]);
      const out = join(dir, `odd-${pix}-out.mp4`);
      expect(await ensureH264(odd, out)).toBe(out);
      expect((await run(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'csv=p=0', out])).stdout.trim()).toBe('h264,yuv420p');
    }
    const full = await make('full-range.mp4', ['-c:v', 'libx264', '-preset', 'ultrafast', '-vf', 'scale=in_range=tv:out_range=pc,format=yuvj420p']);
    expect(await ensureH264(full, join(dir, 'full-out.mp4'))).toBe(full);
  });

  test('leaves an H.264 clip as it is, byte for byte', async () => {
    const h264 = await make('plain.mp4', ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
    const out = join(dir, 'plain-copy.mp4');
    expect(await ensureH264(h264, out)).toBe(h264);
    await expect(readFile(out)).rejects.toThrow();
  });

  test('keeps the original, and says why, when the conversion times out or the clip cannot be read', async () => {
    const hevc = await make('hevc2.mp4', ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error']);
    const failures: unknown[] = [];
    expect(await ensureH264(hevc, join(dir, 'late.mp4'), { timeoutMs: 1, onFail: (e) => failures.push(e) })).toBe(hevc); // ffmpeg is killed at the timeout
    const junk = join(dir, 'junk.mp4');
    await writeFile(junk, 'not a video');
    expect(await ensureH264(junk, join(dir, 'junk-out.mp4'), { onFail: (e) => failures.push(e) })).toBe(junk);
    expect(failures).toHaveLength(2);
  });

  test('throws, and writes nothing, when the worker is stopping, so the clip is not kept as HEVC for good', async () => {
    const hevc = await make('hevc3.mp4', ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error']);
    const out = join(dir, 'stopped.mp4');
    const failures: unknown[] = [];
    await expect(ensureH264(hevc, out, { signal: AbortSignal.abort(), onFail: (e) => failures.push(e) })).rejects.toThrow();
    expect(failures).toEqual([]);
    await expect(readFile(out)).rejects.toThrow();
  });
});

describe('Đổi khung (reframe)', () => {
  /** The frame size and the fill a reframe of a `width` x `height` clip asks ffmpeg for. */
  const frameOf = (width: number, height: number, ratio: Parameters<typeof reframeArgs>[3], fill: Parameters<typeof reframeArgs>[4] = 'black') => {
    const args = reframeArgs('in.mp4', 'out.mp4', { width, height, seconds: 5, audio: false }, ratio, fill);
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    return graph.match(fill === 'black' ? /pad=(\d+):(\d+):/ : /crop=(\d+):(\d+),/)!.slice(1).join('x');
  };

  test('takes the long side as the frame height (at most 1920 px), the ratio for the width, and rounds both down to even', () => {
    expect(frameOf(1920, 1080, '9:16')).toBe('1080x1920'); // 16:9 into 9:16
    expect(frameOf(1080, 1920, '1:1')).toBe('1920x1920'); // 9:16 into 1:1
    expect(frameOf(1024, 1024, '4:5')).toBe('818x1024'); // 1:1 into 4:5: 819.2 rounded down to even
    expect(frameOf(1023, 575, '9:16')).toBe('574x1022'); // odd sides
    expect(frameOf(3840, 2160, '4:5', 'blur')).toBe('1536x1920'); // over the cap
    expect(frameOf(1080, 1920, '9:16')).toBe('1080x1920'); // already the shape: only the sound changes
  });

  test('fits the clip inside without cropping it, over a blurred cover of itself or black, and treats the sound only when there is some', () => {
    const blur = reframeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, seconds: 5, audio: true }, '9:16', 'blur');
    const graph = blur[blur.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('[b]scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1[fg]');
    expect(graph).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=54,eq=brightness=-0.15');
    expect(graph).toContain('[bg][fg]overlay=(W-w)/2:(H-h)/2[v]');
    expect(blur.join(' ')).toContain('-map 0:a:0 -af loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=4.700:d=0.3 -c:a aac');
    expect(blur.join(' ')).toContain('-pix_fmt yuv420p -movflags +faststart out.mp4');
    // Hiss under QUIET_LUFS keeps its level and only fades; NaN (no reading) still gets loudnorm.
    const hiss = reframeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, seconds: 5, audio: true, lufs: -69.4 }, '9:16', 'black');
    expect(hiss.join(' ')).toContain('-map 0:a:0 -af afade=t=out:st=4.700:d=0.3 -c:a aac');
    expect(reframeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, seconds: 0.2, audio: true, lufs: -69.4 }, '9:16', 'black').join(' ')).toContain('-map 0:a:0 -c:a aac');
    expect(reframeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, seconds: 5, audio: true, lufs: Number.NaN }, '9:16', 'black').join(' ')).toContain('-af loudnorm=');
    const silent = reframeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, seconds: 5, audio: false }, '1:1', 'black');
    expect(silent.join(' ')).not.toMatch(/0:a|loudnorm|-c:a/);
  });

  test('with the pinned ffmpeg: a vertical clip with sound into 1:1 and 4:5 at -14 LUFS fading out, and a silent wide one into 9:16 staying silent', async () => {
    const square = join(dir, 'square.mp4');
    await reframeClip(source, square, '1:1', 'blur');
    expect(await probeSize(square)).toEqual({ width: 640, height: 640 });
    expect((await probe(square)).streams.map((s) => s.codec_type)).toEqual(['video', 'audio']);
    const volume = async (args: string[]) => Number((await run(requireFfmpeg(), ['-hide_banner', ...args, '-i', square, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'])).stderr.match(/max_volume: (-?[\d.]+) dB/)![1]);
    expect(await volume(['-sseof', '-0.03'])).toBeLessThan((await volume(['-ss', '1', '-t', '1'])) - 12); // the last 30 ms, faded, against the middle
    const { stderr } = await run(requireFfmpeg(), ['-hide_banner', '-i', square, '-map', '0:a', '-af', 'ebur128', '-f', 'null', '-']);
    expect(Number([...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)![1])).toBeCloseTo(-14, 0); // the summary, after the running readings

    const portrait = join(dir, 'portrait.mp4');
    await reframeClip(source, portrait, '4:5', 'black');
    expect(await probeSize(portrait)).toEqual({ width: 512, height: 640 });

    // Faint hiss stays faint rather than being lifted to -14 LUFS.
    const hissy = join(dir, 'hiss.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:size=180x320:rate=24', '-f', 'lavfi', '-i', 'anoisesrc=a=0.0005:c=white', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', hissy]);
    const hissOut = join(dir, 'hiss-out.mp4');
    await reframeClip(hissy, hissOut, '1:1', 'black');
    const hissLevel = (await run(requireFfmpeg(), ['-hide_banner', '-i', hissOut, '-map', '0:a', '-af', 'ebur128', '-f', 'null', '-'])).stderr;
    expect(Number([...hissLevel.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)![1])).toBeLessThan(-50);

    const wide = join(dir, 'wide-silent.mp4');
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', wide]);
    const tall = join(dir, 'tall.mp4');
    await reframeClip(wide, tall, '9:16', 'blur');
    expect(await probeSize(tall)).toEqual({ width: 180, height: 320 });
    expect((await probe(tall)).streams.map((s) => s.codec_type)).toEqual(['video']);
  }, 60_000);
});
