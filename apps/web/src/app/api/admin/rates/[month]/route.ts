import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, isMonth, money, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: set the VND-per-USD rate of one month, `{ vndPerUsd }` (more than 0). It changes only that month; audited as rate.update with the old
 * and new rate, in the same transaction. Setting the rate it already has writes nothing.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ month: string }> }) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { month } = await params;
  const rate = money((await readBody(request))?.vndPerUsd);
  if (!isMonth(month) || rate === null || Number(rate) === 0) return bad('the month must look like 2026-09 and vndPerUsd must be more than 0, with at most 4 decimals');

  return withTransaction(pool, async (tx): Promise<Response> => {
    const old = (await tx.query('select vnd_per_usd::text as rate from monthly_rates where month = $1 for update', [month])).rows[0]?.rate as string | undefined;
    if (old !== rate) {
      await tx.query(
        `insert into monthly_rates (month, vnd_per_usd) values ($1, $2) on conflict (month) do update set vnd_per_usd = excluded.vnd_per_usd, updated_at = now()`,
        [month, rate],
      );
      await audit(tx, { actorId: g.session.user.id, action: 'rate.update', target: `rate:${month}`, oldValue: old === undefined ? null : { vndPerUsd: old }, newValue: { vndPerUsd: rate } });
    }
    return Response.json({ month, vndPerUsd: rate });
  });
}
