import { describe, expect, it } from 'vitest';
import { ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, briefRoom, HOOKS, LOCATIONS, marketingPrompt } from './marketing';

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
    expect(fixed).toContain('The creator in [Image1] wears or holds the product in [Image2]');
    expect(fixed).toContain('Show the whole look, a close-up of the product, then a natural move or turn that shows the fit.');
    for (const none of [{ hook: null, location: null, prompt: null }, { hook: '', location: '', prompt: '   ' }, { hook: undefined }]) expect(marketingPrompt(none)).toBe(fixed);
  });

  it('adds the hook, then the location, then the trimmed text, in that order', () => {
    const p = marketingPrompt({ hook: 'product-catch', location: 'kitchen', prompt: '  Keep it cheerful.  ' });
    const hook = HOOKS.find((c) => c.id === 'product-catch')!.phrase;
    const place = LOCATIONS.find((c) => c.id === 'kitchen')!.phrase;
    expect(p).toBe(`${fixed} ${hook} Set in ${place}. Creator notes: Keep it cheerful.`);
  });

  it('ends with the sound rule when audio is given: phone sound with a spoken reaction when on, silence when off', () => {
    const on = marketingPrompt({ prompt: 'x', audio: true });
    expect(on.startsWith(`${fixed} Creator notes: x Natural sound recorded on the phone:`)).toBe(true);
    expect(on).toMatch(/spoken reaction.*no background music\.$/);
    expect(marketingPrompt({ audio: false })).toBe(`${fixed} The video is completely silent: no speech, no music and no sound.`);
  });

  it('adds only what is given', () => {
    expect(marketingPrompt({ hook: 'product-catch' })).toBe(`${fixed} ${HOOKS.find((c) => c.id === 'product-catch')!.phrase}`);
    expect(marketingPrompt({ location: 'outdoor' })).toBe(`${fixed} Set in ${LOCATIONS.find((c) => c.id === 'outdoor')!.phrase}.`);
    expect(marketingPrompt({ prompt: 'x' })).toBe(`${fixed} Creator notes: x`);
  });

  it('ignores an unknown id, and a hook id is not a location id', () => {
    expect(marketingPrompt({ hook: 'nope', location: 'product-catch' })).toBe(fixed);
  });

  it('frames the clip by the chosen ratio, not always vertical', () => {
    expect(marketingPrompt({ ratio: '9:16' }).startsWith('UGC try-on video, vertical 9:16 frame,')).toBe(true);
    expect(marketingPrompt({ ratio: '16:9' }).startsWith('UGC try-on video, horizontal 16:9 frame,')).toBe(true);
    expect(marketingPrompt({ ratio: '1:1' }).startsWith('UGC try-on video, square 1:1 frame,')).toBe(true);
    expect(marketingPrompt({ ratio: '4:5' }).startsWith('UGC try-on video, 4:5 frame,')).toBe(true);
    expect(fixed.startsWith('UGC try-on video, vertical frame,')).toBe(true);
  });

  // Three whole prompts pinned, so a wording change shows up in review.
  it.each([
    [
      'nothing chosen, 9:16, audio on',
      { ratio: '9:16', audio: true },
      "UGC try-on video, vertical 9:16 frame, filmed handheld on a phone by a real creator. The creator in [Image1] wears or holds the product in [Image2]; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos. Show the whole look, a close-up of the product, then a natural move or turn that shows the fit. Soft natural light, authentic energy. No on-screen text, logos or watermarks. Natural sound recorded on the phone: the room's ambience and the creator's short, casual spoken reaction to the product, with no background music.",
    ],
    [
      'hook, location and notes, 1:1, silent',
      { ratio: '1:1', hook: 'product-catch', location: 'kitchen', prompt: ' Keep it cheerful. ', audio: false },
      "UGC try-on video, square 1:1 frame, filmed handheld on a phone by a real creator. The creator in [Image1] wears or holds the product in [Image2]; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos. Show the whole look, a close-up of the product, then a natural move or turn that shows the fit. Soft natural light, authentic energy. No on-screen text, logos or watermarks. The creator catches the product thrown into frame with an energetic, surprised reaction. Set in a modern kitchen in warm light. Creator notes: Keep it cheerful. The video is completely silent: no speech, no music and no sound.",
    ],
    [
      'location only, 16:9, audio on',
      { ratio: '16:9', location: 'street', audio: true },
      "UGC try-on video, horizontal 16:9 frame, filmed handheld on a phone by a real creator. The creator in [Image1] wears or holds the product in [Image2]; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos. Show the whole look, a close-up of the product, then a natural move or turn that shows the fit. Soft natural light, authentic energy. No on-screen text, logos or watermarks. Set in a lively city street in the daytime. Natural sound recorded on the phone: the room's ambience and the creator's short, casual spoken reaction to the product, with no background music.",
    ],
  ])('pins the whole prompt: %s', (_, input, expected) => {
    expect(marketingPrompt(input)).toBe(expected);
  });

  it('gives the brief exactly the room the model leaves: a brief of that length fills the limit, and the smallest limit (2000) still leaves over 1000', () => {
    for (const ratio of ['9:16', '16:9', '1:1']) {
      for (const h of HOOKS) {
        for (const l of LOCATIONS) {
          const compose = (prompt: string) => marketingPrompt({ ratio, hook: h.id, location: l.id, prompt, audio: true });
          const room = briefRoom(compose, 2000);
          expect(room).toBeGreaterThan(1000);
          expect(compose('x'.repeat(room)).length).toBe(2000);
          expect(briefRoom(compose, 5000)).toBe(room + 3000);
        }
      }
    }
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

  it('leaves the brief over 1000 characters on the smallest limit (2000) with the longest hook, location, 7 images and script, and fills it exactly', () => {
    for (const h of HOOKS) {
      for (const l of LOCATIONS) {
        const compose = (brief: string) => advancedPrompt({ brief, images: ADVANCED_MAX_IMAGES, hook: h.id, location: l.id, script: 'y'.repeat(ADVANCED_MAX_SCRIPT), audio: true });
        expect(briefRoom(compose, 2000)).toBeGreaterThan(1000);
        expect(compose('x'.repeat(briefRoom(compose, 2000))).length).toBe(2000);
      }
    }
    expect(briefRoom(() => 'y'.repeat(3000), 2000)).toBe(0); // never negative
  });
});
