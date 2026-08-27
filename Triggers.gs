/**
 * Triggers.gs
 * Run installEngTriggers() once (manually, from the Apps Script editor) to set up recurring sync.
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
}

function removeEngTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAll' || t.getHandlerFunction() === 'syncDroplist') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
