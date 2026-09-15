const { getPool } = require('../index');

const ALLOWED_EVENT_TYPES = new Set([
  'map_started',
  'map_question_viewed',
  'map_question_answered',
  'map_question_skipped',
  'map_completed',
  'email_submitted',
  'result_viewed',
  'offer_viewed',
  'offer_clicked',
]);

function isAllowedEventType(eventType) {
  return typeof eventType === 'string' && ALLOWED_EVENT_TYPES.has(eventType);
}

/**
 * Fire-and-forget insert. Missing DB is a no-op for v0 analytics.
 * @returns {Promise<{ id: number }|null>}
 */
async function recordEvent(input) {
  const pool = getPool();
  if (!pool) return null;
  if (!isAllowedEventType(input.eventType)) return null;

  const sessionId = String(input.sessionId || '').trim().slice(0, 64);
  if (!sessionId) return null;

  const [result] = await pool.execute(
    `INSERT INTO situation_map_events
      (session_id, funnel_name, funnel_campaign, event_type, question_id, submission_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      String(input.funnelName || 'mapa').trim().slice(0, 64),
      input.funnelCampaign ? String(input.funnelCampaign).trim().slice(0, 64) : null,
      input.eventType,
      input.questionId ? String(input.questionId).trim().slice(0, 16) : null,
      input.submissionId != null ? Number(input.submissionId) : null,
    ]
  );

  return { id: Number(result.insertId) };
}

module.exports = {
  ALLOWED_EVENT_TYPES,
  isAllowedEventType,
  recordEvent,
};
