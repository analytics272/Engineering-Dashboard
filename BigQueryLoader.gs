/**
 * BigQueryLoader.gs
 * Creates/recreates BigQuery tables and loads sheet data into them via
 * the BigQuery Advanced Service (enable it under Services in the Apps
 * Script editor, or via appsscript.json — see the manifest file provided).
 */

/** Ensures the target dataset exists; creates it once if missing. */
function ensureDataset_() {
  try {
    BigQuery.Datasets.get(BQ_PROJECT_ID, BQ_DATASET_ID);
  } catch (e) {
    BigQuery.Datasets.insert({
      datasetReference: { projectId: BQ_PROJECT_ID, datasetId: BQ_DATASET_ID },
      location: BQ_LOCATION
    }, BQ_PROJECT_ID);
    Logger.log('Created dataset ' + BQ_DATASET_ID);
  }
}

/**
 * Drops the table if it exists and recreates it with the given columns,
 * all typed STRING/NULLABLE. Safe because these are full-mirror tables
 * reloaded from the sheet on every sync — there's no BigQuery-side
 * history to lose, and it lets a newly added sheet column show up
 * automatically on the next sync.
 */
function recreateTable_(tableId, columns) {
  var fields = columns.map(function (name) {
    return { name: name, type: 'STRING', mode: 'NULLABLE' };
  });

  try {
    BigQuery.Tables.remove(BQ_PROJECT_ID, BQ_DATASET_ID, tableId);
  } catch (e) {
    // table didn't exist yet — fine, continue
  }

  BigQuery.Tables.insert({
    tableReference: { projectId: BQ_PROJECT_ID, datasetId: BQ_DATASET_ID, tableId: tableId },
    schema: { fields: fields }
  }, BQ_PROJECT_ID, BQ_DATASET_ID);
}

/**
 * Converts one sheet cell to the string stored in BigQuery. Dates/times
 * are serialized as ISO 8601 so they still sort and parse correctly even
 * though the column type is STRING.
 */
function cellToString_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(value);
}

/**
 * Syncs one tab into its mapped BigQuery table:
 *  1. Reads the current header row -> column list (SheetSchema.gs)
 *  2. Reads every data row below the header
 *  3. Recreates the BigQuery table to match today's columns
 *  4. Loads all rows via a WRITE_TRUNCATE load job (NDJSON)
 * The result: the BigQuery table is an exact, live mirror of the tab.
 */
function syncSheetToBigQuery(sheetName) {
  var tableId = SHEET_TABLE_MAP[sheetName];
  if (!tableId) throw new Error('No BigQuery table mapped for tab: ' + sheetName);

  var schema = readSheetSchema_(sheetName);
  var columns = schema.columns;

  ensureDataset_();
  recreateTable_(tableId, columns);

  if (columns.length === 0) {
    Logger.log('Tab "' + sheetName + '" has no columns — table created empty.');
    return;
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var firstDataRow = schema.headerRowIndex + 1;

  var rows = [];
  if (lastRow >= firstDataRow) {
    var values = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, lastCol).getValues();
    values.forEach(function (row) {
      var isBlank = row.every(function (c) { return c === '' || c === null; });
      if (isBlank) return; // these sheets commonly have trailing blank rows
      var obj = {};
      columns.forEach(function (col, i) { obj[col] = cellToString_(row[i]); });
      rows.push(obj);
    });
  }

  if (rows.length === 0) {
    Logger.log('No data rows found in "' + sheetName + '" — table recreated empty.');
    return;
  }

  var ndjson = rows.map(function (r) { return JSON.stringify(r); }).join('\n');
  var blob = Utilities.newBlob(ndjson, 'application/octet-stream', tableId + '.json');

  var job = {
    configuration: {
      load: {
        destinationTable: { projectId: BQ_PROJECT_ID, datasetId: BQ_DATASET_ID, tableId: tableId },
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: 'WRITE_TRUNCATE',
        schema: { fields: columns.map(function (c) { return { name: c, type: 'STRING', mode: 'NULLABLE' }; }) },
        maxBadRecords: 50
      }
    }
  };

  var insertedJob = BigQuery.Jobs.insert(job, BQ_PROJECT_ID, blob);
  Logger.log('Load job started for ' + sheetName + ' -> ' + tableId + ': ' + insertedJob.jobReference.jobId);
}
