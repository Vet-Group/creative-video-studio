// Which client address the sign-in limiter counts, with the options lib/auth really passes. Nothing here connects to the database.
import { randomBytes } from 'node:crypto';
import { getIP } from 'better-auth/api';
import { expect, test } from 'vitest';

process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';
const { auth } = await import('@/lib/auth');

const ip = (headers: Record<string, string>) => getIP(new Headers(headers), auth.options);

test('counts the address Cloudflare sets, whatever X-Forwarded-For a client sends', () => {
  expect(ip({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9, 198.51.100.7' })).toBe('198.51.100.7');
  expect(ip({ 'cf-connecting-ip': '198.51.100.7' })).toBe('198.51.100.7');
});

test('never counts an X-Forwarded-For address, which a client can make up', () => {
  // Outside production getIP falls back to 127.0.0.1 when no configured header gives an address.
  expect(ip({ 'x-forwarded-for': '203.0.113.9' })).not.toBe('203.0.113.9');
});

test('gives the passkey options request its own limit', () => {
  expect(auth.options.rateLimit?.customRules?.['/passkey/generate-authenticate-options']).toEqual({ window: 60, max: 30 });
});
