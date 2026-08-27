/**
 * SheetSchema.gs
 * Turns a tab's header row into a safe, deduped list of BigQuery column
 * names. The schema is derived at sync time, not hand-maintained — if
 * someone adds a column in Sheets, the next sync picks it up automatically
 * and BigQueryLoader.gs recreates the table to match.
 */

/**
 * Converts one raw header cell into a safe BigQuery column name:
 * lowercase, strips accents, non [a-z0-9_] -> '_', collapses repeats,
 * no leading digit. Blank headers become col_<position>.
 */
function sanitizeColumnName_(raw, index) {
  var name = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!name) return 'col_' + (index + 1);

  name = name
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!name) return 'col_' + (index + 1);
  if (/^[0-9]/.test(name)) name = '_' + name;
  return name.slice(0, 300);
}

/** De-duplicates column names by appending _2, _3, ... to repeats. */
function dedupeColumnNames_(names) {
  var seen = {};
  return names.map(function (n) {
    if (!seen[n]) { seen[n] = 1; return n; }
    seen[n] += 1;
    return n + '_' + seen[n];
  });
}

/**
 * Reads a tab's header row and returns { columns, headerRowIndex }.
 *
 * All columns are typed STRING in BigQuery by design — this is a raw
 * mirror layer. Source data in this sheet includes #REF! errors,
 * percentages stored as text, and merged-cell artifacts, so casting to
 * FLOAT64/DATE at load time would break the load. Once you've seen the
 * real data flowing in, build typed BigQuery views/marts on top of these
 * raw tables (the same raw -> mart split the PMS pipeline already uses).
 */
function readSheetSchema_(sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Tab not found in spreadsheet: ' + sheetName);

  var headerRow = HEADER_ROW_OVERRIDES[sheetName] || 1;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { columns: [], headerRowIndex: headerRow };

  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var rawNames = headers.map(function (h, i) { return sanitizeColumnName_(h, i); });
  var columns = dedupeColumnNames_(rawNames);

  return { columns: columns, headerRowIndex: headerRow };
}
