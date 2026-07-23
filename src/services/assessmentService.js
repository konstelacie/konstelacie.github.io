const { ApiError } = require('../middleware/apiError');
const { scoreAssessment } = require('../lib/assessmentScoring');
const assessmentAutopilot = require('../config/assessmentAutopilot');
const { FUNNEL_INSTANCES, getFunnelPageType } = require('../config/funnelInstances');
const assessmentSubmissionsRepo = require('../db/repositories/assessmentSubmissionsRepo');
const nurtureConfig = require('../config/assessmentNurture');
const assessmentNurtureService = require('./assessmentNurtureService');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail je povinný.', 400);
  }
  if (email.length > 255) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail môže mať najviac 255 znakov.', 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail má neplatný formát.', 400);
  }
  return email;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
function validateAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('VALIDATION_ERROR', 'Odpovede sú povinné.', 400);
  }

  const expectedIds = new Set(assessmentAutopilot.questions.map((q) => q.id));
  const answers = {};

  for (const key of Object.keys(raw)) {
    if (!expectedIds.has(key)) {
      throw new ApiError('VALIDATION_ERROR', `Neznáma otázka: ${key}`, 400);
    }
    const value = raw[key];
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ApiError('VALIDATION_ERROR', `Neplatná odpoveď pre ${key}.`, 400);
    }
    answers[key] = n;
  }

  for (const id of expectedIds) {
    if (answers[id] == null) {
      throw new ApiError('VALIDATION_ERROR', `Chýba odpoveď: ${id}`, 400);
    }
  }

  return answers;
}

function validateFunnelName(raw) {
  const funnelName = typeof raw === 'string' ? raw.trim() : '';
  if (!funnelName || !FUNNEL_INSTANCES.includes(funnelName)) {
    throw new ApiError('VALIDATION_ERROR', 'Neplatný funnel.', 400);
  }
  if (getFunnelPageType(funnelName) !== 'assessment') {
    throw new ApiError('VALIDATION_ERROR', 'Tento funnel nepodporuje hodnotenie.', 400);
  }
  return funnelName;
}

function validateCampaign(raw) {
  if (raw == null || String(raw).trim() === '') return 'default';
  const campaign = String(raw).trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(campaign)) return 'default';
  return campaign;
}

function buildResultPayload(resultId) {
  const copy = assessmentAutopilot.bottleneckResults[resultId];
  if (!copy) return null;
  return {
    id: resultId,
    title: copy.title,
    summary: copy.summary,
    sections: {
      whatItMeans: copy.whatItMeans,
      blindSpot: copy.blindSpot,
      longTermRisk: copy.longTermRisk,
      firstStep: copy.firstStep,
      transition: copy.transition,
    },
  };
}

/**
 * @param {object} input
 * @param {string} input.email
 * @param {Record<string, number>} input.answers
 * @param {string} input.funnelName
 * @param {string} [input.funnelCampaign]
 * @param {string|null} [input.sourceUrl]
 * @param {boolean} [input.marketingConsent]
 */
async function submitAssessment(input) {
  const email = validateEmail(input.email);
  const answers = validateAnswers(input.answers);
  const funnelName = validateFunnelName(input.funnelName);
  const funnelCampaign = validateCampaign(input.funnelCampaign);
  const marketingConsent = Boolean(input.marketingConsent);

  let scored;
  try {
    scored = scoreAssessment({
      questions: assessmentAutopilot.questions,
      dimensions: assessmentAutopilot.dimensions,
      bottlenecks: assessmentAutopilot.bottlenecks,
      answers,
    });
  } catch (err) {
    throw new ApiError('VALIDATION_ERROR', err.message || 'Neplatné odpovede.', 400);
  }

  const scoresForStore = {};
  for (const [dimensionId, entry] of Object.entries(scored.scores)) {
    scoresForStore[dimensionId] = {
      raw: entry.raw,
      percent: entry.percent,
    };
  }

  const consentAt = marketingConsent ? new Date() : null;

  const row = await assessmentSubmissionsRepo.createSubmission({
    email,
    funnelName,
    funnelCampaign,
    answers,
    scores: scoresForStore,
    primaryBottleneck: scored.primaryBottleneck,
    secondaryBottleneck: scored.secondaryBottleneck,
    sourceUrl: input.sourceUrl || null,
    marketingConsent: marketingConsent ? true : false,
    marketingConsentAt: consentAt,
    marketingConsentSource: marketingConsent
      ? nurtureConfig.CONSENT_SOURCE_ASSESSMENT_UNLOCK
      : null,
  }).catch((err) => {
    if (err && err.message === 'Database not configured') {
      throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);
    }
    throw err;
  });

  let nurture = { enrolled: false };
  try {
    nurture = await assessmentNurtureService.enrollAfterAssessment({
      email,
      submissionId: row.id,
      marketingConsent,
      funnelName,
      sourceUrl: input.sourceUrl || null,
      primaryBottleneck: scored.primaryBottleneck,
      secondaryBottleneck: scored.secondaryBottleneck,
      isDualPrimary: scored.isDualPrimary,
      isBalanced: scored.isBalanced,
      isLowOverall: scored.isLowOverall,
    });
  } catch (err) {
    console.error('[assessment] nurture enroll failed:', err.message || err);
  }

  return {
    submissionId: row.id,
    email,
    funnelName,
    funnelCampaign,
    scores: scoresForStore,
    ranked: scored.ranked,
    primaryBottleneck: scored.primaryBottleneck,
    secondaryBottleneck: scored.secondaryBottleneck,
    isDualPrimary: scored.isDualPrimary,
    isBalanced: scored.isBalanced,
    isLowOverall: scored.isLowOverall,
    nurtureEnrolled: Boolean(nurture.enrolled),
    result: buildResultPayload(scored.primaryBottleneck),
    secondaryResult: scored.isDualPrimary
      ? buildResultPayload(scored.secondaryBottleneck)
      : {
          id: scored.secondaryBottleneck,
          title: assessmentAutopilot.bottleneckTitles[scored.secondaryBottleneck] || null,
        },
  };
}

module.exports = {
  submitAssessment,
  validateEmail,
  validateAnswers,
};
