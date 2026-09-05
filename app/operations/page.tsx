import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { TrendChartCard } from '@/components/charts/TrendChartCard';
import { PieChartCard } from '@/components/charts/PieChartCard';
import { RankingList } from '@/components/RankingList';
import { ExpandCard } from '@/components/ExpandCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num } from '@/lib/bigquery';
import {
  VIEWS,
  TABLES,
  getFilterOptions,
  parseFilters,
  parseCompare,
  whereFor,
  inClause,
  type SearchParams,
} from '@/lib/queries';
import { buildSeries, buildTrendRows } from '@/lib/period';
import { fmtInt, fmtPct, fmtHours } from '@/lib/format';

export const dynamic = 'force-dynamic';

const seriesKey = (year: number | null) => (year != null ? String(year) : 'value');

type WeeklyRow = {
  logged_month: string | null;
  total_complaints: unknown;
  open_complaints: unknown;
  closed_complaints: unknown;
  property: string | null;
};

type AgeingRow = { logged_month: string | null; hours: unknown; n: unknown };

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const options = await getFilterOptions();
  const filters = parseFilters(searchParams);
  const compareOn = parseCompare(searchParams);

  const series = buildSeries(options.months, compareOn, options.years, filters.month);
  const currentYear = series[series.length - 1].year;
  const priorYear = series.length >= 2 ? series[series.length - 2].year : null;
  const scopeLabel = currentYear != null ? String(currentYear) : 'All time';

  const propWhere = whereFor(filters, { property: 'property' }, 'AND');
  const catWhere = whereFor(filters, { category: 'category' }, 'AND');
  const currentMonths = series.find((s) => s.year === currentYear)?.months ?? [];
  const imCurrent = inClause('logged_month', currentMonths, 'months');
  const mttrWhere = whereFor(filters, { property: 'property', category: 'category' });

  // Every query below is independent of every other — fire them all together
  // instead of one BigQuery round trip at a time (this was the main source of
  // page load being slow: ~10 sequential round trips became 1 parallel wave).
  const [complaintsBySeries, byProperty, escalation, ageingBySeries, worstCategories, mttrFull] =
    await Promise.all([
      // ---- per-series: complaints volume + open/closed, by month -------------
      Promise.all(
        series.map(async ({ year, months }) => {
          const im = inClause('logged_month', months, 'months');
          const { rows, error } = await safeQuery<WeeklyRow>(
            `SELECT logged_month,
                    SUM(total_complaints) AS total_complaints,
                    SUM(open_complaints)  AS open_complaints,
                    SUM(closed_complaints) AS closed_complaints
             FROM \`${VIEWS.complaintsWeekly}\`
             ${im.clause} ${propWhere.clause} ${catWhere.clause}
             GROUP BY logged_month`,
            { ...im.params, ...propWhere.params, ...catWhere.params },
          );
          return { year, rows, error };
        }),
      ),

      // ---- current series: property breakdown --------------------------------
      safeQuery<{ property: string | null; n: unknown }>(
        `SELECT COALESCE(NULLIF(TRIM(property), ''), 'Unassigned') AS property, COUNT(*) AS n
         FROM \`${TABLES.tickets}\`
         ${imCurrent.clause} ${propWhere.clause} ${catWhere.clause}
         GROUP BY 1 ORDER BY n DESC`,
        { ...imCurrent.params, ...propWhere.params, ...catWhere.params },
      ),

      // ---- current series: escalation split -----------------------------------
      safeQuery<{ escalation_level: string | null; n: unknown }>(
        `SELECT escalation_level, COUNT(*) AS n
         FROM \`${TABLES.tickets}\`
         ${imCurrent.clause} ${propWhere.clause} ${catWhere.clause}
         GROUP BY 1`,
        { ...imCurrent.params, ...propWhere.params, ...catWhere.params },
      ),

      // ---- per-series: ageing trend (overall avg is derived from these rows,
      // weighted by count, instead of a second query) --------------------------
      Promise.all(
        series.map(async ({ year, months }) => {
          const im = inClause('logged_month', months, 'months');
          const { rows, error } = await safeQuery<AgeingRow>(
            `SELECT logged_month, AVG(ageing_minutes) / 60.0 AS hours, COUNT(ageing_minutes) AS n
             FROM \`${TABLES.tickets}\`
             WHERE status = 'Closed' AND ageing_minutes IS NOT NULL
             ${im.clause.replace(/^WHERE/, 'AND')} ${propWhere.clause} ${catWhere.clause}
             GROUP BY logged_month`,
            { ...im.params, ...propWhere.params, ...catWhere.params },
          );
          const weightedSum = rows.reduce((s, r) => s + num(r.hours) * num(r.n), 0);
          const weight = rows.reduce((s, r) => s + num(r.n), 0);
          return { year, trend: rows, error, overall: weight ? weightedSum / weight : null };
        }),
      ),

      // ---- current series: worst categories by ageing -------------------------
      safeQuery<{ category: string | null; hours: unknown }>(
        `SELECT category, AVG(ageing_minutes) / 60.0 AS hours
         FROM \`${TABLES.tickets}\`
         WHERE status = 'Closed' AND ageing_minutes IS NOT NULL
         ${imCurrent.clause.replace(/^WHERE/, 'AND')} ${propWhere.clause}
         GROUP BY category ORDER BY hours DESC LIMIT 8`,
        { ...imCurrent.params, ...propWhere.params },
      ),

      // ---- full MTTR by property × category (for the expand modal) ------------
      safeQuery<{ property: string | null; category: string | null; mttr_hours: unknown }>(
        `SELECT property, category, mttr_hours FROM \`${VIEWS.mttr}\` ${mttrWhere.clause} ORDER BY mttr_hours DESC`,
        mttrWhere.params,
      ),
    ]);

  // ---- aggregate helpers ------------------------------------------------------
  const sumField = (rows: WeeklyRow[], key: keyof WeeklyRow) => rows.reduce((s, r) => s + num(r[key]), 0);
  const findSeries = <T extends { year: number | null }>(list: T[], y: number | null): T | undefined =>
    list.find((r) => r.year === y);

  const curComplaints = findSeries(complaintsBySeries, currentYear);
  const priComplaints = compareOn ? findSeries(complaintsBySeries, priorYear) : undefined;
  const curTotal = curComplaints ? sumField(curComplaints.rows, 'total_complaints') : 0;
  const priTotal = priComplaints ? sumField(priComplaints.rows, 'total_complaints') : null;
  const curOpen = curComplaints ? sumField(curComplaints.rows, 'open_complaints') : 0;
  const priOpen = priComplaints ? sumField(priComplaints.rows, 'open_complaints') : null;
  const curClosed = curComplaints ? sumField(curComplaints.rows, 'closed_complaints') : 0;
  const priClosed = priComplaints ? sumField(priComplaints.rows, 'closed_complaints') : null;
  const curClosurePct = curTotal ? (curClosed * 100) / curTotal : null;
  const priClosurePct = priTotal && priClosed != null ? (priClosed * 100) / priTotal : null;

  const curAgeing = findSeries(ageingBySeries, currentYear);
  const priAgeing = compareOn ? findSeries(ageingBySeries, priorYear) : undefined;
  const curAvgHours = curAgeing?.overall ?? null;
  const priAvgHours = priAgeing?.overall ?? null;

  const anyError =
    complaintsBySeries.find((c) => c.error)?.error ??
    byProperty.error ??
    escalation.error ??
    ageingBySeries.find((a) => a.error)?.error ??
    null;

  // ---- trend chart data ---------------------------------------------------
  const complaintsTrend = buildTrendRows(
    complaintsBySeries,
    (r) => r.logged_month,
    (r) => num(r.total_complaints),
    compareOn,
  );
  const ageingTrend = buildTrendRows(
    ageingBySeries.map((s) => ({ year: s.year, rows: s.trend })),
    (r) => r.logged_month,
    (r) => Number(num(r.hours).toFixed(1)),
    compareOn,
  );

  const seriesColor = (i: number, total: number) => (i === total - 1 ? '#0f5b52' : '#8fb8b1');
  const chartSeries = series.map((s, i) => ({
    key: seriesKey(s.year),
    name: s.year != null ? String(s.year) : 'Value',
    color: seriesColor(i, series.length),
  }));

  return (
    <PageShell title="Operations" showCompare filters={['month', 'property', 'category']}>
      <KpiCard
        title="Total Complaints"
        value={fmtInt(curTotal)}
        span={3}
        error={anyError}
        compare={compareOn ? { current: curTotal, prior: priTotal, priorLabel: String(priorYear), priorValueText: fmtInt(priTotal) } : undefined}
        breakdown={byProperty.rows.slice(0, 6).map((r) => ({ label: r.property ?? '—', value: fmtInt(num(r.n)) }))}
      />
      <KpiCard
        title="Open Complaints"
        value={fmtInt(curOpen)}
        span={3}
        error={anyError}
        compare={compareOn ? { current: curOpen, prior: priOpen, priorLabel: String(priorYear), priorValueText: fmtInt(priOpen) } : undefined}
      />
      <KpiCard
        title="Closure %"
        value={fmtPct(curClosurePct)}
        sub={`${fmtInt(curClosed)} of ${fmtInt(curTotal)} closed`}
        span={3}
        error={anyError}
        compare={compareOn ? { current: curClosurePct ?? 0, prior: priClosurePct, priorLabel: String(priorYear), priorValueText: fmtPct(priClosurePct) } : undefined}
      />
      <KpiCard
        title="Avg Resolution Time"
        value={fmtHours(curAvgHours)}
        sub="Mean ageing, closed tickets"
        span={3}
        error={anyError}
        compare={compareOn ? { current: curAvgHours ?? 0, prior: priAvgHours, priorLabel: String(priorYear), priorValueText: fmtHours(priAvgHours) } : undefined}
      />

      <TrendChartCard
        title="Complaints Volume Trend"
        span={7}
        data={complaintsTrend}
        xKey="month"
        series={chartSeries}
        note={compareOn ? `${currentYear} vs ${priorYear} — same calendar months compared.` : 'Turn on "Compare to Last Year" to overlay year-over-year.'}
        error={anyError}
      />

      <PieChartCard
        title="Escalation Split"
        span={5}
        data={escalation.rows.map((r) => ({ level: r.escalation_level ?? '—', n: num(r.n) }))}
        nameKey="level"
        valueKey="n"
        centerValue={fmtInt(escalation.rows.reduce((s, r) => s + num(r.n), 0))}
        centerLabel="tickets"
        error={escalation.error}
        note={`L1/L2/L3 · ${scopeLabel}`}
      />

      <TrendChartCard
        title="Resolution Time Trend (hours)"
        span={7}
        variant="area"
        data={ageingTrend}
        xKey="month"
        series={chartSeries}
        unit="hours"
        error={anyError}
      />

      <RankingList
        title="Worst Ageing by Category"
        span={5}
        rows={worstCategories.rows.map((r) => ({ label: r.category ?? '—', value: Number(num(r.hours).toFixed(1)) }))}
        valueFormatter={(v) => `${v}h`}
        error={worstCategories.error}
        note={`Avg hours to close · ${scopeLabel}`}
      />

      <ExpandCard
        title="MTTR by Property × Category"
        span={12}
        note="Click ⤢ for the full breakdown across every property and category."
        detail={
          <DataTable
            title=""
            bare
            columns={[
              { key: 'property', label: 'Property' },
              { key: 'category', label: 'Category' },
              { key: 'mttr_hours', label: 'MTTR (h)', numeric: true, render: (r) => fmtHours(num(r.mttr_hours)) },
            ]}
            rows={mttrFull.rows}
          />
        }
      >
        <RankingList
          title=""
          bare
          rows={[...mttrFull.rows]
            .sort((a, b) => num(b.mttr_hours) - num(a.mttr_hours))
            .slice(0, 6)
            .map((r) => ({ label: `${r.property ?? '—'} · ${r.category ?? '—'}`, value: Number(num(r.mttr_hours).toFixed(1)) }))}
          valueFormatter={(v) => `${v}h`}
          error={mttrFull.error}
        />
      </ExpandCard>
    </PageShell>
  );
}
