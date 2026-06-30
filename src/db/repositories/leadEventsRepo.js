const { getPool } = require('../index');
const { logLine } = require('../../lib/structuredLog');

/**
 * @typedef {Object} LeadEventPayload
 * @property {string} email
 * @property {string|null} [formId]
 * @property {string|null} [sourceUrl]
 * @property {number|null} [amount] euros
 * @property {string|null} [currency]
 * @property {number|null} [slotId]
 * @property {number|null} [reservationId]
 * @property {number|null} [paymentId]
 * @property {string|null} [providerEventId]
 * @property {Date|string|null} [occurredAt]
 * @property {object|null} [metadata]
 * @property {boolean|null} [consentMarketing]
 */

/**
 * Insert a lead event on a separate pool connection. Never throws — failures are logged and swallowed.
 * @param {string} eventType
 * @param {LeadEventPayload} [payload]
 * @returns {Promise<void>}
 */
async function recordLeadEvent(eventType, payload) {
  try {
    const pool = getPool();
    if (!pool) return;

    const email = String(payload?.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) return;

    const metadataJson = payload.metadata != null ? JSON.stringify(payload.metadata) : null;
    const occurredAt =
      payload.occurredAt instanceof Date
        ? payload.occurredAt
        : payload.occurredAt
          ? new Date(payload.occurredAt)
          : new Date();

    await pool.execute(
      `INSERT INTO lead_events (
        email, event_type, form_id, source_url, amount, currency,
        slot_id, reservation_id, payment_id, provider_event_id,
        occurred_at, metadata, consent_marketing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id`,
      [
        email,
        eventType,
        payload.formId ?? null,
        payload.sourceUrl ?? null,
        payload.amount != null ? payload.amount : null,
        payload.currency ?? null,
        payload.slotId ?? null,
        payload.reservationId ?? null,
        payload.paymentId ?? null,
        payload.providerEventId ?? null,
        occurredAt,
        metadataJson,
        payload.consentMarketing == null ? null : payload.consentMarketing ? 1 : 0,
      ]
    );
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'lead_events_insert_failed',
      eventType,
      email: payload?.email,
      error: err?.message || String(err),
    });
  }
}

/**
 * Fire-and-forget lead event write (non-blocking for request handlers).
 * @param {string} eventType
 * @param {LeadEventPayload} [payload]
 */
function scheduleLeadEvent(eventType, payload) {
  void recordLeadEvent(eventType, payload);
}

const ADMIN_LIST_LIMIT_DEFAULT = 200;
const ADMIN_LIST_LIMIT_MAX = 500;
const ADMIN_EXPORT_LIMIT_MAX = 5000;
const ADMIN_DAY_FILTERS = { 7: 7, 30: 30, 90: 90 };
const UNPAID_INTENT_EVENT_TYPES = ['email_entered', 'initiate_checkout', 'payment_path_selected'];

function appendUnpaidSegmentCondition(conditions, params, daysKey) {
  const intentPh = UNPAID_INTENT_EVENT_TYPES.map(() => '?').join(', ');
  const subParams = [...UNPAID_INTENT_EVENT_TYPES];
  let intentTime = '';
  let purchaseTime = '';

  if (daysKey !== 'all') {
    const days = ADMIN_DAY_FILTERS[Number(daysKey)];
    if (days) {
      intentTime = 'AND e1.occurred_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)';
      purchaseTime = 'AND e2.occurred_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)';
      subParams.push(days, days);
    }
  }

  conditions.push(`le.email IN (
    SELECT DISTINCT e1.email FROM lead_events e1
    WHERE e1.event_type IN (${intentPh})
    ${intentTime}
    AND NOT EXISTS (
      SELECT 1 FROM lead_events e2
      WHERE e2.email = e1.email AND e2.event_type = 'purchase'
      ${purchaseTime}
    )
  )`);
  params.push(...subParams);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ days?: string, eventType?: string, email?: string, segment?: string, limit?: number, offset?: number }} [opts]
 */
async function queryLeadEventsForAdmin(pool, opts = {}) {
  const maxLimit = opts.maxLimit ?? ADMIN_LIST_LIMIT_MAX;
  const limitRaw = Number.parseInt(opts.limit, 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), maxLimit)
    : ADMIN_LIST_LIMIT_DEFAULT;
  const offsetRaw = Number.parseInt(opts.offset, 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  const fetchLimit = limit + 1;

  const conditions = [];
  const params = [];
  const daysKey = opts.days != null ? String(opts.days) : '30';

  if (daysKey !== 'all') {
    const days = ADMIN_DAY_FILTERS[Number(daysKey)];
    if (days) {
      conditions.push('le.occurred_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)');
      params.push(days);
    }
  }

  if (opts.segment === 'unpaid') {
    appendUnpaidSegmentCondition(conditions, params, daysKey);
  }

  if (opts.eventType) {
    const eventType = String(opts.eventType).trim();
    if (eventType) {
      conditions.push('le.event_type = ?');
      params.push(eventType);
    }
  }

  if (opts.email) {
    const email = String(opts.email).trim().toLowerCase();
    if (email) {
      conditions.push('le.email LIKE ?');
      params.push(`%${email}%`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT
      le.id,
      le.email,
      le.event_type,
      le.form_id,
      le.source_url,
      le.amount,
      le.currency,
      le.slot_id,
      le.reservation_id,
      le.payment_id,
      le.occurred_at,
      le.metadata,
      s.local_date,
      s.grid_index,
      s.start_at_utc,
      s.timezone
    FROM lead_events le
    LEFT JOIN slots s ON s.id = le.slot_id
    ${where}
    ORDER BY le.occurred_at DESC, le.id DESC
    LIMIT ? OFFSET ?`,
    [...params, fetchLimit, offset]
  );

  const hasMore = rows.length > limit;
  return {
    rows: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    limit,
    offset,
  };
}

/**
 * Paginated lead events for admin UI.
 * @param {{ days?: string, eventType?: string, email?: string, segment?: string, limit?: number, offset?: number }} [opts]
 */
async function listForAdmin(opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  return queryLeadEventsForAdmin(pool, opts);
}

/**
 * Lead events for admin CSV export (same filters, higher cap).
 * @param {{ days?: string, eventType?: string, email?: string, segment?: string }} [opts]
 */
async function listForAdminExport(opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const result = await queryLeadEventsForAdmin(pool, {
    ...opts,
    limit: ADMIN_EXPORT_LIMIT_MAX,
    maxLimit: ADMIN_EXPORT_LIMIT_MAX,
    offset: 0,
  });
  return result.rows;
}

/** Active event types for admin filter dropdown. */
async function listActiveEventTypes() {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT code, description
     FROM lead_event_types
     WHERE is_active = 1
     ORDER BY code`
  );
  return rows;
}

module.exports = {
  recordLeadEvent,
  scheduleLeadEvent,
  listForAdmin,
  listForAdminExport,
  listActiveEventTypes,
  ADMIN_LIST_LIMIT_DEFAULT,
  ADMIN_LIST_LIMIT_MAX,
  ADMIN_EXPORT_LIMIT_MAX,
};
