import { expect, test } from 'vitest';
import { cardSample, EXAMPLES, examplesFor, numberedSamples, splitColumns } from './examples';

test('the samples cover four aspects and never set a ratio the job form lacks', () => {
  expect(new Set(EXAMPLES.map((e) => e.aspect))).toEqual(new Set(['16:9', '1:1', '3:4', '9:16']));
  for (const e of EXAMPLES) {
    if (e.ratio) expect(['9:16', '1:1']).toContain(e.ratio);
    else expect(['16:9', '3:4']).toContain(e.aspect);
  }
  expect(EXAMPLES.length).toBeGreaterThanOrEqual(9);
  expect(new Set(EXAMPLES.slice(0, 9).map((e) => e.height / e.width)).size).toBeGreaterThanOrEqual(3);
});

test('splitColumns keeps every tile once, in order within a column, and levels the columns', () => {
  const columns = splitColumns(EXAMPLES, 3);
  expect(columns.flat().map((e) => e.id).sort()).toEqual(EXAMPLES.map((e) => e.id).sort());
  const height = (col: typeof EXAMPLES) => col.reduce((sum, e) => sum + e.height / e.width, 0);
  const heights = columns.map(height);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1.8); // under one tall tile
  for (const col of columns) {
    const indexes = col.map((e) => EXAMPLES.indexOf(e));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  }
});

test('numbered samples keep their prefix and extension and sort by number', () => {
  const have = new Set(['image-example-10.jpg', 'image-example-2.jpg', 'image-example-1.jpg', 'image-example-01.jpg', 'image-example-x.jpg', 'image-example-3.mp4', 'try-on-example-1.jpg', 'image-example-.jpg']);
  expect(numberedSamples(have, 'image-example-', 'jpg')).toEqual(['image-example-1.jpg', 'image-example-2.jpg', 'image-example-10.jpg']);
  expect(numberedSamples(have, 'image-example-', 'mp4')).toEqual(['image-example-3.mp4']);
  expect(numberedSamples(new Set(), 'image-example-', 'jpg')).toEqual([]);
});

test('a card plays its uploaded loop over its uploaded still, and falls back to the given still or nothing', () => {
  const have = new Set(['app-reframe.mp4', 'app-reframe.jpg', 'model-veo-3-1.jpg', 'preset-turn-around.mp4']);
  expect(cardSample(have, 'app-reframe')).toEqual({ video: '/api/samples/app-reframe.mp4', poster: '/api/samples/app-reframe.jpg' });
  expect(cardSample(have, 'model-veo-3-1')).toEqual({ video: null, poster: '/api/samples/model-veo-3-1.jpg' });
  expect(cardSample(have, 'preset-turn-around', '/fixtures/examples/example-1.jpg')).toEqual({ video: '/api/samples/preset-turn-around.mp4', poster: '/fixtures/examples/example-1.jpg' });
  expect(cardSample(have, 'app-face-swap')).toEqual({ video: null, poster: null });
});

test('the Examples tab keeps the ten fixture clips and adds only the further sample clips that are uploaded, in order', () => {
  expect(examplesFor(new Set())).toEqual(EXAMPLES);
  const ids = examplesFor(new Set(['example-12.mp4', 'example-11.mp4', 'example-12.jpg', 'example-99.mp4'])).map((e) => e.id);
  expect(ids.slice(10)).toEqual(['example-11', 'example-12']);
  expect(ids).toHaveLength(12);
});
