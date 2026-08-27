'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PALETTE, tooltipStyle } from './palette';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export function PieChartCard({
  title,
  data,
  nameKey,
  valueKey,
  span = 4,
  height = 280,
  note,
  error,
}: {
  title: string;
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  span?: Span;
  height?: number;
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
        <div className="chart-box" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius="78%"
                stroke="#161b22"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {note && !error && <div className="card-note">{note}</div>}
    </section>
  );
}
