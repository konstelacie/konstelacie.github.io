const express = require('express');
const { asyncHandler } = require('../../middleware/apiError');
const {
  situationMapSubmitLimiter,
  situationMapEventLimiter,
} = require('../../middleware/rateLimits');
const { handleCaptchaGate, ROUTE_SITUATION_MAP_SUBMIT } = require('../../lib/captcha');
const { leadContextFromRequest } = require('../../lib/leadEventContext');
const { scheduleLeadEvent } = require('../../db/repositories/leadEventsRepo');
const situationMapService = require('../../services/situationMapService');
const situationMapEventsRepo = require('../../db/repositories/situationMapEventsRepo');
const {
  sanitizeEventProperties,
  sanitizeStepNumber,
  sanitizeSubmissionId,
} = require('../../lib/situationMapAnalytics');
const { FUNNEL_INSTANCES, getFunnelPageType } = require('../../config/funnelInstances');

const router = express.Router();

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

router.post(
  '/event',
  situationMapEventLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ ok: false, error: 'VALIDATION_ERROR' });
    }
    if (!situationMapEventsRepo.isAllowedEventType(body.eventType)) {
      return res.status(400).json({ ok: false, error: 'VALIDATION_ERROR' });
    }

    let funnelName = typeof body.funnelName === 'string' ? body.funnelName.trim() : 'mapa';
    if (!FUNNEL_INSTANCES.includes(funnelName) || getFunnelPageType(funnelName) !== 'situation-map') {
      funnelName = 'mapa';
    }

    let funnelCampaign = 'default';
    if (typeof body.funnelCampaign === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(body.funnelCampaign.trim())) {
      funnelCampaign = body.funnelCampaign.trim();
    }

    const questionId =
      typeof body.questionId === 'string' && /^[A-Za-z0-9]{1,16}$/.test(body.questionId.trim())
        ? body.questionId.trim()
        : null;
    const stepNumber = sanitizeStepNumber(body.stepNumber);
    const submissionId = sanitizeSubmissionId(body.submissionId);
    const properties = sanitizeEventProperties(body.properties);

    try {
      await situationMapEventsRepo.recordEvent({
        sessionId,
        funnelName,
        funnelCampaign,
        eventType: body.eventType,
        questionId,
        stepNumber,
        submissionId,
        properties,
      });
    } catch (err) {
      console.error('[situation-map] event write failed:', err.message || err);
    }

    res.json({ ok: true });
  })
);

router.post(
  '/submit',
  situationMapSubmitLimiter,
  asyncHandler(async (req, res) => {
    const captchaGate = await handleCaptchaGate(req, res, {
      route: ROUTE_SITUATION_MAP_SUBMIT,
    });
    if (!captchaGate.proceed) {
      return res.status(captchaGate.status).json(captchaGate.body);
    }

    const body = req.body ?? {};
    const leadCtx = leadContextFromRequest(req);
    const sourceUrl =
      (typeof body.sourceUrl === 'string' && body.sourceUrl.trim()) || leadCtx.sourceUrl || null;
    const marketingConsent = Boolean(body.marketingConsent);

    const result = await situationMapService.submitSituationMap({
      email: body.email,
      displayName: body.displayName ?? body.name,
      answers: body.answers,
      funnelName: body.funnelName ?? body.funnel,
      funnelCampaign: body.funnelCampaign ?? body.campaign,
      sessionId: body.sessionId,
      sourceUrl,
      marketingConsent,
    });

    scheduleLeadEvent('situation_map_email_submitted', {
      email: result.email,
      formId: result.funnelName,
      sourceUrl,
      providerEventId: `situation_map_submission:${result.submissionId}`,
      consentMarketing: marketingConsent,
      metadata: {
        submissionId: result.submissionId,
        funnelCampaign: result.funnelCampaign,
        topic: result.answers.topic,
        duration: result.answers.duration,
        constellationExperience: result.answers.constellationExperience,
        perceivedBarrier: result.answers.perceivedBarrier,
      },
    });

    res.json({
      ok: true,
      submissionId: result.submissionId,
      recap: result.recap,
    });
  })
);

module.exports = router;
