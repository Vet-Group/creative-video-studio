// Swiping between the items of the Library detail on a touch screen: when a drag counts as a swipe, and which neighbour it opens.

/** A drag shorter than this is a tap or a wobble, not a swipe. */
export const SWIPE_START_PX = 10;
/** A faster flick than this (px per ms) commits at any length; a slower drag must cross SWIPE_FRACTION of the width. */
const FLICK_PX_PER_MS = 0.4;
const SWIPE_FRACTION = 0.4;

/** The step to take after a horizontal drag of `dx` px that lasted `dt` ms over a `width` px area: 1 (next, a swipe left), -1 (previous, a swipe right) or 0 (snap back). */
export function swipeStep(dx: number, dt: number, width: number): -1 | 0 | 1 {
  const d = Math.abs(dx);
  if (d < SWIPE_START_PX || width <= 0) return 0;
  if (d / Math.max(dt, 1) < FLICK_PX_PER_MS && d <= width * SWIPE_FRACTION) return 0;
  return dx < 0 ? 1 : -1;
}
