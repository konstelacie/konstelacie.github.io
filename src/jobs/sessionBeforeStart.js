/**
 * Session before-start email: send meeting link shortly before slot start.
 * Retries on each cron run until session start; idempotent via email_sent_log.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const config = require('../config');
const reservationsRepo = require('../db/repositories/reservationsRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('../services/emailService');

const TEMPLATE_ID = 'session-before-start';
const ENTITY_TYPE = 'reservation';

module.exports = {
  name: 'session-before-start',

  async run() {
    const minutesBeforeStart = config.email.sessionBeforeStartMinutes;
    const due = await reservationsRepo.findDueForSessionBeforeStartEmail(minutesBeforeStart);
    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const row of due) {
      const alreadySent = await emailSentLogRepo.wasAlreadySent(TEMPLATE_ID, ENTITY_TYPE, row.id);
      if (alreadySent) {
        skipped++;
        continue;
      }

      const slot = {
        start_at_utc: row.start_at_utc,
        end_at_utc: row.end_at_utc,
        timezone: row.timezone || 'Europe/Bratislava',
      };

      try {
        const result = await emailService.sendSessionBeforeStartEmail(
          { to: row.email, slot },
          { entity_type: ENTITY_TYPE, entity_id: row.id }
        );
        if (result.ok) {
          sent++;
        } else if (result.skipped) {
          skipped++;
        } else {
          errors.push(`reservation ${row.id}: send failed`);
        }
      } catch (err) {
        errors.push(`reservation ${row.id}: ${err.message || String(err)}`);
      }
    }

    return { sent, skipped, errors };
  },
};
