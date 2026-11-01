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
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkey/generate-authenticate-options');
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
