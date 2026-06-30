const { normalizePathOnly } = require('../config/pageVisibility');

const LEGAL_PAGE_PATHS = new Set(['/ochrana-udajov', '/obchodne-podmienky']);
const MAX_RETURN_LEN = 2048;

function isLegalPagePath(pathOnly) {
  return LEGAL_PAGE_PATHS.has(pathOnly);
}

/**
 * Root-relative return URL for legal-page back links (path + optional ?query #hash).
 * Rejects external paths, traversal, and other legal pages.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
function validateLegalReturnUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();
  if (s.length > MAX_RETURN_LEN) return null;
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('..')) return null;

  const pathOnly = normalizePathOnly(s);
  if (isLegalPagePath(pathOnly)) return null;
  return s;
}

/**
 * @param {string|undefined|null} refererHeader
 * @param {string|undefined|null} host
 * @returns {string|null}
 */
function resolveFromReferer(refererHeader, host) {
  if (!refererHeader || !host) return null;
  try {
    const url = new URL(refererHeader);
    if (url.host.toLowerCase() !== host.toLowerCase()) return null;
    return validateLegalReturnUrl(url.pathname + url.search + url.hash);
  } catch {
    return null;
  }
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveLegalBackHref(req) {
  const fromQuery =
    typeof req.query.from === 'string' ? validateLegalReturnUrl(req.query.from) : null;
  if (fromQuery) return fromQuery;

  const fromReferer = resolveFromReferer(req.get('Referer'), req.get('host'));
  if (fromReferer) return fromReferer;

  return '/';
}

/**
 * @param {string|null|undefined} validatedFrom
 * @returns {string}
 */
function legalFromQueryString(validatedFrom) {
  if (!validatedFrom) return '';
  return `?from=${encodeURIComponent(validatedFrom)}`;
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function readLegalFromQuery(req) {
  const validated =
    typeof req.query.from === 'string' ? validateLegalReturnUrl(req.query.from) : null;
  return legalFromQueryString(validated);
}

module.exports = {
  LEGAL_PAGE_PATHS,
  validateLegalReturnUrl,
  resolveLegalBackHref,
  legalFromQueryString,
  readLegalFromQuery,
};
