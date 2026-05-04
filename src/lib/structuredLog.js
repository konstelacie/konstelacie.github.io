/**
 * One JSON line per event for grep / log aggregators (Phase 3 observability).
 * @param {Record<string, unknown>} payload
 */
function logLine(payload) {
  const line = { ts: new Date().toISOString(), ...payload };
  console.log(JSON.stringify(line));
}

function logDebug(fields) {
  if (String(process.env.DEBUG_LOGS || '').toLowerCase() !== '1') return;
  logLine({ level: 'debug', ...fields });
}

module.exports = { logLine, logDebug };
