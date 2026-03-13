/**
 * Cron job registry and orchestrator.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const jobs = [
  // Pre-session reminder, newsletter, etc. added in later phases
];

/**
 * Run all registered jobs and return aggregated results.
 * @returns {Promise<{ok: boolean, jobs: Array<{name: string, sent?: number, skipped?: number, errors?: string[]}>}>}
 */
async function runAll() {
  const results = [];

  for (const job of jobs) {
    try {
      const result = await job.run();
      results.push({
        name: job.name,
        sent: result.sent ?? 0,
        skipped: result.skipped ?? 0,
        errors: result.errors ?? [],
      });
    } catch (err) {
      results.push({
        name: job.name,
        sent: 0,
        skipped: 0,
        errors: [err.message || String(err)],
      });
    }
  }

  return {
    ok: true,
    jobs: results,
  };
}

module.exports = { runAll, jobs };
