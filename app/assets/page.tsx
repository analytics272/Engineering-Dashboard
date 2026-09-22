import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { PieChartCard } from '@/components/charts/PieChartCard';
import { RankingList } from '@/components/RankingList';
import { ExpandCard } from '@/components/ExpandCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num, text } from '@/lib/bigquery';
import { VIEWS, TABLES, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency, fmtInt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_ORDER = ['Active', 'Closing Soon', 'Expired'];

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const propWhere = whereFor(filters, { property: 'property' });
  const propAnd = whereFor(filters, { property: 'property' }, 'AND');

  // All 7 are independent — fire them together instead of one at a time.
  const [status, costByType, avgCost, assetCategories, contracts, expiringSoon, expiryBuckets] = await Promise.all([
    safeQuery<{ amc_status: string | null; contract_count: unknown }>(
      `SELECT amc_status, contract_count FROM \`${VIEWS.amcStatus}\``,
    ),
    safeQuery<{ asset_type: string | null; total_yearly_cost: unknown }>(
      `SELECT asset_type, total_yearly_cost FROM \`${VIEWS.amcCostByType}\` ORDER BY total_yearly_cost DESC`,
    ),
    safeQuery<{ property: string | null; avg_yearly_cost: unknown }>(
      `SELECT property, avg_yearly_cost FROM \`${VIEWS.amcAvgCost}\` ${propWhere.clause} ORDER BY avg_yearly_cost DESC`,
      propWhere.params,
    ),
    safeQuery<{ property: string | null; category: string | null; asset_count: unknown; total_cost: unknown }>(
      `SELECT property, category, asset_count, total_cost FROM \`${VIEWS.assetCategories}\` ${propWhere.clause} ORDER BY total_cost DESC`,
      propWhere.params,
    ),
    safeQuery<Record<string, unknown>>(
      `SELECT type, asset_name, property, vendor_name, start_date, end_date, yearly_cost, per_month_cost, status, remarks
       FROM \`${TABLES.amcs}\` ${propWhere.clause} ORDER BY end_date`,
      propWhere.params,
    ),
    safeQuery<{ asset_name: string | null; property: string | null; end_date: unknown; days_left: unknown }>(
      `SELECT asset_name, property, end_date, DATE_DIFF(end_date, CURRENT_DATE(), DAY) AS days_left
       FROM \`${TABLES.amcs}\`
       WHERE end_date IS NOT NULL AND end_date >= CURRENT_DATE() ${propAnd.clause}
       ORDER BY end_date LIMIT 8`,
      propAnd.params,
    ),
    safeQuery<{ bucket: string; n: unknown }>(
      `SELECT
         CASE
           WHEN end_date IS NULL THEN 'Unknown'
           WHEN end_date < CURRENT_DATE() THEN 'Expired'
           WHEN DATE_DIFF(end_date, CURRENT_DATE(), DAY) <= 30 THEN '≤ 30 days'
           WHEN DATE_DIFF(end_date, CURRENT_DATE(), DAY) <= 90 THEN '31–90 days'
           ELSE '90+ days'
         END AS bucket,
         COUNT(*) AS n
       FROM \`${TABLES.amcs}\`
       ${propAnd.clause.replace(/^AND/, 'WHERE')}
       GROUP BY bucket`,
      propAnd.params,
    ),
  ]);

  const BUCKET_ORDER = ['Expired', '≤ 30 days', '31–90 days', '90+ days', 'Unknown'];
  const BUCKET_COLOR: Record<string, string> = {
    Expired: '#cf4b3f',
    '≤ 30 days': '#cf4b3f',
    '31–90 days': '#c9821f',
    '90+ days': '#0f5b52',
    Unknown: '#83938f',
  };
  const bucketRows = BUCKET_ORDER.map((bucket) => ({
    label: bucket,
    value: num(expiryBuckets.rows.find((r) => r.bucket === bucket)?.n),
    barColor: BUCKET_COLOR[bucket],
  })).filter((r) => r.value > 0);

  const statusVal = (name: string) => num(status.rows.find((r) => r.amc_status === name)?.contract_count);
  const yearlyVals = avgCost.rows.map((r) => num(r.avg_yearly_cost)).filter((n) => n > 0);
  const overallAvg = yearlyVals.length ? yearlyVals.reduce((a, b) => a + b, 0) / yearlyVals.length : null;

  const byCategory = new Map<string, number>();
  for (const r of assetCategories.rows) {
    const k = r.category ?? '—';
    byCategory.set(k, (byCategory.get(k) ?? 0) + num(r.asset_count));
  }

  return (
    <PageShell title="Assets & Contracts" filters={['property']}>
      {STATUS_ORDER.map((s) => (
        <KpiCard key={s} title={s} value={fmtInt(statusVal(s))} sub="AMC contracts" span={3} error={status.error} />
      ))}
      <KpiCard
        title="Avg AMC Cost / yr"
        value={fmtCurrency(overallAvg)}
        sub="Mean across properties"
        span={3}
        error={avgCost.error}
        breakdown={avgCost.rows.map((r) => ({ label: r.property ?? '—', value: num(r.avg_yearly_cost), display: fmtCurrency(num(r.avg_yearly_cost)) }))}
      />

      <PieChartCard
        title="Yearly Cost by Asset Type"
        span={5}
        data={costByType.rows.map((r) => ({ asset_type: r.asset_type ?? '—', cost: num(r.total_yearly_cost) }))}
        nameKey="asset_type"
        valueKey="cost"
        centerValue={fmtCurrency(costByType.rows.reduce((s, r) => s + num(r.total_yearly_cost), 0))}
        centerLabel="per year"
        error={costByType.error}
      />

      <RankingList
        title="Asset Count by Category"
        span={7}
        rows={[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))}
        valueFormatter={(v) => fmtInt(v)}
        error={assetCategories.error}
        note="AMC-linked assets only (Elevator, AC, Generator, Internet…) — not a full inventory. No internal owner field exists, only vendor_name."
      />

      <RankingList
        title="Expiring Soonest"
        span={5}
        error={expiringSoon.error}
        rows={expiringSoon.rows.map((r) => {
          const days = num(r.days_left);
          const urgency = Math.max(4, 180 - Math.min(days, 180));
          return {
            label: `${text(r.asset_name)} · ${text(r.property)}`,
            value: urgency,
            display: days <= 0 ? 'today' : `in ${days}d`,
            barColor: days <= 30 ? '#cf4b3f' : days <= 90 ? '#c9821f' : '#0f5b52',
          };
        })}
        note={expiringSoon.rows.length ? 'Bar length = urgency (shorter time left = fuller bar); red ≤30d, amber ≤90d.' : 'Nothing due, or end_date is missing on these rows.'}
      />

      <ExpandCard
        title="Asset Listing (by Property × Category)"
        span={7}
        note="Click ⤢ to see every property/category row with cost."
        detail={
          <DataTable
            title=""
            bare
            columns={[
              { key: 'property', label: 'Property' },
              { key: 'category', label: 'Category' },
              { key: 'asset_count', label: 'Count', numeric: true, render: (r) => fmtInt(num(r.asset_count)) },
              { key: 'total_cost', label: 'Total AMC Cost / yr', numeric: true, render: (r) => fmtCurrency(num(r.total_cost)) },
            ]}
            rows={assetCategories.rows}
          />
        }
      >
        <RankingList
          title=""
          bare
          rows={assetCategories.rows.slice(0, 6).map((r) => ({ label: `${r.property ?? '—'} · ${r.category ?? '—'}`, value: num(r.total_cost) }))}
          valueFormatter={(v) => fmtCurrency(v)}
        />
      </ExpandCard>

      <ExpandCard
        title="AMC Status — all contracts"
        span={5}
        note="status column is manually typed in the sheet — the KPIs above compute Active/Expired from end_date instead."
        detail={
          <DataTable
            title=""
            bare
            columns={[
              { key: 'type', label: 'Type' },
              { key: 'asset_name', label: 'Asset' },
              { key: 'property', label: 'Property' },
              { key: 'vendor_name', label: 'Vendor' },
              { key: 'end_date', label: 'Ends' },
              { key: 'yearly_cost', label: 'Yearly', numeric: true, render: (r) => fmtCurrency(num(r.yearly_cost)) },
              { key: 'status', label: 'Sheet status' },
            ]}
            rows={contracts.rows}
          />
        }
      >
        <div className="muted" style={{ marginBottom: 8 }}>
          {contracts.rows.length} contracts on file, by time to expiry. Click ⤢ for the full table.
        </div>
        <RankingList title="" bare rows={bucketRows} valueFormatter={(v) => fmtInt(v)} error={expiryBuckets.error} />
      </ExpandCard>
    </PageShell>
  );
}
