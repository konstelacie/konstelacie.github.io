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
    marketingConsentVersion: row.marketing_consent_version ?? null,
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
  const marketingConsentVersion = input.marketingConsentVersion
    ? String(input.marketingConsentVersion).trim().slice(0, 64)
    : null;

  const [result] = await pool.execute(
    `INSERT INTO situation_map_submissions
      (session_id, email, display_name, funnel_name, funnel_campaign,
       topic, topic_other, situation_description, situation_type, duration,
       people_involved_json, people_involved_other, attempts_json, attempts_other,
       constellation_experience, desired_change, perceived_barrier, perceived_barrier_other,
       source_url, marketing_consent, marketing_consent_at, marketing_consent_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sessionId || null,
      normalizeEmail(input.email),
      String(input.displayName || '').trim().slice(0, 80),
      String(input.funnelName || '').trim(),
      input.funnelCampaign || null,
      input.topic,
      input.topicOther || null,
      input.situationDescription == null ? '' : String(input.situationDescription),
      input.situationType,
      input.duration,
      JSON.stringify(input.peopleInvolved || []),
      input.peopleInvolvedOther || null,
      JSON.stringify(input.attempts || []),
      input.attemptsOther || null,
      input.constellationExperience ? 1 : 0,
      input.desiredChange == null ? '' : String(input.desiredChange),
      input.perceivedBarrier || null,
      input.perceivedBarrierOther || null,
      input.sourceUrl || null,
      marketingConsent,
      marketingConsentAt,
      marketingConsentVersion,
    ]
  );

  return { id: Number(result.insertId) };
}

async function findById(id) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM situation_map_submissions WHERE id = ? LIMIT 1`,
    [num]
  );
  return mapRow(rows[0]);
}

const ADMIN_LIST_LIMIT = 100;

/**
 * @param {{ status?: string, limit?: number }} [opts]
 */
async function listForAdmin(opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const limitRaw = Number(opts.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, ADMIN_LIST_LIMIT) : ADMIN_LIST_LIMIT;
  const status = typeof opts.status === 'string' ? opts.status.trim() : '';

  const params = [];
  let where = '';
  if (status && status !== 'all') {
    if (status === 'pending') {
      where = `WHERE (r.status IS NULL OR r.status = 'pending')`;
    } else {
      where = 'WHERE r.status = ?';
      params.push(status);
    }
  }

  const [rows] = await pool.execute(
    `SELECT s.*,
            r.id AS response_id,
            r.status AS response_status,
            r.updated_at AS response_updated_at,
            r.sent_at AS response_sent_at,
            r.ai_summary_draft IS NOT NULL AND TRIM(r.ai_summary_draft) <> '' AS has_ai_draft
     FROM situation_map_submissions s
     LEFT JOIN situation_map_responses r ON r.submission_id = s.id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT ${limit}`,
    params
  );

  return rows.map((row) => {
    const submission = mapRow(row);
    return {
      ...submission,
      responseId: row.response_id != null ? Number(row.response_id) : null,
      responseStatus: row.response_status || 'pending',
      responseUpdatedAt: row.response_updated_at ?? null,
      responseSentAt: row.response_sent_at ?? null,
      hasAiDraft: Boolean(Number(row.has_ai_draft)),
    };
  });
}

module.exports = {
  createSubmission,
  findById,
  listForAdmin,
  ADMIN_LIST_LIMIT,
  mapRow,
  normalizeEmail,
};
