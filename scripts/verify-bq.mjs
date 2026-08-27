/**
 * verify-bq.mjs — PREFLIGHT. Run this before deploying.
 *
 *   node scripts/verify-bq.mjs        (or: npm run bq:verify)
 *
 * Uses your real service-account credentials to inspect the LIVE BigQuery
 * project and answer one question: do the dataset + table names this app
 * expects actually exist? It only reads INFORMATION_SCHEMA — it creates
 * nothing and writes nothing.
 *
 * Exit code 0 = all expected objects found. 1 = something is missing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// minimal .env.local loader (no dependency)
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const projectId = process.env.BQ_PROJECT_ID || 'skyla-analytics';
const datasetId = process.env.BQ_DATASET_ID || 'Skyla_Engineering_Automation';
const location = process.env.BQ_LOCATION || 'US';

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) {
    console.error('✗ GOOGLE_SERVICE_ACCOUNT_KEY is not set (put it in .env.local).');
    process.exit(1);
  }
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const c = JSON.parse(json);
  return { client_email: c.client_email, private_key: c.private_key };
}

const bq = new BigQuery({ projectId, location, credentials: credentials() });

// bare table name -> spec default (see .env.example for the BQ_TABLE_* overrides)
const EXPECT_TABLES = {
  tickets: process.env.BQ_TABLE_TICKETS || 'raw_eng_tickets',
  bills: process.env.BQ_TABLE_BILLS || 'raw_eng_bills',
  amcs: process.env.BQ_TABLE_AMCS || 'raw_eng_amcs',
  looker: process.env.BQ_TABLE_LOOKER || 'raw_eng_looker_data',
  droplist: process.env.BQ_TABLE_DROPLIST || 'dim_eng_droplist',
};
const CORE_VIEWS = [
  'v_complaints_weekly', 'v_ageing_by_category', 'v_escalation_summary',
  'v_escalation_score', 'v_resolution_time', 'v_mttr', 'v_amc_status',
  'v_amc_cost_by_type', 'v_amc_avg_cost', 'v_ecor', 'v_asset_categories',
];
const APPENDIX = {
  tables: ['raw_eng_ppm', 'raw_eng_trainings', 'raw_eng_incidents', 'raw_eng_revenue'],
  views: ['v_preventive_vs_reactive', 'v_incidents', 'v_trainings'],
};

const line = (ok, label) => console.log(`  ${ok ? '✓' : '✗'} ${label}`);

async function main() {
  console.log(`\nProject : ${projectId}`);
  console.log(`Dataset : ${datasetId}  (location ${location})\n`);

  // 1. datasets in the project
  let datasets = [];
  try {
    const [ds] = await bq.getDatasets();
    datasets = ds.map((d) => d.id);
  } catch (err) {
    console.error(`✗ Could not list datasets: ${String(err).split('\n')[0]}`);
    console.error('  → check the service account has roles/bigquery.dataViewer + jobUser on the project.');
    process.exit(1);
  }
  console.log('Datasets visible to this service account:');
  datasets.forEach((d) => line(d === datasetId, d));

  if (!datasets.includes(datasetId)) {
    console.error(`\n✗ Expected dataset "${datasetId}" not found.`);
    const guess = datasets.find((d) => /engineering/i.test(d));
    if (guess) console.error(`  → try  BQ_DATASET_ID=${guess}`);
    process.exit(1);
  }

  // 2. objects in the target dataset
  const [rows] = await bq.query({
    query: `SELECT table_name, table_type
            FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.TABLES\`
            ORDER BY table_name`,
    location,
  });
  const names = new Set(rows.map((r) => r.table_name));
  const baseTables = rows.filter((r) => r.table_type === 'BASE TABLE').map((r) => r.table_name);

  console.log(`\nBase tables in ${datasetId}:`);
  baseTables.forEach((n) => console.log(`   • ${n}`));

  let ok = true;
  const need = (n) => {
    const has = names.has(n);
    if (!has) ok = false;
    return has;
  };

  console.log('\nExpected source tables (spec §3):');
  for (const [key, name] of Object.entries(EXPECT_TABLES)) line(need(name), `${name}   (${key})`);

  console.log('\nCore views (sql/01_core_views.sql — run `npm run bq:setup` if missing):');
  for (const v of CORE_VIEWS) line(need(v), v);

  console.log('\nAppendix A — optional, only after the 4 extra tabs are synced:');
  for (const n of [...APPENDIX.tables, ...APPENDIX.views]) {
    console.log(`  ${names.has(n) ? '✓' : '·'} ${n}`);
  }

  // 3. hint if the old draft pipeline's tables exist anywhere
  const legacy = baseTables.filter((n) => /^eng_(bills|amcs|master_data|looker_data|droplist)$/.test(n));
  if (legacy.length) {
    console.log(
      `\n⚠ Found ${legacy.join(', ')} — these look like the superseded ` +
        `Config.gs/BigQueryLoader.gs draft. Do NOT run that script; it would ` +
        `keep a parallel copy in sync. See NOTES-appsscript.md.`,
    );
  }

  console.log(
    ok
      ? '\n✓ All expected objects exist. Safe to deploy.\n'
      : '\n✗ Missing objects above. Fix names (BQ_* env overrides) or create the views, then re-run.\n',
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
