/**
 * Config.gs
 * Central configuration for the "Skyla Engineering Master Data" sheet -> BigQuery sync.
 * Edit the constants below to match your environment; everything else in
 * the other files reads from here.
 */

// The single Google Sheet that holds all Engineering Master Data tabs.
const SPREADSHEET_ID = '1axx2r6GdXMQUP6sTy59Aanx5bRStwB3_N-kFFeU2DH0';

// GCP / BigQuery target
const BQ_PROJECT_ID = 'skyla-analytics';
const BQ_DATASET_ID = 'Skyla_Engineering';   // new dataset, kept separate from Skyla_Sales_Automation
const BQ_LOCATION   = 'US';                  // matches the existing Skyla_Sales_Automation dataset region

/**
 * Map of Sheet tab name -> BigQuery table name.
 * Add/remove rows here if tabs get renamed or new tabs get added later.
 * Columns and types are derived automatically from each tab's header row
 * at sync time (see SheetSchema.gs) — you never need to hand-edit a schema.
 */
const SHEET_TABLE_MAP = {
  'Bills':       'eng_bills',
  'AMCs':        'eng_amcs',
  'Data':        'eng_master_data',
  'Looker_Data': 'eng_looker_data',
  'Droplist':    'eng_droplist'
};

/**
 * Which row holds column headers for a tab, if not row 1.
 * Example: HEADER_ROW_OVERRIDES['Data'] = 2;
 * Leave empty unless a sync run tells you a tab's real header isn't row 1.
 */
const HEADER_ROW_OVERRIDES = {};
