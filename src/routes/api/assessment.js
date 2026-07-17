const express = require('express');
const { asyncHandler } = require('../../middleware/apiError');
const { assessmentSubmitLimiter } = require('../../middleware/rateLimits');
const { handleCaptchaGate, ROUTE_ASSESSMENT_SUBMIT } = require('../../lib/captcha');
const { leadContextFromRequest } = require('../../lib/leadEventContext');
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

    const result = await assessmentService.submitAssessment({
      email: body.email,
      answers: body.answers,
      funnelName: body.funnelName ?? body.funnel,
      funnelCampaign: body.funnelCampaign ?? body.campaign,
      sourceUrl,
      marketingConsent: Boolean(body.marketingConsent),
    });

    res.json({ ok: true, ...result });
  })
);

module.exports = router;
