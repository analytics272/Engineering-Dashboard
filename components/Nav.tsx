'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Flat nav — no sub-groups. `PPM · Incidents · Training` is intentionally
// omitted: its Appendix-A tables aren't synced yet, so the page has no data.
// Add { href: '/operations', label: 'PPM · Incidents · Training' } back once
// raw_eng_ppm / _trainings / _incidents exist in BigQuery.
const PAGES = [
  { href: '/complaints', label: 'Complaints' },
  { href: '/ageing', label: 'Ageing' },
  { href: '/energy-costing', label: 'Energy Costing' },
  { href: '/costing', label: 'Costing' },
  { href: '/amc', label: 'AMC' },
  { href: '/budget', label: 'Budget' },
  { href: '/assets', label: 'Asset Categories' },
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
