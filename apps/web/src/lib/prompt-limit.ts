import { FEATURE_PROMPTS } from '@cvs/core/models';

// The prompt limit on the pages is the chosen model's (`maxPromptChars` from the model lists, already under PROMPT_CEILING). Text over it is never cut:
// Run waits with this reason, so switching to a model with a smaller limit keeps what the member wrote.

/** Why Run waits when the prompt Run would send is longer than the chosen model takes; null when it fits or no model is chosen yet. */
export const promptTooLong = (model: { label: string; maxPromptChars: number } | null | undefined, length: number): string | null =>
  model && length > model.maxPromptChars ? `Mô hình ${model.label} nhận tối đa ${model.maxPromptChars} ký tự, hãy rút gọn hoặc chọn mô hình khác.` : null;

/** The swaps, whose fixed instruction keeps its place and takes the member's words after it; on the other tools the member's words replace it. */
export const APPEND_TO_INSTRUCTION = ['character_swap', 'model_swap', 'lingerie_try_on'];

/** The prompt POST /api/jobs starts from (before a preset, a style or the brand kit): shared with the pages' prompt preview (PromptPreview) so the two cannot drift. */
export const basePrompt = (feature: string, written: string | undefined): string | undefined =>
  written && APPEND_TO_INSTRUCTION.includes(feature) ? `${FEATURE_PROMPTS[feature]}. ${written}` : (written ?? FEATURE_PROMPTS[feature]);
