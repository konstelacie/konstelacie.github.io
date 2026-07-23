/**
 * Post-assessment marketing nurture sequence job.
 * See docs/SCHEDULED-EMAILS-CRON.md, src/services/assessmentNurtureService.js.
 */

const assessmentNurtureService = require('../services/assessmentNurtureService');

module.exports = {
  name: 'assessment-nurture',

  async run() {
    return assessmentNurtureService.processDueEnrollments(100);
  },
};
