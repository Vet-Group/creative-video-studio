// The fal low-balance alert against a disposable database (needs the compose Postgres: `pnpm services:up`); fal and Lark are stubs.
import type { FalBalance } from '@cvs/core/providers/balances';
import { createPool } from '@cvs/db/client';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { falAlertTick, larkSender } from './fal-alert';

const testDb = await createTestDatabase();
const pool = createPool(testDb.url);

afterAll(async () => {
  await pool.end();
  await testDb.drop();
});

beforeAll(async () => {
  await pool.query('update settings set balance_warning_usd = 10 where id = 1');
  for (const [id, role, banned, openId] of [
    ['admin-a', 'admin', false, 'ou_a'],
    ['admin-b', 'admin', false, null],
    ['admin-c', 'admin', true, 'ou_c'],
    ['member-d', 'member', false, 'ou_d'],
  ] as const) {
    await pool.query(`insert into users (id, email, name, role, banned) values ($1, $1 || '@example.test', $1, $2, $3)`, [id, role, banned]);
    if (openId) await pool.query(`insert into accounts (id, user_id, account_id, provider_id) values ($1, $2, $3, 'lark')`, [`acc-${id}`, id, openId]);
  }
});

const usd = (balance: number) => async (): Promise<FalBalance> => ({ ok: true, balance, currency: 'USD' });
const alertedAt = async () => (await pool.query('select fal_low_alerted_at as at from settings where id = 1')).rows[0].at;

test('the first tick under the threshold messages each active Admin with Lark once; back over it, the next drop messages again', async () => {
  const sent: [string, string][] = [];
  const send = async (openId: string, text: string) => void sent.push([openId, text]);

  expect(await falAlertTick(pool, usd(12), send)).toBe('none');
  expect(await falAlertTick(pool, usd(9.5), send)).toEqual({ sent: 1, failed: [] });
  expect(sent).toEqual([['ou_a', 'Creative Video Studio: số dư fal còn $9.50, dưới ngưỡng cảnh báo $10. Nạp tiền tại https://fal.ai/dashboard/billing']]);
  expect(await alertedAt()).not.toBeNull();
  expect(await falAlertTick(pool, usd(4), send)).toBe('none'); // still low: no second message
  expect(sent).toHaveLength(1);

  expect(await falAlertTick(pool, usd(10), send)).toBe('cleared'); // at the threshold is not low
  expect(await alertedAt()).toBeNull();
  expect(await falAlertTick(pool, usd(8), send)).toEqual({ sent: 1, failed: [] });
  expect(sent).toHaveLength(2);
  await falAlertTick(pool, usd(50), send);
});

test('an unread or non-USD balance changes nothing; when every message fails the next tick tries again', async () => {
  const never = async () => {
    throw new Error('not expected');
  };
  expect(await falAlertTick(pool, async () => ({ ok: false, reason: 'failed', error: 'x' }), never)).toBe('none');
  expect(await falAlertTick(pool, async () => ({ ok: true, balance: 1, currency: 'EUR' }), never)).toBe('none');
  expect(await alertedAt()).toBeNull();

  const refused = async () => {
    throw new Error('lark /im/v1/messages: HTTP 400 code 230002 bot not in chat');
  };
  expect(await falAlertTick(pool, usd(3), refused)).toEqual({ sent: 0, failed: ['lark /im/v1/messages: HTTP 400 code 230002 bot not in chat'] });
  expect(await alertedAt()).toBeNull();
  let n = 0;
  expect(await falAlertTick(pool, usd(3), async () => void n++)).toEqual({ sent: 1, failed: [] });
  expect(n).toBe(1);
  await falAlertTick(pool, usd(50), never);
});

test('larkSender gets a tenant token, then sends a text message to the open_id as the bot; a Lark error code throws', async () => {
  const calls: { url: string; body: unknown; auth?: string }[] = [];
  const answer = (code: number, extra = {}) => new Response(JSON.stringify({ code, msg: code ? 'app do not have bot' : 'ok', ...extra }));
  const fakeFetch = (fail: boolean) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).authorization });
      return String(url).includes('tenant_access_token') ? answer(0, { tenant_access_token: 't-1' }) : answer(fail ? 11205 : 0);
    }) as typeof fetch;

  await larkSender({ appId: 'cli_x', appSecret: 's' }, fakeFetch(false))('ou_a', 'hello');
  expect(calls).toEqual([
    { url: 'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', body: { app_id: 'cli_x', app_secret: 's' }, auth: undefined },
    { url: 'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id', body: { receive_id: 'ou_a', msg_type: 'text', content: '{"text":"hello"}' }, auth: 'Bearer t-1' },
  ]);
  await expect(larkSender({ appId: 'cli_x', appSecret: 's' }, fakeFetch(true))('ou_a', 'hello')).rejects.toThrow('lark /im/v1/messages: HTTP 200 code 11205 app do not have bot');
});
