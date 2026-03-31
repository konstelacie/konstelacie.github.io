const { DateTime } = require('luxon');
const { timeKeyForGridIndex, SLOT_TIMEZONE, SLOT_TIMES } = require('../config/slotGrid');

/**
 * MySQL DATE → YYYY-MM-DD in business timezone. Do not use Date#toISOString() for the
 * date part: local calendar midnight in Europe/Bratislava maps to the previous UTC day.
 */
function mysqlLocalDateToYmd(v) {
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    return DateTime.fromJSDate(v).setZone(SLOT_TIMEZONE).toISODate();
  }
  return String(v).slice(0, 10);
}

/**
 * Map a slots table row (with optional lock columns) to the public API slot shape.
 */
function mapSlotRowToApi(r, extras = {}) {
  const localDate = mysqlLocalDateToYmd(r.local_date);
  const gridIndex = Number(r.grid_index);
  const hasLock = r.lock_id != null;
  const hasPendingCheckout = r.pending_checkout_payment_id != null;
  const hasReservation = r.active_reservation_id != null;
  return {
    id: r.id,
    localDate,
    gridIndex,
    timeKey: timeKeyForGridIndex(gridIndex),
    timezone: r.timezone,
    startAt: r.start_at_utc.toISOString(),
    endAt: r.end_at_utc.toISOString(),
    status: r.status,
    capacity: r.capacity,
    isLocked: extras.isLocked ?? (hasLock || hasPendingCheckout),
    isMyLock: extras.isMyLock ?? false,
    lockExpiresAt:
      extras.lockExpiresAt ?? (r.lock_expires_at ? r.lock_expires_at.toISOString() : null),
    isReserved: extras.isReserved ?? hasReservation,
  };
}

function gridMetadata() {
  return { timezone: SLOT_TIMEZONE, times: [...SLOT_TIMES] };
}

module.exports = { mysqlLocalDateToYmd, mapSlotRowToApi, gridMetadata };
