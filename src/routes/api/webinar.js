const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const {
  webinarOptionsLimiter,
  webinarRegisterLimiter,
  webinarRoomLimiter,
} = require('../../middleware/rateLimits');
const webinarService = require('../../services/webinarService');

const router = express.Router();

router.get(
  '/options',
  webinarOptionsLimiter,
  asyncHandler(async (_req, res) => {
    const data = webinarService.getSchedulingOptions();
    res.json({ ok: true, ...data });
  })
);

router.post(
  '/register',
  webinarRegisterLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const baseUrl =
      (process.env.BASE_URL || '').trim() ||
      `${req.protocol}://${req.get('host') || 'localhost'}`;

    const registration = await webinarService.registerForWebinar({
      email: body.email,
      selection: body.selection,
      baseUrl,
    });

    res.json({ ok: true, registration });
  })
);

router.get(
  '/room/:token',
  webinarRoomLimiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
      throw new ApiError('VALIDATION_ERROR', 'Chýba prístupový token.', 400);
    }
    const room = await webinarService.loadRoomState(token);
    res.json({ ok: true, room });
  })
);

module.exports = router;
