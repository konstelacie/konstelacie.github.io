const express = require('express');
const {
  verifyMarketingUnsubscribeToken,
} = require('../lib/marketingUnsubscribeToken');
const assessmentNurtureService = require('../services/assessmentNurtureService');

const router = express.Router();

async function handleUnsubscribe(req, res) {
  const token =
    (typeof req.query.token === 'string' && req.query.token) ||
    (typeof req.body?.token === 'string' && req.body.token) ||
    '';
  const verified = verifyMarketingUnsubscribeToken(token);

  let status = 'invalid';
  let alreadyUnsubscribed = false;

  if (verified) {
    try {
      const result = await assessmentNurtureService.unsubscribeByEnrollmentId(
        verified.enrollmentId
      );
      if (result.ok) {
        status = 'ok';
        alreadyUnsubscribed = Boolean(result.alreadyUnsubscribed);
      } else {
        status = 'invalid';
      }
    } catch (err) {
      console.error('[unsubscribe]', err.message || err);
      status = 'error';
    }
  }

  // Gmail one-click POST expects a simple 200; browser GET gets a confirmation page.
  if (req.method === 'POST') {
    return res.status(status === 'ok' ? 200 : 400).send(status === 'ok' ? 'OK' : 'ERR');
  }

  res.render('pages/odhlasenie-emailov', {
    layout: 'layouts/default',
    title: 'Odhlásenie z odberu · citimtedasom.sk',
    description: 'Odhlásenie z marketingových e-mailov.',
    robotsNoindex: true,
    status,
    alreadyUnsubscribed,
  });
}

/**
 * One-click marketing unsubscribe (signed token).
 * GET|POST /odhlasenie-emailov?token=…
 */
router.get('/odhlasenie-emailov', handleUnsubscribe);
router.post('/odhlasenie-emailov', handleUnsubscribe);

module.exports = router;
