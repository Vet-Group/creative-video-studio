import { bookInvoice } from '@cvs/core/ledger';
import { bad, isMonth, money, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { invoiceRows } from '@/lib/costs';
import { guard } from '@/lib/session';

const PROVIDERS = ['fal', 'replicate'];

/**
 * Admin: enter a provider's invoice total for a month, `{ month, provider, totalUsd }`. It books an `invoice_diff` row equal to the invoice minus
 * everything the ledger holds for that provider and month, so entering a corrected total books only the new difference; audited as invoice.enter
 * in the same transaction. The answer shows what was booked now and the invoice with its difference to the ledger, `red` above 5% of the
 * invoice, and the provider's total by UTC month of submit.
 */
export async function PUT(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { month, provider, totalUsd } = (await readBody(request)) ?? {};
  const total = money(totalUsd);
  if (!isMonth(month) || typeof provider !== 'string' || !PROVIDERS.includes(provider) || total === null) {
    return bad(`month (YYYY-MM), provider (${PROVIDERS.join(' or ')}) and totalUsd (0 or more, at most 4 decimals) are required`);
  }
  const bookedUsd = await bookInvoice(pool, { month, provider, totalUsd: total }, g.session.user.id);
  return Response.json({ month, bookedUsd, invoice: (await invoiceRows(pool, month, provider))[0] });
}
