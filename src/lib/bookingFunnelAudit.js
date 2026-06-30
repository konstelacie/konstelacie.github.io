const { timeKeyForGridIndex } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');
const { formatMetadataJson } = require('./adminAlertDisplay');
const { formatDateTimeSkForAdmin } = require('./adminLeadEventDisplay');

/** Booking-funnel actions stored in audit_logs (pre-email and technical steps). */
const BOOKING_FUNNEL_AUDIT_ACTIONS = [
  'lock_created',
  'lock_revoked',
  'lock_extended',
  'lock_extend_failed',
  'payment_started',
];

/** Subset most relevant before email_entered lead event. */
const PRE_EMAIL_AUDIT_ACTIONS = ['lock_created', 'lock_revoked', 'lock_extend_failed'];

const BOOKING_FUNNEL_AUDIT_ACTION_SET = new Set(BOOKING_FUNNEL_AUDIT_ACTIONS);

const AUDIT_ACTION_LABELS = {
  lock_created: 'Termín zvolený',
  lock_revoked: 'Zámok zrušený (technické)',
  lock_extended: 'Zámok predĺžený',
  lock_extend_failed: 'Predĺženie zámku zlyhalo',
  payment_started: 'Platba spustená (technické)',
};

const AUDIT_REASON_LABELS = {
  not_found_or_expired: 'zámok expiroval alebo neexistuje',
  email_edit: 'úprava e-mailu',
  slot_not_found: 'termín neexistuje',
  slot_not_open: 'termín nie je otvorený',
  outside_booking_window: 'mimo rezervačného okna',
  slot_already_reserved: 'termín už rezervovaný',
  checkout_pending: 'prebieha platba',
  already_locked: 'termín je zamknutý',
  challenge_invalid: 'neplatná výzva',
};

const LOCK_REVOKED_DEDUPE_MS = 5000;

function auditActionLabel(action) {
  if (!action) return '—';
  return AUDIT_ACTION_LABELS[action] || action;
}

function parseAuditPayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveAuditEmail(row) {
  const payload = parseAuditPayload(row.payload_json);
  const fromPayload = payload?.email != null ? String(payload.email).trim().toLowerCase() : '';
  if (fromPayload) return fromPayload;
  const inferred = row.inferred_email != null ? String(row.inferred_email).trim().toLowerCase() : '';
  return inferred || null;
}

function buildAuditDetailSummary(action, payload) {
  if (!payload) return '—';
  const parts = [];
  if (payload.reason) {
    const label = AUDIT_REASON_LABELS[payload.reason] || String(payload.reason);
    parts.push(label);
  }
  if (payload.context) {
    parts.push(String(payload.context));
  }
  if (payload.paymentType) {
    parts.push(String(payload.paymentType));
  }
  if (payload.checkoutSessionId) {
    const id = String(payload.checkoutSessionId);
    parts.push(id.length > 20 ? `${id.slice(0, 16)}…` : id);
  }
  if (payload.sessionId) {
    const id = String(payload.sessionId);
    parts.push(id.length > 20 ? `${id.slice(0, 16)}…` : id);
  }
  if (payload.funnelName) {
    parts.push(String(payload.funnelName));
  }
  return parts.length ? parts.join(' · ') : '—';
}

/** Map audit_logs booking-funnel row to admin timeline shape (matches lead event rows). */
function mapAdminAuditFunnelRow(row) {
  const payload = parseAuditPayload(row.payload_json);
  const email = resolveAuditEmail(row);
  const gridIndex = row.grid_index != null ? Number(row.grid_index) : null;
  const localDate = row.local_date != null ? mysqlLocalDateToYmd(row.local_date) : null;
  const timeKey = gridIndex != null && Number.isFinite(gridIndex) ? timeKeyForGridIndex(gridIndex) : null;
  const sessionLabel = localDate && timeKey ? `${localDate} ${timeKey}` : null;
  const slotId = row.slot_id != null ? Number(row.slot_id) : null;

  return {
    id: `audit-${row.id}`,
    email: email || '—',
    emailIsMissing: !email,
    eventType: row.action,
    eventTypeLabel: auditActionLabel(row.action),
    occurredAtLabel: formatDateTimeSkForAdmin(row.created_at),
    amountLabel: '—',
    funnelPathLabel: payload?.funnelName ? String(payload.funnelName) : '—',
    slotId,
    sessionLabel: sessionLabel || (slotId != null ? `#${slotId}` : '—'),
    reservationId: null,
    paymentId: null,
    detailSummary: buildAuditDetailSummary(row.action, payload),
    metadataFormatted: formatMetadataJson(row.payload_json),
    sourceUrl: null,
    timelineSource: 'audit',
    sortAt: row.created_at,
    rawId: row.id,
  };
}

/**
 * @param {ReturnType<typeof mapAdminLeadEventRow>[]} leadRows
 * @param {ReturnType<typeof mapAdminAuditFunnelRow>[]} auditRows
 */
function mergeLeadAndAuditTimeline(leadRows, auditRows) {
  const dedupedAudit = auditRows.filter((audit) => {
    if (audit.eventType !== 'lock_revoked') return true;
    const auditTime = new Date(audit.sortAt).getTime();
    if (Number.isNaN(auditTime)) return true;
    return !leadRows.some((lead) => {
      if (lead.eventType !== 'lock_revoked' || lead.slotId !== audit.slotId) return false;
      const leadTime = new Date(lead.sortAt).getTime();
      if (Number.isNaN(leadTime)) return false;
      return Math.abs(leadTime - auditTime) <= LOCK_REVOKED_DEDUPE_MS;
    });
  });

  const merged = [...leadRows, ...dedupedAudit];
  merged.sort((a, b) => {
    const ta = new Date(a.sortAt).getTime();
    const tb = new Date(b.sortAt).getTime();
    if (tb !== ta) return tb - ta;
    const aId = a.rawId ?? a.id ?? 0;
    const bId = b.rawId ?? b.id ?? 0;
    if (typeof aId === 'string' || typeof bId === 'string') {
      return String(bId).localeCompare(String(aId));
    }
    return bId - aId;
  });
  return merged;
}

function listAuditActionOptions() {
  return BOOKING_FUNNEL_AUDIT_ACTIONS.map((code) => ({
    code,
    label: auditActionLabel(code),
    description: '',
  }));
}

function isBookingFunnelAuditAction(action) {
  return typeof action === 'string' && BOOKING_FUNNEL_AUDIT_ACTION_SET.has(action);
}

module.exports = {
  BOOKING_FUNNEL_AUDIT_ACTIONS,
  PRE_EMAIL_AUDIT_ACTIONS,
  LOCK_REVOKED_DEDUPE_MS,
  auditActionLabel,
  mapAdminAuditFunnelRow,
  mergeLeadAndAuditTimeline,
  listAuditActionOptions,
  isBookingFunnelAuditAction,
  resolveAuditEmail,
};
