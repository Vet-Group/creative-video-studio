// Messages from the CVS Lark app's bot (LARK_APP_ID, LARK_APP_SECRET): the worker's fal alert and the web app's month-close mail to accounting.
// A receiver with an @ is a Lark email (receive_id_type=email), otherwise an open_id of the app; the person must be inside the app's availability.
import { timeout, type Fetch } from './providers/http';

/** Sends `text` to one Lark user; throws when Lark refuses. */
export type SendLark = (to: string, text: string) => Promise<void>;
/** Sends a file (its name and text content, no more than a few MB) to one Lark user; throws when Lark refuses. */
export type SendLarkFile = (to: string, name: string, content: string) => Promise<void>;

interface LarkApp {
  appId: string;
  appSecret: string;
}

const LARK = 'https://open.larksuite.com/open-apis';

/** The app from the environment, or undefined when either value is missing (sending is off). */
export const larkApp = (env: NodeJS.ProcessEnv = process.env): LarkApp | undefined =>
  env.LARK_APP_ID && env.LARK_APP_SECRET ? { appId: env.LARK_APP_ID, appSecret: env.LARK_APP_SECRET } : undefined;

/** The people in `FAL_ALERT_LARK_TO` (comma-separated Lark emails or open_ids): the owner and the accountants. Empty when it is unset. */
export const larkRecipients = (env: NodeJS.ProcessEnv = process.env): string[] => (env.FAL_ALERT_LARK_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);

type LarkBody = { code?: number; msg?: string; tenant_access_token?: string; data?: { file_key?: string } };

const call = async (f: Fetch, path: string, init: RequestInit): Promise<LarkBody> => {
  const res = await f(`${LARK}${path}`, { ...init, signal: timeout() });
  const body = (await res.json().catch(() => ({}))) as LarkBody;
  if (body.code !== 0) throw new Error(`lark ${path.split('?')[0]}: HTTP ${res.status} code ${body.code} ${body.msg ?? ''}`.trim());
  return body;
};

const tenantToken = async (app: LarkApp, f: Fetch) =>
  (
    await call(f, '/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: app.appId, app_secret: app.appSecret }),
    })
  ).tenant_access_token;

/** A message as the app's bot (needs the Bot feature and im:message:send_as_bot). */
const message = (f: Fetch, token: string | undefined, to: string, msgType: 'text' | 'file', content: object) =>
  call(f, `/im/v1/messages?receive_id_type=${to.includes('@') ? 'email' : 'open_id'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: to, msg_type: msgType, content: JSON.stringify(content) }),
  });

/** A SendLark for the CVS Lark app: a tenant token, then a text message. */
export function larkSender(app: LarkApp, f: Fetch = fetch): SendLark {
  return async (to, text) => {
    await message(f, await tenantToken(app, f), to, 'text', { text });
  };
}

/** A SendLarkFile for the CVS Lark app: a tenant token, the upload as an IM file (stream), then a file message. */
export function larkFileSender(app: LarkApp, f: Fetch = fetch): SendLarkFile {
  return async (to, name, content) => {
    const token = await tenantToken(app, f);
    const form = new FormData();
    form.append('file_type', 'stream');
    form.append('file_name', name);
    form.append('file', new Blob([content], { type: 'text/csv' }), name);
    const { data } = await call(f, '/im/v1/files', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
    if (!data?.file_key) throw new Error('lark /im/v1/files: no file_key');
    await message(f, token, to, 'file', { file_key: data.file_key });
  };
}

/** Runs `send` for each receiver; a failure is listed with its receiver's email (an open_id stays out), never thrown. */
export async function sendEach(receivers: string[], send: (to: string) => Promise<void>): Promise<{ sent: number; failed: string[] }> {
  const failed: string[] = [];
  for (const to of receivers) await send(to).catch((e) => failed.push(`${to.includes('@') ? `${to}: ` : ''}${e instanceof Error ? e.message : String(e)}`));
  return { sent: receivers.length - failed.length, failed };
}
