# Skyla Engineering Dashboard — what each number means

A plain-language reference for every page and widget: **where the data comes from**
and **how the number is calculated**. Companion to the technical spec
(`Skyla_Engineering_Dashboard_BigQuery_Spec.md`) and `DATA-STATUS.md`.

---

## How data flows

```
Google Sheet "Skyla Engineering Master Data"
   │  (Apps Script sync, every 2 hours — the .gs files, not the web app)
   ▼
BigQuery  skyla-analytics.Skyla_Engineering_Automation
   ├─ raw_eng_tickets      ← "Data" / Master Data tab   (complaints)
   ├─ raw_eng_bills        ← "Bills" tab                 (utility & AMC costs)
   ├─ raw_eng_amcs         ← "AMCs" tab                  (contracts)
   ├─ raw_eng_looker_data  ← "Looker_Data" tab           (budget feed)
   └─ dim_eng_droplist     ← "Droplist" tab
   │
   │  SQL views in sql/01_core_views.sql  (v_*)  — pre-aggregated metrics
   ▼
This dashboard  (Next.js, read-only — never writes to BigQuery)
```

The **"Updated …" badge** top-left of every page is `MAX(synced_at)` on
`raw_eng_tickets` — i.e. when the sheet last synced.

## Global filters

Pills in the top bar. They append `WHERE` conditions to that page's queries.

| Filter | Values from | Applies on |
|---|---|---|
| Month | `raw_eng_tickets.logged_month` (e.g. "Aug 25") | Complaints |
| Property | `raw_eng_tickets.property` (KDP, HTC, JHS, BH4, LP, GB, Corporate Office) | Complaints, Ageing, Energy, Costing, AMC, Assets |
| Category | `raw_eng_tickets.category` (Plumbing, Electrical, …) | Complaints, Ageing |
| Quarter | `raw_eng_looker_data.quarter` (Q1–Q4) | **Budget only** |

A page only shows the filters it actually uses.

---

## Page: Complaints

Source: **`v_complaints_weekly`** (built from `raw_eng_tickets`), which pre-counts
tickets per `week × property × logged_month`.

| Widget | Calculation |
|---|---|
| **Total Complaints Raised** | `COUNT(*)` of tickets, split by property. "Unassigned" = tickets with a blank property. |
| **Open Complaints** | count where `status = 'Open'`. (`status` is also `Closed` or `Cancelled`.) |
| **Closure %** | `Closed ÷ Total × 100`. Denominator is every ticket, so `Cancelled` / unassigned rows dilute it slightly. |
| **Escalation Split (L1/L2/L3)** | `v_escalation_summary` — `COUNT(*)` grouped by `escalation_level`. |
| **Month-on-Month Complaints** | `v_complaints_weekly` summed per `month_number`, one bar segment per property. |

## Page: Ageing

"Ageing" = how long a ticket stays open, from `raw_eng_tickets.ageing_minutes`
(a clean numeric column; the text "Ageing in hours" column is ignored).
~19 % of closed tickets have no `ageing_minutes` — those are excluded from averages.

| Widget | Source · Calculation |
|---|---|
| **Avg Resolution Time** | `v_resolution_time` — `AVG(ageing_minutes)/60` per property, closed tickets. Card shows the mean across properties. |
| **MTTR** | `v_mttr` — `SUM(ageing_minutes)/60 ÷ COUNT(*)` per property × category (same maths, finer grouping). |
| **Category-wise Ageing** | `v_ageing_by_category` — `AVG(ageing_minutes)/60` per category, sorted worst-first. |
| **MTTR by Property × Category** | the `v_mttr` rows as a table. |

## Page: Energy Costing

Source: **`raw_eng_bills`** filtered to `direct_category IN ('Electricity Charges','Water')`,
and **`v_ecor`**.

| Widget | Calculation |
|---|---|
| **Energy Cost per Occupied Room (ECOR)** | `SUM(bill_value) ÷ SUM(sold_rooms)`. 🚩 `sold_rooms` is 0 for every row today, so the card shows **total energy cost** instead until that column is populated (then ECOR appears automatically). |
| **Month-on-Month Electricity vs Water** | `SUM(bill_value)` per month, one bar per utility. Months ordered by parsing the "MMM YY" label (`month_number` is empty in the feed). |

## Page: Costing

**Property × Category cost matrix** — `raw_eng_bills`, `SUM(bill_value)`
grouped by property + category, with **months as columns**.

- Rows with no property *and* no category are dropped.
- Rows whose whole-period total is ₹0 are dropped.
- Blank property → "Unassigned", blank category → "Uncategorised".
- Column order is parsed from the "MMM YY" label.

## Page: AMC

Source: **`raw_eng_amcs`** + views `v_amc_status`, `v_amc_cost_by_type`, `v_amc_avg_cost`.

| Widget | Calculation |
|---|---|
| **Active / Closing Soon / Expired** | computed from `end_date`, **not** the sheet's hand-typed `status`: `< today` = Expired, within 60 days = Closing Soon, else Active. |
| **Avg AMC Cost / yr** | `AVG(yearly_cost)` per property; card shows the mean across properties. |
| **Yearly Cost by Asset Type** | `SUM(yearly_cost)` grouped by `asset_name` (Elevator, AC, Generator…). |
| **AMC Status table** | raw contract rows. "Sheet status" column is shown for reference only. |

## Page: Budget

Source: **`raw_eng_looker_data`** (the "Looker_Data" tab — the budget feed).
Amounts are `SUM(amount)`. Filter: **Quarter**.

| Widget | Calculation |
|---|---|
| **Total Amount** | `SUM(amount)`, respecting the Quarter filter. (If the feed ever tags rows "budget"/"actual", this splits into **Total Budget / Actual Spend / % Consumed** automatically.) |
| **Quarter Breakdown** (pie) | `SUM(amount)` per quarter — always full-year, ignores the Quarter filter by design. |
| **Spend by Category** | `SUM(amount)` per `category` (Utilities, Repairs & Maintenance). Null-category and ₹0 rows are hidden. |

## Page: Asset Categories

**`v_asset_categories`** — `COUNT(*)` and `SUM(yearly_cost)` per property × asset type,
from `raw_eng_amcs`. ⚠️ Covers **AMC-linked assets only** (Elevator, AC, Generator,
Internet) — not a full asset inventory, and there is no internal "owner" field,
only `vendor_name`.

---

## Not shown yet

**PPM · Incidents · Training** was removed from the nav — its tables
(`raw_eng_ppm`, `raw_eng_trainings`, `raw_eng_incidents`) aren't synced to BigQuery.
Run Appendix A of the spec, `sql/02_appendix_views.sql`, then re-add the nav link
(one commented line in `components/Nav.tsx`).

## Known upstream data gaps

| Gap | Effect |
|---|---|
| `raw_eng_bills.sold_rooms` = 0 everywhere | ECOR shows total cost, not per-room |
| `raw_eng_bills.month_number` = NULL everywhere | month order is parsed from text instead |
| `raw_eng_tickets` — ~19 % of closed tickets have no `ageing_minutes` | excluded from ageing/MTTR averages |
| `status` has a 3rd value `Cancelled` | sits in the Complaints total, dilutes closure % |
| No asset "owner" field anywhere | Asset Categories shows vendor only |

Flag these to whoever maintains the sheet — the dashboard picks up the fixes with
no code change.
