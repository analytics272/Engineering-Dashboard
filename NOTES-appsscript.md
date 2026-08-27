# Apps Script sync — which pipeline is live (read before touching the `.gs` files)

The `.gs` files in this repo are the **Sheet → BigQuery sync**, not part of the web app.
They contain **two different implementations**, and only one is wired to run.

## Live pipeline — `Sync.gs`

- [Triggers.gs](Triggers.gs) installs time-based triggers for `syncAll` (every 2h) and
  `syncDroplist` (daily). Both functions live in [Sync.gs](Sync.gs).
- `Sync.gs` is driven by `ENG_SHEET_CONFIG` / `ENG_DROPLIST_CONFIG` / `ENG_SPREADSHEET_ID` /
  `BQ_INSERT_BATCH_SIZE`. **Those constants are not in the local [Config.gs](Config.gs)** — the
  real Apps Script project has a fuller `Config.gs` (spec Appendix A: *"add these entries to
  `ENG_SHEET_CONFIG` in `Config.gs`"*, *"run `createEngTablesIfMissing` from `SetupBigQuery.gs`"* —
  neither file is in this folder).
- It `insertAll`s into pre-existing tables named `raw_eng_*` / `dim_eng_droplist` in dataset
  `Skyla_Engineering_Automation` — matching **spec §2–§3**, which is what the dashboard queries.

## Superseded draft — `Config.gs` + `BigQueryLoader.gs` + `SheetSchema.gs`

- Schema-derived, `WRITE_TRUNCATE` load jobs, driven by `SHEET_TABLE_MAP`, writing
  `eng_bills` / `eng_amcs` / `eng_master_data` / `eng_looker_data` / `eng_droplist` into dataset
  `Skyla_Engineering`.
- **Nothing triggers it.** `syncSheetToBigQuery()` is never called by `Triggers.gs` or `Sync.gs`.
- Spec §0 explicitly retires this approach.

### ⚠️ Do not run `BigQueryLoader.gs`
It targets a **different dataset and different table names**. Running it would stand up a
second, parallel copy of the data (`Skyla_Engineering.eng_*`) kept in sync alongside the real
one — exactly the "duplicate tables / second pipeline" outcome to avoid. If you want to tidy the
repo, delete `Config.gs`, `BigQueryLoader.gs`, `SheetSchema.gs` (confirm against the real Apps
Script project first — this local copy may just be a partial export).

## Verifying the live names

This was inferred from code, not read from BigQuery. Before deploying, run:

```bash
npm run bq:verify
```

It uses your service-account key to list the real datasets/tables and check them against what
the app expects. If they differ, set the `BQ_DATASET_ID` / `BQ_TABLE_*` env vars (see
`.env.example`) — no code change needed — or, if the intent is to rename in BigQuery, do that
in the Apps Script project and keep the spec names.
