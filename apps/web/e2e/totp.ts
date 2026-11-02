// The current code of a TOTP secret as an authenticator app shows it, made with the otp helper better-auth itself uses
// (a dependency of better-auth, not of this app, so it is loaded from there). `secret` is the base32 text of the otpauth:// link.
import { createRequire } from 'node:module';

const fromBetterAuth = createRequire(import.meta.resolve('better-auth'));
const { createOTP } = fromBetterAuth('@better-auth/utils/otp') as { createOTP: (secret: string) => { totp: () => Promise<string> } };
const { base32 } = fromBetterAuth('@better-auth/utils/base32') as { base32: { decode: (s: string) => Uint8Array } };

export const totpCode = (secret: string) => createOTP(new TextDecoder().decode(base32.decode(secret.replace(/\s/g, '')))).totp();

/** A six-digit code other than the right one. */
export const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
