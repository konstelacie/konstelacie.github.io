const express = require('express');
const webinarConfig = require('../config/webinar');
const webinarService = require('../services/webinarService');

const router = express.Router();

function webinarDisabled(_req, res) {
  return res.redirect(302, '/');
}

router.get('/webinar', (req, res, next) => {
  if (!webinarConfig.isConfigured()) {
    return webinarDisabled(req, res);
  }

  try {
    webinarService.assertWebinarEnabled();
  } catch {
    return webinarDisabled(req, res);
  }

  res.render('pages/webinar-register', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    title: webinarConfig.pageTitle,
    description: 'Zvoľ si termín a pozri si webinár v dohodnutom čase.',
    pageTitle: webinarConfig.pageTitle,
    extraStyles: '<link rel="stylesheet" href="/assets/css/webinar.css">',
    extraScripts: '<script src="/assets/js/webinar-register.js" defer></script>',
  });
});

router.get('/webinar/room/:token', async (req, res) => {
  if (!webinarConfig.isConfigured()) {
    return webinarDisabled(req, res);
  }

  const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  if (!token) {
    return res.redirect(302, '/webinar');
  }

  try {
    await webinarService.loadRoomState(token);
  } catch {
    return res.status(404).render('pages/webinar-register', {
      layout: 'layouts/default',
      hideHeader: true,
      robotsNoindex: true,
      title: 'Webinár',
      description: 'Registrácia na webinár',
      pageTitle: 'Webinár',
      registrationError: 'Odkaz na webinár je neplatný alebo expiroval.',
      extraStyles: '<link rel="stylesheet" href="/assets/css/webinar.css">',
      extraScripts: '<script src="/assets/js/webinar-register.js" defer></script>',
    });
  }

  res.render('pages/webinar-room', {
    layout: 'layouts/default',
    hideHeader: true,
    robotsNoindex: true,
    title: 'Webinár — miestnosť',
    description: 'Prehrávanie webinára',
    accessToken: token,
    wistiaHashedId: webinarConfig.wistiaHashedId,
    extraStyles: '<link rel="stylesheet" href="/assets/css/webinar.css">',
    extraScripts: '<script src="/assets/js/webinar-room.js" defer></script>',
  });
});

module.exports = router;
