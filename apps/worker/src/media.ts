// ffprobe and ffmpeg (the static binaries from npm) for checking an output clip, cutting its poster and taking stills of a preset clip.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
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

/** Writes the first frame as a JPEG no wider than 480 px. */
export async function extractPoster(video: string, jpeg: string): Promise<void> {
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', video, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '3', jpeg]);
}

/** `n` times spread evenly over a clip of `seconds`, each in the middle of its slice, so no still is the very first or last frame. */
export const frameTimes = (seconds: number, n: number): number[] => Array.from({ length: n }, (_, i) => ((i + 0.5) * seconds) / n);

/** `n` evenly spaced stills of an MP4 as small JPEGs (512 px on the long side at most), in time order. */
export async function extractFrames(video: Uint8Array, n: number): Promise<Uint8Array[]> {
  const dir = await mkdtemp(join(tmpdir(), 'cvs-frames-'));
  try {
    const file = join(dir, 'clip.mp4');
    await writeFile(file, video);
    const { stdout } = await run(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const seconds = Number(stdout.trim());
    if (!(seconds > 0)) throw new Error('the clip has no duration');
    return await Promise.all(
      frameTimes(seconds, n).map(async (t, i) => {
        const jpeg = join(dir, `${i}.jpg`);
        const scale = 'scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2';
        await run(requireFfmpeg(), ['-y', '-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', scale, '-q:v', '4', jpeg]);
        return new Uint8Array(await readFile(jpeg));
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  return ffmpegPath;
}
