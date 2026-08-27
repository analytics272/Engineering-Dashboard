import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { PieChartCard } from '@/components/charts/PieChartCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num } from '@/lib/bigquery';
import { TABLES, type SearchParams } from '@/lib/queries';
import { fmtCurrency, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BudgetPage(_: { searchParams: SearchParams }) {
  const totals = await safeQuery<{
    budget_amount: unknown;
    actual_amount: unknown;
    total_amount: unknown;
  }>(
    `SELECT
       SUM(IF(LOWER(category) LIKE '%budget%' OR LOWER(subcategory) LIKE '%budget%', amount, 0)) AS budget_amount,
       SUM(IF(LOWER(category) LIKE '%actual%' OR LOWER(subcategory) LIKE '%actual%', amount, 0)) AS actual_amount,
       SUM(amount) AS total_amount
     FROM \`${TABLES.looker}\``,
  );

  const byQuarter = await safeQuery<{ quarter: string | null; amount: unknown }>(
    `SELECT quarter, SUM(amount) AS amount
     FROM \`${TABLES.looker}\`
     GROUP BY quarter
     ORDER BY quarter`,
  );

  const byCategory = await safeQuery<{ category: string | null; amount: unknown }>(
    `SELECT category, SUM(amount) AS amount
     FROM \`${TABLES.looker}\`
     GROUP BY category
     ORDER BY amount DESC`,
  );

  const t = totals.rows[0] ?? {};
  const budget = num(t.budget_amount);
  const actual = num(t.actual_amount);
  const total = num(t.total_amount);
  const split = budget > 0 && actual > 0;

  return (
    <PageShell title="Budget">
      {split ? (
        <>
          <KpiCard title="Total Budget" value={fmtCurrency(budget)} span={4} error={totals.error} />
          <KpiCard title="Actual Spend" value={fmtCurrency(actual)} span={4} error={totals.error} />
          <KpiCard
            title="% Consumed"
            value={fmtPct((actual * 100) / budget)}
            span={4}
            error={totals.error}
          />
        </>
      ) : (
        <>
          <KpiCard
            title="Total Amount (Looker feed)"
            value={fmtCurrency(total)}
            sub="SUM(amount) across raw_eng_looker_data"
            span={6}
            error={totals.error}
            note="No explicit budget-vs-actual split found in the feed (no 'budget'/'actual' category tags). Showing the total; wire the 3 KPIs once the feed distinguishes them."
          />
          <KpiCard
            title="Quarters covered"
            value={String(byQuarter.rows.filter((r) => r.quarter).length)}
            sub="distinct quarters in feed"
            span={6}
            error={byQuarter.error}
          />
        </>
      )}

      <PieChartCard
        title="Quarter Breakdown"
        span={5}
        data={byQuarter.rows
          .filter((r) => r.quarter)
          .map((r) => ({ quarter: r.quarter as string, amount: num(r.amount) }))}
        nameKey="quarter"
        valueKey="amount"
        error={byQuarter.error}
      />

      <DataTable
        title="Spend by Category"
        span={7}
        error={byCategory.error}
        columns={[
          { key: 'category', label: 'Category' },
          {
            key: 'amount',
            label: 'Amount',
            numeric: true,
            render: (r) => fmtCurrency(num(r.amount)),
          },
        ]}
        rows={byCategory.rows}
      />
    </PageShell>
  );
}
