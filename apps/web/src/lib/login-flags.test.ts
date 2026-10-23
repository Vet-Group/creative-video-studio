// The login flags are read when lib/auth loads, so each case loads it afresh. Nothing here connects to the database.
import { randomBytes } from 'node:crypto';
import { afterAll, expect, test, vi } from 'vitest';

const NAMES = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_TENANT_KEY'];
const saved = Object.fromEntries(Object.entries(process.env).filter(([k]) => [...NAMES, 'BETTER_AUTH_SECRET', 'APP_URL'].includes(k)));
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost';

afterAll(() => {
  for (const k of [...NAMES, 'BETTER_AUTH_SECRET', 'APP_URL']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function flags(env: Record<string, string>) {
  vi.resetModules();
  for (const k of NAMES) delete process.env[k];
  Object.assign(process.env, env);
  const { googleLoginEnabled, larkLoginEnabled } = await import('@/lib/auth');
  return [googleLoginEnabled, larkLoginEnabled];
}

test.each([
  ['no values', {}, [false, false]],
  ['the Google client id and secret', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }, [true, false]],
  ['the Google client id only', { GOOGLE_CLIENT_ID: 'id' }, [false, false]],
  ['the Lark app id, secret and tenant key', { LARK_APP_ID: 'app', LARK_APP_SECRET: 'secret', LARK_TENANT_KEY: 'tenant' }, [false, true]],
  ['the Lark app id and secret without the tenant key (the notification values)', { LARK_APP_ID: 'app', LARK_APP_SECRET: 'secret' }, [false, false]],
  ['all of them', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', LARK_APP_ID: 'app', LARK_APP_SECRET: 's', LARK_TENANT_KEY: 'tenant' }, [true, true]],
])(
  'with %s, googleLoginEnabled and larkLoginEnabled are %j',
  async (_name, env, expected) => {
    expect(await flags(env)).toEqual(expected);
  },
  60_000, // each case loads better-auth afresh, slowly when the other packages' tests run beside it
);
