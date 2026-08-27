-- =============================================================================
-- Skyla Engineering Dashboard — CORE BigQuery views (Spec §4.1–4.7)
-- Project : skyla-analytics
-- Dataset : Skyla_Engineering_Automation   (Location: US)
--
-- Run this whole file once in the BigQuery console (or: npm run bq:setup).
-- Every statement is CREATE OR REPLACE VIEW, so re-running is safe.
-- Names are exact and load-bearing — dashboard widgets depend on them.
-- =============================================================================

-- 4.1  v_complaints_weekly — Total Complaints (Weekly)
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_complaints_weekly` AS
SELECT
  week, property, logged_month, month_number,
  COUNT(*) AS total_complaints,
  COUNTIF(status = 'Closed') AS closed_complaints,
  COUNTIF(status = 'Open') AS open_complaints,
  ROUND(COUNTIF(status = 'Closed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS closure_pct
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
GROUP BY week, property, logged_month, month_number;


-- 4.2  v_ageing_by_category — Avg Ageing of Complaint (closed tickets)
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_ageing_by_category` AS
SELECT category, AVG(ageing_minutes) / 60.0 AS avg_ageing_hours
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
WHERE status = 'Closed'
GROUP BY category;


-- 4.3  v_escalation_summary / v_escalation_score — Escalation Level
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_escalation_summary` AS
SELECT escalation_level,
       COUNT(*) AS ticket_count,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`
GROUP BY escalation_level;

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_escalation_score` AS
SELECT AVG(CASE escalation_level WHEN 'L1' THEN 1 WHEN 'L2' THEN 2 WHEN 'L3' THEN 3 END) AS avg_escalation_score
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_tickets`;


-- 4.4  v_resolution_time / v_mttr — Resolution Time & MTTR
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


-- 4.5  v_amc_status / v_amc_cost_by_type / v_amc_avg_cost — AMCs
--      Status is computed off end_date, NOT the sheet's manual status column.
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

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_amc_cost_by_type` AS
SELECT asset_name AS asset_type, SUM(yearly_cost) AS total_yearly_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY asset_name;

CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_amc_avg_cost` AS
SELECT property, AVG(yearly_cost) AS avg_yearly_cost, AVG(per_month_cost) AS avg_monthly_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY property;


-- 4.6  v_ecor — Energy Consumption & Cost per Occupied Room
--      🚩 sold_rooms is currently 0 for every row, so `ecor` is NULL until that
--      column is populated. `energy_cost` works today; wire the widget now.
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_ecor` AS
SELECT property, month,
       SUM(bill_value) AS energy_cost,
       SUM(bill_value) / NULLIF(SUM(sold_rooms), 0) AS ecor
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_bills`
WHERE direct_category IN ('Electricity Charges', 'Water')
GROUP BY property, month;


-- 4.7  v_asset_categories — Asset Categories & Listing (AMC-linked assets only)
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_asset_categories` AS
SELECT property, asset_name AS category, COUNT(*) AS asset_count, SUM(yearly_cost) AS total_cost
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_amcs`
GROUP BY property, asset_name;
