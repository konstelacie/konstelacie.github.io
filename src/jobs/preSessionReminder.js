/**
 * Pre-session reminder job: send email 24h before slot.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const reservationsRepo = require('../db/repositories/reservationsRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('../services/emailService');

const TEMPLATE_ID = 'pre-session-reminder';
const ENTITY_TYPE = 'reservation';

module.exports = {
  name: 'pre-session-reminder',

  async run() {
    const due = await reservationsRepo.findDueForPreSessionReminder();
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
        start_at: row.start_at,
        end_at: row.end_at,
        timezone: row.timezone || 'Europe/Bratislava',
      };

      try {
        const result = await emailService.sendPreSessionReminder(
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
