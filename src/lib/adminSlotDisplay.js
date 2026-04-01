const { DateTime } = require('luxon');
const { timeKeyForGridIndex, SLOT_TIMEZONE } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');
const { reservationStatusLabel, formatAmountCents, paymentDisplay } = require('./adminReservationDisplay');

function slotStatusDbLabel(status) {
  switch (status) {
    case 'open':
      return 'Voľný';
    case 'blocked':
      return 'Zablokovaný';
    case 'cancelled':
      return 'Zrušený';
    default:
      return status || '—';
  }
}

function pickPrimaryReservationForActions(reservations) {
  const order = ['confirmed', 'pending_payment', 'draft'];
  for (const st of order) {
    const r = reservations.find((x) => x.status === st);
    if (r) return r;
  }
  return null;
}

function formatTsLocal(value) {
  if (value == null) return '—';
  const asDate = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(asDate).setZone(SLOT_TIMEZONE).setLocale('sk').toLocaleString(DateTime.DATETIME_SHORT);
}

/**
 * @param {{ slotRow: object, reservations: object[] }} raw from slotsRepo.getAdminDetailById
 */
function mapAdminSlotDetail(raw) {
  const { slotRow, reservations } = raw;
  const primary = pickPrimaryReservationForActions(reservations);
  const synthetic = {
    ...slotRow,
    reservation_id: primary ? primary.id : null,
    reservation_email: primary ? primary.email : null,
    reservation_status: primary ? primary.status : null,
  };
  const summary = mapAdminSlotRow(synthetic);
  const localDate = mysqlLocalDateToYmd(slotRow.local_date);
  const timeKey = timeKeyForGridIndex(Number(slotRow.grid_index));

  const lock =
    slotRow.lock_id != null
      ? {
          email: slotRow.lock_email || '—',
          expiresAtLabel: formatTsLocal(slotRow.lock_expires_at),
        }
      : null;

  const pendingCheckout =
    slotRow.pending_checkout_payment_id != null
      ? {
          id: slotRow.pending_checkout_payment_id,
          providerRef: slotRow.pending_checkout_provider_ref || '—',
          amountLabel: formatAmountCents(slotRow.pending_checkout_amount_cents),
          expiresAtLabel: formatTsLocal(slotRow.pending_checkout_expires_at),
        }
      : null;

  const primaryId = primary ? primary.id : null;
  const reservationRows = reservations.map((r) => ({
    id: r.id,
    email: r.email,
    statusKey: r.status,
    statusLabel: reservationStatusLabel(r.status),
    createdAtLabel: formatTsLocal(r.created_at),
    isPrimary: primaryId != null && r.id === primaryId,
  }));

  return {
    id: slotRow.id,
    localDate,
    timeKey,
    sessionLabel: `${localDate} ${timeKey}`,
    startAtLabel: formatTsLocal(slotRow.start_at_utc),
    endAtLabel: formatTsLocal(slotRow.end_at_utc),
    timezone: slotRow.timezone || SLOT_TIMEZONE,
    capacity: slotRow.capacity,
    slotStatusRaw: slotRow.slot_status,
    slotStatusDbLabel: slotStatusDbLabel(slotRow.slot_status),
    summary,
    lock,
    pendingCheckout,
    reservations: reservationRows,
    actions: summary.actions,
  };
}

function paymentDisplayForAdminSlotRow(row) {
  if (row.reservation_id != null && row.reservation_status) {
    return paymentDisplay(row.reservation_payment_status, row.reservation_status);
  }
  if (row.pending_checkout_payment_id != null && row.reservation_id == null) {
    return paymentDisplay(row.pending_checkout_payment_status, null);
  }
  return null;
}

function withPaymentLine(row, summary) {
  const pay = paymentDisplayForAdminSlotRow(row);
  if (pay && pay.label !== '—') {
    return { ...summary, paymentStatusKey: pay.key, paymentStatusLabel: pay.label };
  }
  return summary;
}

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
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'cancelled',
      statusLabel: 'Zrušené',
      email: row.reservation_email || row.lock_email || null,
      actions,
    });
  }
  if (slotStatus === 'blocked') {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'blocked',
      statusLabel: 'Zablokované',
      email: null,
      actions,
    });
  }

  if (row.lock_id != null) {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'locked',
      statusLabel: 'Uzamknuté',
      email: row.lock_email || null,
      actions,
    });
  }

  if (row.pending_checkout_payment_id != null && row.reservation_id == null) {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'locked',
      statusLabel: 'Stripe platba',
      email: null,
      actions,
    });
  }

  if (row.reservation_status === 'draft') {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'reserved',
      statusLabel: 'Koncept',
      email: row.reservation_email || null,
      actions,
    });
  }

  if (row.reservation_status === 'pending_payment') {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'reserved',
      statusLabel: 'Čaká na platbu',
      email: row.reservation_email || null,
      actions,
    });
  }

  if (row.reservation_status === 'confirmed') {
    return withPaymentLine(row, {
      id: row.id,
      timeKey,
      statusKey: 'confirmed',
      statusLabel: 'Potvrdené',
      email: row.reservation_email || null,
      actions,
    });
  }

  return withPaymentLine(row, {
    id: row.id,
    timeKey,
    statusKey: 'open',
    statusLabel: 'Voľné',
    email: null,
    actions,
  });
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

module.exports = {
  mapAdminSlotRow,
  groupAdminSlotsByDay,
  mapAdminSlotDetail,
};
