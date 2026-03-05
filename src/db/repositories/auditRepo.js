const { getPool } = require('../index');

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

module.exports = { log };
