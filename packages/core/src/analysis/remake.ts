// Smart Remake (Feature B): the settings shared by the API, which validates a request, and the worker, which runs it.
// A remake puts a member's product image into chosen shots of one of their analysed reference videos: per shot, the
// shot's own clip is edited with the product, keeping its motion, framing and length, and the clips are joined in shot order.
import { type Analysis, type AnalysisShot, mergeShots } from './breakdown';

/** The most shots one remake may take: each is one paid fal call, so this bounds a remake's spend (owner decision, 2026-11-13). */
export const REMAKE_MAX_SHOTS = 6;

/**
 * The one paid call per shot: Wan 2.7 video edit puts the reference image's product into the shot's clip, keeping the clip's motion, framing and
 * length (owner's pick after the 2026-11-13 A/B against Nano Banana edit + Seedance, which lost the motion and came out square). Schema read
 * 2026-11-13: the clip is 2 to 10 s; priced at $0.10 per output second at 720p (fal pricing, read 2026-11-13).
 */
export const REMAKE_ENDPOINT = 'fal-ai/wan/v2.7/edit-video';
export const REMAKE_USD_PER_SECOND = 0.1;
export const REMAKE_MIN_SECONDS = 2;
export const REMAKE_MAX_SECONDS = 10;

/**
 * How many seconds of clip a shot is sent and billed as: its length in whole seconds, at least REMAKE_MIN_SECONDS (a shorter shot is padded with its
 * last frame) and at most REMAKE_MAX_SECONDS (a longer one keeps only its start). Rounded to 0.01 s first, so 2.1 - 0 is 3 but 2.0000001 is 2.
 */
export const remakeShotSeconds = (shot: { start: number; end: number }): number =>
  Math.min(REMAKE_MAX_SECONDS, Math.max(REMAKE_MIN_SECONDS, Math.ceil(Number((shot.end - shot.start).toFixed(2)))));

/** What a shot is estimated to cost; the API counts the chosen shots' sum against the spending caps before a remake is queued. */
export const remakeShotUsd = (shot: { start: number; end: number }): number => remakeShotSeconds(shot) * REMAKE_USD_PER_SECOND;

/**
 * What a remake takes for a chosen stored shot index: the scene it starts (mergeShots), from the shot's start to the scene's end, as the picker
 * offers it; a shot inside a scene stands for itself. Undefined when the analysis has no such shot.
 */
export function remakeScene(a: Analysis, index: number): AnalysisShot | undefined {
  const shot = a.shots.find((s) => s.index === index);
  if (!shot) return undefined;
  const { shots, first } = mergeShots(a);
  const k = first.indexOf(index);
  return k < 0 ? shot : { ...shot, end: shots[k]!.end };
}

/** Why these chosen shot indices cannot be remade from an analysis whose shots have the `available` indices, or null: 1 to REMAKE_MAX_SHOTS distinct shots of the analysis. */
export function remakeShotsProblem(chosen: unknown, available: number[]): string | null {
  if (!Array.isArray(chosen) || chosen.length === 0 || !chosen.every((n) => Number.isInteger(n))) return 'shots must be a non-empty list of shot numbers';
  if (chosen.length > REMAKE_MAX_SHOTS) return `at most ${REMAKE_MAX_SHOTS} shots per remake`;
  if (new Set(chosen).size !== chosen.length) return 'each shot may be chosen once';
  const missing = chosen.find((n) => !available.includes(n));
  return missing === undefined ? null : `shot ${missing} is not in the analysis`;
}
