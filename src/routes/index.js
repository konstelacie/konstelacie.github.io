const express = require('express');
const appConfig = require('../config');
const pageVisibility = require('../config/pageVisibility');
const { resolveCampaignVideo } = require('../config/funnelVideo');
const { reservationDepositEurForFunnel, FULL_PAYMENT_CHECKOUT_EUR } = require('../lib/bookingCheckoutAmounts');

const router = express.Router();

const SITE_CAMPAIGN = {
  headline: '„Cítim, teda som.“',
  subhead: 'Ten pocit, keď dáš priestor svojmu cíteniu a necháš myslenie oddýchnuť.',
  lowerContentReveal: { enabled: false },
};

function homeTestingBanner() {
  if (appConfig.site.testingBannerGloballyDisabled) return false;
  return pageVisibility.shouldShowTestingBannerForHome();
}

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

function renderSiteHome(req, res) {
  const locals = buildSiteHomeLocals(req.query && req.query.campaign);
  res.render('pages/home', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: !pageVisibility.homeIsIndexable(),
    showTestingBanner: homeTestingBanner(),
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
  renderSiteHome(req, res);
});

router.get('/success', (_req, res) => {
  res.render('pages/booking-success', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    showTestingBanner: homeTestingBanner(),
    title: 'Platba dokončená',
    description: 'Ďakujeme, platba je dokončená.',
    homeUrl: '/',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/success-page.js"></script>',
  });
});

router.get('/cancel', (_req, res) => {
  res.render('pages/booking-cancel', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    showTestingBanner: homeTestingBanner(),
    title: 'Platba zrušená',
    description: 'Platba bola zrušená.',
    backUrl: '/#booking',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

module.exports = router;
