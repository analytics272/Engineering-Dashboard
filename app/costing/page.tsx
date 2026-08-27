import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { safeQuery, num } from '@/lib/bigquery';
import { TABLES, parseFilters, whereFor, type SearchParams } from '@/lib/queries';
import { fmtCurrency } from '@/lib/format';

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
    month_number: unknown;
    cost: unknown;
  }>(
    `SELECT property, category, month, month_number, SUM(bill_value) AS cost
     FROM \`${TABLES.bills}\`
     ${w.clause}
     GROUP BY property, category, month, month_number
     ORDER BY property, category`,
    w.params,
  );

  // ordered unique month list
  const monthSeen = new Map<string, number>();
  for (const r of res.rows) {
    if (r.month) monthSeen.set(r.month, num(r.month_number));
  }
  const months = [...monthSeen.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);

  // property|category -> { month -> cost }
  const grid = new Map<string, { property: string; category: string; cells: Map<string, number> }>();
  for (const r of res.rows) {
    const key = `${r.property ?? '—'}||${r.category ?? '—'}`;
    if (!grid.has(key)) {
      grid.set(key, {
        property: r.property ?? '—',
        category: r.category ?? '—',
        cells: new Map(),
      });
    }
    if (r.month) grid.get(key)!.cells.set(r.month, num(r.cost));
  }
  const gridRows = [...grid.values()].sort(
    (a, b) => a.property.localeCompare(b.property) || a.category.localeCompare(b.category),
  );

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
                {gridRows.map((row) => {
                  const total = [...row.cells.values()].reduce((a, b) => a + b, 0);
                  return (
                    <tr key={`${row.property}-${row.category}`}>
                      <td>{row.property}</td>
                      <td>{row.category}</td>
                      {months.map((m) => (
                        <td key={m} className="num">
                          {row.cells.has(m) ? fmtCurrency(row.cells.get(m)!) : '—'}
                        </td>
                      ))}
                      <td className="num">{fmtCurrency(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-note">Source: raw_eng_bills, SUM(bill_value) grouped by property + category + month.</div>
      </Card>
    </PageShell>
  );
}
