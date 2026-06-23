const express = require('express');
const requestIdMiddleware = require('../../middleware/requestId');
const apiAccessLog = require('../../middleware/apiAccessLog');
const { revokeLimiter } = require('../../middleware/rateLimits');
const { asyncHandler } = require('../../middleware/apiError');
const { validateSlotId, validateLockToken } = require('../../middleware/validators');
const locksRepo = require('../../db/repositories/locksRepo');
const auditRepo = require('../../db/repositories/auditRepo');

const slotsRouter = require('./slots');
const reservationsRouter = require('./reservations');
const paymentsRouter = require('./payments');
const cronRouter = require('./cron');
const supportRouter = require('./support');

const router = express.Router();

router.use(requestIdMiddleware);
router.use(apiAccessLog);

router.post(
  '/revoke',
  revokeLimiter,
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.body?.slotId ?? req.query?.slotId);
    const lockToken = validateLockToken(req.body?.lockToken ?? req.query?.lockToken ?? req.get('X-Lock-Token'));

    const deleted = await locksRepo.deleteLock(slotId, lockToken);
    if (deleted) {
      await auditRepo.log('lock_revoked', 'slot', slotId, { lockToken: lockToken.slice(0, 8) + '...' });
    }

    res.json({ ok: true, revoked: deleted });
  })
);

router.use('/slots', slotsRouter);
router.use('/reservations', reservationsRouter);
router.use('/payments', paymentsRouter);
router.use('/cron', cronRouter);
router.use('/support', supportRouter);

module.exports = router;
