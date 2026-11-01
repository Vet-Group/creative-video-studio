// The fetch wrapper's error: status, the server's message and the limiter's wait.
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, api } from './api';

afterEach(() => vi.unstubAllGlobals());

async function failure(status: number, headers: Record<string, string>, body: unknown) {
  vi.stubGlobal('window', { location: { pathname: '/login', assign: vi.fn() } });
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status, headers }));
  return api('/x').catch((e: unknown) => e);
}

test('a limiter refusal carries the seconds from X-Retry-After', async () => {
  const e = await failure(429, { 'x-retry-after': '7' }, { message: 'Too many requests. Please try again later.' });
  expect(e).toBeInstanceOf(ApiError);
  expect([(e as ApiError).status, (e as ApiError).retryAfter]).toEqual([429, 7]);
});

test('other failures have no wait and keep the server message', async () => {
  const e = (await failure(400, {}, { error: 'bad input' })) as ApiError;
  expect([e.status, e.message, e.retryAfter]).toEqual([400, 'bad input', null]);
});
