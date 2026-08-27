import { NextResponse } from 'next/server';
import { BQ_DATASET_ID, BQ_LOCATION, BQ_PROJECT_ID, safeQuery } from '@/lib/bigquery';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ping = await safeQuery<{ ok: number }>('SELECT 1 AS ok');

  if (ping.error) {
    return NextResponse.json(
      {
        status: 'error',
        project: BQ_PROJECT_ID,
        dataset: BQ_DATASET_ID,
        location: BQ_LOCATION,
        hasCredentials: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
        error: ping.error,
      },
      { status: 500 },
    );
  }

  const views = await safeQuery<{ table_name: string }>(
    `SELECT table_name
     FROM \`${BQ_PROJECT_ID}.${BQ_DATASET_ID}.INFORMATION_SCHEMA.TABLES\`
     WHERE table_name LIKE 'v_%' OR table_name LIKE 'raw_eng_%' OR table_name LIKE 'dim_eng_%'
     ORDER BY table_name`,
  );

  return NextResponse.json({
    status: 'ok',
    project: BQ_PROJECT_ID,
    dataset: BQ_DATASET_ID,
    location: BQ_LOCATION,
    objects: views.rows.map((r) => r.table_name),
    objectsError: views.error,
  });
}
