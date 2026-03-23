const express = require('express');
const { getFunnelCampaignLinks } = require('./funnels');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    layout: 'layouts/default',
    title: 'citimtedasom.sk',
    description: 'Stránka sa pripravuje.',
    home: true,
    funnelCampaignLinks: getFunnelCampaignLinks(),
  });
});

module.exports = router;
