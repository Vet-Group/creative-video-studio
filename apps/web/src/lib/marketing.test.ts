import { describe, expect, it } from 'vitest';
import { ADVANCED_MAX_IMAGES, ADVANCED_MAX_SCRIPT, advancedPrompt, briefRoom, ENDINGS, endingLine, highlightLines, hrefOfFormat, HOOKS, LOCATIONS, marketingPrompt, reviewPrompt, sectionBody, sectionPrompt, unboxingPrompt, unboxingRoles, UNBOXING_ROLES } from './marketing';

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

  it('with a reference video names it [Video1] in one sentence before the brief, and is unchanged without one', () => {
    const p = advancedPrompt({ ...base, video: true });
    expect(p).toContain('Follow the motion, camera framing and pace of [Video1]; do not copy its people, products or setting. Brief:');
    expect(p.split('[Video1]')).toHaveLength(2);
    expect(advancedPrompt({ ...base, video: false })).toBe(advancedPrompt(base));
    expect(advancedPrompt(base)).not.toContain('Video');
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

describe('the last shot (Cảnh kết)', () => {
  it('closes the brief as one sentence in both formats, before the sound rule, and adds nothing when blank', () => {
    const ugc = marketingPrompt({ prompt: 'smiles', ending: '  She waves goodbye\n to the camera. ', audio: false, ratio: '9:16' });
    expect(ugc).toContain('Creator notes: smiles It ends with: She waves goodbye to the camera. The video is completely silent');
    const adv = advancedPrompt({ brief: 'a bottle', images: 1, location: 'kitchen', ending: 'the bottle on the shelf!', audio: false });
    expect(adv).toContain('Set in a modern kitchen in warm light. It ends with: the bottle on the shelf. The video is completely silent');
    expect(adv).toMatch(/Do not add on-screen text, captions or watermarks\.$/); // the end text is the worker's, never the model's
    expect(marketingPrompt({ prompt: 'smiles', ending: '   ' })).toBe(marketingPrompt({ prompt: 'smiles' }));
    expect(advancedPrompt({ brief: 'x', images: 0, ending: null, audio: true })).toBe(advancedPrompt({ brief: 'x', images: 0, audio: true }));
  });
});

describe('the sectioned prompt (Theo phần)', () => {
  it('is the body exactly as typed, spaces and lines included, when the hook and the ending are empty', () => {
    for (const body of ['slow turn', '  The camera orbits.\n Soft light.  ', '']) {
      expect(sectionPrompt({ body })).toBe(body);
      expect(sectionPrompt({ hook: '  ', body, ending: '\n' })).toBe(body);
    }
  });

  it('puts the hook first and the ending last, one sentence each, with no doubled prefix or full stop', () => {
    expect(sectionPrompt({ hook: 'The clip opens on a spin', body: ' The model walks.  ', ending: 'she smiles!' })).toBe('The clip opens on a spin. The model walks. It ends with: she smiles.');
    // A library hook's phrase and a library ending's phrase (or a suggestion) read as written.
    const ending = ENDINGS[0]!.phrase;
    expect(sectionPrompt({ hook: HOOKS[2]!.phrase, body: 'x', ending })).toBe(`${HOOKS[2]!.phrase} x ${ending}`);
    expect(endingLine('The clip ends on a still close-up')).toBe('The clip ends on a still close-up.');
    expect(endingLine('it ends with a wave.')).toBe('it ends with a wave.');
    expect(endingLine('endless spin')).toBe('It ends with: endless spin.');
    for (const e of ENDINGS) expect(endingLine(e.phrase)).toBe(e.phrase);
    // A hook or an ending alone still makes a prompt.
    expect(sectionPrompt({ hook: 'Hộp quà bật mở', body: '' })).toBe('Hộp quà bật mở.');
  });

  it('gives back the body of a prompt it made, for Dùng lại, and null for one it did not', () => {
    const parts = { hook: 'The clip opens on a spin.', body: 'The model walks to the window.', ending: 'The clip ends with a wave.' };
    expect(sectionBody(sectionPrompt(parts), parts.hook, parts.ending)).toBe(parts.body);
    expect(sectionBody(sectionPrompt({ ...parts, ending: '' }), parts.hook, null)).toBe(parts.body);
    expect(sectionBody(sectionPrompt({ ...parts, hook: '' }), undefined, parts.ending)).toBe(parts.body);
    expect(sectionBody('  as typed ', null, '')).toBe('  as typed ');
    expect(sectionBody('Another prompt altogether.', parts.hook, parts.ending)).toBeNull();
  });

  it("uses the member's own hook on Marketing Studio only when no library hook is chosen, where the library one goes, and adds nothing when blank", () => {
    const base = { location: 'kitchen', prompt: 'notes', audio: true, ratio: '9:16' };
    expect(marketingPrompt({ ...base, hookText: '  ' })).toBe(marketingPrompt(base));
    expect(marketingPrompt({ ...base, hookText: 'The clip opens with a jump' })).toBe(marketingPrompt(base).replace('Set in', 'The clip opens with a jump. Set in'));
    expect(marketingPrompt({ ...base, hook: HOOKS[0]!.id, hookText: 'ignored' })).toBe(marketingPrompt({ ...base, hook: HOOKS[0]!.id }));
    const adv = { brief: 'b', images: 1, audio: false };
    expect(advancedPrompt({ ...adv, hookText: 'A jump.' })).toContain('Brief: b A jump. The video is completely silent');
    expect(advancedPrompt({ ...adv, hook: HOOKS[1]!.id, hookText: 'A jump.' })).toBe(advancedPrompt({ ...adv, hook: HOOKS[1]!.id }));
    expect(advancedPrompt({ ...adv, hookText: '' })).toBe(advancedPrompt(adv));
  });
});

describe('custom hooks and locations', () => {
  const custom = { hooks: [{ id: 'c-hook', name: 'Của tôi', desc: '', phrase: 'The creator waves at the camera.' }], locations: [{ id: 'c-spot', name: 'Quán', desc: '', phrase: 'a small corner cafe' }] };
  const builtIn = { hooks: [{ ...HOOKS[0]!, id: 'c-hook' }], locations: [{ ...LOCATIONS[0]!, id: 'c-spot' }] };

  it('puts a custom phrase exactly where a built-in one goes, in both formats', () => {
    // The same phrase under a custom id gives the same prompt as the built-in id.
    expect(marketingPrompt({ hook: 'c-hook', location: 'c-spot', prompt: 'notes' }, builtIn)).toBe(marketingPrompt({ hook: HOOKS[0]!.id, location: LOCATIONS[0]!.id, prompt: 'notes' }));
    const brief = { brief: 'b', images: 2, audio: true };
    expect(advancedPrompt({ ...brief, hook: 'c-hook', location: 'c-spot' }, builtIn)).toBe(advancedPrompt({ ...brief, hook: HOOKS[0]!.id, location: LOCATIONS[0]!.id }));
    const p = marketingPrompt({ hook: 'c-hook', location: 'c-spot' }, custom);
    expect(p).toContain('The creator waves at the camera. Set in a small corner cafe.');
  });

  it('changes nothing without custom choices, and a custom id unknown to the lists adds nothing', () => {
    const args = { hook: HOOKS[1]!.id, location: LOCATIONS[1]!.id, prompt: 'x' };
    expect(marketingPrompt(args, {})).toBe(marketingPrompt(args));
    expect(marketingPrompt({ hook: 'c-hook', location: 'c-spot' })).toBe(marketingPrompt({}));
    expect(advancedPrompt({ brief: 'b', images: 1, audio: false, hook: 'c-hook' })).toBe(advancedPrompt({ brief: 'b', images: 1, audio: false }));
  });
});

describe('unboxingPrompt', () => {
  const beats = 'Show the closed package, the opening, the product lifted out and turned toward the camera, then a close look at the details. Soft natural light, authentic energy. No on-screen text, logos or watermarks.';
  const withModel = "UGC unboxing video, vertical 9:16 frame, filmed handheld on a phone by a real creator. The creator in [Image1] opens a package and reveals the product in [Image2]; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos.";
  const hands = "Throughout, only the creator's hands are seen, whatever the opening or the last shot describes.";
  const pov = "POV unboxing video, horizontal 16:9 frame, filmed handheld on a phone from the creator's point of view: only their hands are seen. The hands open a package and reveal the product in [Image1]; keep the product's shape, colours, print and details exactly as in the photo.";

  it('pins the instruction with a model photo', () => {
    expect(unboxingPrompt({ model: true, packaging: false, ratio: '9:16' })).toBe(`${withModel} ${beats}`);
  });

  it('is a point-of-view clip with only hands when there is no model photo', () => {
    expect(unboxingPrompt({ model: false, packaging: false, ratio: '16:9' })).toBe(`${pov} ${beats} ${hands}`);
  });

  it('names the packaging photo as the last image, after the model and product, or right after the product with no model', () => {
    expect(unboxingPrompt({ model: true, packaging: true, ratio: '9:16' })).toBe(`${withModel} The box or packaging looks like [Image3]. ${beats}`);
    expect(unboxingPrompt({ model: false, packaging: true, ratio: '16:9' })).toBe(`${pov} The box or packaging looks like [Image2]. ${beats} ${hands}`);
  });

  it('says only the hands are seen after a hook and ending that show a person, but not when there is a model photo', () => {
    expect(unboxingPrompt({ model: false, packaging: false, ratio: '9:16', hook: 'blizzard', ending: 'wave-goodbye' })).toMatch(/It ends with: wave-goodbye\. Throughout, only the creator's hands are seen, whatever the opening or the last shot describes\.$/);
    expect(unboxingPrompt({ model: true, packaging: false, ratio: '9:16', hook: 'blizzard' })).not.toContain('only the creator');
  });

  it('adds the hook, location, notes, last shot and the unboxing sound in the UGC order', () => {
    const p = unboxingPrompt({ model: false, packaging: false, ratio: '1:1', hook: 'product-drop', location: 'kitchen', prompt: 'Calm.', ending: 'the product on its box', audio: true });
    expect(p).toBe(
      `${pov.replace('horizontal 16:9', 'square 1:1')} ${beats} ${HOOKS.find((c) => c.id === 'product-drop')!.phrase} Set in ${LOCATIONS.find((c) => c.id === 'kitchen')!.phrase}. Creator notes: Calm. It ends with: the product on its box. ${hands} ` +
        "Natural sound recorded on the phone: the rustle of paper, the tape and the box opening, and the creator's short, casual spoken reaction to the product, with no background music.",
    );
    expect(unboxingPrompt({ model: true, packaging: false, ratio: '9:16', audio: false })).toBe(`${withModel} ${beats} The video is completely silent: no speech, no music and no sound.`);
  });
});

describe('reviewPrompt', () => {
  const head = "UGC product review video, vertical 9:16 frame, filmed handheld on a phone by a real creator. The creator in [Image1] reviews the product in [Image2], wearing or holding it; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos. ";
  const tail = 'Show the product up close and a natural move that shows how it fits or works. Soft natural light, honest energy. No on-screen text, logos or watermarks.';

  it('pins the instruction with the highlights joined by semicolons, as written', () => {
    expect(reviewPrompt({ highlights: ['Vải mềm, không nhăn.', '  Giá  hợp lý ', ''], ratio: '9:16' })).toBe(`${head}The creator talks to the camera about: Vải mềm, không nhăn; Giá hợp lý. ${tail}`);
    expect(reviewPrompt({ highlights: ['Soft fabric', 'Fits well', 'Good price'], ratio: '9:16' })).toBe(`${head}The creator talks to the camera about: Soft fabric; Fits well; Good price. ${tail}`);
  });

  it('leaves the talking-points sentence out until a highlight is written, so the preview never reads "about: ."', () => {
    expect(reviewPrompt({ highlights: ['', '  '], ratio: '9:16' })).toBe(`${head}${tail}`);
    expect(reviewPrompt({ highlights: [''], ratio: '9:16', audio: false })).toBe(`${head}${tail} The video is completely silent: no speech, no music and no sound.`);
    expect(reviewPrompt({ highlights: [''], ratio: '9:16', audio: true })).toBe(`${head}${tail} The creator speaks to the camera in a casual, honest tone, recorded on the phone, with no background music.`);
  });

  it('speaks about the points when sound is on, says the script exactly when there is one, and is silent when off', () => {
    const base = reviewPrompt({ highlights: ['Soft fabric'], ratio: '9:16' });
    expect(reviewPrompt({ highlights: ['Soft fabric'], ratio: '9:16', audio: true })).toBe(`${base} The creator speaks to the camera in a casual, honest tone about these points, recorded on the phone, with no background music.`);
    expect(reviewPrompt({ highlights: ['Soft fabric'], ratio: '9:16', audio: true, script: '  Mình   rất thích.  ' })).toBe(`${base} The creator says exactly: "Mình rất thích.", lip-synced, and no other spoken words.`);
    // With sound off nobody speaks, so the points are shown instead of talked about.
    expect(reviewPrompt({ highlights: ['Soft fabric'], ratio: '9:16', audio: false, script: 'ignored' })).toBe(`${base.replace('talks to the camera about', 'shows each of these points')} The video is completely silent: no speech, no music and no sound.`);
  });

  it('puts the hook, location, notes and last shot between the instruction and the sound', () => {
    const p = reviewPrompt({ highlights: ['Soft fabric'], ratio: '9:16', hookText: 'The clip opens on the box', location: 'bedroom', prompt: 'Warm.', ending: 'The clip ends on a nod.', audio: false });
    expect(p).toBe(`${head}The creator shows each of these points: Soft fabric. ${tail} The clip opens on the box. Set in ${LOCATIONS.find((c) => c.id === 'bedroom')!.phrase}. Creator notes: Warm. The clip ends on a nod. The video is completely silent: no speech, no music and no sound.`);
  });
});

describe('format helpers', () => {
  it('lists the photo roles of each unboxing layout and keeps them in step with the sent order', () => {
    expect(unboxingRoles({ model: false, packaging: false })).toBe('product');
    expect(unboxingRoles({ model: true, packaging: true })).toBe('model,product,packaging');
    for (const o of [{ model: false, packaging: false }, { model: true, packaging: false }, { model: false, packaging: true }, { model: true, packaging: true }]) expect(UNBOXING_ROLES).toContain(unboxingRoles(o));
  });

  it('drops empty highlight lines and collapses spaces', () => {
    expect(highlightLines([' a   b ', '', '  '])).toEqual(['a b']);
  });

  it('maps a job format to its page, UGC for none', () => {
    expect([null, 'advanced', 'unboxing', 'review', 'other'].map(hrefOfFormat)).toEqual(['/marketing-studio', '/marketing-studio/advanced', '/marketing-studio/unboxing', '/marketing-studio/review', '/marketing-studio']);
  });
});
