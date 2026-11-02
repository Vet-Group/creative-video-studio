// Browser side of the passkey plugin: each ceremony is its options request, the browser's WebAuthn call, then the verify request.
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { api, sendJson } from './api';

/** Signs in with a passkey. `autoFill` waits for the user to pick one in the Email field's suggestions instead of opening a dialog. */
export async function signInWithPasskey(autoFill = false): Promise<void> {
  const options = await api<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkey/generate-authenticate-options');
  // The plugin asks for "preferred", which lets Google Password Manager sign without a PIN or fingerprint, and the server (lib/auth.ts)
  // refuses an unverified sign-in. Asking for "required" makes the authenticator verify the user.
  const optionsJSON = { ...options, userVerification: 'required' as const };
  const response = await startAuthentication({ optionsJSON, useBrowserAutofill: autoFill });
  await api('/api/auth/passkey/verify-authentication', sendJson('POST', { response }));
}

/** Adds a passkey to the signed-in user. */
export async function addPasskey(): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>('/api/auth/passkey/generate-register-options');
  const response = await startRegistration({ optionsJSON });
  await api('/api/auth/passkey/verify-registration', sendJson('POST', { response }));
}

/** The user closed the browser's dialog, or a newer ceremony replaced this one: nothing to report. */
export const cancelled = (e: unknown) => e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');
