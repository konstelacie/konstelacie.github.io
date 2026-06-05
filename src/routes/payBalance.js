const express = require('express');
const { MIN_SESSION_TOTAL_EUR } = require('../lib/bookingCheckoutAmounts');

const router = express.Router();

router.get('/platba-doplatok', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.render('pages/platba-doplatok', {
    layout: 'layouts/default',
    title: 'Doplatok za sedenie · citimtedasom.sk',
    description: 'Voliteľný doplatok k už uhradenej rezervácii sedenia.',
    robotsNoindex: true,
    token,
    minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
  });
});

module.exports = router;
