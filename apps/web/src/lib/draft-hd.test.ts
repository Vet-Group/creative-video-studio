import { expect, test } from 'vitest';
import { hdHref, hdName, hdOf } from './draft-hd';

const job = (modelId: string, over: Partial<{ feature: string; status: string }> = {}) => ({ id: 'j1', feature: 'video', status: 'succeeded', modelId, ...over });

test('a finished draft clip reopens Create on its HD sibling', () => {
  expect(hdHref(job('minimax-h3-max-turbo-480p'))).toBe('/create?reuse=j1&model=minimax-h3-max-turbo-1080p');
  expect(hdHref(job('minimax-h3-max-480p'))).toBe('/create?reuse=j1&model=minimax-h3-max-1080p');
  expect(hdHref(job('minimax-h3-max-reference'))).toBe('/create?reuse=j1&model=minimax-h3-max-reference-1080p');
  expect(hdHref(job('veo-3.1-lite'))).toBe('/create?reuse=j1&model=veo-3.1');
  expect(hdOf('veo-3.1-lite')?.short).toBe('Veo 3.1');
  expect(hdOf('minimax-h3-max-turbo')?.short).toBe('1080p');
});

test('no HD offer for an HD row, another feature, or a clip that did not finish', () => {
  expect(hdHref(job('minimax-h3-max-turbo-1080p'))).toBeUndefined();
  expect(hdHref(job('veo-3.1'))).toBeUndefined();
  expect(hdHref(job('minimax-h3-max-turbo-480p', { feature: 'marketing' }))).toBeUndefined();
  expect(hdHref(job('minimax-h3-max-turbo-480p', { status: 'failed' }))).toBeUndefined();
});

test('every HD sibling is named, and no sibling is itself a draft', () => {
  for (const id of ['minimax-h3-max-turbo-480p', 'minimax-h3-max-turbo', 'minimax-h3-max-480p', 'minimax-h3-max', 'minimax-h3-max-reference-480p', 'minimax-h3-max-reference', 'veo-3.1-lite']) {
    const hd = hdOf(id)!;
    expect(hdName(hd.id)).toBe(hd.name);
    expect(hdOf(hd.id)).toBeUndefined();
  }
});
