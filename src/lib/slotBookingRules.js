const { DateTime } = require('luxon');
const { SLOT_TIMEZONE } = require('../config/slotGrid');

const BOOKING_LEAD_HOURS = 24;

/**
 * @param {{ start_at_utc: Date | string }} slot — DB row or equivalent
 */
function slotPassesBookingWindow(slot) {
  const raw = slot.start_at_utc;
  const start =
    raw instanceof Date
      ? DateTime.fromJSDate(raw, { zone: 'utc' })
      : DateTime.fromJSDate(new Date(raw), { zone: 'utc' });
  if (!start.isValid) return false;
  if (start <= DateTime.utc().plus({ hours: BOOKING_LEAD_HOURS })) return false;
  const local = start.setZone(SLOT_TIMEZONE);
  if (local.weekday > 5) return false;
  return true;
}

module.exports = { slotPassesBookingWindow, BOOKING_LEAD_HOURS };
