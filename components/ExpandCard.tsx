'use client';

import { useEffect, useState } from 'react';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

/**
 * Wraps a compact widget with an expand affordance. Clicking it opens the
 * `detail` view (a bigger chart, a full table, …) in an overlay — progressive
 * disclosure instead of a second page.
 */
export function ExpandCard({
  title,
  span = 12,
  note,
  children,
  detail,
}: {
  title: string;
  span?: Span;
  note?: string;
  children: React.ReactNode;
  detail: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className={`card span-${span}`}>
      <div className="card-head">
        <h3>{title}</h3>
        <button type="button" className="expand-btn" onClick={() => setOpen(true)} aria-label={`Expand ${title}`}>
          ⤢
        </button>
      </div>
      {children}
      {note && <div className="card-note">{note}</div>}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{title}</h3>
              <button type="button" className="expand-btn" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modal-body">{detail}</div>
          </div>
        </div>
      )}
    </section>
  );
}
