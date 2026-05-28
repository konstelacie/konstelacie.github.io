const { FUNNEL_PAGE_INSTANCES } = require('./funnelInstances');

const HOME_MODES = ['test', 'prod'];
const FUNNEL_MODES = ['hidden', 'test', 'prod'];

function parseMode(raw, allowed, defaultMode) {
  const s = String(raw ?? '').trim().toLowerCase();
  return allowed.includes(s) ? s : defaultMode;
}

function getHomeMode() {
  return parseMode(process.env.SITE_HOME_MODE, HOME_MODES, 'test');
}

function getFunnelMode(funnelName) {
  const key = `FUNNEL_${String(funnelName).toUpperCase()}_MODE`;
  return parseMode(process.env[key], FUNNEL_MODES, 'hidden');
}

function homeIsIndexable() {
  return getHomeMode() === 'prod';
}

/** URL path segment for a page funnel, or null when hidden / not a page funnel. */
function funnelPublicSegment(funnelName) {
  if (funnelName === 'site') return null;
  if (!FUNNEL_PAGE_INSTANCES.includes(funnelName)) return null;
  const mode = getFunnelMode(funnelName);
  if (mode === 'hidden') return null;
  if (mode === 'test') return `${funnelName}-test`;
  return funnelName;
}

/** Root-relative public path for booking returns (`/` for home). */
function buildPublicPath(funnelName) {
  if (funnelName === 'site') return '/';
  const segment = funnelPublicSegment(funnelName);
  if (!segment) return null;
  return `/${segment}`;
}

function buildSuccessPath(funnelName) {
  if (funnelName === 'site') return '/success';
  const base = buildPublicPath(funnelName);
  if (!base) return null;
  return `${base}/success`;
}

function buildCancelPath(funnelName) {
  if (funnelName === 'site') return '/cancel';
  const base = buildPublicPath(funnelName);
  if (!base) return null;
  return `${base}/cancel`;
}

function normalizePathOnly(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '/';
  const s = raw.trim();
  const hashIdx = s.indexOf('#');
  const beforeHash = hashIdx === -1 ? s : s.slice(0, hashIdx);
  const qIdx = beforeHash.indexOf('?');
  const pathOnly = (qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx)).replace(/\/+$/, '') || '/';
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return '/';
  return pathOnly;
}

/**
 * Map a root-relative path to internal funnel name, or null if unrelated.
 * @param {string} pathOnly - e.g. `/`, `/pilot`, `/pilot-test`
 */
function pathToFunnelName(pathOnly) {
  const p = normalizePathOnly(pathOnly);
  if (p === '/') return 'site';

  const segment = p.split('/').filter(Boolean)[0];
  if (!segment) return 'site';

  for (const name of FUNNEL_PAGE_INSTANCES) {
    const mode = getFunnelMode(name);
    if (mode === 'hidden') continue;
    const expected = mode === 'test' ? `${name}-test` : name;
    if (segment === expected) return name;
  }
  return null;
}

/**
 * Resolve first URL segment for funnel page routes.
 * @returns {{ funnelName: string } | { redirectHome: true } | null}
 */
function resolveFunnelUrlSegment(segment) {
  if (typeof segment !== 'string' || !segment) return null;

  for (const name of FUNNEL_PAGE_INSTANCES) {
    const mode = getFunnelMode(name);
    if (mode === 'hidden') {
      if (segment === name || segment === `${name}-test`) return { redirectHome: true };
      continue;
    }
    const expected = mode === 'test' ? `${name}-test` : name;
    if (segment === expected) return { funnelName: name };
    if (segment === name || segment === `${name}-test`) return { redirectHome: true };
  }
  return null;
}

function shouldShowTestingBannerForHome() {
  return getHomeMode() === 'test';
}

function shouldShowTestingBannerForFunnel(funnelName) {
  return getFunnelMode(funnelName) === 'test';
}

module.exports = {
  HOME_MODES,
  FUNNEL_MODES,
  getHomeMode,
  getFunnelMode,
  homeIsIndexable,
  funnelPublicSegment,
  buildPublicPath,
  buildSuccessPath,
  buildCancelPath,
  normalizePathOnly,
  pathToFunnelName,
  resolveFunnelUrlSegment,
  shouldShowTestingBannerForHome,
  shouldShowTestingBannerForFunnel,
};
