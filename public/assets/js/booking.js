(function () {
  'use strict';

  /** Set `?bookingDebug=1` or `sessionStorage.setItem('bookingDebug','1')` then reload — verbose logs in console. */
  /** Storage read/write failures always use `console.error('[booking]', …)` (not gated by bookingDebug). */
  const BOOKING_DEBUG =
    typeof location !== 'undefined' &&
    (new URLSearchParams(location.search).get('bookingDebug') === '1' ||
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bookingDebug') === '1'));

  function dbg(...args) {
    if (BOOKING_DEBUG) console.log('[booking]', ...args);
  }

  function logStorageError(where, err) {
    console.error('[booking]', where, err);
  }

  let recaptchaScriptPromise = null;

  function getRecaptchaSiteKey() {
    return typeof window !== 'undefined' && window.__BOOKING_RECAPTCHA_SITE_KEY
      ? String(window.__BOOKING_RECAPTCHA_SITE_KEY).trim()
      : '';
  }

  /**
   * reCAPTCHA v3 token for adaptive gate (docs/security/captcha.md). No-op when site key unset.
   * @param {string} [action]
   * @returns {Promise<string>}
   */
  async function getRecaptchaToken(action) {
    const key = getRecaptchaSiteKey();
    if (!key) return '';
    if (!recaptchaScriptPromise) {
      recaptchaScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('recaptcha script'));
        document.head.appendChild(s);
      });
    }
    await recaptchaScriptPromise;
    if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
      throw new Error('grecaptcha');
    }
    return new Promise((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(key, { action: action || 'booking' })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  const TIMEZONE = 'Europe/Bratislava';
  const RANGE_DAYS = 21;
  const MAX_FUNNEL_DAYS = 10;
  /** Calendar day columns visible before "more dates" expand. */
  const INITIAL_VISIBLE_FUNNEL_DAYS = 3;
  const POLL_MS = 5000;
  const LEAD_MS = 24 * 60 * 60 * 1000;

  /** Fallback until GET /api/slots returns `grid.times` (same order as server `src/config/slotGrid.js`). */
  const DEFAULT_GRID_TIMES = ['08:30', '10:00', '11:30', '13:00', '14:30'];

  let gridTimes = DEFAULT_GRID_TIMES.slice();
  let slotsRaw = [];
  let lockToken = null;
  let expiresAt = null;
  let lockedSlotId = null;
  let lockedEmail = '';
  /** `'email'` — modal, krok e-mail; `'payment'` — modal, krok výber platby */
  let lockPhase = 'email';
  /** Modal open/closed (persisted). */
  let modalVisible = true;
  /** Visible modal step: email vs payment (can differ from lockPhase when editing email after payment step). */
  let modalUiStep = 'email';
  /** True when modal shows "Zmeniť e-mail" while lockPhase is already payment. */
  let modalEmailEdit = false;
  /** Payment radios/custom amount restored from storage after `openBookingModal({ step: 'payment' })`. */
  let pendingPaymentFormRestore = null;
  /** Billing inputs restored from storage after page reload. */
  let pendingBillingRestore = null;
  /** Debounced billing edits → snapshot update in localStorage. */
  let billingPersistTimer = null;
  let countdownInterval = null;
  let pendingSlotId = null;
  let lastFocusBeforeModal = null;
  let loadSeq = 0;
  let pollTimer = null;
  let calendarDaysExpanded = false;
  /**
   * Collapsed (minified) strip only: dates that were ever shown in the main column this session.
   * When a day drops from the API and returns, it stays in the set, so the column can grow (e.g. 3 → 4).
   * Cleared on expand and when the calendar empties; page reload clears implicitly.
   */
  let minifiedEverShownDates = new Set();
  /**
   * Structural fingerprint of the calendar column: which days appear, expand/collapse, and main vs "more" strip.
   * Slot-only HTML changes (poll, lock state) must not match a layout change — avoids animating on every refresh.
   */
  let calendarLastLayoutSig = '';
  let calendarReflowTimer = null;

  const $ = (id) => document.getElementById(id);

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  const STORAGE_KEY = 'booking_lock';
  /** Set when redirecting to Stripe so GET /api/slots can treat the hold as mine if the lock row already expired. */
  const CHECKOUT_SESSION_STORAGE_KEY = 'booking_checkout_session';
  /** Set before redirect to Stripe; cleared after POST /api/payments/abandon-checkout or on success page. */
  const STRIPE_REDIRECT_FLAG = 'booking_stripe_redirect';
  const FUNNEL_CTX_KEY = 'booking_funnel_ctx';
  /** Cross-tab: localStorage `storage` + BroadcastChannel so other tabs reopen the booking modal when one tab locks. */
  const BROADCAST_CHANNEL_NAME = 'booking_lock_sync';
  /** Same-tab BroadcastChannel echoes would re-apply lock state and call `openBookingModal({ step: 'payment' })` → `resetPaymentPathStep()`, clearing payment radios after every change. */
  const BOOKING_TAB_BROADCAST_ID =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  let bookingCrossTabChannel = null;
  /** While > 0, `storeLock` is a no-op (avoid echo when applying another tab's snapshot). */
  let suppressCrossTabApply = 0;

  /** Match server `parseFunnelAttribution` campaign id pattern; invalid stored values fall back. */
  function sanitizeFunnelCampaignId(raw, fallback) {
    const fb = fallback != null && String(fallback).trim() !== '' ? String(fallback).trim() : 'default';
    if (raw == null || String(raw).trim() === '') return fb;
    const s = String(raw).trim();
    return /^[a-zA-Z0-9_-]{1,64}$/.test(s) ? s : fb;
  }

  function clearCheckoutSessionStorage() {
    try {
      localStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
    } catch (_) {}
    try {
      sessionStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
    } catch (_) {}
  }

  /** Same timing as `success-page.js` — poll until DB shows `completed` (webhook). */
  const PAYMENT_RETURN_POLL_MS = 2000;
  const PAYMENT_RETURN_MAX_ATTEMPTS = 30;

  /** Stripe `success_url` lands on `/{funnel}?payment_pending=1&session_id=…` */
  function parseStripePaymentReturnUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get('payment_pending') !== '1') return null;
    const sid = params.get('session_id') || '';
    if (!sid.startsWith('cs_')) return null;
    return { sessionId: sid };
  }

  function stripPaymentReturnQueryParams() {
    const params = new URLSearchParams(location.search);
    if (!params.has('payment_pending') && !params.has('session_id')) return;
    params.delete('payment_pending');
    params.delete('session_id');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  function showPaymentCompleteOverlay() {
    const el = $('booking-payment-complete-overlay');
    if (el) {
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
    }
    try {
      document.body.style.overflow = 'hidden';
    } catch (_) {}
  }

  function hidePaymentCompleteOverlay() {
    const el = $('booking-payment-complete-overlay');
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
    try {
      document.body.style.overflow = '';
    } catch (_) {}
  }

  function fetchPaymentStatusForReturn(sessionId) {
    return fetch('/api/payments/status?session_id=' + encodeURIComponent(sessionId)).then((res) => {
      if (!res.ok) {
        return res.json().then((body) => {
          throw new Error(body.error || 'Failed to load status');
        });
      }
      return res.json();
    });
  }

  /**
   * Poll until payment is `completed` (webhook), then redirect to `/{funnel}/success`.
   * Resolves when the user should continue normal init (fetch error); never resolves if redirecting away.
   */
  function completeStripePaymentReturnOnFunnelPage(sessionId) {
    return new Promise((resolve) => {
      const ctx = readFunnelContext();
      const funnelName =
        ctx.funnelName && String(ctx.funnelName).trim() !== '' ? String(ctx.funnelName).trim() : null;
      if (!funnelName) {
        stripPaymentReturnQueryParams();
        resolve();
        return;
      }

      try {
        sessionStorage.removeItem(STRIPE_REDIRECT_FLAG);
      } catch (_) {}

      showPaymentCompleteOverlay();

      let attempts = 0;
      function goToSuccessPage({ paymentPendingTimeout } = {}) {
        let url = '/' + encodeURIComponent(funnelName) + '/success?session_id=' + encodeURIComponent(sessionId);
        if (paymentPendingTimeout) url += '&payment_pending_timeout=1';
        window.location.replace(url);
      }

      function poll() {
        attempts += 1;
        fetchPaymentStatusForReturn(sessionId)
          .then((data) => {
            const status = data?.payment?.status || null;

            if (status === 'completed') {
              goToSuccessPage();
              return;
            }

            // Webhook-side failures keep the payment from becoming `completed`.
            // Redirect immediately so the success page can show an error state.
            if (status === 'failed' || status === 'expired' || status === 'refunded') {
              goToSuccessPage();
              return;
            }

            if (attempts >= PAYMENT_RETURN_MAX_ATTEMPTS) {
              goToSuccessPage({ paymentPendingTimeout: true });
              return;
            }
            setTimeout(poll, PAYMENT_RETURN_POLL_MS);
          })
          .catch((e) => {
            console.error('[booking] payment return poll', e);
            hidePaymentCompleteOverlay();
            stripPaymentReturnQueryParams();
            resolve();
          });
      }

      poll();
    });
  }

  function readFunnelContext() {
    const section = document.getElementById('booking');
    const fromUrl = new URLSearchParams(location.search).get('campaign');
    const serverName = section?.dataset?.funnelName?.trim() || '';
    const serverCampaign = section?.dataset?.funnelCampaign?.trim() || 'default';
    const serverVideo = section?.dataset?.funnelVideoId?.trim() || '';
    try {
      let raw = null;
      try {
        raw = localStorage.getItem(FUNNEL_CTX_KEY);
      } catch (_) {}
      if (raw == null) {
        try {
          raw = sessionStorage.getItem(FUNNEL_CTX_KEY);
          if (raw != null) {
            try {
              localStorage.setItem(FUNNEL_CTX_KEY, raw);
            } catch (_) {}
            try {
              sessionStorage.removeItem(FUNNEL_CTX_KEY);
            } catch (_) {}
          }
        } catch (_) {}
      }
      const stored = JSON.parse(raw || 'null');
      if (section && serverName) {
        if (fromUrl != null && fromUrl !== '') {
          return {
            funnelName: serverName,
            funnelCampaign: sanitizeFunnelCampaignId(fromUrl.trim(), serverCampaign),
            funnelVideoId: serverVideo,
          };
        }
        if (stored && stored.funnelName === serverName) {
          return {
            funnelName: serverName,
            funnelCampaign: sanitizeFunnelCampaignId(stored.funnelCampaign, serverCampaign),
            funnelVideoId: serverVideo || stored.funnelVideoId || '',
          };
        }
        return {
          funnelName: serverName,
          funnelCampaign: serverCampaign,
          funnelVideoId: serverVideo,
        };
      }
      if (stored && stored.funnelName) {
        return stored;
      }
    } catch (_) {}
    return { funnelName: '', funnelCampaign: '', funnelVideoId: '' };
  }

  function persistFunnelContext(ctx) {
    if (!ctx || !ctx.funnelName) return;
    try {
      const json = JSON.stringify(ctx);
      localStorage.setItem(FUNNEL_CTX_KEY, json);
      try {
        sessionStorage.removeItem(FUNNEL_CTX_KEY);
      } catch (_) {}
    } catch (e) {
      logStorageError('persistFunnelContext: localStorage.setItem', e);
    }
  }

  function readCheckoutAmountsFromBookingSection() {
    const host = document.getElementById('booking');
    const depRaw = host && host.getAttribute('data-reservation-deposit-eur');
    const fullRaw = host && host.getAttribute('data-full-payment-checkout-eur');
    const dep = parseInt(depRaw, 10);
    const full = parseInt(fullRaw, 10);
    return {
      reservationDepositEur: Number.isFinite(dep) && dep > 0 ? dep : 45,
      fullPaymentCheckoutEur: Number.isFinite(full) && full > 0 ? full : 85,
    };
  }

  function readPaymentFormStateFromDom() {
    const path = document.querySelector('input[name="paymentPath"]:checked')?.value;
    return { path: path || null };
  }

  function applyPaymentFormStateToDom(state) {
    if (!state || typeof state !== 'object') return;
    if (state.path) {
      const el = document.querySelector(`input[name="paymentPath"][value="${state.path}"]`);
      if (el) el.checked = true;
    }
    updatePaymentSubmitButtonLabel();
  }

  /** Persist lock blob in localStorage (shared across tabs). Migrates away from legacy sessionStorage on read. */
  function persistLockBlob(json) {
    try {
      localStorage.setItem(STORAGE_KEY, json);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    } catch (e) {
      logStorageError('persistLockBlob: localStorage.setItem', e);
    }
  }

  function readLockBlob() {
    try {
      const fromLocal = localStorage.getItem(STORAGE_KEY);
      if (fromLocal) return fromLocal;
    } catch (e) {
      logStorageError('readLockBlob: localStorage.getItem', e);
    }
    try {
      const legacy = sessionStorage.getItem(STORAGE_KEY);
      if (legacy) {
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
        } catch (e) {
          logStorageError('readLockBlob: migrate to localStorage', e);
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        return legacy;
      }
    } catch (e) {
      logStorageError('readLockBlob: sessionStorage.getItem (legacy)', e);
    }
    return null;
  }

  function broadcastBookingLockToOtherTabs() {
    if (!bookingCrossTabChannel) return;
    try {
      bookingCrossTabChannel.postMessage({ type: 'booking_lock', tabId: BOOKING_TAB_BROADCAST_ID });
    } catch (e) {
      logStorageError('broadcastBookingLockToOtherTabs', e);
    }
  }

  function storeLock() {
    if (suppressCrossTabApply > 0) return;
    try {
      let lockedSlotDate = '';
      if (lockedSlotId) {
        const s = slotsRaw.find((x) => x.id === lockedSlotId);
        if (s) {
          lockedSlotDate =
            s.localDate ||
            (s.startAt
              ? new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(s.startAt))
              : '');
        }
      }
      let paymentForm = null;
      // Persist payment choice even when the UI is in "edit email" mode (payment step hidden),
      // because the radios still exist in the DOM.
      if (lockToken && lockPhase === 'payment') paymentForm = readPaymentFormStateFromDom();

      // Persist billing inputs so reload doesn't wipe partially-entered details.
      const billing = lockToken ? readBillingForm() : null;
      // Always include expiresAt key (null if missing) — JSON.stringify drops `undefined`, and
      // getStoredLock used to reject when the key was absent.
      persistLockBlob(
        JSON.stringify({
          lockToken,
          lockedSlotId,
          expiresAt: expiresAt != null ? expiresAt : null,
          lockedSlotDate,
          phase: lockPhase,
          email: lockedEmail || undefined,
          modalVisible,
          modalUiStep,
          modalEmailEdit,
          paymentForm,
          billing: billing || undefined,
        })
      );
      broadcastBookingLockToOtherTabs();
    } catch (e) {
      logStorageError('storeLock', e);
    }
  }

  function clearStoredLock() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      logStorageError('clearStoredLock: localStorage.removeItem', e);
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      logStorageError('clearStoredLock: sessionStorage.removeItem (legacy)', e);
    }
  }

  function getStoredLock() {
    try {
      const raw = readLockBlob();
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.lockToken || data.lockedSlotId == null) return null;
      if (data.expiresAt != null && data.expiresAt !== '') {
        const expMs = new Date(data.expiresAt).getTime();
        if (Number.isNaN(expMs)) {
          clearStoredLock();
          return null;
        }
      }
      // Do not reject based on Date.now() vs expiresAt — client clock ahead of the server would
      // clear session on every reload. Expiry is enforced by GET /api/slots (isMyLock), countdown,
      // and revoke.
      if (data.phase !== 'payment' && data.phase !== 'email') {
        data.phase = 'email';
      }
      const modalVisibleParsed = data.modalVisible !== false;
      let modalUiStepParsed = data.modalUiStep === 'payment' ? 'payment' : 'email';
      let modalEmailEditParsed = !!data.modalEmailEdit;
      if (data.modalUiStep == null && data.modalEmailEdit == null) {
        modalUiStepParsed = data.phase === 'payment' ? 'payment' : 'email';
        modalEmailEditParsed = false;
      }
      if (data.phase === 'email') {
        modalUiStepParsed = 'email';
        modalEmailEditParsed = false;
      }
      const paymentFormParsed =
        data.paymentForm && typeof data.paymentForm === 'object' ? data.paymentForm : null;
      const billingParsed = data.billing && typeof data.billing === 'object' ? data.billing : null;
      return {
        ...data,
        modalVisible: modalVisibleParsed,
        modalUiStep: modalUiStepParsed,
        modalEmailEdit: modalEmailEditParsed,
        paymentForm: paymentFormParsed,
        billing: billingParsed,
      };
    } catch (e) {
      logStorageError('getStoredLock', e);
      return null;
    }
  }

  /** Apply parsed lock + modal fields from `getStoredLock()` into module state (no I/O). */
  function applyMemoryFromStoredLockPayload(stored) {
    lockToken = stored.lockToken;
    lockedSlotId = stored.lockedSlotId;
    expiresAt = stored.expiresAt;
    lockPhase = stored.phase === 'payment' ? 'payment' : 'email';
    lockedEmail = typeof stored.email === 'string' ? stored.email.trim() : '';
    modalVisible = stored.modalVisible !== false;
    modalUiStep = stored.modalUiStep === 'payment' ? 'payment' : 'email';
    modalEmailEdit = !!stored.modalEmailEdit;
    if (lockPhase === 'email') {
      modalUiStep = 'email';
      modalEmailEdit = false;
    }
    pendingPaymentFormRestore = stored.paymentForm || null;
    pendingBillingRestore = stored.billing || null;
  }

  function getTodayLocal() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
  }

  function addCalendarDays(isoDateStr, days) {
    const [y, m, d] = isoDateStr.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + days);
    const y2 = base.getFullYear();
    const m2 = String(base.getMonth() + 1).padStart(2, '0');
    const d2 = String(base.getDate()).padStart(2, '0');
    return `${y2}-${m2}-${d2}`;
  }

  function getMaxDate() {
    return addCalendarDays(getTodayLocal(), RANGE_DAYS);
  }

  /** Weekday Mon–Fri from calendar YYYY-MM-DD (Gregorian; placement does not use browser TZ). */
  function isWeekdayYmd(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow >= 1 && dow <= 5;
  }

  function passesFunnelSlotRules(slot) {
    const start = new Date(slot.startAt).getTime();
    if (start < Date.now() + LEAD_MS) return false;
    if (!slot.localDate || !isWeekdayYmd(slot.localDate)) return false;
    return true;
  }

  function groupSlotsByLocalDate(slots) {
    const byDate = {};
    for (const s of slots) {
      const ld = s.localDate;
      if (!ld) continue;
      if (!byDate[ld]) byDate[ld] = [];
      byDate[ld].push(s);
    }
    return byDate;
  }

  function formatDayTitleFromDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const ref = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
    }).format(ref);
  }

  /** One-line confirmation for the booking modal: "streda 1. 4. • 08:30" */
  function formatModalSelectedSlotLine(slot) {
    if (!slot) return '';
    const dateStr = slot.localDate;
    const time = String(slot.timeKey || '').trim();
    if (!dateStr || !time) return '';
    const dayPart = formatDayTitleFromDateStr(dateStr);
    if (!dayPart) return '';
    return `${dayPart} • ${time}`;
  }

  function updateBookingModalSelectedSlotDisplay() {
    const wrap = $('booking-modal-selected');
    const valueEl = $('booking-modal-selected-value');
    if (!wrap || !valueEl) return;
    if (!lockedSlotId || !lockToken) {
      wrap.hidden = true;
      valueEl.textContent = '';
      return;
    }
    const slot = slotsRaw.find(
      (s) => s.id === lockedSlotId || String(s.id) === String(lockedSlotId)
    );
    const line = formatModalSelectedSlotLine(slot);
    if (!line) {
      wrap.hidden = true;
      valueEl.textContent = '';
      return;
    }
    valueEl.textContent = line;
    wrap.hidden = false;
  }

  function relativeDayHint(dateStr) {
    const today = getTodayLocal();
    const t0 = new Date(`${today}T12:00:00`).getTime();
    const t1 = new Date(`${dateStr}T12:00:00`).getTime();
    const diff = Math.round((t1 - t0) / 86400000);
    if (diff === 0) return 'dnes';
    if (diff === 1) return 'zajtra';
    if (diff >= 2 && diff <= 4) return `o ${diff} dni`;
    return '';
  }

  const ERROR_MESSAGES = {
    VALIDATION_ERROR: 'Skontroluj prosím zadané údaje.',
    SLOT_LOCKED: 'Termín je práve podržaný iným záujemcom.',
    SLOT_NOT_FOUND: 'Termín už nie je dostupný.',
    NOT_FOUND: 'Termín už nie je dostupný.',
    REQUEST_CANNOT_COMPLETE: 'Požiadavku nebolo možné dokončiť. Skús to prosím znova alebo vyber iný termín.',
    RATE_LIMITED: 'Príliš veľa pokusov. Skús o chvíľu.',
    SLOT_NOT_OPEN: 'Termín nie je dostupný.',
    LOCK_INVALID: 'Vypršal čas podržania. Vyber termín znova.',
    LOCK_EXPIRED: 'Vypršal čas podržania. Vyber termín znova.',
    SLOT_RESERVED: 'Termín už nie je voľný.',
    SLOT_ALREADY_RESERVED: 'Termín už nie je voľný.',
    EMAIL_HAS_LOCK: 'Tento e-mail už drží iný termín. Zadaj iný e-mail.',
    EMAIL_HAS_RESERVATION: 'Na tento e-mail už existuje rezervácia. Zadaj iný e-mail.',
    INTERNAL_ERROR: 'Niečo sa pokazilo. Skús neskôr.',
    STRIPE_ERROR: 'Platobná brána je dočasne nedostupná. Skús neskôr.',
    captcha_required: 'Potrebujeme overiť, že nie si robot. Skús znova.',
    request_cannot_be_completed:
      'Požiadavku nebolo možné dokončiť. Skús to prosím znova alebo vyber iný termín.',
  };

  function userMessage(code) {
    return ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
  }

  function isEmailModalOpen() {
    const modal = $('booking-email-modal');
    return !!(modal && !modal.hidden);
  }

  function isBookingPaymentStepVisible() {
    const pay = $('booking-payment-choice');
    return !!(pay && !pay.hidden);
  }

  function setBookingModalStep(step) {
    const emailStep = $('booking-modal-step-email');
    const payChoice = $('booking-payment-choice');
    if (emailStep) emailStep.hidden = step !== 'email';
    if (payChoice) payChoice.hidden = step !== 'payment';
  }

  function resetPaymentPathStep() {
    document.querySelectorAll('input[name="paymentPath"]').forEach((el) => {
      el.checked = false;
    });
    const pathVal = $('booking-payment-path-validation');
    if (pathVal) pathVal.hidden = true;
  }

  function resetBookingModalSteps() {
    setBookingModalStep('email');
  }

  /** @param {'email' | 'email-edit' | 'payment'} mode */
  function configureBookingModal(mode) {
    const title = $('booking-modal-title');
    const phaseEl = $('booking-modal-phase');
    if (!title || !phaseEl) return;
    if (mode === 'payment') {
      title.textContent = 'Vyber spôsob platby';
      phaseEl.textContent = 'Zvoľ možnosť nižšie. Platbu dokončíš v ďalšom kroku.';
    } else if (mode === 'email-edit') {
      title.textContent = 'Zmeniť e-mail';
      phaseEl.textContent = 'Uprav e-mail nižšie.';
    } else {
      title.textContent = 'Pokračuj v rezervácii termínu';
      phaseEl.textContent = 'Pokračuj zadaním e-mailu.';
    }
  }

  /** Fixed overlays must sit under `body` so no ancestor transform/filter breaks `position:fixed` or hit-testing. */
  function ensureBookingModalPortaledToBody() {
    const modal = $('booking-email-modal');
    if (!modal || modal.dataset.bookingModalPortaled === '1') return;
    document.body.appendChild(modal);
    modal.dataset.bookingModalPortaled = '1';
  }

  /**
   * @param {{ step?: 'email' | 'payment'; edit?: boolean }} [options]
   */
  function openBookingModal(options) {
    const step = options && options.step === 'payment' ? 'payment' : 'email';
    const edit = !!(options && options.edit);
    modalVisible = true;
    modalUiStep = step;
    modalEmailEdit = step === 'email' && edit;
    ensureBookingModalPortaledToBody();
    const modal = $('booking-email-modal');
    const main = $('booking-main');
    if (!modal) return;
    document.removeEventListener('keydown', onModalEscape, true);
    setBookingModalStep(step);
    if (step === 'email') {
      configureBookingModal(edit ? 'email-edit' : 'email');
    } else {
      configureBookingModal('payment');
      resetPaymentPathStep();
      updatePaymentSubmitButtonLabel();
    }
    lastFocusBeforeModal = document.activeElement;
    modal.removeAttribute('hidden');
    modal.hidden = false;
    if (main) main.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onModalEscape, true);
    updateBookingModalSelectedSlotDisplay();
    if (step === 'email') {
      const nameInput = $('booking-billing-name');
      if (nameInput) requestAnimationFrame(() => nameInput.focus());
    } else {
      const firstPay = $('payment-deposit');
      if (firstPay) requestAnimationFrame(() => firstPay.focus());
    }
    if (lockToken) storeLock();
  }

  function openEmailModal(edit) {
    openBookingModal({ step: 'email', edit: !!edit });
  }

  function closeEmailModal() {
    modalVisible = false;
    const modal = $('booking-email-modal');
    const main = $('booking-main');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('hidden', '');
    }
    resetBookingModalSteps();
    if (main) main.removeAttribute('inert');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onModalEscape, true);
    if (lastFocusBeforeModal && typeof lastFocusBeforeModal.focus === 'function') {
      try {
        lastFocusBeforeModal.focus();
      } catch (_) {}
    }
    lastFocusBeforeModal = null;
  }

  function onModalEscape(e) {
    if (e.key !== 'Escape') return;
    if (!isEmailModalOpen()) return;
    e.preventDefault();
    revokeSlot();
  }

  async function extendLockWithEmail(email) {
    const res = await fetch(`/api/slots/${lockedSlotId}/extend-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockToken, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: userMessage(data.error) || 'Nepodarilo sa pokračovať.' };
    }
    if (data.expiresAt) expiresAt = data.expiresAt;
    lockedEmail = email;
    lockPhase = 'payment';
    storeLock();
    return { ok: true, billingPrefill: data.billingPrefill || null };
  }

  const FETCH_SLOTS_TIMEOUT_MS = 15000;

  async function fetchSlots(from, to, token = null, externalSignal = null) {
    let url = `/api/slots?from=${from}&to=${to}`;
    if (token) url += `&lockToken=${encodeURIComponent(token)}`;
    try {
      let cs = null;
      try {
        cs = localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
      } catch (_) {}
      if (cs == null) {
        try {
          cs = sessionStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
          if (cs != null) {
            try {
              localStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, cs);
            } catch (_) {}
            try {
              sessionStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
            } catch (_) {}
          }
        } catch (_) {}
      }
      if (cs && cs.startsWith('cs_')) {
        url += `&stripeSessionId=${encodeURIComponent(cs)}`;
      }
    } catch (e) {
      logStorageError('fetchSlots: checkout id read', e);
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), FETCH_SLOTS_TIMEOUT_MS);
    const onExternalAbort = () => {
      clearTimeout(tid);
      ctrl.abort();
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(tid);
        throw new DOMException('Aborted', 'AbortError');
      }
      externalSignal.addEventListener('abort', onExternalAbort);
    }
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API_ERROR');
      return data;
    } catch (e) {
      clearTimeout(tid);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      throw e;
    }
  }

  function mapSlotUi(slot) {
    if (!slot) {
      return { label: 'Nedostupné', disabled: true, busy: false, state: 'missing', primary: false };
    }
    if (slot.status !== 'open') {
      return { label: 'Obsadené', disabled: true, busy: false, state: 'confirmed-other', primary: false };
    }
    if (slot.isReserved) {
      return { label: 'Obsadené', disabled: true, busy: false, state: 'confirmed-other', primary: false };
    }
    if (slot.isLocked && !slot.isMyLock) {
      return { label: 'Práve držané', disabled: true, busy: false, state: 'locked-other', primary: false };
    }
    if (slot.isMyLock) {
      return { label: 'Tvoj výber', disabled: true, busy: false, state: 'locked-me', primary: true };
    }
    if (pendingSlotId === slot.id) {
      const dayPart = slot.localDate ? formatDayTitleFromDateStr(slot.localDate) : '';
      const t = slot.timeKey || '';
      const desc = dayPart && t ? `Vybraný termín: ${dayPart}, ${t}` : 'Vybraný termín…';
      return { label: desc, disabled: true, busy: true, state: 'pending', primary: false };
    }
    if (lockToken) {
      return { label: '', disabled: true, busy: false, state: 'free', primary: false };
    }
    return { label: '', disabled: false, busy: false, state: 'free', primary: true };
  }

  /** Day row is shown if the user can act here (bookable free slot, pending choice, or their hold). */
  function dayShouldAppearInCalendar(rows) {
    for (const { slot } of rows) {
      if (!slot) continue;
      const ui = mapSlotUi(slot);
      if (ui.state === 'pending' || ui.state === 'locked-me') return true;
      if (ui.state === 'free' && ui.primary && !ui.disabled && !ui.busy) return true;
    }
    return false;
  }

  /**
   * @param {object|null} slot
   * @param {string} timeLineFirst — visible line: time (same for grid and hero)
   * @param {{ nearest?: boolean, heroSubLine?: string }} [opts] — hero shows heroSubLine under time; grid does not
   */
  const SLOT_ACTION_HINT = 'Začať rezerváciu';

  function buildSlotButtonHtml(slot, timeLineFirst, opts) {
    const nearest = !!(opts && opts.nearest);
    const heroSubLine = opts && opts.heroSubLine;
    const ui = mapSlotUi(slot);
    const cls = ['booking-slot'];
    if (nearest) cls.push('booking-slot--nearest');
    if (ui.disabled || ui.busy) cls.push('booking-slot--disabled');
    if (ui.state === 'locked-me') cls.push('booking-slot--locked-me');
    if (ui.state === 'missing') cls.push('booking-slot--missing');
    if (ui.state === 'pending') cls.push('booking-slot--pending');
    if (ui.primary && ui.state === 'free') cls.push('booking-slot--primary');
    const ariaBusy = ui.busy ? ' aria-busy="true"' : '';
    const idAttr = slot ? ` data-slot-id="${slot.id}"` : '';
    const showTitle =
      ui.state === 'free' && ui.primary && !ui.disabled && !ui.busy && !lockToken;
    const titleAttr = showTitle ? ` title="${escapeAttr(SLOT_ACTION_HINT)}"` : '';

    if (ui.state === 'pending' && ui.label) {
      const ariaAttr = ` aria-label="${escapeAttr(ui.label)}"`;
      return `<button type="button" class="${cls.join(
        ' '
      )}"${idAttr} data-state="${ui.state}" disabled${ariaBusy}${ariaAttr}>
            <span class="booking-slot__time booking-slot__pending-text">${ui.label}</span>
          </button>`;
    }

    let secondLine = '';
    if (nearest && heroSubLine && ui.state === 'free' && ui.primary) {
      secondLine = `<span class="booking-slot__label--meta">${heroSubLine}</span>`;
    }
    let ariaLabel = null;
    if (!(nearest && heroSubLine && ui.state === 'free' && ui.primary) && ui.label) {
      ariaLabel = `${timeLineFirst} — ${ui.label}`;
    }
    const ariaAttr = ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : '';
    return `<button type="button" class="${cls.join(
      ' '
    )}"${idAttr} data-state="${ui.state}"${ui.disabled || ui.busy ? ' disabled' : ''}${ariaBusy}${titleAttr}${ariaAttr}>
            <span class="booking-slot__time">${timeLineFirst}</span>${secondLine}
          </button>`;
  }

  function buildFunnelDays() {
    const filtered = (slotsRaw || []).filter(passesFunnelSlotRules);
    const byDate = groupSlotsByLocalDate(filtered);
    const sortedDates = Object.keys(byDate).sort();
    const capped = sortedDates.slice(0, MAX_FUNNEL_DAYS);
    return capped
      .map((dateStr) => {
        const daySlots = byDate[dateStr] || [];
        const rows = gridTimes.map((timeKey, gridIndex) => ({
          timeKey,
          slot: daySlots.find((s) => s.gridIndex === gridIndex) || null,
        }));
        return { dateStr, rows };
      })
      .filter((day) => dayShouldAppearInCalendar(day.rows));
  }

  function findFirstFreeSlotId() {
    const days = buildFunnelDays();
    for (const { rows } of days) {
      for (const { slot } of rows) {
        if (!slot) continue;
        const ui = mapSlotUi(slot);
        if (ui.state === 'free' && ui.primary && !ui.disabled) return slot.id;
      }
    }
    return null;
  }

  /**
   * Updates `minifiedEverShownDates` and returns ordered date keys for the collapsed main column.
   */
  function minifiedMainDateOrder(eligibleOrdered) {
    if (eligibleOrdered.length === 0) return [];

    if (minifiedEverShownDates.size === 0) {
      const n = Math.min(INITIAL_VISIBLE_FUNNEL_DAYS, eligibleOrdered.length);
      for (let i = 0; i < n; i++) minifiedEverShownDates.add(eligibleOrdered[i]);
    }

    let main = eligibleOrdered.filter((d) => minifiedEverShownDates.has(d));

    while (main.length < INITIAL_VISIBLE_FUNNEL_DAYS) {
      const next = eligibleOrdered.find((d) => !minifiedEverShownDates.has(d));
      if (!next) break;
      minifiedEverShownDates.add(next);
      main = eligibleOrdered.filter((d) => minifiedEverShownDates.has(d));
    }

    return main;
  }

  function syncCalendarDaysExpandUi() {
    const root = $('booking-calendar-days');
    if (!root) return;
    const wrap = root.querySelector('.booking-calendar__days-more');
    const inner = root.querySelector('.booking-calendar__days-more-inner');
    const btn = root.querySelector('[data-booking-days-toggle]');
    if (!btn) return;
    const open = calendarDaysExpanded;
    if (wrap && inner) {
      wrap.classList.toggle('booking-calendar__days-more--open', open);
      btn.textContent = open ? 'Zobraziť menej' : 'Pozrieť ďalšie termíny';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) inner.removeAttribute('inert');
      else inner.setAttribute('inert', '');
    } else {
      btn.textContent = 'Zobraziť menej';
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  function renderCalendar() {
    const inner = $('booking-calendar-inner');
    const loading = $('booking-calendar-loading');
    const empty = $('booking-slots-empty');
    const hero = $('booking-calendar-hero');
    const heroSlotHost = $('booking-hero-slot-host');
    const daysEl = $('booking-calendar-days');

    if (!inner || !daysEl) return;

    const days = buildFunnelDays();

    if (loading) loading.hidden = true;

    if (days.length === 0) {
      inner.hidden = true;
      if (empty) empty.hidden = false;
      if (hero) hero.hidden = true;
      if (heroSlotHost) heroSlotHost.innerHTML = '';
      daysEl.innerHTML = '';
      calendarDaysExpanded = false;
      minifiedEverShownDates = new Set();
      calendarLastLayoutSig = '';
      if (calendarReflowTimer) {
        clearTimeout(calendarReflowTimer);
        calendarReflowTimer = null;
      }
      daysEl.classList.remove('booking-calendar__days--reflowing');
      return;
    }

    if (empty) empty.hidden = true;
    inner.hidden = false;

    const pendingBanner = $('booking-slot-pending');
    if (pendingBanner) {
      if (pendingSlotId) {
        const ps = slotsRaw.find((x) => x.id === pendingSlotId);
        if (ps) {
          const dayPart = ps.localDate ? formatDayTitleFromDateStr(ps.localDate) : '';
          const t = ps.timeKey || '';
          pendingBanner.textContent =
            dayPart && t ? `Vybraný termín: ${dayPart}, ${t}` : 'Vybraný termín…';
          pendingBanner.hidden = false;
        } else {
          pendingBanner.hidden = true;
        }
      } else {
        pendingBanner.hidden = true;
      }
    }

    const firstFreeId = findFirstFreeSlotId();
    if (hero && heroSlotHost) {
      if (pendingSlotId) {
        hero.hidden = true;
        heroSlotHost.innerHTML = '';
      } else if (firstFreeId != null) {
        const slot = slotsRaw.find((s) => s.id === firstFreeId);
        if (slot) {
          hero.hidden = false;
          const time = slot.timeKey || '';
          const heroSubLine = formatDayTitleFromDateStr(slot.localDate);
          heroSlotHost.innerHTML = buildSlotButtonHtml(slot, time, { nearest: true, heroSubLine });
        } else {
          hero.hidden = true;
          heroSlotHost.innerHTML = '';
        }
      } else {
        hero.hidden = true;
        heroSlotHost.innerHTML = '';
      }
    }

    const articles = [];
    for (const { dateStr, rows } of days) {
      const firstSlot = rows.find((r) => r.slot)?.slot;
      const title = firstSlot
        ? formatDayTitleFromDateStr(firstSlot.localDate)
        : formatDayTitleFromDateStr(dateStr);
      const hint = relativeDayHint(dateStr);
      const hintHtml = hint ? ` <span class="booking-day__hint">${hint}</span>` : '';

      const buttons = rows
        .map(({ timeKey, slot: s }) => buildSlotButtonHtml(s, timeKey))
        .join('');

      articles.push(`
        <article class="booking-day" data-date="${dateStr}">
          <header class="booking-day__header">
            <span class="booking-day__title">${title}</span>${hintHtml}
          </header>
          <div class="booking-day__slots" role="group" aria-label="Časy pre ${dateStr}">
            ${buttons}
          </div>
        </article>
      `);
    }

    const expandRowOpen = `<p class="booking-calendar__expand-row"><button type="button" class="booking-calendar__expand-btn" data-booking-days-toggle aria-expanded="true">Zobraziť menej</button></p>`;
    const expandRowClosed = `<p class="booking-calendar__expand-row"><button type="button" class="booking-calendar__expand-btn" data-booking-days-toggle aria-expanded="false">Pozrieť ďalšie termíny</button></p>`;

    const eligibleOrdered = days.map((d) => d.dateStr);
    const articleByDate = new Map(days.map((d, i) => [d.dateStr, articles[i]]));

    if (calendarReflowTimer) {
      clearTimeout(calendarReflowTimer);
      calendarReflowTimer = null;
    }
    /* Dropping pointer-events:none when aborting a reflow timer; same-HTML skips scheduling a new clear. */
    daysEl.classList.remove('booking-calendar__days--reflowing');

    let nextInnerHtml;
    let nextLayoutSig;
    if (calendarDaysExpanded) {
      nextLayoutSig = `E:${eligibleOrdered.join('|')}`;
      nextInnerHtml = `${articles.join('')}${expandRowOpen}`;
    } else {
      const mainOrder = minifiedMainDateOrder(eligibleOrdered);
      const mainSet = new Set(mainOrder);
      const extraDates = eligibleOrdered.filter((d) => !mainSet.has(d));
      const visibleArticles = mainOrder.map((ds) => articleByDate.get(ds));
      const extraArticles = extraDates.map((ds) => articleByDate.get(ds));

      if (extraArticles.length === 0) {
        calendarDaysExpanded = false;
        nextLayoutSig = `C0:${mainOrder.join('|')}`;
        nextInnerHtml = visibleArticles.join('');
      } else {
        nextLayoutSig = `C1:${mainOrder.join('|')}>>${extraDates.join('|')}`;
        nextInnerHtml = `${visibleArticles.join(
          ''
        )}<div class="booking-calendar__days-more"><div class="booking-calendar__days-more-inner">${extraArticles.join(
          ''
        )}</div></div>${expandRowClosed}`;
      }
    }

    const layoutStructureChanged =
      calendarLastLayoutSig !== '' && calendarLastLayoutSig !== nextLayoutSig;
    calendarLastLayoutSig = nextLayoutSig;
    daysEl.innerHTML = nextInnerHtml;

    if (layoutStructureChanged) {
      daysEl.classList.add('booking-calendar__days--reflowing');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          daysEl.querySelectorAll('.booking-day').forEach((el) => {
            el.classList.remove('booking-day--flash');
            void el.offsetWidth;
            el.classList.add('booking-day--flash');
          });
        });
      });
      calendarReflowTimer = setTimeout(() => {
        daysEl.classList.remove('booking-calendar__days--reflowing');
        daysEl.querySelectorAll('.booking-day--flash').forEach((el) => el.classList.remove('booking-day--flash'));
        calendarReflowTimer = null;
      }, 1600);
    }

    syncCalendarDaysExpandUi();
  }

  function hideGlobalError() {
    const err = $('booking-slots-error');
    if (err) err.hidden = true;
  }

  function showGlobalError(msg) {
    const err = $('booking-slots-error');
    if (err) {
      err.textContent = msg || 'Termíny nie sú dostupné';
      err.hidden = false;
    }
    const loading = $('booking-calendar-loading');
    if (loading) loading.hidden = true;
  }

  let loadAbortController = null;

  /**
   * After GET /api/slots: drop stale client locks and align expiresAt with server (fixes refresh / clock skew).
   * If the locked slot is missing from this response, keep the client lock — the list query can omit
   * rows (e.g. 24h window) while the lock row still exists; clearing here made reload drop stored lock.
   */
  function syncLockStateWithSlots() {
    if (!lockToken || lockedSlotId == null) return;
    if (!slotsRaw || slotsRaw.length === 0) return;
    const slot = slotsRaw.find(
      (s) => s.id === lockedSlotId || String(s.id) === String(lockedSlotId)
    );
    if (!slot) return;
    if (!slot.isMyLock) {
      clearLockClientState();
      return;
    }
    if (slot.lockExpiresAt) {
      expiresAt = slot.lockExpiresAt;
      storeLock();
      if (countdownInterval) updateCountdown();
    }
    if (isEmailModalOpen()) updateBookingModalSelectedSlotDisplay();
  }

  async function loadSlots(options) {
    const silent = !!(options && options.silent);
    const from = getTodayLocal();
    const to = getMaxDate();

    const loadingEl = $('booking-calendar-loading');
    const innerEl = $('booking-calendar-inner');

    if (!silent && loadingEl && innerEl) {
      loadingEl.hidden = false;
      innerEl.hidden = true;
    }

    if (loadAbortController) loadAbortController.abort();
    loadAbortController = new AbortController();
    const signal = loadAbortController.signal;
    const mySeq = ++loadSeq;

    if (!silent) {
      const emptyEl = $('booking-slots-empty');
      if (emptyEl) emptyEl.hidden = true;
      hideGlobalError();
    }

    try {
      dbg('loadSlots fetch', { from, to, hasLock: !!lockToken, silent });
      const data = await fetchSlots(from, to, lockToken, signal);
      if (signal.aborted || mySeq !== loadSeq) return;
      hideGlobalError();
      if (data.grid && Array.isArray(data.grid.times) && data.grid.times.length > 0) {
        gridTimes = data.grid.times;
      }
      slotsRaw = data.slots || [];
      syncLockStateWithSlots();
      renderCalendar();
      if (lockToken && isEmailModalOpen()) updateBookingModalSelectedSlotDisplay();
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) return;
      if (mySeq !== loadSeq) return;
      if (!silent) {
        slotsRaw = [];
        if (innerEl) innerEl.hidden = true;
        if (loadingEl) loadingEl.hidden = true;
        showGlobalError('Termíny nie sú dostupné');
      }
    } finally {
      if (!signal.aborted && mySeq === loadSeq && loadingEl && !silent) {
        loadingEl.hidden = true;
      }
    }
  }

  function clearLockClientState() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    lockToken = null;
    expiresAt = null;
    lockedSlotId = null;
    lockedEmail = '';
    lockPhase = 'email';
    modalVisible = true;
    modalUiStep = 'email';
    modalEmailEdit = false;
    pendingPaymentFormRestore = null;
    pendingBillingRestore = null;
    if (billingPersistTimer) {
      clearTimeout(billingPersistTimer);
      billingPersistTimer = null;
    }
    clearStoredLock();
    clearCheckoutSessionStorage();
    closeEmailModal();
    const hold = $('booking-hold-banner');
    if (hold) hold.hidden = true;
    // Clears are visible to other tabs via the `storage` event on removeItem — no BroadcastChannel needed.
  }

  /** Sync modal + lock from localStorage after another tab updated it (`storage` or BroadcastChannel). */
  function applyBookingStateFromOtherTabs() {
    const inner = $('booking-calendar-inner');
    if (!inner) return;

    const stored = getStoredLock();
    if (!stored) {
      if (!lockToken && !isEmailModalOpen()) return;
      suppressCrossTabApply++;
      try {
        clearLockClientState();
      } finally {
        suppressCrossTabApply--;
      }
      void loadSlots({ silent: true });
      return;
    }

    applyMemoryFromStoredLockPayload(stored);
    suppressCrossTabApply++;
    try {
      ensureBookingModalPortaledToBody();
      showRestoredLockUiIfNeeded();
    } finally {
      suppressCrossTabApply--;
    }
    void loadSlots({ silent: true });
  }

  function registerCrossTabSync() {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || e.storageArea !== localStorage) return;
      dbg('cross-tab storage', { key: e.key });
      applyBookingStateFromOtherTabs();
    });
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      bookingCrossTabChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bookingCrossTabChannel.onmessage = (e) => {
        if (e.data && e.data.tabId === BOOKING_TAB_BROADCAST_ID) return;
        dbg('cross-tab BroadcastChannel message');
        applyBookingStateFromOtherTabs();
      };
    } catch (e) {
      logStorageError('registerCrossTabSync: BroadcastChannel', e);
    }
  }

  /** Beyond this, the hold is tied to Stripe checkout (far-future server expiry) — show copy instead of a minute timer. */
  const COUNTDOWN_LONG_HOLD_THRESHOLD_SEC = 48 * 3600;

  function updateCountdown() {
    if (!expiresAt) return;
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    if (Number.isNaN(exp)) return;
    const rem = Math.max(0, Math.floor((exp - now) / 1000));
    const modalCnt = $('booking-modal-countdown');
    const countEl = $('booking-countdown');
    if (rem > COUNTDOWN_LONG_HOLD_THRESHOLD_SEC) {
      if (modalCnt) {
        modalCnt.textContent =
          'Po dokončení platby v Stripe bude rezervácia potvrdená. Termín medzitým držíme pre vás.';
      }
      if (countEl) countEl.textContent = '…';
      return;
    }
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (modalCnt) modalCnt.textContent = `Termín držíme ešte: ${text}`;
    if (countEl) countEl.textContent = text;
    if (rem <= 0) {
      clearLockClientState();
      loadSlots();
    }
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  }

  async function revokeSlot() {
    if (!lockToken || !lockedSlotId) return;
    const token = lockToken;
    const slotId = lockedSlotId;
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, lockToken: token }),
      });
      await res.json().catch(() => ({}));
      if (res.ok) {
        clearLockClientState();
        loadSlots();
        return;
      }
      if (res.status === 400 || res.status === 404) {
        clearLockClientState();
        loadSlots();
      }
    } catch (_) {
      clearLockClientState();
      loadSlots();
    }
  }

  async function lockSlot(slotId) {
    pendingSlotId = slotId;
    renderCalendar();

    try {
      const chRes = await fetch(`/api/slots/${slotId}/lock-challenge`, { method: 'GET' });
      const chData = await chRes.json().catch(() => ({}));
      if (!chRes.ok) {
        pendingSlotId = null;
        await loadSlots();
        showGlobalError(userMessage(chData.error) || 'Termíny nie sú dostupné');
        return;
      }
      const challengeToken =
        typeof chData.challengeToken === 'string' ? chData.challengeToken.trim() : '';
      if (!challengeToken) {
        pendingSlotId = null;
        await loadSlots();
        showGlobalError('Termíny nie sú dostupné');
        return;
      }

      const lockBody = { email: null, challengeToken };
      let res = await fetch(`/api/slots/${slotId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lockBody),
      });
      let data = await res.json();

      if (res.status === 403 && data.error === 'captcha_required') {
        let cap;
        try {
          cap = await getRecaptchaToken('lock_slot');
        } catch (_) {
          pendingSlotId = null;
          await loadSlots();
          showGlobalError('Overenie bezpečnosti zlyhalo. Skús znova.');
          return;
        }
        if (!cap) {
          pendingSlotId = null;
          await loadSlots();
          showGlobalError(userMessage('INTERNAL_ERROR'));
          return;
        }
        lockBody.captchaToken = cap;
        res = await fetch(`/api/slots/${slotId}/lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lockBody),
        });
        data = await res.json();
      }

      if (!res.ok) {
        pendingSlotId = null;
        await loadSlots();
        if (res.status === 409 && data.details?.retryAfterSeconds) {
          const min = Math.ceil(data.details.retryAfterSeconds / 60);
          showGlobalError(`Termín je práve podržaný. Skús znova o ${min} min.`);
        } else {
          showGlobalError(userMessage(data.error));
        }
        return;
      }

      clearCheckoutSessionStorage();
      lockToken = data.lockToken;
      expiresAt = data.expiresAt;
      lockedSlotId = data.slotId;
      lockedEmail = '';
      lockPhase = 'email';
      pendingSlotId = null;
      storeLock();

      const emailInput = $('booking-email');
      const emailErr = $('booking-email-error');
      if (emailInput) emailInput.value = '';
      if (emailErr) emailErr.hidden = true;
      const hold = $('booking-hold-banner');
      if (hold) hold.hidden = true;
      openEmailModal(false);
      startCountdown();
      loadSlots();
    } catch (e) {
      pendingSlotId = null;
      await loadSlots();
      showGlobalError('Termíny nie sú dostupné');
    }
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  function setCompanyFieldsVisible(visible) {
    const wrap = $('booking-company-fields');
    if (!wrap) return;
    wrap.hidden = !visible;
  }

  function applyBillingPrefill(prefill) {
    if (!prefill || typeof prefill !== 'object') return;
    const map = [
      ['booking-billing-name', prefill.billingName || ''],
      ['booking-billing-company-name', prefill.billingCompanyName || ''],
      ['booking-billing-ico', prefill.billingIco || ''],
      ['booking-billing-dic', prefill.billingDic || ''],
      ['booking-billing-ic-dph', prefill.billingIcDph || ''],
      ['booking-billing-street', prefill.billingStreet || ''],
      ['booking-billing-city', prefill.billingCity || ''],
      ['booking-billing-post-code', prefill.billingPostCode || ''],
      ['booking-billing-country', prefill.billingCountry || 'SK'],
    ];
    map.forEach(([id, value]) => {
      const el = $(id);
      if (el) el.value = value;
    });
    const toggle = $('booking-billing-is-company');
    const company = !!prefill.billingIsCompany;
    if (toggle) toggle.checked = company;
    setCompanyFieldsVisible(company);
  }

  function readBillingForm() {
    return {
      billingName: ($('booking-billing-name')?.value || '').trim(),
      billingIsCompany: !!$('booking-billing-is-company')?.checked,
      billingCompanyName: ($('booking-billing-company-name')?.value || '').trim(),
      billingIco: ($('booking-billing-ico')?.value || '').trim(),
      billingDic: ($('booking-billing-dic')?.value || '').trim(),
      billingIcDph: ($('booking-billing-ic-dph')?.value || '').trim(),
      billingStreet: ($('booking-billing-street')?.value || '').trim(),
      billingCity: ($('booking-billing-city')?.value || '').trim(),
      billingPostCode: ($('booking-billing-post-code')?.value || '').trim(),
      billingCountry: (($('booking-billing-country')?.value || 'SK').trim() || 'SK').toUpperCase(),
    };
  }

  function validateBillingForm(billing) {
    if (!billing.billingName) return 'Vyplň prosím meno a priezvisko.';
    if (!billing.billingIsCompany) return null;
    if (!billing.billingCompanyName || !billing.billingStreet || !billing.billingCity || !billing.billingPostCode) {
      return 'Vyplň prosím všetky povinné firemné údaje.';
    }
    if (!/^\d{8}$/.test(billing.billingIco || '')) {
      return 'IČO musí mať presne 8 číslic.';
    }
    return null;
  }

  function showPaymentChoice() {
    modalVisible = true;
    modalUiStep = 'payment';
    modalEmailEdit = false;
    const modal = $('booking-email-modal');
    if (!modal || modal.hidden) {
      openBookingModal({ step: 'payment' });
    } else {
      setBookingModalStep('payment');
      configureBookingModal('payment');
      resetPaymentPathStep();
    }
    const hold = $('booking-hold-banner');
    if (hold) hold.hidden = true;
    const payErr = $('booking-payment-error');
    if (payErr) payErr.hidden = true;
    updateCountdown();
    const firstPay = $('payment-deposit');
    if (firstPay) requestAnimationFrame(() => firstPay.focus());
    updatePaymentSubmitButtonLabel();
    if (lockToken) storeLock();
  }

  async function showEmailForm() {
    if (lockToken && lockedSlotId != null) {
      try {
        const r = await fetch(`/api/slots/${lockedSlotId}/lock-for-email-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lockToken }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.expiresAt) {
          expiresAt = data.expiresAt;
          storeLock();
          updateCountdown();
        }
      } catch (_) {}
    }
    modalVisible = true;
    modalUiStep = 'email';
    modalEmailEdit = true;
    const hold = $('booking-hold-banner');
    if (hold) hold.hidden = true;
    const emailInput = $('booking-email');
    if (emailInput && lockedEmail) emailInput.value = lockedEmail;
    if (!isEmailModalOpen()) {
      openBookingModal({ step: 'email', edit: true });
    } else {
      setBookingModalStep('email');
      configureBookingModal('email-edit');
      const nameInput = $('booking-billing-name');
      if (nameInput) requestAnimationFrame(() => nameInput.focus());
    }
    if (lockToken) storeLock();
    broadcastBookingLockToOtherTabs();
  }

  /** @returns {{ paymentType: 'deposit', amount: null } | { paymentType: 'full', amount: number } | null} */
  function getPaymentChoice() {
    const path = document.querySelector('input[name="paymentPath"]:checked')?.value;
    if (!path) return null;
    if (path === 'deposit') return { paymentType: 'deposit', amount: null };
    const { fullPaymentCheckoutEur } = readCheckoutAmountsFromBookingSection();
    return { paymentType: 'full', amount: fullPaymentCheckoutEur };
  }

  const PAYMENT_SUBMIT_PREFIX = 'Pokračovať k platbe';

  function updatePaymentSubmitButtonLabel() {
    const submitBtn = $('booking-payment-submit');
    if (!submitBtn) return;
    const choice = getPaymentChoice();
    const { reservationDepositEur, fullPaymentCheckoutEur } = readCheckoutAmountsFromBookingSection();
    if (!choice) {
      submitBtn.textContent = PAYMENT_SUBMIT_PREFIX;
      return;
    }
    if (choice.paymentType === 'deposit') {
      submitBtn.textContent = `${PAYMENT_SUBMIT_PREFIX} ${reservationDepositEur} €`;
      return;
    }
    submitBtn.textContent = `${PAYMENT_SUBMIT_PREFIX} ${fullPaymentCheckoutEur} €`;
  }

  /**
   * @param {{ slotId: number, lockToken: string, email: string, paymentType: string, amount: number|null }} params
   */
  async function startPayment({ slotId, lockToken, email, paymentType, amount, billing }) {
    const funnelCtx = readFunnelContext();
    let returnPath = (window.location.pathname || '').replace(/\/$/, '');
    if (returnPath === '') returnPath = '/';
    if (funnelCtx.funnelName === 'site') {
      returnPath = '/site';
    } else if (returnPath === '/') {
      returnPath = '/pilot';
    }
    const cancelReturn =
      (window.location.pathname || '/') +
      (window.location.search || '') +
      (window.location.hash || '');
    const payBody = { slotId, lockToken, email, paymentType, returnPath, cancelReturn, ...billing };
    if (paymentType === 'full') payBody.amount = amount;
    if (funnelCtx.funnelName) {
      payBody.funnelName = funnelCtx.funnelName;
      payBody.funnelCampaign = funnelCtx.funnelCampaign || 'default';
      if (funnelCtx.funnelVideoId) payBody.funnelVideoId = funnelCtx.funnelVideoId;
    }

    let payRes = await fetch('/api/payments/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payBody),
    });
    let payData = await payRes.json();

    if (payRes.status === 403 && payData.error === 'captcha_required') {
      let cap;
      try {
        cap = await getRecaptchaToken('payment_start');
      } catch (_) {
        return { ok: false, error: 'Overenie bezpečnosti zlyhalo. Skús znova.' };
      }
      if (!cap) {
        return { ok: false, error: userMessage('INTERNAL_ERROR') };
      }
      payBody.captchaToken = cap;
      payRes = await fetch('/api/payments/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payBody),
      });
      payData = await payRes.json();
    }

    if (!payRes.ok) {
      return { ok: false, error: userMessage(payData.error) || 'Platba sa nepodarila spustiť. Skús znova.' };
    }
    if (!payData.url) {
      return { ok: false, error: 'Platba sa nepodarila spustiť. Skús znova.' };
    }
    return {
      ok: true,
      url: payData.url,
      lockExpiresAt: payData.lockExpiresAt || null,
      checkoutSessionId: typeof payData.checkoutSessionId === 'string' ? payData.checkoutSessionId : null,
    };
  }

  function showPaymentFailure(message) {
    const hold = $('booking-hold-banner');
    const success = $('booking-success');
    const pending = $('booking-success-pending');
    const failed = $('booking-success-failed');
    const retry = $('booking-payment-retry');
    closeEmailModal();
    if (hold) hold.hidden = true;
    if (success) success.hidden = false;
    if (pending) pending.hidden = true;
    if (failed) {
      failed.textContent = message;
      failed.hidden = false;
    }
    if (retry) retry.hidden = false;
  }

  async function submitReservation(email, paymentType, amount, billing) {
    const submitBtn = $('booking-payment-submit');
    if (submitBtn) submitBtn.disabled = true;
    const payErr = $('booking-payment-error');
    if (payErr) payErr.hidden = true;
    const pathVal = $('booking-payment-path-validation');
    if (pathVal) pathVal.hidden = true;

    try {
      const hold = $('booking-hold-banner');
      const success = $('booking-success');
      const successPending = $('booking-success-pending');
      const successFailed = $('booking-success-failed');
      const payRetry = $('booking-payment-retry');
      if (hold) hold.hidden = true;
      if (payErr) payErr.hidden = true;
      if (success) success.hidden = false;
      if (successPending) {
        successPending.hidden = false;
        successPending.textContent = 'Presmerovávam na platbu…';
      }
      if (successFailed) successFailed.hidden = true;
      if (payRetry) payRetry.hidden = true;

      const result = await startPayment({
        slotId: lockedSlotId,
        lockToken,
        email,
        paymentType,
        amount,
        billing,
      });

      if (result.ok) {
        if (result.lockExpiresAt) {
          expiresAt = result.lockExpiresAt;
          storeLock();
          if (countdownInterval) updateCountdown();
        }
        if (result.checkoutSessionId) {
          try {
            localStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, result.checkoutSessionId);
          } catch (e) {
            logStorageError('startPayment: checkout session id', e);
          }
        }
        try {
          sessionStorage.setItem(STRIPE_REDIRECT_FLAG, '1');
        } catch (_) {}
        window.location.href = result.url;
        return;
      }

      showPaymentFailure(result.error);
      window.pendingPaymentRetry = {
        slotId: lockedSlotId,
        lockToken,
        email,
        paymentType,
        amount,
        billing,
      };
      if (submitBtn) submitBtn.disabled = false;
    } catch (e) {
      if (payErr) {
        payErr.textContent = 'Niečo sa pokazilo. Skús neskôr.';
        payErr.hidden = false;
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      loadSlots({ silent: true });
    }, POLL_MS);
  }

  /** Register once before any restored modal opens (capture-phase cancel survives overlays). */
  function registerBookingEventListeners() {
    function tryDismissFromEvent(e) {
      const modal = $('booking-email-modal');
      if (e.target.closest('#booking-revoke-btn')) {
        e.preventDefault();
        revokeSlot();
        return;
      }
      if (e.target.closest('#booking-modal-close') || e.target.closest('#booking-modal-revoke')) {
        if (!modal || modal.hidden) return;
        e.preventDefault();
        revokeSlot();
        return;
      }
      if (e.target.closest('[data-booking-modal-dismiss]')) {
        if (!modal || modal.hidden) return;
        e.preventDefault();
        revokeSlot();
      }
    }

    document.addEventListener('click', tryDismissFromEvent, true);

    const modalHost = $('booking-email-modal');
    if (modalHost) {
      modalHost.addEventListener('click', (e) => {
        if (modalHost.hidden) return;
        if (e.target.closest('[data-booking-modal-dismiss]')) {
          e.preventDefault();
          revokeSlot();
        }
      });
    }

    const calendarInner = $('booking-calendar-inner');
    if (calendarInner) {
      calendarInner.addEventListener('click', (e) => {
        if (e.target.closest('[data-booking-days-toggle]')) {
          e.preventDefault();
          calendarDaysExpanded = !calendarDaysExpanded;
          if (calendarDaysExpanded) minifiedEverShownDates = new Set();
          renderCalendar();
          return;
        }
        const btn = e.target.closest('.booking-slot');
        if (!btn || btn.disabled || !btn.dataset.slotId) return;
        if (lockToken) return;
        lockSlot(Number(btn.dataset.slotId));
      });
    }

    const emailForm = $('booking-email-form');
    if (emailForm) {
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('booking-email').value.trim();
        const billing = readBillingForm();
        if (!validateEmail(email)) {
          const err = $('booking-email-error');
          if (err) {
            err.textContent = 'Zadaj platnú e-mailovú adresu.';
            err.hidden = false;
          }
          return;
        }
        const billingError = validateBillingForm(billing);
        if (billingError) {
          const err = $('booking-email-error');
          if (err) {
            err.textContent = billingError;
            err.hidden = false;
          }
          return;
        }
        const errEl = $('booking-email-error');
        if (errEl) errEl.hidden = true;
        const submitBtn = $('booking-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        const result = await extendLockWithEmail(email);
        if (submitBtn) submitBtn.disabled = false;
        if (!result.ok) {
          if (errEl) {
            errEl.textContent = result.error;
            errEl.hidden = false;
          }
          return;
        }
        if (result.billingPrefill) {
          applyBillingPrefill(result.billingPrefill);
        }
        showPaymentChoice();
      });
    }

    const paymentForm = $('booking-payment-form');
    const paymentBackBtn = $('booking-payment-back');
    if (paymentForm) {
      paymentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('booking-email').value.trim();
        const choice = getPaymentChoice();
        if (!choice) {
          const err = $('booking-payment-error');
          if (err) err.hidden = true;
          const pathVal = $('booking-payment-path-validation');
          if (pathVal) pathVal.hidden = false;
          return;
        }
        const { paymentType, amount } = choice;
        const billing = readBillingForm();
        const billingError = validateBillingForm(billing);
        if (billingError) {
          const err = $('booking-payment-error');
          if (err) {
            err.textContent = billingError;
            err.hidden = false;
          }
          return;
        }
        const { fullPaymentCheckoutEur } = readCheckoutAmountsFromBookingSection();
        if (paymentType === 'full' && amount !== fullPaymentCheckoutEur) {
          const pathVal = $('booking-payment-path-validation');
          if (pathVal) pathVal.hidden = true;
          const err = $('booking-payment-error');
          if (err) {
            err.textContent = `Plná platba pri rezervácii je ${fullPaymentCheckoutEur} €. Skús znova.`;
            err.hidden = false;
          }
          return;
        }
        submitReservation(email, paymentType, amount, billing);
      });
    }

    document.querySelectorAll('input[name="paymentPath"]').forEach((el) => {
      el.addEventListener('change', () => {
        const pathVal = $('booking-payment-path-validation');
        if (pathVal) pathVal.hidden = true;
        updatePaymentSubmitButtonLabel();
        if (lockToken) storeLock();
      });
    });
    if (paymentBackBtn) {
      paymentBackBtn.addEventListener('click', () => {
        void showEmailForm();
      });
    }

    function scheduleBillingSnapshotSave() {
      if (suppressCrossTabApply > 0) return;
      if (!lockToken) return;
      if (billingPersistTimer) clearTimeout(billingPersistTimer);
      billingPersistTimer = setTimeout(() => {
        billingPersistTimer = null;
        storeLock();
      }, 150);
    }

    const companyToggle = $('booking-billing-is-company');
    if (companyToggle) {
      companyToggle.addEventListener('change', () => {
        setCompanyFieldsVisible(!!companyToggle.checked);
        scheduleBillingSnapshotSave();
      });
      setCompanyFieldsVisible(!!companyToggle.checked);
    }

    // Persist all billing fields (except the company toggle which is handled above).
    document
      .querySelectorAll('[id^="booking-billing-"]:not(#booking-billing-is-company)')
      .forEach((el) => {
        if (!el || !(el instanceof HTMLElement)) return;
        const onEdit = () => scheduleBillingSnapshotSave();
        const tag = el.tagName;
        if (tag === 'SELECT') {
          el.addEventListener('change', onEdit);
          return;
        }
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          el.addEventListener('input', onEdit);
          el.addEventListener('change', onEdit);
          el.addEventListener('blur', () => {
            if (billingPersistTimer) {
              clearTimeout(billingPersistTimer);
              billingPersistTimer = null;
            }
            if (lockToken) storeLock();
          });
        } else {
          el.addEventListener('change', onEdit);
        }
      });

    const paymentRetryBtn = $('booking-payment-retry');
    if (paymentRetryBtn) {
      paymentRetryBtn.addEventListener('click', async () => {
        const pending = window.pendingPaymentRetry;
        if (!pending) return;
        paymentRetryBtn.disabled = true;
        const failed = $('booking-success-failed');
        const pend = $('booking-success-pending');
        if (failed) failed.hidden = true;
        if (pend) {
          pend.hidden = false;
          pend.textContent = 'Presmerovávam na platbu…';
        }
        const result = await startPayment({
          slotId: pending.slotId,
          lockToken: pending.lockToken,
          email: pending.email,
          paymentType: pending.paymentType,
          amount: pending.amount,
          billing: pending.billing,
        });
        if (result.ok) {
          if (result.checkoutSessionId) {
            try {
              localStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, result.checkoutSessionId);
            } catch (e) {
              logStorageError('payment retry: checkout session id', e);
            }
          }
          try {
            sessionStorage.setItem(STRIPE_REDIRECT_FLAG, '1');
          } catch (_) {}
          window.location.href = result.url;
          return;
        }
        if (pend) pend.hidden = true;
        if (failed) {
          failed.textContent = result.error;
          failed.hidden = false;
        }
        paymentRetryBtn.disabled = false;
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadSlots({ silent: true });
    });
  }

  function showRestoredLockUiIfNeeded() {
    if (!lockToken) return;
    const emailErr = $('booking-email-error');
    if (emailErr) emailErr.hidden = true;
    const hold = $('booking-hold-banner');

    if (pendingBillingRestore) {
      applyBillingPrefill(pendingBillingRestore);
      pendingBillingRestore = null;
    }

    if (!modalVisible) {
      if (hold) hold.hidden = false;
      updateCountdown();
      startCountdown();
      return;
    }
    if (hold) hold.hidden = true;

    if (lockPhase === 'payment') {
      const emailInput = $('booking-email');
      if (emailInput) {
        const editingEmail =
          isEmailModalOpen() && modalUiStep === 'email' && modalEmailEdit;
        if (!editingEmail) {
          emailInput.value = lockedEmail;
        }
      }
      if (modalUiStep === 'email' && modalEmailEdit) {
        if (!isEmailModalOpen()) {
          openBookingModal({ step: 'email', edit: true });
        } else {
          ensureBookingModalPortaledToBody();
          setBookingModalStep('email');
          configureBookingModal('email-edit');
          const emailIn = $('booking-email');
          if (emailIn && lockedEmail) emailIn.value = lockedEmail;
          const nameIn = $('booking-billing-name');
          if (nameIn) requestAnimationFrame(() => nameIn.focus());
        }
        applyPaymentFormStateToDom(pendingPaymentFormRestore);
        pendingPaymentFormRestore = null;
      } else {
        const alreadyOnPayment =
          isEmailModalOpen() &&
          isBookingPaymentStepVisible() &&
          (modalUiStep === 'payment' || lockPhase === 'payment');
        if (!alreadyOnPayment) openBookingModal({ step: 'payment' });
        applyPaymentFormStateToDom(pendingPaymentFormRestore);
        pendingPaymentFormRestore = null;
        if (!alreadyOnPayment && lockToken) storeLock();
      }
      updateCountdown();
      startCountdown();
      return;
    }
    if (!isEmailModalOpen()) {
      const emailInputOpen = $('booking-email');
      if (emailInputOpen) emailInputOpen.value = '';
      openEmailModal(false);
    }
    updateCountdown();
    startCountdown();
  }

  async function abandonCheckoutIfStripeReturn() {
    try {
      if (sessionStorage.getItem(STRIPE_REDIRECT_FLAG) !== '1') return;
      if (!lockToken || lockedSlotId == null) {
        try {
          sessionStorage.removeItem(STRIPE_REDIRECT_FLAG);
        } catch (_) {}
        return;
      }
      let csId = null;
      try {
        csId = localStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
      } catch (_) {}
      if (!csId || !String(csId).startsWith('cs_')) {
        try {
          sessionStorage.removeItem(STRIPE_REDIRECT_FLAG);
        } catch (_) {}
        return;
      }
      const r = await fetch('/api/payments/abandon-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: lockedSlotId,
          lockToken,
          checkoutSessionId: csId,
        }),
      });
      const data = await r.json().catch(() => ({}));
      clearCheckoutSessionStorage();
      try {
        sessionStorage.removeItem(STRIPE_REDIRECT_FLAG);
      } catch (_) {}
      if (r.ok && data.ok && data.lockExpiresAt) {
        expiresAt = data.lockExpiresAt;
        storeLock();
      }
    } catch (e) {
      console.error('[booking] abandonCheckoutIfStripeReturn', e);
      try {
        clearCheckoutSessionStorage();
      } catch (_) {}
    }
  }

  async function init() {
    dbg('init start', { readyState: document.readyState });
    try {
      const inner = $('booking-calendar-inner');
      if (!inner) {
        dbg('init abort: #booking-calendar-inner missing');
        return;
      }

      ensureBookingModalPortaledToBody();
      registerBookingEventListeners();
      registerCrossTabSync();
      dbg('listeners registered');

      if (location.hash === '#booking') {
        document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', location.pathname + location.search);
      }

      persistFunnelContext(readFunnelContext());

      const storedLock = getStoredLock();
      if (storedLock) {
        applyMemoryFromStoredLockPayload(storedLock);
        dbg('restored session lock', {
          lockedSlotId,
          lockPhase,
          expiresAt,
          modalVisible,
          modalUiStep,
          modalEmailEdit,
        });
      }

      const paymentReturn = parseStripePaymentReturnUrl();
      if (paymentReturn) {
        await completeStripePaymentReturnOnFunnelPage(paymentReturn.sessionId);
      } else {
        await abandonCheckoutIfStripeReturn();
      }

      await loadSlots();
      dbg('loadSlots done', { slots: slotsRaw.length, lockToken: !!lockToken });
      showRestoredLockUiIfNeeded();
      dbg('showRestoredLockUiIfNeeded done', { modalHidden: $('booking-email-modal')?.hidden });
      startPoll();
    } catch (err) {
      console.error('[booking] init failed', err);
    }
  }

  window.__booking = {
    debug: BOOKING_DEBUG,
    getState() {
      const m = $('booking-email-modal');
      return {
        lockToken,
        lockedSlotId,
        expiresAt,
        lockPhase,
        modalVisible,
        modalUiStep,
        modalEmailEdit,
        slotsLen: slotsRaw.length,
        modalHidden: m ? m.hidden : null,
        hasHiddenAttr: m ? m.hasAttribute('hidden') : null,
      };
    },
    revokeSlot,
    clearLockClientState,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
})();
