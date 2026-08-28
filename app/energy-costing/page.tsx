import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { BarChartCard } from '@/components/charts/BarChartCard';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, TABLES, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency, monthKey } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function EnergyCostingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = parseFilters(searchParams);
  const ecorWhere = whereFor(filters, { property: 'property', month: 'month' });
  const billsWhere = whereFor(
    filters,
    { property: 'property', month: 'month' },
    'AND',
  );

  const ecor = await safeQuery<{
    property: string | null;
    energy_cost: unknown;
    ecor: unknown;
  }>(
    `SELECT property, SUM(energy_cost) AS energy_cost, AVG(ecor) AS ecor
     FROM \`${VIEWS.ecor}\`
     ${ecorWhere.clause}
     GROUP BY property
     ORDER BY energy_cost DESC`,
    ecorWhere.params,
  );

  const mom = await safeQuery<{
    month: string | null;
    direct_category: string | null;
    cost: unknown;
  }>(
    `SELECT month, direct_category, SUM(bill_value) AS cost
     FROM \`${TABLES.bills}\`
     WHERE direct_category IN ('Electricity Charges', 'Water')
     ${billsWhere.clause}
     GROUP BY month, direct_category`,
    billsWhere.params,
  );

  const totalCost = ecor.rows.reduce((s, r) => s + num(r.energy_cost), 0);
  const ecorVals = ecor.rows.map((r) => num(r.ecor)).filter((n) => n > 0);
  const avgEcor = ecorVals.length ? ecorVals.reduce((a, b) => a + b, 0) / ecorVals.length : null;

  // pivot: row per month, columns Electricity Charges / Water (ordered by parsed label)
  const byMonth = new Map<string, Record<string, unknown>>();
  for (const r of mom.rows) {
    if (!r.month) continue;
    if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
    byMonth.get(r.month)![r.direct_category ?? '—'] = num(r.cost);
  }
  const momData = [...byMonth.values()].sort(
    (a, b) => monthKey(a.month as string) - monthKey(b.month as string),
  );

  return (
    <PageShell title="Energy Costing">
      <KpiCard
        title="Energy Cost per Occupied Room"
        value={avgEcor ? fmtCurrency(avgEcor) : fmtCurrency(totalCost)}
        sub={
          avgEcor
            ? 'ECOR — avg across property/month'
            : 'Total Electricity + Water cost (ECOR pending sold_rooms data)'
        }
        span={4}
        error={ecor.error}
        note={
          avgEcor
            ? undefined
            : '🚩 raw_eng_bills.sold_rooms is 0 for every row — ECOR divides by zero. Shows total cost until that column is populated (no code change needed then).'
        }
        breakdown={ecor.rows.map((r) => ({
          label: r.property ?? '—',
          value: fmtCurrency(num(r.energy_cost)),
        }))}
      />

      <BarChartCard
        title="Month-on-Month Electricity vs Water Cost"
        span={8}
        data={momData as Record<string, unknown>[]}
        xKey="month"
        bars={[
          { key: 'Electricity Charges', name: 'Electricity' },
          { key: 'Water', name: 'Water' },
        ]}
        error={mom.error}
      />
    </PageShell>
  );
}
