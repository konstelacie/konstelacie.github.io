const { FUNNEL_PAGE_INSTANCES } = require('../config/funnelInstances');
const pageVisibility = require('../config/pageVisibility');

/**
 * Resolve funnel name from path, including /{funnel}/success and /{funnel}/cancel.
 * @param {string} pathOnly
 * @returns {string|null}
 */
function pathToFunnelNameIncludingSubpaths(pathOnly) {
  const p = pageVisibility.normalizePathOnly(pathOnly);
  if (p === '/') return 'site';

  const nested = p.match(/^\/([^/]+)\/(success|cancel)$/);
  if (nested) {
    const base = String(nested[1]).replace(/-test$/, '');
    if (FUNNEL_PAGE_INSTANCES.includes(base)) return base;
  }

  if (p === '/success' || p === '/cancel') return 'site';

  return pageVisibility.pathToFunnelName(p);
}

/**
 * Clarity custom-tag context derived from the request path (environment is server-side).
 * @param {import('express').Request} req
 * @returns {{ environment: 'test' | 'prod', funnelName: string|null }}
 */
function resolveClarityPageContext(req) {
  const pathOnly = pageVisibility.normalizePathOnly(req.path);
  const funnelName = pathToFunnelNameIncludingSubpaths(pathOnly);

  let environment = 'prod';
  if (funnelName && funnelName !== 'site') {
    environment = pageVisibility.getFunnelMode(funnelName) === 'test' ? 'test' : 'prod';
  } else {
    environment = pageVisibility.getHomeMode() === 'test' ? 'test' : 'prod';
  }

  return { environment, funnelName };
}

module.exports = {
  pathToFunnelNameIncludingSubpaths,
  resolveClarityPageContext,
};
