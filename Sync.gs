/**
 * Sync.gs
 * Generic incremental sync engine driven by ENG_SHEET_CONFIG (Config.gs).
 */

/** Entry point for the recurring trigger — syncs all fact tabs. */
function syncAll() {
  const ss = SpreadsheetApp.openById(ENG_SPREADSHEET_ID);
  ENG_SHEET_CONFIG.forEach(function (cfg) {
    try {
      syncSheetIncremental_(ss, cfg);
    } catch (err) {
      Logger.log('syncAll: FAILED for ' + cfg.tableName + ' -> ' + err);
    }
  });
}

/** Entry point for the recurring trigger — replaces the small reference table wholesale. */
function syncDroplist() {
  const ss = SpreadsheetApp.openById(ENG_SPREADSHEET_ID);
  const cfg = ENG_DROPLIST_CONFIG;
  const sheet = getSheetFlexible_(ss, cfg.sheetNameCandidates);
  const values = sheet.getDataRange().getValues();
  const headerIdx = findHeaderRow_(values, cfg.columns.map(function (c) { return c[0]; }));
  const dataRows = values.slice(headerIdx + 1).filter(function (row) {
    return row.some(function (cell) { return cell !== '' && cell !== null; });
  });

  const colIdx = mapColumnIndexes_(values[headerIdx], cfg.columns);
  const now = new Date().toISOString();
  const rows = dataRows.map(function (row) {
    const record = {};
    cfg.columns.forEach(function (c) {
      const bqCol = c[1], type = c[2];
      record[bqCol] = convertValue_(row[colIdx[bqCol]], type);
    });
    record.synced_at = now;
    return { json: record };
  });

  runQuery_('DELETE FROM `' + BQ_PROJECT_ID + '.' + BQ_DATASET_ID + '.' + cfg.tableName + '` WHERE TRUE');
  insertRowsBatched_(cfg.tableName, rows);
  Logger.log('syncDroplist: replaced ' + rows.length + ' rows in ' + cfg.tableName);
}

/** One-time / on-demand: wipes and reloads every configured fact table from row 1. */
function fullResyncNow() {
  const ss = SpreadsheetApp.openById(ENG_SPREADSHEET_ID);
  ENG_SHEET_CONFIG.forEach(function (cfg) {
    PropertiesService.getScriptProperties().deleteProperty(cursorKey_(cfg.tableName));
    runQuery_('DELETE FROM `' + BQ_PROJECT_ID + '.' + BQ_DATASET_ID + '.' + cfg.tableName + '` WHERE TRUE');
    syncSheetIncremental_(ss, cfg);
  });
  syncDroplist();
}

// ------------------------------------------------------------------
// Core incremental sync for one tab
// ------------------------------------------------------------------
function syncSheetIncremental_(ss, cfg) {
  const sheet = getSheetFlexible_(ss, cfg.sheetNameCandidates);
  const values = sheet.getDataRange().getValues();
  const expectedHeaders = cfg.columns.map(function (c) { return c[0]; });
  const headerIdx = findHeaderRow_(values, expectedHeaders);
  const colIdx = mapColumnIndexes_(values[headerIdx], cfg.columns);

  const props = PropertiesService.getScriptProperties();
  const lastRow = Number(props.getProperty(cursorKey_(cfg.tableName)) || headerIdx); // 0-based index into `values`

  const newRows = [];
  const now = new Date().toISOString();
  for (let r = lastRow + 1; r < values.length; r++) {
    const row = values[r];
    if (!row.some(function (cell) { return cell !== '' && cell !== null; })) continue; // skip blank rows
    const record = {};
    cfg.columns.forEach(function (c) {
      const bqCol = c[1], type = c[2];
      record[bqCol] = convertValue_(row[colIdx[bqCol]], type);
    });
    record.source_row = r + 1; // 1-based, matches the actual sheet row number
    record.synced_at = now;
    newRows.push({ json: record });
  }

  if (newRows.length > 0) {
    insertRowsBatched_(cfg.tableName, newRows);
  }
  props.setProperty(cursorKey_(cfg.tableName), String(values.length - 1));
  Logger.log('syncSheetIncremental_: ' + cfg.tableName + ' +' + newRows.length + ' rows');
}

function cursorKey_(tableName) {
  return 'ENG_CURSOR_' + tableName;
}

// ------------------------------------------------------------------
// Sheet / header helpers
// ------------------------------------------------------------------

/** Returns the first sheet in `ss` whose name matches any of `nameCandidates`. */
function getSheetFlexible_(ss, nameCandidates) {
  for (let i = 0; i < nameCandidates.length; i++) {
    const sheet = ss.getSheetByName(nameCandidates[i]);
    if (sheet) return sheet;
  }
  throw new Error('No matching sheet found for candidates: ' + nameCandidates.join(', '));
}

/**
 * Scans the first 15 rows of `values` and returns the index of the row that best matches
 * `expectedHeaders` (handles blank spacer rows above the real header, and minor header-text
 * truncation, e.g. "Financial Yea" vs "Financial Year").
 */
function findHeaderRow_(values, expectedHeaders) {
  let bestIdx = 0, bestScore = -1;
  const scanRows = Math.min(15, values.length);
  for (let r = 0; r < scanRows; r++) {
    const row = values[r].map(normalizeHeader_);
    let score = 0;
    expectedHeaders.forEach(function (h) {
      const nh = normalizeHeader_(h);
      if (row.some(function (cell) { return cell === nh || cell.indexOf(nh) === 0 || nh.indexOf(cell) === 0; })) {
        score++;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }
  if (bestScore < Math.ceil(expectedHeaders.length / 2)) {
    throw new Error('Could not confidently locate header row (best match ' + bestScore + '/' + expectedHeaders.length + '). Check the tab layout / Config.gs.');
  }
  return bestIdx;
}

function normalizeHeader_(h) {
  return String(h || '').trim().toLowerCase();
}

/** Maps each configured bqColumnName -> the sheet column index it lives in, by fuzzy header match. */
function mapColumnIndexes_(headerRow, columns) {
  const normalized = headerRow.map(normalizeHeader_);
  const idx = {};
  columns.forEach(function (c) {
    const bqCol = c[1], expected = normalizeHeader_(c[0]);
    let found = -1;
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] === expected || normalized[i].indexOf(expected) === 0 || expected.indexOf(normalized[i]) === 0) {
        found = i;
        break;
      }
    }
    if (found === -1) throw new Error('Column "' + c[0] + '" not found in header row: ' + JSON.stringify(headerRow));
    idx[bqCol] = found;
  });
  return idx;
}

// ------------------------------------------------------------------
// Value conversion
// ------------------------------------------------------------------
function convertValue_(raw, type) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '-' || s.toUpperCase() === '#REF!' || s.toUpperCase().indexOf('#REF') === 0) return null;

  switch (type) {
    case 'int': {
      const n = parseInt(s.replace(/,/g, ''), 10);
      return isNaN(n) ? null : n;
    }
    case 'float': {
      const n = parseFloat(s.replace(/,/g, ''));
      return isNaN(n) ? null : n;
    }
    case 'pct': {
      const n = parseFloat(s.replace(/,/g, '').replace('%', ''));
      return isNaN(n) ? null : n / 100;
    }
    case 'date_iso': {
      // sheet already stores yyyy-mm-dd text, or Apps Script may hand back a real Date object
      if (raw instanceof Date) return Utilities.formatDate(raw, 'Etc/UTC', 'yyyy-MM-dd');
      return s;
    }
    case 'date_dmy_hm': {
      // "31-05-2025 14:08" -> ISO 8601
      if (raw instanceof Date) return raw.toISOString();
      const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
      if (!m) return null;
      const iso = m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':00+05:30';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'string':
    default:
      return s.replace(/^\[merged\]\s*/, ''); // strip the literal "[merged]" artifact seen in merged-cell exports
  }
}

// ------------------------------------------------------------------
// BigQuery I/O (Advanced Service — enable "BigQuery API" under Services)
// ------------------------------------------------------------------
function insertRowsBatched_(tableName, rows) {
  for (let i = 0; i < rows.length; i += BQ_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + BQ_INSERT_BATCH_SIZE);
    const request = { rows: batch, skipInvalidRows: false, ignoreUnknownValues: false };
    const response = BigQuery.Tabledata.insertAll(request, BQ_PROJECT_ID, BQ_DATASET_ID, tableName);
    if (response.insertErrors && response.insertErrors.length > 0) {
      throw new Error('BigQuery insertAll errors on ' + tableName + ': ' + JSON.stringify(response.insertErrors));
    }
  }
}

function runQuery_(sql) {
  const job = { configuration: { query: { query: sql, useLegacySql: false } } };
  const result = BigQuery.Jobs.insert(job, BQ_PROJECT_ID);
  BigQueryUtils_waitForJob_(result.jobReference.jobId);
}

function BigQueryUtils_waitForJob_(jobId) {
  let status;
  do {
    Utilities.sleep(1000);
    status = BigQuery.Jobs.get(BQ_PROJECT_ID, jobId).status;
  } while (status.state !== 'DONE');
  if (status.errorResult) {
    throw new Error('BigQuery job ' + jobId + ' failed: ' + JSON.stringify(status.errorResult));
  }
}
