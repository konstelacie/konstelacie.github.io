const { DateTime } = require('luxon');
const {
  SLOT_TIMEZONE,
  SLOT_DURATION_MINUTES,
  timeKeyForGridIndex,
} = require('../config/slotGrid');

/**
 * Wall-clock cell (local date + grid row) → UTC instants for DB (same rules as seed-slots.js).
 * @param {string} localDateStr - YYYY-MM-DD
 * @param {number} gridIndex - 0..4
 * @returns {{ startUtc: Date, endUtc: Date }}
 */
function computeUtcRangeForCell(localDateStr, gridIndex) {
  const [y, m, d] = localDateStr.split('-').map(Number);
  const timeKey = timeKeyForGridIndex(gridIndex);
  const [hh, mm] = timeKey.split(':').map(Number);
  const startLocal = DateTime.fromObject(
    { year: y, month: m, day: d, hour: hh, minute: mm },
    { zone: SLOT_TIMEZONE }
  );
  if (!startLocal.isValid) {
    throw new Error(`Invalid slot cell: ${localDateStr} grid ${gridIndex}`);
  }
  const startUtc = startLocal.toUTC();
  const endUtc = startUtc.plus({ minutes: SLOT_DURATION_MINUTES });
  return { startUtc: startUtc.toJSDate(), endUtc: endUtc.toJSDate() };
}

module.exports = { computeUtcRangeForCell };
