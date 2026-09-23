import { Suspense } from 'react';
import { Nav } from './Nav';
import { Filters } from './Filters';
import { Logo } from './Logo';
import { getFilterOptions, DEFAULT_FILTERS, type FilterKey } from '@/lib/queries';

// syncAll runs every 2h but is incremental — it only advances synced_at when
// a row is new or edited, so on a quiet day (no sheet changes) the stamp can
// legitimately sit still for most of a day even though the trigger is firing
// fine. The nightly fullResyncNow (2-3 AM IST, Triggers.gs) is the real
// heartbeat: it rewrites every row regardless, so synced_at is guaranteed to
// move at least once every ~24h if the pipeline is healthy. Flag staleness
// only once that heartbeat itself is overdue, not on ordinary quiet hours.
const STALE_AFTER_HOURS = 30;

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
            title="Data last synced from the sheet (incremental sync every 2h, full resync nightly 2-3 AM IST)"
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
            ⚠ No new or edited rows have synced in {relativeAge(age!)}. This is usually normal —
            <code>syncAll</code> runs every 2h but only touches new/changed rows, so the stamp
            doesn&apos;t move on a quiet day, and the nightly full resync (2–3 AM IST) refreshes
            everything regardless. Only worth checking the Apps Script Executions log if this
            banner is still showing after that nightly run.
          </div>
        )}

        <div className="widgets">{children}</div>
      </main>
    </div>
  );
}
