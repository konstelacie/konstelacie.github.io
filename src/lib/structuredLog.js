/**
 * One JSON line per event for grep / log aggregators (Phase 3 observability).
 * @param {Record<string, unknown>} payload
 */
function logLine(payload) {
  const line = { ts: new Date().toISOString(), ...payload };
  console.log(JSON.stringify(line));
}

module.exports = { logLine };
