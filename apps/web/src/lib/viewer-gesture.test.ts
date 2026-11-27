import { expect, test } from 'vitest';
import { clampView, fitted, MAX_SCALE, swipeOutcome, zoomAt } from './viewer-gesture';

const box = { w: 800, h: 1000 };

test('a picture is fitted inside the box like object-fit: contain', () => {
  expect(fitted(box, { w: 1600, h: 1000 })).toEqual({ w: 800, h: 500 });
  expect(fitted(box, { w: 400, h: 1000 })).toEqual({ w: 400, h: 1000 });
  expect(fitted(box, { w: 0, h: 0 })).toEqual(box); // not loaded yet
});

test('a zoomed picture cannot be dragged off screen, and one that fits stays centred', () => {
  const shown = { w: 800, h: 500 };
  expect(clampView({ s: 2, x: 9999, y: 9999 }, box, shown)).toEqual({ s: 2, x: 400, y: 0 }); // 1600 wide in 800: 400 either way; 1000 high in 1000: none
  expect(clampView({ s: 2, x: -9999, y: 5 }, box, shown)).toEqual({ s: 2, x: -400, y: 0 });
  expect(clampView({ s: 1, x: 30, y: 30 }, box, shown)).toEqual({ s: 1, x: 0, y: 0 });
  expect(clampView({ s: 99, x: 0, y: 0 }, box, { w: 800, h: 1000 }).s).toBe(MAX_SCALE);
});

test('zooming keeps the tapped point under the finger', () => {
  const shown = box;
  // Tap 200 px right of the centre: at 2x that point moves to 400, so the picture shifts 200 left.
  expect(zoomAt({ s: 1, x: 0, y: 0 }, 2, { x: 200, y: 0 }, box, shown)).toEqual({ s: 2, x: -200, y: 0 });
  // A tap near the edge cannot shift past the clamp.
  expect(zoomAt({ s: 1, x: 0, y: 0 }, 2, { x: -400, y: -500 }, box, shown)).toEqual({ s: 2, x: 400, y: 500 });
  // Zooming out to 1 re-centres.
  expect(zoomAt({ s: 2, x: -200, y: 0 }, 1, { x: 0, y: 0 }, box, shown).x).toBeCloseTo(0);
});

test('a swipe closes downwards, steps sideways towards a neighbour, and otherwise snaps back', () => {
  const both = { prev: true, next: true };
  expect(swipeOutcome(0, 150, 400, both)).toBe('close');
  expect(swipeOutcome(0, 50, 400, both)).toBeNull(); // short and slow
  expect(swipeOutcome(0, 50, 50, both)).toBe('close'); // a flick
  expect(swipeOutcome(0, -200, 100, both)).toBeNull(); // up does nothing
  expect(swipeOutcome(80, 10, 300, both)).toBe('prev'); // the finger moves right: the one before
  expect(swipeOutcome(-80, 10, 300, both)).toBe('next');
  expect(swipeOutcome(-80, 10, 300, { prev: true, next: false })).toBeNull();
  expect(swipeOutcome(20, 5, 300, both)).toBeNull();
});
