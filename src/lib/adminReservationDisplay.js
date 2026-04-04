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

/** @param {string|null|undefined} v */
function funnelFieldLabel(v) {
  if (v == null) return '—';
  const s = String(v).trim();
  return s !== '' ? s : '—';
}

/**
 * Compact label for admin list: `pilot / zavist` or `—` when no funnel data.
 * @param {string|null|undefined} funnelName
 * @param {string|null|undefined} funnelCampaign
 */
function formatFunnelPathShort(funnelName, funnelCampaign) {
  const n = funnelName != null && String(funnelName).trim() !== '' ? String(funnelName).trim() : '';
  const c = funnelCampaign != null && String(funnelCampaign).trim() !== '' ? String(funnelCampaign).trim() : '';
  if (!n && !c) return '—';
  if (n && c) return `${n} / ${c}`;
  return n || c;
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
    funnelPathLabel: formatFunnelPathShort(row.funnel_name, row.funnel_campaign),
  };
}

function slotStatusLabel(status) {
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

/** Reservation row: user's choice at booking (deposit = reservation fee only, full = full amount upfront). */
function reservationBookingPaymentLabel(paymentType) {
  switch (paymentType) {
    case 'deposit':
      return 'Rezervačný poplatok';
    case 'full':
      return 'Plná suma vopred';
    default:
      return paymentType || '—';
  }
}

/** Individual payment record (payments.payment_type: deposit | session | topup). */
function paymentRowTypeLabel(paymentType) {
  switch (paymentType) {
    case 'deposit':
      return 'Rezervačný poplatok';
    case 'session':
      return 'Plná platba (sedenie)';
    case 'topup':
      return 'Doplatok';
    default:
      return paymentType || '—';
  }
}

function paymentRowStatusLabel(status) {
  switch (status) {
    case 'pending':
      return 'Čaká';
    case 'completed':
      return 'Zaplatené';
    case 'failed':
      return 'Zlyhalo';
    case 'expired':
      return 'Expirované';
    case 'refunded':
      return 'Vrátené';
    default:
      return status || '—';
  }
}

function computeDetailActions(reservationStatus) {
  return {
    canConfirm: reservationStatus === 'pending_payment' || reservationStatus === 'draft',
    canCancel: ['pending_payment', 'draft', 'confirmed', 'expired'].includes(reservationStatus),
    canExternal: reservationStatus !== 'cancelled',
  };
}

function formatTs(value) {
  if (value == null) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(d).setZone(SLOT_TIMEZONE).toLocaleString(DateTime.DATETIME_SHORT);
}

/**
 * @param {{ reservation: object, slot: object, payments: object[] }} detail
 */
function mapAdminDetail(detail) {
  const { reservation, slot, payments } = detail;
  const timeKey = timeKeyForGridIndex(Number(slot.grid_index));
  const localDate = mysqlLocalDateToYmd(slot.local_date);

  const latestPayment = payments.length ? payments[payments.length - 1] : null;
  const latestPaymentStatus = latestPayment ? latestPayment.status : null;
  const pay = paymentDisplay(latestPaymentStatus, reservation.status);

  let paidAtLabel = '—';
  const completedWithPaid = payments.filter((p) => p.status === 'completed' && p.paid_at);
  if (completedWithPaid.length) {
    let maxDt = completedWithPaid[0].paid_at;
    for (const p of completedWithPaid) {
      const a = p.paid_at instanceof Date ? p.paid_at : new Date(p.paid_at);
      const b = maxDt instanceof Date ? maxDt : new Date(maxDt);
      if (a > b) maxDt = p.paid_at;
    }
    paidAtLabel = formatTs(maxDt);
  }

  let expiredAtLabel = '—';
  const expiredPayments = payments.filter((p) => p.status === 'expired');
  if (expiredPayments.length) {
    const p = expiredPayments[expiredPayments.length - 1];
    const t = p.updated_at || p.created_at;
    expiredAtLabel = formatTs(t);
  }

  const paymentsForTable = payments.map((p) => ({
    id: p.id,
    paymentType: p.payment_type,
    paymentTypeLabel: paymentRowTypeLabel(p.payment_type),
    amountLabel: formatAmountCents(p.amount_cents),
    statusLabel: paymentRowStatusLabel(p.status),
    paidAtLabel: p.paid_at ? formatTs(p.paid_at) : '—',
    providerRef: p.provider_ref || '—',
  }));

  return {
    id: reservation.id,
    email: reservation.email,
    reservationStatus: reservation.status,
    reservationStatusLabel: reservationStatusLabel(reservation.status),
    bookingPaymentLabel: reservationBookingPaymentLabel(reservation.payment_type),
    paymentStatusKey: pay.key,
    paymentStatusLabel: pay.label,
    amountLabel: formatAmountCents(latestPayment ? latestPayment.amount_cents : null),
    sessionLabel: `${localDate} ${timeKey}`,
    createdAtLabel: formatTs(reservation.created_at),
    paidAtLabel,
    expiredAtLabel,
    cancelledAtLabel: reservation.cancelled_at ? formatTs(reservation.cancelled_at) : '—',
    adminNote: reservation.admin_note || '',
    slotStatusLabel: slotStatusLabel(slot.slot_status),
    funnelNameLabel: funnelFieldLabel(reservation.funnel_name),
    funnelCampaignLabel: funnelFieldLabel(reservation.funnel_campaign),
    funnelVideoIdLabel: funnelFieldLabel(reservation.funnel_video_id),
    paymentsForTable,
    actions: computeDetailActions(reservation.status),
  };
}

module.exports = {
  mapReservationListRow,
  mapAdminDetail,
  reservationStatusLabel,
  reservationBookingPaymentLabel,
  formatAmountCents,
  computeDetailActions,
  paymentDisplay,
};
