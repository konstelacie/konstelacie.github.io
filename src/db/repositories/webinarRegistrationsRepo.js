const crypto = require('crypto');
const { getPool } = require('../index');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    startAtUtc: row.start_at_utc,
    endAtUtc: row.end_at_utc,
    timezone: row.timezone,
    accessToken: row.access_token,
    status: row.status,
    selectionType: row.selection_type,
    selectionKey: row.selection_key,
    createdAt: row.created_at,
  };
}

async function findByAccessToken(accessToken) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  if (!token) return null;

  const [rows] = await pool.execute(
    `SELECT id, email, start_at_utc, end_at_utc, timezone, access_token, status,
            selection_type, selection_key, created_at
     FROM webinar_registrations
     WHERE access_token = ? AND status = 'registered'
     LIMIT 1`,
    [token]
  );
  return mapRow(rows[0] ?? null);
}

async function findByEmailAndStart(email, startAtUtc) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const norm = normalizeEmail(email);
  if (!norm) return null;

  const [rows] = await pool.execute(
    `SELECT id, email, start_at_utc, end_at_utc, timezone, access_token, status,
            selection_type, selection_key, created_at
     FROM webinar_registrations
     WHERE email = ? AND start_at_utc = ? AND status = 'registered'
     LIMIT 1`,
    [norm, startAtUtc]
  );
  return mapRow(rows[0] ?? null);
}

/**
 * @param {object} input
 * @param {string} input.email
 * @param {Date|string} input.startAtUtc
 * @param {Date|string} input.endAtUtc
 * @param {string} input.timezone
 * @param {'earliest'|'preset'|'custom'} input.selectionType
 * @param {string|null} input.selectionKey
 */
async function createRegistration(input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const email = normalizeEmail(input.email);
  const accessToken = crypto.randomUUID();

  const [result] = await pool.execute(
    `INSERT INTO webinar_registrations
       (email, start_at_utc, end_at_utc, timezone, access_token, selection_type, selection_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      email,
      input.startAtUtc,
      input.endAtUtc,
      input.timezone,
      accessToken,
      input.selectionType,
      input.selectionKey,
    ]
  );

  return findById(result.insertId);
}

async function findById(id) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT id, email, start_at_utc, end_at_utc, timezone, access_token, status,
            selection_type, selection_key, created_at
     FROM webinar_registrations WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapRow(rows[0] ?? null);
}

/**
 * Registrations due for reminder email (start within N minutes, not yet started).
 * @param {number} minutesBeforeStart
 */
async function findDueForReminder(minutesBeforeStart) {
  const minutes = Number(minutesBeforeStart);
  if (!Number.isInteger(minutes) || minutes < 1) return [];

  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, email, start_at_utc, end_at_utc, timezone, access_token
     FROM webinar_registrations
     WHERE status = 'registered'
       AND start_at_utc > NOW(3)
       AND start_at_utc <= DATE_ADD(NOW(3), INTERVAL ? MINUTE)`,
    [minutes]
  );
  return rows;
}

module.exports = {
  normalizeEmail,
  findByAccessToken,
  findByEmailAndStart,
  createRegistration,
  findById,
  findDueForReminder,
};
