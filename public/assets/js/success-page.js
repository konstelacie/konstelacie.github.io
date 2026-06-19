(function () {
  'use strict';

  const TIMEZONE = 'Europe/Bratislava';
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLL_ATTEMPTS = 30; // ~1 minute
  const CALENDAR_EVENT_TITLE = 'Online sedenie | citimtedasom.sk';
  const CALENDAR_EVENT_DETAILS_FALLBACK =
    'Online sedenie cez Google Meet. Odkaz na pripojenie nájdeš v potvrdzujúcom e-maile.';
  const CALENDAR_LOCATION_FALLBACK = 'Online (Google Meet)';

  /** @type {{ startAt: string, endAt: string, reservationId?: number, meetingUrl?: string | null } | null} */
  let calendarEventData = null;

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

  function formatUtcCalendarStamp(isoString) {
    return new Date(isoString).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function formatLocalCalendarStamp(isoString) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(isoString));
    const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return `${map.year}${map.month}${map.day}T${map.hour}${map.minute}${map.second}`;
  }

  function escapeIcsText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function normalizeMeetingUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  function buildCalendarEventDetails(meetingUrl) {
    if (meetingUrl) {
      return 'Online sedenie cez Google Meet.\n\nOdkaz na pripojenie:\n' + meetingUrl;
    }
    return CALENDAR_EVENT_DETAILS_FALLBACK;
  }

  function buildCalendarLocation(meetingUrl) {
    return meetingUrl || CALENDAR_LOCATION_FALLBACK;
  }

  function buildCalendarEvent(data) {
    if (!data?.slot?.startAt || !data?.slot?.endAt) return null;
    return {
      startAt: data.slot.startAt,
      endAt: data.slot.endAt,
      reservationId: data.reservation?.id,
      meetingUrl: normalizeMeetingUrl(data.meetingUrl),
    };
  }

  function calendarEventSignature(event) {
    return [event.startAt, event.endAt, event.meetingUrl || ''].join('|');
  }

  function buildGoogleCalendarUrl(event) {
    const details = buildCalendarEventDetails(event.meetingUrl);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: CALENDAR_EVENT_TITLE,
      dates: `${formatLocalCalendarStamp(event.startAt)}/${formatLocalCalendarStamp(event.endAt)}`,
      details: details,
      location: buildCalendarLocation(event.meetingUrl),
      ctz: TIMEZONE,
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function downloadIcsFile(event) {
    const details = buildCalendarEventDetails(event.meetingUrl);
    const location = buildCalendarLocation(event.meetingUrl);
    const uid = event.reservationId
      ? `reservation-${event.reservationId}@citimtedasom.sk`
      : `session-${formatUtcCalendarStamp(event.startAt)}@citimtedasom.sk`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//citimtedasom.sk//Booking//SK',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + formatUtcCalendarStamp(new Date().toISOString()),
      'DTSTART:' + formatUtcCalendarStamp(event.startAt),
      'DTEND:' + formatUtcCalendarStamp(event.endAt),
      'SUMMARY:' + escapeIcsText(CALENDAR_EVENT_TITLE),
      'DESCRIPTION:' + escapeIcsText(details),
      'LOCATION:' + escapeIcsText(location),
    ];
    if (event.meetingUrl) {
      lines.push('URL:' + event.meetingUrl);
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const ics = lines.join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sedenie.ics';
    link.click();
    URL.revokeObjectURL(url);
  }

  function wireCalendarActions(event) {
    const googleLink = document.getElementById('success-calendar-google');
    const icsButton = document.getElementById('success-calendar-ics');
    if (!googleLink || !icsButton) return;

    googleLink.href = buildGoogleCalendarUrl(event);
    icsButton.onclick = function () {
      downloadIcsFile(event);
    };
  }

  function setCtaSectionVisible(visible) {
    const ctaSection = document.getElementById('success-cta-section');
    if (ctaSection) ctaSection.hidden = !visible;
  }

  function showState(state, data) {
    const titleEl = document.getElementById('success-main-title');
    const loadingEl = document.getElementById('success-loading');
    const confirmedEl = document.getElementById('success-confirmed');
    const processingEl = document.getElementById('success-processing');
    const errorEl = document.getElementById('success-error');
    const variantDeposit = document.getElementById('success-variant-deposit');
    const variantFull = document.getElementById('success-variant-full');
    const footerDeposit = document.getElementById('success-footer-deposit');
    const footerFull = document.getElementById('success-footer-full');

    if (loadingEl) loadingEl.hidden = state !== 'loading';
    if (confirmedEl) confirmedEl.hidden = state !== 'confirmed';
    if (processingEl) processingEl.hidden = state !== 'processing';
    if (errorEl) errorEl.hidden = state !== 'error';
    setCtaSectionVisible(state === 'confirmed');

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
      if (footerDeposit) footerDeposit.hidden = full;
      if (footerFull) footerFull.hidden = !full;

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

      const nextCalendarEvent = buildCalendarEvent(data);
      if (
        nextCalendarEvent &&
        (!calendarEventData ||
          calendarEventSignature(calendarEventData) !== calendarEventSignature(nextCalendarEvent))
      ) {
        calendarEventData = nextCalendarEvent;
        wireCalendarActions(nextCalendarEvent);
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
