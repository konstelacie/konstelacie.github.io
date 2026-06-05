const express = require('express');
const appConfig = require('../config');
const { FUNNEL_INSTANCES, FUNNEL_PAGE_INSTANCES } = require('../config/funnelInstances');
const pageVisibility = require('../config/pageVisibility');
const { resolveCampaignVideo } = require('../config/funnelVideo');
const {
  bookingPricingViewLocals,
  bookingPricingDefaultsScriptTag,
} = require('../lib/bookingCheckoutAmounts');
const { ApiError } = require('../middleware/apiError');

const router = express.Router();

/**
 * Campaign data per funnel instance. Override via ?campaign=id.
 *
 * Video (see docs/CREATIVE-MEDIA.md):
 * - `videoId` — stable logical id: `{funnel}-{role}-r{n}` (kebab-case, English).
 * - `video`: `{ provider: 'self', src }` or `{ provider: 'self', sources: [{ src, type? }] }`
 *   or `{ provider: 'wistia', hashedId }`.
 * - Legacy: `videoUrl` only (iframe) still supported if `video` is omitted.
 */
/** Temporary: same Wistia embed for all pilot campaigns until prod assets are ready. */
const WISTIA_TEST_HASHED_ID = 'qyexpnd6fa';

/**
 * Lower content reveal (see docs/ui-ux/video-scroll-reveal-strategy.md).
 * Layer 1: DOM unlock (semantic time or % watched fallback).
 * Layer 2: scroll hint arrow after delay.
 * Layer 3: optional gentle emphasis if user has not scrolled.
 */
const DEFAULT_LOWER_CONTENT_REVEAL = {
  enabled: true,
  semanticTriggerSec: null,
  fallbackPercentWatched: 0.3,
  fallbackAbsoluteSec: null,
  layer2DelayMs: 3000,
  layer3: {
    enabled: true,
    delayAfterLayer2Ms: 8000,
    helperTextEnabled: false,
    helperText: 'Pokračovať',
    maxEmphasisCycles: 3,
  },
  repeatVisit: {
    unlockImmediately: true,
    fallbackPercentWatched: 0.1,
    layer2DelayMs: 1000,
    layer3: {
      delayAfterLayer2Ms: 4000,
      maxEmphasisCycles: 2,
    },
  },
  onPause: {
    freezeRevealTimers: false,
    freezeEmphasisOnly: true,
  },
  onVideoEnd: {
    emphasisIfNotScrolled: 'once_light',
  },
};

const pilotPoslanie = {
  headline: 'Musím nájsť poslanie. Alebo nie?',
  subhead: 'Pozri si toto krátke video ↓',
  videoId: 'pilot-hero-r1',
  video: {
    provider: 'wistia',
    hashedId: WISTIA_TEST_HASHED_ID,
  },
  lowerContentReveal: { ...DEFAULT_LOWER_CONTENT_REVEAL },
};

const manipulaciaDefault = {
  headline: 'Ako sa ubrániť manipulácii?',
  subhead: 'Dozvieš sa vo videu ↓',
  videoId: 'manipulacia-hero-r1',
  video: {
    provider: 'wistia',
    hashedId: '51i0hphhhk',
  },
  lowerContentReveal: { ...DEFAULT_LOWER_CONTENT_REVEAL },
};

const INSTANCE_CAMPAIGNS = {
  site: {
    default: {
      headline: 'citimtedasom.sk',
      subhead: 'Úvodný text a video doplníme. Nižšie si môžeš vybrať termín online sedenia.',
      lowerContentReveal: { enabled: false },
    },
  },
  pilot: {
    default: { ...pilotPoslanie },
    poslanie: { ...pilotPoslanie },
    zavist: {
      headline: 'Závisť: vie byť aj kamarát?',
      subhead: 'Dozvieš sa vo videu ↓',
      videoId: 'pilot-hero-r1',
      video: {
        provider: 'wistia',
        hashedId: WISTIA_TEST_HASHED_ID,
      },
      lowerContentReveal: { ...DEFAULT_LOWER_CONTENT_REVEAL },
    },
  },
  manipulacia: {
    default: { ...manipulaciaDefault },
  },
};

/** Instance-specific meta (title, description). */
const INSTANCE_META = {
  site: {
    title: 'citimtedasom.sk',
    description: 'Online konštelácie a osobný rozvoj. Rezervácia termínu, príprava obsahu.',
    successTitle: 'Platba dokončená',
    cancelTitle: 'Platba zrušená',
  },
  pilot: {
    title: 'Pilot – V príprave',
    description: 'Pilot funnel – v príprave.',
    successTitle: 'Platba dokončená',
    cancelTitle: 'Platba zrušená',
  },
  manipulacia: {
    title: 'Manipulácia – citimtedasom.sk',
    description: 'Krátke video o tom, ako rozpoznať manipuláciu vo vzťahoch — a čo s tým.',
    successTitle: 'Platba dokončená',
    cancelTitle: 'Platba zrušená',
  },
};

function buildFunnelViewLocals(funnelName, queryCampaign) {
  const campaigns = INSTANCE_CAMPAIGNS[funnelName] || { default: {} };
  const campaignId = queryCampaign || 'default';
  const campaign = { ...campaigns.default, ...campaigns[campaignId] };
  const campaignVideo = resolveCampaignVideo(campaign);
  const lowerContentReveal = resolveLowerContentReveal(campaign);
  const meta = INSTANCE_META[funnelName] || { title: funnelName, description: '' };
  return {
    title: meta.title,
    description: meta.description,
    campaign,
    campaignVideo,
    lowerContentReveal,
    funnelName,
    funnelCampaignId: campaignId,
    funnelVideoId: campaign.videoId != null ? String(campaign.videoId) : null,
    ...bookingPricingViewLocals(funnelName),
  };
}

function funnelTestingBanner(funnelName) {
  if (appConfig.site.testingBannerGloballyDisabled) return false;
  return pageVisibility.shouldShowTestingBannerForFunnel(funnelName);
}

function renderFunnelExpressPage(res, funnelName, req) {
  const locals = buildFunnelViewLocals(funnelName, req.query && req.query.campaign);
  const view = `funnels/${funnelName}`;
  res.render(view, {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    showTestingBanner: funnelTestingBanner(funnelName),
    ...locals,
    extraStyles: `
      <link rel="stylesheet" href="/assets/css/funnel.css">
    `,
    extraScripts: `
      ${bookingPricingDefaultsScriptTag()}
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

/**
 * @param {object} campaign - merged campaign row
 * @returns {object} Resolved reveal config for the template / JSON (see DEFAULT_LOWER_CONTENT_REVEAL)
 */
function resolveLowerContentReveal(campaign) {
  const raw = campaign.lowerContentReveal;
  if (raw === false || (raw && raw.enabled === false)) {
    return { enabled: false };
  }
  const r = raw && typeof raw === 'object' ? raw : {};
  const def = DEFAULT_LOWER_CONTENT_REVEAL;
  const layer3 = {
    ...def.layer3,
    ...(r.layer3 && typeof r.layer3 === 'object' ? r.layer3 : {}),
  };
  const repeatVisit = {
    ...def.repeatVisit,
    ...(r.repeatVisit && typeof r.repeatVisit === 'object' ? r.repeatVisit : {}),
    layer3: {
      ...def.repeatVisit.layer3,
      ...(r.repeatVisit && r.repeatVisit.layer3 && typeof r.repeatVisit.layer3 === 'object'
        ? r.repeatVisit.layer3
        : {}),
    },
  };
  const onPause = { ...def.onPause, ...(r.onPause && typeof r.onPause === 'object' ? r.onPause : {}) };
  const onVideoEnd = { ...def.onVideoEnd, ...(r.onVideoEnd && typeof r.onVideoEnd === 'object' ? r.onVideoEnd : {}) };

  const semanticTriggerSec =
    typeof r.semanticTriggerSec === 'number' && r.semanticTriggerSec >= 0 ? r.semanticTriggerSec : def.semanticTriggerSec;

  let fallbackPercentWatched = def.fallbackPercentWatched;
  if (typeof r.fallbackPercentWatched === 'number' && r.fallbackPercentWatched >= 0 && r.fallbackPercentWatched <= 1) {
    fallbackPercentWatched = r.fallbackPercentWatched;
  }

  let fallbackAbsoluteSec = def.fallbackAbsoluteSec;
  if (typeof r.fallbackAbsoluteSec === 'number' && r.fallbackAbsoluteSec >= 0) {
    fallbackAbsoluteSec = r.fallbackAbsoluteSec;
  }

  let layer2DelayMs = def.layer2DelayMs;
  if (typeof r.layer2DelayMs === 'number' && r.layer2DelayMs >= 0) {
    layer2DelayMs = r.layer2DelayMs;
  }

  return {
    enabled: true,
    semanticTriggerSec,
    fallbackPercentWatched,
    fallbackAbsoluteSec,
    layer2DelayMs,
    layer3,
    repeatVisit,
    onPause,
    onVideoEnd,
  };
}

/**
 * Parse funnel A/B attribution from API body (booking).
 * Unknown funnel name → null attribution; invalid/unknown campaign id → default campaign.
 * @param {object} body - req.body
 * @returns {{ funnelName: string|null, funnelCampaign: string|null, funnelVideoId: string|null }}
 */
function parseFunnelAttribution(body) {
  const rawName = body?.funnelName ?? body?.funnel;
  const rawCampaign = body?.funnelCampaign ?? body?.campaign;
  if (rawName == null || String(rawName).trim() === '') {
    return { funnelName: null, funnelCampaign: null, funnelVideoId: null };
  }
  const funnelName = String(rawName).trim();
  if (!FUNNEL_INSTANCES.includes(funnelName)) {
    return { funnelName: null, funnelCampaign: null, funnelVideoId: null };
  }
  const campaigns = INSTANCE_CAMPAIGNS[funnelName] || { default: {} };
  let campaignId =
    rawCampaign != null && String(rawCampaign).trim() !== '' ? String(rawCampaign).trim() : 'default';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(campaignId)) {
    campaignId = 'default';
  }
  if (!Object.prototype.hasOwnProperty.call(campaigns, campaignId)) {
    campaignId = 'default';
  }
  const merged = { ...campaigns.default, ...campaigns[campaignId] };
  const funnelVideoId = merged.videoId != null ? String(merged.videoId).slice(0, 128) : null;
  return { funnelName, funnelCampaign: campaignId, funnelVideoId };
}

// Funnel pages: /pilot, /pilot-test, etc. (see docs/PAGE-VISIBILITY.md)
router.get('/:segment/success', (req, res, next) => {
  const resolved = pageVisibility.resolveFunnelUrlSegment(req.params.segment);
  if (!resolved) return next('route');
  if (resolved.redirectHome) return res.redirect(302, '/');

  const { funnelName } = resolved;
  const meta = INSTANCE_META[funnelName] || {};
  res.render('pages/booking-success', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    showTestingBanner: funnelTestingBanner(funnelName),
    title: meta.successTitle || 'Platba dokončená',
    description: 'Ďakujeme, platba je dokončená.',
    homeUrl: '/',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/success-page.js"></script>',
  });
});

router.get('/:segment/cancel', (req, res, next) => {
  const resolved = pageVisibility.resolveFunnelUrlSegment(req.params.segment);
  if (!resolved) return next('route');
  if (resolved.redirectHome) return res.redirect(302, '/');

  const { funnelName } = resolved;
  const meta = INSTANCE_META[funnelName] || {};
  const publicPath = pageVisibility.buildPublicPath(funnelName);
  res.render('pages/booking-cancel', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    showTestingBanner: funnelTestingBanner(funnelName),
    title: meta.cancelTitle || 'Platba zrušená',
    description: 'Platba bola zrušená.',
    backUrl: `${publicPath}#booking`,
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

router.get('/:segment', (req, res, next) => {
  const resolved = pageVisibility.resolveFunnelUrlSegment(req.params.segment);
  if (!resolved) return next('route');
  if (resolved.redirectHome) return res.redirect(302, '/');

  renderFunnelExpressPage(res, resolved.funnelName, req);
});

module.exports = router;
module.exports.FUNNEL_INSTANCES = FUNNEL_INSTANCES;
module.exports.FUNNEL_PAGE_INSTANCES = FUNNEL_PAGE_INSTANCES;
module.exports.parseFunnelAttribution = parseFunnelAttribution;
