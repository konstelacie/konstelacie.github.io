const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { asyncHandler } = require('../../middleware/apiError');
const config = require('../../config');
const { getPool } = require('../../db');
const { logLine, logDebug } = require('../../lib/structuredLog');
const emailService = require('../../services/emailService');
const krosInvoiceService = require('../../services/krosInvoiceService');

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function verifyKrosSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  try {
    const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const payloadUtf16 = Buffer.from(payloadString, 'utf16le');
    const secretUtf16 = Buffer.from(String(secret), 'utf16le');
    const computed = crypto.createHmac('sha256', secretUtf16).update(payloadUtf16).digest('base64');
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(String(signature).trim(), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.post(
  '/webhook',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.get('X-Kros-Signature-256');
    const secret = String(process.env.KROS_WEBHOOK_SECRET || '').trim();

    if (!verifyKrosSignature(rawBody, signature, secret)) {
      logLine({
        level: 'warn',
        tag: 'kros_webhook_invalid_signature',
        requestId: req.id,
      });
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    logDebug({
      tag: 'kros_webhook_raw_body',
      requestId: req.id,
      rawBody: req.body.toString('utf8').slice(0, 2000),
    });

    const payload = safeJsonParse(rawBody.toString('utf8'));
    if (!payload) {
      logLine({
        level: 'warn',
        tag: 'kros_webhook_invalid_json',
        requestId: req.id,
      });
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }

    const topStatus = payload?.status;
    const entity = payload?.results?.entities?.[0];
    const entityData = entity?.data ?? null;
    const externalId = entityData?.externalId
      ? String(entityData.externalId).trim()
      : null;

    if (!externalId) {
      logLine({
        level: 'warn',
        tag: 'kros_webhook_missing_external_id',
        requestId: req.id,
      });
      return res.status(200).json({ received: true });
    }

    const pool = getPool();
    if (!pool) {
      logLine({
        level: 'warn',
        tag: 'kros_webhook_db_missing',
        requestId: req.id,
      });
      return res.status(200).json({ received: true });
    }

    const [rows] = await pool.execute(
      'SELECT id, kros_status FROM billing_documents WHERE kros_external_id = ? LIMIT 1',
      [externalId]
    );
    const row = rows[0];
    if (!row) {
      logLine({
        level: 'info',
        tag: 'kros_webhook_unmatched_external_id',
        requestId: req.id,
        externalId,
      });
      return res.status(200).json({ received: true });
    }
    if (row.kros_status === 'webhook_received') {
      return res.status(200).json({ received: true });
    }

    const payloadJson = JSON.stringify(payload);

    if (topStatus === 200) {
      const krosDocumentId =
        entityData?.id != null ? String(entityData.id).slice(0, 50) : null;
      const krosDownloadUrl =
        payload.apiUrl && entityData?.id != null
          ? String(payload.apiUrl).replace('{id}', String(entityData.id)).slice(0, 500)
          : null;

      await pool.execute(
        `UPDATE billing_documents
         SET kros_status = 'webhook_received',
             kros_document_id = ?,
             kros_download_url = ?,
             kros_webhook_received_at = NOW(3),
             kros_response_json = ?,
             kros_last_error = NULL
         WHERE kros_external_id = ?`,
        [krosDocumentId, krosDownloadUrl, payloadJson, externalId]
      );

      const krosEnabled = String(process.env.KROS_ENABLED || '').toLowerCase() === 'true';
      const sendInvoiceEmail = config.billing?.sendInvoiceEmail !== false;
      if (krosEnabled && sendInvoiceEmail && krosDownloadUrl) {
        if (!row.id) {
          logLine({
            level: 'error',
            tag: 'kros_webhook_missing_row_id',
            externalId,
            requestId: req.id,
          });
          return res.status(200).json({ received: true });
        }
        let pdfBuffer = null;
        let pdfDownloadError = null;
        try {
          pdfBuffer = await krosInvoiceService.downloadAndCacheKrosInvoicePdf(row.id);
        } catch (err) {
          pdfDownloadError = err?.message || String(err);
        }
        if (!pdfBuffer) {
          logLine({
            level: 'warn',
            tag: 'kros_pdf_download_failed',
            requestId: req.id,
            billingDocumentId: row.id,
            ...(pdfDownloadError ? { error: pdfDownloadError } : { reason: 'unexpected_or_skipped' }),
          });
        }

        try {
          await emailService.sendBillingInvoiceKrosEmail(row.id, krosDownloadUrl, {
            pdfBuffer: pdfBuffer || undefined,
          });
        } catch (err) {
          logLine({
            level: 'error',
            tag: 'kros_webhook_invoice_email_failed',
            requestId: req.id,
            billingDocumentId: row.id,
            error: err?.message || String(err),
          });
        }
      }

      return res.status(200).json({ received: true });
    }

    if (topStatus === 207) {
      const problemsJson = JSON.stringify(entity?.problems ?? null);
      logLine({
        level: 'warn',
        tag: 'kros_webhook_partial_error',
        requestId: req.id,
        externalId,
        problems: entity?.problems,
      });
      await pool.execute(
        `UPDATE billing_documents
         SET kros_status = 'failed',
             kros_last_error = ?,
             kros_response_json = ?
         WHERE kros_external_id = ?`,
        [problemsJson.slice(0, 4000), payloadJson, externalId]
      );
      return res.status(200).json({ received: true });
    }

    await pool.execute(
      `UPDATE billing_documents
       SET kros_response_json = ?
       WHERE kros_external_id = ?`,
      [payloadJson, externalId]
    );
    return res.status(200).json({ received: true });
  })
);

module.exports = {
  router,
  verifyKrosSignature,
};
