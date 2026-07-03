(function () {
  'use strict';

  function clarityApi() {
    return typeof window.clarity === 'function' ? window.clarity : null;
  }

  function pageEnvironment() {
    var body = document.body;
    if (!body) return null;
    var env = body.getAttribute('data-clarity-environment');
    if (env === 'test' || env === 'prod') return env;
    return null;
  }

  function funnelContext() {
    if (window.citimTracking && window.citimTracking.funnelContext) {
      return window.citimTracking.funnelContext();
    }
    return {};
  }

  function applyCustomTags() {
    var api = clarityApi();
    if (!api) return;

    var env = pageEnvironment();
    if (env) api('set', 'environment', env);

    var ctx = funnelContext();
    if (ctx.funnel_name) api('set', 'funnel_name', ctx.funnel_name);
    if (ctx.funnel_campaign) api('set', 'funnel_campaign', ctx.funnel_campaign);
    if (ctx.funnel_video_id) api('set', 'funnel_video_id', ctx.funnel_video_id);
  }

  function grantConsent() {
    var api = clarityApi();
    if (!api) return;
    api('consentv2', {
      ad_Storage: 'granted',
      analytics_Storage: 'granted',
    });
  }

  window.citimClarity = {
    applyCustomTags: applyCustomTags,
    grantConsent: grantConsent,
  };
})();
