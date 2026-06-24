const express = require('express');
const { asyncHandler } = require('../../middleware/apiError');
const { supportContactLimiter } = require('../../middleware/rateLimits');
const { sendSupportContact } = require('../../services/supportContactService');

const router = express.Router();

router.post(
  '/contact',
  supportContactLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    await sendSupportContact({
      message: body.message,
      email: body.email,
      phone: body.phone,
      reservationId: body.reservationId,
      checkoutSessionId: body.checkoutSessionId,
      context: body.context,
    });
    res.json({ ok: true });
  })
);

module.exports = router;
