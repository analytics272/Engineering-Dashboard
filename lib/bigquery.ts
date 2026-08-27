import 'server-only';
import { BigQuery } from '@google-cloud/bigquery';

export const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID || 'skyla-analytics';
export const BQ_DATASET_ID = process.env.BQ_DATASET_ID || 'Skyla_Engineering_Automation';
export const BQ_LOCATION = process.env.BQ_LOCATION || 'US';

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
