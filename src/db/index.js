const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../config/database');

let pool = null;

const poolConfig = getPoolConfig();
if (poolConfig) {
  pool = mysql.createPool(poolConfig);
}

/**
 * Returns the MySQL connection pool, or null if DB is not configured.
 */
function getPool() {
  return pool;
}

/**
 * Health check: verifies DB connectivity when configured.
 * @returns {Promise<{ ok: boolean, database?: string }>}
 */
async function healthCheck() {
  if (!pool) {
    return { ok: true, database: 'not_configured' };
  }
  try {
    const [rows] = await pool.execute('SELECT 1 AS ok');
    return { ok: rows[0]?.ok === 1, database: 'connected' };
  } catch (err) {
    return { ok: false, database: 'error', message: err.message };
  }
}

/**
 * Gracefully closes the connection pool.
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  healthCheck,
  close,
};
