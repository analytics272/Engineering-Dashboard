import 'server-only';
import { BigQuery } from '@google-cloud/bigquery';

// Env vars pasted into .env.local / the Vercel dashboard frequently carry a
// trailing newline or stray space. Left untrimmed, that whitespace ends up
// spliced into a backticked `project.dataset.view` and BigQuery reports
// "Unclosed identifier literal". Strip everything that can't be in an id.
const envId = (key: string, fallback: string) => {
  const v = process.env[key];
  const cleaned = (v ?? '').replace(/[^A-Za-z0-9_\-.]/g, '').trim();
  return cleaned || fallback;
};

export const BQ_PROJECT_ID = envId('BQ_PROJECT_ID', 'skyla-analytics');
export const BQ_DATASET_ID = envId('BQ_DATASET_ID', 'Skyla_Engineering_Automation');
export const BQ_LOCATION = (process.env.BQ_LOCATION || 'US').trim();

/** Fully-qualified dataset prefix, e.g. `skyla-analytics.Skyla_Engineering_Automation` */
export const DATASET = `${BQ_PROJECT_ID}.${BQ_DATASET_ID}`;

let client: BigQuery | null = null;

function loadCredentials():
  | { client_email: string; private_key: string; project_id?: string }
  | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return undefined;
  const json = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is set but is neither valid JSON nor valid base64-encoded JSON.',
    );
  }
}

export function getClient(): BigQuery {
  if (client) return client;
  const credentials = loadCredentials();
  client = new BigQuery({
    projectId: BQ_PROJECT_ID,
    location: BQ_LOCATION,
    ...(credentials
      ? { credentials: { client_email: credentials.client_email, private_key: credentials.private_key } }
      : {}),
  });
  return client;
}

/** Run a parameterised query. Throws on error. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const [rows] = await getClient().query({ query: sql, params, location: BQ_LOCATION });
  return rows as T[];
}

export type QueryResult<T> = { rows: T[]; error: string | null };

/** Run a query, capturing any error instead of throwing — for page/widget rendering. */
export async function safeQuery<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<QueryResult<T>> {
  try {
    return { rows: await query<T>(sql, params), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Trim BigQuery's very long error payloads to something a card can show.
    return { rows: [], error: message.split('\n')[0].slice(0, 300) };
  }
}

/** Coerce BigQuery numerics (which can arrive as {value: "1.2"} / BigQueryInt / string). */
export function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return Number((v as { value: unknown }).value) || 0;
  }
  return Number(v) || 0;
}

/**
 * Coerce any BigQuery cell to display text. DATE / TIMESTAMP / NUMERIC come back
 * as wrapper objects ({ value: '2026-06-29' }); rendering those directly is what
 * produces "[object Object]" in a table. Null / blank become an en-dash.
 */
export function text(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    const val = (v as Record<string, unknown>).value;
    return val == null ? '—' : String(val);
  }
  const s = String(v).trim();
  return s === '' ? '—' : s;
}
