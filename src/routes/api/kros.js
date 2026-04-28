const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { asyncHandler } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const { logLine } = require('../../lib/structuredLog');

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
    const payloadUtf16 = Buffer.from(rawBody.toString('utf8'), 'utf16le');
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

function pickPayloadStatus(payload) {
  const s = payload?.status ?? payload?.data?.status;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickExternalId(payload) {
  return (
    payload?.externalId ||
    payload?.data?.externalId ||
    payload?.request?.externalId ||
    payload?.data?.request?.externalId ||
    null
  );
}

function pickDocumentId(payload) {
  return payload?.documentId || payload?.data?.documentId || payload?.id || payload?.data?.id || null;
}

function pickDownloadUrl(payload) {
  return payload?.apiUrl || payload?.data?.apiUrl || payload?.downloadUrl || payload?.data?.downloadUrl || null;
}

function pickProblems(payload) {
  const p = payload?.problems ?? payload?.data?.problems ?? payload?.errors ?? payload?.data?.errors;
  if (p == null) return null;
  if (Array.isArray(p)) return p.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' | ');
  if (typeof p === 'string') return p;
  return JSON.stringify(p);
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

    const payload = safeJsonParse(rawBody.toString('utf8'));
    if (!payload) {
      logLine({
        level: 'warn',
        tag: 'kros_webhook_invalid_json',
        requestId: req.id,
      });
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }

    const externalId = pickExternalId(payload);
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

    const status = pickPayloadStatus(payload);
    const payloadJson = JSON.stringify(payload);

    if (status === 200) {
      await pool.execute(
        `UPDATE billing_documents
         SET kros_status = 'webhook_received',
             kros_document_id = ?,
             kros_download_url = ?,
             kros_webhook_received_at = NOW(3),
             kros_response_json = ?,
             kros_last_error = NULL
         WHERE kros_external_id = ?`,
        [
          pickDocumentId(payload) ? String(pickDocumentId(payload)).slice(0, 50) : null,
          pickDownloadUrl(payload) ? String(pickDownloadUrl(payload)).slice(0, 500) : null,
          payloadJson,
          externalId,
        ]
      );
      return res.status(200).json({ received: true });
    }

    if (status === 207) {
      await pool.execute(
        `UPDATE billing_documents
         SET kros_status = 'failed',
             kros_last_error = ?,
             kros_response_json = ?
         WHERE kros_external_id = ?`,
        [String(pickProblems(payload) || 'KROS partial error').slice(0, 4000), payloadJson, externalId]
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
