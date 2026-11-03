// fal's balance reader against fixtures shaped like its billing answer, and the warning rule. No network, no key.
import { describe, expect, test } from 'vitest';
import { isLow, readFalBalance } from './balances';

function fakeFetch(answer: Response | Error) {
  const calls: { url: string; auth: string | null; signal: boolean }[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization'), signal: init.signal instanceof AbortSignal });
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('readFalBalance', () => {
  test('reads credits.current_balance with the key, inside a bounded wait', async () => {
    const { fn, calls } = fakeFetch(Response.json({ username: 'vet', credits: { current_balance: 12.05, currency: 'USD' } }));
    expect(await readFalBalance({ key: 'k-1', fetch: fn })).toEqual({ ok: true, balance: 12.05, currency: 'USD' });
    expect(calls).toEqual([{ url: 'https://api.fal.ai/v1/account/billing?expand=credits', auth: 'Key k-1', signal: true }]);
  });

  test('a missing key is a result without any call', async () => {
    const { fn, calls } = fakeFetch(new Error('unreachable'));
    expect(await readFalBalance({ key: undefined, fetch: fn })).toEqual({ ok: false, reason: 'no_key', error: 'FAL_KEY is not set' });
    expect(calls).toHaveLength(0);
  });

  test('an HTTP error, an answer without a balance, an oversized answer and a network failure are readable results, not throws', async () => {
    const read = (answer: Response | Error) => readFalBalance({ key: 'k', fetch: fakeFetch(answer).fn });
    expect(await read(Response.json({ detail: 'Unauthorized' }, { status: 401 }))).toEqual({ ok: false, reason: 'failed', error: 'fal billing: HTTP 401 {"detail":"Unauthorized"}' });
    expect(await read(Response.json({ username: 'vet' }))).toEqual({ ok: false, reason: 'failed', error: 'fal billing: the answer has no credits.current_balance and currency' });
    expect(await read(Response.json({ credits: { current_balance: '12', currency: 'USD' } }))).toMatchObject({ ok: false, reason: 'failed' });
    expect(await read(new Response('x'.repeat(70_000)))).toEqual({ ok: false, reason: 'failed', error: 'fal billing response exceeds 65536 bytes' });
    expect(await read(new Response('not json'))).toMatchObject({ ok: false, reason: 'failed' });
    expect(await read(new Error('fetch failed'))).toEqual({ ok: false, reason: 'failed', error: 'fetch failed' });
  });
});

test('isLow: under the threshold is red, at it or unknown is not', () => {
  expect(isLow(9.99, 10)).toBe(true);
  expect(isLow(10, 10)).toBe(false);
  expect(isLow(null, 10)).toBe(false);
});
