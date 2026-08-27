'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS, GRID, PALETTE, tooltipStyle } from './palette';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export type BarSpec = { key: string; name?: string; color?: string };

export function BarChartCard({
  title,
  data,
  xKey,
  bars,
  span = 6,
  height = 300,
  horizontal = false,
  stacked = false,
  note,
  error,
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: BarSpec[];
  span?: Span;
  height?: number;
  /** true = bars run left-to-right (recharts layout="vertical") */
  horizontal?: boolean;
  stacked?: boolean;
  note?: string;
  error?: string | null;
}) {
  const showLegend = bars.length > 1;

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
            <BarChart
              data={data}
              layout={horizontal ? 'vertical' : 'horizontal'}
              margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              {horizontal ? (
                <>
                  <XAxis type="number" stroke={AXIS} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey={xKey}
                    stroke={AXIS}
                    fontSize={11}
                    width={90}
                  />
                </>
              ) : (
                <>
                  <XAxis dataKey={xKey} stroke={AXIS} fontSize={11} />
                  <YAxis stroke={AXIS} fontSize={11} />
                </>
              )}
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {bars.map((b, i) => (
                <Bar
                  key={b.key}
                  dataKey={b.key}
                  name={b.name ?? b.key}
                  fill={b.color ?? PALETTE[i % PALETTE.length]}
                  stackId={stacked ? 'stack' : undefined}
                  radius={stacked ? 0 : [3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {note && !error && <div className="card-note">{note}</div>}
    </section>
  );
}
