const { DateTime } = require('luxon');
const { timeKeyForGridIndex, SLOT_TIMEZONE } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');

function reservationStatusLabel(status) {
  switch (status) {
    case 'draft':
      return 'Koncept';
    case 'pending_payment':
      return 'Čaká na platbu';
    case 'confirmed':
      return 'Potvrdené';
    case 'cancelled':
      return 'Zrušené';
    case 'expired':
      return 'Expirované';
    default:
      return status || '—';
  }
}

/**
 * Spec: unpaid | paid | expired (plus sensible extras for ops).
 */
function paymentDisplay(paymentStatus, reservationStatus) {
  if (reservationStatus === 'cancelled') {
    return { key: 'na', label: '—' };
  }
  const p = paymentStatus;
  if (p === 'completed') {
    return { key: 'paid', label: 'Zaplatené' };
  }
  if (p === 'expired') {
    return { key: 'expired', label: 'Expirované' };
  }
  if (p === 'refunded') {
    return { key: 'refunded', label: 'Vrátené' };
  }
  if (p === 'pending' || p === 'failed' || p == null) {
    return { key: 'unpaid', label: 'Nezaplatené' };
  }
  return { key: String(p), label: p };
}

function formatAmountCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  const n = Number(cents) / 100;
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(n);
}

function mapReservationListRow(row) {
  const timeKey = timeKeyForGridIndex(Number(row.grid_index));
  const localDate = mysqlLocalDateToYmd(row.local_date);
  const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);

  const pay = paymentDisplay(row.payment_status, row.reservation_status);

  return {
    id: row.id,
    email: row.email,
    reservationStatus: row.reservation_status,
    reservationStatusLabel: reservationStatusLabel(row.reservation_status),
    paymentStatusKey: pay.key,
    paymentStatusLabel: pay.label,
    amountLabel: formatAmountCents(row.amount_cents),
    createdAtLabel: DateTime.fromJSDate(createdAt)
      .setZone(SLOT_TIMEZONE)
      .toLocaleString(DateTime.DATETIME_SHORT),
    sessionLabel: `${localDate} ${timeKey}`,
  };
}

module.exports = {
  mapReservationListRow,
  reservationStatusLabel,
  formatAmountCents,
};
