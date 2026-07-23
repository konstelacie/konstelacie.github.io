const { timeKeyForGridIndex, SLOT_TIMEZONE } = require('../config/slotGrid');
const { mysqlLocalDateToYmd } = require('./slotApiMap');
const { formatMetadataJson } = require('./adminAlertDisplay');

/** @param {string|null|undefined} funnelName @param {string|null|undefined} funnelCampaign */
function formatFunnelPathShort(funnelName, funnelCampaign) {
  const n = funnelName != null && String(funnelName).trim() !== '' ? String(funnelName).trim() : '';
  const c = funnelCampaign != null && String(funnelCampaign).trim() !== '' ? String(funnelCampaign).trim() : '';
  if (!n && !c) return '—';
  if (n && c) return `${n} / ${c}`;
  return n || c;
}

/** Slovak labels for active lead_event_types (see 002_lead_events.sql). */
const LEAD_EVENT_LABELS = {
  email_entered: 'Zadaný e-mail',
  lock_extend_failed: 'Predĺženie zámku zlyhalo',
  lock_expired: 'Zámok expiroval',
  initiate_checkout: 'Spustená platba',
  checkout_expired: 'Platba expirovala',
  payment_failed: 'Platba zlyhala',
  payment_retry: 'Opakovaná platba',
  payment_path_selected: 'Zvolená platba',
  lock_revoked: 'Zámok zrušený',
  purchase: 'Zakúpené',
  payment_refunded: 'Platba vrátená',
  assessment_email_unlocked: 'Odomknuté hodnotenie',
  sequence_enrolled: 'Zaradenie do e-mailovej sekvencie',
  email_sent: 'Odoslaný marketingový e-mail',
  sequence_completed: 'Dokončená e-mailová sekvencia',
  sequence_unsubscribed: 'Odhlásenie zo sekvencie',
};

const PAYMENT_TYPE_LABELS = {
  deposit: 'Záloha',
  session: 'Plná platba',
};

function formatDateTimeSk(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: SLOT_TIMEZONE,
  }).format(d);
}

function formatAmountEur(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = currency && String(currency).trim() ? String(currency).trim().toUpperCase() : 'EUR';
  try {
    return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: cur }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

function parseMetadata(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function leadEventTypeLabel(code) {
  if (!code) return '—';
  return LEAD_EVENT_LABELS[code] || code;
}

function buildEventDetailSummary(eventType, metadata) {
  const md = parseMetadata(metadata);
  if (!md) return '—';

  const parts = [];
  if (md.paymentType) {
    parts.push(PAYMENT_TYPE_LABELS[md.paymentType] || md.paymentType);
  }
  if (md.reason) {
    parts.push(String(md.reason));
  }
  if (md.checkoutSessionId) {
    const id = String(md.checkoutSessionId);
    parts.push(id.length > 20 ? `${id.slice(0, 16)}…` : id);
  }
  if (md.funnelVideoId) {
    parts.push(`video: ${md.funnelVideoId}`);
  }
  if (md.primaryBottleneck) {
    parts.push(String(md.primaryBottleneck));
  }
  if (md.isDualPrimary && md.secondaryBottleneck) {
    parts.push(`+ ${md.secondaryBottleneck}`);
  }

  return parts.length ? parts.join(' · ') : '—';
}

function mapAdminLeadEventRow(row) {
  const metadata = parseMetadata(row.metadata);
  const funnelCampaign = metadata?.funnelCampaign ?? null;
  const gridIndex = row.grid_index != null ? Number(row.grid_index) : null;
  const localDate = row.local_date != null ? mysqlLocalDateToYmd(row.local_date) : null;
  const timeKey = gridIndex != null && Number.isFinite(gridIndex) ? timeKeyForGridIndex(gridIndex) : null;
  const sessionLabel = localDate && timeKey ? `${localDate} ${timeKey}` : null;

  return {
    id: row.id,
    email: row.email,
    emailIsMissing: false,
    eventType: row.event_type,
    eventTypeLabel: leadEventTypeLabel(row.event_type),
    occurredAtLabel: formatDateTimeSk(row.occurred_at),
    amountLabel: formatAmountEur(row.amount, row.currency),
    funnelPathLabel: formatFunnelPathShort(row.form_id, funnelCampaign),
    slotId: row.slot_id,
    sessionLabel: sessionLabel || (row.slot_id != null ? `#${row.slot_id}` : '—'),
    reservationId: row.reservation_id,
    paymentId: row.payment_id,
    detailSummary: buildEventDetailSummary(row.event_type, row.metadata),
    metadataFormatted: formatMetadataJson(row.metadata),
    sourceUrl: row.source_url || null,
    timelineSource: 'lead',
    sortAt: row.occurred_at,
    rawId: row.id,
  };
}

function mapAdminLeadEventTypeOption(row) {
  return {
    code: row.code,
    label: leadEventTypeLabel(row.code),
    description: row.description || '',
  };
}

/**
 * Group flat event rows (newest first) by email for timeline view.
 * @param {ReturnType<typeof mapAdminLeadEventRow>[]} events
 */
function groupLeadEventsByEmail(events) {
  const map = new Map();
  for (const event of events) {
    const key = event.emailIsMissing ? '—' : event.email;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(event);
  }
  return [...map.entries()].map(([email, items]) => ({
    email,
    events: items,
    lastOccurredAtLabel: items[0]?.occurredAtLabel || '—',
    eventCount: items.length,
  }));
}

module.exports = {
  LEAD_EVENT_LABELS,
  leadEventTypeLabel,
  formatDateTimeSkForAdmin: formatDateTimeSk,
  mapAdminLeadEventRow,
  mapAdminLeadEventTypeOption,
  groupLeadEventsByEmail,
};
