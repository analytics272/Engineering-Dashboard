import { Card } from './Card';
import { Delta } from './Delta';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export function KpiCard({
  title,
  value,
  sub,
  span = 3,
  note,
  error,
  breakdown,
  compare,
}: {
  title: string;
  value: string;
  sub?: string;
  span?: Span;
  note?: string;
  error?: string | null;
  breakdown?: { label: string; value: string }[];
  /** Year-over-year comparison — pass the raw current/prior numbers, not formatted strings. */
  compare?: { current: number; prior: number | null; priorLabel: string; priorValueText?: string };
}) {
  return (
    <Card title={title} span={span} note={note} error={error}>
      <div className="kpi-row">
        <div className="kpi-value">{value}</div>
        {compare && <Delta current={compare.current} prior={compare.prior} priorLabel={compare.priorLabel} />}
      </div>
      {compare?.prior != null && (
        <div className="kpi-sub">
          {compare.priorLabel}: {compare.priorValueText ?? compare.prior}
        </div>
      )}
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
