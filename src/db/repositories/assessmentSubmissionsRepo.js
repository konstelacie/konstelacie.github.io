const { getPool } = require('../index');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    funnelName: row.funnel_name,
    funnelCampaign: row.funnel_campaign,
    answersJson: row.answers_json,
    scoresJson: row.scores_json,
    primaryBottleneck: row.primary_bottleneck,
    secondaryBottleneck: row.secondary_bottleneck,
    sourceUrl: row.source_url,
    marketingConsent:
      row.marketing_consent == null ? null : Boolean(row.marketing_consent),
    marketingConsentAt: row.marketing_consent_at ?? null,
    marketingConsentSource: row.marketing_consent_source ?? null,
    createdAt: row.created_at,
  };
}

/**
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.funnelName
 * @param {string|null} [input.funnelCampaign]
 * @param {object} input.answers
 * @param {object} input.scores
 * @param {string} input.primaryBottleneck
 * @param {string} input.secondaryBottleneck
 * @param {string|null} [input.sourceUrl]
 * @param {boolean|null} [input.marketingConsent]
 * @param {Date|null} [input.marketingConsentAt]
 * @param {string|null} [input.marketingConsentSource]
 * @returns {Promise<{ id: number }>}
 */
async function createSubmission(input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const email = normalizeEmail(input.email);
  const funnelName = String(input.funnelName || '').trim();
  const funnelCampaign =
    input.funnelCampaign != null && String(input.funnelCampaign).trim() !== ''
      ? String(input.funnelCampaign).trim().slice(0, 64)
      : null;
  const sourceUrl =
    input.sourceUrl != null && String(input.sourceUrl).trim() !== ''
      ? String(input.sourceUrl).trim().slice(0, 2048)
      : null;

  const marketingConsent =
    input.marketingConsent == null ? null : input.marketingConsent ? 1 : 0;
  const marketingConsentAt =
    marketingConsent === 1
      ? input.marketingConsentAt instanceof Date
        ? input.marketingConsentAt
        : new Date()
      : null;
  const marketingConsentSource =
    marketingConsent === 1 && input.marketingConsentSource
      ? String(input.marketingConsentSource).trim().slice(0, 64)
      : null;

  const [result] = await pool.execute(
    `INSERT INTO assessment_submissions
      (email, funnel_name, funnel_campaign, answers_json, scores_json,
       primary_bottleneck, secondary_bottleneck, source_url,
       marketing_consent, marketing_consent_at, marketing_consent_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      email,
      funnelName,
      funnelCampaign,
      JSON.stringify(input.answers),
      JSON.stringify(input.scores),
      input.primaryBottleneck,
      input.secondaryBottleneck,
      sourceUrl,
      marketingConsent,
      marketingConsentAt,
      marketingConsentSource,
    ]
  );

  return { id: Number(result.insertId) };
}

module.exports = {
  createSubmission,
  mapRow,
  normalizeEmail,
};
