// The prompt limit on the pages is the chosen model's (`maxPromptChars` from the model lists, already under PROMPT_CEILING). Text over it is never cut:
// Run waits with this reason, so switching to a model with a smaller limit keeps what the member wrote.

/** Why Run waits when the prompt Run would send is longer than the chosen model takes; null when it fits or no model is chosen yet. */
export const promptTooLong = (model: { label: string; maxPromptChars: number } | null | undefined, length: number): string | null =>
  model && length > model.maxPromptChars ? `Mô hình ${model.label} nhận tối đa ${model.maxPromptChars} ký tự, hãy rút gọn hoặc chọn mô hình khác.` : null;
