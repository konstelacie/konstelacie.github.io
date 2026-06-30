const { getPool } = require('../index');
const { logLine } = require('../../lib/structuredLog');
const leadEventsGate = require('../../lib/leadEventsGate');

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
 * Low-level insert — assumes payload already sanitized. Never throws.
 * @param {string} eventType
 * @param {LeadEventPayload} payload
 */
async function insertLeadEvent(eventType, payload) {
  try {
    const pool = getPool();
    if (!pool) return;

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
        payload.email,
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
 * @param {string} eventType
 * @param {LeadEventPayload} [payload]
 */
async function scheduleLeadEventAsync(eventType, payload) {
  try {
    if (!leadEventsGate.shouldScheduleWrite(eventType)) return;

    const pool = getPool();
    if (!pool) return;

    const readiness = await leadEventsGate.getReadiness(pool);
    if (!readiness.table || !readiness.coreMigration) return;
    if (leadEventsGate.requiresActivationMigration(eventType) && !readiness.activationMigration) {
      return;
    }

    const sanitized = leadEventsGate.sanitizePayload(eventType, payload);
    if (!sanitized) return;

    await insertLeadEvent(eventType, sanitized);
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'lead_events_schedule_failed',
      eventType,
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
  void scheduleLeadEventAsync(eventType, payload);
}

/** @deprecated alias for tests — prefer scheduleLeadEvent in application code. */
async function recordLeadEvent(eventType, payload) {
  const sanitized = leadEventsGate.sanitizePayload(eventType, payload);
  if (!sanitized) return;
  await insertLeadEvent(eventType, sanitized);
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
 * @param {object} opts
 */
async function queryLeadEventsForAdmin(pool, opts = {}) {
  const maxLimit = opts.maxLimit ?? ADMIN_LIST_LIMIT_MAX;
  const limitRaw = Number.parseInt(opts.limit, 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), maxLimit)
    : ADMIN_LIST_LIMIT_DEFAULT;
  const offset = Number.isFinite(opts.offset) && opts.offset > 0 ? opts.offset : 0;
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
    conditions.push('le.event_type = ?');
    params.push(opts.eventType);
  }

  if (opts.emailLike) {
    conditions.push("le.email LIKE ? ESCAPE '\\\\'");
    params.push(opts.emailLike);
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

function buildAdminQueryOpts(rawOpts = {}) {
  const { opts, warnings, emailLikePattern } = leadEventsGate.sanitizeAdminListOpts(rawOpts);
  return {
    queryOpts: {
      days: opts.days,
      segment: opts.segment,
      eventType: opts.eventType,
      emailLike: emailLikePattern,
      offset: opts.offset,
      limit: opts.limit,
      maxLimit: opts.maxLimit,
    },
    warnings,
  };
}

/**
 * Paginated lead events for admin UI.
 */
async function listForAdmin(rawOpts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const { queryOpts, warnings } = buildAdminQueryOpts(rawOpts);
  const result = await queryLeadEventsForAdmin(pool, queryOpts);
  return { ...result, warnings };
}

/**
 * Lead events for admin CSV export (same filters, higher cap).
 */
async function listForAdminExport(rawOpts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const { queryOpts } = buildAdminQueryOpts({
    ...rawOpts,
    limit: ADMIN_EXPORT_LIMIT_MAX,
    maxLimit: ADMIN_EXPORT_LIMIT_MAX,
    offset: 0,
  });
  const result = await queryLeadEventsForAdmin(pool, queryOpts);
  return result.rows;
}

/** Active event types for admin filter dropdown. */
async function listActiveEventTypes() {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const allowed = [...leadEventsGate.WIRED_EVENT_TYPES];
  const placeholders = allowed.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT code, description
     FROM lead_event_types
     WHERE is_active = 1 AND code IN (${placeholders})
     ORDER BY code`,
    allowed
  );
  return rows;
}

module.exports = {
  insertLeadEvent,
  recordLeadEvent,
  scheduleLeadEvent,
  listForAdmin,
  listForAdminExport,
  listActiveEventTypes,
  buildAdminQueryOpts,
  ADMIN_LIST_LIMIT_DEFAULT,
  ADMIN_LIST_LIMIT_MAX,
  ADMIN_EXPORT_LIMIT_MAX,
};
