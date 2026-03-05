const express = require('express');
const requestIdMiddleware = require('../../middleware/requestId');

const slotsRouter = require('./slots');
const reservationsRouter = require('./reservations');

const router = express.Router();

router.use(requestIdMiddleware);
router.use('/slots', slotsRouter);
router.use('/reservations', reservationsRouter);

module.exports = router;
