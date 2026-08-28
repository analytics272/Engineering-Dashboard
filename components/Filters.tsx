'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { FilterKey, FilterOptions } from '@/lib/queries';

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

export function Filters({
  properties,
  categories,
  months,
  quarters,
  show = ['month', 'property', 'category'],
}: FilterOptions & { show?: FilterKey[] }) {
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
  const hasAny = show.some((k) => sp.get(k));

  const optionsFor: Record<FilterKey, string[]> = {
    month: months,
    property: properties,
    category: categories,
    quarter: quarters,
  };
  const labelFor: Record<FilterKey, string> = {
    month: 'Month',
    property: 'Property',
    category: 'Category',
    quarter: 'Quarter',
  };

  return (
    <div className="filters">
      {show.map((key) => (
        <Pill
          key={key}
          label={labelFor[key]}
          value={current(key)}
          options={optionsFor[key]}
          onChange={(v) => setParam(key, v)}
        />
      ))}
      {hasAny && (
        <button
          type="button"
          className="filter-reset"
          onClick={() => router.push(pathname, { scroll: false })}
        >
          Reset
        </button>
      )}
    </div>
  );
}
