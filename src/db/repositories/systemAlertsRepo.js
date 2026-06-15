const { getPool } = require('../index');

/**
 * @param {string} type
 * @param {string|null} entityType
 * @param {number|null} entityId
 */
async function findOpenByTypeAndEntity(type, entityType, entityId) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT id, severity, type, entity_type, entity_id, title, message, status, created_at, metadata_json
     FROM system_alerts
     WHERE type = ? AND entity_type <=> ? AND entity_id <=> ? AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [type, entityType ?? null, entityId ?? null]
  );
  return rows[0] || null;
}

/**
 * @param {object} params
 * @param {'info'|'warning'|'critical'} params.severity
 * @param {string} params.type
 * @param {string} [params.entityType]
 * @param {number} [params.entityId]
 * @param {string} params.title
 * @param {string} params.message
 * @param {object} [params.metadata]
 */
async function createOpen({
  severity = 'critical',
  type,
  entityType,
  entityId,
  title,
  message,
  metadata,
}) {
  const pool = getPool();
  if (!pool) return null;

  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const [result] = await pool.execute(
    `INSERT INTO system_alerts (severity, type, entity_type, entity_id, title, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      severity,
      type,
      entityType ?? null,
      entityId ?? null,
      title,
      message,
      metadataJson,
    ]
  );
  return result.insertId;
}

async function getOpenCriticalCount() {
  const pool = getPool();
  if (!pool) return 0;

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM system_alerts
     WHERE severity = 'critical' AND status = 'open'`
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function getAlerts() {
  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, severity, type, entity_type, entity_id, title, message, status,
            created_at, updated_at, acknowledged_at, acknowledged_by,
            resolved_at, resolved_by, metadata_json
     FROM system_alerts
     ORDER BY created_at DESC`
  );
  return rows;
}

async function findById(id) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT id, severity, type, entity_type, entity_id, title, message, status,
            created_at, updated_at, acknowledged_at, acknowledged_by,
            resolved_at, resolved_by, metadata_json
     FROM system_alerts
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function acknowledgeAlert(id) {
  const pool = getPool();
  if (!pool) return { ok: false, code: 'NO_DB' };

  const [result] = await pool.execute(
    `UPDATE system_alerts
     SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status = 'open'`,
    [id]
  );
  if (result.affectedRows === 0) {
    const existing = await findById(id);
    if (!existing) return { ok: false, code: 'NOT_FOUND' };
    return { ok: false, code: 'INVALID_STATE' };
  }
  return { ok: true };
}

async function resolveAlert(id) {
  const pool = getPool();
  if (!pool) return { ok: false, code: 'NO_DB' };

  const [result] = await pool.execute(
    `UPDATE system_alerts
     SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status IN ('open', 'acknowledged')`,
    [id]
  );
  if (result.affectedRows === 0) {
    const existing = await findById(id);
    if (!existing) return { ok: false, code: 'NOT_FOUND' };
    return { ok: false, code: 'INVALID_STATE' };
  }
  return { ok: true };
}

module.exports = {
  findOpenByTypeAndEntity,
  createOpen,
  getOpenCriticalCount,
  getAlerts,
  findById,
  acknowledgeAlert,
  resolveAlert,
};
