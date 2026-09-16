const situationMap = require('../config/situationMap');
const situationMapSubmissionsRepo = require('../db/repositories/situationMapSubmissionsRepo');
const situationMapResponsesRepo = require('../db/repositories/situationMapResponsesRepo');
const situationMapEventsRepo = require('../db/repositories/situationMapEventsRepo');
const { buildSituationMapRecap } = require('../lib/situationMapRecap');
const { answersFromSubmission, listQuestionAnswers, bodyForSend } = require('../lib/situationMapAnswers');
const {
  RESPONSE_STATUSES,
  sanitizeEventProperties,
  timeToResponseBucket,
} = require('../lib/situationMapAnalytics');
const { generateSummaryDraft, buildFactualRestatement } = require('./situationMapAiSummaryService');
const emailService = require('./emailService');
const { getAiSummaryConfig } = require('../config/situationMapAiSummary');

function isResponseStatus(value) {
  return typeof value === 'string' && RESPONSE_STATUSES.includes(value);
}

function normalizeText(raw) {
  if (raw == null) return null;
  const text = String(raw);
  return text.trim() ? text : '';
}

async function recordInternalEvent(eventType, submission, response, extraProps) {
  const properties = sanitizeEventProperties({
    responseStatus: response && response.status,
    ...extraProps,
  });
  try {
    await situationMapEventsRepo.recordEvent({
      sessionId: (submission && submission.sessionId) || `submission-${submission.id}`,
      funnelName: (submission && submission.funnelName) || 'mapa',
      funnelCampaign: (submission && submission.funnelCampaign) || null,
      eventType,
      submissionId: submission.id,
      properties,
    });
  } catch (err) {
    console.error(`[situation-map] event ${eventType} failed:`, err.message || err);
  }
}

async function ensurePendingResponse(submission) {
  const created = await situationMapResponsesRepo.createPending(submission.id);
  if (!created) return situationMapResponsesRepo.findBySubmissionId(submission.id);
  if (created.created) {
    const response = await situationMapResponsesRepo.findById(created.id);
    await recordInternalEvent('personal_response_created', submission, response);
    await maybeAutofillMockSummary(submission, response);
    return situationMapResponsesRepo.findById(created.id);
  }
  return situationMapResponsesRepo.findById(created.id);
}

async function maybeAutofillMockSummary(submission, response) {
  const ai = getAiSummaryConfig();
  if (ai.mode !== 'mock') return;
  if (!response || String(response.aiSummaryDraft || '').trim()) return;
  const answers = answersFromSubmission(submission);
  const generated = generateSummaryDraft(answers);
  if (!generated.ok) return;
  await situationMapResponsesRepo.setAiSummaryDraftIfEmpty(response.id, {
    draft: generated.draft,
    promptVersion: generated.promptVersion,
    source: generated.source,
  });
}

async function createPendingForSubmission(submission) {
  return ensurePendingResponse(submission);
}

async function getReviewBundle(submissionId) {
  const submission = await situationMapSubmissionsRepo.findById(submissionId);
  if (!submission) return null;
  const response = await ensurePendingResponse(submission);
  const answers = answersFromSubmission(submission);
  const recap = buildSituationMapRecap({ answers, config: situationMap });
  return {
    submission,
    response,
    answers,
    recap,
    questions: listQuestionAnswers(answers, situationMap),
    aiConfig: getAiSummaryConfig(),
  };
}

async function saveEditorFields(responseId, input, actor) {
  const response = await situationMapResponsesRepo.findById(responseId);
  if (!response) return { ok: false, reason: 'not_found' };

  const patch = {
    editedBy: actor || null,
  };
  if (Object.prototype.hasOwnProperty.call(input, 'humanSummary')) {
    patch.humanSummary = normalizeText(input.humanSummary);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'responseDraft')) {
    patch.responseDraft = normalizeText(input.responseDraft);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'internalNotes')) {
    patch.internalNotes = normalizeText(input.internalNotes);
  }

  let nextStatus = response.status;
  if (input.status != null && String(input.status).trim() !== '') {
    const status = String(input.status).trim();
    if (status === 'sent' && response.status === 'sent') {
      nextStatus = 'sent';
    } else if (!isResponseStatus(status) || status === 'sent') {
      return { ok: false, reason: 'invalid_status' };
    } else if (response.status === 'sent' && status !== 'sent') {
      return { ok: false, reason: 'already_sent' };
    } else {
      nextStatus = status;
      patch.status = status;
    }
  } else if (response.status === 'pending') {
    nextStatus = 'drafting';
    patch.status = 'drafting';
  }

  if (nextStatus === 'approved' && response.status !== 'approved') {
    patch.reviewedAt = new Date();
    patch.reviewedBy = actor || null;
    if (!String(response.finalResponse || '').trim()) {
      patch.finalResponse = String(patch.responseDraft != null ? patch.responseDraft : response.responseDraft || '').trim() || null;
    }
  }

  const row = await situationMapResponsesRepo.updateEditorFields(response.id, patch);
  if (nextStatus === 'approved' && response.status !== 'approved') {
    const submission = await situationMapSubmissionsRepo.findById(row.submissionId);
    await recordInternalEvent('personal_response_reviewed', submission, row);
  }
  return { ok: true, response: row };
}

async function insertAiSummaryDraft(responseId, input, actor) {
  const response = await situationMapResponsesRepo.findById(responseId);
  if (!response) return { ok: false, reason: 'not_found' };
  if (String(response.aiSummaryDraft || '').trim()) {
    return { ok: false, reason: 'ai_draft_immutable', response };
  }

  let draft = typeof input.draft === 'string' ? input.draft.trim() : '';
  let promptVersion = input.promptVersion || getAiSummaryConfig().promptVersion;
  let source = input.source || 'manual';

  if (input.useMock) {
    const submission = await situationMapSubmissionsRepo.findById(response.submissionId);
    draft = buildFactualRestatement(answersFromSubmission(submission));
    source = 'mock';
    promptVersion = getAiSummaryConfig().promptVersion;
  }

  if (!draft) return { ok: false, reason: 'empty_draft', response };

  const result = await situationMapResponsesRepo.setAiSummaryDraftIfEmpty(response.id, {
    draft,
    promptVersion,
    source,
    editedBy: actor || null,
  });
  if (!result.written) {
    return { ok: false, reason: 'ai_draft_immutable', response: result.row };
  }
  return { ok: true, response: result.row };
}

async function approveResponse(responseId, actor) {
  return saveEditorFields(responseId, { status: 'approved' }, actor);
}

async function sendPersonalResponse(responseId, actor, { markSentOnly = false } = {}) {
  const response = await situationMapResponsesRepo.findById(responseId);
  if (!response) return { ok: false, reason: 'not_found' };
  if (response.status === 'sent' && response.sentAt) {
    return { ok: false, reason: 'already_sent', response };
  }

  const submission = await situationMapSubmissionsRepo.findById(response.submissionId);
  if (!submission) return { ok: false, reason: 'not_found' };

  const body = bodyForSend(response);
  if (!body) return { ok: false, reason: 'empty_response', response };

  const sentAt = new Date();
  const finalResponse = String(response.finalResponse || '').trim() || body;

  if (!markSentOnly) {
    const sendResult = await emailService.sendSituationMapPersonalResponse(
      {
        to: submission.email,
        displayName: submission.displayName,
        bodyText: body,
      },
      {
        entity_type: 'situation_map_response',
        entity_id: response.id,
        actorType: 'admin',
      }
    );
    if (sendResult.alreadySent) {
      await situationMapResponsesRepo.updateEditorFields(response.id, {
        status: 'sent',
        finalResponse,
        sentAt: response.sentAt || sentAt,
        reviewedBy: response.reviewedBy || actor || null,
        reviewedAt: response.reviewedAt || sentAt,
        editedBy: actor || null,
      });
      return { ok: false, reason: 'already_sent', response: await situationMapResponsesRepo.findById(response.id) };
    }
    if (sendResult.skipped) {
      return { ok: false, reason: 'email_not_configured', response };
    }
    if (!sendResult.ok) {
      return { ok: false, reason: 'send_failed', response };
    }
  }

  const row = await situationMapResponsesRepo.updateEditorFields(response.id, {
    status: 'sent',
    finalResponse,
    sentAt,
    reviewedBy: response.reviewedBy || actor || null,
    reviewedAt: response.reviewedAt || sentAt,
    editedBy: actor || null,
  });

  await recordInternalEvent('personal_response_sent', submission, row, {
    timeToResponseBucket: timeToResponseBucket(submission.createdAt, sentAt),
  });

  return { ok: true, response: row, markedOnly: Boolean(markSentOnly) };
}

module.exports = {
  isResponseStatus,
  createPendingForSubmission,
  getReviewBundle,
  saveEditorFields,
  insertAiSummaryDraft,
  approveResponse,
  sendPersonalResponse,
};
