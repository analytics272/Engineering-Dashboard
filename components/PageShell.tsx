import { Suspense } from 'react';
import { Nav } from './Nav';
import { Filters } from './Filters';
import { Logo } from './Logo';
import { getFilterOptions, DEFAULT_FILTERS, type FilterKey } from '@/lib/queries';

function freshness(iso: string | null): string {
  if (!iso) return 'Live';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Live';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
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
          <div className="sidebar-stamp" title="Data last synced from the sheet">
            Last Updated
            <span>{freshness(options.lastUpdated)}</span>
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

        <div className="widgets">{children}</div>
      </main>
    </div>
  );
}
