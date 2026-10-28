import { expect, test } from 'vitest';
import { exampleFrom, refillFrom, reuseHref } from './reuse';

test('the reuse link opens the page that made the job, with the job to refill from; features without a refill yet get no link', () => {
  expect(reuseHref({ id: 'j1', feature: 'video' })).toBe('/create?reuse=j1');
  expect(reuseHref({ id: 'j2', feature: 'marketing' })).toBe('/marketing-studio?reuse=j2');
  expect(reuseHref({ id: 'j3', feature: 'try_on' })).toBe('/try-on?reuse=j3');
  expect(reuseHref({ id: 'j4', feature: 'image' })).toBe('/image-generation?reuse=j4');
  expect(reuseHref({ id: 'j5', feature: 'character_swap' })).toBe('/apps/character-swap?reuse=j5');
  expect(reuseHref({ id: 'j6', feature: 'background_changer' })).toBe('/apps/background-changer?reuse=j6');
  expect(reuseHref({ id: 'j 7', feature: 'video' })).toBe('/create?reuse=j%207');
  expect(reuseHref({ id: 'j8', feature: 'motion_control' })).toBeNull();
  expect(reuseHref({ id: 'j9', feature: 'media_optimizer' })).toBeNull(); // still to come
});

test('a page refills from a job (?reuse=) before a saved template (?template=), and from nothing otherwise', () => {
  expect(refillFrom({ reuse: 'j 1' })).toBe('/api/jobs/j%201');
  expect(refillFrom({ template: 't1' })).toBe('/api/templates/t1');
  expect(refillFrom({ reuse: 'j1', template: 't1' })).toBe('/api/jobs/j1');
  expect(refillFrom({ reuse: ['a', 'b'] })).toBeUndefined();
  expect(refillFrom({})).toBeUndefined();
});

test("Recreate on a sample reads that sample's details file, and nothing else", () => {
  expect(exampleFrom({ example: 'marketing-example-3' })).toBe('/api/samples/marketing-example-3.json');
  expect(['marketing-example-0', 'marketing-example-3.mp4', '../x', 'image-example-1', 'example-0', ['marketing-example-1']].map((example) => exampleFrom({ example }))).toEqual(Array(6).fill(undefined));
  expect(exampleFrom({ example: 'example-12' })).toBe('/api/samples/example-12.json'); // Create Videos' samples
  expect(exampleFrom({ example: 'try-on-example-4' })).toBe('/api/samples/try-on-example-4.json');
  expect(exampleFrom({})).toBeUndefined();
});
