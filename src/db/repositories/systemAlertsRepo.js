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

module.exports = {
  findOpenByTypeAndEntity,
  createOpen,
};
