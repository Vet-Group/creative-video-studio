import { describe, expect, it } from 'vitest';
import { promptTooLong } from './prompt-limit';

describe('promptTooLong', () => {
  const kling = { label: 'Kling 2.6 Pro', maxPromptChars: 2500 };
  it('names the model and its limit only when the prompt is over it', () => {
    expect(promptTooLong(kling, 2500)).toBeNull();
    expect(promptTooLong(kling, 2501)).toBe('Mô hình Kling 2.6 Pro nhận tối đa 2500 ký tự, hãy rút gọn hoặc chọn mô hình khác.');
    expect(promptTooLong(undefined, 9999)).toBeNull();
  });
});
