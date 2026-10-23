// Helpers shared by the bake-off scripts (plan B.4). The scripts keep their data outside the repo, in cvs-bakeoff.
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const exec = promisify(execFile);

/** The bake-off data directory: inputs, out, blind, scores. CVS_BAKEOFF_DIR overrides it. */
export const defaultRoot = (): string => process.env.CVS_BAKEOFF_DIR ?? join(homedir(), 'cvs-bakeoff');

/** True when the module is the script node was started with, so a test can import it without running its CLI. */
export const isMain = (metaUrl: string): boolean => !!process.argv[1] && metaUrl === pathToFileURL(resolve(process.argv[1])).href;

/** Runs the pinned ffmpeg-static binary. A non-zero exit rejects with the stderr text in the message. */
export async function ffmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  try {
    return await exec(ffmpegPath, ['-hide_banner', ...args], { maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`ffmpeg failed: ${(err.stderr ?? err.message).slice(-1000)}`);
  }
}

/** The clip length in seconds, read from the "Duration:" line ffmpeg prints for an input. */
export async function durationSec(file: string): Promise<number> {
  const { stderr } = await ffmpeg(['-i', file, '-f', 'null', '-']);
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new Error(`no duration found for ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
