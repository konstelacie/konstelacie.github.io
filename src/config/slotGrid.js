/**
 * Single source of truth for the booking grid (Europe/Bratislava).
 * Used by seed, API mapping, and validation. Frontend receives the same
 * times via GET /api/slots `grid.times`.
 */

const SLOT_TIMEZONE = 'Europe/Bratislava';

/** Wall-clock start times; array index = grid row 0..4 */
const SLOT_TIMES = ['08:30', '10:00', '11:30', '13:00', '14:30'];

const SLOT_DURATION_MINUTES = 90;

const GRID_COUNT = SLOT_TIMES.length;

function timeKeyForGridIndex(gridIndex) {
  const i = Number(gridIndex);
  if (!Number.isInteger(i) || i < 0 || i >= SLOT_TIMES.length) {
    throw new Error(`Invalid gridIndex: ${gridIndex}`);
  }
  return SLOT_TIMES[i];
}

function gridIndexForTimeKey(timeKey) {
  const idx = SLOT_TIMES.indexOf(timeKey);
  if (idx === -1) {
    throw new Error(`Unknown timeKey: ${timeKey}`);
  }
  return idx;
}

module.exports = {
  SLOT_TIMEZONE,
  SLOT_TIMES,
  SLOT_DURATION_MINUTES,
  GRID_COUNT,
  timeKeyForGridIndex,
  gridIndexForTimeKey,
};
