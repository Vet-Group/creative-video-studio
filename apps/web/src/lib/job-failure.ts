/** Why a provider refused a job: a real person or other sensitive content in its input image, or sound it made that may break copyright. */
export type FailureReason = 'real_person' | 'sensitive_input' | 'output_audio';

// BytePlus answers a refused input photo with `InputImageSensitiveContentDetected.<Kind>`, either as a create 400 or as a failed task.
const BYTEPLUS_INPUT_REFUSAL = /\bInputImageSensitiveContentDetected(?:\.(\w+))?/;
// A clip with sound fails with `OutputAudioSensitiveContentDetected.<Kind>` when the sound it made may break copyright (the canary of 2026-11-08); nothing is billed.
const BYTEPLUS_AUDIO_REFUSAL = /\bOutputAudioSensitiveContentDetected(?:\.\w+)?/;

// fal answers a refused input photo with an HTTP 422 whose detail has `"type":"content_policy_violation"`; its message names real people's likenesses when that is why (the Seedance 2.5 job of 2026-11-14).
const FAL_POLICY_REFUSAL = /"type":\s*"content_policy_violation"/;
const FAL_REAL_PERSON = /likenesses? of real people/i;

/** The refusals a fal twin may get past: it takes a real person's photo, and makes its own sound. */
export const TWIN_REASONS: readonly string[] = ['real_person', 'output_audio'];

/** Reads a stored `jobs.error` for a provider refusal: the reason code and a short provider line for Admins, else null. */
export function providerRefusal(error: string | null): { reason: FailureReason; detail: string } | null {
  const audio = error?.match(BYTEPLUS_AUDIO_REFUSAL);
  if (audio) return { reason: 'output_audio', detail: `byteplus · ${audio[0]}` };
  const m = error?.match(BYTEPLUS_INPUT_REFUSAL);
  if (m) return { reason: m[1] === 'PrivacyInformation' ? 'real_person' : 'sensitive_input', detail: `byteplus · ${m[0]}` };
  return error && FAL_POLICY_REFUSAL.test(error) ? { reason: FAL_REAL_PERSON.test(error) ? 'real_person' : 'sensitive_input', detail: 'fal · content_policy_violation' } : null;
}
