/**
 * Triggers.gs
 * Run installEngTriggers() once (manually, from the Apps Script editor) to set up recurring sync:
 *   - syncAll        every 2 hours   (incremental — new rows only, unchanged)
 *   - syncDroplist    daily, 6 AM    (unchanged)
 *   - fullResyncNow   daily, 2-3 AM  (full wipe + reload — see installNightlyFullResyncTrigger below;
 *                                     catches edits to already-synced rows, e.g. a ticket's status
 *                                     flipped Open -> Closed, that the incremental sync can never see
 *                                     since it only scans rows appended after its cursor)
 */
function installEngTriggers() {
  removeEngTriggers(); // avoid duplicates if re-run

  ScriptApp.newTrigger('syncAll')
    .timeBased()
    .everyHours(2)
    .create();

  ScriptApp.newTrigger('syncDroplist')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .inTimezone('Asia/Kolkata')
    .create();

  installNightlyFullResyncTrigger();
}

function removeEngTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAll' || t.getHandlerFunction() === 'syncDroplist') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/**
 * Idempotent, standalone setup for the nightly fullResyncNow() safety net.
 * Only ever inspects/touches triggers whose handler is 'fullResyncNow' — never
 * looks at syncAll or syncDroplist, so it can't disturb them. Runs once
 * nightly, sometime in the 2:00-3:00 AM hour, project timezone (Asia/Kolkata).
 *
 * Safe to call any number of times (directly, or via installEngTriggers()):
 * it deletes any existing fullResyncNow trigger(s) first, then creates
 * exactly one — so re-running setup never produces duplicates.
 */
function installNightlyFullResyncTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'fullResyncNow';
  });
  existing.forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('fullResyncNow')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .inTimezone('Asia/Kolkata')
    .create();

  Logger.log(
    'installNightlyFullResyncTrigger: removed ' + existing.length +
    ' existing fullResyncNow trigger(s); installed 1 nightly trigger (2:00-3:00 AM Asia/Kolkata).'
  );
}
