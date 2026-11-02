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

test('a 401 on a page sends the user to the login, to come back to that page', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname: '/library', search: '?tab=video', assign } });
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
  await api('/x').catch(() => {});
  expect(assign).toHaveBeenCalledWith('/login?next=%2Flibrary%3Ftab%3Dvideo');
});

test('a better-auth refusal carries its code', async () => {
  const e = (await failure(401, {}, { code: 'USER_NOT_VERIFIED', message: 'User verification required' })) as ApiError;
  expect([e.status, e.code]).toEqual([401, 'USER_NOT_VERIFIED']);
});
