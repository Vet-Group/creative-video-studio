import { describe, expect, it } from 'vitest';
import { HOOKS, LOCATIONS, marketingPrompt } from './marketing';

describe('HOOKS and LOCATIONS', () => {
  it.each([['HOOKS', HOOKS], ['LOCATIONS', LOCATIONS]])('%s has 6 to 12 unique choices with a Vietnamese name and description and an English phrase', (_, list) => {
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.length).toBeLessThanOrEqual(12);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    expect(new Set(list.map((c) => c.name)).size).toBe(list.length);
    for (const c of list) {
      expect(c.id).toMatch(/^[a-z-]+$/);
      expect(c.name.trim()).not.toBe('');
      expect(c.desc.trim()).not.toBe('');
      expect(c.phrase).toMatch(/^[\x20-\x7e]+$/); // plain English, no diacritics
    }
  });
});

describe('marketingPrompt', () => {
  const fixed = marketingPrompt({});

  it('is the fixed try-on instruction alone when nothing is chosen or written', () => {
    expect(fixed).toContain('The person in [Image1] wears the product in [Image2]');
    expect(fixed).toContain('Creator-style handheld vertical video');
    for (const none of [{ hook: null, location: null, prompt: null }, { hook: '', location: '', prompt: '   ' }, { hook: undefined }]) expect(marketingPrompt(none)).toBe(fixed);
  });

  it('adds the hook, then the location, then the trimmed text, in that order', () => {
    const p = marketingPrompt({ hook: 'product-catch', location: 'kitchen', prompt: '  Keep it cheerful.  ' });
    const hook = HOOKS.find((c) => c.id === 'product-catch')!.phrase;
    const place = LOCATIONS.find((c) => c.id === 'kitchen')!.phrase;
    expect(p).toBe(`${fixed} ${hook} Set in ${place}. Keep it cheerful.`);
  });

  it('adds only what is given', () => {
    expect(marketingPrompt({ hook: 'product-catch' })).toBe(`${fixed} ${HOOKS.find((c) => c.id === 'product-catch')!.phrase}`);
    expect(marketingPrompt({ location: 'outdoor' })).toBe(`${fixed} Set in ${LOCATIONS.find((c) => c.id === 'outdoor')!.phrase}.`);
    expect(marketingPrompt({ prompt: 'x' })).toBe(`${fixed} x`);
  });

  it('ignores an unknown id, and a hook id is not a location id', () => {
    expect(marketingPrompt({ hook: 'nope', location: 'product-catch' })).toBe(fixed);
  });

  it('leaves room for the member text under the 2000-character prompt limit of the jobs API', () => {
    const longest = Math.max(...HOOKS.flatMap((h) => LOCATIONS.map((l) => marketingPrompt({ hook: h.id, location: l.id }).length)));
    expect(longest).toBeLessThan(1000);
  });
});
