const express = require('express');

const router = express.Router();

router.get('/pilot/', (req, res) => {
  res.render('funnels/pilot', {
    layout: 'layouts/default',
    title: 'Pilot – V príprave',
    description: 'Pilot funnel – v príprave.',
    extraStyles: '<link rel="stylesheet" href="/assets/css/funnel.css">',
    extraScripts: '<script src="/assets/js/funnel.js"></script>'
  });
});

module.exports = router;
