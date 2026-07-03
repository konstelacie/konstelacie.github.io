(function () {
  var STORAGE_KEY = 'citim_cookie_consent_v1';

  var root = document.getElementById('cookie-consent-root');
  if (!root) return;

  var pixelId = root.getAttribute('data-pixel-id');
  var clarityProjectId = root.getAttribute('data-clarity-project-id');
  if (!pixelId && !clarityProjectId) return;

  if (window.citimNoTrack && window.citimNoTrack.isActive()) {
    root.hidden = true;
    return;
  }

  function getStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.tier === 'essential' || parsed.tier === 'all')) return parsed;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function setStored(tier) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: tier, t: Date.now() }));
    } catch (e) {
      /* ignore */
    }
  }

  function dispatchMarketingConsentGranted() {
    try {
      window.dispatchEvent(new CustomEvent('citim:marketing-consent-granted'));
    } catch (e) {
      /* ignore */
    }
  }

  function loadPixel() {
    if (!pixelId || window.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    dispatchMarketingConsentGranted();
  }

  function loadClarity() {
    if (!clarityProjectId) return;
    if (typeof window.clarity === 'function') {
      if (window.citimClarity) {
        window.citimClarity.grantConsent();
        window.citimClarity.applyCustomTags();
      }
      return;
    }
    (function (c, l, a, r, i, t, y) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      t = l.createElement(r);
      t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarityProjectId);

    if (window.citimClarity) {
      window.citimClarity.grantConsent();
      window.citimClarity.applyCustomTags();
    }
  }

  function loadMarketingScripts() {
    loadPixel();
    loadClarity();
  }

  var stored = getStored();
  if (stored && stored.tier === 'all') {
    loadMarketingScripts();
    return;
  }
  if (stored && stored.tier === 'essential') {
    return;
  }

  root.hidden = false;

  var btnEssential = document.getElementById('cookie-consent-essential');
  var btnAll = document.getElementById('cookie-consent-all');
  if (!btnEssential || !btnAll) return;

  btnEssential.addEventListener('click', function () {
    setStored('essential');
    root.hidden = true;
  });
  btnAll.addEventListener('click', function () {
    setStored('all');
    loadMarketingScripts();
    root.hidden = true;
  });
})();
