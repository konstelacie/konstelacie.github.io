const express = require('express');
const config = require('../config');
const { resolveLegalBackHref, readLegalFromQuery } = require('../lib/legalBackHref');

const router = express.Router();

function legalPageLocals(req) {
  return {
    backHref: resolveLegalBackHref(req),
    legalFromQuery: readLegalFromQuery(req),
    legalEntity: config.site.legalEntity,
    legalCompanyName: config.site.legalCompanyName,
    legalIco: config.site.legalIco,
    legalEmail: config.site.legalEmail,
  };
}

router.get('/ochrana-udajov', (req, res) => {
  res.render('ochrana-udajov', {
    layout: 'layouts/default',
    title: 'Ochrana osobných údajov · citimtedasom.sk',
    description:
      'Informácie o spracúvaní osobných údajov, cookies a službách tretích strán (Meta Pixel, platby).',
    ...legalPageLocals(req),
  });
});

router.get('/obchodne-podmienky', (req, res) => {
  res.render('obchodne-podmienky', {
    layout: 'layouts/default',
    title: 'Obchodné podmienky · citimtedasom.sk',
    description: 'Obchodné podmienky rezervácie a úhrady služieb cez citimtedasom.sk.',
    ...legalPageLocals(req),
  });
});

module.exports = router;
