const express = require('express');

const router = express.Router();

router.get('/platba-doplatok', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.render('pages/platba-doplatok', {
    layout: 'layouts/default',
    title: 'Doplatok za sedenie · citimtedasom.sk',
    description: 'Voliteľný doplatok k už uhradenej rezervácii sedenia.',
    robotsNoindex: true,
    token,
  });
});

module.exports = router;
