/**
 * apply-views.mjs — create/refresh the BigQuery views from sql/*.sql
 *
 *   node scripts/apply-views.mjs            # runs 01_core_views.sql
 *   node scripts/apply-views.mjs --appendix # also runs 02_appendix_views.sql
 *
 * Reads the same env vars as the app (see .env.example). Loads .env.local if present.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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

// The .sql files are written against the spec defaults so they can also be
// pasted straight into the BigQuery console. If env points elsewhere, rewrite
// the fully-qualified references (dataset + any BQ_TABLE_* overrides) on the fly.
const SPEC_PREFIX = 'skyla-analytics.Skyla_Engineering_Automation';
const TABLE_OVERRIDES = {
  raw_eng_tickets: process.env.BQ_TABLE_TICKETS,
  raw_eng_bills: process.env.BQ_TABLE_BILLS,
  raw_eng_amcs: process.env.BQ_TABLE_AMCS,
  raw_eng_looker_data: process.env.BQ_TABLE_LOOKER,
  dim_eng_droplist: process.env.BQ_TABLE_DROPLIST,
  raw_eng_ppm: process.env.BQ_TABLE_PPM,
  raw_eng_trainings: process.env.BQ_TABLE_TRAININGS,
  raw_eng_incidents: process.env.BQ_TABLE_INCIDENTS,
  raw_eng_revenue: process.env.BQ_TABLE_REVENUE,
};

function retarget(sql) {
  let out = sql.replaceAll(SPEC_PREFIX, `${projectId}.${datasetId}`);
  for (const [def, override] of Object.entries(TABLE_OVERRIDES)) {
    if (override && override.trim() && override.trim() !== def) {
      out = out.replaceAll(`.${def}\``, `.${override.trim()}\``);
    }
  }
  return out;
}

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return undefined;
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const c = JSON.parse(json);
  return { client_email: c.client_email, private_key: c.private_key };
}

const bq = new BigQuery({ projectId, location, credentials: credentials() });

/** Split a .sql file into individual statements on `;` at end of line. */
function statements(sql) {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function runFile(name) {
  const path = join(root, 'sql', name);
  console.log(`\n── ${name}  →  ${projectId}.${datasetId} ──`);
  for (const stmt of statements(retarget(readFileSync(path, 'utf8')))) {
    const label = (stmt.match(/VIEW\s+`[^`]*\.([a-z_0-9]+)`/i)?.[1]) || stmt.slice(0, 48);
    try {
      await bq.query({ query: stmt, location });
      console.log(`  ✓ ${label}`);
    } catch (err) {
      console.error(`  ✗ ${label}\n    ${String(err).split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
}

await runFile('01_core_views.sql');
if (process.argv.includes('--appendix')) await runFile('02_appendix_views.sql');
console.log('\nDone.');
