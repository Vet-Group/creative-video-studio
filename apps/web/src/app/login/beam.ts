// Flashlight geometry for the password reveal: a cone from the eye button towards the pointer, in viewport pixels.
export type Point = { x: number; y: number };
export type Beam = { origin: Point; u: Point; length: number; angle: number; maxHalf: number };

/** The beam reaches this many times the pointer distance, so pointing near the eye lights only the nearest characters. */
export const REACH = 1.65;
/** The shortest beam, so a pointer right on the eye still shows some light. */
export const MIN_LENGTH = 160;
/** Half width of the cone at the origin. */
export const W0 = 6;
/** How much the half width grows per pixel along the beam. */
export const SPREAD = 0.35;
/** Width of the soft side edge. */
export const EDGE = 8;
/** Length of the fade at the far end. */
export const END = 40;
/** Closer than this, the pointer gives no direction and the beam points along the field towards its start. */
export const MIN_D = 1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * `maxHalf` caps the half width, so on a narrow form the cone flattens into a band that stays off the neighbouring fields.
 * `minX` is a vertical line the beam ends at when it points left, such as the edge of the login card.
 */
export function beam(origin: Point, pointer: Point, maxHalf = Infinity, minX = -Infinity): Beam {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const d = Math.hypot(dx, dy);
  const u = d < MIN_D ? { x: -1, y: 0 } : { x: dx / d, y: dy / d };
  const toEdge = u.x < 0 ? (origin.x - minX) / -u.x : Infinity;
  return { origin, u, length: Math.min(Math.max(d * REACH, MIN_LENGTH), toEdge), angle: (Math.atan2(u.y, u.x) * 180) / Math.PI, maxHalf };
}

/** Half width of the beam at a distance along it. */
export const halfAt = (b: Beam, along: number) => Math.min(W0 + SPREAD * along, b.maxHalf);

/** Light level from 0 to 1 at a viewport point. */
export function lightAt(b: Beam, x: number, y: number): number {
  const px = x - b.origin.x;
  const py = y - b.origin.y;
  const along = px * b.u.x + py * b.u.y;
  if (along < 0 || along > b.length) return 0;
  const side = Math.abs(px * b.u.y - py * b.u.x);
  return clamp01((halfAt(b, along) - side) / EDGE) * clamp01((b.length - along) / END);
}
