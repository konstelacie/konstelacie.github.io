/**
 * Funnel – shared logic for video, CTA, lower-content reveal after first play.
 * Used by pilot and other funnel pages.
 */

(function () {
  'use strict';

  // --- Video embed (optional client-side override) ---
  // Server usually renders video from INSTANCE_CAMPAIGNS + resolveCampaignVideo (see src/config/funnelVideo.js).
  // Example dynamic inject: funnel.video.embed('https://www.youtube.com/embed/VIDEO_ID');

  var video = {
    embed: function (url) {
      var container = document.querySelector('.funnel-video .container');
      if (!container || !url) return;
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.setAttribute('width', '100%');
      iframe.setAttribute('height', '400');
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.aspectRatio = '16/9';
      container.appendChild(iframe);
    }
  };

  // --- CTA / booking ---
  // Optional: smooth scroll to .funnel-cta, external link handling

  var cta = {
    scrollTo: function () {
      var el = document.querySelector('.funnel-cta');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

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

  /** Wistia iframe + postMessage: detect play when Player API does not bind. */
  function bindWistiaPostMessagePlay(onPlay) {
    window.addEventListener(
      'message',
      function (event) {
        if (!event || !event.origin) return;
        if (event.origin.indexOf('wistia.net') === -1 && event.origin.indexOf('wistia.com') === -1) return;
        var d = parseMaybeJson(event.data);
        if (!d) return;
        var ev = d.event || d.type || d.name || d.action;
        if (ev === 'play' || ev === 'Play' || (d.data && d.data.event === 'play')) {
          onPlay();
        }
      },
      false
    );
  }

  function tryWistiaApiBind(wistiaHash, onPlay, apiBoundRef) {
    if (apiBoundRef.value) return true;
    if (typeof window.Wistia === 'undefined' || !window.Wistia.api) return false;
    var wistiaVideo = window.Wistia.api(wistiaHash);
    if (!wistiaVideo || !wistiaVideo.bind) return false;
    apiBoundRef.value = true;
    wistiaVideo.bind('play', function () {
      onPlay();
    });
    return true;
  }

  function revealLowerWhenReady(lowerEl, delayMs) {
    if (!lowerEl || lowerEl.classList.contains('is-revealed')) return;
    setTimeout(function () {
      lowerEl.classList.add('is-revealed');
      lowerEl.removeAttribute('aria-hidden');
    }, delayMs);
  }

  function initLowerContentReveal() {
    var lowerEl = document.getElementById('funnel-lower');
    if (!lowerEl || !lowerEl.classList.contains('funnel-lower--pending')) return;

    var raw = lowerEl.getAttribute('data-lower-reveal-delay');
    var delayMs = parseInt(raw, 10);
    if (isNaN(delayMs) || delayMs < 0) delayMs = 15000;

    var started = false;
    function onFirstPlay() {
      if (started) return;
      started = true;
      revealLowerWhenReady(lowerEl, delayMs);
    }

    var vid = document.querySelector('.funnel-video video');
    if (vid) {
      vid.addEventListener(
        'play',
        function once() {
          vid.removeEventListener('play', once);
          onFirstPlay();
        },
        { passive: true }
      );
      return;
    }

    var iframe = document.querySelector('.funnel-video iframe');
    var wistiaHash = extractWistiaHashFromIframe(iframe);
    if (wistiaHash) {
      bindWistiaPostMessagePlay(onFirstPlay);

      window._wq = window._wq || [];
      window._wq.push({
        id: wistiaHash,
        onReady: function (wistiaVideo) {
          wistiaVideo.bind('play', function () {
            onFirstPlay();
          });
        },
      });
      window._wq.push({
        id: '_all',
        onReady: function (wistiaVideo) {
          if (!wistiaVideo || !wistiaVideo.hashedId || wistiaVideo.hashedId() !== wistiaHash) return;
          wistiaVideo.bind('play', function () {
            onFirstPlay();
          });
        },
      });

      var apiPlayBound = { value: false };
      loadScript(WISTIA_E1)
        .then(function () {
          if (tryWistiaApiBind(wistiaHash, onFirstPlay, apiPlayBound)) return;
          var n = 0;
          var iv = setInterval(function () {
            if (tryWistiaApiBind(wistiaHash, onFirstPlay, apiPlayBound)) {
              clearInterval(iv);
            }
            if (++n > 150) clearInterval(iv);
          }, 200);
        })
        .catch(function () {
          lowerEl.classList.remove('funnel-lower--pending');
          lowerEl.removeAttribute('aria-hidden');
          lowerEl.classList.add('is-revealed');
        });
      return;
    }

    // Unknown embed: do not keep content inaccessible
    lowerEl.classList.remove('funnel-lower--pending');
    lowerEl.removeAttribute('aria-hidden');
    lowerEl.classList.add('is-revealed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLowerContentReveal);
  } else {
    initLowerContentReveal();
  }

  window.funnel = { video: video, cta: cta };
})();
