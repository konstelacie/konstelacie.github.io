const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { Webhook } = require('svix');
const { asyncHandler } = require('../../middleware/apiError');
const config = require('../../config');
const emailSentLogRepo = require('../../db/repositories/emailSentLogRepo');
const systemAlertService = require('../../services/systemAlertService');
const { logLine } = require('../../lib/structuredLog');

const router = express.Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const RESERVATION_CONFIRMATION_TEMPLATE = 'reservation-confirmation';

function normalizeSvixHeaders(headers) {
  if (!headers) return null;
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return null;
  return {
    'svix-id': String(svixId),
    'svix-timestamp': String(svixTimestamp),
    'svix-signature': String(svixSignature),
  };
}

/**
 * Verify Resend webhook payload (Svix-signed).
 * @param {Buffer|string} rawBody
 * @param {import('http').IncomingHttpHeaders|Record<string, string|undefined>} headers
 * @param {string} secret
 * @returns {object|null} Parsed event or null when invalid
 */
function verifyResendWebhook(rawBody, headers, secret) {
  const trimmedSecret = String(secret || '').trim();
  const svixHeaders = normalizeSvixHeaders(headers);
  if (!rawBody || !trimmedSecret || !svixHeaders) {
    return null;
  }

  try {
    const wh = new Webhook(trimmedSecret);
    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    return wh.verify(payload, svixHeaders);
  } catch {
    return null;
  }
}

function bounceReasonFromEvent(event) {
  const data = event?.data || {};
  if (data.bounce?.message) return String(data.bounce.message);
  if (data.reason) return String(data.reason);
  return null;
}

async function handleBounceEvent(event, deliveryStatus) {
  const messageId = event?.data?.email_id;
  if (!messageId) {
    return { handled: false, reason: 'missing_email_id' };
  }

  const { updated, row } = await emailSentLogRepo.markBounced(messageId, {
    status: deliveryStatus,
    reason: bounceReasonFromEvent(event),
  });

  if (!row) {
    logLine({
      level: 'warn',
      tag: 'resend_webhook_unmatched_message',
      messageId,
      eventType: event.type,
    });
    return { handled: true, reason: 'unmatched_message_id' };
  }

  if (
    updated &&
    row.template_id === RESERVATION_CONFIRMATION_TEMPLATE &&
    row.entity_type === 'reservation' &&
    row.entity_id != null
  ) {
    await systemAlertService.createEmailBounced({
      reservationId: row.entity_id,
      recipientEmail: row.recipient_email,
      providerMessageId: messageId,
      bounceReason: row.bounce_reason,
      deliveryStatus,
    });
  }

  return { handled: true, updated, messageId };
}

router.post(
  '/',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const secret = config.email?.resend?.webhookSecret || '';

    if (!secret) {
      logLine({
        level: 'error',
        tag: 'resend_webhook',
        error: 'missing_webhook_secret',
      });
      return res.status(503).json({ ok: false, error: 'Webhook not configured' });
    }

    const event = verifyResendWebhook(rawBody, req.headers, secret);
    if (!event) {
      logLine({
        level: 'warn',
        tag: 'resend_webhook_invalid_signature',
      });
      return res.status(401).end();
    }

    logLine({
      level: 'info',
      tag: 'resend_webhook_received',
      eventType: event.type,
      svixId: req.get('svix-id') || null,
    });

    if (event.type === 'email.bounced') {
      await handleBounceEvent(event, 'bounced');
    } else if (event.type === 'email.complained') {
      await handleBounceEvent(event, 'complained');
    } else if (event.type === 'email.delivered') {
      const messageId = event?.data?.email_id;
      if (messageId) {
        await emailSentLogRepo.markDelivered(messageId);
      }
    }

    return res.status(200).json({ received: true });
  })
);

module.exports = { router, verifyResendWebhook };
