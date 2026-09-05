import { Card } from './Card';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export function RankingList({
  title,
  rows,
  span = 4,
  note,
  error,
  valueFormatter = (v) => String(v),
  bare = false,
}: {
  title: string;
  rows: { label: string; value: number }[];
  span?: Span;
  note?: string;
  error?: string | null;
  valueFormatter?: (v: number) => string;
  bare?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));

  return (
    <Card title={title} span={span} note={note} error={error} bare={bare}>
      {rows.length === 0 ? (
        <div className="muted">No data for the current filters.</div>
      ) : (
        <div className="ranking">
          {rows.map((r, i) => (
            <div className="ranking-row" key={r.label}>
              <span className="ranking-rank">{i + 1}</span>
              <span className="ranking-label" title={r.label}>
                {r.label}
              </span>
              <span className="ranking-bar-track">
                <span
                  className="ranking-bar"
                  style={{ width: `${Math.max(4, (Math.abs(r.value) / max) * 100)}%` }}
                />
              </span>
              <span className="ranking-value">{valueFormatter(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
