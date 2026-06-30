const auditRepo = require('../db/repositories/auditRepo');
const { getPool } = require('../db');
const { queryLeadEventsForAdmin } = require('../db/repositories/leadEventsRepo');
const {
  mapAdminAuditFunnelRow,
  mergeLeadAndAuditTimeline,
} = require('./bookingFunnelAudit');
const { mapAdminLeadEventRow } = require('./adminLeadEventDisplay');
const leadEventsGate = require('./leadEventsGate');

/**
 * Merged lead_events + audit_logs timeline with correct pagination.
 * @param {object} opts — same filters as lead list (days, eventType ignored for audit half)
 */
async function listMergedTimelineForAdmin(opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const limit = opts.limit ?? leadEventsGate.ADMIN_LIST_LIMIT_DEFAULT;
  const offset = opts.offset ?? 0;
  const fetchCount = offset + limit + 1;

  const auditOpts = {
    days: opts.days,
    action: opts.auditAction,
    emailLike: opts.emailLike,
    preEmailOnly: false,
    offset: 0,
    limit: fetchCount,
  };

  const leadOpts = {
    days: opts.days,
    segment: opts.segment,
    eventType: opts.eventType,
    emailLike: opts.emailLike,
    offset: 0,
    limit: fetchCount,
  };

  const [leadResult, auditResult] = await Promise.all([
    queryLeadEventsForAdmin(pool, leadOpts),
    auditRepo.queryBookingFunnelForAdmin(pool, auditOpts),
  ]);

  const leadRows = leadResult.rows.map((row) => mapAdminLeadEventRow(row));
  const auditRows = auditResult.rows.map((row) => mapAdminAuditFunnelRow(row));
  const merged = mergeLeadAndAuditTimeline(leadRows, auditRows);
  const sliced = merged.slice(offset, offset + limit + 1);
  const hasMore = sliced.length > limit;

  return {
    rows: hasMore ? sliced.slice(0, limit) : sliced,
    hasMore,
    limit,
    offset,
  };
}

module.exports = {
  listMergedTimelineForAdmin,
};
