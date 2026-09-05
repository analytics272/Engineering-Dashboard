'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS, GRID, PALETTE, tooltipStyle } from './palette';

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export type SeriesSpec = { key: string; name?: string; color?: string };
/** Server Components can't pass functions to a 'use client' component — pick a
 * built-in unit instead of a formatter callback. */
export type ValueUnit = 'none' | 'hours' | 'currency' | 'percent';

function formatValue(v: number, unit: ValueUnit): string {
  switch (unit) {
    case 'hours':
      return `${v}h`;
    case 'percent':
      return `${v}%`;
    case 'currency':
      return v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : `₹${Math.round(v)}`;
    default:
      return String(v);
  }
}

export function TrendChartCard({
  title,
  data,
  xKey,
  series,
  span = 6,
  height = 240,
  variant = 'line',
  unit = 'none',
  note,
  error,
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesSpec[];
  span?: Span;
  height?: number;
  variant?: 'line' | 'area';
  unit?: ValueUnit;
  note?: string;
  error?: string | null;
}) {
  const Chart = variant === 'area' ? AreaChart : LineChart;
  const showLegend = series.length > 1;
  const fmt = (v: number) => formatValue(v, unit);

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
            <Chart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} stroke={AXIS} fontSize={11} tickLine={false} />
              <YAxis stroke={AXIS} fontSize={11} tickLine={false} width={44} tickFormatter={fmt} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11.5 }} />}
              {series.map((s, i) => {
                const color = s.color ?? PALETTE[i % PALETTE.length];
                return variant === 'area' ? (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name ?? s.key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.14}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name ?? s.key}
                    stroke={color}
                    strokeWidth={2.25}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </Chart>
          </ResponsiveContainer>
        </div>
      )}
      {note && !error && <div className="card-note">{note}</div>}
    </section>
  );
}
