import { Card } from './Card';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export type HeatRow = {
  label: string;
  sublabel?: string;
  cells: Map<string, number>;
  total: number;
};

/** Property × Category × Month cost matrix, shaded by value — a heatmap-style table. */
export function HeatTable({
  title,
  columns,
  rows,
  span = 12,
  note,
  error,
  valueFormatter = (v) => String(v),
  bare = false,
}: {
  title: string;
  columns: string[];
  rows: HeatRow[];
  span?: Span;
  note?: string;
  error?: string | null;
  valueFormatter?: (v: number) => string;
  bare?: boolean;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [...r.cells.values()]));

  const shade = (v: number) => {
    const t = Math.min(1, v / max);
    // teal heat scale: near-white at 0 -> brand teal at max
    const alpha = 0.06 + t * 0.55;
    return `rgba(15, 91, 82, ${alpha.toFixed(3)})`;
  };

  return (
    <Card title={title} span={span} note={note} error={error} bare={bare}>
      {rows.length === 0 ? (
        <div className="muted">No data for the current filters.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl heat-tbl">
            <thead>
              <tr>
                <th>Property / Category</th>
                {columns.map((c) => (
                  <th key={c} className="num">
                    {c}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.label}-${row.sublabel ?? ''}`}>
                  <td>
                    {row.label}
                    {row.sublabel && <span className="heat-sub"> · {row.sublabel}</span>}
                  </td>
                  {columns.map((c) => {
                    const v = row.cells.get(c);
                    return (
                      <td key={c} className="num heat-cell" style={v ? { background: shade(v) } : undefined}>
                        {v ? valueFormatter(v) : '—'}
                      </td>
                    );
                  })}
                  <td className="num">
                    <strong>{valueFormatter(row.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
