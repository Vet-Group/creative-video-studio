/** Why a provider refused a job's input image: a real person in the photo, or other sensitive content. */
export type FailureReason = 'real_person' | 'sensitive_input';

// BytePlus answers a refused input photo with `InputImageSensitiveContentDetected.<Kind>`, either as a create 400 or as a failed task.
const BYTEPLUS_INPUT_REFUSAL = /\bInputImageSensitiveContentDetected(?:\.(\w+))?/;

/** Reads a stored `jobs.error` for an input-image refusal: the reason code and a short provider line for Admins, else null. */
export function inputRefusal(error: string | null): { reason: FailureReason; detail: string } | null {
  const m = error?.match(BYTEPLUS_INPUT_REFUSAL);
  return m ? { reason: m[1] === 'PrivacyInformation' ? 'real_person' : 'sensitive_input', detail: `byteplus · ${m[0]}` } : null;
}
