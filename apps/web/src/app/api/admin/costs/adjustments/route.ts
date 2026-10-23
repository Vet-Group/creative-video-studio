import { audit } from '@cvs/core/audit';
import { bookShared, withTransaction } from '@cvs/core/ledger';
import { bad, isMonth, money, nonEmpty, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/**
 * Admin: add a `manual_adjustment` to the shared (general cost) line of a month, `{ month, usd, note }`: a non-zero amount that may be negative,
 * and a note, which is required. It is audited as cost.manual_adjustment in the same transaction.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { month, usd, note } = (await readBody(request)) ?? {};
  const amount = money(usd, true);
  if (!isMonth(month) || amount === null || Number(amount) === 0) return bad('month (YYYY-MM) and usd (not zero, at most 4 decimals) are required');
  if (!nonEmpty(note)) return bad('a note is required');
  const ref = `manual-${crypto.randomUUID()}`;

  await withTransaction(pool, async (tx) => {
    await bookShared(tx, { kind: 'manual_adjustment', usd: amount, month, ref, note: note.trim() });
    await audit(tx, { actorId: g.session.user.id, action: 'cost.manual_adjustment', target: `cost:${ref}`, newValue: { month, usd: amount, note: note.trim() } });
  });
  return Response.json({ ref, month, usd: amount, note: note.trim() }, { status: 201 });
}
