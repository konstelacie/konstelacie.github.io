#!/usr/bin/env node
/**
 * Canonical & SEO audit for citimtedasom.sk (static site)
 *
 * - Scans all *.html files
 * - Injects/updates canonical tag into <head>
 * - Injects/updates og:url for indexable pages
 * - Verifies no canonicals point to citimtedasom.online or github.io
 * - Prints summary: total html, canonicals present, indexable in sitemap
 *
 * Usage: node scripts/canonical-audit.js [--dry-run]
 *   --dry-run: report only, do not modify files
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOST = 'https://citimtedasom.sk';
const BAD_DOMAINS = ['citimtedasom.online', 'github.io'];

const INDEXABLE_PATHS = new Set([
  '/',
  '/temy/rodicia-a-rodina/vina-voci-rodicom/',
  '/temy/rodicia-a-rodina/zodpovedny-za-pohodu-rodicov/',
]);

function findHtmlFiles(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findHtmlFiles(full, list);
    } else if (e.name === 'index.html') {
      list.push(full);
    }
  }
  return list;
}

function filePathToCanonicalPath(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  const dir = path.dirname(rel);
  return '/' + dir + '/';
}

function filePathToCanonicalUrl(filePath) {
  return HOST + filePathToCanonicalPath(filePath);
}

function hasBadCanonical(html) {
  return BAD_DOMAINS.some((d) => html.includes(d));
}

function getCanonicalUrl(html) {
  const m = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
  return m ? m[1] : null;
}

function getOgUrl(html) {
  const m = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/);
  return m ? m[1] : null;
}

function injectCanonical(html, canonicalUrl) {
  const existing = /<link\s+rel="canonical"\s+href="[^"]+"\s*\/?>/;
  const tag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (existing.test(html)) {
    return html.replace(existing, tag);
  }
  return html.replace(/<meta\s+name="viewport"[^>]*\/?>/, (m) => m + '\n  ' + tag);
}

function injectOgUrl(html, ogUrl) {
  const existing = /<meta\s+property="og:url"\s+content="[^"]+"\s*\/?>/;
  const tag = `<meta property="og:url" content="${ogUrl}" />`;
  if (existing.test(html)) {
    return html.replace(existing, tag);
  }
  const afterDesc = html.match(/(<meta\s+name="description"[^>]*\/?>)/);
  if (afterDesc) {
    return html.replace(afterDesc[1], afterDesc[1] + '\n  ' + tag);
  }
  const afterCanonical = html.match(/(<link\s+rel="canonical"[^>]*\/?>)/);
  if (afterCanonical) {
    return html.replace(afterCanonical[1], afterCanonical[1] + '\n  ' + tag);
  }
  return html.replace(/<meta\s+name="viewport"[^>]*\/?>/, (m) => m + '\n  ' + tag);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const htmlFiles = findHtmlFiles(ROOT);

  let canonicalCount = 0;
  let ogUrlCount = 0;
  const badCanonicals = [];
  const updated = [];
  const indexableInSitemap = [];

  for (const fp of htmlFiles) {
    let html = fs.readFileSync(fp, 'utf8');
    const canonPath = filePathToCanonicalPath(fp);
    const canonUrl = filePathToCanonicalUrl(fp);
    const isIndexable = INDEXABLE_PATHS.has(canonPath);

    if (hasBadCanonical(html)) {
      badCanonicals.push({ path: path.relative(ROOT, fp), url: getCanonicalUrl(html) });
    }

    const currentCanonical = getCanonicalUrl(html);
    const expectedCanonical = canonUrl;
    const needsCanonical = !currentCanonical || currentCanonical !== expectedCanonical;

    const currentOgUrl = getOgUrl(html);
    const needsOgUrl = isIndexable && (!currentOgUrl || currentOgUrl !== expectedCanonical);

    if (currentCanonical) canonicalCount++;
    if (currentOgUrl && isIndexable) ogUrlCount++;
    if (isIndexable) indexableInSitemap.push(canonUrl);

    if ((needsCanonical || needsOgUrl) && !dryRun) {
      if (needsCanonical) html = injectCanonical(html, expectedCanonical);
      if (needsOgUrl) html = injectOgUrl(html, expectedCanonical);
      fs.writeFileSync(fp, html, 'utf8');
      updated.push(path.relative(ROOT, fp));
    }
  }

  console.log('--- Canonical & SEO audit ---');
  console.log(`Total HTML files: ${htmlFiles.length}`);
  console.log(`Pages with canonical: ${canonicalCount}`);
  console.log(`Indexable pages with og:url: ${ogUrlCount}`);
  console.log(`Indexable URLs (sitemap): ${indexableInSitemap.length}`);
  console.log('');

  if (badCanonicals.length) {
    console.log('WARNING: Bad canonicals (citimtedasom.online or github.io):');
    badCanonicals.forEach(({ path: p, url }) => console.log(`  - ${p}: ${url}`));
    console.log('');
  }

  if (updated.length) {
    console.log('Updated files:');
    updated.forEach((p) => console.log(`  - ${p}`));
  } else if (dryRun) {
    console.log('No changes needed (or use without --dry-run to apply).');
  } else {
    console.log('No files modified.');
  }
}

main();
