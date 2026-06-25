const path = require('path');
const express = require('express');
const pageVisibility = require('../config/pageVisibility');
const { FUNNEL_PAGE_INSTANCES } = require('../config/funnelInstances');

const router = express.Router();
const projectRoot = path.join(__dirname, '..', '..');

const SITE_ORIGIN = 'https://citimtedasom.sk';

function funnelDisallowLines() {
  const lines = [];
  for (const name of FUNNEL_PAGE_INSTANCES) {
    lines.push(`Disallow: /${name}`);
    lines.push(`Disallow: /${name}-test`);
    lines.push(`Disallow: /${name}/`);
    lines.push(`Disallow: /${name}-test/`);
  }
  return lines;
}

router.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'assets', 'favicon', 'favicon.ico'));
});

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  const disallowFunnels = funnelDisallowLines();
  if (pageVisibility.getHomeMode() === 'test') {
    res.send(['User-agent: *', 'Disallow: /', ...disallowFunnels, ''].join('\n'));
    return;
  }
  res.send(
    [
      'User-agent: *',
      'Allow: /',
      ...disallowFunnels,
      'Disallow: /admin',
      'Disallow: /email-subscribe-success',
      `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

router.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml');
  const urls = [];
  if (pageVisibility.homeIsIndexable()) {
    urls.push(`  <url>\n    <loc>${SITE_ORIGIN}/</loc>\n  </url>`);
  }
  for (const path of ['/ochrana-udajov', '/obchodne-podmienky']) {
    urls.push(`  <url>\n    <loc>${SITE_ORIGIN}${path}</loc>\n  </url>`);
  }
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
  res.send(body);
});

module.exports = router;
