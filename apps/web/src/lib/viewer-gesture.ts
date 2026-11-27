// The maths of ImageViewer's gestures (zoom, pan, swipe), apart from the pointer events so it can be tested.
export type View = { s: number; x: number; y: number }; // scale about the box centre, then the shift in px
export type Size = { w: number; h: number };
export type Point = { x: number; y: number };
export type Swipe = 'close' | 'prev' | 'next' | null;

export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2;
const CLOSE_PX = 120; // a drag down this far closes
const STEP_PX = 60; // a drag sideways this far steps to the neighbour
const FLICK_PX = 40; // a shorter drag still counts when it is fast
const FLICK_SPEED = 0.5; // px per ms

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The picture as `object-fit: contain` draws it inside `box`. */
export function fitted(box: Size, natural: Size): Size {
  if (!natural.w || !natural.h) return box;
  const k = Math.min(box.w / natural.w, box.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/** Keeps the zoomed picture covering the box: it cannot be dragged off screen, and a picture smaller than the box stays centred. */
export function clampView(v: View, box: Size, shown: Size): View {
  const s = clamp(v.s, 1, MAX_SCALE);
  const mx = Math.max(0, (shown.w * s - box.w) / 2);
  const my = Math.max(0, (shown.h * s - box.h) / 2);
  return { s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
}

/** A new scale that keeps the point under `focal` (px from the box centre) where it is. */
export function zoomAt(v: View, s: number, focal: Point, box: Size, shown: Size): View {
  const k = clamp(s, 1, MAX_SCALE) / v.s;
  return clampView({ s: v.s * k, x: focal.x - (focal.x - v.x) * k, y: focal.y - (focal.y - v.y) * k }, box, shown);
}

/** Whether `p` (px from the box centre) is on the picture itself, as drawn under the view. */
export function onPicture(p: Point, v: View, shown: Size): boolean {
  return Math.abs(p.x - v.x) <= (shown.w * v.s) / 2 && Math.abs(p.y - v.y) <= (shown.h * v.s) / 2;
}

/** What a finished one-finger drag at scale 1 does: down closes, sideways steps (only towards a neighbour that exists), else the picture snaps back. */
export function swipeOutcome(dx: number, dy: number, ms: number, has: { prev: boolean; next: boolean }): Swipe {
  const fast = (d: number) => Math.abs(d) / Math.max(ms, 1) >= FLICK_SPEED;
  if (Math.abs(dy) > Math.abs(dx)) return dy >= CLOSE_PX || (dy >= FLICK_PX && fast(dy)) ? 'close' : null;
  if (Math.abs(dx) < STEP_PX && !(Math.abs(dx) >= FLICK_PX && fast(dx))) return null;
  if (dx > 0) return has.prev ? 'prev' : null;
  return has.next ? 'next' : null;
}
