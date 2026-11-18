import { describe, expect, it } from 'vitest';
import { PORTRAITS, portraitGender, portraitName, portraitsIn, POSES, poseOf } from './try-on-stock';

describe('the Try On model catalog', () => {
  const have = new Set(PORTRAITS.map(portraitName));
  it('offers only the uploaded portraits, narrowed by every chosen filter, and a model with two ethnicities under either', () => {
    expect(portraitsIn(new Set(['try-on-portrait-woman-isla.jpg']), {}).map((p) => p.name)).toEqual(['isla']);
    expect(portraitsIn(have, {})).toHaveLength(PORTRAITS.length);
    const men = portraitsIn(have, { gender: 'man', body: 'plus-size' });
    expect(men.length).toBeGreaterThan(0);
    expect(men.every((p) => p.gender === 'man' && p.body === 'plus-size')).toBe(true);
    const twoWay = PORTRAITS.find((p) => p.ethnicity.includes(' '))!;
    for (const one of twoWay.ethnicity.split(' ')) expect(portraitsIn(have, { ethnicity: one })).toContain(twoWay);
  });
  it("reads a portrait's gender from its sample name, and nothing from another photo", () => {
    expect(portraitGender('try-on-portrait-man-kai.jpg')).toBe('man');
    expect(portraitGender('try-on-stock-model-10.jpg')).toBeNull();
  });
  it('knows each of Fash\'s 29 poses once, and no other', () => {
    expect(POSES).toHaveLength(29);
    expect(new Set(POSES.map((p) => p.value)).size).toBe(29);
    expect(poseOf('kneel')?.label).toBe('Quỳ một gối');
    expect(poseOf('cartwheel')).toBeUndefined();
    expect(poseOf(null)).toBeUndefined();
  });
});
