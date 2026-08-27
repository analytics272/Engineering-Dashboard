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
