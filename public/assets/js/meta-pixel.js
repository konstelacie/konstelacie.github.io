(function () {
  'use strict';

  var FUNNEL_CTX_STORAGE_KEY = 'booking_funnel_ctx';

  function fromBookingElement() {
    var el = document.querySelector('#booking');
    if (!el) return null;
    var ctx = {};
    var name = el.getAttribute('data-funnel-name');
    var campaign = el.getAttribute('data-funnel-campaign');
    var videoId = el.getAttribute('data-funnel-video-id');
    if (name && String(name).trim()) ctx.funnel_name = String(name).trim();
    if (campaign && String(campaign).trim()) ctx.funnel_campaign = String(campaign).trim();
    if (videoId && String(videoId).trim()) ctx.funnel_video_id = String(videoId).trim();
    return Object.keys(ctx).length ? ctx : null;
  }

  function normalizeStoredContext(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    var ctx = {};
    var name = parsed.funnel_name || parsed.funnelName;
    var campaign = parsed.funnel_campaign || parsed.funnelCampaign;
    var videoId = parsed.funnel_video_id || parsed.funnelVideoId;
    if (name && String(name).trim()) ctx.funnel_name = String(name).trim();
    if (campaign && String(campaign).trim()) ctx.funnel_campaign = String(campaign).trim();
    if (videoId && String(videoId).trim()) ctx.funnel_video_id = String(videoId).trim();
    return Object.keys(ctx).length ? ctx : null;
  }

  function fromLocalStorage() {
    try {
      var raw = localStorage.getItem(FUNNEL_CTX_STORAGE_KEY);
      if (!raw) return null;
      return normalizeStoredContext(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function funnelNameFromPath() {
    var path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    if (path === '/') return null;

    var nested = path.match(/^\/([^/]+)\/(success|cancel)$/);
    if (nested) {
      return String(nested[1]).replace(/-test$/, '');
    }

    var top = path.match(/^\/([^/]+)$/);
    if (!top) return null;
    var segment = String(top[1]).replace(/-test$/, '');
    if (segment === 'success' || segment === 'cancel' || segment === 'ako-sa-pripravit-na-sedenie') {
      return null;
    }
    return segment;
  }

  function isReady() {
    return typeof window.fbq === 'function';
  }

  function funnelContext() {
    var fromEl = fromBookingElement();
    if (fromEl) return fromEl;

    var fromStorage = fromLocalStorage();
    if (fromStorage) return fromStorage;

    var fromPath = funnelNameFromPath();
    if (fromPath) return { funnel_name: fromPath };

    return {};
  }

  function track(eventName, params, options) {
    params = params && typeof params === 'object' ? params : {};
    options = options && typeof options === 'object' ? options : {};

    if (!isReady()) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[citimPixel] skip (fbq not ready):', eventName);
      }
      return;
    }

    var merged = Object.assign({}, funnelContext(), params);
    var eventId = options.eventID;
    if (eventId != null && String(eventId).trim() !== '') {
      window.fbq('track', eventName, merged, { eventID: String(eventId) });
      return;
    }
    window.fbq('track', eventName, merged);
  }

  window.citimPixel = {
    isReady: isReady,
    funnelContext: funnelContext,
    track: track,
  };
})();
