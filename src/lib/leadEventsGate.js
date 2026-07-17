const { parseEnvFlag } = require('./envFlag');

/** Migration files required before lead_events writes / admin reads. */
const MIGRATION_CORE = '002_lead_events.sql';
const MIGRATION_TYPE_ACTIVATION = '003_lead_event_types_active.sql';

/** Default when LEAD_EVENTS_* env is unset or invalid. */
const DEFAULT_WRITES_ENABLED = true;
const DEFAULT_ADMIN_ENABLED = true;

/** Event types emitted from application code (must exist in lead_event_types seed). */
const WIRED_EVENT_TYPES = new Set([
  'email_entered',
  'lock_extend_failed',
  'lock_expired',
  'initiate_checkout',
  'checkout_expired',
  'payment_failed',
  'payment_retry',
  'purchase',
  'payment_refunded',
  'payment_path_selected',
  'lock_revoked',
  'assessment_email_unlocked',
]);

/** Newer types — require 003 migration (is_active) before insert. */
const TYPES_REQUIRING_ACTIVATION_MIGRATION = new Set(['payment_path_selected', 'lock_revoked']);

const READINESS_CACHE_MS = 60_000;
const ADMIN_LIST_LIMIT_DEFAULT = 200;
const ADMIN_LIST_LIMIT_MAX = 500;
const ADMIN_EXPORT_LIMIT_MAX = 5000;
const ADMIN_MAX_OFFSET = 5000;
const ADMIN_EMAIL_SEARCH_MAX_LEN = 255;
const ADMIN_UNPAID_CLAMPED_DAYS = 90;
const METADATA_JSON_MAX_BYTES = 16_384;

/** @type {{ checkedAt: number, table: boolean, coreMigration: boolean, activationMigration: boolean } | null} */
let readinessCache = null;

function isWritesEnabled() {
  return parseEnvFlag(process.env.LEAD_EVENTS_ENABLED, DEFAULT_WRITES_ENABLED);
}

function isAdminEnabled() {
  return parseEnvFlag(process.env.LEAD_EVENTS_ADMIN_ENABLED, DEFAULT_ADMIN_ENABLED);
}

function isAllowedEventType(eventType) {
  return typeof eventType === 'string' && WIRED_EVENT_TYPES.has(eventType);
}

function requiresActivationMigration(eventType) {
  return TYPES_REQUIRING_ACTIVATION_MIGRATION.has(eventType);
}

/**
 * Sync pre-check before optional work on hot paths (e.g. extra DB read on revoke).
 */
function shouldScheduleWrite(eventType) {
  if (!isWritesEnabled()) return false;
  return isAllowedEventType(eventType);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function getReadiness(pool) {
  const now = Date.now();
  if (readinessCache && now - readinessCache.checkedAt < READINESS_CACHE_MS) {
    return readinessCache;
  }

  const next = {
    checkedAt: now,
    table: false,
    coreMigration: false,
    activationMigration: false,
  };

  if (!pool) {
    readinessCache = next;
    return next;
  }

  try {
    const [tableRows] = await pool.execute(
      `SELECT 1 AS ok FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'lead_events'
       LIMIT 1`
    );
    next.table = tableRows.length > 0;

    const [migrationRows] = await pool.execute(
      `SELECT filename FROM schema_migrations
       WHERE filename IN (?, ?)`,
      [MIGRATION_CORE, MIGRATION_TYPE_ACTIVATION]
    );
    const applied = new Set(migrationRows.map((r) => r.filename));
    next.coreMigration = applied.has(MIGRATION_CORE);
    next.activationMigration = applied.has(MIGRATION_TYPE_ACTIVATION);
  } catch {
    // leave flags false — callers treat as not ready
  }

  readinessCache = next;
  return next;
}

function clearReadinessCache() {
  readinessCache = null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
async function assertAdminReady(pool) {
  if (!isAdminEnabled()) {
    return { ok: false, reason: 'disabled' };
  }
  if (!pool) {
    return { ok: false, reason: 'no_db' };
  }
  const readiness = await getReadiness(pool);
  if (!readiness.table || !readiness.coreMigration) {
    return { ok: false, reason: 'migration' };
  }
  return { ok: true, readiness };
}

function basicEmailOk(email) {
  if (!email || email.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clampText(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function positiveIntOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function sanitizeMetadata(metadata) {
  if (metadata == null) return null;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  try {
    const json = JSON.stringify(metadata);
    if (json.length > METADATA_JSON_MAX_BYTES) return null;
    return metadata;
  } catch {
    return null;
  }
}

/**
 * Normalize outbound lead-event payload before insert.
 * @param {string} eventType
 * @param {import('../db/repositories/leadEventsRepo').LeadEventPayload} [payload]
 * @returns {import('../db/repositories/leadEventsRepo').LeadEventPayload | null}
 */
function sanitizePayload(eventType, payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!isAllowedEventType(eventType)) return null;

  const email = String(payload.email ?? '')
    .trim()
    .toLowerCase();
  if (!basicEmailOk(email)) return null;

  const amount =
    payload.amount != null && Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : null;
  if (amount != null && (amount < 0 || amount > 1_000_000)) return null;

  const currency = clampText(payload.currency, 3);
  const metadata = sanitizeMetadata(payload.metadata);

  return {
    email,
    formId: clampText(payload.formId, 128),
    sourceUrl: clampText(payload.sourceUrl, 2048),
    amount,
    currency: currency ? currency.toLowerCase() : null,
    slotId: positiveIntOrNull(payload.slotId),
    reservationId: positiveIntOrNull(payload.reservationId),
    paymentId: positiveIntOrNull(payload.paymentId),
    providerEventId: clampText(payload.providerEventId, 255),
    occurredAt: payload.occurredAt ?? null,
    metadata,
    consentMarketing: payload.consentMarketing == null ? null : Boolean(payload.consentMarketing),
  };
}

function escapeLikePattern(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Validate admin list/export filters — caps expensive queries.
 * @param {object} raw
 */
function sanitizeAdminListOpts(raw = {}) {
  const warnings = [];
  const allowedDays = new Set(['7', '30', '90', 'all']);
  const daysRaw = raw.days != null ? String(raw.days).trim() : '';
  let days = allowedDays.has(daysRaw) ? daysRaw : '30';
  if (daysRaw && !allowedDays.has(daysRaw)) {
    warnings.push('invalid_days');
  }

  let segment = raw.segment === 'unpaid' ? 'unpaid' : '';
  if (raw.segment != null && String(raw.segment).trim() !== '' && raw.segment !== 'unpaid') {
    warnings.push('invalid_segment');
  }
  if (segment === 'unpaid' && days === 'all') {
    days = String(ADMIN_UNPAID_CLAMPED_DAYS);
    warnings.push('unpaid_days_clamped');
  }

  let eventType = typeof raw.eventType === 'string' ? raw.eventType.trim() : '';
  if (eventType && !/^[a-z_]{1,64}$/.test(eventType)) {
    eventType = '';
    warnings.push('invalid_event_type');
  }
  if (eventType && !WIRED_EVENT_TYPES.has(eventType)) {
    eventType = '';
    warnings.push('unknown_event_type');
  }

  let email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (email.length > ADMIN_EMAIL_SEARCH_MAX_LEN) {
    email = email.slice(0, ADMIN_EMAIL_SEARCH_MAX_LEN);
    warnings.push('email_truncated');
  }

  const offsetRaw = Number.parseInt(raw.offset, 10);
  let offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  if (raw.offset != null && String(raw.offset).trim() !== '' && !Number.isFinite(offsetRaw)) {
    warnings.push('invalid_offset');
  }
  if (offset > ADMIN_MAX_OFFSET) {
    offset = ADMIN_MAX_OFFSET;
    warnings.push('offset_capped');
  }

  const maxLimitRaw = Number.parseInt(raw.maxLimit, 10);
  const maxLimit =
    Number.isFinite(maxLimitRaw) && maxLimitRaw > 0
      ? Math.min(maxLimitRaw, ADMIN_EXPORT_LIMIT_MAX)
      : ADMIN_LIST_LIMIT_MAX;
  const limitRaw = Number.parseInt(raw.limit, 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, maxLimit)
      : ADMIN_LIST_LIMIT_DEFAULT;
  if (raw.limit != null && String(raw.limit).trim() !== '' && !Number.isFinite(limitRaw)) {
    warnings.push('invalid_limit');
  }

  return {
    opts: {
      days,
      segment: segment || undefined,
      eventType: eventType || undefined,
      email: email || undefined,
      offset,
      limit,
      maxLimit,
    },
    warnings,
    emailLikePattern: email ? `%${escapeLikePattern(email)}%` : undefined,
  };
}

module.exports = {
  MIGRATION_CORE,
  MIGRATION_TYPE_ACTIVATION,
  WIRED_EVENT_TYPES,
  DEFAULT_WRITES_ENABLED,
  DEFAULT_ADMIN_ENABLED,
  ADMIN_LIST_LIMIT_DEFAULT,
  ADMIN_LIST_LIMIT_MAX,
  ADMIN_EXPORT_LIMIT_MAX,
  ADMIN_MAX_OFFSET,
  ADMIN_UNPAID_CLAMPED_DAYS,
  isWritesEnabled,
  isAdminEnabled,
  isAllowedEventType,
  requiresActivationMigration,
  shouldScheduleWrite,
  getReadiness,
  clearReadinessCache,
  assertAdminReady,
  sanitizePayload,
  sanitizeAdminListOpts,
};
