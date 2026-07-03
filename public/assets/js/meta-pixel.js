(function () {
  'use strict';

  function isReady() {
    if (window.citimTracking && window.citimTracking.isNoTrackActive()) return false;
    return typeof window.fbq === 'function';
  }

  function funnelContext() {
    if (window.citimTracking && window.citimTracking.funnelContext) {
      return window.citimTracking.funnelContext();
    }
    return {};
  }

  function track(eventName, params, options) {
    params = params && typeof params === 'object' ? params : {};
    options = options && typeof options === 'object' ? options : {};

    if (window.citimTracking && window.citimTracking.isNoTrackActive()) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[citimPixel] skip (notrack):', eventName);
      }
      return;
    }

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
