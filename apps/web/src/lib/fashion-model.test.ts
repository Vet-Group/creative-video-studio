import { describe, expect, it } from 'vitest';
import { DEFAULT_FASHION_TRAITS, FASHION_AVOID, FASHION_OPTIONS, fashionModelName, fashionModelPrompt, MAX_EXTRA, mentionsMinor, parseFashionTraits, traitsForImage, VARIED_ETHNICITY, VARIED_POOL, withNiche } from './fashion-model';

describe('fashionModelPrompt', () => {
  it('puts the fragment of every option into the prompt', () => {
    for (const key of Object.keys(FASHION_OPTIONS) as (keyof typeof FASHION_OPTIONS)[]) {
      for (const option of FASHION_OPTIONS[key]) {
        const prompt = fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, [key]: option.id });
        expect(prompt.toLowerCase(), `${key}.${option.id}`).toContain(option.prompt.toLowerCase());
      }
    }
  });

  it('keeps the plus-size body true, the avoid list and the base look in every prompt', () => {
    expect(fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, body: 'plus' })).toContain('keep true plus-size proportions, do not slim or reshape the body');
    for (const niche of FASHION_OPTIONS.niche) {
      const prompt = fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, niche: niche.id });
      expect(prompt.endsWith(FASHION_AVOID)).toBe(true);
      expect(prompt).toContain('fictional adult (clearly 18+) fashion model');
      expect(prompt).toContain('plain white crew-neck t-shirt with no print');
      expect(prompt).toContain('3:4 portrait');
    }
    expect(fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, framing: 'full' })).toContain('plain light-blue jeans and plain white sneakers');
  });

  it('adds extra details as one trimmed line before the avoid list, and nothing for a blank one', () => {
    expect(fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, extra: '  freckles\n and a mole ' })).toContain(`Additional details: freckles and a mole ${FASHION_AVOID}`);
    expect(fashionModelPrompt({ ...DEFAULT_FASHION_TRAITS, extra: '   ' })).not.toContain('Additional details');
  });

  it('is the same prompt for the traits the server parses back', () => {
    const traits = { ...DEFAULT_FASHION_TRAITS, niche: 'melanin', extra: ' a  b ' };
    expect(fashionModelPrompt(parseFashionTraits(JSON.parse(JSON.stringify(traits)))!)).toBe(fashionModelPrompt(traits));
  });
});

describe('defaults and niches', () => {
  it('defaults to a Vietnamese or Southeast Asian woman of 26 to 40, half body on white, with no niche', () => {
    expect(DEFAULT_FASHION_TRAITS).toMatchObject({ gender: 'female', age: 'adult', ethnicity: 'vietnamese_sea', skinTone: 'auto', framing: 'half', background: 'white', niche: 'none' });
    for (const [key, id] of Object.entries(DEFAULT_FASHION_TRAITS)) if (key !== 'extra') expect(FASHION_OPTIONS[key as keyof typeof FASHION_OPTIONS].some((o) => o.id === id)).toBe(true);
  });

  it('pre-selects the traits a niche names and leaves the rest', () => {
    expect(withNiche(DEFAULT_FASHION_TRAITS, 'melanin')).toMatchObject({ niche: 'melanin', ethnicity: 'black', skinTone: 'deep', age: 'adult' });
    expect(withNiche(DEFAULT_FASHION_TRAITS, 'heritage')).toMatchObject({ ethnicity: 'black', age: 'mature' });
    expect(withNiche({ ...DEFAULT_FASHION_TRAITS, ethnicity: 'white' }, 'faith')).toMatchObject({ niche: 'faith', ethnicity: VARIED_ETHNICITY, gender: 'female' });
  });

  it('defaults the US-market niches to a varied ethnicity, with the veteran a mature man and the family niche a woman', () => {
    for (const id of ['faith', 'americana', 'veteran', 'game_day', 'southern', 'family_milestone']) expect(withNiche(DEFAULT_FASHION_TRAITS, id).ethnicity, id).toBe(VARIED_ETHNICITY);
    expect(withNiche(DEFAULT_FASHION_TRAITS, 'veteran')).toMatchObject({ gender: 'male', age: 'mature' });
    expect(withNiche({ ...DEFAULT_FASHION_TRAITS, gender: 'male' }, 'family_milestone')).toMatchObject({ gender: 'female', age: 'adult' });
  });

  it('only names valid option ids as niche defaults, apart from the varied ethnicity', () => {
    for (const niche of FASHION_OPTIONS.niche) {
      for (const [key, id] of Object.entries(niche.defaults ?? {})) {
        if (id !== VARIED_ETHNICITY) expect(FASHION_OPTIONS[key as keyof typeof FASHION_OPTIONS].some((o) => o.id === id), `${niche.id}.${key}`).toBe(true);
      }
    }
  });
});

describe('traitsForImage', () => {
  const varied = { ...DEFAULT_FASHION_TRAITS, ethnicity: VARIED_ETHNICITY };

  it('gives image i the pool entry i, wrapping around, as a trait the server parses', () => {
    expect([0, 1, 2, 3].map((i) => traitsForImage(varied, i).ethnicity)).toEqual(['white', 'mixed', 'vietnamese_sea', 'white']);
    for (let i = 0; i < 4; i++) expect(parseFashionTraits(JSON.parse(JSON.stringify(traitsForImage(varied, i))))).toEqual(traitsForImage(varied, i));
    expect(VARIED_POOL.every((id) => FASHION_OPTIONS.ethnicity.some((o) => o.id === id))).toBe(true);
  });

  it('leaves a concrete ethnicity alone, and the server refuses the varied one', () => {
    expect(traitsForImage({ ...DEFAULT_FASHION_TRAITS, ethnicity: 'black' }, 2).ethnicity).toBe('black');
    expect(parseFashionTraits({ ethnicity: VARIED_ETHNICITY })).toBeNull();
  });
});

describe('parseFashionTraits', () => {
  it('fills the defaults for what is missing', () => {
    expect(parseFashionTraits({})).toEqual(DEFAULT_FASHION_TRAITS);
    expect(parseFashionTraits({ gender: 'male' })).toEqual({ ...DEFAULT_FASHION_TRAITS, gender: 'male' });
  });

  it('refuses an unknown id, a wrong type, and extra text that is too long or has control characters', () => {
    expect(parseFashionTraits({ gender: 'robot' })).toBeNull();
    expect(parseFashionTraits({ niche: 'constructor' })).toBeNull();
    expect(parseFashionTraits({ age: 3 })).toBeNull();
    expect(parseFashionTraits(null)).toBeNull();
    expect(parseFashionTraits([])).toBeNull();
    expect(parseFashionTraits({ extra: 'a'.repeat(MAX_EXTRA) })).not.toBeNull();
    expect(parseFashionTraits({ extra: 'a'.repeat(MAX_EXTRA + 1) })).toBeNull();
    expect(parseFashionTraits({ extra: 'a\u0000b' })).toBeNull();
    expect(parseFashionTraits({ extra: 5 })).toBeNull();
  });
});

describe('fashionModelName', () => {
  it('names a model from its gender, age and heritage', () => {
    expect(fashionModelName(DEFAULT_FASHION_TRAITS)).toBe('Nữ · 26-40 tuổi · Việt Nam / Đông Nam Á');
  });
});

describe('mentionsMinor', () => {
  it.each(['a child', 'Kids style', 'teenager look', 'a TEEN', 'minor', 'underage', 'under 18', 'under-age', 'below 18', 'younger than 18', 'schoolgirl', 'school boy', 'student uniform', 'loli', 'a toddler', 'trẻ em', 'TRE CON', 'thiếu niên', 'học sinh', 'bé gái', 'be trai', 'dưới 18 tuổi', '15 years', '15 years old', '15-year-old', '17 yo', '15 tuổi', 'age 12', 'aged 9', 'tuổi 16'])('refuses %s', (text) => {
    expect(mentionsMinor(text)).toBe(true);
  });

  it.each(['', 'freckles and a small mole', 'silver studs', '18 years old', '25 years', '35 tuổi', 'age 30', 'under 40', 'dưới 40 tuổi', 'warm light, college style', 'a kind smile', 'student', 'baby hair edges'])('allows %s', (text) => {
    expect(mentionsMinor(text)).toBe(false);
  });

  it('is a keyword match, so a surname or a font that contains a word is refused too', () => {
    expect(mentionsMinor('Kidd')).toBe(false); // not the word kid
    expect(mentionsMinor('teenage-style font')).toBe(true);
  });
});
