const express = require('express');

const router = express.Router();

function getTodayLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' });
}
function getMaxDateLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' });
}

/** Default campaign when no variant specified. Override via ?campaign=id or route param. */
const CAMPAIGNS = {
  default: {
    headline: 'Nadpis pilot funnels',
    subhead: 'Podnadpis – stručný popis ponuky.',
    videoUrl: null,
    summary: '<p>Placeholder text pre zhrnutie…</p>',
  },
  // Add campaign variants here, e.g.:
  // 'pattern': { headline: '...', subhead: '...', videoUrl: 'https://...', summary: '<p>...</p>' },
};

router.get('/pilot/', (req, res) => {
  const campaignId = req.query.campaign || 'default';
  const campaign = { ...CAMPAIGNS.default, ...CAMPAIGNS[campaignId] };

  res.render('funnels/pilot', {
    layout: 'layouts/default',
    title: 'Pilot – V príprave',
    description: 'Pilot funnel – v príprave.',
    campaign,
    bookingDateDefault: getTodayLocal(),
    bookingDateMin: getTodayLocal(),
    bookingDateMax: getMaxDateLocal(),
    extraStyles: `
      <link rel="stylesheet" href="/assets/css/funnel.css">
      <link rel="stylesheet" href="/assets/css/pseudochat.css">
    `,
    extraScripts: `
      <script src="/assets/js/booking.js"></script>
      <script src="/assets/js/funnel.js"></script>
      <script type="module" src="/assets/js/funnel-chatbot.js"></script>
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

router.get('/pilot/success', (req, res) => {
  res.render('funnels/pilot-success', {
    layout: 'layouts/default',
    title: 'Platba dokončená – Pilot',
    description: 'Ďakujeme, platba je dokončená.',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/success-page.js"></script>',
  });
});

router.get('/pilot/cancel', (req, res) => {
  res.render('funnels/pilot-cancel', {
    layout: 'layouts/default',
    title: 'Platba zrušená – Pilot',
    description: 'Platba bola zrušená.',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
  });
});

module.exports = router;
