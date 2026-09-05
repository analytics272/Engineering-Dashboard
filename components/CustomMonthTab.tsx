'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The 3rd segment of the Month tab-group — opens a floating panel with a
 * field + "Apply" button, matching the Skyla Sales dashboard's "Custom Range"
 * popover. Adapted to a single Month picker (not a From/To date range) since
 * the underlying data is monthly-grain, not daily — a fake day-level range
 * picker would imply precision the data doesn't have.
 */
export function CustomMonthTab({
  months,
  value,
  active,
  onApply,
}: {
  months: string[];
  value: string;
  active: boolean;
  onApply: (month: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(active ? value : months[months.length - 1] ?? '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="custom-tab" ref={ref}>
      <button
        type="button"
        className={active ? 'tab tab-active' : 'tab'}
        onClick={() => {
          setDraft(active ? value : months[months.length - 1] ?? '');
          setOpen((o) => !o);
        }}
      >
        {active ? value : 'Custom Month…'}
      </button>
      {open && (
        <div className="custom-panel">
          <label className="custom-field">
            <span>Month</span>
            <select value={draft} onChange={(e) => setDraft(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="custom-apply"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
