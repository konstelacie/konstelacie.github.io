const express = require('express');

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

/** Campaign data per funnel instance. Override via ?campaign=id. */
const INSTANCE_CAMPAIGNS = {
  pilot: {
    default: {
      headline: 'Nadpis pilot funnels',
      subhead: 'Podnadpis – stručný popis ponuky.',
      videoUrl: null,
      summary: '<p>Placeholder text pre zhrnutie…</p>',
    },
    // Add campaign variants: 'pattern': { headline: '...', ... },
  },
};

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

// Main funnel page: /pilot, /pattern, etc.
router.get('/:funnelName', (req, res, next) => {
  const { funnelName } = req.params;
  if (!isValidFunnel(funnelName)) return next('route');

  const campaigns = INSTANCE_CAMPAIGNS[funnelName] || { default: {} };
  const campaignId = req.query.campaign || 'default';
  const campaign = { ...campaigns.default, ...campaigns[campaignId] };

  const meta = INSTANCE_META[funnelName] || { title: funnelName, description: '' };

  res.render(`funnels/${funnelName}`, {
    layout: 'layouts/default',
    title: meta.title,
    description: meta.description,
    campaign,
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
    title: meta.cancelTitle || 'Platba zrušená',
    description: 'Platba bola zrušená.',
    backUrl: `/${funnelName}#booking`,
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

module.exports = router;
module.exports.FUNNEL_INSTANCES = FUNNEL_INSTANCES;
