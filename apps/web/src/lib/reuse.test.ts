import { expect, test } from 'vitest';
import { reuseHref } from './reuse';

test('the reuse link opens the page that made the job, with the job to refill from; features without a refill yet get no link', () => {
  expect(reuseHref({ id: 'j1', feature: 'video' })).toBe('/create?reuse=j1');
  expect(reuseHref({ id: 'j2', feature: 'marketing' })).toBe('/marketing-studio?reuse=j2');
  expect(reuseHref({ id: 'j 3', feature: 'video' })).toBe('/create?reuse=j%203');
  expect(reuseHref({ id: 'j4', feature: 'face_swap' })).toBeNull();
});
