'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The three views of Admin > Costs: the period's costs, what each billing team, partner and the company owes (docs/BILLING.md), and the month's
 * reconciliation. `search` (the address's query) carries the period between the overview and the reconciliation.
 */
export function CostViews({ search = '' }: { search?: string }) {
  const pathname = usePathname();
  const query = search && `?${search}`;
  return (
    <nav className="cost-views" aria-label="Các góc nhìn chi phí">
      {[
        ['/admin/costs', 'Tổng quan', query],
        ['/admin/costs/teams', 'Theo team', ''],
        ['/admin/costs/reconcile', 'Đối soát', query],
      ].map(([href, text, q]) => (
        <Link key={href} href={`${href}${q}`} aria-current={pathname === href ? 'page' : undefined}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
