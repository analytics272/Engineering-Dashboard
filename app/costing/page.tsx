import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { safeQuery, num } from '@/lib/bigquery';
import { TABLES, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency, monthKey } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CostingPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const w = whereFor(filters, {
    property: 'property',
    category: 'category',
    month: 'month',
  });

  const res = await safeQuery<{
    property: string | null;
    category: string | null;
    month: string | null;
    cost: unknown;
  }>(
    // month_number is NULL for every bills row, so it can't drive ordering.
    // Drop rows with no property AND no category (they render as an all-dash row).
    `SELECT property, category, month, SUM(bill_value) AS cost
     FROM \`${TABLES.bills}\`
     WHERE (COALESCE(TRIM(property), '') != '' OR COALESCE(TRIM(category), '') != '')
     ${w.clause.replace(/^WHERE/, 'AND')}
     GROUP BY property, category, month
     ORDER BY property, category`,
    w.params,
  );

  // ordered unique month list (parsed from the "MMM YY" label)
  const months = [...new Set(res.rows.map((r) => r.month).filter(Boolean) as string[])].sort(
    (a, b) => monthKey(a) - monthKey(b),
  );

  // property|category -> { month -> cost }
  const grid = new Map<string, { property: string; category: string; cells: Map<string, number> }>();
  for (const r of res.rows) {
    const property = r.property?.trim() || 'Unassigned';
    const category = r.category?.trim() || 'Uncategorised';
    const key = `${property}||${category}`;
    if (!grid.has(key)) grid.set(key, { property, category, cells: new Map() });
    if (r.month) grid.get(key)!.cells.set(r.month, num(r.cost));
  }
  const gridRows = [...grid.values()]
    .map((row) => ({ ...row, total: [...row.cells.values()].reduce((a, b) => a + b, 0) }))
    .filter((row) => row.total !== 0)
    .sort((a, b) => a.property.localeCompare(b.property) || a.category.localeCompare(b.category));

  return (
    <PageShell title="Costing">
      <Card title="Property × Category cost matrix (months as columns)" span={12} error={res.error}>
        {gridRows.length === 0 ? (
          <div className="muted">No bill rows for the current filters.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Category</th>
                  {months.map((m) => (
                    <th key={m} className="num">
                      {m}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {gridRows.map((row) => (
                  <tr key={`${row.property}-${row.category}`}>
                    <td>{row.property}</td>
                    <td>{row.category}</td>
                    {months.map((m) => (
                      <td key={m} className="num">
                        {row.cells.has(m) ? fmtCurrency(row.cells.get(m)!) : '—'}
                      </td>
                    ))}
                    <td className="num">{fmtCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-note">Source: raw_eng_bills, SUM(bill_value) grouped by property + category + month.</div>
      </Card>
    </PageShell>
  );
}
