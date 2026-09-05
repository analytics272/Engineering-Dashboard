import { pctDelta } from '@/lib/period';

/**
 * Bold, coloured % change badge — increase is always green, decrease always
 * red (no per-metric "good/bad" inversion), per the comparison-mode spec.
 */
export function Delta({
  current,
  prior,
  priorLabel,
}: {
  current: number;
  prior: number | null | undefined;
  priorLabel?: string;
}) {
  const pct = pctDelta(current, prior);
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={up ? 'delta delta-up' : 'delta delta-down'} title={priorLabel ? `vs ${priorLabel}` : undefined}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
