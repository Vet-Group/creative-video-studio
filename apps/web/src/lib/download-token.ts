import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;

function mac(assetId: string, userId: string, expiresAt: number): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
  // The label keeps these MACs apart from anything else keyed with the same secret.
  return createHmac('sha256', secret).update(['asset-download', assetId, userId, expiresAt].join('\n')).digest();
}

/** `<expiry ms>.<HMAC>` over the asset id, the user id and the expiry; valid for 5 minutes. */
export function signDownloadToken(assetId: string, userId: string, now = Date.now()): string {
  const expiresAt = now + TTL_MS;
  return `${expiresAt}.${mac(assetId, userId, expiresAt).toString('base64url')}`;
}

export function verifyDownloadToken(token: string, assetId: string, userId: string, now = Date.now()): boolean {
  const [expiry, signature, ...extra] = token.split('.');
  const expiresAt = Number(expiry);
  if (!signature || extra.length > 0 || !Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const given = Buffer.from(signature, 'base64url');
  const expected = mac(assetId, userId, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
