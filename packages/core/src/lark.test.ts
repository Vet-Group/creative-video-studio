// The CVS Lark app's bot: text and file messages against a fake fetch (no real Lark call), and the environment readers.
import { expect, test } from 'vitest';
import { larkApp, larkFileSender, larkRecipients, larkSender, sendEach } from './lark';

const app = { appId: 'cli_x', appSecret: 's' };
const answer = (code: number, extra = {}) => new Response(JSON.stringify({ code, msg: code ? 'app do not have bot' : 'ok', ...extra }));

interface Call {
  url: string;
  body: unknown;
  auth?: string;
}
/** A fetch that records each call and answers by path; `fail` names the path that gets Lark error 11205. */
function fakeFetch(calls: Call[], fail = '') {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body, auth: (init?.headers as Record<string, string>).authorization });
    if (fail && u.includes(fail)) return answer(11205);
    if (u.includes('tenant_access_token')) return answer(0, { tenant_access_token: 't-1' });
    return answer(0, u.includes('/im/v1/files') ? { data: { file_key: 'file_v2_abc' } } : {});
  }) as typeof fetch;
}

test('larkSender gets a tenant token, then sends a text message to the open_id as the bot; a Lark error code throws', async () => {
  const calls: Call[] = [];
  await larkSender(app, fakeFetch(calls))('ou_a', 'hello');
  expect(calls).toEqual([
    { url: 'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', body: { app_id: 'cli_x', app_secret: 's' }, auth: undefined },
    { url: 'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id', body: { receive_id: 'ou_a', msg_type: 'text', content: '{"text":"hello"}' }, auth: 'Bearer t-1' },
  ]);
  calls.length = 0;
  await larkSender(app, fakeFetch(calls))('mi@vet.test', 'hello');
  expect(calls[1]!.url).toBe('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=email');
  expect(calls[1]!.body).toEqual({ receive_id: 'mi@vet.test', msg_type: 'text', content: '{"text":"hello"}' });
  await expect(larkSender(app, fakeFetch([], '/im/v1/messages'))('ou_a', 'hello')).rejects.toThrow('lark /im/v1/messages: HTTP 200 code 11205 app do not have bot');
});

test('larkFileSender uploads the content as a stream file, then sends a file message with its file_key', async () => {
  const calls: Call[] = [];
  await larkFileSender(app, fakeFetch(calls))('mi@vet.test', 'cvs-chi-phi-2026-11.csv', 'a,b\r\n1,2\r\n');
  expect(calls.map((c) => c.url.replace('https://open.larksuite.com/open-apis', ''))).toEqual(['/auth/v3/tenant_access_token/internal', '/im/v1/files', '/im/v1/messages?receive_id_type=email']);
  expect(calls[1]!.auth).toBe('Bearer t-1');
  const form = calls[1]!.body as FormData;
  expect(form.get('file_type')).toBe('stream');
  expect(form.get('file_name')).toBe('cvs-chi-phi-2026-11.csv');
  const file = form.get('file') as File;
  expect([file.name, await file.text()]).toEqual(['cvs-chi-phi-2026-11.csv', 'a,b\r\n1,2\r\n']);
  expect(calls[2]!.body).toEqual({ receive_id: 'mi@vet.test', msg_type: 'file', content: '{"file_key":"file_v2_abc"}' });
  await expect(larkFileSender(app, fakeFetch([], '/im/v1/files'))('ou_a', 'x.csv', 'x')).rejects.toThrow('lark /im/v1/files: HTTP 200 code 11205');
});

test('sendEach counts the receivers it reached and names an email that failed, never an open_id', async () => {
  const got: string[] = [];
  const r = await sendEach(['a@vet.test', 'ou_b', 'c@vet.test'], async (to) => {
    if (to !== 'a@vet.test') throw new Error('lark: refused');
    got.push(to);
  });
  expect(r).toEqual({ sent: 1, failed: ['lark: refused', 'c@vet.test: lark: refused'] });
  expect(got).toEqual(['a@vet.test']);
});

test('the app needs both values, and the recipients are the trimmed, non-empty entries of FAL_ALERT_LARK_TO', () => {
  expect(larkApp({ LARK_APP_ID: 'i', LARK_APP_SECRET: 's' })).toEqual({ appId: 'i', appSecret: 's' });
  expect(larkApp({ LARK_APP_ID: 'i' })).toBeUndefined();
  expect(larkApp({})).toBeUndefined();
  expect(larkRecipients({ FAL_ALERT_LARK_TO: ' a@vet.test, ,ou_b,' })).toEqual(['a@vet.test', 'ou_b']);
  expect(larkRecipients({})).toEqual([]);
});
