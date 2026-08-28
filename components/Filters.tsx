'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { FilterOptions } from '@/lib/queries';

function Pill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className={value === 'All' ? 'pill' : 'pill pill-active'}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option>All</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function Filters({ properties, categories, months }: FilterOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (!value || value === 'All') next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );

  const current = (key: string) => sp.get(key) ?? 'All';
  const hasAny = ['month', 'property', 'category'].some((k) => sp.get(k));

  return (
    <div className="filters">
      <Pill label="Month" value={current('month')} options={months} onChange={(v) => setParam('month', v)} />
      <Pill label="Property" value={current('property')} options={properties} onChange={(v) => setParam('property', v)} />
      <Pill label="Category" value={current('category')} options={categories} onChange={(v) => setParam('category', v)} />
      {hasAny && (
        <button type="button" className="filter-reset" onClick={() => router.push(pathname, { scroll: false })}>
          Reset
        </button>
      )}
    </div>
  );
}
