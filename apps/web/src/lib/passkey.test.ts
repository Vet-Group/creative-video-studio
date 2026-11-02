// The browser side of a passkey sign-in: what it asks the authenticator for.
import { afterEach, expect, test, vi } from 'vitest';

const startAuthentication = vi.fn(async () => ({ id: 'cred' }));
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication, startRegistration: vi.fn() }));
const { signInWithPasskey } = await import('./passkey');

afterEach(() => vi.unstubAllGlobals());

test('a sign-in asks the authenticator to verify the user, which the server requires', async () => {
  // better-auth's passkey plugin sends "preferred", and Google Password Manager then signs without a PIN or fingerprint.
  vi.stubGlobal('window', { location: { pathname: '/login', assign: vi.fn() } });
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ challenge: 'c', userVerification: 'preferred' }), { status: 200 }));
  await signInWithPasskey();
  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c', userVerification: 'required' }, useBrowserAutofill: false });
});
