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

  it("numbers Nano Banana 2.1's 13 garments past nine, and the background after them", () => {
    expect(tryOnPrompt(13, false, '')).toContain('Image 1 is the person. Images 2 to 14 are the garments. Dress the person in the garments.');
    expect(tryOnPrompt(13, true, '')).toContain('Images 2 to 14 are the garments. Image 15 is the background scene.');
  });

  it('gives a chosen pose its words in place of keeping the pose, even with one garment and no text, and ignores an unknown one', () => {
    const p = tryOnPrompt(1, false, '', 'hand-on-hip')!;
    expect(p).toContain("Keep the person's face and identity exactly unchanged, and show them in this pose and framing: standing facing the camera with one hand on the hip");
    expect(p).not.toContain('pose and body exactly unchanged');
    expect(tryOnPrompt(1, false, '', 'cartwheel')).toBeUndefined();
    expect(tryOnPrompt(2, false, '', null)).toContain("Keep the person's face, pose and body exactly unchanged.");
  });

  it('stops keeping the pose when the member wrote text and chose none, so the text can ask for one', () => {
    const p = tryOnPrompt(1, false, 'sitting on a chair')!;
    expect(p).toContain("Keep the person's face and body exactly unchanged.");
    expect(p).not.toContain('pose');
    expect(p.endsWith(' sitting on a chair')).toBe(true);
    expect(tryOnPrompt(1, false, 'red', 'hand-on-hip')).toContain("Keep the person's face and identity exactly unchanged, and show them in this pose");
  });
});
