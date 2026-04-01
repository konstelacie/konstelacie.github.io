(function () {
  'use strict';

  const TIMEZONE = 'Europe/Bratislava';
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLL_ATTEMPTS = 30; // ~1 minute

  function getSessionId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id') || '';
  }

  function formatDateTime(isoString) {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  function formatAmount(cents) {
    return (cents / 100).toFixed(2) + ' €';
  }

  function showState(state, data) {
    const loadingEl = document.getElementById('success-loading');
    const confirmedEl = document.getElementById('success-confirmed');
    const processingEl = document.getElementById('success-processing');
    const errorEl = document.getElementById('success-error');

    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (confirmedEl) confirmedEl.hidden = state !== 'confirmed';
    if (processingEl) processingEl.hidden = state !== 'processing';
    if (errorEl) errorEl.hidden = state !== 'error';

    if (state === 'confirmed' && data) {
      const slotEl = document.getElementById('success-slot');
      const amountEl = document.getElementById('success-amount');
      if (slotEl && data.slot) {
        slotEl.textContent = 'Termín: ' + formatDateTime(data.slot.startAt);
      }
      if (amountEl && data.payment) {
        amountEl.textContent = 'Zaplatená suma: ' + formatAmount(data.payment.amountCents);
      }
    }
  }

  async function fetchStatus(sessionId) {
    const res = await fetch('/api/payments/status?session_id=' + encodeURIComponent(sessionId));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to load status');
    }
    return res.json();
  }

  function run() {
    try {
      sessionStorage.removeItem('booking_stripe_redirect');
    } catch (_) {}

    const sessionId = getSessionId();
    if (!sessionId || !sessionId.startsWith('cs_')) {
      showState('error');
      return;
    }

    let attempts = 0;

    function poll() {
      attempts += 1;
      fetchStatus(sessionId)
        .then(function (data) {
          if (data.payment && data.payment.status === 'completed') {
            showState('confirmed', data);
            return;
          }
          if (attempts >= MAX_POLL_ATTEMPTS) {
            showState('processing');
            return;
          }
          showState('loading');
          setTimeout(poll, POLL_INTERVAL_MS);
        })
        .catch(function (err) {
          showState('error');
          const msgEl = document.getElementById('success-error-message');
          if (msgEl) msgEl.textContent = err.message;
        });
    }

    showState('loading');
    poll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
