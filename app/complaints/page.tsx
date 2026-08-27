import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { BarChartCard } from '@/components/charts/BarChartCard';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtInt, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

type ByProp = {
  property: string | null;
  total_complaints: unknown;
  open_complaints: unknown;
  closed_complaints: unknown;
};

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = parseFilters(searchParams);
  const w = whereFor(filters, { property: 'property', month: 'logged_month' });

  const byProp = await safeQuery<ByProp>(
    `SELECT COALESCE(NULLIF(TRIM(property), ''), 'Unassigned') AS property,
            SUM(total_complaints)  AS total_complaints,
            SUM(open_complaints)   AS open_complaints,
            SUM(closed_complaints) AS closed_complaints
     FROM \`${VIEWS.complaintsWeekly}\`
     ${w.clause}
     GROUP BY 1
     ORDER BY total_complaints DESC`,
    w.params,
  );

  const esc = await safeQuery<{ escalation_level: string | null; ticket_count: unknown; pct: unknown }>(
    `SELECT escalation_level, ticket_count, pct
     FROM \`${VIEWS.escalationSummary}\`
     ORDER BY escalation_level`,
  );

  const mom = await safeQuery<{
    month_number: unknown;
    logged_month: string | null;
    property: string | null;
    total_complaints: unknown;
  }>(
    `SELECT month_number, logged_month, property, SUM(total_complaints) AS total_complaints
     FROM \`${VIEWS.complaintsWeekly}\`
     ${w.clause}
     GROUP BY month_number, logged_month, property
     ORDER BY month_number`,
    w.params,
  );

  // --- KPI aggregates + per-property breakdown ---
  const rows = byProp.rows;
  const total = rows.reduce((s, r) => s + num(r.total_complaints), 0);
  const open = rows.reduce((s, r) => s + num(r.open_complaints), 0);
  const closed = rows.reduce((s, r) => s + num(r.closed_complaints), 0);
  const closurePct = total ? (closed * 100) / total : null;

  const propList = rows.map((r) => ({ label: r.property ?? '—', ...r }));

  // --- MoM pivot: one row per month, a column per property ---
  const properties = [...new Set(mom.rows.map((r) => r.property).filter(Boolean))] as string[];
  const monthMap = new Map<string, Record<string, unknown>>();
  for (const r of mom.rows) {
    const label = r.logged_month ?? String(r.month_number ?? '');
    if (!monthMap.has(label)) monthMap.set(label, { month: label, _n: num(r.month_number) });
    monthMap.get(label)![r.property ?? '—'] = num(r.total_complaints);
  }
  const momData = [...monthMap.values()].sort((a, b) => num(a._n) - num(b._n));

  return (
    <PageShell title="Complaints">
      <KpiCard
        title="Total Complaints Raised"
        value={fmtInt(total)}
        span={4}
        error={byProp.error}
        breakdown={propList.map((r) => ({ label: r.label, value: fmtInt(num(r.total_complaints)) }))}
      />
      <KpiCard
        title="Open Complaints"
        value={fmtInt(open)}
        span={4}
        error={byProp.error}
        breakdown={propList.map((r) => ({ label: r.label, value: fmtInt(num(r.open_complaints)) }))}
      />
      <KpiCard
        title="Closure %"
        value={fmtPct(closurePct)}
        sub={`${fmtInt(closed)} of ${fmtInt(total)} closed`}
        span={4}
        error={byProp.error}
        breakdown={propList.map((r) => {
          const t = num(r.total_complaints);
          const c = num(r.closed_complaints);
          return { label: r.label, value: fmtPct(t ? (c * 100) / t : null) };
        })}
      />

      <BarChartCard
        title="Escalation Split (L1 / L2 / L3)"
        span={4}
        horizontal
        height={220}
        data={esc.rows.map((r) => ({
          escalation_level: r.escalation_level ?? '—',
          tickets: num(r.ticket_count),
        }))}
        xKey="escalation_level"
        bars={[{ key: 'tickets', name: 'Tickets' }]}
        error={esc.error}
      />

      <BarChartCard
        title="Month-on-Month Complaints (by property)"
        span={8}
        data={momData as Record<string, unknown>[]}
        xKey="month"
        bars={properties.map((p) => ({ key: p, name: p }))}
        stacked
        error={mom.error}
        note="Series = property. Grouped by month_number from v_complaints_weekly."
      />
    </PageShell>
  );
}
