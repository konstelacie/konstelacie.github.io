/**
 * Funnel – shared logic for video, CTA.
 * Used by pilot and other funnel pages.
 */

(function () {
  'use strict';

  // --- Video embed ---
  // When ready: insert iframe into .funnel-video .container
  // Example: funnel.video.embed('https://www.youtube.com/embed/VIDEO_ID');

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

  window.funnel = { video: video, cta: cta };
})();
