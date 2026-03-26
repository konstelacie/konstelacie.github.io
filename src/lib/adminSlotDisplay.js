const { DateTime } = require('luxon');
const { timeKeyForGridIndex, SLOT_TIMEZONE } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');

/**
 * Map DB row from listSlotsForAdmin to display fields for the admin UI.
 * @param {object} row
 * @returns {{ id: number, timeKey: string, statusKey: string, statusLabel: string, email: string|null }}
 */
function mapAdminSlotRow(row) {
  const slotStatus = row.slot_status;
  const timeKey = timeKeyForGridIndex(Number(row.grid_index));

  if (slotStatus === 'cancelled') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'cancelled',
      statusLabel: 'Zrušené',
      email: row.reservation_email || row.lock_email || null,
    };
  }
  if (slotStatus === 'blocked') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'blocked',
      statusLabel: 'Zablokované',
      email: null,
    };
  }

  if (row.lock_id != null) {
    return {
      id: row.id,
      timeKey,
      statusKey: 'locked',
      statusLabel: 'Uzamknuté',
      email: row.lock_email || null,
    };
  }

  if (row.reservation_status === 'pending_payment') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'reserved',
      statusLabel: 'Čaká na platbu',
      email: row.reservation_email || null,
    };
  }

  if (row.reservation_status === 'confirmed') {
    return {
      id: row.id,
      timeKey,
      statusKey: 'confirmed',
      statusLabel: 'Potvrdené',
      email: row.reservation_email || null,
    };
  }

  return {
    id: row.id,
    timeKey,
    statusKey: 'open',
    statusLabel: 'Voľné',
    email: null,
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
