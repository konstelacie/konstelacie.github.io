const { getPool } = require('../index');
const {
  BOOKING_FUNNEL_AUDIT_ACTIONS,
  PRE_EMAIL_AUDIT_ACTIONS,
  isBookingFunnelAuditAction,
} = require('../../lib/bookingFunnelAudit');
const leadEventsGate = require('../../lib/leadEventsGate');

const ADMIN_DAY_FILTERS = { 7: 7, 30: 30, 90: 90 };
const ADMIN_LIST_LIMIT_DEFAULT = leadEventsGate.ADMIN_LIST_LIMIT_DEFAULT;

async function log(action, entityType, entityId, payload = null, actorType = 'anon') {
  const pool = getPool();
  if (!pool) return;

  const payloadJson = payload ? JSON.stringify(payload) : null;
  await pool.execute(
    `INSERT INTO audit_logs (actor_type, action, entity_type, entity_id, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [actorType, action, entityType, entityId, payloadJson]
  );
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {object} opts
 */
async function queryBookingFunnelForAdmin(pool, opts = {}) {
  const limit = opts.limit ?? ADMIN_LIST_LIMIT_DEFAULT;
  const offset = opts.offset ?? 0;
  const fetchLimit = limit + 1;

  const actions =
    opts.preEmailOnly === true
      ? PRE_EMAIL_AUDIT_ACTIONS
      : opts.actions?.length
        ? opts.actions.filter(isBookingFunnelAuditAction)
        : BOOKING_FUNNEL_AUDIT_ACTIONS;

  if (!actions.length) {
    return { rows: [], hasMore: false, limit, offset };
  }

  const conditions = ["al.entity_type = 'slot'", `al.action IN (${actions.map(() => '?').join(', ')})`];
  const params = [...actions];

  const daysKey = opts.days != null ? String(opts.days) : '30';
  if (daysKey !== 'all') {
    const days = ADMIN_DAY_FILTERS[Number(daysKey)];
    if (days) {
      conditions.push('al.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)');
      params.push(days);
    }
  }

  if (opts.action && isBookingFunnelAuditAction(opts.action)) {
    conditions.push('al.action = ?');
    params.push(opts.action);
  }

  if (opts.emailLike) {
    conditions.push(`(
      LOWER(JSON_UNQUOTE(JSON_EXTRACT(al.payload_json, '$.email'))) LIKE ? ESCAPE '\\\\'
      OR EXISTS (
        SELECT 1 FROM lead_events le
        WHERE le.slot_id = al.entity_id
          AND le.email LIKE ? ESCAPE '\\\\'
          AND le.occurred_at >= al.created_at
        LIMIT 1
      )
    )`);
    params.push(opts.emailLike, opts.emailLike);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.execute(
    `SELECT
      al.id,
      al.action,
      al.entity_id AS slot_id,
      al.payload_json,
      al.created_at,
      s.local_date,
      s.grid_index,
      s.start_at_utc,
      s.timezone,
      (
        SELECT le.email FROM lead_events le
        WHERE le.slot_id = al.entity_id AND le.occurred_at >= al.created_at
        ORDER BY le.occurred_at ASC, le.id ASC
        LIMIT 1
      ) AS inferred_email
    FROM audit_logs al
    LEFT JOIN slots s ON s.id = al.entity_id
    ${where}
    ORDER BY al.created_at DESC, al.id DESC
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

async function listBookingFunnelForAdmin(opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  return queryBookingFunnelForAdmin(pool, opts);
}

module.exports = {
  log,
  queryBookingFunnelForAdmin,
  listBookingFunnelForAdmin,
  ADMIN_LIST_LIMIT_DEFAULT,
};
