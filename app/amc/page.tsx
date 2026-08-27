import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { PieChartCard } from '@/components/charts/PieChartCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, TABLES, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency, fmtInt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_ORDER = ['Active', 'Closing Soon', 'Expired'];

export default async function AmcPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const propWhere = whereFor(filters, { property: 'property' });

  const status = await safeQuery<{ amc_status: string | null; contract_count: unknown }>(
    `SELECT amc_status, contract_count FROM \`${VIEWS.amcStatus}\``,
  );
  const costByType = await safeQuery<{ asset_type: string | null; total_yearly_cost: unknown }>(
    `SELECT asset_type, total_yearly_cost
     FROM \`${VIEWS.amcCostByType}\`
     ORDER BY total_yearly_cost DESC`,
  );
  const avgCost = await safeQuery<{
    property: string | null;
    avg_yearly_cost: unknown;
    avg_monthly_cost: unknown;
  }>(
    `SELECT property, avg_yearly_cost, avg_monthly_cost
     FROM \`${VIEWS.amcAvgCost}\`
     ${propWhere.clause}
     ORDER BY avg_yearly_cost DESC`,
    propWhere.params,
  );
  const contracts = await safeQuery<Record<string, unknown>>(
    `SELECT type, asset_name, property, vendor_name, start_date, end_date,
            yearly_cost, per_month_cost, status, remarks
     FROM \`${TABLES.amcs}\`
     ${propWhere.clause}
     ORDER BY end_date`,
    propWhere.params,
  );

  const statusVal = (name: string) =>
    num(status.rows.find((r) => r.amc_status === name)?.contract_count);

  const yearlyVals = avgCost.rows.map((r) => num(r.avg_yearly_cost)).filter((n) => n > 0);
  const overallAvg = yearlyVals.length
    ? yearlyVals.reduce((a, b) => a + b, 0) / yearlyVals.length
    : null;

  return (
    <PageShell title="AMC">
      {STATUS_ORDER.map((s) => (
        <KpiCard
          key={s}
          title={s}
          value={fmtInt(statusVal(s))}
          sub="contracts"
          span={3}
          error={status.error}
        />
      ))}
      <KpiCard
        title="Avg AMC Cost / yr"
        value={fmtCurrency(overallAvg)}
        sub="Mean across properties"
        span={3}
        error={avgCost.error}
        breakdown={avgCost.rows.map((r) => ({
          label: r.property ?? '—',
          value: fmtCurrency(num(r.avg_yearly_cost)),
        }))}
      />

      <PieChartCard
        title="Yearly Cost by Asset Type"
        span={5}
        data={costByType.rows.map((r) => ({
          asset_type: r.asset_type ?? '—',
          cost: num(r.total_yearly_cost),
        }))}
        nameKey="asset_type"
        valueKey="cost"
        error={costByType.error}
      />

      <DataTable
        title="AMC Status"
        span={7}
        error={contracts.error}
        note="status column is manually typed in the sheet — the Active/Expired KPIs above compute from end_date instead."
        columns={[
          { key: 'type', label: 'Type' },
          { key: 'asset_name', label: 'Asset' },
          { key: 'property', label: 'Property' },
          { key: 'vendor_name', label: 'Vendor' },
          { key: 'end_date', label: 'Ends' },
          {
            key: 'yearly_cost',
            label: 'Yearly',
            numeric: true,
            render: (r) => fmtCurrency(num(r.yearly_cost)),
          },
          { key: 'status', label: 'Sheet status' },
        ]}
        rows={contracts.rows}
      />
    </PageShell>
  );
}
