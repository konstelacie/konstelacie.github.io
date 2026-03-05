const { getPool } = require('../index');

async function findOrCreateByEmail(email) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) return existing[0].id;

  const [insert] = await pool.execute('INSERT INTO users (email) VALUES (?)', [email]);
  return insert.insertId;
}

module.exports = { findOrCreateByEmail };
