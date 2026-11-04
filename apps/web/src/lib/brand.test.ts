import { expect, test } from 'vitest';
import { brandBlock, parseBrand, withBrand } from './brand';

const kit = { brandVoice: 'Tối giản, sang trọng, tông ấm.', brandColors: ['#C8102E', '#FFFFFF'], brandTagline: 'Mặc là đẹp' };
const empty = { brandVoice: null, brandColors: [], brandTagline: null };

test('parseBrand trims the texts, clears an empty one, upper-cases and dedupes the colours, and keeps only the named fields', () => {
  expect(parseBrand({ brandVoice: '  Warm and calm ', brandColors: ['#c8102e', ' #C8102E', '#00ff00'] })).toEqual({ kit: { brandVoice: 'Warm and calm', brandColors: ['#C8102E', '#00FF00'] } });
  expect(parseBrand({ brandTagline: '   ', brandVoice: null })).toEqual({ kit: { brandTagline: null, brandVoice: null } });
});

test('parseBrand refuses an empty body, a non-text field, a text over its limit and a colour that is not #RRGGBB or one too many', () => {
  expect(parseBrand({}).error).toBe('give at least one of brandVoice, brandColors, brandTagline');
  expect(parseBrand({ brandVoice: 3 }).error).toBe('brandVoice must be text or null');
  expect(parseBrand({ brandVoice: 'x'.repeat(501) }).error).toBe('brandVoice may be at most 500 characters');
  expect(parseBrand({ brandTagline: 'x'.repeat(121) }).error).toBe('brandTagline may be at most 120 characters');
  expect(parseBrand({ brandVoice: 'x'.repeat(500), brandTagline: 'x'.repeat(120) }).kit).toBeDefined();
  for (const brandColors of [['red'], ['#FFF'], ['#GGGGGG'], '#FFFFFF', [1], Array(7).fill('#FFFFFF')]) {
    expect(parseBrand({ brandColors }).error).toBe('brandColors must list at most 6 colours written as #RRGGBB');
  }
});

test('brandBlock adds the style and colours on Marketing Studio, with no tagline: its instruction forbids on-screen text', () => {
  expect(brandBlock(kit, 'marketing')).toBe(
    "Brand style: Tối giản, sang trọng, tông ấm. Brand colours: #C8102E, #FFFFFF, as accents in the setting and styling only; keep the product's own colours exactly as in the photos.",
  );
});

test('brandBlock on Image Generation offers the tagline only where the prompt asks for text', () => {
  expect(brandBlock(kit, 'image')).toContain('If the prompt asks for on-screen text, use the brand tagline "Mặc là đẹp"; otherwise add no text.');
  expect(brandBlock({ ...empty, brandTagline: 'Only a tagline' }, 'marketing')).toBeNull();
});

test('withBrand appends the block for the brand pages with a kit, and leaves the prompt alone for another feature or an empty kit', () => {
  expect(withBrand('A red dress on a hanger.', kit, 'image')).toBe(`A red dress on a hanger. ${brandBlock(kit, 'image')}`);
  for (const feature of ['video', 'try_on', 'motion_control', 'background_changer']) expect(withBrand('p', kit, feature)).toBe('p');
  expect(withBrand('p', empty, 'image')).toBe('p');
  expect(withBrand('p', empty, 'marketing')).toBe('p');
});
