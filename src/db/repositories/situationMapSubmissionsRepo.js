const { getPool } = require('../index');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    email: row.email,
    displayName: row.display_name,
    funnelName: row.funnel_name,
    funnelCampaign: row.funnel_campaign,
    topic: row.topic,
    topicOther: row.topic_other,
    situationDescription: row.situation_description,
    situationType: row.situation_type,
    duration: row.duration,
    peopleInvolved: parseJsonArray(row.people_involved_json),
    peopleInvolvedOther: row.people_involved_other,
    attempts: parseJsonArray(row.attempts_json),
    attemptsOther: row.attempts_other,
    constellationExperience: Boolean(row.constellation_experience),
    desiredChange: row.desired_change,
    perceivedBarrier: row.perceived_barrier,
    perceivedBarrierOther: row.perceived_barrier_other,
    sourceUrl: row.source_url,
    marketingConsent: row.marketing_consent == null ? null : Boolean(row.marketing_consent),
    marketingConsentAt: row.marketing_consent_at ?? null,
    createdAt: row.created_at,
  };
}

/**
 * @returns {Promise<{ id: number }>}
 */
async function createSubmission(input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const marketingConsent =
    input.marketingConsent == null ? null : input.marketingConsent ? 1 : 0;
  const marketingConsentAt = marketingConsent === 1 ? new Date() : null;

  const [result] = await pool.execute(
    `INSERT INTO situation_map_submissions
      (session_id, email, display_name, funnel_name, funnel_campaign,
       topic, topic_other, situation_description, situation_type, duration,
       people_involved_json, people_involved_other, attempts_json, attempts_other,
       constellation_experience, desired_change, perceived_barrier, perceived_barrier_other,
       source_url, marketing_consent, marketing_consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sessionId || null,
      normalizeEmail(input.email),
      String(input.displayName || '').trim().slice(0, 80),
      String(input.funnelName || '').trim(),
      input.funnelCampaign || null,
      input.topic,
      input.topicOther || null,
      input.situationDescription,
      input.situationType,
      input.duration,
      JSON.stringify(input.peopleInvolved || []),
      input.peopleInvolvedOther || null,
      JSON.stringify(input.attempts || []),
      input.attemptsOther || null,
      input.constellationExperience ? 1 : 0,
      input.desiredChange,
      input.perceivedBarrier || null,
      input.perceivedBarrierOther || null,
      input.sourceUrl || null,
      marketingConsent,
      marketingConsentAt,
    ]
  );

  return { id: Number(result.insertId) };
}

module.exports = {
  createSubmission,
  mapRow,
  normalizeEmail,
};
