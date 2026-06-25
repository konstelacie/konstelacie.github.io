const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { DateTime } = require('luxon');
const db = require('../db');
const config = require('../config');
const paymentBackend = require('../config/paymentBackend');
const { logLine, logDebug } = require('../lib/structuredLog');
const krosClient = require('./krosClient');
const systemAlertService = require('./systemAlertService');
const { lineItemNameForDocumentType } = require('./billingDocumentService');

/** MySQL DATE → YYYY-MM-DD for KROS; same idea as mysqlLocalDateToYmd (avoid UTC day from toISOString). */
function asIsoDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).setZone('Europe/Bratislava').toISODate();
  }
  return null;
}

function nowMinusMinutes(minutes) {
  return Date.now() - minutes * 60 * 1000;
}

function stringifyJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function bodyForKrosErrorMessage(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  return stringifyJson(body) || String(body);
}

function krosHttpFailureMessage(status, body) {
  const detail = bodyForKrosErrorMessage(body);
  const msg = detail ? `KROS HTTP ${status}: ${detail}` : `KROS HTTP ${status}`;
  return msg.slice(0, 4000);
}

function normalizeMoneyFromCents(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function billingPdfDir() {
  const custom = config.billing?.pdfStorageDir;
  if (custom) return path.resolve(custom);
  return path.join(process.cwd(), 'storage', 'billing-pdfs');
}

async function stampPdfWithLogo(pdfBuffer) {
  const logoPath = path.join(process.cwd(), 'src', 'assets', 'img', 'paid.png');
  let logoBytes;
  try {
    logoBytes = await fs.readFile(logoPath);
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'kros_pdf_stamp_logo_missing',
      logoPath,
      error: err?.message || String(err),
    });
    return pdfBuffer;
  }

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pngImage = await pdfDoc.embedPng(logoBytes);

  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { height } = firstPage.getSize();

  const logoWidth = 120;
  const logoHeight = (pngImage.height / pngImage.width) * logoWidth;
  firstPage.drawImage(pngImage, {
    x: 20,
    y: height - logoHeight - 20,
    width: logoWidth,
    height: logoHeight,
    opacity: 1,
  });

  const stampedBytes = await pdfDoc.save();
  return Buffer.from(stampedBytes);
}

/** Printed on KROS invoice before / after line items (úvodný / záverečný text). */
const KROS_INVOICE_OPENING_CLOSING_TEXT = '[UHRADENÉ]';

/** Číselný rad faktúr: OF (prod), or e.g. T-OF when KROS_SEQUENCE_PREFIX_TEST=T. */
function resolveNumberingSequence(prefix) {
  const base = 'OF';
  const p = String(prefix || '').trim();
  return p ? `${p}-${base}` : base;
}

async function loadBillingDocumentContext(pool, billingDocumentId) {
  const [rows] = await pool.execute(
    `SELECT bd.*,
            bdl.name AS line_name,
            bdl.amount AS line_amount,
            bdl.measure_unit AS line_measure_unit,
            bdl.vat_rate AS line_vat_rate,
            bdl.total_price_incl_vat_cents AS line_total_price_incl_vat_cents,
            ad.amount_gross_cents AS advance_amount_gross_cents
     FROM billing_documents bd
     LEFT JOIN billing_document_lines bdl ON bdl.billing_document_id = bd.id
     LEFT JOIN billing_documents ad ON ad.id = bd.advance_document_id
     WHERE bd.id = ?
     ORDER BY bdl.line_no ASC
     LIMIT 1`,
    [billingDocumentId]
  );
  return rows[0] || null;
}

function buildKrosPayload(row, backend) {
  const isCompany = Number(row.customer_is_company) === 1;
  const externalId = row.kros_external_id || crypto.randomUUID();
  const invoiceType = row.document_type === 'advance' ? 2 : 0;
  const advancePaymentDeduction =
    row.document_type === 'settlement' && row.advance_amount_gross_cents != null
      ? normalizeMoneyFromCents(row.advance_amount_gross_cents)
      : 0;
  const numberingSequence = resolveNumberingSequence(paymentBackend.krosSequencePrefix(backend));

  const address = {
    businessName: isCompany ? row.customer_company_name || row.customer_name : row.customer_name,
    contactName: isCompany ? row.customer_name : null,
    street: isCompany ? row.customer_street || null : null,
    city: isCompany ? row.customer_city || null : null,
    postCode: isCompany ? row.customer_post_code || null : null,
  };
  if (isCompany) {
    address.country = (row.customer_country || 'SK').toUpperCase().slice(0, 2) || 'SK';
  }

  return {
    data: {
      externalId,
      partner: {
        address,
        registrationId: row.customer_ico || null,
        taxId: row.customer_dic || null,
        vatId: row.customer_ic_dph || null,
        email: row.customer_email_snapshot || null,
      },
      items: [
        {
          name: lineItemNameForDocumentType(row.document_type),
          amount: Number(row.line_amount || 1),
          measureUnit: row.line_measure_unit || 'ks',
          vatRate: Number(row.line_vat_rate || 0),
          totalPriceInclVat: normalizeMoneyFromCents(row.line_total_price_incl_vat_cents || 0),
        },
      ],
      vatPayerType: Number(row.vat_payer_type || 1),
      culture: 'sk-SK',
      currency: 'EUR',
      exchangeRate: 1,
      issueDate: asIsoDate(row.issue_date),
      dueDate: asIsoDate(row.due_date),
      deliveryDate: asIsoDate(row.delivery_date),
      paymentType: 'Online platba',
      bankAccount: {
        iban: row.supplier_iban || '',
        swift: row.supplier_swift || '',
        isForeign: false,
      },
      numberingSequence,
      documentNumber: '',
      invoiceType,
      advancePaymentDeduction,
      openingText: KROS_INVOICE_OPENING_CLOSING_TEXT,
      closingText: KROS_INVOICE_OPENING_CLOSING_TEXT,
    },
  };
}

/** KROS Payment.paymentType — CardPayment = 2 (Stripe / online card). */
const KROS_PAYMENT_TYPE_CARD = 2;

async function loadBillingDocumentForPaymentSync(pool, billingDocumentId) {
  const [rows] = await pool.execute(
    `SELECT id, payment_id, reservation_id, kros_external_id, kros_document_id,
            kros_payment_status, kros_payment_synced_at, variable_symbol,
            amount_gross_cents, paid_at, stripe_checkout_session_id, customer_name
     FROM billing_documents
     WHERE id = ?
     LIMIT 1`,
    [billingDocumentId]
  );
  return rows[0] || null;
}

function krosPaymentExternalId(krosExternalId) {
  const base = String(krosExternalId || '').trim();
  if (!base) return null;
  const suffix = '-payment';
  return `${base}${suffix}`.slice(0, 255);
}

function buildKrosPaymentPayload(row, variableSymbol) {
  const externalId = krosPaymentExternalId(row.kros_external_id);
  const vs = variableSymbol != null ? String(variableSymbol).trim().slice(0, 10) : '';
  const payment = {
    dateOfPayment: asIsoDate(row.paid_at),
    sumOfPayment: normalizeMoneyFromCents(row.amount_gross_cents),
    paymentType: KROS_PAYMENT_TYPE_CARD,
  };
  if (vs) payment.variableSymbol = vs;
  if (externalId) payment.externalId = externalId;
  const sessionRef =
    row.stripe_checkout_session_id != null ? String(row.stripe_checkout_session_id).trim() : '';
  if (sessionRef) payment.paymentReference = sessionRef.slice(0, 255);
  const partnerName = row.customer_name != null ? String(row.customer_name).trim() : '';
  if (partnerName) payment.partnerName = partnerName.slice(0, 255);
  return { data: [payment] };
}

async function markPaymentFailed(pool, id, errorMessage) {
  await pool.execute(
    `UPDATE billing_documents
     SET kros_payment_status = 'failed',
         kros_payment_error = ?
     WHERE id = ?`,
    [String(errorMessage || 'KROS payment sync failed').slice(0, 4000), id]
  );
}

async function markPaymentSynced(pool, id, variableSymbol = null) {
  const vs = variableSymbol != null ? String(variableSymbol).trim().slice(0, 20) || null : null;
  await pool.execute(
    `UPDATE billing_documents
     SET kros_payment_status = 'synced',
         kros_payment_synced_at = NOW(3),
         kros_payment_error = NULL,
         variable_symbol = COALESCE(?, variable_symbol)
     WHERE id = ?`,
    [vs, id]
  );
}

async function resolveVariableSymbolForPayment(row) {
  const stored = row.variable_symbol != null ? String(row.variable_symbol).trim() : '';
  if (stored) return stored;
  const krosId = row.kros_document_id != null ? String(row.kros_document_id).trim() : '';
  if (!krosId) return null;
  return krosClient.getInvoiceVariableSymbol(krosId);
}

/**
 * Register invoice payment in KROS (POST /api/payments/batch).
 * Idempotent: skips when kros_payment_status is already synced.
 * @param {number} billingDocumentId
 * @param {{ backend?: 'test'|'prod' }} [options]
 */
async function syncPaymentToKros(billingDocumentId, { backend = 'prod' } = {}) {
  const enabled = String(process.env.KROS_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    logLine({
      level: 'info',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'kros_disabled',
    });
    return;
  }

  const pool = db.getPool();
  if (!pool) {
    logLine({
      level: 'warn',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'db_not_configured',
    });
    return;
  }

  const row = await loadBillingDocumentForPaymentSync(pool, billingDocumentId);
  if (!row) {
    logLine({
      level: 'warn',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'doc_not_found',
    });
    return;
  }

  if (row.kros_payment_status === 'synced' || row.kros_payment_synced_at) {
    logLine({
      level: 'info',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'already_synced',
    });
    return;
  }

  const krosDocumentId = row.kros_document_id != null ? String(row.kros_document_id).trim() : '';
  if (!krosDocumentId) {
    logLine({
      level: 'info',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'kros_document_id_missing',
    });
    return;
  }

  if (!row.paid_at) {
    logLine({
      level: 'warn',
      tag: 'kros_payment_sync_skipped',
      billingDocumentId,
      reason: 'paid_at_missing',
    });
    return;
  }

  logLine({
    level: 'info',
    tag: 'kros_payment_sync_start',
    billingDocumentId,
    krosDocumentId,
    backend,
  });

  let variableSymbol;
  try {
    variableSymbol = await resolveVariableSymbolForPayment(row);
  } catch (err) {
    const errorMessage = err?.message || String(err);
    await markPaymentFailed(pool, billingDocumentId, errorMessage);
    logLine({
      level: 'error',
      tag: 'kros_payment_sync_failed',
      billingDocumentId,
      phase: 'variable_symbol',
      error: errorMessage,
    });
    await systemAlertService.createKrosPaymentSyncFailed({
      billingDocumentId,
      paymentId: row.payment_id,
      reservationId: row.reservation_id,
      krosDocumentId,
      errorMessage,
    });
    return;
  }

  if (!variableSymbol) {
    const errorMessage = 'KROS variable symbol unavailable for payment matching';
    await markPaymentFailed(pool, billingDocumentId, errorMessage);
    logLine({
      level: 'error',
      tag: 'kros_payment_sync_failed',
      billingDocumentId,
      phase: 'variable_symbol',
      error: errorMessage,
    });
    await systemAlertService.createKrosPaymentSyncFailed({
      billingDocumentId,
      paymentId: row.payment_id,
      reservationId: row.reservation_id,
      krosDocumentId,
      errorMessage,
    });
    return;
  }

  const payload = buildKrosPaymentPayload(row, variableSymbol);

  logDebug({
    tag: 'kros_payment_payload_preview',
    billingDocumentId,
    payload,
  });

  try {
    const response = await krosClient.postPaymentsBatch(payload);
    if (response.status === 202) {
      await markPaymentSynced(pool, billingDocumentId, variableSymbol);
      logLine({
        level: 'info',
        tag: 'kros_payment_sync_success',
        billingDocumentId,
        krosDocumentId,
        status: response.status,
        variableSymbol,
      });
      return;
    }

    const failureMessage = krosHttpFailureMessage(response.status, response.body);
    await markPaymentFailed(pool, billingDocumentId, failureMessage);
    logLine({
      level: 'error',
      tag: 'kros_payment_sync_failed',
      billingDocumentId,
      krosDocumentId,
      status: response.status,
      responseBody: response.body ?? null,
    });
    await systemAlertService.createKrosPaymentSyncFailed({
      billingDocumentId,
      paymentId: row.payment_id,
      reservationId: row.reservation_id,
      krosDocumentId,
      errorMessage: failureMessage,
      httpStatus: response.status,
    });
  } catch (err) {
    const errorMessage = err?.message || String(err);
    await markPaymentFailed(pool, billingDocumentId, errorMessage);
    logLine({
      level: 'error',
      tag: 'kros_payment_sync_failed',
      billingDocumentId,
      krosDocumentId,
      error: errorMessage,
    });
    await systemAlertService.createKrosPaymentSyncFailed({
      billingDocumentId,
      paymentId: row.payment_id,
      reservationId: row.reservation_id,
      krosDocumentId,
      errorMessage,
    });
    throw err;
  }
}

async function markFailed(pool, id, errorMessage, rawResponse = null) {
  await pool.execute(
    `UPDATE billing_documents
     SET kros_status = 'failed',
         kros_last_error = ?,
         kros_response_json = COALESCE(?, kros_response_json)
     WHERE id = ?`,
    [String(errorMessage || 'KROS sync failed').slice(0, 4000), stringifyJson(rawResponse), id]
  );
}

async function syncToKros(billingDocumentId, { backend = 'prod' } = {}) {
  const enabled = String(process.env.KROS_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    logLine({
      level: 'info',
      tag: 'kros_sync_skipped',
      billingDocumentId,
      reason: 'kros_disabled',
    });
    return;
  }

  const pool = db.getPool();
  if (!pool) {
    logLine({
      level: 'warn',
      tag: 'kros_sync_skipped',
      billingDocumentId,
      reason: 'db_not_configured',
    });
    return;
  }

  const row = await loadBillingDocumentContext(pool, billingDocumentId);
  if (!row) {
    logLine({ level: 'warn', tag: 'kros_sync_skipped', billingDocumentId, reason: 'doc_not_found' });
    return;
  }
  if (
    row.kros_status === 'webhook_received' &&
    row.kros_webhook_received_at &&
    new Date(row.kros_webhook_received_at).getTime() > nowMinusMinutes(10)
  ) {
    logLine({ level: 'info', tag: 'kros_sync_skipped', billingDocumentId, reason: 'webhook_received_recently' });
    return;
  }

  const payload = buildKrosPayload(row, backend);
  const externalId = payload.data.externalId;

  logDebug({
    tag: 'kros_payload_preview',
    billingDocumentId,
    payload,
  });

  try {
    const response = await krosClient.postInvoices(payload);
    if (response.status === 202) {
      await pool.execute(
        `UPDATE billing_documents
         SET kros_status = 'accepted',
             kros_payload_json = ?,
             kros_external_id = ?,
             kros_last_error = NULL
         WHERE id = ?`,
        [stringifyJson(payload), externalId, billingDocumentId]
      );
      logLine({
        level: 'info',
        tag: 'kros_sync_accepted',
        billingDocumentId,
        status: response.status,
      });
      return;
    }

    const failurePayload = { status: response.status, body: response.body };
    await markFailed(
      pool,
      billingDocumentId,
      krosHttpFailureMessage(response.status, response.body),
      failurePayload
    );
    logLine({
      level: 'error',
      tag: 'kros_sync_failed',
      billingDocumentId,
      status: response.status,
      responseBody: response.body ?? null,
    });
    logLine({
      level: 'warn',
      tag: 'kros_sync_failed_status',
      billingDocumentId,
      status: response.status,
    });
  } catch (err) {
    await markFailed(pool, billingDocumentId, err?.message || String(err));
    logLine({
      level: 'error',
      tag: 'kros_sync_failed_exception',
      billingDocumentId,
      error: err?.message || String(err),
    });
    throw err;
  }
}

/**
 * Download invoice PDF from KROS and persist under storage/billing-pdfs.
 * Skips when an internal PDF already exists (`pdf_storage_ref` set).
 * @param {number} billingDocumentId
 * @returns {Promise<Buffer|null>}
 */
async function downloadAndCacheKrosInvoicePdf(billingDocumentId) {
  const pool = db.getPool();
  if (!pool) {
    return null;
  }

  const [rows] = await pool.execute(
    `SELECT id, kros_document_id, pdf_storage_ref, pdf_generated_at
     FROM billing_documents
     WHERE id = ?
     LIMIT 1`,
    [billingDocumentId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (row.pdf_storage_ref) {
    return null;
  }
  const krosId = row.kros_document_id != null ? String(row.kros_document_id).trim() : '';
  if (!krosId) {
    return null;
  }

  const result = await krosClient.downloadInvoicePdf(krosId);
  if (result.type !== 'pdf') {
    logLine({
      level: 'error',
      tag: 'kros_pdf_unexpected_response',
      billingDocumentId,
      contentType: result.contentType ?? null,
      text: result.text ?? null,
    });
    return null;
  }

  const fileName = `kros-${billingDocumentId}-${krosId}.pdf`;
  const dir = billingPdfDir();
  await fs.mkdir(dir, { recursive: true });
  const absPath = path.join(dir, fileName);

  let bufferToPersist = result.buffer;
  try {
    bufferToPersist = await stampPdfWithLogo(result.buffer);
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'kros_pdf_stamp_failed',
      billingDocumentId,
      error: err?.message || String(err),
    });
    bufferToPersist = result.buffer;
  }

  await fs.writeFile(absPath, bufferToPersist);

  const relRef = path.posix.join('storage', 'billing-pdfs', fileName);
  await pool.execute(
    `UPDATE billing_documents
     SET pdf_storage_ref = ?, pdf_generated_at = NOW(3)
     WHERE id = ?`,
    [relRef, billingDocumentId]
  );

  return bufferToPersist;
}

module.exports = {
  buildKrosPayload,
  buildKrosPaymentPayload,
  krosPaymentExternalId,
  syncToKros,
  syncPaymentToKros,
  downloadAndCacheKrosInvoicePdf,
};
