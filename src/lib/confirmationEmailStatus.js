/**
 * Client-facing confirmation email status for payment success page / status API.
 */

const BOUNCED_STATUSES = new Set(['bounced', 'complained']);

/**
 * @param {string} email
 * @returns {string}
 */
function maskRecipientEmail(email) {
  const raw = String(email || '').trim();
  const at = raw.indexOf('@');
  if (at <= 0) return '***';
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return '***';
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * @param {object|null} task - email_delivery_tasks row
 * @param {object|null} logRow - latest email_sent_log row
 * @returns {'pending'|'sent'|'bounced'|'failed'}
 */
function resolveConfirmationEmailStatus(task, logRow) {
  if (logRow) {
    if (BOUNCED_STATUSES.has(logRow.delivery_status)) {
      return 'bounced';
    }
    // Latest non-bounced log (including reservation-confirmation-resend) wins over an
    // exhausted delivery task or an earlier bounce on a prior send attempt.
    return 'sent';
  }

  if (task) {
    const exhausted =
      task.status === 'failed' && Number(task.attempt_count) >= Number(task.max_attempts);
    if (exhausted) {
      return 'failed';
    }
    if (task.status === 'sent') {
      return 'sent';
    }
    return 'pending';
  }

  return 'pending';
}

/**
 * @param {object|null} task
 * @param {object|null} logRow
 * @param {string|null} [fallbackEmail]
 * @returns {{ status: string, recipientMasked: string }|null}
 */
function buildConfirmationEmailPayload(task, logRow, fallbackEmail = null) {
  if (!task && !logRow) {
    return null;
  }

  const email = logRow?.recipient_email || task?.recipient_email || fallbackEmail;
  if (!email) {
    return null;
  }

  return {
    status: resolveConfirmationEmailStatus(task, logRow),
    recipientMasked: maskRecipientEmail(email),
  };
}

module.exports = {
  maskRecipientEmail,
  resolveConfirmationEmailStatus,
  buildConfirmationEmailPayload,
};
