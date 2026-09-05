'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * "Compare to Last Year" — a single toggle pill (not a picker). Matches the
 * Skyla Sales dashboard's filter bar exactly: a dot + label, filled when on.
 * Turning it on compares whatever Month/Property/Category/Quarter is
 * currently selected against the equivalent period one year earlier.
 */
export function CompareToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const on = sp.get('cmp') === '1';

  const toggle = () => {
    const params = new URLSearchParams(sp.toString());
    if (on) params.delete('cmp');
    else params.set('cmp', '1');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <button type="button" className={on ? 'compare-toggle compare-toggle-on' : 'compare-toggle'} onClick={toggle}>
      <span className="compare-dot" />
      Compare to Last Year
    </button>
  );
}
