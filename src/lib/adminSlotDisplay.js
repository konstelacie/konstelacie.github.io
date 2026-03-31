const { DateTime } = require('luxon');
const { timeKeyForGridIndex, SLOT_TIMEZONE } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');

function computeAdminSlotActions(row) {
  const slotStatus = row.slot_status;
  const hasRes = row.reservation_id != null;
  const hasPendingCheckout = row.pending_checkout_payment_id != null;

  if (slotStatus === 'cancelled') {
    return { block: false, unblock: false, cancel: false };
  }
  if (slotStatus === 'blocked') {
    return { block: false, unblock: true, cancel: true };
  }
  if (hasRes) {
    return { block: false, unblock: false, cancel: true };
  }
  if (hasPendingCheckout) {
    return { block: false, unblock: false, cancel: true };
  }
  return { block: true, unblock: false, cancel: true };
}

/**
 * Map DB row from listSlotsForAdmin to display fields for the admin UI.
 * @param {object} row
 */
function mapAdminSlotRow(row) {
  const slotStatus = row.slot_status;
  const timeKey = timeKeyForGridIndex(Number(row.grid_index));
  const actions = computeAdminSlotActions(row);

  if (slotStatus === 'cancelled') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'cancelled',
      statusLabel: 'Zrušené',
      email: row.reservation_email || row.lock_email || null,
      actions,
    };
  }
  if (slotStatus === 'blocked') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'blocked',
      statusLabel: 'Zablokované',
      email: null,
      actions,
    };
  }

  if (row.lock_id != null) {
    return {
      id: row.id,
      timeKey,
      statusKey: 'locked',
      statusLabel: 'Uzamknuté',
      email: row.lock_email || null,
      actions,
    };
  }

  if (row.pending_checkout_payment_id != null && row.reservation_id == null) {
    return {
      id: row.id,
      timeKey,
      statusKey: 'locked',
      statusLabel: 'Stripe platba',
      email: null,
      actions,
    };
  }

  if (row.reservation_status === 'draft') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'reserved',
      statusLabel: 'Koncept',
      email: row.reservation_email || null,
      actions,
    };
  }

  if (row.reservation_status === 'pending_payment') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'reserved',
      statusLabel: 'Čaká na platbu',
      email: row.reservation_email || null,
      actions,
    };
  }

  if (row.reservation_status === 'confirmed') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'confirmed',
      statusLabel: 'Potvrdené',
      email: row.reservation_email || null,
      actions,
    };
  }

  return {
    id: row.id,
    timeKey,
    statusKey: 'open',
    statusLabel: 'Voľné',
    email: null,
    actions,
  };
}

/**
 * @param {Array<object>} rows - rows from listSlotsForAdmin
 * @returns {Array<{ date: string, heading: string, slots: ReturnType<mapAdminSlotRow>[] }>}
 */
function groupAdminSlotsByDay(rows, fromIso, toIso, zone = SLOT_TIMEZONE) {
  const byDate = new Map();
  let cursor = DateTime.fromISO(fromIso, { zone }).startOf('day');
  const end = DateTime.fromISO(toIso, { zone }).startOf('day');
  while (cursor <= end) {
    const key = cursor.toISODate();
    byDate.set(key, {
      date: key,
      heading: cursor.setLocale('sk').toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY),
      slots: [],
    });
    cursor = cursor.plus({ days: 1 });
  }

  for (const row of rows) {
    const key = mysqlLocalDateToYmd(row.local_date);
    if (!byDate.has(key)) {
      const dt = DateTime.fromISO(key, { zone }).startOf('day');
      byDate.set(key, {
        date: key,
        heading: dt.setLocale('sk').toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY),
        slots: [],
      });
    }
    byDate.get(key).slots.push(mapAdminSlotRow(row));
  }

  for (const day of byDate.values()) {
    day.slots.sort((a, b) => a.timeKey.localeCompare(b.timeKey));
  }

  return Array.from(byDate.values());
}

module.exports = { mapAdminSlotRow, groupAdminSlotsByDay };
