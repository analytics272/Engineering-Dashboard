import { PageShell } from '@/components/PageShell';
import { DataTable } from '@/components/DataTable';
import { BarChartCard } from '@/components/charts/BarChartCard';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency, fmtInt } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const w = whereFor(filters, { property: 'property', category: 'category' });

  const res = await safeQuery<{
    property: string | null;
    category: string | null;
    asset_count: unknown;
    total_cost: unknown;
  }>(
    `SELECT property, category, asset_count, total_cost
     FROM \`${VIEWS.assetCategories}\`
     ${w.clause}
     ORDER BY total_cost DESC`,
    w.params,
  );

  const byCategory = new Map<string, number>();
  for (const r of res.rows) {
    const k = r.category ?? '—';
    byCategory.set(k, (byCategory.get(k) ?? 0) + num(r.asset_count));
  }

  return (
    <PageShell title="Asset Categories & Listing">
      <BarChartCard
        title="Asset Count by Category"
        span={12}
        horizontal
        height={Math.max(200, byCategory.size * 28)}
        data={[...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([category, count]) => ({ category, count }))}
        xKey="category"
        bars={[{ key: 'count', name: 'Assets' }]}
        error={res.error}
        note="AMC-linked assets only (Elevator, AC, Generator, Internet…) — not a full inventory. No internal owner field exists, only vendor_name."
      />

      <DataTable
        title="Asset Listing"
        span={12}
        error={res.error}
        columns={[
          { key: 'property', label: 'Property' },
          { key: 'category', label: 'Category' },
          {
            key: 'asset_count',
            label: 'Count',
            numeric: true,
            render: (r) => fmtInt(num(r.asset_count)),
          },
          {
            key: 'total_cost',
            label: 'Total AMC Cost / yr',
            numeric: true,
            render: (r) => fmtCurrency(num(r.total_cost)),
          },
        ]}
        rows={res.rows}
      />
    </PageShell>
  );
}
