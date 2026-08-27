-- =============================================================================
-- Skyla Engineering Dashboard — APPENDIX A views (Spec §4.8–4.10)
--
-- DO NOT run this file until the 4 extra tabs are synced to BigQuery
-- (raw_eng_ppm, raw_eng_trainings, raw_eng_incidents, raw_eng_revenue) —
-- see Appendix A of the spec. Until then these views error on missing tables
-- and the 3 "standalone" widgets stay in their "coming later" state.
-- =============================================================================

-- 4.8  v_preventive_vs_reactive
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
-- PPM logging is currently sparse vs complaint volume — ratio will look extreme.


-- 4.9  v_incidents
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_incidents` AS
SELECT property, status, COUNT(*) AS incident_count
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_incidents`
GROUP BY property, status;
-- Will be empty until someone starts logging there.


-- 4.10  v_trainings
CREATE OR REPLACE VIEW `skyla-analytics.Skyla_Engineering_Automation.v_trainings` AS
SELECT month, property_code,
       COUNT(DISTINCT CONCAT(CAST(training_date AS STRING), training_category, property_code)) AS training_sessions,
       COUNTIF(total_minutes > 0) AS attendance_count
FROM `skyla-analytics.Skyla_Engineering_Automation.raw_eng_trainings`
GROUP BY month, property_code;
-- Uses total_minutes > 0 as the "attended" flag (attendance_headcount is a merge artifact).
