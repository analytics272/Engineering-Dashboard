'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * "Compare Years" — multi-select. Picking 2+ years overlays them on every
 * trend chart and drives the ▲/▼ delta on every KPI card (comparing the two
 * most recent of the selected years). The list of years is derived from the
 * data itself (lib/period.ts availableYears) — a new year appearing in the
 * sheet just becomes selectable, no code change.
 */
export function YearPicker({ years }: { years: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = (() => {
    const raw = sp.get('years');
    if (!raw) return years.length >= 2 ? years.slice(-2) : years.slice(-1);
    return raw
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => years.includes(n));
  })();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const apply = (next: number[]) => {
    const params = new URLSearchParams(sp.toString());
    if (next.length === 0 || next.length === years.length) params.delete('years');
    else params.set('years', [...next].sort().join(','));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (y: number) => {
    const set = new Set(selected);
    if (set.has(y)) set.delete(y);
    else set.add(y);
    apply([...set]);
  };

  if (years.length < 2) return null;

  const label =
    selected.length === 0
      ? 'All years'
      : selected.length <= 2
        ? selected.join(' vs ')
        : `${selected.length} years`;

  return (
    <div className="year-picker" ref={ref}>
      <button
        type="button"
        className={selected.length >= 2 ? 'pill pill-active' : 'pill'}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Compare</span>
        {label}
      </button>
      {open && (
        <div className="year-panel">
          {years.map((y) => (
            <label key={y} className="year-option">
              <input type="checkbox" checked={selected.includes(y)} onChange={() => toggle(y)} />
              {y}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
