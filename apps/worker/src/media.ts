// ffprobe and ffmpeg (the static binaries from npm) for checking an output clip and cutting its poster.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

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

/** Writes the first frame as a JPEG no wider than 480 px. */
export async function extractPoster(video: string, jpeg: string): Promise<void> {
  await run(requireFfmpeg(), ['-y', '-v', 'error', '-i', video, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '3', jpeg]);
}

export function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  return ffmpegPath;
}
