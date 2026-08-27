import { Suspense } from 'react';
import { Nav } from './Nav';
import { Filters } from './Filters';
import { getFilterOptions } from '@/lib/queries';

export async function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const options = await getFilterOptions();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          Skyla Collective
          <span>Engineering Ops</span>
        </div>
        <Nav />
      </aside>

      <main className="content">
        <div className="topbar">
          <h1>{title}</h1>
          <Suspense fallback={<div className="muted">Loading filters…</div>}>
            <Filters {...options} />
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
