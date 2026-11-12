// Google's refusal of every Vertex call once the billing account of the project is closed or disabled (the 403 of 2026-11-11, project cvs-vertex:
// "This API method requires billing to be enabled. Please enable billing on project ..."). Pure, so the web app can read a stored job error with it too.
const BILLING_DISABLED = /requires billing to be enabled|BILLING_DISABLED|billing account\b.{0,80}?\b(?:closed|disabled)\b/i;

/** True for that refusal; false for any other 403 (permission, quota, safety), a 429 or no message. */
export const isBillingDisabled = (message: string | null | undefined): boolean => !!message && BILLING_DISABLED.test(message);
