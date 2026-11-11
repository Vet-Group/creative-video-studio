// The fal low-balance alert (docs/ops/provider-balances.md): once an hour the worker reads fal's balance and, the first time it is under the Admin
// warning threshold, sends a direct message from the CVS Lark app's bot to the people in FAL_ALERT_LARK_EMAILS (the owner and the accountants who
// top up), or, without that list, to every Admin with a linked Lark account. Admins also see a notice in the app.
import type { Queryable } from '@cvs/core/ledger';
import { BILLING_URLS, isLow, type FalBalance } from '@cvs/core/providers/balances';
import { timeout, type Fetch } from '@cvs/core/providers/http';

export const FAL_ALERT_TICK_MS = 60 * 60 * 1000;

/** Sends `text` to one Lark user (an open_id of the CVS app, or a Lark email address); throws when Lark refuses. */
export type SendLark = (openId: string, text: string) => Promise<void>;

export type FalAlertResult = { sent: number; failed: string[] } | 'cleared' | 'none';

/**
 * One check. A balance it cannot read, or one not in USD, changes nothing (it never shows red either). Under the threshold, the first tick claims
 * `settings.fal_low_alerted_at` and messages the Admins; when every message fails the claim is released, so the next tick tries again. Back at or
 * over the threshold, the claim is cleared, so the next drop alerts again.
 */
export async function falAlertTick(pool: Queryable, readBalance: () => Promise<FalBalance>, send: SendLark, to: string[] = []): Promise<FalAlertResult> {
  const fal = await readBalance();
  if (!fal.ok || fal.currency !== 'USD') return 'none';
  const warningUsd = Number((await pool.query('select balance_warning_usd::text as usd from settings where id = 1')).rows[0].usd);
  if (!isLow(fal.balance, warningUsd)) {
    const { rowCount } = await pool.query('update settings set fal_low_alerted_at = null where id = 1 and fal_low_alerted_at is not null');
    return rowCount ? 'cleared' : 'none';
  }
  const claim = await pool.query('update settings set fal_low_alerted_at = now() where id = 1 and fal_low_alerted_at is null');
  if (!claim.rowCount) return 'none';
  const text = `Creative Video Studio: số dư fal còn $${fal.balance.toFixed(2)}, dưới ngưỡng cảnh báo $${warningUsd}. Nạp tiền tại ${BILLING_URLS.fal}`;
  const r = to.length ? await messageAll(send, to, text) : await messageAdmins(pool, send, text);
  if (r.sent === 0 && r.failed.length > 0) await pool.query('update settings set fal_low_alerted_at = null where id = 1');
  return r;
}

/** Messages every Admin with a linked Lark account (not banned); a failed message is listed, never thrown. */
export async function messageAdmins(pool: Queryable, send: SendLark, text: string): Promise<{ sent: number; failed: string[] }> {
  const { rows } = await pool.query(
    `select distinct a.account_id as open_id from users u join accounts a on a.user_id = u.id and a.provider_id = 'lark'
      where u.role = 'admin' and not u.banned order by 1`,
  );
  return messageAll(send, (rows as { open_id: string }[]).map((r) => r.open_id), text);
}

/** Messages each receiver (an open_id or a Lark email); a failed message is listed with its receiver's email, never thrown. */
async function messageAll(send: SendLark, receivers: string[], text: string): Promise<{ sent: number; failed: string[] }> {
  const failed: string[] = [];
  for (const to of receivers) await send(to, text).catch((e) => failed.push(`${to.includes('@') ? `${to}: ` : ''}${e instanceof Error ? e.message : String(e)}`));
  return { sent: receivers.length - failed.length, failed };
}

const LARK = 'https://open.larksuite.com/open-apis';

/**
 * A SendLark for the CVS Lark app (LARK_APP_ID, LARK_APP_SECRET): a tenant token, then a text message as the app's bot (needs the Bot feature and
 * im:message:send_as_bot). A receiver with an @ is a Lark email (receive_id_type=email); the person must be inside the app's availability.
 */
export function larkSender(app: { appId: string; appSecret: string }, f: Fetch = fetch): SendLark {
  const call = async (path: string, init: RequestInit) => {
    const res = await f(`${LARK}${path}`, { ...init, signal: timeout() });
    const body = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; tenant_access_token?: string };
    if (body.code !== 0) throw new Error(`lark ${path.split('?')[0]}: HTTP ${res.status} code ${body.code} ${body.msg ?? ''}`.trim());
    return body;
  };
  return async (openId, text) => {
    const { tenant_access_token } = await call('/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: app.appId, app_secret: app.appSecret }),
    });
    await call(`/im/v1/messages?receive_id_type=${openId.includes('@') ? 'email' : 'open_id'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tenant_access_token}` },
      body: JSON.stringify({ receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) }),
    });
  };
}
