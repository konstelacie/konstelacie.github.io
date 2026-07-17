/** Internal attribution ids (booking, analytics, pricing). */
const FUNNEL_INSTANCES = ['site', 'pilot', 'manipulacia', 'autopilot'];

/** Instances served as dedicated funnel pages (not home). */
const FUNNEL_PAGE_INSTANCES = ['pilot', 'manipulacia', 'autopilot'];

/** Page funnel render path: video-booking | assessment */
const FUNNEL_PAGE_TYPES = {
  pilot: 'video-booking',
  manipulacia: 'video-booking',
  autopilot: 'assessment',
};

/**
 * @param {string} funnelName
 * @returns {'video-booking' | 'assessment'}
 */
function getFunnelPageType(funnelName) {
  return FUNNEL_PAGE_TYPES[funnelName] || 'video-booking';
}

module.exports = {
  FUNNEL_INSTANCES,
  FUNNEL_PAGE_INSTANCES,
  FUNNEL_PAGE_TYPES,
  getFunnelPageType,
};
