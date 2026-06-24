(function () {
  'use strict';

  const TIMEZONE = 'Europe/Bratislava';
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLL_ATTEMPTS = 30; // ~1 minute until payment completed
  const CONFIRMED_POLL_MAX_MS = 3 * 60 * 1000; // keep polling after completed for late bounces
  const CALENDAR_EVENT_TITLE = 'Online sedenie | citimtedasom.sk';
  const CALENDAR_EVENT_DETAILS_FALLBACK =
    'Online sedenie cez Google Meet. Odkaz na pripojenie nájdeš v potvrdzujúcom e-maile.';
  const CALENDAR_LOCATION_FALLBACK = 'Online (Google Meet)';

  /** @type {{ startAt: string, endAt: string, reservationId?: number, meetingUrl?: string | null } | null} */
  let calendarEventData = null;
  /** @type {string} */
  let checkoutSessionId = '';
  /** @type {number|string|null} */
  let lastReservationId = null;
  /** @type {string} */
  let lastRecipientMasked = '';
  /** @type {object|null} */
  let lastConfirmedStatusData = null;
  let emailDeliveryAlertWired = false;
  let supportModalWired = false;
  /** @type {HTMLElement|null} */
  let lastFocusBeforeSupportModal = null;
  /** @type {{ context: string, reservationId?: number|string|null, recipientMasked?: string }|null} */
  let supportModalContext = null;
  let supportSubmitFailureCount = 0;
  let supportSuccessCloseTimer = null;
  let statusPollTimerId = null;
  let paymentPollAttempts = 0;
  let confirmedPollStartedAt = null;
  /** @type {{ status: string, recipientMasked: string }|null} */
  let postRecoveryConfirmationEmail = null;

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

  function buildMailtoLink(email, subject, body) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const query = params.toString();
    return `mailto:${email}${query ? '?' + query : ''}`;
  }

  function buildSupportContextLines(reservationId) {
    if (!reservationId) return '';
    return `\n\nID rezervácie: ${reservationId}`;
  }

  function getSupportEmail() {
    const modal = document.getElementById('support-contact-modal');
    const fromData = modal?.dataset?.supportEmail?.trim();
    if (fromData) return fromData;
    const mailtoLink = document.getElementById('success-support-mailto');
    const href = mailtoLink?.getAttribute('href') || '';
    if (href.startsWith('mailto:')) return href.slice(7).split('?')[0];
    return '';
  }

  function buildSupportMailtoBody(reservationId, context) {
    let body = 'Dobrý deň,\n\nmám problém s potvrdením rezervácie.';
    if (context === 'booking-success-bounced') {
      body = 'Dobrý deň,\n\nmám problém s doručením potvrdenia rezervácie.';
    }
    body += buildSupportContextLines(reservationId);
    if (checkoutSessionId) {
      body += `\n\nStripe session: ${checkoutSessionId}`;
    }
    if (context) {
      body += `\n\nKontext: ${context}`;
    }
    return body + '\n\nĎakujem.';
  }

  function updateSupportMailtoLinks(reservationId, context) {
    const email = getSupportEmail();
    if (!email) return;
    const subject = 'Podpora – potvrdenie rezervácie';
    const body = buildSupportMailtoBody(reservationId, context);
    const href = buildMailtoLink(email, subject, body);
    const ids = ['success-support-mailto', 'support-contact-mailto-link'];
    ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.href = href;
    });
    const footerLinks = document.querySelectorAll('.support-contact-modal__footer a[href^="mailto:"]');
    footerLinks.forEach(function (el) {
      el.href = buildMailtoLink(email, '', '');
    });
  }

  function getSupportModalFocusables() {
    const modal = document.getElementById('support-contact-modal');
    if (!modal || modal.hidden) return [];
    return Array.from(
      modal.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function onSupportModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSupportModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = getSupportModalFocusables();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function resetSupportFormView() {
    const formView = document.getElementById('support-contact-form-view');
    const successView = document.getElementById('support-contact-success-view');
    const form = document.getElementById('support-contact-form');
    const errorEl = document.getElementById('support-contact-error');
    const mailtoFallback = document.getElementById('support-contact-mailto-fallback');
    if (formView) formView.hidden = false;
    if (successView) successView.hidden = true;
    if (form) form.reset();
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    if (mailtoFallback) mailtoFallback.hidden = true;
    const submitBtn = document.getElementById('support-contact-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Odoslať';
    }
  }

  function setSupportFormError(text) {
    const errorEl = document.getElementById('support-contact-error');
    if (!errorEl) return;
    errorEl.hidden = !text;
    errorEl.textContent = text || '';
  }

  function ensureSupportModalPortaledToBody() {
    const modal = document.getElementById('support-contact-modal');
    if (!modal || modal.dataset.supportModalPortaled === '1') return;
    document.body.appendChild(modal);
    modal.dataset.supportModalPortaled = '1';
  }

  function openSupportModal(options) {
    const context = options?.context || 'unknown';
    const reservationId = options?.reservationId ?? lastReservationId ?? null;
    const recipientMasked = options?.recipientMasked ?? lastRecipientMasked ?? '';

    supportModalContext = { context, reservationId, recipientMasked };
    ensureSupportModalPortaledToBody();
    resetSupportFormView();
    updateSupportMailtoLinks(reservationId, context);

    const modal = document.getElementById('support-contact-modal');
    if (!modal) return;

    if (supportSuccessCloseTimer) {
      clearTimeout(supportSuccessCloseTimer);
      supportSuccessCloseTimer = null;
    }

    lastFocusBeforeSupportModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onSupportModalKeydown, true);

    const messageInput = document.getElementById('support-contact-message');
    const emailInput = document.getElementById('support-contact-email');
    if (emailInput) {
      requestAnimationFrame(function () {
        emailInput.focus();
      });
    } else if (messageInput) {
      requestAnimationFrame(function () {
        messageInput.focus();
      });
    }
  }

  function closeSupportModal() {
    const modal = document.getElementById('support-contact-modal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('hidden', '');
    }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onSupportModalKeydown, true);
    if (supportSuccessCloseTimer) {
      clearTimeout(supportSuccessCloseTimer);
      supportSuccessCloseTimer = null;
    }
    resetSupportFormView();
    supportModalContext = null;
    if (lastFocusBeforeSupportModal && typeof lastFocusBeforeSupportModal.focus === 'function') {
      try {
        lastFocusBeforeSupportModal.focus();
      } catch (_) {}
    }
    lastFocusBeforeSupportModal = null;
  }

  function showSupportFormSuccess() {
    const formView = document.getElementById('support-contact-form-view');
    const successView = document.getElementById('support-contact-success-view');
    if (formView) formView.hidden = true;
    if (successView) {
      successView.hidden = false;
      const closeBtn = successView.querySelector('[data-support-modal-dismiss]');
      if (closeBtn) closeBtn.focus();
    }
    supportSuccessCloseTimer = setTimeout(function () {
      closeSupportModal();
    }, 5000);
  }

  async function submitSupportContact(message, email, phone) {
    const submitBtn = document.getElementById('support-contact-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Odosielam…';
    }
    setSupportFormError('');

    const payload = {
      message: message,
      email: email,
      phone: phone || undefined,
      reservationId:
        supportModalContext?.reservationId != null
          ? String(supportModalContext.reservationId)
          : undefined,
      checkoutSessionId: checkoutSessionId || undefined,
      context: supportModalContext?.context || undefined,
      recipientMasked: supportModalContext?.recipientMasked || undefined,
    };

    try {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const errText =
          data.message ||
          (data.error === 'RATE_LIMITED'
            ? 'Príliš veľa správ. Skús to prosím neskôr.'
            : 'Odoslanie správy zlyhalo. Skús to prosím znova.');
        throw new Error(errText);
      }
      supportSubmitFailureCount = 0;
      showSupportFormSuccess();
    } catch (err) {
      supportSubmitFailureCount += 1;
      setSupportFormError(err.message || 'Odoslanie správy zlyhalo.');
      const mailtoFallback = document.getElementById('support-contact-mailto-fallback');
      if (mailtoFallback && supportSubmitFailureCount >= 2) {
        mailtoFallback.hidden = false;
        updateSupportMailtoLinks(supportModalContext?.reservationId, supportModalContext?.context);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Odoslať';
      }
    }
  }

  function wireSupportModal() {
    if (supportModalWired) return;
    supportModalWired = true;

    const modal = document.getElementById('support-contact-modal');
    if (!modal) return;

    modal.addEventListener('click', function (e) {
      if (modal.hidden) return;
      if (e.target.closest('[data-support-modal-dismiss]')) {
        e.preventDefault();
        closeSupportModal();
      }
    });

    const closeBtn = document.getElementById('support-contact-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeSupportModal();
      });
    }

    const form = document.getElementById('support-contact-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const messageInput = document.getElementById('support-contact-message');
        const emailInput = document.getElementById('support-contact-email');
        const phoneInput = document.getElementById('support-contact-phone');
        const message = messageInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const phone = phoneInput?.value.trim() || '';
        if (!email) {
          setSupportFormError('E-mail je povinný.');
          emailInput?.focus();
          return;
        }
        if (!isValidEmail(email)) {
          setSupportFormError('E-mail má neplatný formát.');
          emailInput?.focus();
          return;
        }
        if (message.length < 5) {
          setSupportFormError('Správa musí mať aspoň 5 znakov.');
          messageInput?.focus();
          return;
        }
        submitSupportContact(message, email, phone);
      });
    }
  }

  function wireSupportCta(reservationId, recipientMasked) {
    const supportCta = document.getElementById('success-support-cta');
    if (!supportCta) return;
    updateSupportMailtoLinks(reservationId, 'booking-success-bounced');
    if (supportCta.dataset.supportWired === '1') return;
    supportCta.dataset.supportWired = '1';
    supportCta.addEventListener('click', function (e) {
      e.preventDefault();
      openSupportModal({
        context: 'booking-success-bounced',
        reservationId: reservationId,
        recipientMasked: recipientMasked,
      });
    });
  }

  function wireErrorSupportCta(context) {
    const wrap = document.getElementById('success-error-support');
    const btn = document.getElementById('success-error-support-cta');
    if (!wrap || !btn) return;
    wrap.hidden = false;
    if (btn.dataset.supportWired === '1') return;
    btn.dataset.supportWired = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openSupportModal({ context: context });
    });
  }

  function showErrorWithSupport(message, supportContext) {
    showState('error');
    setErrorMessage(message);
    if (supportContext) {
      wireErrorSupportCta(supportContext);
    } else {
      const wrap = document.getElementById('success-error-support');
      if (wrap) wrap.hidden = true;
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  function copyMeetingUrl(url) {
    const msg = document.getElementById('success-meeting-copy-msg');
    function showOk() {
      if (msg) {
        msg.hidden = false;
        setTimeout(function () {
          msg.hidden = true;
        }, 2000);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showOk).catch(function () {
        fallbackCopyMeetingUrl(url, showOk);
      });
    } else {
      fallbackCopyMeetingUrl(url, showOk);
    }
  }

  function fallbackCopyMeetingUrl(url, onOk) {
    const urlEl = document.getElementById('success-meeting-url');
    if (!urlEl) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(urlEl);
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      if (document.execCommand('copy')) onOk();
    } catch (e) {
      /* ignore */
    }
    selection?.removeAllRanges();
  }

  function wireMeetingLink(meetingUrl) {
    const block = document.getElementById('success-meeting-link-block');
    const urlEl = document.getElementById('success-meeting-url');
    const normalized = normalizeMeetingUrl(meetingUrl);
    if (!block || !urlEl) return;
    if (!normalized) {
      block.hidden = true;
      urlEl.textContent = '';
      return;
    }
    block.hidden = false;
    urlEl.textContent = normalized;
  }

  function setFixEmailPanelOpen(open) {
    const panel = document.getElementById('success-fix-email-panel');
    const toggle = document.getElementById('success-fix-email-toggle');
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const input = document.getElementById('success-fix-email-input');
      if (input) input.focus();
    }
  }

  function setFixEmailFormMessage(kind, text) {
    const errorEl = document.getElementById('success-fix-email-error');
    const successEl = document.getElementById('success-fix-email-success');
    if (errorEl) {
      errorEl.hidden = kind !== 'error';
      errorEl.textContent = kind === 'error' ? text : '';
    }
    if (successEl) {
      successEl.hidden = kind !== 'success';
      successEl.textContent = kind === 'success' ? text : '';
    }
  }

  function clearStatusPoll() {
    if (statusPollTimerId) {
      clearTimeout(statusPollTimerId);
      statusPollTimerId = null;
    }
  }

  function scheduleStatusPoll(fn, delay) {
    clearStatusPoll();
    statusPollTimerId = setTimeout(fn, delay);
  }

  function restartConfirmationEmailPolling() {
    confirmedPollStartedAt = Date.now();
    scheduleStatusPoll(pollPaymentStatus, POLL_INTERVAL_MS);
  }

  function maskEmailForDisplay(email) {
    const raw = String(email || '').trim();
    const at = raw.indexOf('@');
    if (at <= 0) return '***';
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    if (!domain) return '***';
    const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }

  function setDeliveryAlertVisible(visible) {
    const alertEl = document.getElementById('success-email-delivery-alert');
    if (!alertEl) return;
    alertEl.hidden = !visible;
    if (visible) {
      alertEl.removeAttribute('hidden');
    } else {
      alertEl.setAttribute('hidden', '');
    }
  }

  function applyStatusPollData(data) {
    if (data?.reservation?.id != null) {
      lastReservationId = data.reservation.id;
    }
    if (data?.confirmationEmail?.recipientMasked) {
      lastRecipientMasked = data.confirmationEmail.recipientMasked;
    }

    if (postRecoveryConfirmationEmail && data?.confirmationEmail) {
      const polledStatus = data.confirmationEmail.status;
      const recoveredStatus = postRecoveryConfirmationEmail.status;
      if (polledStatus === 'sent' || polledStatus === 'pending') {
        postRecoveryConfirmationEmail = null;
      } else if (
        (polledStatus === 'bounced' || polledStatus === 'failed') &&
        (recoveredStatus === 'sent' || recoveredStatus === 'pending')
      ) {
        data = {
          ...data,
          confirmationEmail: postRecoveryConfirmationEmail,
        };
      }
    }

    showState('confirmed', data);
  }

  async function submitFixConfirmationEmail(email) {
    const submitBtn = document.getElementById('success-fix-email-submit');
    const input = document.getElementById('success-fix-email-input');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Odosielam…';
    }
    setFixEmailFormMessage('error', '');
    setFixEmailFormMessage('success', '');

    try {
      const res = await fetch('/api/payments/fix-confirmation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: checkoutSessionId, email: email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(
          data.message || 'Odoslanie potvrdenia zlyhalo. Skús to prosím znova.'
        );
      }

      const recovered =
        data.confirmationEmail ||
        (email ? { status: 'sent', recipientMasked: maskEmailForDisplay(email) } : null);

      if (recovered) {
        postRecoveryConfirmationEmail = recovered;
        if (lastConfirmedStatusData) {
          lastConfirmedStatusData.confirmationEmail = recovered;
          applyStatusPollData(lastConfirmedStatusData);
        } else {
          fetchStatus(checkoutSessionId)
            .then(function (statusData) {
              statusData.confirmationEmail = recovered;
              applyStatusPollData(statusData);
              restartConfirmationEmailPolling();
            })
            .catch(function () {
              applyStatusPollData({
                confirmationEmail: recovered,
                payment: { status: 'completed' },
              });
            });
        }
      }

      if (input) input.value = '';
      setFixEmailPanelOpen(false);
      if (lastConfirmedStatusData) {
        restartConfirmationEmailPolling();
      }
    } catch (err) {
      setFixEmailFormMessage('error', err.message || 'Odoslanie potvrdenia zlyhalo.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Odoslať potvrdenie znova';
      }
    }
  }

  function wireEmailDeliveryAlertInteractions() {
    if (emailDeliveryAlertWired) return;
    emailDeliveryAlertWired = true;

    const toggle = document.getElementById('success-fix-email-toggle');
    const form = document.getElementById('success-fix-email-form');

    if (toggle) {
      toggle.addEventListener('click', function () {
        const panel = document.getElementById('success-fix-email-panel');
        setFixEmailPanelOpen(Boolean(panel?.hidden));
      });
    }

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        const input = document.getElementById('success-fix-email-input');
        const email = input?.value.trim() || '';
        if (!isValidEmail(email)) {
          setFixEmailFormMessage('error', 'Zadaj platnú e-mailovú adresu.');
          return;
        }
        submitFixConfirmationEmail(email);
      });
    }

    const meetingCopyBtn = document.getElementById('success-meeting-copy');
    if (meetingCopyBtn) {
      meetingCopyBtn.addEventListener('click', function () {
        const urlEl = document.getElementById('success-meeting-url');
        const url = urlEl?.textContent.trim() || '';
        if (url) copyMeetingUrl(url);
      });
    }
  }

  function updateConfirmationEmailCopy(confirmationEmail, reservationId, meetingUrl) {
    const confirmedEl = document.getElementById('success-confirmed');
    const alertTextEl = document.getElementById('success-email-delivery-alert-text');
    const defaultEl = document.getElementById('success-email-confirmation-default');
    const noticeEl = document.getElementById('success-email-notice');

    const status = confirmationEmail?.status || null;
    const masked = confirmationEmail?.recipientMasked || '';
    const showWarning = status === 'bounced' || status === 'failed';

    if (confirmedEl) {
      confirmedEl.classList.toggle('success-confirmed--email-failed', showWarning);
    }

    setDeliveryAlertVisible(showWarning);

    if (alertTextEl && showWarning) {
      alertTextEl.textContent = masked
        ? `Rezervácia je vytvorená a termín je rezervovaný, ale potvrdenie sa nepodarilo doručiť na ${masked}.`
        : 'Rezervácia je vytvorená a termín je rezervovaný, ale potvrdenie sa nepodarilo doručiť na zadanú adresu.';
    }

    if (showWarning) {
      wireEmailDeliveryAlertInteractions();
      wireSupportCta(reservationId, confirmationEmail?.recipientMasked || '');
      wireMeetingLink(meetingUrl);
    } else {
      setFixEmailPanelOpen(false);
      const meetingBlock = document.getElementById('success-meeting-link-block');
      if (meetingBlock) meetingBlock.hidden = true;
    }

    if (defaultEl) defaultEl.hidden = showWarning;

    if (noticeEl) {
      const showNotice = !showWarning && Boolean(masked);
      noticeEl.hidden = !showNotice;
      noticeEl.textContent = showNotice
        ? `Potvrdenie posielame na ${masked}. Ak do pár minút nedorazí, skontroluj adresu alebo nás kontaktuj.`
        : '';
    }
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
      lastConfirmedStatusData = data;
      const paymentType =
        data.reservation && data.reservation.paymentType === 'full' ? 'full' : 'deposit';
      const full = isFullPayment(paymentType);
      const emailFailed =
        data.confirmationEmail?.status === 'bounced' || data.confirmationEmail?.status === 'failed';
      const title = emailFailed || !full ? 'Termín je rezervovaný' : 'Platba je dokončená';
      setTitle(titleEl, title);
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

      updateConfirmationEmailCopy(data.confirmationEmail, data.reservation?.id, data.meetingUrl);
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

  let paymentPollLastStatus = null;

  function pollPaymentStatus() {
    if (!checkoutSessionId) return;

    paymentPollAttempts += 1;
    fetchStatus(checkoutSessionId)
      .then(function (data) {
        const status = data?.payment?.status || null;
        paymentPollLastStatus = status;

        if (status === 'completed') {
          applyStatusPollData(data);
          if (!confirmedPollStartedAt) {
            confirmedPollStartedAt = Date.now();
          }
          if (Date.now() - confirmedPollStartedAt < CONFIRMED_POLL_MAX_MS) {
            scheduleStatusPoll(pollPaymentStatus, POLL_INTERVAL_MS);
          }
          return;
        }

        if (status === 'failed') {
          clearStatusPoll();
          showErrorWithSupport(
            'Platba prebehla cez Stripe, ale pri našom spracovaní nastala technická chyba. Potvrdenie pošleme e-mailom. Ak ho nedostanete do niekoľkých minút, kontaktujte podporu.',
            'payment-processing-failed'
          );
          return;
        }

        if (status === 'expired') {
          clearStatusPoll();
          showState('error');
          setErrorMessage('Platnosť platby vypršala. Skúste prosím znovu.');
          return;
        }

        if (status === 'refunded') {
          clearStatusPoll();
          showErrorWithSupport(
            'Platba bola vrátená. Ak máte otázky, kontaktujte podporu.',
            'payment-refunded'
          );
          return;
        }

        if (paymentPollAttempts >= MAX_POLL_ATTEMPTS) {
          clearStatusPoll();
          showState('error');
          if (paymentPollLastStatus && paymentPollLastStatus !== 'pending') {
            setErrorMessage(
              'Nepodarilo sa potvrdiť platbu. Stav: ' +
                paymentPollLastStatus +
                '. Skúste to prosím znova.'
            );
          } else {
            setErrorMessage(
              'Nepodarilo sa potvrdiť platbu. Chvíľu sme to čakali na webhook, no nepotvrdilo sa to. Skúste to prosím znova.'
            );
          }
          return;
        }
        showState('loading');
        scheduleStatusPoll(pollPaymentStatus, POLL_INTERVAL_MS);
      })
      .catch(function (err) {
        clearStatusPoll();
        showState('error');
        setErrorMessage(err.message);
      });
  }

  function run() {
    wireSupportModal();

    try {
      sessionStorage.removeItem('booking_stripe_redirect');
    } catch (_) {}

    const sessionId = getSessionId();
    checkoutSessionId = sessionId;
    if (!sessionId || !sessionId.startsWith('cs_')) {
      showState('error');
      setErrorMessage('Neplatný údaj o platbe. Skúste to prosím znova.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_pending_timeout') === '1') {
      showErrorWithSupport(
        'Platba prebehla cez Stripe, ale pri našom spracovaní nastala technická chyba. Potvrdenie pošleme e-mailom. Ak ho nedostanete do niekoľkých minút, kontaktujte podporu.',
        'payment-timeout'
      );
      return;
    }

    paymentPollAttempts = 0;
    paymentPollLastStatus = null;
    confirmedPollStartedAt = null;
    clearStatusPoll();

    showState('loading');
    pollPaymentStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
