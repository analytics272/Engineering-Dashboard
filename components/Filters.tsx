'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { FilterOptions } from '@/lib/queries';

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
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp],
  );

  const current = (key: string) => sp.get(key) ?? 'All';
  const hasAny = ['month', 'property', 'category'].some((k) => sp.get(k));

  return (
    <div className="filters">
      <label>
        Month
        <select value={current('month')} onChange={(e) => setParam('month', e.target.value)}>
          <option>All</option>
          {months.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label>
        Property
        <select value={current('property')} onChange={(e) => setParam('property', e.target.value)}>
          <option>All</option>
          {properties.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={current('category')} onChange={(e) => setParam('category', e.target.value)}>
          <option>All</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {hasAny && (
        <button type="button" onClick={() => router.push(pathname)}>
          Clear
        </button>
      )}
    </div>
  );
}
