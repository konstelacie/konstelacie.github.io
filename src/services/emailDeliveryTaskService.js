/**
 * Durable retryable email delivery for transactional templates.
 * Phase 2: reservation-confirmation only.
 */

const { logLine } = require('../lib/structuredLog');
const { getPool } = require('../db');
const emailDeliveryTasksRepo = require('../db/repositories/emailDeliveryTasksRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('./emailService');
const systemAlertService = require('./systemAlertService');

const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

function computeNextAttemptAt(attemptCount) {
  const index = Math.min(Math.max(attemptCount - 1, 0), BACKOFF_MINUTES.length - 1);
  const delayMinutes = BACKOFF_MINUTES[index];
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function insertReservationConfirmationTask(conn, { paymentId, reservationId, recipientEmail }) {
  return emailDeliveryTasksRepo.insertReservationConfirmation(conn, {
    paymentId,
    reservationId,
    recipientEmail,
  });
}

async function loadReservationSendContext(paymentId, reservationId) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT r.email, r.payment_type AS reservation_payment_type, s.start_at_utc, s.end_at_utc, s.timezone,
            p.amount_cents, p.currency
     FROM reservations r
     JOIN slots s ON r.slot_id = s.id
     JOIN payments p ON p.reservation_id = r.id
     WHERE r.id = ? AND p.id = ? LIMIT 1`,
    [reservationId, paymentId]
  );
  return rows[0] || null;
}

/**
 * @param {object} task - Row from email_delivery_tasks
 * @returns {Promise<{ok: boolean, skipped?: boolean, sent?: boolean, failed?: boolean, error?: string}>}
 */
async function processTask(task) {
  if (!task) {
    return { ok: false, skipped: true, error: 'task_not_found' };
  }

  if (task.status === 'sent') {
    return { ok: true, skipped: true };
  }

  const { template_id: templateId, entity_type: entityType, entity_id: entityId } = task;

  const alreadyLogged = await emailSentLogRepo.wasAlreadySent(templateId, entityType, entityId);
  if (alreadyLogged) {
    await emailDeliveryTasksRepo.markSent(task.id, task.provider_message_id);
    logLine({
      level: 'info',
      tag: 'email_delivery_task_already_sent',
      taskId: task.id,
      templateId,
      entityType,
      entityId,
    });
    return { ok: true, skipped: true, sent: true };
  }

  const claimed = await emailDeliveryTasksRepo.claimForSending(task.id);
  if (!claimed) {
    return { ok: false, skipped: true, error: 'task_not_claimed' };
  }

  let sendResult;
  try {
    sendResult = await dispatchSend(task);
  } catch (err) {
    sendResult = { ok: false, error: err?.message || String(err) };
  }

  if (sendResult.ok && sendResult.messageId) {
    await emailDeliveryTasksRepo.markSent(task.id, sendResult.messageId);
    logLine({
      level: 'info',
      tag: 'email_delivery_task_sent',
      taskId: task.id,
      templateId,
      entityType,
      entityId,
      messageId: sendResult.messageId,
    });
    return { ok: true, sent: true, messageId: sendResult.messageId };
  }

  const attemptCount = Number(task.attempt_count) + 1;
  const errorMessage =
    sendResult.error ||
    (sendResult.skipped ? 'email_provider_not_configured' : 'email_send_failed');
  const nextAttemptAt = computeNextAttemptAt(attemptCount);
  const exhausted = attemptCount >= Number(task.max_attempts);

  await emailDeliveryTasksRepo.markFailed(task.id, {
    attemptCount,
    lastError: errorMessage,
    nextAttemptAt,
  });

  logLine({
    level: 'error',
    tag: 'email_delivery_task_failed',
    taskId: task.id,
    templateId,
    entityType,
    entityId,
    attemptCount,
    exhausted,
    err: errorMessage,
  });

  if (exhausted && templateId === emailDeliveryTasksRepo.RESERVATION_CONFIRMATION_TEMPLATE) {
    await systemAlertService.createReservationConfirmationEmailFailed({
      taskId: task.id,
      reservationId: task.reservation_id,
      paymentId: task.payment_id,
      recipientEmail: task.recipient_email,
      attemptCount,
      errorMessage,
    });
  }

  return { ok: false, failed: true, error: errorMessage, attemptCount, exhausted };
}

async function dispatchSend(task) {
  if (task.template_id !== emailDeliveryTasksRepo.RESERVATION_CONFIRMATION_TEMPLATE) {
    return { ok: false, error: `unsupported_template:${task.template_id}` };
  }

  const row = await loadReservationSendContext(task.payment_id, task.reservation_id);
  if (!row) {
    return { ok: false, error: 'reservation_context_missing' };
  }

  return emailService.sendReservationConfirmation(
    {
      to: row.email,
      slot: { start_at_utc: row.start_at_utc, end_at_utc: row.end_at_utc, timezone: row.timezone },
      amountCents: row.amount_cents,
      currency: row.currency,
      bookingPaymentType: row.reservation_payment_type === 'full' ? 'full' : 'deposit',
    },
    { entity_type: emailDeliveryTasksRepo.ENTITY_TYPE_RESERVATION, entity_id: task.reservation_id }
  );
}

/**
 * Process a single task by id (post-commit immediate attempt).
 * Never throws — Stripe webhook must not fail after commit.
 */
async function processTaskById(taskId) {
  if (!taskId) return { ok: false, skipped: true };

  try {
    const task = await emailDeliveryTasksRepo.findById(taskId);
    return processTask(task);
  } catch (err) {
    logLine({
      level: 'error',
      tag: 'email_delivery_task_process_error',
      taskId,
      err: err?.message || String(err),
    });
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Process due tasks for cron retry.
 * @param {number} [limit=50]
 */
async function processDueTasks(limit = 50) {
  const due = await emailDeliveryTasksRepo.findDue(limit);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const task of due) {
    try {
      const result = await processTask(task);
      if (result.sent) {
        sent++;
      } else if (result.skipped) {
        skipped++;
      } else if (result.failed) {
        failed++;
        if (result.error) {
          errors.push(`task ${task.id}: ${result.error}`);
        }
      }
    } catch (err) {
      failed++;
      errors.push(`task ${task.id}: ${err.message || String(err)}`);
    }
  }

  return { sent, skipped, failed, errors };
}

module.exports = {
  insertReservationConfirmationTask,
  processTask,
  processTaskById,
  processDueTasks,
  computeNextAttemptAt,
};
