// Vertex accounts: the key config, the credits guard as a decision table, and job pinning over fake providers. No network, no key.
import { describe, expect, test, vi } from 'vitest';
import { ImageReadError } from './http';
import { activeAccount, creditState, pinToAccounts, vertexAccounts, type CreditRow } from './vertex-accounts';
import type { VertexBilling } from './vertex-billing';

describe('vertexAccounts', () => {
  const files: Record<string, object> = {
    '/k1.json': { client_email: 'a@cvs-vertex', private_key: 'x', project_id: 'cvs-vertex' },
    '/k2.json': { client_email: 'b@next', private_key: 'y', project_id: 'creative-video-studio' },
    '/nop.json': { client_email: 'c', private_key: 'z' },
  };
  const read = (p: string) => JSON.stringify(files[p]);

  test('lists account 1 then the optional account 2, each by its project', () => {
    expect(vertexAccounts({}, read)).toEqual([]);
    expect(vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/k1.json' }, read).map((a) => a.project)).toEqual(['cvs-vertex']);
    expect(vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/k1.json', GOOGLE_APPLICATION_CREDENTIALS_NEXT: '/k2.json' }, read).map((a) => a.project)).toEqual(['cvs-vertex', 'creative-video-studio']);
    expect(vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/nop.json', GOOGLE_CLOUD_PROJECT: 'override' }, read).map((a) => a.project)).toEqual(['override']);
  });

  test('refuses a key without a project and two keys of one project', () => {
    expect(() => vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/nop.json' }, read)).toThrow(/GOOGLE_CLOUD_PROJECT/);
    expect(() => vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/k1.json', GOOGLE_APPLICATION_CREDENTIALS_NEXT: '/nop.json' }, read)).toThrow(/NEXT key file has no project_id/);
    expect(() => vertexAccounts({ GOOGLE_APPLICATION_CREDENTIALS: '/k1.json', GOOGLE_APPLICATION_CREDENTIALS_NEXT: '/k1.json' }, read)).toThrow(/both Vertex keys/);
  });
});

describe('creditState and activeAccount', () => {
  const VND: CreditRow = { creditTotal: '7825800', creditCurrency: 'VND', creditExpiresOn: '2026-12-30', stopWhenCreditsEnd: true };
  const read = (creditsVnd: number, rate = 26_000): VertexBilling => ({ ok: true, currency: 'VND', rate, creditsAllTime: -creditsVnd, creditsAllTimeUsd: -creditsVnd / rate, rows: [] });
  const TODAY = '2026-11-03';

  test('remaining is the total minus the credits used, in the total currency and in USD at the latest rate', () => {
    expect(creditState(VND, read(1_825_800), TODAY)).toEqual({
      total: 7_825_800, currency: 'VND', used: 1_825_800, remaining: 6_000_000, remainingUsd: 6_000_000 / 26_000, expiresOn: '2026-12-30', stopWhenCreditsEnd: true, unverified: false, usable: true,
    });
    const usd = creditState({ creditTotal: '300', creditCurrency: 'USD', creditExpiresOn: null, stopWhenCreditsEnd: true }, read(2_600_000), TODAY);
    expect([usd.used, usd.remaining, usd.remainingUsd, usd.usable]).toEqual([100, 200, 200, true]);
  });

  test.each([
    ['plenty of credit', VND, read(1_000_000), TODAY, true],
    ['just under $15 left', VND, read(7_825_800 - 14.9 * 26_000), TODAY, false],
    ['exactly $15 left', VND, read(7_825_800 - 15 * 26_000), TODAY, true],
    ['the day before expiry', VND, read(0), '2026-12-29', false],
    ['two days before expiry', VND, read(0), '2026-12-28', true],
    ['after expiry', VND, read(0), '2027-01-02', false],
    ['low credit but not set to stop', { ...VND, stopWhenCreditsEnd: false }, read(7_825_800), '2027-01-02', true],
    ['export unreadable: usable, unverified', VND, { ok: false, reason: 'no_access', error: '403' } as VertexBilling, TODAY, true],
    ['export read failed: usable, unverified', VND, undefined, TODAY, true],
    ['export unreadable still stops at expiry', VND, undefined, '2026-12-29', false],
    ['no row: usable', undefined, read(0), TODAY, true],
  ])('%s', (_, row, billing, today, usable) => {
    const s = creditState(row as CreditRow | undefined, billing as VertexBilling | undefined, today as string);
    expect(s.usable).toBe(usable);
    expect(s.unverified).toBe(!(billing as VertexBilling | undefined)?.ok);
  });

  test('the active account is the first usable one in order, else none', () => {
    const ok = creditState(VND, read(0), TODAY);
    const ended = creditState(VND, read(7_825_800), TODAY);
    expect(activeAccount([{ project: 'a', state: ok }, { project: 'b', state: ok }])).toBe('a');
    expect(activeAccount([{ project: 'a', state: ended }, { project: 'b', state: ok }])).toBe('b');
    expect(activeAccount([{ project: 'a', state: ended }, { project: 'b', state: ended }])).toBeNull();
    expect(activeAccount([])).toBeNull();
  });
});

describe('pinToAccounts', () => {
  const fake = (name: string) => ({
    submit: vi.fn(async () => ({ providerJobId: `${name}-job` })),
    status: vi.fn(async (job: { providerJobId: string }) => ({ state: 'running' as const, seen: `${name}:${job.providerJobId}` })),
    cancel: vi.fn(async () => ({ supported: false })),
  });

  test('sends a new job to the active account and routes status and cancel by the id prefix; an id without one is account 1', async () => {
    const one = fake('one');
    const two = fake('two');
    let active: string | null = 'next-project';
    const p = pinToAccounts<string, { providerJobId: string }, unknown>([['cvs-vertex', one], ['next-project', two]], async () => active);
    expect(await p.submit('req')).toEqual({ providerJobId: 'acct:next-project|two-job' });
    expect([one.submit.mock.calls.length, two.submit.mock.calls]).toEqual([0, [['req']]]);
    expect(await p.status({ providerJobId: 'acct:next-project|two-job' })).toMatchObject({ seen: 'two:two-job' });
    expect(await p.status({ providerJobId: 'acct:cvs-vertex|vertex-veo-v1:abc' })).toMatchObject({ seen: 'one:vertex-veo-v1:abc' });
    expect(await p.status({ providerJobId: 'vertex-veo-v1:legacy' })).toMatchObject({ seen: 'one:vertex-veo-v1:legacy' });
    await p.cancel({ providerJobId: 'acct:next-project|two-job' });
    expect(two.cancel).toHaveBeenCalledWith({ providerJobId: 'two-job' });
    active = 'cvs-vertex';
    expect(await p.submit('req')).toEqual({ providerJobId: 'acct:cvs-vertex|one-job' });
    await expect(p.status({ providerJobId: 'acct:gone-project|x' })).rejects.toThrow('no longer configured');
  });

  test('with no active account, or one this worker lacks, a submit fails fast before any provider call', async () => {
    const one = fake('one');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await expect(pinToAccounts([['cvs-vertex', one]], async () => null).submit('req')).rejects.toBeInstanceOf(ImageReadError);
      await expect(pinToAccounts([['cvs-vertex', one]], async () => 'other').submit('req')).rejects.toThrow('not configured');
      expect(one.submit).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
