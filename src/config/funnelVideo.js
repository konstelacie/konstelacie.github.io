/**
 * Resolves funnel campaign `video` + `videoId` for views.
 * @see docs/CREATIVE-MEDIA.md — naming and providers
 */

const WISTIA_IFRAME_BASE = 'https://fast.wistia.net/embed/iframe';

/**
 * @typedef {{ src: string, type?: string }} VideoSource
 * @typedef {{ kind: 'none' }} ResolvedNone
 * @typedef {{ kind: 'self', videoId: string|null, sources: VideoSource[] }} ResolvedSelf
 * @typedef {{ kind: 'wistia', videoId: string|null, embedUrl: string }} ResolvedWistia
 * @typedef {{ kind: 'iframe', videoId: string|null, embedUrl: string }} ResolvedIframe
 */

/**
 * @param {object} campaign - merged row from INSTANCE_CAMPAIGNS
 * @returns {ResolvedNone|ResolvedSelf|ResolvedWistia|ResolvedIframe}
 */
function resolveCampaignVideo(campaign) {
  const videoId = campaign.videoId != null ? String(campaign.videoId) : null;
  const video = campaign.video;

  // Legacy: iframe URL only (any host)
  if ((video == null || video.provider == null) && campaign.videoUrl) {
    return { kind: 'iframe', videoId, embedUrl: String(campaign.videoUrl) };
  }

  if (!video || !video.provider) {
    return { kind: 'none' };
  }

  if (video.provider === 'self') {
    const sources = normalizeSelfSources(video);
    if (!sources.length) return { kind: 'none' };
    return { kind: 'self', videoId, sources };
  }

  if (video.provider === 'wistia') {
    const hid = video.hashedId;
    if (!hid || typeof hid !== 'string') return { kind: 'none' };
    return {
      kind: 'wistia',
      videoId,
      embedUrl: `${WISTIA_IFRAME_BASE}/${encodeURIComponent(hid.trim())}`,
    };
  }

  return { kind: 'none' };
}

function normalizeSelfSources(video) {
  if (Array.isArray(video.sources) && video.sources.length) {
    return video.sources
      .map((s) => ({
        src: typeof s.src === 'string' ? s.src : '',
        type: typeof s.type === 'string' ? s.type : undefined,
      }))
      .filter((s) => s.src);
  }
  if (video.src && typeof video.src === 'string') {
    const one = { src: video.src, type: typeof video.type === 'string' ? video.type : undefined };
    return [one];
  }
  return [];
}

module.exports = {
  resolveCampaignVideo,
  WISTIA_IFRAME_BASE,
};
