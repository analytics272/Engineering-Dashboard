const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return inr.format(Math.round(v));
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(v);
}

/** Indian-format currency; compacts to L / Cr above a lakh. */
export function fmtCurrency(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${inr2.format(v / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${inr2.format(v / 1e5)} L`;
  return `₹${inr.format(Math.round(v))}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${fmtNum(v, 1)}%`;
}

export function fmtHours(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${fmtNum(v, 1)} h`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Sort key for month labels like "Aug 25", "Aug-25", "Apr-26", "May 2026".
 * `raw_eng_bills.month_number` is NULL for every row, so chart/column ordering
 * has to come from the label text instead. Unparseable labels sort last.
 */
export function monthKey(label: string | null | undefined): number {
  if (!label) return Number.MAX_SAFE_INTEGER;
  const m = label.trim().toLowerCase().match(/^([a-z]{3})[a-z]*\s*[-\s]?\s*'?(\d{2,4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return Number.MAX_SAFE_INTEGER;
  let y = parseInt(m[2], 10);
  if (y < 100) y += 2000;
  return y * 12 + mi;
}
