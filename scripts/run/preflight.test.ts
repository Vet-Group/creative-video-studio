import { describe, expect, test } from 'vitest';
import { checkItem, runPreflight, skippedSteps, type Deps, type Env } from './preflight.ts';

const FAKE: Env = {
  FAL_KEY: 'fal-secret-1111',
  REPLICATE_API_TOKEN: 'r8_secret-2222',
  LARK_APP_ID: 'cli_app',
  LARK_APP_SECRET: 'lark-secret-3333',
  LARK_TENANT_KEY: 'tenant',
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'google-secret-9999',
  CVS_R2_REPOSITORY: 's3:https://acct.r2.cloudflarestorage.com/cvs-backup',
  CVS_R2_ACCESS_KEY_ID: 'r2-key-4444',
  CVS_R2_SECRET_ACCESS_KEY: 'r2-secret-5555',
  CVS_RESTIC_PASSWORD: 'restic-secret-6666-long',
  CLOUDFLARE_API_TOKEN: 'cf-secret-7777',
  CVS_ADMIN_EMAIL: 'owner@example.com',
  CVS_ADMIN_PASSWORD: 'admin-secret-8888',
  CVS_OWNER_LARK_OPEN_ID: 'ou_owner',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function deps(env: Env, status = 200): Deps {
  return {
    env,
    fetch: (async (url: string) => {
      // Echo the request back in the body: a leak would surface if any code printed a response.
      if (status !== 200) return json(status, { echo: url, env });
      if (url.includes('tenant_access_token')) return json(200, { code: 0, echo: env });
      if (url.includes('oauth2.googleapis.com/token')) return json(400, { error: 'invalid_grant', echo: env });
      if (url.includes('/zones?name=')) return json(200, { result: [{ id: 'z', account: { id: 'a' } }] });
      return json(200, { echo: env });
    }) as typeof fetch,
    run: async () => ({ code: status === 200 ? 0 : 1 }),
    listBucket: async () => {
      if (status !== 200) throw new Error(`denied ${env.CVS_R2_SECRET_ACCESS_KEY}`);
    },
  };
}

describe('preflight', () => {
  test('all items pass with working credentials', async () => {
    const { results, blocked } = await runPreflight(deps(FAKE));
    expect(results.every((r) => r.status === 'ĐỦ')).toBe(true);
    expect(blocked).toBe(false);
  });

  test.each([200, 401])('never prints a secret value (HTTP %i)', async (status) => {
    const { text } = await runPreflight(deps(FAKE, status));
    for (const v of Object.values(FAKE)) if (v && /secret/.test(v)) expect(text).not.toContain(v);
  });

  test('rejected keys are SAI, absent keys are THIẾU', async () => {
    expect((await checkItem('fal', deps(FAKE, 401))).status).toBe('SAI');
    expect((await checkItem('fal', deps({}))).status).toBe('THIẾU');
    expect((await checkItem('restic', deps({ CVS_RESTIC_PASSWORD: 'short' }))).status).toBe('SAI');
    expect((await checkItem('r2', deps({ ...FAKE, CVS_R2_REPOSITORY: 'https://wrong' }))).status).toBe('SAI');
  });

  test('an account-owned Cloudflare token passes on the account verify path only', async () => {
    const withVerify = (accountOk: boolean): Deps => {
      const d = deps(FAKE);
      const base = d.fetch;
      d.fetch = (async (url: string, init?: RequestInit) => {
        if (url.includes('/user/tokens/verify')) return json(401, {});
        if (url.includes('/accounts/a/tokens/verify')) return json(accountOk ? 200 : 401, {});
        return base(url, init);
      }) as typeof fetch;
      return d;
    };
    expect((await checkItem('cloudflare', withVerify(true))).status).toBe('ĐỦ');
    expect((await checkItem('cloudflare', withVerify(false))).status).toBe('SAI');
  });

  test('a Google client passes only when Google rejects the probe code, not the client', async () => {
    const google = (error: string): Deps => {
      const d = deps(FAKE);
      d.fetch = (async () => json(error === 'invalid_grant' ? 400 : 401, { error })) as typeof fetch;
      return d;
    };
    expect((await checkItem('google-app', google('invalid_grant'))).status).toBe('ĐỦ');
    expect((await checkItem('google-app', google('invalid_client'))).status).toBe('SAI');
    expect((await checkItem('google-app', google('redirect_uri_mismatch'))).note).toContain('/api/auth/callback/google');
    expect((await checkItem('google-app', deps({}))).status).toBe('THIẾU');
  });

  test('missing GitHub or Docker blocks the run', async () => {
    expect((await runPreflight(deps(FAKE, 500))).blocked).toBe(true);
  });

  test('a non-ĐỦ item maps to skipped steps, and a later ĐỦ un-skips them', async () => {
    const before = skippedSteps([{ id: 'fal', status: 'THIẾU', note: '' }]);
    expect([...before.keys()]).toEqual(['B.5a', 'B.5', 'B.6', 'B.7', 'M.6']);
    expect(skippedSteps([{ id: 'fal', status: 'ĐỦ', note: '' }]).size).toBe(0);
  });
});
