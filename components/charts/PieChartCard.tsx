'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PALETTE, tooltipStyle } from './palette';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

/** Donut chart with an optional centre total — the Google-Analytics-style split. */
export function PieChartCard({
  title,
  data,
  nameKey,
  valueKey,
  span = 4,
  height = 260,
  centerLabel,
  centerValue,
  note,
  error,
}: {
  title: string;
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  span?: Span;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  note?: string;
  error?: string | null;
}) {
  return (
    <section className={`card span-${span}`}>
      <h3>{title}</h3>
      {error ? (
        <div className="inline-error">{error}</div>
      ) : data.length === 0 ? (
        <div className="muted">No data for the current filters.</div>
      ) : (
        <div className="chart-box donut-box" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={1.5}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
            </PieChart>
          </ResponsiveContainer>
          {centerValue && (
            <div className="donut-center">
              <div className="donut-center-value">{centerValue}</div>
              {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
            </div>
          )}
        </div>
      )}
      {note && !error && <div className="card-note">{note}</div>}
    </section>
  );
}
