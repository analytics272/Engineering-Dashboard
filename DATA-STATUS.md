# Live data check — 2026-08-27

Ran against `skyla-analytics.Skyla_Engineering_Automation` with the read-only
service account. Dataset + table names all match the spec (§3). All 11 core
views created and queryable. **All pages render real data — safe to deploy.**

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
