/**
 * Funnel – video embed, CTA, lower-content reveal (3-layer strategy).
 * @see docs/ui-ux/video-scroll-reveal-strategy.md
 */

(function () {
  'use strict';

  var video = {
    embed: function (url) {
      var container = document.querySelector('.funnel-video .container');
      if (!container || !url) return;
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.setAttribute('width', '100%');
      iframe.setAttribute('height', '400');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'autoplay');
      iframe.style.aspectRatio = '9/16';
      container.appendChild(iframe);
    }
  };

  var cta = {
    scrollTo: function () {
      var el = document.querySelector('.funnel-cta');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function initScrollBridgeArrow() {
    var link = document.querySelector('a.funnel-scroll-hint__arrow[href="#funnel-bridge"]');
    if (!link) return;
    link.addEventListener('click', function (e) {
      var target = document.getElementById('funnel-bridge');
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load script'));
      };
      document.head.appendChild(s);
    });
  }

  var WISTIA_E1 = 'https://fast.wistia.net/assets/external/E-v1.js';

  function extractWistiaHashFromIframe(iframe) {
    if (!iframe || !iframe.src) return null;
    var m = String(iframe.src).match(/wistia\.net\/embed\/iframe\/([^/?]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function parseMaybeJson(data) {
    if (data == null) return null;
    if (typeof data === 'object') return data;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function getLowerSeenStorageKey(lowerEl) {
    if (!lowerEl) return null;
    var fn = lowerEl.getAttribute('data-funnel-name');
    var fc = lowerEl.getAttribute('data-funnel-campaign');
    if (!fn || !fc) return null;
    return 'citim:funnel:lowerSeen:' + fn + ':' + fc;
  }

  function hasSeenLowerBefore(lowerEl) {
    try {
      var k = getLowerSeenStorageKey(lowerEl);
      if (!k) return false;
      return window.localStorage.getItem(k) === '1';
    } catch (e) {
      return false;
    }
  }

  function markLowerSeen(lowerEl) {
    try {
      var k = getLowerSeenStorageKey(lowerEl);
      if (k) window.localStorage.setItem(k, '1');
    } catch (e) {}
  }

  function readRevealConfig() {
    var el = document.getElementById('funnel-reveal-config');
    if (!el || !el.textContent) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function effectiveRevealConfig(cfg, isRepeat) {
    if (!cfg || !cfg.enabled) return null;
    var rv = cfg.repeatVisit || {};
    if (isRepeat && rv.unlockImmediately === true) {
      return {
        base: Object.assign({}, cfg, {
          layer2DelayMs: typeof rv.layer2DelayMs === 'number' ? rv.layer2DelayMs : cfg.layer2DelayMs,
          layer3: Object.assign({}, cfg.layer3, rv.layer3 || {}),
        }),
        repeat: rv,
        unlockImmediately: true,
      };
    }
    if (isRepeat) {
      var merged = {
        semanticTriggerSec: cfg.semanticTriggerSec,
        fallbackPercentWatched:
          typeof rv.fallbackPercentWatched === 'number' ? rv.fallbackPercentWatched : cfg.fallbackPercentWatched,
        fallbackAbsoluteSec: cfg.fallbackAbsoluteSec,
        layer2DelayMs: typeof rv.layer2DelayMs === 'number' ? rv.layer2DelayMs : cfg.layer2DelayMs,
        layer3: Object.assign({}, cfg.layer3, rv.layer3 || {}),
        onPause: cfg.onPause,
        onVideoEnd: cfg.onVideoEnd,
      };
      return { base: merged, repeat: rv, unlockImmediately: false };
    }
    return { base: cfg, repeat: {}, unlockImmediately: false };
  }

  function shouldUnlockLayer1(t, duration, eff) {
    var cfg = eff.base;
    if (typeof cfg.semanticTriggerSec === 'number' && t >= cfg.semanticTriggerSec) return true;
    if (duration > 0 && t / duration >= cfg.fallbackPercentWatched) return true;
    if (typeof cfg.fallbackAbsoluteSec === 'number' && t >= cfg.fallbackAbsoluteSec) return true;
    return false;
  }

  function initLowerContentReveal() {
    var lowerEl = document.getElementById('funnel-lower');
    if (!lowerEl || !lowerEl.classList.contains('funnel-lower--pending')) return;

    var cfgRaw = readRevealConfig();
    if (!cfgRaw) {
      lowerEl.classList.remove('funnel-lower--pending');
      lowerEl.classList.add('is-revealed');
      lowerEl.removeAttribute('aria-hidden');
      markLowerSeen(lowerEl);
      var h0 = document.getElementById('funnel-scroll-hint');
      if (h0) {
        h0.classList.remove('funnel-scroll-hint--hidden');
        h0.classList.add('is-visible');
      }
      return;
    }
    if (!cfgRaw.enabled) return;

    var isRepeat = hasSeenLowerBefore(lowerEl);
    var eff = effectiveRevealConfig(cfgRaw, isRepeat);
    if (!eff) return;

    var hintEl = document.getElementById('funnel-scroll-hint');
    var cfg = eff.base;

    var layer1Done = false;
    var layer2Done = false;
    var layer3Done = false;
    var userLeftVideo = false;
    var videoPaused = false;

    var tLayer2 = null;
    var tLayer3 = null;

    function clearLayerTimers() {
      if (tLayer2) {
        clearTimeout(tLayer2);
        tLayer2 = null;
      }
      if (tLayer3) {
        clearTimeout(tLayer3);
        tLayer3 = null;
      }
    }

    var scrollObserverInstalled = false;

    function revealLayer1() {
      if (layer1Done) return;
      layer1Done = true;
      lowerEl.classList.remove('funnel-lower--pending');
      lowerEl.classList.add('is-revealed');
      lowerEl.removeAttribute('aria-hidden');
      markLowerSeen(lowerEl);
      // Defer: observing #funnel-lower immediately after expand often intersects the viewport
      // (bridge at the fold) and blocked the arrow. Observe #booking after layout settles.
      setTimeout(installScrollObserver, 120);
    }

    function installScrollObserver() {
      if (scrollObserverInstalled || userLeftVideo) return;
      scrollObserverInstalled = true;
      if (!('IntersectionObserver' in window)) return;
      var target = document.getElementById('booking') || lowerEl;
      var obs = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting && entries[i].intersectionRatio > 0.12) {
              onUserEnteredLower();
              obs.disconnect();
              return;
            }
          }
        },
        { root: null, rootMargin: '0px 0px -10% 0px', threshold: [0, 0.15, 0.35] }
      );
      obs.observe(target);
    }

    function showArrow() {
      if (!hintEl || layer2Done) return;
      layer2Done = true;
      hintEl.removeAttribute('hidden');
      hintEl.classList.remove('funnel-scroll-hint--hidden');
      hintEl.classList.add('is-visible');
      hintEl.setAttribute('aria-hidden', 'false');
    }

    function applyEmphasis() {
      if (!hintEl || layer3Done || userLeftVideo || !cfg.layer3 || cfg.layer3.enabled === false) return;
      layer3Done = true;
      hintEl.classList.add('is-emphasized');
      var maxC = cfg.layer3.maxEmphasisCycles;
      if (typeof maxC === 'number' && maxC > 0) {
        hintEl.style.setProperty('--funnel-emphasis-cycles', String(maxC));
      }
      if (cfg.layer3.helperTextEnabled && cfg.layer3.helperText) {
        var textEl = hintEl.querySelector('.funnel-scroll-hint__text');
        if (textEl) {
          textEl.textContent = cfg.layer3.helperText;
          textEl.hidden = false;
        }
      }
    }

    function scheduleLayer2FromNow() {
      clearLayerTimers();
      var d = cfg.layer2DelayMs;
      tLayer2 = setTimeout(function () {
        tLayer2 = null;
        if (userLeftVideo) return;
        showArrow();
        scheduleLayer3FromNow();
      }, d);
    }

    function scheduleLayer3FromNow() {
      if (!cfg.layer3 || cfg.layer3.enabled === false) return;
      if (tLayer3) {
        clearTimeout(tLayer3);
        tLayer3 = null;
      }
      var d = cfg.layer3.delayAfterLayer2Ms;
      tLayer3 = setTimeout(function () {
        tLayer3 = null;
        if (userLeftVideo) return;
        if (videoPaused && cfg.onPause && cfg.onPause.freezeEmphasisOnly) return;
        applyEmphasis();
      }, d);
    }

    function onUserEnteredLower() {
      if (userLeftVideo) return;
      userLeftVideo = true;
      clearLayerTimers();
      if (hintEl) {
        hintEl.classList.remove('is-emphasized');
        hintEl.classList.add('is-muted');
      }
    }

    if (eff.unlockImmediately) {
      revealLayer1();
      scheduleLayer2FromNow();
      return;
    }

    function onLayer1Trigger() {
      if (layer1Done) return;
      revealLayer1();
      scheduleLayer2FromNow();
    }

    function tryUnlockFromTime(t, duration) {
      if (layer1Done) return;
      if (!shouldUnlockLayer1(t, duration, eff)) return;
      onLayer1Trigger();
    }

    var vid = document.querySelector('.funnel-video video');
    if (vid) {
      function onTime() {
        var d = vid.duration;
        if (!d || !isFinite(d)) return;
        tryUnlockFromTime(vid.currentTime, d);
      }
      vid.addEventListener(
        'timeupdate',
        function () {
          onTime();
        },
        { passive: true }
      );
      vid.addEventListener(
        'loadedmetadata',
        function () {
          onTime();
        },
        { passive: true }
      );
      vid.addEventListener(
        'play',
        function () {
          videoPaused = false;
        },
        { passive: true }
      );
      vid.addEventListener(
        'pause',
        function () {
          videoPaused = true;
          if (cfg.onPause && cfg.onPause.freezeEmphasisOnly && tLayer3) {
            clearTimeout(tLayer3);
            tLayer3 = null;
          }
        },
        { passive: true }
      );
      vid.addEventListener(
        'playing',
        function () {
          videoPaused = false;
          if (cfg.onPause && cfg.onPause.freezeEmphasisOnly && layer2Done && !layer3Done && !userLeftVideo) {
            scheduleLayer3FromNow();
          }
        },
        { passive: true }
      );
      vid.addEventListener(
        'ended',
        function () {
          if (
            userLeftVideo ||
            layer3Done ||
            !cfg.onVideoEnd ||
            cfg.onVideoEnd.emphasisIfNotScrolled !== 'once_light'
          ) {
            return;
          }
          if (!hintEl || !layer2Done) return;
          applyEmphasis();
        },
        { passive: true }
      );
      return;
    }

    var iframe = document.querySelector('.funnel-video iframe');
    var wistiaHash = extractWistiaHashFromIframe(iframe);
    if (!wistiaHash) {
      revealLayer1();
      if (hintEl) {
        showArrow();
        scheduleLayer3FromNow();
      }
      return;
    }

    var wistiaBound = false;
    function bindWistiaVideo(wistiaVideo) {
      if (wistiaBound || !wistiaVideo || !wistiaVideo.bind) return;
      wistiaBound = true;

      wistiaVideo.bind('secondchange', function () {
        var t = typeof wistiaVideo.time === 'function' ? wistiaVideo.time() : 0;
        var dur = typeof wistiaVideo.duration === 'function' ? wistiaVideo.duration() : 0;
        tryUnlockFromTime(t, dur);
      });

      wistiaVideo.bind('pause', function () {
        videoPaused = true;
        if (cfg.onPause && cfg.onPause.freezeEmphasisOnly && tLayer3) {
          clearTimeout(tLayer3);
          tLayer3 = null;
        }
      });

      wistiaVideo.bind('play', function () {
        videoPaused = false;
        if (cfg.onPause && cfg.onPause.freezeEmphasisOnly && layer2Done && !layer3Done && !userLeftVideo) {
          scheduleLayer3FromNow();
        }
        var t = typeof wistiaVideo.time === 'function' ? wistiaVideo.time() : 0;
        var dur = typeof wistiaVideo.duration === 'function' ? wistiaVideo.duration() : 0;
        tryUnlockFromTime(t, dur);
      });

      wistiaVideo.bind('end', function () {
        if (
          userLeftVideo ||
          layer3Done ||
          !cfg.onVideoEnd ||
          cfg.onVideoEnd.emphasisIfNotScrolled !== 'once_light'
        ) {
          return;
        }
        if (!hintEl || !layer2Done) return;
        applyEmphasis();
      });
    }

    window._wq = window._wq || [];
    window._wq.push({
      id: wistiaHash,
      onReady: function (wistiaVideo) {
        bindWistiaVideo(wistiaVideo);
      }
    });
    window._wq.push({
      id: '_all',
      onReady: function (wistiaVideo) {
        if (!wistiaVideo || !wistiaVideo.hashedId || wistiaVideo.hashedId() !== wistiaHash) return;
        bindWistiaVideo(wistiaVideo);
      }
    });

    loadScript(WISTIA_E1).catch(function () {
      revealLayer1();
      if (hintEl) {
        showArrow();
        scheduleLayer3FromNow();
      }
    });
  }

  var viewContentTracked = false;

  function trackFunnelViewContent() {
    if (viewContentTracked || !window.citimPixel || !window.citimPixel.isReady()) return;
    viewContentTracked = true;
    var ctx = window.citimPixel.funnelContext();
    window.citimPixel.track('ViewContent', {
      content_name: ctx.funnel_name,
      content_category: 'funnel_lp',
    });
  }

  function initMetaPixelViewContent() {
    trackFunnelViewContent();
    window.addEventListener('citim:marketing-consent-granted', trackFunnelViewContent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initScrollBridgeArrow();
      initLowerContentReveal();
      initMetaPixelViewContent();
    });
  } else {
    initScrollBridgeArrow();
    initLowerContentReveal();
    initMetaPixelViewContent();
  }

  window.funnel = { video: video, cta: cta };
})();
