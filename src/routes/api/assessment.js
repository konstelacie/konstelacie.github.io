const express = require('express');
const { asyncHandler } = require('../../middleware/apiError');
const { assessmentSubmitLimiter } = require('../../middleware/rateLimits');
const { handleCaptchaGate, ROUTE_ASSESSMENT_SUBMIT } = require('../../lib/captcha');
const { leadContextFromRequest } = require('../../lib/leadEventContext');
const { extractMetaAttribution } = require('../../lib/metaAttribution');
const { scheduleLeadEvent } = require('../../db/repositories/leadEventsRepo');
const { scheduleCapiLead } = require('../../services/capiSender');
const assessmentService = require('../../services/assessmentService');

const router = express.Router();

router.post(
  '/submit',
  assessmentSubmitLimiter,
  asyncHandler(async (req, res) => {
    const captchaGate = await handleCaptchaGate(req, res, {
      route: ROUTE_ASSESSMENT_SUBMIT,
    });
    if (!captchaGate.proceed) {
      return res.status(captchaGate.status).json(captchaGate.body);
    }

    const body = req.body ?? {};
    const leadCtx = leadContextFromRequest(req);
    const sourceUrl =
      (typeof body.sourceUrl === 'string' && body.sourceUrl.trim()) || leadCtx.sourceUrl || null;
    const marketingConsent = Boolean(body.marketingConsent);

    const result = await assessmentService.submitAssessment({
      email: body.email,
      answers: body.answers,
      funnelName: body.funnelName ?? body.funnel,
      funnelCampaign: body.funnelCampaign ?? body.campaign,
      sourceUrl,
      marketingConsent,
    });

    const email = String(result.email || '')
      .trim()
      .toLowerCase();
    const formId = result.funnelName || leadCtx.formId;

    scheduleLeadEvent('assessment_email_unlocked', {
      email,
      formId,
      sourceUrl,
      providerEventId: `assessment_submission:${result.submissionId}`,
      consentMarketing: marketingConsent,
      metadata: {
        submissionId: result.submissionId,
        funnelCampaign: result.funnelCampaign,
        scores: result.scores,
        primaryBottleneck: result.primaryBottleneck,
        secondaryBottleneck: result.secondaryBottleneck,
        isDualPrimary: result.isDualPrimary,
        isBalanced: result.isBalanced,
        isLowOverall: result.isLowOverall,
      },
    });

    const metaAttribution = extractMetaAttribution(req, body);
    scheduleCapiLead(
      {
        email,
        eventId: `assessment_lead:${result.submissionId}`,
        contentType: 'assessment',
        sourceUrl,
        formId,
      },
      metaAttribution
    );

    res.json({
      ok: true,
      submissionId: result.submissionId,
      scores: result.scores,
      ranked: result.ranked,
      primaryBottleneck: result.primaryBottleneck,
      secondaryBottleneck: result.secondaryBottleneck,
      isDualPrimary: result.isDualPrimary,
      isBalanced: result.isBalanced,
      isLowOverall: result.isLowOverall,
      result: result.result,
      secondaryResult: result.secondaryResult,
    });
  })
);

module.exports = router;
