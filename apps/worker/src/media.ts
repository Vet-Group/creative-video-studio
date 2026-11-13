// ffprobe and ffmpeg (the static binaries from npm) for checking an output clip, cutting its poster and taking stills of a preset clip.
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { frameTimes } from '@cvs/core/suggest';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import sharp from 'sharp';

const run = promisify(execFile);

/** Size of the first video stream. */
export async function probeSize(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await run(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  const stream = (JSON.parse(stdout) as { streams?: { width: number; height: number }[] }).streams?.[0];
  if (!stream) throw new Error('the output has no video stream');
  return stream;
}

/** The image type from the file's first bytes (the provider's content type is not trusted), or undefined when it is not a PNG, JPEG or WebP. */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | undefined {
  const at = (i: number, text: string) => [...text].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && at(1, 'PNG')) return { mime: 'image/png', ext: 'png' };
  if (at(0, 'RIFF') && at(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };
  return undefined;
}

/** The ratio of `ratios` closest to the image as it is seen (EXIF orientation applied); 'auto' when the model offers no fixed ratio. */
export async function closestRatio(bytes: Uint8Array, ratios: string[]): Promise<string> {
  const fixed = ratios.filter((r) => r !== 'auto');
  const { width = 0, height = 0, orientation = 1 } = await sharp(bytes).metadata();
  if (!fixed.length || !width || !height) return 'auto';
  const shape = Math.log(orientation >= 5 ? height / width : width / height);
  const off = (r: string) => {
    const [w, h] = r.split(':').map(Number);
    return Math.abs(Math.log(w! / h!) - shape);
  };
  return fixed.reduce((best, r) => (off(r) < off(best) ? r : best));
}

/** An image output's tile preview: a JPEG of the upright image, its longest side at most 1024 px (never enlarged), transparency on white. */
export async function imagePreview(bytes: Uint8Array): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Writes the first frame as a JPEG no wider than 480 px. */
export async function extractPoster(video: string, jpeg: string): Promise<void> {
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', video, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '3', jpeg]);
}

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

/**
 * A Smart Remake shot as the edit is sent it: `keep` seconds of the video from `start`, silent, fitted inside 1280x1280 (the edit makes 720p), then
 * held on its last frame up to `seconds` (the edit takes at least 2 s). The hold is as long as `seconds` and the output is cut to `seconds`, so a
 * shot the source ends early in still comes out whole; one with no frame at all comes out empty, which the caller checks before paying.
 */
export async function cutShot(video: string, start: number, keep: number, seconds: number, out: string): Promise<void> {
  const vf = `scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,tpad=stop_mode=clone:stop_duration=${seconds}`;
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-ss', start.toFixed(3), '-t', keep.toFixed(3), '-i', video, '-an', '-vf', vf, '-t', String(seconds), ...H264, out]);
}

/** The first `seconds` of a clip, silent: a remake shot's edit cut back to the shot's own length. */
export async function trimClip(clip: string, seconds: number, out: string): Promise<void> {
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', clip, '-t', seconds.toFixed(3), '-an', ...H264, out]);
}

/** Two clips side by side at the right one's height, silent, as long as the shorter: a remake's before and after. */
export async function sideBySide(left: string, right: string, out: string): Promise<void> {
  const { height } = await probeSize(right);
  const fit = (i: number) => `[${i}:v:0]scale=-2:${height},setsar=1,fps=24[v${i}]`;
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', left, '-i', right, '-filter_complex', `${fit(0)};${fit(1)};[v0][v1]hstack=inputs=2:shortest=1[out]`, '-map', '[out]', ...H264, out]);
}

/** Clips joined end to end into one silent H.264 MP4 at the first clip's size, each fitted inside it, so clips of another size or rate still join. */
export async function concatClips(clips: string[], out: string): Promise<void> {
  const { width, height } = await probeSize(clips[0]!);
  const fit = clips.map((_, i) => `[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`);
  const join = `${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[out]`;
  await run(requireFfmpeg(), ['-y', '-v', 'error', ...clips.flatMap((c) => ['-i', c]), '-filter_complex', [...fit, join].join(';'), '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
}

/** A clip's length in seconds, as ffprobe reads it. */
export async function probeSeconds(file: string): Promise<number> {
  const { stdout } = await run(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

/**
 * How long a video's first video stream plays, from its packets' timestamps (edit lists applied), in seconds; 0 without video packets. The MP4 header
 * (`mvhd`), which `probeSeconds` and the upload read, is written by whoever made the file and can claim any length.
 */
export async function probeVideoSeconds(file: string): Promise<number> {
  const { stdout } = await run(ffprobe.path, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', file], { maxBuffer: 64 * 1024 * 1024 });
  let first = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const line of stdout.split('\n')) {
    const [pts, duration] = line.split(',').map(Number);
    if (!Number.isFinite(pts)) continue;
    first = Math.min(first, pts!);
    end = Math.max(end, pts! + (duration || 0));
  }
  return end > 0 ? end - Math.max(0, first) : 0;
}

/**
 * `n` evenly spaced stills of an MP4 (or one at each of the given times in seconds, kept inside the clip) as small JPEGs (512 px on the long side at most), in
 * time order, and the clip's length in seconds. `video` is the clip's bytes, or a function that saves it to the given file (a large one then stays on disk).
 */
export async function extractFrames(video: Uint8Array | ((file: string) => Promise<void>), n: number | number[]): Promise<{ seconds: number; stills: Uint8Array[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'cvs-frames-'));
  try {
    const file = join(dir, 'clip.mp4');
    await (typeof video === 'function' ? video(file) : writeFile(file, video));
    const seconds = await probeSeconds(file);
    if (!(seconds > 0)) throw new Error('the clip has no duration');
    const times = typeof n === 'number' ? frameTimes(seconds, n) : n.map((t) => Math.min(Math.max(t, 0), Math.max(seconds - 0.1, 0)));
    const stills: Uint8Array[] = [];
    // Four ffmpeg at a time: a scene pick asks for up to 30 stills on the shared worker.
    for (let k = 0; k < times.length; k += 4) {
      stills.push(
        ...(await Promise.all(
          times.slice(k, k + 4).map(async (t, j) => {
            const jpeg = join(dir, `${k + j}.jpg`);
            const scale = 'scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2';
            await run(requireFfmpeg(), ['-y', '-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', scale, '-q:v', '4', jpeg]);
            return new Uint8Array(await readFile(jpeg));
          }),
        )),
      );
    }
    return { seconds, stills };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Be Vietnam Pro Bold (SIL Open Font License 1.1, assets/fonts/OFL.txt): a bold face with every Vietnamese glyph, shipped with the worker's checkout. */
const END_FONT = fileURLToPath(new URL('../assets/fonts/BeVietnamPro-Bold.ttf', import.meta.url));
/** How long the end text stays on screen, at the end of the clip. */
export const END_TEXT_SECONDS = 2;
export type EndTextPosition = 'bottom' | 'middle' | 'top';

/** `text` in lines of at most `max` characters, broken at spaces; a word longer than a line is cut. */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else for (let i = 0; i < word.length; i += max) lines.push(word.slice(i, i + max));
  }
  return lines;
}

/**
 * The font size and lines of the end text on a `width` x `height` frame: about 7% of the short side, shrunk until the text fits in 3 lines across 88% of
 * the width (a bold glyph is taken as 0.6 of the size wide), but never under 4%.
 */
export function endTextLayout(text: string, width: number, height: number): { size: number; lines: string[] } {
  const short = Math.min(width, height);
  for (let size = Math.round(short * 0.07); ; size = Math.round(size * 0.9)) {
    const lines = wrapText(text, Math.max(1, Math.floor((width * 0.88) / (size * 0.6))));
    if (lines.length <= 3 || size * 0.9 < short * 0.04) return { size, lines };
  }
}

/**
 * Burns `text` (the member's own words) over the last END_TEXT_SECONDS of `video` into `out`: white bold lines centred on a translucent dark band at the
 * bottom, middle or top, clear of the margins a phone app draws over. The text and the font go to ffmpeg as files in a scratch folder it runs in, so
 * nothing the member typed is parsed by the filter graph and no path needs escaping; `expansion=none` keeps drawtext from reading %{...} in it. The video
 * is re-encoded (H.264, yuv420p) and the sound copied as it is.
 */
export async function burnEndText(video: string, out: string, text: string, position: EndTextPosition): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'cvs-endtext-'));
  try {
    const [{ width, height }, { stdout }] = await Promise.all([probeSize(video), run(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])]);
    const seconds = Number(stdout.trim());
    if (!(seconds > 0)) throw new Error('the clip has no duration');
    const { size, lines } = endTextLayout(text.normalize('NFC'), width, height);
    if (lines.length === 0) throw new Error('the end text is empty');
    const lineHeight = Math.round(size * 1.35);
    const pad = Math.round(size * 0.5);
    const band = lines.length * lineHeight + 2 * pad;
    const top = position === 'top' ? Math.round(height * 0.08) : position === 'middle' ? Math.round((height - band) / 2) : height - Math.round(height * 0.12) - band;
    const on = `enable='gte(t,${Math.max(0, seconds - END_TEXT_SECONDS).toFixed(3)})'`;
    await copyFile(END_FONT, join(dir, 'font.ttf'));
    await Promise.all(lines.map((line, i) => writeFile(join(dir, `line${i}.txt`), line, 'utf8')));
    // drawtext puts a line's highest glyph at y, so y = baseline - ascent sets every line on its own baseline whatever its accents.
    const filters = [
      `drawbox=x=0:y=${top}:w=iw:h=${band}:color=black@0.55:t=fill:${on}`,
      ...lines.map((_, i) => `drawtext=fontfile=font.ttf:textfile=line${i}.txt:expansion=none:fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=${top + pad + i * lineHeight + Math.round(size * 1.02)}-ascent:${on}`),
    ];
    await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', video, '-vf', filters.join(','), '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out], { cwd: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  return ffmpegPath;
}
