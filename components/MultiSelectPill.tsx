'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * A checkbox popover pill for multi-select filters (currently Property) —
 * comma-joined in the URL (`?property=HTC,KDP`), label reads "All" / the one
 * value / "N selected", matching the Skyla Sales dashboard's "FY: 2 selected".
 */
export function MultiSelectPill({
  paramKey,
  label,
  options,
}: {
  paramKey: string;
  label: string;
  options: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = (() => {
    const raw = sp.get(paramKey);
    if (!raw) return [] as string[];
    return raw.split(',').map((s) => s.trim()).filter((s) => options.includes(s));
  })();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const apply = (next: string[]) => {
    const params = new URLSearchParams(sp.toString());
    if (next.length === 0) params.delete(paramKey);
    else params.set(paramKey, next.join(','));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (v: string) => {
    const set = new Set(selected);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    apply([...set]);
  };

  const valueText = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="multiselect" ref={ref}>
      <button type="button" className="pill" onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        {valueText}
      </button>
      {open && (
        <div className="multiselect-panel">
          {options.map((o) => (
            <label key={o} className="multiselect-option">
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
