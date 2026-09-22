import { Suspense } from 'react';
import { Nav } from './Nav';
import { Filters } from './Filters';
import { Logo } from './Logo';
import { getFilterOptions, DEFAULT_FILTERS, type FilterKey } from '@/lib/queries';

// The Apps Script sync (Sync.gs) is meant to run every 2 hours. Past 3x that
// interval with no update, something's actually wrong upstream (trigger
// disabled, auth expired, quota hit) — worth a loud warning, not a quiet
// sidebar timestamp nobody notices until the numbers look wrong.
const STALE_AFTER_HOURS = 6;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / 3_600_000;
}

function relativeAge(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function freshness(iso: string | null): string {
  if (!iso) return 'Live';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Live';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function PageShell({
  title,
  children,
  filters = DEFAULT_FILTERS,
  showCompare = false,
}: {
  title: string;
  children: React.ReactNode;
  filters?: FilterKey[];
  /** Show the "Compare to Last Year" toggle in the filter bar. */
  showCompare?: boolean;
}) {
  const options = await getFilterOptions();
  const age = hoursSince(options.lastUpdated);
  const stale = age != null && age > STALE_AFTER_HOURS;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={30} className="brand-mark" />
          <div className="brand-text">
            Skyla Collective
            <span>Engineering Ops</span>
          </div>
        </div>
        <Nav />
        <div className="sidebar-footer">
          <div
            className={stale ? 'sidebar-stamp sidebar-stamp-stale' : 'sidebar-stamp'}
            title="Data last synced from the sheet (Apps Script runs every 2h)"
          >
            Last Updated
            <span>
              {freshness(options.lastUpdated)}
              {age != null && ` · ${relativeAge(age)}`}
            </span>
          </div>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <h1>{title}</h1>
          <Suspense fallback={<div className="muted">Loading filters…</div>}>
            <Filters {...options} show={filters} showCompare={showCompare} />
          </Suspense>
        </div>

        {options.error && (
          <div className="banner error">
            Couldn&apos;t reach BigQuery: {options.error}. Check{' '}
            <code>GOOGLE_SERVICE_ACCOUNT_KEY</code> and that the views in <code>sql/</code> exist.
          </div>
        )}

        {!options.error && stale && (
          <div className="banner warn">
            ⚠ Data last synced {relativeAge(age!)} (expected every ~2h) — the sheet may have
            changed since. The Apps Script <code>syncAll</code> trigger has likely stopped; check
            its Executions log in the Apps Script editor.
          </div>
        )}

        <div className="widgets">{children}</div>
      </main>
    </div>
  );
}
