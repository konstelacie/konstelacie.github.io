const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/ochrana-udajov', (req, res) => {
  res.render('ochrana-udajov', {
    layout: 'layouts/default',
    title: 'Ochrana osobných údajov · citimtedasom.sk',
    description:
      'Informácie o spracúvaní osobných údajov, cookies a službách tretích strán (Meta Pixel, platby).',
    legalEntity: config.site.legalEntity,
    legalCompanyName: config.site.legalCompanyName,
    legalIco: config.site.legalIco,
    legalEmail: config.site.legalEmail,
  });
});

router.get('/obchodne-podmienky', (req, res) => {
  res.render('obchodne-podmienky', {
    layout: 'layouts/default',
    title: 'Obchodné podmienky · citimtedasom.sk',
    description: 'Obchodné podmienky rezervácie a úhrady služieb cez citimtedasom.sk.',
    legalEntity: config.site.legalEntity,
    legalCompanyName: config.site.legalCompanyName,
    legalIco: config.site.legalIco,
    legalEmail: config.site.legalEmail,
  });
});

module.exports = router;
