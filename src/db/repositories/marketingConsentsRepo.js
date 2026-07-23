const { getPool } = require('../index');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    consentGranted: Boolean(row.consent_granted),
    consentSource: row.consent_source,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Grant or refresh marketing consent for an email.
 * @param {{ email: string, source: string, consentedAt?: Date }} input
 */
async function grantConsent(input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const email = normalizeEmail(input.email);
  if (!email) throw new Error('email required');
  const source = String(input.source || '').trim().slice(0, 64) || null;
  const at = input.consentedAt instanceof Date ? input.consentedAt : new Date();

  await pool.execute(
    `INSERT INTO marketing_consents
      (email, consent_granted, consent_source, consented_at, withdrawn_at)
     VALUES (?, 1, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE
       consent_granted = 1,
       consent_source = VALUES(consent_source),
       consented_at = VALUES(consented_at),
       withdrawn_at = NULL`,
    [email, source, at]
  );
}

/**
 * Withdraw marketing consent (unsubscribe). Preserves history via withdrawn_at.
 * @param {string} email
 * @param {Date} [at]
 */
async function withdrawConsent(email, at = new Date()) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('email required');

  await pool.execute(
    `INSERT INTO marketing_consents
      (email, consent_granted, consent_source, consented_at, withdrawn_at)
     VALUES (?, 0, NULL, NULL, ?)
     ON DUPLICATE KEY UPDATE
       consent_granted = 0,
       withdrawn_at = VALUES(withdrawn_at)`,
    [normalized, at]
  );
}

/**
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function hasActiveConsent(email) {
  const pool = getPool();
  if (!pool) return false;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const [rows] = await pool.execute(
    `SELECT consent_granted FROM marketing_consents WHERE email = ? LIMIT 1`,
    [normalized]
  );
  return Boolean(rows[0]?.consent_granted);
}

/**
 * @param {string} email
 */
async function findByEmail(email) {
  const pool = getPool();
  if (!pool) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM marketing_consents WHERE email = ? LIMIT 1`,
    [normalized]
  );
  return mapRow(rows[0]);
}

module.exports = {
  grantConsent,
  withdrawConsent,
  hasActiveConsent,
  findByEmail,
  normalizeEmail,
  mapRow,
};
