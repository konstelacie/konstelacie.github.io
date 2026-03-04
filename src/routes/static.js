const express = require('express');
const path = require('path');

const router = express.Router();
const projectRoot = path.join(__dirname, '..', '..');

router.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(projectRoot, 'robots.txt'));
});

router.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(projectRoot, 'sitemap.xml'));
});

module.exports = router;
