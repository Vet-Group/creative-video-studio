// The fal account switch (owner request, 2026-11-11; docs/ops/provider-balances.md). With FAL_KEY_NEXT set (the "VET Group" team account),
// new fal jobs go to FAL_KEY's account (the personal one) until it runs out, then to the team, without anyone changing a key on the server.
import { audit } from '@cvs/core/audit';
import type { Queryable } from '@cvs/core/ledger';
import type { FalBalance } from '@cvs/core/providers/balances';
import { type Pinnable, pinToAccounts } from '@cvs/core/providers/vertex-accounts';
import { messageAdmins, type SendLark } from './fal-alert';

/** fal's answers when an account is out of credit (fal docs, Errors and Billing, checked 2026-11-11). */
const CREDIT_REFUSAL = /account is locked|user is locked|exhausted balance|insufficient credits/i;

/** The account new fal jobs go to: the team once settings.fal_next_at is set, else the personal one. */
export const falActive = async (pool: Queryable): Promise<'personal' | 'team'> =>
  (await pool.query('select fal_next_at is not null as s from settings where id = 1')).rows[0]?.s === true ? 'team' : 'personal';

/**
 * One fal provider over the two accounts (pinToAccounts: a job keeps the account it was sent to, so one sent to the personal account is still
 * polled there after the switch; an id from before this existed belongs to the personal account). The personal credit is used up first
 * (owner, 2026-11-11): a submit to the personal account switches only when fal refused it for credit (CREDIT_REFUSAL, or a balance at or under
 * 0) while the balance is under the Admin warning threshold. The first worker to set settings.fal_next_at audits it (`fal.switch`, no actor)
 * and messages the Admins on Lark, and the job is sent again, to the team. Any other failure is the job's own and is thrown as it was.
 */
export function falNext<R, J extends { providerJobId: string }, S>(
  personal: Pinnable<R, J, S>,
  team: Pinnable<R, J, S>,
  o: { pool: Queryable; readPersonal: () => Promise<FalBalance>; send?: SendLark },
): Pinnable<R, J, S> {
  const pinned = pinToAccounts([['personal', personal], ['team', team]], () => falActive(o.pool));
  return {
    ...pinned,
    async submit(req) {
      try {
        return await pinned.submit(req);
      } catch (e) {
        if ((await falActive(o.pool)) === 'team') throw e;
        const fal = await o.readPersonal();
        const warningUsd = Number((await o.pool.query('select balance_warning_usd::text as usd from settings where id = 1')).rows[0].usd);
        if (!fal.ok || fal.balance >= warningUsd) throw e;
        if (fal.balance > 0 && !CREDIT_REFUSAL.test(e instanceof Error ? e.message : String(e))) throw e;
        await switchToTeam(o.pool, fal.balance, e, o.send);
        return pinned.submit(req);
      }
    },
  };
}

async function switchToTeam(pool: Queryable, balance: number, cause: unknown, send?: SendLark) {
  const { rowCount } = await pool.query('update settings set fal_next_at = now(), updated_at = now() where id = 1 and fal_next_at is null');
  if (!rowCount) return; // another submit switched first
  const error = cause instanceof Error ? cause.message.slice(0, 300) : String(cause);
  await audit(pool, { actorId: null, action: 'fal.switch', target: 'settings:1', oldValue: { account: 'personal', balance }, newValue: { account: 'team', error } });
  console.log(`worker: fal: the personal account is out ($${balance.toFixed(2)}); new fal jobs go to the team account`);
  if (send) {
    const text = `Creative Video Studio: tài khoản fal cá nhân đã hết tiền (còn $${balance.toFixed(2)}), từ giờ CVS dùng tài khoản Team "VET Group". Khi đã ổn, nhờ Claude đổi FAL_KEY sang key Team và xoá key cá nhân.`;
    const r = await messageAdmins(pool, send, text).catch((err: unknown) => ({ sent: 0, failed: [String(err)] }));
    if (r.failed.length) console.error(`worker: fal switch: Lark failed: ${r.failed.join('; ')}`);
  }
}
