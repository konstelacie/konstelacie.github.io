(function () {
  'use strict';

  var token = window.__WEBINAR_ROOM_TOKEN;
  if (!token) return;

  var WISTIA_E1 = 'https://fast.wistia.net/assets/external/E-v1.js';

  var statusEl = document.getElementById('webinar-room-status');
  var countdownEl = document.getElementById('webinar-room-countdown');
  var countdownTimeEl = document.getElementById('webinar-room-countdown-time');
  var countdownRemainingEl = document.getElementById('webinar-room-countdown-remaining');
  var videoWrap = document.getElementById('webinar-room-video-wrap');
  var endedEl = document.getElementById('webinar-room-ended');
  var iframe = document.getElementById('webinar-wistia-iframe');

  var roomState = null;
  var wistiaVideo = null;
  var wistiaBound = false;
  var tickTimer = null;
  var pollTimer = null;
  var serverSkewMs = 0;

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function extractWistiaHash() {
    if (!iframe || !iframe.src) return null;
    var m = String(iframe.src).match(/wistia\.net\/embed\/iframe\/([^/?]+)/i);
    return m ? m[1] : null;
  }

  function nowMs() {
    return Date.now() + serverSkewMs;
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '00:00';
    var totalSec = Math.ceil(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) {
      return (
        String(h) +
        ':' +
        String(m).padStart(2, '0') +
        ':' +
        String(s).padStart(2, '0')
      );
    }
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function formatStartDisplay(room) {
    var fmt = room.formattedStart || {};
    return (
      (fmt.weekday ? fmt.weekday + ', ' : '') +
      (fmt.date || '') +
      (fmt.time ? ' o ' + fmt.time : '')
    );
  }

  function computePhase(room) {
    var start = Date.parse(room.startAtUtc);
    var end = Date.parse(room.endAtUtc);
    var lobby = Date.parse(room.lobbyOpensAtUtc);
    var now = nowMs();

    if (now < lobby) return 'waiting';
    if (now < start) return 'lobby';
    if (now < end) return 'live';
    return 'ended';
  }

  function computeOffsetSeconds(room) {
    var start = Date.parse(room.startAtUtc);
    var now = nowMs();
    return Math.max(0, Math.floor((now - start) / 1000));
  }

  function syncPlayback() {
    if (!wistiaVideo || !roomState) return;
    var offset = computeOffsetSeconds(roomState);
    try {
      if (typeof wistiaVideo.time === 'function') {
        var current = wistiaVideo.time();
        if (Math.abs(current - offset) > 3) {
          wistiaVideo.time(offset);
        }
      }
      if (typeof wistiaVideo.play === 'function') {
        wistiaVideo.play();
      }
    } catch (e) {
      /* ignore */
    }
  }

  function bindWistia(video) {
    if (wistiaBound || !video) return;
    wistiaBound = true;
    wistiaVideo = video;
    syncPlayback();
  }

  function initWistia(hash) {
    if (!hash || window._wq) {
      /* continue */
    }
    window._wq = window._wq || [];
    window._wq.push({
      id: hash,
      onReady: function (video) {
        bindWistia(video);
      },
    });
    window._wq.push({
      id: '_all',
      onReady: function (video) {
        if (!video || !video.hashedId || video.hashedId() !== hash) return;
        bindWistia(video);
      },
    });
    return loadScript(WISTIA_E1);
  }

  function renderPhase() {
    if (!roomState) return;
    var phase = computePhase(roomState);
    var startDisplay = formatStartDisplay(roomState);

    hide(countdownEl);
    hide(videoWrap);
    hide(endedEl);

    if (phase === 'waiting') {
      statusEl.textContent =
        'Miestnosť sa otvorí ' +
        Math.round((Date.parse(roomState.lobbyOpensAtUtc) - nowMs()) / 60000) +
        ' min pred začiatkom. Termín: ' +
        startDisplay +
        '.';
      return;
    }

    if (phase === 'lobby') {
      statusEl.textContent = 'Priprav sa — webinár čoskoro začne.';
      countdownTimeEl.textContent = startDisplay;
      var remaining = Date.parse(roomState.startAtUtc) - nowMs();
      countdownRemainingEl.textContent = 'Za ' + formatRemaining(remaining);
      show(countdownEl);
      return;
    }

    if (phase === 'live') {
      statusEl.textContent = 'Webinár práve prebieha.';
      show(videoWrap);
      syncPlayback();
      return;
    }

    statusEl.textContent = '';
    show(endedEl);
  }

  function applyRoom(room) {
    var serverNow = Date.parse(room.serverNowUtc);
    if (!Number.isNaN(serverNow)) {
      serverSkewMs = serverNow - Date.now();
    }
    roomState = room;
    renderPhase();

    if (computePhase(room) === 'live' && !wistiaBound) {
      var hash = room.videoHashedId || extractWistiaHash();
      initWistia(hash).catch(function () {
        statusEl.textContent = 'Video sa nepodarilo načítať. Obnov stránku.';
      });
    }
  }

  function fetchRoom() {
    return fetch('/api/webinar/room/' + encodeURIComponent(token))
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body.ok) {
          throw new Error((result.body && result.body.message) || 'Room load failed');
        }
        applyRoom(result.body.room);
      });
  }

  function startTimers() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      renderPhase();
      if (roomState && computePhase(roomState) === 'live') {
        syncPlayback();
      }
    }, 1000);

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      fetchRoom().catch(function () {
        /* keep last state */
      });
    }, 60000);
  }

  fetchRoom()
    .then(startTimers)
    .catch(function () {
      statusEl.textContent = 'Nepodarilo sa načítať miestnosť. Skús obnoviť stránku.';
    });
})();
