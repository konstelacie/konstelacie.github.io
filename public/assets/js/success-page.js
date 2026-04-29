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

  /** @param {'deposit'|'full'} paymentType */
  function isFullPayment(paymentType) {
    return paymentType === 'full';
  }

  function setTitle(el, text) {
    if (el) el.textContent = text;
  }

  function setErrorMessage(text) {
    const msgEl = document.getElementById('success-error-message');
    if (msgEl) msgEl.textContent = text;
  }

  function showState(state, data) {
    const titleEl = document.getElementById('success-main-title');
    const loadingEl = document.getElementById('success-loading');
    const confirmedEl = document.getElementById('success-confirmed');
    const processingEl = document.getElementById('success-processing');
    const errorEl = document.getElementById('success-error');
    const variantDeposit = document.getElementById('success-variant-deposit');
    const variantFull = document.getElementById('success-variant-full');

    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (confirmedEl) confirmedEl.hidden = state !== 'confirmed';
    if (processingEl) processingEl.hidden = state !== 'processing';
    if (errorEl) errorEl.hidden = state !== 'error';

    if (state === 'loading') {
      setTitle(titleEl, 'Potvrdzujeme platbu');
    } else if (state === 'processing') {
      setTitle(titleEl, 'Potvrdenie ešte pripravujeme');
    } else if (state === 'error') {
      setTitle(titleEl, 'Nepodarilo sa načítať potvrdenie');
    } else if (state === 'confirmed' && data) {
      const paymentType =
        data.reservation && data.reservation.paymentType === 'full' ? 'full' : 'deposit';
      const full = isFullPayment(paymentType);
      setTitle(titleEl, full ? 'Platba je dokončená' : 'Rezervácia je potvrdená');
      if (variantDeposit) variantDeposit.hidden = full;
      if (variantFull) variantFull.hidden = !full;

      const slotText = data.slot ? 'Termín: ' + formatDateTime(data.slot.startAt) : '';
      const amountText =
        data.payment && typeof data.payment.amountCents === 'number'
          ? (full ? 'Zaplatená suma: ' : 'Zaplatená rezervačná suma: ') +
            formatAmount(data.payment.amountCents)
          : '';

      if (full) {
        const slotEl = document.getElementById('success-slot-full');
        const amountEl = document.getElementById('success-amount-full');
        if (slotEl) slotEl.textContent = slotText;
        if (amountEl) amountEl.textContent = amountText;
      } else {
        const slotEl = document.getElementById('success-slot-deposit');
        const amountEl = document.getElementById('success-amount-deposit');
        if (slotEl) slotEl.textContent = slotText;
        if (amountEl) amountEl.textContent = amountText;
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
      setErrorMessage('Neplatný údaj o platbe. Skúste to prosím znova.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_pending_timeout') === '1') {
      showState('error');
      setErrorMessage(
        'Platba prebehla cez Stripe, ale pri našom spracovaní nastala technická chyba. Potvrdenie pošleme e-mailom. Ak ho nedostanete do niekoľkých minút, kontaktujte podporu.'
      );
      return;
    }

    let attempts = 0;
    let lastStatus = null;

    function poll() {
      attempts += 1;
      fetchStatus(sessionId)
        .then(function (data) {
          const status = data?.payment?.status || null;
          lastStatus = status;

          if (status === 'completed') {
            showState('confirmed', data);
            return;
          }

          if (status === 'failed') {
            showState('error');
            setErrorMessage(
              'Platba prebehla cez Stripe, ale pri našom spracovaní nastala technická chyba. Potvrdenie pošleme e-mailom. Ak ho nedostanete do niekoľkých minút, kontaktujte podporu.'
            );
            return;
          }

          if (status === 'expired') {
            showState('error');
            setErrorMessage('Platnosť platby vypršala. Skúste prosím znovu.');
            return;
          }

          if (status === 'refunded') {
            showState('error');
            setErrorMessage('Platba bola vrátená. Ak máte otázky, kontaktujte podporu.');
            return;
          }

          if (attempts >= MAX_POLL_ATTEMPTS) {
            showState('error');
            if (lastStatus && lastStatus !== 'pending') {
              setErrorMessage('Nepodarilo sa potvrdiť platbu. Stav: ' + lastStatus + '. Skúste to prosím znova.');
            } else {
              setErrorMessage('Nepodarilo sa potvrdiť platbu. Chvíľu sme to čakali na webhook, no nepotvrdilo sa to. Skúste to prosím znova.');
            }
            return;
          }
          showState('loading');
          setTimeout(poll, POLL_INTERVAL_MS);
        })
        .catch(function (err) {
          showState('error');
          setErrorMessage(err.message);
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
