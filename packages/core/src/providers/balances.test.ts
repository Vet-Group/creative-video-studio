// fal's balance reader against fixtures shaped like its billing answer, and the warning rule. No network, no key.
import { describe, expect, test } from 'vitest';
import { bytePlusPack, isLow, readFalBalance, readFalBalances } from './balances';

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

describe('bytePlusPack', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const pack = { totalTokens: 7_000_000, tokens: 6_891_100, usedSince: 0, expiresAt: new Date('2027-02-01T15:59:59Z') };

  test('subtracts the tokens used since the as-of moment and prices what is left at $7 per million tokens', () => {
    expect(bytePlusPack({ ...pack, usedSince: 91_100 }, now)).toMatchObject({ totalTokens: 7_000_000, tokensLeft: 6_800_000, expiresAt: '2027-02-01T15:59:59.000Z', expired: false, low: false });
    expect(bytePlusPack({ ...pack, usedSince: 91_100 }, now).percentLeft).toBeCloseTo(97.142857, 5);
    expect(bytePlusPack({ ...pack, usedSince: 91_100 }, now).usdLeft).toBeCloseTo(47.6, 9);
  });

  test('is red under 20% of the tokens or within 14 days of the expiry, and the tokens never go under 0', () => {
    expect(bytePlusPack({ ...pack, usedSince: 5_491_101 }, now).low).toBe(true); // 1,399,999 of 7,000,000 is just under 20%
    expect(bytePlusPack({ ...pack, usedSince: 5_491_100 }, now).low).toBe(false); // exactly 20%
    expect(bytePlusPack(pack, new Date('2027-01-18T15:59:59Z')).low).toBe(false); // 14 days left
    expect(bytePlusPack(pack, new Date('2027-01-18T16:00:00Z')).low).toBe(true);
    expect(bytePlusPack(pack, new Date('2027-02-02T00:00:00Z'))).toMatchObject({ expired: true, low: true });
    expect(bytePlusPack({ ...pack, usedSince: 9_000_000 }, now)).toMatchObject({ tokensLeft: 0, percentLeft: 0, usdLeft: 0, low: true });
  });
});

describe('readFalBalances (a second, team key)', () => {
  const byKey = (answers: Record<string, Response>) =>
    (async (_url: string, init: RequestInit = {}) => answers[new Headers(init.headers).get('authorization')!.slice(4)]!.clone()) as unknown as typeof fetch;
  const usd = (n: number, currency = 'USD') => Response.json({ credits: { current_balance: n, currency } });

  test('without a second key it is the first balance; with one, both summed until the switch, then the second alone', async () => {
    const fetch = byKey({ first: usd(3.214), next: usd(100) });
    expect(await readFalBalances({ key: 'first', nextKey: undefined, switched: false, fetch })).toEqual({ ok: true, balance: 3.214, currency: 'USD' });
    expect(await readFalBalances({ key: 'first', nextKey: 'next', switched: false, fetch })).toEqual({ ok: true, balance: 103.21, currency: 'USD' });
    expect(await readFalBalances({ key: 'first', nextKey: 'next', switched: true, fetch })).toEqual({ ok: true, balance: 100, currency: 'USD' });
  });

  test('a failed read on either account, or two currencies, is a failed read', async () => {
    const bad = Response.json({ detail: 'Unauthorized' }, { status: 401 });
    expect(await readFalBalances({ key: 'first', nextKey: 'next', switched: false, fetch: byKey({ first: usd(5), next: bad }) })).toMatchObject({ ok: false, error: expect.stringMatching(/^FAL_KEY_NEXT: fal billing: HTTP 401/) });
    expect(await readFalBalances({ key: 'first', nextKey: 'next', switched: false, fetch: byKey({ first: bad, next: usd(5) }) })).toMatchObject({ ok: false, error: expect.stringMatching(/^fal billing: HTTP 401/) });
    expect(await readFalBalances({ key: 'first', nextKey: 'next', switched: false, fetch: byKey({ first: usd(5), next: usd(5, 'EUR') }) })).toEqual({ ok: false, reason: 'failed', error: 'the two fal accounts are in USD and EUR' });
  });
});
