const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'robots.txt'));
});

router.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'sitemap.xml'));
});

module.exports = router;
