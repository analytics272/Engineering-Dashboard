import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { TrendChartCard } from '@/components/charts/TrendChartCard';
import { PieChartCard } from '@/components/charts/PieChartCard';
import { RankingList } from '@/components/RankingList';
import { ExpandCard } from '@/components/ExpandCard';
import { HeatTable, type HeatRow } from '@/components/HeatTable';
import { safeQuery, num } from '@/lib/bigquery';
import {
  TABLES,
  getFilterOptions,
  parseFilters,
  parseCompare,
  whereFor,
  inClause,
  type SearchParams,
} from '@/lib/queries';
import { buildSeries, buildTrendRows } from '@/lib/period';
import { fmtCurrency, monthKey } from '@/lib/format';

export const dynamic = 'force-dynamic';

const seriesKey = (year: number | null) => (year != null ? String(year) : 'value');

type BillRow = { month: string | null; property: string | null; category: string | null; direct_category: string | null; cost: unknown };

export default async function CostsPage({ searchParams }: { searchParams: SearchParams }) {
  const options = await getFilterOptions();
  const filters = parseFilters(searchParams);
  const compareOn = parseCompare(searchParams);

  const series = buildSeries(options.billMonths, compareOn, options.years, filters.month);
  const currentYear = series[series.length - 1].year;
  const priorYear = series.length >= 2 ? series[series.length - 2].year : null;
  const scopeLabel = currentYear != null ? String(currentYear) : 'All time';

  const propWhere = whereFor(filters, { property: 'property' }, 'AND');
  const currentMonths = series.find((s) => s.year === currentYear)?.months ?? [];
  const imCurrent = inClause('month', currentMonths, 'months');

  // billsBySeries and lm (distinct looker months) don't depend on each other —
  // fire them together instead of one BigQuery round trip at a time.
  const [billsBySeries, lm] = await Promise.all([
    // ---- per-series: all bills, by month + category (drives every KPI/trend below) --
    Promise.all(
      series.map(async ({ year, months }) => {
        const im = inClause('month', months, 'months');
        const { rows, error } = await safeQuery<BillRow>(
          `SELECT month, property, category, direct_category, SUM(bill_value) AS cost
           FROM \`${TABLES.bills}\`
           ${im.clause} ${propWhere.clause}
           GROUP BY month, property, category, direct_category`,
          { ...im.params, ...propWhere.params },
        );
        return { year, rows, error };
      }),
    ),
    safeQuery<{ month: string | null }>(
      `SELECT DISTINCT month FROM \`${TABLES.looker}\` WHERE month IS NOT NULL`,
    ),
  ]);

  const anyError = billsBySeries.find((b) => b.error)?.error ?? null;
  const findSeries = <T extends { year: number | null }>(list: T[], y: number | null): T | undefined =>
    list.find((r) => r.year === y);
  const curBills = findSeries(billsBySeries, currentYear)?.rows ?? [];
  const priBills = compareOn ? findSeries(billsBySeries, priorYear)?.rows : undefined;

  const sumWhere = (rows: BillRow[], pred: (r: BillRow) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + num(r.cost), 0);
  const isEnergy = (r: BillRow) => r.direct_category === 'Electricity Charges' || r.direct_category === 'Water';

  const curEnergy = sumWhere(curBills, isEnergy);
  const priEnergy = priBills ? sumWhere(priBills, isEnergy) : null;
  const curTotal = sumWhere(curBills, () => true);
  const priTotal = priBills ? sumWhere(priBills, () => true) : null;

  // ---- trend: total bills cost, one line per series --------------------------
  const monthlyBillTotals = billsBySeries.map((s) => {
    const totals = new Map<string, number>();
    for (const r of s.rows) {
      if (!r.month) continue;
      totals.set(r.month, (totals.get(r.month) ?? 0) + num(r.cost));
    }
    return { year: s.year, rows: [...totals.entries()].map(([month, total]) => ({ month, total })) };
  });
  const costTrend = buildTrendRows(monthlyBillTotals, (r) => r.month, (r) => r.total, compareOn);

  // ---- current series: electricity vs water split -----------------------------
  const utilitySplit = [
    { name: 'Electricity', cost: sumWhere(curBills, (r) => r.direct_category === 'Electricity Charges') },
    { name: 'Water', cost: sumWhere(curBills, (r) => r.direct_category === 'Water') },
  ].filter((d) => d.cost > 0);

  // ---- current series: top cost categories ------------------------------------
  const categoryTotals = new Map<string, number>();
  for (const r of curBills) {
    const key = r.category?.trim() || 'Uncategorised';
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + num(r.cost));
  }
  const topCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // ---- current series: property x category heat matrix ------------------------
  const heatMonths = [...new Set(curBills.map((r) => r.month).filter(Boolean) as string[])].sort(
    (a, b) => monthKey(a) - monthKey(b),
  );
  const grid = new Map<string, HeatRow & { key: string }>();
  for (const r of curBills) {
    const property = r.property?.trim() || 'Unassigned';
    const category = r.category?.trim() || 'Uncategorised';
    const key = `${property}||${category}`;
    if (!grid.has(key)) grid.set(key, { key, label: property, sublabel: category, cells: new Map(), total: 0 });
    const g = grid.get(key)!;
    if (r.month) {
      const v = (g.cells.get(r.month) ?? 0) + num(r.cost);
      g.cells.set(r.month, v);
    }
  }
  const heatRows = [...grid.values()]
    .map((r) => ({ ...r, total: [...r.cells.values()].reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total !== 0)
    .sort((a, b) => b.total - a.total);
  const propertyTotals = new Map<string, number>();
  for (const r of heatRows) propertyTotals.set(r.label, (propertyTotals.get(r.label) ?? 0) + r.total);

  // ---- Budget (raw_eng_looker_data) — Quarter-filtered ------------------------
  const quarterWhere = whereFor(filters, { quarter: 'quarter' }, 'AND');
  const lookerSeries = buildSeries(lm.rows.map((r) => r.month), compareOn, options.years, filters.month);
  const lookerCurMonths = lookerSeries.find((s) => s.year === currentYear)?.months ?? [];
  const lookerPriMonths = compareOn ? lookerSeries.find((s) => s.year === priorYear)?.months ?? [] : [];

  const budgetFor = (months: string[]) => {
    const im = inClause('month', months, 'months');
    return safeQuery<{ amount: unknown }>(
      `SELECT SUM(amount) AS amount FROM \`${TABLES.looker}\` ${im.clause} ${quarterWhere.clause}`,
      { ...im.params, ...quarterWhere.params },
    );
  };
  const byQuarterIm = inClause('month', lookerCurMonths, 'months');

  const [budgetCur, budgetPri, byQuarter] = await Promise.all([
    budgetFor(lookerCurMonths),
    budgetFor(lookerPriMonths),
    safeQuery<{ quarter: string | null; amount: unknown }>(
      `SELECT quarter, SUM(amount) AS amount FROM \`${TABLES.looker}\` ${byQuarterIm.clause}
       AND quarter IS NOT NULL GROUP BY quarter ORDER BY quarter`,
      byQuarterIm.params,
    ),
  ]);
  const curBudget = num(budgetCur.rows[0]?.amount);
  const priBudget = compareOn ? num(budgetPri.rows[0]?.amount) : null;

  const seriesColor = (i: number, total: number) => (i === total - 1 ? '#0f5b52' : '#8fb8b1');
  const chartSeries = series.map((s, i) => ({
    key: seriesKey(s.year),
    name: s.year != null ? String(s.year) : 'Value',
    color: seriesColor(i, series.length),
  }));
  const scope = filters.quarter ? ` · ${filters.quarter}` : '';

  return (
    <PageShell title="Costs & Budget" showCompare filters={['month', 'property', 'quarter']}>
      <KpiCard
        title="Energy Cost (Elec + Water)"
        value={fmtCurrency(curEnergy)}
        span={3}
        error={anyError}
        compare={compareOn ? { current: curEnergy, prior: priEnergy, priorLabel: String(priorYear), priorValueText: fmtCurrency(priEnergy) } : undefined}
      />
      <KpiCard
        title="Total Bills Cost"
        value={fmtCurrency(curTotal)}
        sub="All categories, all properties"
        span={3}
        error={anyError}
        compare={compareOn ? { current: curTotal, prior: priTotal, priorLabel: String(priorYear), priorValueText: fmtCurrency(priTotal) } : undefined}
        breakdown={[...propertyTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, v]) => ({ label, value: fmtCurrency(v) }))}
      />
      <KpiCard
        title="Energy Cost / Occupied Room"
        value={fmtCurrency(curEnergy)}
        sub="Shows total cost — sold_rooms is 0 for every row today"
        span={3}
        error={anyError}
        note="🚩 ECOR = energy_cost ÷ sold_rooms (spec §4.6). Will switch to the true per-room figure automatically once sold_rooms is populated."
      />
      <KpiCard
        title={`Budget Spend${scope}`}
        value={fmtCurrency(curBudget)}
        sub="raw_eng_looker_data, SUM(amount)"
        span={3}
        error={budgetCur.error}
        compare={compareOn ? { current: curBudget, prior: priBudget, priorLabel: String(priorYear), priorValueText: fmtCurrency(priBudget) } : undefined}
      />

      <TrendChartCard
        title="Total Bills Cost Trend"
        span={7}
        data={costTrend}
        xKey="month"
        series={chartSeries}
        unit="currency"
        error={anyError}
        note={compareOn ? `${currentYear} vs ${priorYear} — same calendar months compared.` : 'Turn on "Compare to Last Year" to overlay year-over-year.'}
      />

      <PieChartCard
        title="Electricity vs Water"
        span={5}
        data={utilitySplit.map((d) => ({ name: d.name, cost: d.cost }))}
        nameKey="name"
        valueKey="cost"
        centerValue={fmtCurrency(curEnergy)}
        centerLabel={scopeLabel}
        error={anyError}
      />

      <RankingList
        title="Top Cost Categories"
        span={5}
        rows={topCategories.map(([label, value]) => ({ label, value }))}
        valueFormatter={(v) => fmtCurrency(v)}
        error={anyError}
        note={`raw_eng_bills · ${scopeLabel}`}
      />

      <PieChartCard
        title="Budget: Quarter Breakdown"
        span={7}
        data={byQuarter.rows.map((r) => ({ quarter: r.quarter as string, amount: num(r.amount) }))}
        nameKey="quarter"
        valueKey="amount"
        centerValue={fmtCurrency(curBudget)}
        centerLabel={scopeLabel}
        error={byQuarter.error}
        note="Ignores the Quarter filter by design — shows every quarter for the current period."
      />

      <ExpandCard
        title="Property × Category Cost Matrix"
        span={12}
        note="Heatmap-shaded by cost. Click ⤢ for the full month-by-month matrix."
        detail={
          <HeatTable title="" bare columns={heatMonths} rows={heatRows} valueFormatter={(v) => fmtCurrency(v)} />
        }
      >
        <RankingList
          title=""
          bare
          rows={[...propertyTotals.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))}
          valueFormatter={(v) => fmtCurrency(v)}
          note={`${scopeLabel} totals by property — expand for the property × category × month breakdown.`}
        />
      </ExpandCard>
    </PageShell>
  );
}
