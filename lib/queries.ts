import 'server-only';
import { cache } from 'react';
import { DATASET, safeQuery } from './bigquery';
import { availableYears } from './period';

// ---------------------------------------------------------------------------
// Fully-qualified object names. Centralised so a rename is a one-line fix.
//
// Defaults match the spec exactly (§3). The running Apps Script pipeline
// (Sync.gs, driven by ENG_SHEET_CONFIG) writes to these names. The older
// local Config.gs/BigQueryLoader.gs draft (Skyla_Engineering.eng_*) is NOT
// trigger-wired and is superseded — see NOTES-appsscript.md.
//
// If `npm run bq:verify` shows different live names, override per-table via
// env WITHOUT editing code:
//   BQ_TABLE_TICKETS, BQ_TABLE_BILLS, BQ_TABLE_AMCS, BQ_TABLE_LOOKER,
//   BQ_TABLE_DROPLIST, BQ_TABLE_PPM, BQ_TABLE_TRAININGS, BQ_TABLE_INCIDENTS,
//   BQ_TABLE_REVENUE  (bare table name; dataset is prepended automatically)
// ---------------------------------------------------------------------------
const t = (envKey: string, fallback: string) => {
  const name = (process.env[envKey] ?? '').replace(/[^A-Za-z0-9_\-.]/g, '').trim();
  return `${DATASET}.${name || fallback}`;
};

export const TABLES = {
  tickets: t('BQ_TABLE_TICKETS', 'raw_eng_tickets'),
  bills: t('BQ_TABLE_BILLS', 'raw_eng_bills'),
  amcs: t('BQ_TABLE_AMCS', 'raw_eng_amcs'),
  looker: t('BQ_TABLE_LOOKER', 'raw_eng_looker_data'),
  droplist: t('BQ_TABLE_DROPLIST', 'dim_eng_droplist'),
  // Appendix A (not synced yet)
  ppm: t('BQ_TABLE_PPM', 'raw_eng_ppm'),
  trainings: t('BQ_TABLE_TRAININGS', 'raw_eng_trainings'),
  incidents: t('BQ_TABLE_INCIDENTS', 'raw_eng_incidents'),
  revenue: t('BQ_TABLE_REVENUE', 'raw_eng_revenue'),
} as const;

export const VIEWS = {
  complaintsWeekly: `${DATASET}.v_complaints_weekly`,
  ageingByCategory: `${DATASET}.v_ageing_by_category`,
  escalationSummary: `${DATASET}.v_escalation_summary`,
  escalationScore: `${DATASET}.v_escalation_score`,
  resolutionTime: `${DATASET}.v_resolution_time`,
  mttr: `${DATASET}.v_mttr`,
  amcStatus: `${DATASET}.v_amc_status`,
  amcCostByType: `${DATASET}.v_amc_cost_by_type`,
  amcAvgCost: `${DATASET}.v_amc_avg_cost`,
  ecor: `${DATASET}.v_ecor`,
  assetCategories: `${DATASET}.v_asset_categories`,
  preventiveVsReactive: `${DATASET}.v_preventive_vs_reactive`,
  incidents: `${DATASET}.v_incidents`,
  trainings: `${DATASET}.v_trainings`,
} as const;

// ---------------------------------------------------------------------------
// Global filters — Spec §5, plus Quarter (Budget page)
// ---------------------------------------------------------------------------
export type FilterKey = 'month' | 'property' | 'category' | 'quarter';
export type Filters = Partial<Record<FilterKey, string>>;
export type SearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_FILTERS: FilterKey[] = ['month', 'property', 'category'];

export function parseFilters(sp: SearchParams): Filters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s !== 'All' ? s : undefined;
  };
  return {
    month: one('month'),
    property: one('property'),
    category: one('category'),
    quarter: one('quarter'),
  };
}

/** The "Compare Years" multi-select — `?years=2025,2026`. Independent of the single-value pills above. */
export function parseYears(sp: SearchParams): number[] {
  const v = sp.years;
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return [];
  return s
    .split(',')
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

type ColMap = Partial<Record<keyof Filters, string>>;

/**
 * Build a WHERE fragment for whichever filters map to a real column in this view.
 * Returns `{ clause, params }` — clause is '' when nothing applies.
 */
export function whereFor(
  filters: Filters,
  cols: ColMap,
  keyword: 'WHERE' | 'AND' = 'WHERE',
): { clause: string; params: Record<string, string> } {
  const parts: string[] = [];
  const params: Record<string, string> = {};
  (Object.keys(cols) as (keyof Filters)[]).forEach((key) => {
    const col = cols[key];
    const val = filters[key];
    if (col && val) {
      parts.push(`${col} = @${key}`);
      params[key] = val;
    }
  });
  return { clause: parts.length ? `${keyword} ${parts.join(' AND ')}` : '', params };
}

/**
 * `col IN UNNEST(@paramName)` fragment for a list of exact values (e.g. the
 * month labels making up one year-series). Empty list -> a clause that matches
 * nothing (`FALSE`) with NO param — the BigQuery client can't infer a type for
 * an empty array parameter and throws "Parameter types must be provided for
 * empty arrays", so an unreferenced param must not be passed at all.
 */
export function inClause(
  col: string,
  values: string[],
  paramName: string,
  keyword: 'WHERE' | 'AND' = 'WHERE',
): { clause: string; params: Record<string, string[]> } {
  if (values.length === 0) return { clause: `${keyword} FALSE`, params: {} };
  return {
    clause: `${keyword} ${col} IN UNNEST(@${paramName})`,
    params: { [paramName]: values },
  };
}

// ---------------------------------------------------------------------------
// Filter dropdown options — distinct values from the tickets table.
// ---------------------------------------------------------------------------
export type FilterOptions = {
  properties: string[];
  categories: string[];
  months: string[];
  quarters: string[];
  /** every distinct month label from bills — used by the Costs page's Years comparison */
  billMonths: string[];
  /** every calendar year seen across tickets + bills — feeds the Compare Years picker, fully data-driven */
  years: number[];
  lastUpdated: string | null;
  error: string | null;
};

// Guard: a corrupt source table (e.g. a broken sync that writes row numbers into
// every column) must not spray thousands of junk entries into the filter bar.
const looksLikeLabel = (s: string) => /[A-Za-z]/.test(s) && s.length <= 40 && !/^\d+$/.test(s);
const clean = (values: (string | null)[], cap = 60) =>
  [...new Set(values.filter((v): v is string => !!v && looksLikeLabel(v)))].sort().slice(0, cap);

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const { rows, error } = await safeQuery<{
    property: string | null;
    category: string | null;
    logged_month: string | null;
    month_number: number | null;
  }>(
    `SELECT DISTINCT property, category, logged_month, month_number
     FROM \`${TABLES.tickets}\``,
  );
  if (error)
    return {
      properties: [],
      categories: [],
      months: [],
      quarters: [],
      billMonths: [],
      years: [],
      lastUpdated: null,
      error,
    };

  const properties = clean(rows.map((r) => r.property));
  const categories = clean(rows.map((r) => r.category));

  const monthOrder = new Map<string, number>();
  for (const r of rows) {
    if (r.logged_month && looksLikeLabel(r.logged_month)) {
      monthOrder.set(r.logged_month, Number(r.month_number) || 99);
    }
  }
  const months = [...monthOrder.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m).slice(0, 24);

  // Quarters (Budget breakdown) + month labels (Costs page trend) — raw_eng_looker_data / raw_eng_bills.
  const q = await safeQuery<{ quarter: string | null }>(
    `SELECT DISTINCT quarter FROM \`${TABLES.looker}\` WHERE quarter IS NOT NULL ORDER BY quarter`,
  );
  const quarters = clean(q.rows.map((r) => r.quarter), 12);

  const bm = await safeQuery<{ month: string | null }>(
    `SELECT DISTINCT month FROM \`${TABLES.bills}\` WHERE month IS NOT NULL`,
  );
  const billMonths = clean(bm.rows.map((r) => r.month), 60);

  const years = availableYears([...months, ...billMonths]);

  const stamp = await safeQuery<{ ts: { value: string } | string | null }>(
    `SELECT MAX(synced_at) AS ts FROM \`${TABLES.tickets}\``,
  );
  const rawTs = stamp.rows[0]?.ts;
  const lastUpdated =
    (typeof rawTs === 'object' && rawTs ? rawTs.value : (rawTs as string | null)) ?? null;

  return { properties, categories, months, quarters, billMonths, years, lastUpdated, error: null };
});
