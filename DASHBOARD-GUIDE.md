# Skyla Engineering Dashboard — what each number means

A plain-language reference: **where the data comes from**, **how each number is
calculated**, and **how the Compare Years / filter system works**. Companion to
the technical spec (`Skyla_Engineering_Dashboard_BigQuery_Spec.md`) and
`DATA-STATUS.md`.

---

## How data flows

```
Google Sheet "Skyla Engineering Master Data"
   │  (Apps Script sync, every 2 hours — the .gs files, not the web app)
   ▼
BigQuery  skyla-analytics.Skyla_Engineering_Automation
   ├─ raw_eng_tickets      ← "Data" / Master Data tab   (complaints, ageing)
   ├─ raw_eng_bills        ← "Bills" tab                 (energy & category costs)
   ├─ raw_eng_amcs         ← "AMCs" tab                  (contracts, assets)
   ├─ raw_eng_looker_data  ← "Looker_Data" tab           (budget feed)
   └─ dim_eng_droplist     ← "Droplist" tab
   │
   │  SQL views in sql/01_core_views.sql  (v_*)  — pre-aggregated metrics
   ▼
This dashboard — 3 pages (Next.js, read-only, never writes to BigQuery)
   ├─ /operations  — Complaints + Ageing
   ├─ /costs       — Energy + Cost matrix + Budget
   └─ /assets      — AMC contracts + Asset categories
```

The **"Updated …" badge** top-left of every page is `MAX(synced_at)` on
`raw_eng_tickets` — i.e. when the sheet last synced.

---

## Data quality: recent fixes (informational)

If you're reconciling this dashboard against Looker Studio numbers from before
these dates, expect them not to match — the underlying `raw_eng_tickets` data was
genuinely wrong until these landed. All three were fixed in `Sync.gs` only;
BigQuery table/view names and everything downstream are unchanged.

1. **Header-mapping bug (fixed).** `mapColumnIndexes_()`/`findHeaderRow_()` had a
   blank-header-cell bug that let every configured field silently collide onto
   the sheet's one unlabeled column (a running row-count in column A). Effect:
   `property`, `status`, `category`, `logged_on`, `closed_on` — and in fact every
   field — were reading that same column, showing small integers ("serial
   numbers") instead of real values. Fixed by making blank header cells
   ineligible to match anything, preferring exact header matches over prefix
   matches, and preventing two fields from ever claiming the same sheet column.
2. **Date parsing bug (fixed).** `convertValue_()`'s `date_dmy_hm` case only
   accepted a 4-digit year and always-2-digit hour (`31-05-2025 14:08`). Sheet
   rows from around Aug '26 onward use a 2-digit year with no leading zero on
   single-digit hours (`12-08-26 9:57`), so ~28% of `logged_on` values (and the
   same rows' `closed_on`) were silently coming through as `NULL`. Fixed by
   accepting both formats.
3. **Merged banner rows (fixed).** The "Data" tab has manual merged divider rows
   between months (e.g. "Aug 26" merged across several columns as a visual
   section break). These have no ticket number and were previously syncing in
   as bogus half-blank ticket rows. `syncSheetIncremental_()` now skips any row
   without a numeric `No.`.

---

## Pages (3, down from 7)

Grouped by business objective so related KPIs, breakdowns and trends sit
together instead of being spread across pages:

| Page | Replaces | Data source |
|---|---|---|
| **Operations** | Complaints + Ageing | `raw_eng_tickets`, `v_complaints_weekly`, `v_mttr` |
| **Costs & Budget** | Energy Costing + Costing + Budget | `raw_eng_bills`, `raw_eng_looker_data`, `v_ecor` |
| **Assets & Contracts** | AMC + Asset Categories | `raw_eng_amcs`, `v_amc_*`, `v_asset_categories` |

Each page follows the same shape, top to bottom: **KPIs → trend → breakdowns →
expandable detail.** Anything not needed at a glance (a full table, a fine-grained
matrix) is behind a "⤢ expand" button that opens an overlay in place — no second
page, no lost context.

## Filters

Pills in the top bar; each page only shows the ones it actually uses (Category
only makes sense on Operations, since it's a ticket-category value; Quarter only
on Costs & Budget). The active filter is always visible in the pill itself.

| Filter | Values from | Shown on |
|---|---|---|
| Month | `raw_eng_tickets.logged_month` (Operations) / `raw_eng_bills.month` (Costs) | Operations, Costs & Budget |
| Property | `raw_eng_tickets.property` (KDP, HTC, JHS, BH4, LP, GB, Corporate Office) | Operations, Costs & Budget, Assets & Contracts |
| Category | `raw_eng_tickets.category` (Plumbing, Electrical, …) | Operations only |
| Quarter | `raw_eng_looker_data.quarter` (Q1–Q4) | Costs & Budget only |

**Every dropdown is populated by a live `SELECT DISTINCT` query at request time**
(`lib/queries.ts getFilterOptions`) — a new month, property or category that
shows up in the sheet appears in the filter the next time the page loads. There
is no hardcoded list anywhere to update.

## Comparison mode — "Compare Years"

A multi-select pill (default: the two most recent years present in the data —
fully computed from the data, never hardcoded). Selecting 2+ years:

- overlays each year as its own line on every trend chart (this year vs last
  year, exactly like the Skyla Sales dashboard's FY-over-FY trend cards);
- drives a bold **▲/▼ delta badge** on every KPI card, comparing the two most
  recent of the selected years — increase is always green, decrease always red;
- combines with every other active filter (Month/Property/Category/Quarter) —
  e.g. pick Property = HTC and Compare 2025 vs 2026, and every number on the
  page is HTC-only, year-over-year.

**Equivalent-period logic:** if the current year only has data through August,
every other selected year is restricted to Jan–Aug too — never a partial year
compared against a full one. If a specific Month is picked (e.g. "Aug 26"),
comparison narrows to that single calendar month across the selected years
instead. A year with no data for the equivalent period shows the metric with no
delta (rather than a fake 0%/∞% swing) — this happens today on the Budget KPI,
since `raw_eng_looker_data` only has one fiscal year of rows so far.

Not shown on **Assets & Contracts**: AMC/asset data is point-in-time (active
contracts *right now*, cost *right now*), not a monthly series, so a
year-over-year overlay wouldn't mean anything there. That page is a compact
snapshot instead.

---

## Page: Operations

*Complaints + Ageing, together — they're the same ticket data at two
grains.*

| Widget | Calculation |
|---|---|
| **Total Complaints** | `COUNT(*)` from `v_complaints_weekly`, split by property in the card's breakdown list. "Unassigned" = blank property (~12% of tickets). |
| **Open Complaints** | count where `status = 'Open'`. (`status` is also `Closed` or `Cancelled`.) |
| **Closure %** | `Closed ÷ Total × 100`. |
| **Avg Resolution Time** | `AVG(ageing_minutes)/60` on closed tickets with `raw_eng_tickets.ageing_minutes` (a clean numeric column — the "Ageing in hours" text column is ignored). Same formula as the old MTTR KPI, so they're shown once, not duplicated. |
| **Complaints Volume Trend** | monthly `SUM(total_complaints)`, one line per Compare-Years selection. |
| **Escalation Split** | donut of `COUNT(*)` by `escalation_level` (L1/L2/L3), current comparison year. |
| **Resolution Time Trend** | monthly avg ageing hours, one line per selected year. |
| **Worst Ageing by Category** | ranked `AVG(ageing_minutes)/60` by category, current year. |
| **MTTR by Property × Category** *(expand)* | `v_mttr` — `SUM(ageing_minutes)/60 ÷ COUNT(*)`; compact view shows the worst 6, expand shows all. |

## Page: Costs & Budget

*Energy Costing + the cost matrix + Budget, together — they're all
`raw_eng_bills` / `raw_eng_looker_data` money.*

| Widget | Calculation |
|---|---|
| **Energy Cost (Elec + Water)** | `SUM(bill_value)` where `direct_category IN ('Electricity Charges','Water')`. |
| **Total Bills Cost** | `SUM(bill_value)`, all categories, all properties; breakdown by property. |
| **Energy Cost / Occupied Room (ECOR)** | spec §4.6: `energy_cost ÷ sold_rooms`. 🚩 `sold_rooms` is 0 for every row today, so this shows total energy cost until that column is populated — no code change needed when it is. |
| **Budget Spend** | `SUM(amount)` from `raw_eng_looker_data`, respecting the Quarter filter. |
| **Total Bills Cost Trend** | monthly `SUM(bill_value)`, one line per selected year. |
| **Electricity vs Water** | donut, current comparison year. |
| **Top Cost Categories** | ranked `SUM(bill_value)` by `raw_eng_bills.category` (the line-item, e.g. "R&M_Elevator_AMC" — finer-grained than the Budget feed's category), current year. |
| **Budget: Quarter Breakdown** | `SUM(amount)` by quarter, current comparison year — always shows every quarter regardless of the Quarter filter (that filter scopes the KPI/category numbers instead). |
| **Property × Category Cost Matrix** *(expand)* | heatmap-shaded `SUM(bill_value)` by property + category, months as columns. Compact view ranks properties by total; rows with no property *and* no category, or a ₹0 total, are dropped. |

## Page: Assets & Contracts

*AMC + Asset Categories, together — one is the contracts, the other is the
assets those contracts cover.*

| Widget | Calculation |
|---|---|
| **Active / Closing Soon / Expired** | computed from `end_date`, **not** the sheet's hand-typed `status`: `< today` = Expired, within 60 days = Closing Soon, else Active. |
| **Avg AMC Cost / yr** | `AVG(yearly_cost)` per property; card shows the mean across properties. |
| **Yearly Cost by Asset Type** | donut of `SUM(yearly_cost)` by `asset_name` (Elevator, AC, Generator…). |
| **Asset Count by Category** | ranked `COUNT(*)`. ⚠️ AMC-linked assets only — not a full inventory, and there's no internal "owner" field, only `vendor_name`. |
| **Expiring Soonest** | next 8 contracts by `end_date`, future-dated only. |
| **Asset Listing** *(expand)* | full property × category breakdown with cost. |
| **AMC Status** *(expand)* | every contract, all columns. "Sheet status" is shown for reference only — the KPIs above are computed from `end_date`. |

---

## Known upstream data gaps

| Gap | Effect |
|---|---|
| `raw_eng_bills.sold_rooms` = 0 everywhere | ECOR shows total cost, not per-room |
| `raw_eng_bills.month_number` = NULL everywhere | month order is parsed from the "MMM YY" text label instead |
| `raw_eng_tickets` — ~19% of closed tickets have no `ageing_minutes` | excluded from ageing/MTTR averages |
| `status` has a 3rd value `Cancelled` | sits in the Complaints total, dilutes closure % slightly |
| `raw_eng_looker_data` covers one fiscal year only so far | Budget's Compare-Years delta has nothing to compare against yet |
| No asset "owner" field anywhere | Assets & Contracts shows vendor only |
| `raw_eng_bills.property` values don't always match `raw_eng_tickets.property` (e.g. "Office" vs "Corporate Office") | property breakdowns on Costs & Budget may not line up 1:1 with Operations |

Flag these to whoever maintains the sheet — the dashboard picks up the fixes with
no code change.
