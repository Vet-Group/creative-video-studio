'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The two views of Admin > Costs: the month's costs, and what each billing team, partner and the company owes (docs/BILLING.md). */
export function CostViews() {
  const pathname = usePathname();
  return (
    <nav className="cost-views" aria-label="Các góc nhìn chi phí">
      {[
        ['/admin/costs', 'Tổng quan'],
        ['/admin/costs/teams', 'Theo team'],
      ].map(([href, text]) => (
        <Link key={href} href={href!} aria-current={pathname === href ? 'page' : undefined}>
          {text}
        </Link>
      ))}
    </nav>
  );
}
