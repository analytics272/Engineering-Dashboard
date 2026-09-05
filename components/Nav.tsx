'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 3 pages, grouped by business objective — Complaints+Ageing, the 3 cost
// pages, and AMC+Assets each collapsed into one. See DASHBOARD-GUIDE.md.
const PAGES = [
  { href: '/operations', label: 'Operations' },
  { href: '/costs', label: 'Costs & Budget' },
  { href: '/assets', label: 'Assets & Contracts' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {PAGES.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          className={pathname === p.href ? 'nav-link active' : 'nav-link'}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
