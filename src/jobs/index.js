/**
 * Cron job registry and orchestrator.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const cronHealth = require('./cronHealth');
const emailDeliveryTasks = require('./emailDeliveryTasks');
const preSessionReminder = require('./preSessionReminder');
const sessionBeforeStart = require('./sessionBeforeStart');
const billingDeliverStuck = require('./billingDeliverStuck');
const stripeReconciliation = require('./stripeReconciliation');
const cronHealthService = require('../services/cronHealthService');
const systemAlertService = require('../services/systemAlertService');
const { logLine } = require('../lib/structuredLog');

const jobs = [
  cronHealth,
  emailDeliveryTasks,
  preSessionReminder,
  sessionBeforeStart,
  billingDeliverStuck,
  stripeReconciliation,
];

/**
 * @param {Record<string, unknown>} result
 */
function jobSucceeded(result) {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  if (result.ok === false) return false;
  if (result.detectorFailed) return false;
  if (result.healthy === false) return false;
  return errors.length === 0;
}

/**
 * Compact per-job line for stdout (grep tag:cron_run).
 * @param {Record<string, unknown>} job
 */
function summarizeJob(job) {
  const errors = Array.isArray(job.errors) ? job.errors : [];
  const failed =
    typeof job.failed === 'number' ? job.failed : errors.length > 0 ? errors.length : 0;
  const summary = {
    name: job.name,
    ok: jobSucceeded(job),
    due: typeof job.due === 'number' ? job.due : 0,
  };

  if (job.name === 'stripe-reconciliation' && job.skipped === true) {
    summary.throttled = true;
    summary.due = 0;
  }

  if (job.sent) summary.sent = job.sent;
  if (typeof job.skipped === 'number' && job.skipped > 0) summary.skipped = job.skipped;
  if (failed > 0) summary.failed = failed;

  if (job.healthy !== undefined) summary.healthy = job.healthy;
  if (job.stale) summary.stale = job.stale;
  if (job.alerted) summary.alerted = job.alerted;
  if (job.delayedEmailsQueued) summary.delayedEmailsQueued = job.delayedEmailsQueued;
  if (job.delayedEmailsSent) summary.delayedEmailsSent = job.delayedEmailsSent;
  if (job.caseA) summary.caseA = job.caseA;
  if (job.caseB) summary.caseB = job.caseB;
  if (errors.length) summary.errors = errors;

  return summary;
}

/**
 * @param {Array<Record<string, unknown>>} jobResults
 * @param {{ requestId?: string|null }} [opts]
 */
function logCronRunSummary(jobResults, opts = {}) {
  const summaries = jobResults.map(summarizeJob);
  const jobsFailed = summaries.filter((j) => !j.ok).length;
  logLine({
    level: jobsFailed > 0 ? 'warn' : 'info',
    tag: 'cron_run',
    requestId: opts.requestId ?? null,
    ok: jobsFailed === 0,
    jobsRun: summaries.length,
    jobsFailed,
    jobs: summaries,
  });
}

/**
 * Run all registered jobs and return aggregated results.
 * Records last_successful_cron_run_at and auto-resolves cron_not_running on success.
 * @param {{ requestId?: string|null }} [opts]
 * @returns {Promise<{ok: boolean, jobs: Array<{name: string, ok: boolean, due?: number, sent?: number, skipped?: number, failed?: number, errors?: string[]}>}>}
 */
async function runAll(opts = {}) {
  const results = [];

  for (const job of jobs) {
    try {
      const result = await job.run();
      const normalized = {
        name: job.name,
        ...result,
        ok: jobSucceeded(result),
        due: result.due ?? 0,
        sent: result.sent ?? 0,
        failed: result.failed ?? 0,
        errors: result.errors ?? [],
      };
      if (typeof result.skipped === 'boolean') {
        normalized.skipped = result.skipped;
      } else {
        normalized.skipped = result.skipped ?? 0;
      }
      results.push(normalized);
    } catch (err) {
      results.push({
        name: job.name,
        ok: false,
        due: 0,
        sent: 0,
        skipped: 0,
        failed: 1,
        errors: [err.message || String(err)],
      });
    }
  }

  logCronRunSummary(results, opts);

  await cronHealthService.recordSuccessfulCronRun();
  await systemAlertService.resolveCronNotRunning();

  return {
    ok: true,
    jobs: results,
  };
}

module.exports = { runAll, jobs, summarizeJob, logCronRunSummary };
