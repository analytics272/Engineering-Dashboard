import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { BarChartCard } from '@/components/charts/BarChartCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtHours } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AgeingPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);

  const ageWhere = whereFor(filters, { category: 'category' });
  const resWhere = whereFor(filters, { property: 'property' });
  const mttrWhere = whereFor(filters, { property: 'property', category: 'category' });

  const ageing = await safeQuery<{ category: string | null; avg_ageing_hours: unknown }>(
    `SELECT category, avg_ageing_hours
     FROM \`${VIEWS.ageingByCategory}\`
     ${ageWhere.clause}
     ORDER BY avg_ageing_hours DESC`,
    ageWhere.params,
  );

  const resolution = await safeQuery<{ property: string | null; avg_resolution_hours: unknown }>(
    `SELECT property, avg_resolution_hours
     FROM \`${VIEWS.resolutionTime}\`
     ${resWhere.clause}
     ORDER BY avg_resolution_hours DESC`,
    resWhere.params,
  );

  const mttr = await safeQuery<{
    property: string | null;
    category: string | null;
    mttr_hours: unknown;
  }>(
    `SELECT property, category, mttr_hours
     FROM \`${VIEWS.mttr}\`
     ${mttrWhere.clause}
     ORDER BY mttr_hours DESC`,
    mttrWhere.params,
  );

  const resVals = resolution.rows.map((r) => num(r.avg_resolution_hours)).filter((n) => n > 0);
  const avgRes = resVals.length ? resVals.reduce((a, b) => a + b, 0) / resVals.length : null;

  const mttrVals = mttr.rows.map((r) => num(r.mttr_hours)).filter((n) => n > 0);
  const avgMttr = mttrVals.length ? mttrVals.reduce((a, b) => a + b, 0) / mttrVals.length : null;

  return (
    <PageShell title="Ageing">
      <KpiCard
        title="Avg Resolution Time"
        value={fmtHours(avgRes)}
        sub="Mean across properties (closed tickets)"
        span={4}
        error={resolution.error}
        breakdown={resolution.rows.map((r) => ({
          label: r.property ?? '—',
          value: fmtHours(num(r.avg_resolution_hours)),
        }))}
      />
      <KpiCard
        title="MTTR"
        value={fmtHours(avgMttr)}
        sub="Mean time to repair, across property × category"
        span={4}
        error={mttr.error}
      />

      <BarChartCard
        title="Category-wise Ageing (avg hours to close)"
        span={12}
        horizontal
        height={Math.max(220, ageing.rows.length * 26)}
        data={ageing.rows.map((r) => ({
          category: r.category ?? '—',
          hours: Number(num(r.avg_ageing_hours).toFixed(1)),
        }))}
        xKey="category"
        bars={[{ key: 'hours', name: 'Avg ageing (h)' }]}
        error={ageing.error}
      />

      <DataTable
        title="MTTR by Property × Category"
        span={12}
        error={mttr.error}
        columns={[
          { key: 'property', label: 'Property' },
          { key: 'category', label: 'Category' },
          {
            key: 'mttr_hours',
            label: 'MTTR (h)',
            numeric: true,
            render: (r) => fmtHours(num(r.mttr_hours)),
          },
        ]}
        rows={mttr.rows}
      />
    </PageShell>
  );
}
