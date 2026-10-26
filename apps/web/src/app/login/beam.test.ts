import { expect, test } from 'vitest';
import { beam, lightAt, MIN_LENGTH, REACH } from './beam';

const origin = { x: 300, y: 100 };
const b = beam(origin, { x: 100, y: 100 }); // aimed left along the field, 200 px away

test('the beam reaches past the pointer in proportion to its distance, and is never shorter than the minimum', () => {
  expect(b.length).toBeCloseTo(200 * REACH);
  expect(beam(origin, { x: 290, y: 100 }).length).toBe(MIN_LENGTH);
  expect(b.angle).toBe(180);
});

test('a pointer close to the eye lights only the nearest characters', () => {
  const near = beam(origin, { x: 220, y: 100 }); // 80 px away, so the minimum length applies
  expect(lightAt(near, origin.x - 60, origin.y)).toBeGreaterThan(0.9);
  expect(lightAt(near, origin.x - 250, origin.y)).toBe(0);
});

test('a point on the axis in the middle of the beam is fully lit', () => {
  expect(lightAt(b, origin.x - b.length / 2, origin.y)).toBeGreaterThan(0.9);
});

test('points behind the origin, far to the side or beyond the end are dark', () => {
  expect(lightAt(b, origin.x + 10, origin.y)).toBe(0);
  expect(lightAt(b, origin.x - 100, origin.y + 200)).toBe(0);
  expect(lightAt(b, origin.x - b.length - 1, origin.y)).toBe(0);
});

test('a pointer on the origin gives finite values and points along the field towards its start', () => {
  const z = beam(origin, origin);
  expect(z.u).toEqual({ x: -1, y: 0 });
  expect(Number.isFinite(z.angle) && Number.isFinite(z.length)).toBe(true);
  expect(Number.isNaN(lightAt(z, origin.x - 50, origin.y))).toBe(false);
  expect(lightAt(z, origin.x - 50, origin.y)).toBeGreaterThan(0.9);
});

test('a capped beam stops widening, so points off the axis by more than the cap stay dark', () => {
  const capped = beam(origin, { x: 100, y: 100 }, 20);
  expect(capped.maxHalf).toBe(20);
  // 200 px along, the open cone is 76 px wide on each side; capped it is 20.
  expect(lightAt(b, origin.x - 200, origin.y - 50)).toBeGreaterThan(0.9);
  expect(lightAt(capped, origin.x - 200, origin.y - 50)).toBe(0);
  expect(lightAt(capped, origin.x - 200, origin.y - 5)).toBeGreaterThan(0.9);
});

test('a beam pointing left ends at minX, and stays full length when it points right', () => {
  const clipped = beam(origin, { x: 100, y: 100 }, Infinity, 150);
  expect(clipped.length).toBe(150);
  expect(lightAt(clipped, 140, origin.y)).toBe(0);
  expect(lightAt(clipped, 250, origin.y)).toBeGreaterThan(0.9);
  expect(beam(origin, { x: 500, y: 100 }, Infinity, 150).length).toBeCloseTo(200 * REACH);
});
