'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  { href: '/complaints', label: 'Complaints' },
  { href: '/ageing', label: 'Ageing' },
  { href: '/energy-costing', label: 'Energy Costing' },
  { href: '/costing', label: 'Costing' },
  { href: '/amc', label: 'AMC' },
  { href: '/budget', label: 'Budget' },
];

const STANDALONE = [
  { href: '/assets', label: 'Asset Categories' },
  { href: '/operations', label: 'PPM · Incidents · Training' },
];

export function Nav() {
  const pathname = usePathname();
  const cls = (href: string) => (pathname === href ? 'active' : undefined);

  return (
    <nav>
      {PAGES.map((p) => (
        <Link key={p.href} href={p.href} className={cls(p.href)}>
          {p.label}
        </Link>
      ))}
      <div className="nav-group">More</div>
      {STANDALONE.map((p) => (
        <Link key={p.href} href={p.href} className={cls(p.href)}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
