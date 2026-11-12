// Smart Remake (Feature B): the settings shared by the API, which validates a request, and the worker, which runs it.
// A remake puts a member's product image into chosen shots of one of their analysed reference videos: per shot, the
// frame at the shot's start is edited with the product, then animated, and the clips are joined in shot order.

/** The most shots one remake may take: each costs two paid fal calls, so this bounds a remake's spend (owner decision, 2026-11-13). */
export const REMAKE_MAX_SHOTS = 6;
/** Each shot's clip length in seconds, the Seedance default. */
export const REMAKE_SHOT_SECONDS = 5;

/** The edit step: Nano Banana's multi-image edit puts the product (second image) into the shot's frame (first image), as validated in the 2026-11-11 spike. */
export const REMAKE_EDIT_ENDPOINT = 'fal-ai/nano-banana/edit';
/** Its price per 1K image, as its model_configs row stores it (migration 0007). */
export const REMAKE_EDIT_USD = 0.0398;

/**
 * The animate step: Seedance 1.0 Pro Fast at 720p; fal redirects the spike's v1/lite endpoint here (its schema, read 2026-11-13). It is priced by output
 * tokens at $1 per million (fal pricing, read 2026-11-13), tokens = width x height x 24 fps x seconds / 1024, so about $0.0216 a second at 1280x720.
 * shortcut: an estimate from the listed price; the first real remake (the enablement PR's price check) and the monthly fal invoice (invoice_diff) confirm it.
 */
export const REMAKE_VIDEO_ENDPOINT = 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video';
export const REMAKE_VIDEO_USD_PER_SECOND = 0.0216;

/** Why these chosen shot indices cannot be remade from an analysis whose shots have the `available` indices, or null: 1 to REMAKE_MAX_SHOTS distinct shots of the analysis. */
export function remakeShotsProblem(chosen: unknown, available: number[]): string | null {
  if (!Array.isArray(chosen) || chosen.length === 0 || !chosen.every((n) => Number.isInteger(n))) return 'shots must be a non-empty list of shot numbers';
  if (chosen.length > REMAKE_MAX_SHOTS) return `at most ${REMAKE_MAX_SHOTS} shots per remake`;
  if (new Set(chosen).size !== chosen.length) return 'each shot may be chosen once';
  const missing = chosen.find((n) => !available.includes(n));
  return missing === undefined ? null : `shot ${missing} is not in the analysis`;
}
