import { FEATURE_PROMPTS } from '@cvs/core/models';
import { describe, expect, it } from 'vitest';
import { basePrompt, promptTooLong } from './prompt-limit';

describe('promptTooLong', () => {
  const kling = { label: 'Kling 2.6 Pro', maxPromptChars: 2500 };
  it('names the model and its limit only when the prompt is over it', () => {
    expect(promptTooLong(kling, 2500)).toBeNull();
    expect(promptTooLong(kling, 2501)).toBe('Mô hình Kling 2.6 Pro nhận tối đa 2500 ký tự, hãy rút gọn hoặc chọn mô hình khác.');
    expect(promptTooLong(undefined, 9999)).toBeNull();
  });
});

describe('basePrompt', () => {
  it('adds the words after a swap instruction, replaces the instruction elsewhere, and falls back to it with no words', () => {
    expect(basePrompt('model_swap', 'red dress')).toBe(`${FEATURE_PROMPTS.model_swap}. red dress`);
    expect(basePrompt('background_changer', 'a sunny cafe')).toBe('a sunny cafe');
    expect(basePrompt('try_on', undefined)).toBe(FEATURE_PROMPTS.try_on);
    expect(basePrompt('model_swap', '')).toBe('');
    expect(basePrompt('image', undefined)).toBeUndefined();
  });
});
