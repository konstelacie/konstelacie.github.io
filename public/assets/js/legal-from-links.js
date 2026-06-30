(function () {
  var LEGAL_PATHS = ['/ochrana-udajov', '/obchodne-podmienky'];

  function isLegalPath(pathname) {
    return LEGAL_PATHS.indexOf(pathname) !== -1;
  }

  function readFromQuery() {
    try {
      return new URLSearchParams(window.location.search).get('from') || '';
    } catch (e) {
      return '';
    }
  }

  function currentFromValue() {
    var existing = readFromQuery();
    if (existing) return existing;
    if (!isLegalPath(window.location.pathname)) {
      return window.location.pathname + window.location.search + window.location.hash;
    }
    try {
      if (document.referrer) {
        var ref = new URL(document.referrer);
        if (ref.origin === window.location.origin && !isLegalPath(ref.pathname)) {
          return ref.pathname + ref.search + ref.hash;
        }
      }
    } catch (e) {
      /* ignore */
    }
    return '';
  }

  function decorateLegalLinks() {
    var from = currentFromValue();
    if (!from) return;

    var selector = 'a[href="/ochrana-udajov"], a[href="/obchodne-podmienky"]';
    document.querySelectorAll(selector).forEach(function (anchor) {
      var url = new URL(anchor.getAttribute('href'), window.location.origin);
      url.searchParams.set('from', from);
      anchor.href = url.pathname + url.search;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateLegalLinks);
  } else {
    decorateLegalLinks();
  }
})();
