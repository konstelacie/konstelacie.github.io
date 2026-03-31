/**
 * Phase 2: assign document number, write PDF, send invoice email (idempotent).
 */

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { getPool } = require('../db');
const billingDocumentsRepo = require('../db/repositories/billingDocumentsRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('./emailService');
const { renderBillingPdf } = require('./billingInvoicePdfService');

function billingPdfDir() {
  const custom = config.billing?.pdfStorageDir;
  if (custom) return path.resolve(custom);
  return path.join(process.cwd(), 'storage', 'billing-pdfs');
}

function isValidRecipientEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email === '(unknown)') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function scopeYearFromRow(row) {
  const base = row.paid_at || row.issued_at || row.created_at;
  if (!base) return new Date().getUTCFullYear();
  const d = base instanceof Date ? base : new Date(base);
  return d.getUTCFullYear();
}

async function allocateDocumentNumber(conn, billingDocumentId, year, prefix) {
  const [locked] = await conn.execute(
    'SELECT id, document_number, pdf_storage_ref FROM billing_documents WHERE id = ? FOR UPDATE',
    [billingDocumentId]
  );
  const row = locked[0];
  if (!row) return null;
  if (row.document_number) {
    return row.document_number;
  }

  const [cRows] = await conn.execute(
    'SELECT next_seq FROM billing_document_counters WHERE scope_year = ? FOR UPDATE',
    [year]
  );

  let assigned;
  if (!cRows.length) {
    await conn.execute(
      'INSERT INTO billing_document_counters (scope_year, next_seq) VALUES (?, 2)',
      [year]
    );
    assigned = 1;
  } else {
    assigned = cRows[0].next_seq;
    await conn.execute(
      'UPDATE billing_document_counters SET next_seq = next_seq + 1 WHERE scope_year = ?',
      [year]
    );
  }

  const documentNumber = `${prefix}-${year}-${String(assigned).padStart(5, '0')}`;

  await conn.execute(
    `UPDATE billing_documents
     SET document_number = ?, status = 'issued', issued_at = COALESCE(issued_at, NOW(3))
     WHERE id = ?`,
    [documentNumber, billingDocumentId]
  );

  return documentNumber;
}

/**
 * @param {number} billingDocumentId
 */
async function processBillingDocumentDelivery(billingDocumentId) {
  const pool = getPool();
  if (!pool) {
    console.warn('[billing] processBillingDocumentDelivery: no DB pool');
    return;
  }

  const sendEmailEnabled = config.billing?.sendInvoiceEmail !== false;

  let row = await billingDocumentsRepo.findById(billingDocumentId);
  if (!row) return;

  if (row.pdf_storage_ref && row.email_sent_at) return;
  if (row.pdf_storage_ref && !sendEmailEnabled) return;

  const prefix = config.billing?.documentPrefix || 'CT';

  if (!row.pdf_storage_ref) {
    const conn = await pool.getConnection();
    let documentNumber;
    try {
      await conn.beginTransaction();
      const year = scopeYearFromRow(row);
      documentNumber = await allocateDocumentNumber(conn, billingDocumentId, year, prefix);
      if (!documentNumber) {
        await conn.rollback();
        return;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    row = await billingDocumentsRepo.findById(billingDocumentId);
    if (!row || !row.document_number) return;

    const safeName = `${row.document_number.replace(/[^\w.-]/g, '_')}.pdf`;
    const dir = billingPdfDir();
    await fs.mkdir(dir, { recursive: true });
    const absPath = path.join(dir, safeName);
    const pdfBuffer = await renderBillingPdf(row);
    await fs.writeFile(absPath, pdfBuffer);

    const relRef = path.posix.join('storage', 'billing-pdfs', safeName);

    const [upd] = await pool.execute(
      `UPDATE billing_documents
       SET pdf_storage_ref = ?, pdf_generated_at = NOW(3)
       WHERE id = ? AND pdf_storage_ref IS NULL`,
      [relRef, billingDocumentId]
    );

    if (upd.affectedRows === 0) {
      row = await billingDocumentsRepo.findById(billingDocumentId);
    } else {
      row.pdf_storage_ref = relRef;
      row.pdf_generated_at = new Date();
    }
  }

  if (!sendEmailEnabled) return;

  if (row.email_sent_at) return;

  const alreadyLogged = await emailSentLogRepo.wasAlreadySent(
    'billing-invoice',
    'billing_document',
    billingDocumentId
  );
  if (alreadyLogged) {
    await pool.execute('UPDATE billing_documents SET email_sent_at = NOW(3) WHERE id = ?', [
      billingDocumentId,
    ]);
    return;
  }

  const to = row.customer_email_snapshot;
  if (!isValidRecipientEmail(to)) {
    console.warn('[billing] Invoice email skipped: invalid recipient for document', billingDocumentId);
    return;
  }

  if (!row.pdf_storage_ref) return;

  const absPdf = path.isAbsolute(row.pdf_storage_ref)
    ? row.pdf_storage_ref
    : path.join(process.cwd(), ...row.pdf_storage_ref.split('/'));

  let pdfBuffer;
  try {
    pdfBuffer = await fs.readFile(absPdf);
  } catch (e) {
    console.error('[billing] PDF read failed for email:', billingDocumentId, e.message);
    return;
  }

  const result = await emailService.sendBillingInvoiceEmail(
    { to: to.trim(), documentRow: row, pdfBuffer },
    { entity_type: 'billing_document', entity_id: billingDocumentId }
  );

  if (result.ok && result.messageId) {
    await pool.execute(
      'UPDATE billing_documents SET email_sent_at = NOW(3), email_message_id = ? WHERE id = ?',
      [result.messageId, billingDocumentId]
    );
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function regenerateBillingPdfAdmin(billingDocumentId) {
  const pool = getPool();
  if (!pool) return { ok: false, code: 'NO_DB' };

  const row = await billingDocumentsRepo.findByIdWithPayment(billingDocumentId);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  if (!row.document_number) return { ok: false, code: 'NO_NUMBER' };

  const safeName = `${row.document_number.replace(/[^\w.-]/g, '_')}.pdf`;
  const dir = billingPdfDir();
  await fs.mkdir(dir, { recursive: true });
  const absPath = path.join(dir, safeName);
  const oldRef = row.pdf_storage_ref;

  const buffer = await renderBillingPdf(row);
  await fs.writeFile(absPath, buffer);
  const relRef = path.posix.join('storage', 'billing-pdfs', safeName);

  await pool.execute(
    'UPDATE billing_documents SET pdf_storage_ref = ?, pdf_generated_at = NOW(3) WHERE id = ?',
    [relRef, billingDocumentId]
  );

  if (oldRef && oldRef !== relRef) {
    const oldAbs = path.isAbsolute(oldRef)
      ? oldRef
      : path.join(process.cwd(), ...oldRef.split('/'));
    await fs.unlink(oldAbs).catch(() => {});
  }

  return { ok: true };
}

/**
 * @returns {Promise<{ ok: true, messageId?: string } | { ok: false, code: string }>}
 */
async function resendBillingInvoiceEmailAdmin(billingDocumentId) {
  const pool = getPool();
  if (!pool) return { ok: false, code: 'NO_DB' };

  const row = await billingDocumentsRepo.findById(billingDocumentId);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  if (!row.pdf_storage_ref) return { ok: false, code: 'NO_PDF' };

  if (!isValidRecipientEmail(row.customer_email_snapshot)) {
    return { ok: false, code: 'BAD_EMAIL' };
  }

  const absPdf = path.isAbsolute(row.pdf_storage_ref)
    ? row.pdf_storage_ref
    : path.join(process.cwd(), ...row.pdf_storage_ref.split('/'));

  let pdfBuffer;
  try {
    pdfBuffer = await fs.readFile(absPdf);
  } catch {
    return { ok: false, code: 'PDF_READ' };
  }

  const result = await emailService.sendBillingInvoiceEmail(
    {
      to: row.customer_email_snapshot.trim(),
      documentRow: row,
      pdfBuffer,
      resend: true,
    },
    {
      entity_type: 'billing_document',
      entity_id: billingDocumentId,
      actorType: 'admin',
    }
  );

  if (!result.ok || result.skipped) {
    return { ok: false, code: result.skipped ? 'EMAIL_SKIPPED' : 'SEND_FAILED' };
  }

  await pool.execute(
    'UPDATE billing_documents SET email_sent_at = NOW(3), email_message_id = ? WHERE id = ?',
    [result.messageId ?? null, billingDocumentId]
  );

  return { ok: true, messageId: result.messageId };
}

module.exports = {
  processBillingDocumentDelivery,
  billingPdfDir,
  regenerateBillingPdfAdmin,
  resendBillingInvoiceEmailAdmin,
};
