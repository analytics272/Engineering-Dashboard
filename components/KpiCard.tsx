import { Card } from './Card';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export function KpiCard({
  title,
  value,
  sub,
  span = 3,
  note,
  error,
  breakdown,
}: {
  title: string;
  value: string;
  sub?: string;
  span?: Span;
  note?: string;
  error?: string | null;
  breakdown?: { label: string; value: string }[];
}) {
  return (
    <Card title={title} span={span} note={note} error={error}>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {breakdown && breakdown.length > 0 && (
        <div className="kpi-breakdown">
          {breakdown.map((b) => (
            <div className="row" key={b.label}>
              <span>{b.label}</span>
              <span>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
