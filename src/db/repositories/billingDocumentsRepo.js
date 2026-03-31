const { getPool } = require('../index');

async function findById(id) {
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute('SELECT * FROM billing_documents WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

module.exports = { findById };
