#!/usr/bin/env node
/**
 * Canonical & SEO audit for citimtedasom.sk (static site)
 *
 * Checks and optionally fixes:
 * - canonical tag (host, trailing slash, no index.html, no query params)
 * - og:url for indexable pages only
 *
 * NEVER changes meta robots.
 *
 * Usage:
 *   node scripts/canonical-audit.js --check   (default: report only, no writes, exit non-zero on issues)
 *   node scripts/canonical-audit.js --fix    (write canonical/og:url fixes)
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

function canonicalIsValid(url) {
  if (!url || !url.startsWith(HOST)) return false;
  if (url.includes('index.html')) return false;
  if (url.includes('?')) return false;
  return url === HOST + '/' || url.endsWith('/');
}

function injectCanonical(html, canonicalUrl) {
  const existing = /<link\s+rel="canonical"\s+href="[^"]+"\s*\/?>/;
  const tag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (existing.test(html)) {
    return html.replace(existing, tag);
  }
  return html.replace(/(<meta\s+name="viewport"[^>]*\/?>)/, (m) => m + '\n  ' + tag);
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
  return html.replace(/(<meta\s+name="viewport"[^>]*\/?>)/, (m) => m + '\n  ' + tag);
}

function runCheck(htmlFiles) {
  const missingCanonical = [];
  const canonicalMismatch = [];
  const badDomains = [];
  const indexableMissingOgUrl = [];

  for (const fp of htmlFiles) {
    const rel = path.relative(ROOT, fp);
    const html = fs.readFileSync(fp, 'utf8');
    const canonPath = filePathToCanonicalPath(fp);
    const canonUrl = filePathToCanonicalUrl(fp);
    const isIndexable = INDEXABLE_PATHS.has(canonPath);

    if (hasBadCanonical(html)) {
      badDomains.push({ rel, url: getCanonicalUrl(html) || '(in og:url or elsewhere)' });
    }

    const current = getCanonicalUrl(html);
    if (!current) {
      missingCanonical.push(rel);
    } else if (current !== canonUrl || !canonicalIsValid(current)) {
      canonicalMismatch.push({ rel, expected: canonUrl, found: current });
    }

    if (isIndexable) {
      const og = getOgUrl(html);
      if (!og || og !== canonUrl) {
        indexableMissingOgUrl.push({ rel, expected: canonUrl, found: og || '(missing)' });
      }
    }
  }

  return {
    total: htmlFiles.length,
    missingCanonical,
    canonicalMismatch,
    badDomains,
    indexableMissingOgUrl,
    hasIssues: Boolean(
      missingCanonical.length ||
      canonicalMismatch.length ||
      badDomains.length ||
      indexableMissingOgUrl.length
    ),
  };
}

function printReport(report) {
  console.log('--- Canonical & SEO audit ---');
  console.log(`Total HTML files: ${report.total}`);
  console.log('');

  if (report.missingCanonical.length) {
    console.log('Missing canonical:');
    report.missingCanonical.forEach((p) => console.log(`  - ${p}`));
    console.log('');
  }

  if (report.canonicalMismatch.length) {
    console.log('Canonical mismatch (expected vs found):');
    report.canonicalMismatch.forEach(({ rel, expected, found }) =>
      console.log(`  - ${rel}\n    expected: ${expected}\n    found: ${found}`)
    );
    console.log('');
  }

  if (report.badDomains.length) {
    console.log('Bad domains (citimtedasom.online, github.io):');
    report.badDomains.forEach(({ rel, url }) => console.log(`  - ${rel}: ${url}`));
    console.log('');
  }

  if (report.indexableMissingOgUrl.length) {
    console.log('Indexable pages missing or wrong og:url:');
    report.indexableMissingOgUrl.forEach(({ rel, expected, found }) =>
      console.log(`  - ${rel}\n    expected: ${expected}\n    found: ${found}`)
    );
    console.log('');
  }

  if (!report.hasIssues) {
    console.log('No issues found.');
  }
}

function runFix(htmlFiles) {
  const updated = [];

  for (const fp of htmlFiles) {
    let html = fs.readFileSync(fp, 'utf8');
    const canonPath = filePathToCanonicalPath(fp);
    const canonUrl = filePathToCanonicalUrl(fp);
    const isIndexable = INDEXABLE_PATHS.has(canonPath);

    const currentCanonical = getCanonicalUrl(html);
    const needsCanonical =
      !currentCanonical ||
      currentCanonical !== canonUrl ||
      !canonicalIsValid(currentCanonical);

    const currentOgUrl = getOgUrl(html);
    const needsOgUrl = isIndexable && (!currentOgUrl || currentOgUrl !== canonUrl);

    if (needsCanonical) html = injectCanonical(html, canonUrl);
    if (needsOgUrl) html = injectOgUrl(html, canonUrl);

    if (needsCanonical || needsOgUrl) {
      fs.writeFileSync(fp, html, 'utf8');
      updated.push(path.relative(ROOT, fp));
    }
  }

  return updated;
}

function main() {
  const args = process.argv.slice(2);
  // --fix present → fix; otherwise → check (default with no args)
  const mode = args.includes('--fix') ? 'fix' : 'check';

  const htmlFiles = findHtmlFiles(ROOT);

  if (mode === 'check') {
    const report = runCheck(htmlFiles);
    printReport(report);
    process.exit(report.hasIssues ? 1 : 0);
  }

  if (mode === 'fix') {
    const report = runCheck(htmlFiles);
    if (report.hasIssues) {
      const updated = runFix(htmlFiles);
      console.log('--- Fix mode: applied changes ---');
      if (updated.length) {
        updated.forEach((p) => console.log(`  - ${p}`));
      } else {
        console.log('No files modified (issues may be non-fixable, e.g. bad domains).');
      }
      console.log('');
      console.log('Run --check again to verify:');
      console.log('  node scripts/canonical-audit.js --check');
    } else {
      console.log('No issues to fix.');
    }
  }
}

main();
