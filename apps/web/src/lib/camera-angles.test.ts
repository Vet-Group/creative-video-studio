import { describe, expect, it } from 'vitest';
import { anglePrompt, CAMERA_ANGLES, MAX_ANGLES } from './camera-angles';
import { promptTooLong } from './prompt-limit';

describe('camera angles', () => {
  it('has unique ids, a Vietnamese label and a camera sentence that leaves the product and the text alone', () => {
    expect(new Set(CAMERA_ANGLES.map((a) => a.id)).size).toBe(CAMERA_ANGLES.length);
    expect(CAMERA_ANGLES.length).toBeGreaterThanOrEqual(MAX_ANGLES);
    for (const a of CAMERA_ANGLES) {
      expect(a.label).not.toBe('');
      expect(a.sentence).toMatch(/product unchanged/);
      expect(a.sentence).toMatch(/no on-screen text/);
      expect(a.sentence).toMatch(/\.$/);
    }
  });

  it('appends the sentence after a closed sentence and closes an open one first', () => {
    const [angle] = CAMERA_ANGLES;
    expect(anglePrompt('The model turns slowly.', angle!)).toBe(`The model turns slowly. ${angle!.sentence}`);
    expect(anglePrompt('  The model turns slowly  ', angle!)).toBe(`The model turns slowly. ${angle!.sentence}`);
    expect(anglePrompt('Is it soft?', angle!)).toBe(`Is it soft? ${angle!.sentence}`);
  });

  it('is the sentence alone when there is no prompt yet', () => {
    expect(anglePrompt('  ', CAMERA_ANGLES[1]!)).toBe(CAMERA_ANGLES[1]!.sentence);
  });

  it('gives each angle a different prompt from the same text', () => {
    const prompts = CAMERA_ANGLES.map((a) => anglePrompt('A shirt on a hanger.', a));
    expect(new Set(prompts).size).toBe(CAMERA_ANGLES.length);
  });

  it('respects the model limit: the longest angle prompt is what the page checks, at the limit and one over', () => {
    const angle = CAMERA_ANGLES[0]!;
    const base = 'A shirt on a hanger.';
    const exact = anglePrompt(base, angle).length;
    const model = (maxPromptChars: number) => ({ label: 'Kling 2.6 Pro', maxPromptChars });
    const check = (max: number) => promptTooLong(model(max), Math.max(...CAMERA_ANGLES.map((a) => anglePrompt(base, a).length)));
    expect(promptTooLong(model(exact), exact)).toBeNull();
    expect(promptTooLong(model(exact - 1), exact)).toMatch(/nhận tối đa/);
    // The page checks every picked angle, so the longest one decides.
    const longest = Math.max(...CAMERA_ANGLES.map((a) => anglePrompt(base, a).length));
    expect(check(longest)).toBeNull();
    expect(check(longest - 1)).toMatch(/nhận tối đa/);
  });
});
