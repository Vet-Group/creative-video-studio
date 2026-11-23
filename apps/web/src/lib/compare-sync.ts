/** How far one video may drift from its partner before a seek puts it back in step. */
export const DRIFT_SECONDS = 0.25;

type Playhead = { paused: boolean; ended: boolean; currentTime: number };

/**
 * What the partner video must do to follow `from`: the time to seek to (null when it is close enough, which also stops a seek echoing back
 * and forth) and whether to play (true), pause (false) or leave it (null). A video that reached its end does not pause the longer one.
 */
export function mirrorOf(from: Playhead, to: Playhead): { seek: number | null; play: boolean | null } {
  return {
    seek: Math.abs(from.currentTime - to.currentTime) > DRIFT_SECONDS ? from.currentTime : null,
    play: from.paused === to.paused || from.ended ? null : !from.paused,
  };
}
