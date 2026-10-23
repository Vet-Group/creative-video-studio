import { describe, expect, it } from 'vitest';
import { tryOnPrompt } from './try-on-prompt';

describe('tryOnPrompt', () => {
  it('sends nothing for one garment, no background and no text', () => {
    expect(tryOnPrompt(1, false, '')).toBeUndefined();
    expect(tryOnPrompt(1, false, '   ')).toBeUndefined();
  });

  it('names the single garment and keeps the user text last', () => {
    const p = tryOnPrompt(1, false, ' make it red ')!;
    expect(p).toContain('Image 1 is the person. Image 2 is the garment. ');
    expect(p).toContain('Dress the person in the garment.');
    expect(p).not.toContain('background');
    expect(p.endsWith(' make it red')).toBe(true);
  });

  it('names a range for several garments', () => {
    const p = tryOnPrompt(3, false, '')!;
    expect(p).toContain('Images 2 to 4 are the garments.');
    expect(p).toContain('Dress the person in the garments.');
    expect(p).not.toContain('background');
  });

  it('puts the background after the last garment', () => {
    expect(tryOnPrompt(1, true, '')).toContain('Image 2 is the garment. Image 3 is the background scene.');
    const p = tryOnPrompt(2, true, 'sunset')!;
    expect(p).toContain('Images 2 to 3 are the garments. Image 4 is the background scene.');
    expect(p).toContain('and place them in the background scene.');
    expect(p.endsWith(' sunset')).toBe(true);
  });
});
