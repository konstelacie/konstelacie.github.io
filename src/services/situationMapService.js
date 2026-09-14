const { ApiError } = require('../middleware/apiError');
const situationMap = require('../config/situationMap');
const { FUNNEL_INSTANCES, getFunnelPageType } = require('../config/funnelInstances');
const { buildSituationMapRecap } = require('../lib/situationMapRecap');
const situationMapSubmissionsRepo = require('../db/repositories/situationMapSubmissionsRepo');
const situationMapEventsRepo = require('../db/repositories/situationMapEventsRepo');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

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

function validateDisplayName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) {
    throw new ApiError('VALIDATION_ERROR', 'Meno alebo oslovenie je povinné.', 400);
  }
  if (name.length > 80) {
    throw new ApiError('VALIDATION_ERROR', 'Meno môže mať najviac 80 znakov.', 400);
  }
  return name;
}

function validateFunnelName(raw) {
  const funnelName = typeof raw === 'string' ? raw.trim() : '';
  if (!funnelName || !FUNNEL_INSTANCES.includes(funnelName)) {
    throw new ApiError('VALIDATION_ERROR', 'Neplatný funnel.', 400);
  }
  if (getFunnelPageType(funnelName) !== 'situation-map') {
    throw new ApiError('VALIDATION_ERROR', 'Tento funnel nepodporuje Mapu situácie.', 400);
  }
  return funnelName;
}

function validateCampaign(raw) {
  if (raw == null || String(raw).trim() === '') return 'default';
  const campaign = String(raw).trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(campaign)) return 'default';
  return campaign;
}

function validateSessionId(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const sessionId = String(raw).trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  return sessionId;
}

function optionValues(question) {
  return new Set((question.options || []).map((o) => o.value));
}

function readOtherText(raw, maxLen) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (text.length > maxLen) {
    throw new ApiError('VALIDATION_ERROR', `Text môže mať najviac ${maxLen} znakov.`, 400);
  }
  return text;
}

function validateChoice(question, answers) {
  const value = answers[question.field];
  const allowed = optionValues(question);
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ApiError('VALIDATION_ERROR', `Neplatná odpoveď: ${question.id}`, 400);
  }
  let otherText = null;
  if (question.otherValue && value === question.otherValue) {
    otherText = readOtherText(answers[question.otherField], 200);
    if (!otherText) {
      throw new ApiError('VALIDATION_ERROR', `Dopíšte možnosť „iné“ pri ${question.id}.`, 400);
    }
  }
  return { value, otherText };
}

function validateMulti(question, answers) {
  const raw = answers[question.field];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError('VALIDATION_ERROR', `Vyberte aspoň jednu možnosť: ${question.id}`, 400);
  }
  const allowed = optionValues(question);
  const unique = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string' || !allowed.has(item) || seen.has(item)) {
      throw new ApiError('VALIDATION_ERROR', `Neplatná odpoveď: ${question.id}`, 400);
    }
    seen.add(item);
    unique.push(item);
  }
  let otherText = null;
  if (question.otherValue && unique.includes(question.otherValue)) {
    otherText = readOtherText(answers[question.otherField], 200);
    if (!otherText) {
      throw new ApiError('VALIDATION_ERROR', `Dopíšte možnosť „iné“ pri ${question.id}.`, 400);
    }
  }
  return { values: unique, otherText };
}

function validateTextarea(question, answers) {
  const raw = answers[question.field];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    throw new ApiError('VALIDATION_ERROR', `Text je povinný: ${question.id}`, 400);
  }
  const max = question.maxLength || 800;
  if (text.length > max) {
    throw new ApiError('VALIDATION_ERROR', `Text môže mať najviac ${max} znakov.`, 400);
  }
  return text;
}

/**
 * @returns {object} canonical answers object
 */
function validateAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('VALIDATION_ERROR', 'Odpovede sú povinné.', 400);
  }

  const enabled = situationMap.getEnabledQuestions();
  const out = {
    topic: null,
    topicOther: null,
    situationDescription: null,
    situationType: null,
    duration: null,
    peopleInvolved: [],
    peopleInvolvedOther: null,
    attempts: [],
    attemptsOther: null,
    constellationExperience: false,
    desiredChange: null,
    perceivedBarrier: null,
    perceivedBarrierOther: null,
  };

  for (const question of enabled) {
    if (question.type === 'single') {
      const { value, otherText } = validateChoice(question, raw);
      out[question.field] = value;
      if (question.otherField) out[question.otherField] = otherText;
    } else if (question.type === 'multi') {
      const { values, otherText } = validateMulti(question, raw);
      out[question.field] = values;
      if (question.otherField) out[question.otherField] = otherText;
      if (question.constellationValue) {
        out.constellationExperience = values.includes(question.constellationValue);
      }
    } else if (question.type === 'textarea') {
      out[question.field] = validateTextarea(question, raw);
    }
  }

  return out;
}

async function submitSituationMap(input) {
  const email = validateEmail(input.email);
  const displayName = validateDisplayName(input.displayName ?? input.name);
  const answers = validateAnswers(input.answers);
  const funnelName = validateFunnelName(input.funnelName);
  const funnelCampaign = validateCampaign(input.funnelCampaign);
  const sessionId = validateSessionId(input.sessionId);
  const marketingConsent = Boolean(input.marketingConsent);
  const sourceUrl =
    typeof input.sourceUrl === 'string' && input.sourceUrl.trim()
      ? input.sourceUrl.trim().slice(0, 2048)
      : null;

  const recap = buildSituationMapRecap({ answers, config: situationMap });

  let row;
  try {
    row = await situationMapSubmissionsRepo.createSubmission({
      sessionId,
      email,
      displayName,
      funnelName,
      funnelCampaign,
      topic: answers.topic,
      topicOther: answers.topicOther,
      situationDescription: answers.situationDescription,
      situationType: answers.situationType,
      duration: answers.duration,
      peopleInvolved: answers.peopleInvolved,
      peopleInvolvedOther: answers.peopleInvolvedOther,
      attempts: answers.attempts,
      attemptsOther: answers.attemptsOther,
      constellationExperience: answers.constellationExperience,
      desiredChange: answers.desiredChange,
      perceivedBarrier: answers.perceivedBarrier,
      perceivedBarrierOther: answers.perceivedBarrierOther,
      sourceUrl,
      marketingConsent,
    });
  } catch (err) {
    if (err && err.message === 'Database not configured') {
      throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);
    }
    throw err;
  }

  try {
    await situationMapEventsRepo.recordEvent({
      sessionId: sessionId || `submission-${row.id}`,
      funnelName,
      funnelCampaign,
      eventType: 'email_submitted',
      submissionId: row.id,
    });
  } catch (err) {
    console.error('[situation-map] event email_submitted failed:', err.message || err);
  }

  return {
    submissionId: row.id,
    email,
    displayName,
    funnelName,
    funnelCampaign,
    answers,
    recap,
  };
}

module.exports = {
  validateEmail,
  validateDisplayName,
  validateAnswers,
  validateFunnelName,
  submitSituationMap,
};
