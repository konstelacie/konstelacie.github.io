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

router.get('/pilot/', (req, res) => {
  res.render('funnels/pilot', {
    layout: 'layouts/default',
    title: 'Pilot – V príprave',
    description: 'Pilot funnel – v príprave.',
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

module.exports = router;
