/** Internal attribution ids (booking, analytics, pricing). */
const FUNNEL_INSTANCES = ['site', 'pilot', 'manipulacia', 'autopilot', 'mapa'];

/** Instances served as dedicated funnel pages (not home). */
const FUNNEL_PAGE_INSTANCES = ['pilot', 'manipulacia', 'autopilot', 'mapa'];

/** Page funnel render path: video-booking | assessment | situation-map */
const FUNNEL_PAGE_TYPES = {
  pilot: 'video-booking',
  manipulacia: 'video-booking',
  autopilot: 'assessment',
  mapa: 'situation-map',
};

/**
 * @param {string} funnelName
 * @returns {'video-booking' | 'assessment' | 'situation-map'}
 */
function getFunnelPageType(funnelName) {
  return FUNNEL_PAGE_TYPES[funnelName] || 'video-booking';
}

function funnelHasBookingReturns(funnelName) {
  return getFunnelPageType(funnelName) === 'video-booking';
}

module.exports = {
  FUNNEL_INSTANCES,
  FUNNEL_PAGE_INSTANCES,
  FUNNEL_PAGE_TYPES,
  getFunnelPageType,
  funnelHasBookingReturns,
};
