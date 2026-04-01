const express = require('express');
const { resolveCampaignVideo } = require('../config/funnelVideo');
const { ApiError } = require('../middleware/apiError');

const router = express.Router();

/** Known funnel instances. Add new instances here; routes and payment redirects use this. */
const FUNNEL_INSTANCES = ['pilot'];

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

const INSTANCE_CAMPAIGNS = {
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
};

/**
 * Flat list of funnel + campaign for dev/testing links (e.g. home page).
 * @returns {{ funnelName: string, campaignId: string, href: string }[]}
 */
function getFunnelCampaignLinks() {
  const out = [];
  for (const funnelName of FUNNEL_INSTANCES) {
    const campaigns = INSTANCE_CAMPAIGNS[funnelName];
    if (!campaigns) continue;
    for (const campaignId of Object.keys(campaigns)) {
      const href =
        campaignId === 'default'
          ? `/${funnelName}`
          : `/${funnelName}?campaign=${encodeURIComponent(campaignId)}`;
      out.push({ funnelName, campaignId, href });
    }
  }
  return out;
}

/** Instance-specific meta (title, description). */
const INSTANCE_META = {
  pilot: {
    title: 'Pilot – V príprave',
    description: 'Pilot funnel – v príprave.',
    successTitle: 'Platba dokončená',
    cancelTitle: 'Platba zrušená',
  },
};

function isValidFunnel(name) {
  return typeof name === 'string' && FUNNEL_INSTANCES.includes(name);
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

// Main funnel page: /pilot, /pattern, etc.
router.get('/:funnelName', (req, res, next) => {
  const { funnelName } = req.params;
  if (!isValidFunnel(funnelName)) return next('route');

  const campaigns = INSTANCE_CAMPAIGNS[funnelName] || { default: {} };
  const campaignId = req.query.campaign || 'default';
  const campaign = { ...campaigns.default, ...campaigns[campaignId] };
  const campaignVideo = resolveCampaignVideo(campaign);
  const lowerContentReveal = resolveLowerContentReveal(campaign);

  const meta = INSTANCE_META[funnelName] || { title: funnelName, description: '' };

  res.render(`funnels/${funnelName}`, {
    layout: 'layouts/default',
    hideHeader: true,
    title: meta.title,
    description: meta.description,
    campaign,
    campaignVideo,
    lowerContentReveal,
    funnelName,
    funnelCampaignId: campaignId,
    funnelVideoId: campaign.videoId != null ? String(campaign.videoId) : null,
    extraStyles: `
      <link rel="stylesheet" href="/assets/css/funnel.css">
    `,
    extraScripts: `
      <script src="/assets/js/booking.js"></script>
      <script src="/assets/js/funnel.js"></script>
    `
  });
});

// Success: /pilot/success, /pattern/success, etc.
router.get('/:funnelName/success', (req, res, next) => {
  const { funnelName } = req.params;
  if (!isValidFunnel(funnelName)) return next('route');

  const meta = INSTANCE_META[funnelName] || {};
  res.render('funnels/_funnel-success', {
    layout: 'layouts/default',
    hideHeader: true,
    title: meta.successTitle || 'Platba dokončená',
    description: 'Ďakujeme, platba je dokončená.',
    backUrl: `/${funnelName}#booking`,
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/success-page.js"></script>',
  });
});

// Cancel: /pilot/cancel, /pattern/cancel, etc.
router.get('/:funnelName/cancel', (req, res, next) => {
  const { funnelName } = req.params;
  if (!isValidFunnel(funnelName)) return next('route');

  const meta = INSTANCE_META[funnelName] || {};
  res.render('funnels/_funnel-cancel', {
    layout: 'layouts/default',
    hideHeader: true,
    title: meta.cancelTitle || 'Platba zrušená',
    description: 'Platba bola zrušená.',
    backUrl: `/${funnelName}#booking`,
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

module.exports = router;
module.exports.FUNNEL_INSTANCES = FUNNEL_INSTANCES;
module.exports.parseFunnelAttribution = parseFunnelAttribution;
module.exports.getFunnelCampaignLinks = getFunnelCampaignLinks;
