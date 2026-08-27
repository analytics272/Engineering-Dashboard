# Skyla Engineering Dashboard — Build Spec for Claude Code (BigQuery-native)

**Paste this entire document to Claude Code as your first message.** Build in this order — don't let it jump to UI first:
1. Confirm BigQuery access (Section 2).
2. Create the SQL views in Section 4, exactly as written, against the live tables in Section 3.
3. Build the pages/widgets in Section 5, each one pointed at its named view.
4. Only if you want the full 8-table version, run Appendix A first (a Sheets change, not a Claude Code task) — otherwise skip it and treat those four widgets as "coming later."

---

## 0. What changed from the earlier Lovable/Supabase spec

An earlier version of this spec assumed Lovable (Supabase-backed) as the build target, with data getting into Supabase via CSV export/import or a new Apps Script → Supabase sync. **None of that applies anymore.** The Google Sheet ("Skyla Engineering Master Data") already syncs automatically into **BigQuery** via an Apps Script project bound to the sheet — no CSV step, no Supabase, no second pipeline. Claude Code should query BigQuery directly.

The KPI logic and data-quality warnings from that earlier spec were solid, so they're carried over here — only the target database and table/column names have changed.

---

## 1. What this dashboard is

Internal Engineering Ops dashboard for Skyla Collective, covering 6 properties (KDP, HTC, JHS, BH4, LP, GB) plus Office/Corporate HQ. Pages: **Complaints, Ageing, Energy Costing, Costing, AMC, Budget**, plus a handful of standalone widgets.

---

## 2. Connecting to BigQuery

- **Project:** `skyla-analytics`
- **Dataset:** `Skyla_Engineering_Automation`
- **Location:** `US`
- **Auth:** a GCP service account with `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` on the project (read-only is enough — this dashboard never writes to BigQuery). Use `@google-cloud/bigquery` (Node) or `google-cloud-bigquery` (Python); don't route through Supabase or any other intermediary.
- Tell Claude Code explicitly: *"Query BigQuery directly using these exact fully-qualified table/view names. Do not create a separate database, and do not rename anything — later widgets depend on these exact names."*

---

## 3. Live tables today (already populated, refreshing every 2 hours)

| BigQuery table | Source sheet tab | Status |
|---|---|---|
| `raw_eng_tickets` | Master Data / Data | ✅ live |
| `raw_eng_bills` | Bills | ✅ live |
| `raw_eng_amcs` | AMCs | ✅ live |
| `raw_eng_looker_data` | Looker_Data (this is the "Budget" feed) | ✅ live |
| `dim_eng_droplist` | Droplist | ✅ live, daily |

**Not yet synced** (needed for 4 of the widgets in Section 5): Preventive Maintenance, Trainings, Incidents, Revenue. See **Appendix A** to add them — everything else in this doc works without that step.

### Key columns per live table

`raw_eng_tickets`: `ticket_no` INT, `unit_number`, `description`, `nature`, `category`, `reopen_count` INT, `logged_by`, `assigned_to`, `serviced_by`, `logged_on` TIMESTAMP, `last_updated_on` TIMESTAMP, `escalation_level` ('L1'/'L2'/'L3'), `status` ('Open'/'Closed'), `closed_by`, `closed_on` TIMESTAMP, `logged_month`, `property`, `week` ('W1'..'W4'), `month_number` INT, `ageing_minutes` FLOAT (clean numeric — use this, not the "Ageing in hours" text column).

`raw_eng_bills`: `month`, `property`, `category`, `direct_category`, `bill_value` FLOAT, `consumption_pct` FLOAT (cost-allocation %, not a meter reading), `total_bill` FLOAT, `available_rooms` INT (currently 0 for every row — gap, see §6), `sold_rooms` INT (also currently 0 — gap, see §6), `month_number` INT, `variance` FLOAT, `quarter`, `financial_year`.

`raw_eng_amcs`: `type` ('AMC'/'Warranty'), `asset_name` (the asset *category*, e.g. 'Elevator', 'Air Conditioner'), `property`, `vendor_name`, `start_date` DATE, `end_date` DATE, `yearly_cost` FLOAT, `per_month_cost` FLOAT, `remarks`, `status` (manually typed in the sheet — don't trust for Active/Expired math, see §4.5), `month`, `month_number` INT.

`raw_eng_looker_data`: `month`, `month_date`, `quarter`, `fiscal_year`, `category`, `subcategory`, `item`, `amount` FLOAT.

---

## 4. KPI views — create each as a BigQuery view

Use `CREATE OR REPLACE VIEW` so re-running is safe. Replace `` `skyla-analytics.Skyla_Engineering_Automation.X` `` with the fully-qualified name every time — BigQuery has no session-level default dataset the way Postgres/Supabase does.

### 4.1 `v_complaints_weekly` — Total Complaints (Weekly)
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_complaints_weekly` AS
SELECT
  week, property, logged_month, month_number,
  COUNT(*) AS total_complaints,
  COUNTIF(status = 'Closed') AS closed_complaints,
  COUNTIF(status = 'Open') AS open_complaints,
  ROUND(COUNTIF(status = 'Closed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS closure_pct
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
GROUP BY week, property, logged_month, month_number;
```
(BigQuery has no `FILTER (WHERE ...)` clause — `COUNTIF` is the equivalent.)

### 4.2 `v_ageing_by_category` — Avg Ageing of Complaint
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_ageing_by_category` AS
SELECT category, AVG(ageing_minutes) / 60.0 AS avg_ageing_hours
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
WHERE status = 'Closed'
GROUP BY category;
```
Optional real-time add-on for still-open tickets:
`AVG(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), logged_on, MINUTE)) / 60.0 WHERE status='Open'`

### 4.3 `v_escalation_summary` / `v_escalation_score` — Escalation Level
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_escalation_summary` AS
SELECT escalation_level,
       COUNT(*) AS ticket_count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
GROUP BY escalation_level;

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_escalation_score` AS
SELECT AVG(CASE escalation_level WHEN 'L1' THEN 1 WHEN 'L2' THEN 2 WHEN 'L3' THEN 3 END) AS avg_escalation_score
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`;
```

### 4.4 `v_resolution_time` / `v_mttr` — Resolution Time & MTTR
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_resolution_time` AS
SELECT property, AVG(ageing_minutes) / 60.0 AS avg_resolution_hours
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
WHERE status = 'Closed'
GROUP BY property;

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_mttr` AS
SELECT property, category,
       SUM(ageing_minutes) / 60.0 / COUNT(*) AS mttr_hours
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
WHERE status = 'Closed'
GROUP BY property, category;
```
Same base calculation in both — only the grouping differs.

### 4.5 `v_amc_status` / `v_amc_cost_by_type` / `v_amc_avg_cost` — AMCs
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_amc_status` AS
SELECT
  CASE
    WHEN end_date < CURRENT_DATE() THEN 'Expired'
    WHEN end_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 60 DAY) THEN 'Closing Soon'
    ELSE 'Active'
  END AS amc_status,
  COUNT(*) AS contract_count
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY 1;
-- computed off end_date, not the sheet's manually-typed status column, which can go stale.

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_amc_cost_by_type` AS
SELECT asset_name AS asset_type, SUM(yearly_cost) AS total_yearly_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY asset_name;

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_amc_avg_cost` AS
SELECT property, AVG(yearly_cost) AS avg_yearly_cost, AVG(per_month_cost) AS avg_monthly_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY property;
```

### 4.6 `v_ecor` — Energy Consumption & Cost per Occupied Room
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_ecor` AS
SELECT property, month,
       SUM(bill_value) AS energy_cost,
       SUM(bill_value) / NULLIF(SUM(sold_rooms), 0) AS ecor
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_bills`
WHERE direct_category IN ('Electricity Charges', 'Water')
GROUP BY property, month;
```
🚩 **Blocking gap:** `sold_rooms` is currently 0 for every row, so `ecor` divides by zero (shows as `NULL`) until that column is populated. Build and wire the widget now — the moment `sold_rooms` gets real numbers this starts working with no further changes. Until then, show `energy_cost` alone on the card, not `ecor`.

### 4.7 `v_asset_categories` — Asset Categories & Listing
```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_asset_categories` AS
SELECT property, asset_name AS category, COUNT(*) AS asset_count, SUM(yearly_cost) AS total_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY property, asset_name;
```
🚩 Only covers AMC-linked assets (Elevator, AC, Generator, Internet) — not a full inventory, and there's no internal "owner" field anywhere, only `vendor_name` (external contractor).

### 4.8–4.10 Require Appendix A (skip if not extending the sync yet)
`v_preventive_vs_reactive`, `v_incidents`, `v_trainings` all read from tables that don't exist until Appendix A is run. Definitions given there.

---

## 5. Pages & widgets

Global filters (**Month, Property, Category** — dropdowns, top of every page) pass through as `WHERE` parameters to every view below with a matching column.

### Page: Complaints
| Widget | Type | Source |
|---|---|---|
| Total Complaints Raised | KPI, split by Property | `v_complaints_weekly`, sum `total_complaints` |
| Open Complaints | KPI, split by Property | `v_complaints_weekly`, sum `open_complaints` |
| Closure % | KPI, split by Property | `v_complaints_weekly`, `closure_pct` |
| Escalation split | Horizontal bar (L1/L2/L3) | `v_escalation_summary` |
| Month-on-Month Complaints | Bar chart, month on x-axis, property as series | `v_complaints_weekly` grouped by month_number |

### Page: Ageing
| Widget | Type | Source |
|---|---|---|
| Category-wise Ageing | Sorted table/bar | `v_ageing_by_category` |
| Avg Resolution Time | KPI | `v_resolution_time` |
| MTTR | KPI, filterable | `v_mttr` |

### Page: Energy Costing
| Widget | Type | Source |
|---|---|---|
| Energy Cost per Occupied Room | KPI (shows total cost until `sold_rooms` populated) | `v_ecor` |
| MoM Electricity/Water Cost | Grouped bar | `raw_eng_bills` filtered to Electricity/Water |

### Page: Costing
| Widget | Type | Source |
|---|---|---|
| Property × Category cost matrix | Pivot, months as columns | `raw_eng_bills` grouped by property + category + month |

### Page: AMC
| Widget | Type | Source |
|---|---|---|
| Active / Expired / Closing Soon | 3 KPIs | `v_amc_status` |
| Yearly Cost by Asset Type | Pie | `v_amc_cost_by_type` |
| Avg AMC Cost | KPI | `v_amc_avg_cost` |
| AMC Status table | Table (all columns) | `raw_eng_amcs` |

### Page: Budget
| Widget | Type | Source |
|---|---|---|
| Total Budget / Actual Spend / % Consumed | 3 KPIs | `raw_eng_looker_data` aggregates |
| Quarter breakdown | Pie | `raw_eng_looker_data` grouped by quarter |

### Standalone widgets (require Appendix A)
| Widget | Type | Source |
|---|---|---|
| Preventive vs Reactive | Split bar/gauge | `v_preventive_vs_reactive` |
| Incidents or Issues | KPI + table | `v_incidents` |
| Trainings & Attendance | KPIs + table | `v_trainings` |

### Live already, no extension needed
| Widget | Type | Source |
|---|---|---|
| Asset Categories & Listing | Table | `v_asset_categories` |

---

## 6. Data gaps to flag back to whoever maintains the sheet

1. **Occupied room count** isn't populated (`raw_eng_bills.sold_rooms` all 0) — blocks accurate ECOR (§4.6).
2. **No Owner field** on any asset-related tab — blocks true ownership tracking in Asset Categories (§4.7).
3. **Preventive Maintenance / Trainings / Incidents / Revenue** aren't synced to BigQuery at all yet — see Appendix A.
4. **AMC `status` column** is manually typed and can go stale — every view above computes status off `end_date` instead.

---

## Appendix A — Optional: sync the remaining 4 tabs

Only needed if you want the full 8-table dashboard now rather than the 4-table version. This is a **Sheets/Apps Script change**, not something Claude Code touches — do it separately, then come back and uncomment §4.8–4.10 above.

Add these entries to `ENG_SHEET_CONFIG` in `Config.gs`:

```javascript
{
  sheetNameCandidates: ['PPM', 'Preventive Maintenance'],
  tableName: 'raw_eng_ppm',
  columns: [
    ['Month', 'month', 'string'],
    ['Description', 'description', 'string'],
    ['Property', 'property', 'string'],
    ['Location', 'location', 'string'],
    ['Planned Date (yyyy-mm-dd)', 'planned_date', 'string'],   // verify real format, then switch to 'date_iso'
    ['Executed Date (yyyy-mm-dd)', 'executed_date', 'string'], // verify real format, then switch to 'date_iso'
    ['Status', 'status', 'string'],
    ['Remarks', 'remarks', 'string'],
  ],
},
{
  sheetNameCandidates: ['Trainings'],
  tableName: 'raw_eng_trainings',
  columns: [
    ['Date', 'training_date', 'string'],   // verify real format before typing as a date
    ['Property Code', 'property_code', 'string'],
    ['Training Category', 'training_category', 'string'],
    ['Remarks', 'remarks', 'string'],
    ['Employee ID', 'employee_id', 'string'],
    ['Employee Name', 'employee_name', 'string'],
    ['Department', 'department', 'string'],
    ['Designation', 'designation', 'string'],
    ['Duration', 'duration_minutes', 'float'],
    ['Trainer', 'trainer', 'string'],
    ['Month', 'month', 'string'],
    ['Attendance', 'attendance_headcount', 'float'], // only reliable on first row of each session group (merge artifact) — don't sum directly
    ['Total Minutes', 'total_minutes', 'float'],      // reliable per row — use this for attendance counting
    ['Man Minutes', 'man_minutes', 'float'],
    ['Week', 'week', 'string'],
  ],
},
{
  sheetNameCandidates: ['Incidents'],
  tableName: 'raw_eng_incidents',
  columns: [
    ['S.no', 'serial_no', 'int'],
    ['Property', 'property', 'string'],
    ['Location', 'location', 'string'],
    ['Date', 'incident_date', 'string'],  // verify real format before typing as a date
    ['Time', 'incident_time', 'string'],
    ['Incident Details', 'incident_details', 'string'],
    ['Action Taken', 'action_taken', 'string'],
    ['Status', 'status', 'string'],
    ['Remarks', 'remarks', 'string'],
  ],
},
{
  sheetNameCandidates: ['Revenue'],
  tableName: 'raw_eng_revenue',
  columns: [
    ['Financial Year', 'financial_year', 'string'],
    ['Month', 'month', 'string'],
    ['Month Number', 'month_number', 'int'],
    ['Property', 'property', 'string'],
    ['Revenue', 'revenue_value', 'float'],
    ['Nights Type', 'nights_type', 'string'],
  ],
},
```

Then run `createEngTablesIfMissing` from `SetupBigQuery.gs` to create the 4 new tables, and `syncAll` (or wait for its next 2-hourly trigger) to populate them. The dates are deliberately left as `'string'` above rather than guessed as `'date_iso'` — same lesson as the `synced_at`/`source_row` issue earlier: check a few real cell values first, then switch the type once you know the actual format, to avoid another silent insert failure.

Once populated, the three deferred views:

```sql
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_preventive_vs_reactive` AS
WITH ppm AS (
  SELECT COUNT(*) AS n FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_ppm` WHERE status = 'Closed'
),
reactive AS (
  SELECT COUNT(*) AS n FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets` WHERE nature = 'Complaint'
)
SELECT ppm.n AS preventive_count, reactive.n AS reactive_count,
       ROUND(ppm.n * 100.0 / NULLIF(ppm.n + reactive.n, 0), 1) AS preventive_pct
FROM ppm, reactive;
-- ⚠️ PPM logging is currently sparse vs complaint volume — this ratio will look extreme until PPM is logged more consistently.

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_incidents` AS
SELECT property, status, COUNT(*) AS incident_count
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_incidents`
GROUP BY property, status;
-- 🚩 Will be empty until someone starts logging there — build the widget now so it's ready.

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_trainings` AS
SELECT month, property_code,
       COUNT(DISTINCT CONCAT(CAST(training_date AS STRING), training_category, property_code)) AS training_sessions,
       COUNTIF(total_minutes > 0) AS attendance_count
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_trainings`
GROUP BY month, property_code;
-- Uses total_minutes > 0 as the "attended" flag, not attendance_headcount (only reliable on the first row of each session group).
```
