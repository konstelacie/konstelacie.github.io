/**
 * Webinar reminder: send join link shortly before start.
 * Retries on each cron run until start; idempotent via email_sent_log.
 */

const webinarConfig = require('../config/webinar');
const webinarRegistrationsRepo = require('../db/repositories/webinarRegistrationsRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('../services/emailService');
const webinarService = require('../services/webinarService');

const TEMPLATE_ID = 'webinar-reminder';
const ENTITY_TYPE = 'webinar_registration';

module.exports = {
  name: 'webinar-reminder',

  async run() {
    if (!webinarConfig.isConfigured()) {
      return { due: 0, sent: 0, skipped: 0, errors: [], disabled: true };
    }

    const minutesBefore = webinarConfig.reminderMinutesBefore;
    const due = await webinarRegistrationsRepo.findDueForReminder(minutesBefore);
    const baseUrl = (process.env.BASE_URL || '').trim();
    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const row of due) {
      const alreadySent = await emailSentLogRepo.wasAlreadySent(TEMPLATE_ID, ENTITY_TYPE, row.id);
      if (alreadySent) {
        skipped++;
        continue;
      }

      const formatted = webinarService.formatStartForDisplay(row.start_at_utc, row.timezone);
      const roomUrl = webinarService.buildRoomUrl(row.access_token, baseUrl);

      try {
        const result = await emailService.sendWebinarReminder(
          {
            to: row.email,
            roomUrl,
            formattedStart: formatted,
            timezone: row.timezone || webinarConfig.timezone,
          },
          { entity_type: ENTITY_TYPE, entity_id: row.id }
        );
        if (result.ok) {
          sent++;
        } else if (result.skipped) {
          skipped++;
        } else {
          errors.push(`webinar_registration ${row.id}: send failed`);
        }
      } catch (err) {
        errors.push(`webinar_registration ${row.id}: ${err.message || String(err)}`);
      }
    }

    return { due: due.length, sent, skipped, errors };
  },
};
