import { monthKey } from './format';

const MAX = Number.MAX_SAFE_INTEGER;

/** Every calendar year present in a set of "MMM YY" labels, ascending. Purely
 * data-driven — a new month/year appearing in the sheet shows up here on the
 * next request with no code change. */
export function availableYears(labels: (string | null | undefined)[]): number[] {
  const set = new Set<number>();
  for (const l of labels) {
    if (!l) continue;
    const k = monthKey(l);
    if (k !== MAX) set.add(Math.floor(k / 12));
  }
  return [...set].sort((a, b) => a - b);
}

/** Default selection for the Years comparison picker: the latest 2 years present. */
export function defaultYears(years: number[]): number[] {
  return years.length >= 2 ? years.slice(-2) : years.slice(-1);
}

export type YearSeries = { year: number; months: string[] };

/**
 * Builds one "series" per selected comparison year — always an
 * apples-to-apples period across years, which is the whole point of a
 * year-over-year comparison:
 *  - if a specific Month is picked, each series is that single calendar month
 *    in that year (e.g. "Aug" in 2025 and in 2026) — whichever label the table
 *    actually stores (so text quirks like "Aug-25" vs "Aug 25" don't matter).
 *  - if Month is "All", the *reference* year (the latest of the selected
 *    years) defines which calendar months are "in scope" — e.g. if this year
 *    only has data through August, every other selected year is restricted to
 *    Jan–Aug too, instead of comparing 8 months of this year against a full
 *    12 months of last year.
 * A year with no matching data for a given month yields a gap (that month is
 * simply absent from `months`) rather than an error.
 */
export function planYearSeries(
  allLabels: (string | null | undefined)[],
  years: number[],
  monthFilter?: string,
): YearSeries[] {
  const byKey = new Map<number, string>();
  for (const l of allLabels) {
    if (!l) continue;
    const k = monthKey(l);
    if (k !== MAX) byKey.set(k, l);
  }
  const targetMonthIdx = monthFilter ? (() => {
    const k = monthKey(monthFilter);
    return k === MAX ? null : k % 12;
  })() : null;

  if (targetMonthIdx != null) {
    return years.map((year) => {
      const label = byKey.get(year * 12 + targetMonthIdx);
      return { year, months: label ? [label] : [] };
    });
  }

  const refYear = years[years.length - 1];
  const refMonthIdxs = [...byKey.keys()]
    .filter((k) => Math.floor(k / 12) === refYear)
    .map((k) => k % 12)
    .sort((a, b) => a - b);

  return years.map((year) => ({
    year,
    months: refMonthIdxs.map((mi) => byKey.get(year * 12 + mi)).filter((l): l is string => !!l),
  }));
}

/** Percent change, current vs prior. Null when there's nothing to compare against. */
export function pctDelta(current: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}
