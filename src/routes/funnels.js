const express = require('express');
const { resolveCampaignVideo } = require('../config/funnelVideo');
const { ApiError } = require('../middleware/apiError');

const router = express.Router();

/** Known funnel instances. Add new instances here; routes and payment redirects use this. */
const FUNNEL_INSTANCES = ['pilot'];

function getTodayLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' });
}
function getMaxDateLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' });
}

/**
 * Campaign data per funnel instance. Override via ?campaign=id.
 *
 * Video (see docs/CREATIVE-MEDIA.md):
 * - `videoId` — stable logical id: `{funnel}-{role}-r{n}` (kebab-case, English).
 * - `video`: `{ provider: 'self', src }` or `{ provider: 'self', sources: [{ src, type? }] }`
 *   or `{ provider: 'wistia', hashedId }`.
 * - Legacy: `videoUrl` only (iframe) still supported if `video` is omitted.
 */
const pilotPoslanie = {
  headline: 'Ako na poslanie',
  subhead: 'Podľa dohody, tajný trik sa dozvieš okamžite, stačí spustiť video ⬇⬇⬇',
  videoId: 'pilot-hero-r1',
  video: {
    provider: 'self',
    src: '/assets/media/funnel/pilot-hero-r1.webm',
  },
  summary: '<p>Placeholder text pre zhrnutie…</p>',
};

const INSTANCE_CAMPAIGNS = {
  pilot: {
    default: { ...pilotPoslanie },
    poslanie: { ...pilotPoslanie },
    zavist: {
      headline: 'Závisť: vie mi niečo dať?',
      subhead: 'Podľa dohody, tajný trik sa dozvieš okamžite, stačí spustiť video ⬇⬇⬇',
      videoId: 'pilot-hero-r1',
      video: {
        provider: 'self',
        src: '/assets/media/funnel/pilot-hero-r1.webm',
      },
      summary: '<p>Placeholder text pre zhrnutie…</p>',
    },
    // Example — Wistia: same videoId, swap provider when you move off self-hosted
    // wistia: {
    //   videoId: 'pilot-hero-r1',
    //   video: { provider: 'wistia', hashedId: 'YOUR_WISTIA_HASHED_ID' },
    //   headline: '…',
    //   subhead: '…',
    //   summary: '…',
    // },
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
 * Parse and validate funnel A/B attribution from API body (booking).
 * Campaign ids must exist in INSTANCE_CAMPAIGNS for the funnel.
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
    throw new ApiError('VALIDATION_ERROR', 'Invalid funnelName', 400);
  }
  const campaigns = INSTANCE_CAMPAIGNS[funnelName] || { default: {} };
  const campaignId =
    rawCampaign != null && String(rawCampaign).trim() !== '' ? String(rawCampaign).trim() : 'default';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(campaignId)) {
    throw new ApiError('VALIDATION_ERROR', 'Invalid funnelCampaign', 400);
  }
  if (!Object.prototype.hasOwnProperty.call(campaigns, campaignId)) {
    throw new ApiError('VALIDATION_ERROR', 'Unknown funnel campaign', 400);
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

  const meta = INSTANCE_META[funnelName] || { title: funnelName, description: '' };

  res.render(`funnels/${funnelName}`, {
    layout: 'layouts/default',
    hideHeader: true,
    title: meta.title,
    description: meta.description,
    campaign,
    campaignVideo,
    funnelName,
    funnelCampaignId: campaignId,
    funnelVideoId: campaign.videoId != null ? String(campaign.videoId) : null,
    bookingDateDefault: getTodayLocal(),
    bookingDateMin: getTodayLocal(),
    bookingDateMax: getMaxDateLocal(),
    extraStyles: `
      <link rel="stylesheet" href="/assets/css/funnel.css">
    `,
    extraScripts: `
      <script src="/assets/js/booking.js"></script>
      <script src="/assets/js/funnel.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded',function(){
          var d=document.getElementById('booking-date');
          if(d&&!d.value){
            var today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Bratislava'});
            d.value=today;d.min=today;
            var max=new Date();max.setDate(max.getDate()+21);d.max=max.toLocaleDateString('en-CA',{timeZone:'Europe/Bratislava'});
          }
        });
      </script>
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
