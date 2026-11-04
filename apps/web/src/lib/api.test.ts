// The fetch wrapper's error: status, the server's message and the limiter's wait.
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, api, rotatingSession, startSignOut } from './api';

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

test('a 401 from a call sent on the cookie a password change replaces does not send the user to the login; one sent after the change does', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname: '/library', search: '', assign } });
  let answer!: (r: Response) => void;
  vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (answer = resolve)));
  let changed!: () => void;
  const change = rotatingSession(() => new Promise<void>((resolve) => (changed = resolve)));
  const during = api('/during').catch(() => {});
  answer(new Response('{}', { status: 401 }));
  await during;
  const before = api('/before').catch(() => {}); // sent before the new cookie, answered after it
  changed();
  await change;
  answer(new Response('{}', { status: 401 }));
  await before;
  expect(assign).not.toHaveBeenCalled();

  const after = api('/after').catch(() => {});
  answer(new Response('{}', { status: 401 }));
  await after;
  expect(assign).toHaveBeenCalledWith('/login?next=%2Flibrary');
});

// Last: a sign-out stays set for the rest of the file.
test('after a sign-out starts, a 401 from a call in flight no longer sends the user to the login with this page', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { pathname: '/account/sign-in-methods', search: '', assign } });
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
  startSignOut();
  await api('/x').catch(() => {});
  expect(assign).not.toHaveBeenCalled();
});
