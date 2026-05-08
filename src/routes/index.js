const express = require('express');
const appConfig = require('../config');
const { resolveCampaignVideo } = require('../config/funnelVideo');
const { reservationDepositEurForFunnel, FULL_PAYMENT_CHECKOUT_EUR } = require('../lib/bookingCheckoutAmounts');

const router = express.Router();

const SITE_CAMPAIGN = {
  headline: 'citimtedasom.sk',
  subhead: 'Úvodný text a video doplníme. Nižšie si môžeš vybrať termín online sedenia.',
  lowerContentReveal: { enabled: false },
};

function buildSiteHomeLocals(queryCampaign) {
  const campaignId = queryCampaign || 'default';
  const campaign = { ...SITE_CAMPAIGN };
  const campaignVideo = resolveCampaignVideo(campaign);
  return {
    title: 'citimtedasom.sk',
    description: 'Online konštelácie a osobný rozvoj. Rezervácia termínu, príprava obsahu.',
    campaign,
    campaignVideo,
    lowerContentReveal: { enabled: false },
    funnelName: 'site',
    funnelCampaignId: campaignId,
    funnelVideoId: campaign.videoId != null ? String(campaign.videoId) : null,
    reservationDepositEur: reservationDepositEurForFunnel('site'),
    fullPaymentCheckoutEur: FULL_PAYMENT_CHECKOUT_EUR,
  };
}

function renderSiteHome(req, res, { robotsNoindex }) {
  const locals = buildSiteHomeLocals(req.query && req.query.campaign);
  res.render('pages/home', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex,
    ...locals,
    extraStyles: `
      <link rel="stylesheet" href="/assets/css/funnel.css">
    `,
    extraScripts: `
      ${
        appConfig.captcha?.siteKey
          ? `<script>window.__BOOKING_RECAPTCHA_SITE_KEY=${JSON.stringify(appConfig.captcha.siteKey)}</script>`
          : ''
      }
      <script src="/assets/js/booking.js"></script>
      <script src="/assets/js/funnel.js"></script>
    `,
  });
}

router.get('/', (req, res) => {
  renderSiteHome(req, res, { robotsNoindex: false });
});

// Legacy compatibility path used as Stripe return URL root for home booking.
router.get('/site', (req, res) => {
  renderSiteHome(req, res, { robotsNoindex: true });
});

router.get('/site/success', (_req, res) => {
  res.render('pages/booking-success', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    title: 'Platba dokončená',
    description: 'Ďakujeme, platba je dokončená.',
    homeUrl: '/',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/success-page.js"></script>',
  });
});

router.get('/site/cancel', (_req, res) => {
  res.render('pages/booking-cancel', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    title: 'Platba zrušená',
    description: 'Platba bola zrušená.',
    backUrl: '/site#booking',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

module.exports = router;
