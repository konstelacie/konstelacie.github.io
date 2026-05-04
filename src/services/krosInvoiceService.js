const crypto = require('crypto');
const { DateTime } = require('luxon');
const { getPool } = require('../db');
const config = require('../config');
const { logLine, logDebug } = require('../lib/structuredLog');
const { postInvoices } = require('./krosClient');
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

/** Číselný rad faktúr: OF (prod), or e.g. T-OF when KROS_SEQUENCE_PREFIX=T. */
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

function buildKrosPayload(row) {
  const isCompany = Number(row.customer_is_company) === 1;
  const country = (row.customer_country || 'SK').toUpperCase().slice(0, 2) || 'SK';
  const externalId = row.kros_external_id || crypto.randomUUID();
  const invoiceType = row.document_type === 'advance' ? 2 : 0;
  const advancePaymentDeduction =
    row.document_type === 'settlement' && row.advance_amount_gross_cents != null
      ? normalizeMoneyFromCents(row.advance_amount_gross_cents)
      : 0;
  const numberingSequence = resolveNumberingSequence(config.kros.sequencePrefix);

  return {
    data: {
      externalId,
      partner: {
        address: {
          businessName: isCompany ? row.customer_company_name || row.customer_name : row.customer_name,
          contactName: isCompany ? row.customer_name : null,
          street: isCompany ? row.customer_street || null : null,
          city: isCompany ? row.customer_city || null : null,
          postCode: isCompany ? row.customer_post_code || null : null,
          country,
        },
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
      paymentType: 'Bankový prevod',
      bankAccount: {
        iban: row.supplier_iban || '',
        swift: row.supplier_swift || '',
        isForeign: false,
      },
      numberingSequence,
      documentNumber: '',
      invoiceType,
      advancePaymentDeduction,
    },
  };
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

async function syncToKros(billingDocumentId) {
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

  const pool = getPool();
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

  const payload = buildKrosPayload(row);
  const externalId = payload.data.externalId;

  logDebug({
    tag: 'kros_payload_preview',
    billingDocumentId,
    payload,
  });

  try {
    const response = await postInvoices(payload);
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

module.exports = {
  syncToKros,
};
