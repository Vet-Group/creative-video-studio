import { bad, isMonth, readBody } from '@/lib/admin';
import { closeMonth, mailClose, reopenMonth } from '@/lib/billing';
import { guard } from '@/lib/session';

/**
 * Admin: close a past month (`{ month }`), freezing its billing figures for accounting (docs/BILLING.md). Audited. 409 when this month or a later one, or already closed.
 * Once it has committed, the summary and the CSV go to the Lark recipients (best effort); `lark` says how many were reached, or `off` (mailClose in lib/billing.ts).
 */
export async function POST(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = (await readBody(request))?.month;
  if (!isMonth(month)) return bad('month must look like 2026-11');
  const done = await closeMonth(month, g.session.user.id);
  if (done === 'open') return bad('only a past month can be closed', 409);
  if (done === 'closed') return bad('the month is already closed', 409);
  return Response.json({ month, closed: true, lark: await mailClose(month, g.session.user.id) });
}

/** Admin: reopen a closed month (`?month=YYYY-MM`): its figures are live again. Audited. 404 when it is not closed. */
export async function DELETE(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (!isMonth(month)) return bad('month must look like 2026-11');
  if (!(await reopenMonth(month, g.session.user.id))) return bad('the month is not closed', 404);
  return Response.json({ month, closed: false });
}
