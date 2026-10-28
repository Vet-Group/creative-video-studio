import { expect, test } from 'vitest';
import { refillFrom, reuseHref } from './reuse';

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
