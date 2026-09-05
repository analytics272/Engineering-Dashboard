'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { FilterKey, FilterOptions } from '@/lib/queries';
import { CompareToggle } from './CompareToggle';
import { MultiSelectPill } from './MultiSelectPill';

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
    <label className="pill">
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
  showCompare = false,
}: FilterOptions & { show?: FilterKey[]; showCompare?: boolean }) {
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
  const hasAny = show.some((k) => sp.get(k)) || sp.get('cmp');

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

  const showMonthTabs = show.includes('month');
  const monthVal = current('month');
  const latestMonth = months[months.length - 1];
  const isAll = monthVal === 'All';
  const isLatest = !isAll && monthVal === latestMonth;
  const isCustom = !isAll && !isLatest;

  const reset = () => router.push(pathname, { scroll: false });

  return (
    <div className="filters">
      {showMonthTabs && (
        <div className="tab-group">
          <button type="button" className={isAll ? 'tab tab-active' : 'tab'} onClick={() => setParam('month', 'All')}>
            All Time
          </button>
          {latestMonth && (
            <button
              type="button"
              className={isLatest ? 'tab tab-active' : 'tab'}
              onClick={() => setParam('month', latestMonth)}
            >
              This Month
            </button>
          )}
          <select
            className={isCustom ? 'tab tab-select tab-active' : 'tab tab-select'}
            value={isCustom ? monthVal : ''}
            onChange={(e) => setParam('month', e.target.value)}
          >
            <option value="" disabled>
              Custom Month…
            </option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {showCompare && <CompareToggle />}

      {show
        .filter((k) => k !== 'month')
        .map((key) =>
          key === 'property' ? (
            <MultiSelectPill key={key} paramKey="property" label="Property" options={properties} />
          ) : (
            <Pill key={key} label={labelFor[key]} value={current(key)} options={optionsFor[key]} onChange={(v) => setParam(key, v)} />
          ),
        )}

      {hasAny && (
        <button type="button" className="filter-reset" onClick={reset}>
          Reset
        </button>
      )}
    </div>
  );
}
