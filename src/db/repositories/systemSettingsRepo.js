const { getPool } = require('../index');

/**
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getValue(key) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows[0]?.setting_value ?? null;
}

/**
 * @param {string} key
 * @returns {Promise<Date|null>}
 */
async function getDateValue(key) {
  const raw = await getValue(key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} key
 * @param {string} value
 */
async function setValue(key, value) {
  const pool = getPool();
  if (!pool) return;

  await pool.execute(
    `INSERT INTO system_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP(3)`,
    [key, value]
  );
}

/**
 * @param {string} key
 * @param {Date} date
 */
async function setDateValue(key, date) {
  await setValue(key, date.toISOString());
}

module.exports = {
  getValue,
  getDateValue,
  setValue,
  setDateValue,
};
