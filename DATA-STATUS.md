# Live data check — 2026-08-27

## 🔴 2026-09-23 — `raw_eng_bills.direct_category` is now NULL for every row

Surfaced by the first nightly `fullResyncNow` run (`synced_at` for all 2924
bill rows is a single 2026-09-22T21:29Z batch — a full reload, not
incremental). Spec §4.6's exact filter, `direct_category IN ('Electricity
Charges','Water')`, now matches 0 rows — this made Energy Cost / ECOR /
Electricity vs Water always show ₹0 (fixed dashboard-side by matching on
`category` instead — see DASHBOARD-GUIDE.md's audit section). The
`direct_category` column itself is still broken upstream: whoever maintains
the sheet should check whether the Bills tab's "Direct Category" column is
still populated, and if not, either repopulate it or remove the column from
`ENG_SHEET_CONFIG` — the dashboard no longer depends on it, but the BigQuery
view `v_ecor` (unused by the app, kept for spec-compliance) still does and
will keep returning 0 rows until this is fixed at the source.



Ran against `skyla-analytics.Skyla_Engineering_Automation` with the read-only
service account. Dataset + table names all match the spec (§3). All 11 core
views created and queryable. **All pages render real data — safe to deploy.**

## 🟡 2026-09-22 — stale `synced_at` explained (corrected)

`MAX(synced_at)`: `raw_eng_tickets` = 2026-09-04 (18 days), `raw_eng_bills` /
`raw_eng_amcs` / `raw_eng_looker_data` = 2026-08-27 (26 days). **First read of
this was wrong** — I initially assumed the `syncAll` trigger had stopped
running. The Apps Script Executions log proved otherwise: `syncAll` has been
completing successfully every 2 hours the whole time, 0% error rate, right up
to today.

The real explanation: `syncSheetIncremental_()` (`Sync.gs`) only scans rows
*appended after* its stored cursor — a row it already synced is never
re-read. So `synced_at` staying frozen just means no *new* rows have landed in
the sheet since then, **and** it means any *edit* to an already-synced row
(e.g. a ticket's `status` flipped from `Open` to `Closed`) never reaches
BigQuery at all, no matter how often `syncAll` runs — which is what actually
caused "Open Complaints" to show tickets that had likely already been closed.

**Fixed 2026-09-22:** added a nightly `fullResyncNow` trigger (2:00–3:00 AM
Asia/Kolkata) that wipes and reloads every table from row 1 once a day, so
edits like this surface within 24h instead of never. See
[DASHBOARD-GUIDE.md](DASHBOARD-GUIDE.md) point 4 and `Triggers.gs`
`installNightlyFullResyncTrigger()`. The dashboard's own stale-data warning
(banner + tinted "Last Updated" stamp past 6h, `components/PageShell.tsx`)
stays as a general early-warning signal regardless of root cause.

## History: a transient bad sync (now resolved)

The 07:08 UTC sync of `raw_eng_tickets` was corrupt (every column held the row
serial number, all timestamps NULL). The **10:16 UTC sync overwrote it with
clean data** — no dashboard change was involved. If Complaints/Ageing ever go
blank again, check `SELECT status, COUNT(*) FROM raw_eng_tickets GROUP BY 1`;
if it shows numbers instead of `Open`/`Closed`, that tab's sync misfired again
and needs a re-run (harden `Sync.gs` header matching against blank headers —
see [NOTES-appsscript.md](NOTES-appsscript.md)).

## Verified working (smoke-tested pages)

| Table | Rows | Page result |
|---|---|---|
| `raw_eng_tickets` | 3,678 | Complaints: 3,678 total / 6 open / 99.7% closure · Ageing: 7 h avg / 8.8 h MTTR |
| `raw_eng_bills` | 2,925 | Energy Costing: ₹1.6 Cr · Costing matrix populated |
| `raw_eng_amcs` | 39 | AMC: 27 active / 6 expired / 6 closing · ₹42,115 avg |
| `raw_eng_looker_data` | 469 | Budget: ₹1.7 Cr, 4 quarters |
| `dim_eng_droplist` | 12 | filters fallback |

## Minor data notes (upstream, non-blocking)

- **`status` has a 3rd value `Cancelled`** (5 rows) not in the spec. The views
  count `Closed` and `Open` explicitly; `Cancelled` + rows with NULL `property`
  (436) still sit in `total_complaints` (COUNT(*)), so closure % is very
  slightly diluted. Adjust the views if Cancelled should be excluded.
- **`ageing_minutes` is NULL on 681 closed tickets** (~19%) — avg ageing / MTTR
  are computed over the ~2,986 that have it.
- **`raw_eng_bills.month_number` / `consumption_pct` / `sold_rooms` are NULL** for
  all rows → month-ordering on Energy/Costing charts falls back to string order;
  ECOR shows total energy cost only (spec §4.6, already handled in-app).
- **Appendix A tables** (`raw_eng_ppm`, `_trainings`, `_incidents`, `_revenue`)
  not synced → the PPM/Incidents/Training page shows its "pending" state by design.
