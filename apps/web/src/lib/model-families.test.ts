import { expect, test } from 'vitest';
import { byFamily, FEATURED, familyOf, featured } from './model-families';

test('a model falls into its family by id, provider twins included; an unknown id falls into the other family', () => {
  const keys = (ids: string[]) => ids.map((id) => familyOf(id).key);
  expect(keys(['seedance-2.0', 'seedance-2.0-replicate', 'seedance-2.5-reference'])).toEqual(['seedance', 'seedance', 'seedance']);
  expect(keys(['kling-o3-pro', 'kling-v3-motion-pro'])).toEqual(['kling', 'kling']);
  expect(keys(['gemini-omni-flash', 'veo-3.1', 'nano-banana-2-vertex', 'virtual-try-on-vertex', 'product-recontext-vertex'])).toEqual(['google', 'google', 'google', 'google', 'google']);
  expect(keys(['flux-3', 'grok-imagine-1.5', 'wan-2.7', 'minimax-h3-max', 'gpt-image-2.5-flare', 'seedream-5-pro'])).toEqual(['flux', 'xai', 'alibaba', 'minimax', 'openai', 'seedream']);
  expect(keys(['mock-e2e', 'topaz-upscale'])).toEqual(['other', 'other']);
});

test('the families come in a fixed order with the other family last, each keeping the order of its models', () => {
  const groups = byFamily([{ id: 'mock-e2e' }, { id: 'kling-2.6' }, { id: 'seedance-2.0' }, { id: 'kling-o1' }]);
  expect(groups.map((g) => [g.family.key, g.models.map((m) => m.id)])).toEqual([
    ['seedance', ['seedance-2.0']],
    ['kling', ['kling-2.6', 'kling-o1']],
    ['other', ['mock-e2e']],
  ]);
});

test('the featured models: the recommended one first, then the best scores among the supported ones, at most FEATURED', () => {
  const m = (id: string, score: number, supported = true, recommended = false) => ({ id, score, supported, recommended });
  const list = [m('a', 40), m('b', 90, false), m('c', 70), m('d', 60, true, true), m('e', 70), m('f', 50), m('g', 10)];
  expect(featured(list).map((x) => x.id)).toEqual(['d', 'c', 'e', 'f', 'a']); // b is ruled out; c before e on a tie
  expect(featured(list)).toHaveLength(FEATURED);
});
