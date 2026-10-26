import { expect, test } from 'vitest';
import { beam, lightAt, TAIL } from './beam';

const origin = { x: 300, y: 100 };
const b = beam(origin, { x: 100, y: 100 }, 280); // aimed left along the field, length 200 + TAIL

test('the beam is as long as the pointer distance plus the tail, and never shorter than the field', () => {
  expect(b.length).toBe(200 + TAIL);
  expect(beam(origin, { x: 290, y: 100 }, 280).length).toBe(280);
  expect(b.angle).toBe(180);
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
  const z = beam(origin, origin, 280);
  expect(z.u).toEqual({ x: -1, y: 0 });
  expect(Number.isFinite(z.angle) && Number.isFinite(z.length)).toBe(true);
  expect(Number.isNaN(lightAt(z, origin.x - 50, origin.y))).toBe(false);
  expect(lightAt(z, origin.x - 50, origin.y)).toBeGreaterThan(0.9);
});

test('a capped beam stops widening, so points off the axis by more than the cap stay dark', () => {
  const capped = beam(origin, { x: 100, y: 100 }, 280, 20);
  expect(capped.maxHalf).toBe(20);
  // 200 px along, the open cone is 76 px wide on each side; capped it is 20.
  expect(lightAt(b, origin.x - 200, origin.y - 50)).toBeGreaterThan(0.9);
  expect(lightAt(capped, origin.x - 200, origin.y - 50)).toBe(0);
  expect(lightAt(capped, origin.x - 200, origin.y - 5)).toBeGreaterThan(0.9);
});
