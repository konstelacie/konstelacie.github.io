const { getPool } = require('../index');

async function findById(id) {
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute('SELECT * FROM billing_documents WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByIdWithPayment(id) {
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT bd.*, p.provider_ref AS payment_provider_ref, p.status AS payment_status
     FROM billing_documents bd
     LEFT JOIN payments p ON p.id = bd.payment_id
     WHERE bd.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

const DEFAULT_ADMIN_LIMIT = 150;

function sanitizeLikeFragment(q) {
  return q.replace(/[%_\\]/g, '');
}

/**
 * @param {string} [rawQ]
 * @param {number} [limit]
 */
async function searchForAdmin(rawQ, limit = DEFAULT_ADMIN_LIMIT) {
  const pool = getPool();
  if (!pool) return [];

  const q = typeof rawQ === 'string' ? rawQ.trim() : '';
  const lim = Math.min(Math.max(Number(limit) || DEFAULT_ADMIN_LIMIT, 1), 500);

  let sql = `
    SELECT bd.*, p.provider_ref AS payment_provider_ref, p.status AS payment_status
    FROM billing_documents bd
    LEFT JOIN payments p ON p.id = bd.payment_id
    WHERE 1 = 1
  `;
  const params = [];

  if (!q) {
    sql += ` ORDER BY bd.created_at DESC LIMIT ?`;
    params.push(lim);
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  const ql = q.toLowerCase();
  if (ql.startsWith('cs_')) {
    sql += ` AND (bd.stripe_checkout_session_id = ? OR p.provider_ref = ?)`;
    params.push(q, q);
  } else if (/^[A-Za-z0-9]+-\d{4}-\d+/i.test(q)) {
    sql += ` AND bd.document_number = ?`;
    params.push(q);
  } else if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10);
    sql += ` AND (bd.id = ? OR bd.reservation_id = ? OR bd.payment_id = ? OR p.id = ?)`;
    params.push(n, n, n, n);
  } else {
    const frag = sanitizeLikeFragment(q);
    if (!frag) {
      sql += ` ORDER BY bd.created_at DESC LIMIT ?`;
      params.push(lim);
      const [rows] = await pool.execute(sql, params);
      return rows;
    }
    sql += ` AND bd.customer_email_snapshot LIKE ?`;
    params.push(`%${frag}%`);
  }

  sql += ` ORDER BY bd.created_at DESC LIMIT ?`;
  params.push(lim);

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function updateNotes(id, notes) {
  const pool = getPool();
  if (!pool) return false;
  const [r] = await pool.execute('UPDATE billing_documents SET notes = ? WHERE id = ?', [notes, id]);
  return r.affectedRows > 0;
}

module.exports = {
  findById,
  findByIdWithPayment,
  searchForAdmin,
  updateNotes,
};
