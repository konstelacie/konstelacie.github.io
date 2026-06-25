(function () {
  var STORAGE_KEY = 'citim_cookie_consent_v1';

  var root = document.getElementById('cookie-consent-root');
  if (!root) return;

  var pixelId = root.getAttribute('data-pixel-id');
  if (!pixelId) return;

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

  function loadPixel() {
    if (window.fbq) return;
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
    try {
      window.dispatchEvent(new CustomEvent('citim:marketing-consent-granted'));
    } catch (e) {
      /* ignore */
    }
  }

  var stored = getStored();
  if (stored && stored.tier === 'all') {
    loadPixel();
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
    loadPixel();
    root.hidden = true;
  });
})();
