import { Card } from './Card';
import { text } from '@/lib/bigquery';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export type Column<Row> = {
  key: keyof Row & string;
  label: string;
  numeric?: boolean;
  render?: (row: Row) => React.ReactNode;
};

export function DataTable<Row extends Record<string, unknown>>({
  title,
  columns,
  rows,
  span = 12,
  note,
  error,
  emptyText = 'No rows for the current filters.',
  bare = false,
}: {
  title: string;
  columns: Column<Row>[];
  rows: Row[];
  span?: Span;
  note?: string;
  error?: string | null;
  emptyText?: string;
  bare?: boolean;
}) {
  return (
    <Card title={title} span={span} note={note} error={error} bare={bare}>
      {rows.length === 0 ? (
        <div className="muted">{emptyText}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'num' : undefined}>
                      {c.render ? c.render(row) : text(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
