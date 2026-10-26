import { describe, expect, it } from 'vitest';
import { ADVANCED_MAX_BRIEF, ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, HOOKS, LOCATIONS, marketingPrompt } from './marketing';

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

describe('advancedPrompt', () => {
  const base = { brief: '  A creator unboxes the sneakers on a park bench. ', images: 3, audio: true };

  it('starts from the brief as the source of truth and names every reference image', () => {
    const p = advancedPrompt(base);
    expect(p.startsWith('Marketing video. The brief below is the source of truth; follow it.')).toBe(true);
    expect(p).toContain('[Image1], [Image2], [Image3] show the people, products, settings or style');
    expect(p).not.toContain('[Image4]');
    expect(p).toContain('Brief: A creator unboxes the sneakers on a park bench.');
    expect(p.endsWith('Do not add on-screen text, captions or watermarks.')).toBe(true);
  });

  it('with no script adds speech only when the brief asks for it', () => {
    expect(advancedPrompt(base)).toContain('Add speech only if the brief asks for it; otherwise use ambient sound or music with no spoken words.');
    expect(advancedPrompt({ ...base, script: '   ' })).toBe(advancedPrompt(base));
  });

  it('with a script has the speaker say exactly its words, on one line, and no others', () => {
    const p = advancedPrompt({ ...base, script: ' These are so comfy.\n  Grab yours today! ' });
    expect(p).toContain('The speaker says exactly: "These are so comfy. Grab yours today!", lip-synced, and no other spoken words.');
    expect(p).not.toContain('Add speech only');
  });

  it('with audio off is silent, even with a script', () => {
    const p = advancedPrompt({ ...base, audio: false, script: 'Hello there' });
    expect(p).toContain('The video is completely silent: no speech, no music and no sound.');
    expect(p).not.toContain('Hello there');
    expect(p).not.toContain('speaker');
  });

  it('adds the hook and then the location after the brief, and ignores unknown ids', () => {
    const hook = HOOKS.find((c) => c.id === 'product-drop')!.phrase;
    const place = LOCATIONS.find((c) => c.id === 'gym')!.phrase;
    const p = advancedPrompt({ ...base, hook: 'product-drop', location: 'gym' });
    expect(p.indexOf('Brief:')).toBeLessThan(p.indexOf(hook));
    expect(p.indexOf(hook)).toBeLessThan(p.indexOf(`Set in ${place}.`));
    expect(p.indexOf(`Set in ${place}.`)).toBeLessThan(p.indexOf('Add speech only'));
    expect(advancedPrompt({ ...base, hook: 'nope', location: 'product-drop' })).toBe(advancedPrompt(base));
  });

  it('fits the 2000-character limit of the jobs API with the longest hook, location, 7 images and the page limits', () => {
    const longest = Math.max(...HOOKS.flatMap((h) => LOCATIONS.map((l) => advancedPrompt({ brief: 'x'.repeat(ADVANCED_MAX_BRIEF), images: ADVANCED_MAX_IMAGES, hook: h.id, location: l.id, script: 'y'.repeat(ADVANCED_MAX_SCRIPT), audio: true }).length)));
    expect(longest).toBeLessThanOrEqual(2000);
  });
});
