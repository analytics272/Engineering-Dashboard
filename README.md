# Skyla Engineering Dashboard

Internal Engineering Ops dashboard for Skyla Collective — **BigQuery-native**, built with
Next.js (App Router) and deployable to Vercel.

3 pages, each grouping a business objective — **Operations** (complaints + ageing),
**Costs & Budget** (energy + cost matrix + budget), **Assets & Contracts** (AMC + asset
categories) — with a "Compare to Last Year" toggle on the first two. See
[DASHBOARD-GUIDE.md](DASHBOARD-GUIDE.md) for what every widget means.

The dashboard is **read-only**. It queries BigQuery views directly — no Supabase, no CSV
step, no second pipeline. The Google Sheet → BigQuery sync is the separate Apps Script
project in the `*.gs` files at the repo root (already running, refreshes every 2 hours).

---

## 1. Prerequisites

- **BigQuery**
  - Project `skyla-analytics`, dataset `Skyla_Engineering_Automation`, location `US`
  - The `raw_eng_*` / `dim_eng_*` tables from Spec §3 already populated
- **A GCP service account** with `roles/bigquery.dataViewer` + `roles/bigquery.jobUser`
  on the project. Download its JSON key.
- Node 18.18+

## 2. Preflight — verify the live BigQuery names

The object names come from the spec (§2–§3) and the running `Sync.gs` pipeline, not from a
live BigQuery read. Confirm them against your project first:

```bash
cp .env.example .env.local     # fill in GOOGLE_SERVICE_ACCOUNT_KEY
npm install
npm run bq:verify
```

This lists the real datasets/tables and checks them against what the app expects. If the live
names differ, set `BQ_DATASET_ID` / `BQ_TABLE_*` in `.env.local` (and later in Vercel) — no code
change. See [NOTES-appsscript.md](NOTES-appsscript.md) for why there are two naming conventions
in the `.gs` files and which one is live.

## 3. Create the BigQuery views

The dashboard reads the views in [`sql/`](sql/), not the raw tables directly.

Run once, either way:

- **BigQuery console:** paste [`sql/01_core_views.sql`](sql/01_core_views.sql) and run.
- **Or from this repo:**
  ```bash
  npm install
  npm run bq:setup            # creates the §4.1–4.7 views
  npm run bq:setup -- --appendix   # only after Appendix A tables exist
  ```

`sql/02_appendix_views.sql` (`v_preventive_vs_reactive`, `v_incidents`, `v_trainings`)
depends on 4 tabs that aren't synced yet — see Appendix A of the spec. The
**PPM · Incidents · Training** page renders now and self-populates once those views exist.

## 4. Local development

```bash
cp .env.example .env.local      # then fill in GOOGLE_SERVICE_ACCOUNT_KEY
npm install
npm run dev                     # http://localhost:3000
```

`GOOGLE_SERVICE_ACCOUNT_KEY` accepts either the raw one-line JSON or a base64 blob of it.

Sanity check: open `http://localhost:3000/api/health` — it should return
`status: "ok"` and list the BigQuery objects it can see.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project** → import the repo (framework auto-detected as Next.js).
3. **Settings → Environment Variables** — add:

   | Key | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | full service-account JSON (one line) or its base64 |
   | `BQ_PROJECT_ID` | `skyla-analytics` *(optional — this is the default)* |
   | `BQ_DATASET_ID` | `Skyla_Engineering_Automation` *(optional — default)* |
   | `BQ_LOCATION` | `US` *(optional — default)* |
   | `BQ_TABLE_*` | only if `npm run bq:verify` said the live table names differ |

4. Deploy. Every page is `force-dynamic` (server-rendered per request), so data is always live.
   Hit `/api/health` on the deployed URL once to confirm it can see BigQuery.

> The service-account key is a secret — it's git-ignored here and must only live in
> Vercel's env vars / your local `.env.local`.

## 6. Project layout

```
sql/                 BigQuery view definitions (source of truth for §4)
lib/bigquery.ts      BigQuery client + safeQuery helper
lib/queries.ts       table/view names (+ BQ_TABLE_* overrides), global-filter plumbing
lib/format.ts        INR / % / hours formatting
components/           PageShell, Nav, Filters, Card, KpiCard, DataTable, charts/*
app/<page>/page.tsx   one file per dashboard page
app/api/health        connectivity check
scripts/verify-bq.mjs preflight: checks live BigQuery names vs what the app expects
scripts/apply-views.mjs  creates the sql/ views (honours BQ_DATASET_ID / BQ_TABLE_*)
*.gs                  the separate Sheet→BigQuery Apps Script sync — see NOTES-appsscript.md
```

## 7. Known data gaps (surfaced in-app, flag to whoever maintains the sheet)

1. `raw_eng_bills.sold_rooms` is `0` everywhere → **ECOR** shows total energy cost only until it's populated.
2. No owner field on any asset tab → **Asset Categories** covers AMC-linked assets only.
3. PPM / Trainings / Incidents / Revenue not synced to BigQuery yet → **Appendix A**.
4. AMC `status` is hand-typed → all AMC status math is computed from `end_date` instead.
5. The Month filter uses the tickets' `logged_month` labels; on bills/looker pages it only
   matches where those tables use the same label format.

## 8. Naming — status

Object names were **inferred from the spec (§2–§3) and the trigger-wired `Sync.gs` pipeline**,
then confirmed switchable — not read from a live BigQuery (no BigQuery access at build time).

- **Dataset:** `Skyla_Engineering_Automation` · **tables:** `raw_eng_*` / `dim_eng_droplist`
- The local `Config.gs` + `BigQueryLoader.gs` use `Skyla_Engineering` / `eng_*`, but that
  script is **not triggered** and is superseded — see [NOTES-appsscript.md](NOTES-appsscript.md).
  Don't run it; it would create a duplicate parallel dataset.
- **Before deploy:** `npm run bq:verify`. If it reports different live names, set
  `BQ_DATASET_ID` / `BQ_TABLE_*` env vars — `lib/queries.ts` and `scripts/apply-views.mjs`
  both read them, so no code edit and no table rename is needed.
