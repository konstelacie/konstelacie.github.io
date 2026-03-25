(function () {
  'use strict';

  const TIMEZONE = 'Europe/Bratislava';
  const RANGE_DAYS = 21;
  const MAX_FUNNEL_DAYS = 10;
  const POLL_MS = 5000;
  const LEAD_MS = 24 * 60 * 60 * 1000;

  let slotsRaw = [];
  let lockToken = null;
  let expiresAt = null;
  let lockedSlotId = null;
  let countdownInterval = null;
  let pendingSlotId = null;
  let loadSeq = 0;
  let pollTimer = null;

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = 'booking_lock';
  const FUNNEL_CTX_KEY = 'booking_funnel_ctx';

  function readFunnelContext() {
    const section = document.getElementById('booking');
    const fromUrl = new URLSearchParams(location.search).get('campaign');
    const serverName = section?.dataset?.funnelName?.trim() || '';
    const serverCampaign = section?.dataset?.funnelCampaign?.trim() || 'default';
    const serverVideo = section?.dataset?.funnelVideoId?.trim() || '';
    try {
      const stored = JSON.parse(sessionStorage.getItem(FUNNEL_CTX_KEY) || 'null');
      if (section && serverName) {
        if (fromUrl != null && fromUrl !== '') {
          return {
            funnelName: serverName,
            funnelCampaign: fromUrl.trim(),
            funnelVideoId: serverVideo,
          };
        }
        if (stored && stored.funnelName === serverName) {
          return {
            funnelName: serverName,
            funnelCampaign: stored.funnelCampaign || serverCampaign,
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
      sessionStorage.setItem(FUNNEL_CTX_KEY, JSON.stringify(ctx));
    } catch (_) {}
  }

  function localDateFromIso(iso) {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  }

  function storeLock() {
    try {
      let lockedSlotDate = '';
      if (lockedSlotId) {
        const s = slotsRaw.find((x) => x.id === lockedSlotId);
        if (s) lockedSlotDate = localDateFromIso(s.startAt);
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lockToken,
          lockedSlotId,
          expiresAt,
          lockedSlotDate,
        })
      );
    } catch (_) {}
  }

  function clearStoredLock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function getStoredLock() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.lockToken || !data.lockedSlotId || !data.expiresAt) return null;
      if (new Date(data.expiresAt).getTime() <= Date.now()) {
        clearStoredLock();
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
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

  function isWeekdayBratislava(iso) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' }).format(new Date(iso));
    return wd !== 'Sat' && wd !== 'Sun';
  }

  function passesFunnelSlotRules(slot) {
    const start = new Date(slot.startAt).getTime();
    if (start < Date.now() + LEAD_MS) return false;
    if (!isWeekdayBratislava(slot.startAt)) return false;
    return true;
  }

  function groupSlotsByDate(slots) {
    const byDate = {};
    for (const s of slots) {
      const localDate = new Date(s.startAt).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
      if (!byDate[localDate]) byDate[localDate] = [];
      byDate[localDate].push(s);
    }
    return byDate;
  }

  function formatTimeLocal(iso) {
    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  function formatDayTitle(firstSlotIso) {
    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
    }).format(new Date(firstSlotIso));
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
    SLOT_NOT_OPEN: 'Termín nie je dostupný.',
    LOCK_INVALID: 'Vypršal čas podržania. Vyber termín znova.',
    LOCK_EXPIRED: 'Vypršal čas podržania. Vyber termín znova.',
    SLOT_RESERVED: 'Termín je už rezervovaný.',
    SLOT_ALREADY_RESERVED: 'Termín je už rezervovaný.',
    INTERNAL_ERROR: 'Niečo sa pokazilo. Skús neskôr.',
  };

  function userMessage(code) {
    return ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
  }

  async function fetchSlots(from, to, token = null, signal = null) {
    let url = `/api/slots?from=${from}&to=${to}`;
    if (token) url += `&lockToken=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: signal || undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API_ERROR');
    return data;
  }

  function mapSlotUi(slot) {
    if (slot.status !== 'open') {
      return { label: 'Obsadené', disabled: true, busy: false, state: 'confirmed-other', primary: false };
    }
    if (slot.isLocked && !slot.isMyLock) {
      return { label: 'Práve rezervované', disabled: true, busy: false, state: 'locked-other', primary: false };
    }
    if (slot.isMyLock) {
      return { label: 'Tvoj výber', disabled: true, busy: false, state: 'locked-me', primary: true };
    }
    if (pendingSlotId === slot.id) {
      return { label: 'Rezervujem...', disabled: true, busy: true, state: 'pending', primary: false };
    }
    if (lockToken) {
      return { label: 'Voľné', disabled: true, busy: false, state: 'free', primary: false };
    }
    return { label: 'Voľné', disabled: false, busy: false, state: 'free', primary: true };
  }

  function buildFunnelDays() {
    const filtered = (slotsRaw || []).filter(passesFunnelSlotRules);
    const byDate = groupSlotsByDate(filtered);
    const sortedDates = Object.keys(byDate).sort();
    const capped = sortedDates.slice(0, MAX_FUNNEL_DAYS);
    return capped.map((dateStr) => {
      const daySlots = byDate[dateStr].slice().sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
      return { dateStr, slots: daySlots };
    });
  }

  function findFirstFreeSlotId() {
    const days = buildFunnelDays();
    for (const { slots } of days) {
      for (const s of slots) {
        const ui = mapSlotUi(s);
        if (ui.state === 'free' && ui.primary && !ui.disabled) return s.id;
      }
    }
    return null;
  }

  function renderCalendar() {
    const inner = $('booking-calendar-inner');
    const loading = $('booking-calendar-loading');
    const empty = $('booking-slots-empty');
    const hero = $('booking-calendar-hero');
    const heroDt = $('booking-hero-datetime');
    const heroCta = $('booking-hero-cta');
    const daysEl = $('booking-calendar-days');

    if (!inner || !daysEl) return;

    const days = buildFunnelDays();

    if (loading) loading.hidden = true;

    if (days.length === 0) {
      inner.hidden = true;
      if (empty) empty.hidden = false;
      if (hero) hero.hidden = true;
      daysEl.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    inner.hidden = false;

    const firstFreeId = findFirstFreeSlotId();
    if (hero && heroDt && heroCta) {
      if (pendingSlotId) {
        hero.hidden = true;
      } else if (firstFreeId != null) {
        const slot = slotsRaw.find((s) => s.id === firstFreeId);
        if (slot) {
          hero.hidden = false;
          const title = formatDayTitle(slot.startAt);
          const time = formatTimeLocal(slot.startAt);
          heroDt.innerHTML = `<strong>${title} o ${time}</strong>`;
          heroCta.dataset.slotId = String(firstFreeId);
          heroCta.disabled = !!lockToken;
        } else {
          hero.hidden = true;
        }
      } else {
        hero.hidden = true;
      }
    }

    const articles = [];
    for (const { dateStr, slots: daySlots } of days) {
      const title = formatDayTitle(daySlots[0].startAt);
      const hint = relativeDayHint(dateStr);
      const hintHtml = hint ? ` <span class="booking-day__hint">${hint}</span>` : '';

      const buttons = daySlots
        .map((s) => {
          const ui = mapSlotUi(s);
          const time = formatTimeLocal(s.startAt);
          const cls = ['booking-slot'];
          if (ui.disabled || ui.busy) cls.push('booking-slot--disabled');
          if (ui.state === 'locked-me') cls.push('booking-slot--locked-me');
          if (ui.primary && ui.state === 'free') cls.push('booking-slot--primary');
          const ariaBusy = ui.busy ? ' aria-busy="true"' : '';
          return `<button type="button" class="${cls.join(' ')}" data-slot-id="${s.id}" data-state="${ui.state}"${ui.disabled || ui.busy ? ' disabled' : ''}${ariaBusy}>
            <span class="booking-slot__time">${time}</span>
            <span class="booking-slot__label">${ui.label}</span>
          </button>`;
        })
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

    daysEl.innerHTML = articles.join('');
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
      const data = await fetchSlots(from, to, lockToken, signal);
      if (signal.aborted || mySeq !== loadSeq) return;
      hideGlobalError();
      slotsRaw = data.slots || [];
      renderCalendar();
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

  function updateCountdown() {
    if (!expiresAt) return;
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const rem = Math.max(0, Math.floor((exp - now) / 1000));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    const el = $('booking-countdown');
    if (el) el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (rem <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      lockToken = null;
      expiresAt = null;
      lockedSlotId = null;
      clearStoredLock();
      const hold = $('booking-hold-banner');
      const emailForm = $('booking-email-form');
      const payChoice = $('booking-payment-choice');
      if (hold) hold.hidden = true;
      if (emailForm) emailForm.hidden = true;
      if (payChoice) payChoice.hidden = true;
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
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: lockedSlotId, lockToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.revoked) {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        lockToken = null;
        expiresAt = null;
        lockedSlotId = null;
        clearStoredLock();
        const hold = $('booking-hold-banner');
        const emailForm = $('booking-email-form');
        const payChoice = $('booking-payment-choice');
        if (hold) hold.hidden = true;
        if (emailForm) emailForm.hidden = true;
        if (payChoice) payChoice.hidden = true;
        loadSlots();
      }
    } catch (_) {}
  }

  async function lockSlot(slotId) {
    pendingSlotId = slotId;
    renderCalendar();

    try {
      const res = await fetch(`/api/slots/${slotId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: null }),
      });
      const data = await res.json();

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

      lockToken = data.lockToken;
      expiresAt = data.expiresAt;
      lockedSlotId = data.slotId;
      pendingSlotId = null;
      storeLock();

      const hold = $('booking-hold-banner');
      const emailForm = $('booking-email-form');
      const emailInput = $('booking-email');
      const emailErr = $('booking-email-error');
      if (hold) hold.hidden = false;
      if (emailForm) emailForm.hidden = false;
      if (emailInput) emailInput.value = '';
      if (emailErr) emailErr.hidden = true;
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

  function showPaymentChoice() {
    const emailForm = $('booking-email-form');
    const payChoice = $('booking-payment-choice');
    if (emailForm) emailForm.hidden = true;
    if (payChoice) payChoice.hidden = false;
    const payErr = $('booking-payment-error');
    if (payErr) payErr.hidden = true;
  }

  function showEmailForm() {
    const payChoice = $('booking-payment-choice');
    const emailForm = $('booking-email-form');
    if (payChoice) payChoice.hidden = true;
    if (emailForm) emailForm.hidden = false;
  }

  function getPaymentChoice() {
    const path = document.querySelector('input[name="paymentPath"]:checked')?.value;
    if (path === 'deposit') return { paymentType: 'deposit', amount: null };
    const fullAmount = document.querySelector('input[name="fullAmount"]:checked')?.value;
    let amount = 45;
    if (fullAmount === 'custom') {
      const custom = parseInt($('booking-custom-amount').value, 10);
      amount = isNaN(custom) ? 45 : Math.max(45, custom);
    } else if (fullAmount) {
      amount = parseInt(fullAmount, 10) || 45;
    }
    return { paymentType: 'full', amount };
  }

  async function startPayment(reservationId, paymentType, amount) {
    const returnPath = (window.location.pathname || '').replace(/\/$/, '') || '/pilot';
    const payBody = { reservationId, paymentType, returnPath };
    if (paymentType === 'full') payBody.amount = amount;

    const payRes = await fetch('/api/payments/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payBody),
    });
    const payData = await payRes.json();

    if (!payRes.ok) {
      return { ok: false, error: userMessage(payData.error) || 'Platba sa nepodarila spustiť. Skús znova.' };
    }
    if (!payData.url) {
      return { ok: false, error: 'Platba sa nepodarila spustiť. Skús znova.' };
    }
    return { ok: true, url: payData.url };
  }

  function showPaymentFailure(message) {
    const hold = $('booking-hold-banner');
    const emailForm = $('booking-email-form');
    const payChoice = $('booking-payment-choice');
    const success = $('booking-success');
    const pending = $('booking-success-pending');
    const failed = $('booking-success-failed');
    const retry = $('booking-payment-retry');
    if (hold) hold.hidden = true;
    if (emailForm) emailForm.hidden = true;
    if (payChoice) payChoice.hidden = true;
    if (success) success.hidden = false;
    if (pending) pending.hidden = true;
    if (failed) {
      failed.textContent = message;
      failed.hidden = false;
    }
    if (retry) retry.hidden = false;
  }

  async function submitReservation(email, paymentType, amount) {
    const submitBtn = $('booking-payment-submit');
    if (submitBtn) submitBtn.disabled = true;
    const payErr = $('booking-payment-error');
    if (payErr) payErr.hidden = true;

    try {
      const body = { slotId: lockedSlotId, lockToken, email, paymentType };
      if (paymentType === 'full') body.amount = amount;
      const funnelCtx = readFunnelContext();
      if (funnelCtx.funnelName) {
        body.funnelName = funnelCtx.funnelName;
        body.funnelCampaign = funnelCtx.funnelCampaign || 'default';
        if (funnelCtx.funnelVideoId) body.funnelVideoId = funnelCtx.funnelVideoId;
      }
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (payErr) {
          payErr.textContent = userMessage(data.error);
          payErr.hidden = false;
        }
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const reservationId = data.reservation?.id;
      if (!reservationId) {
        if (payErr) {
          payErr.textContent = 'Rezervácia bola vytvorená, ale platba sa nepodarila spustiť.';
          payErr.hidden = false;
        }
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      lockToken = null;
      expiresAt = null;
      lockedSlotId = null;
      clearStoredLock();

      const hold = $('booking-hold-banner');
      const emailForm = $('booking-email-form');
      const payChoice = $('booking-payment-choice');
      const success = $('booking-success');
      const successPending = $('booking-success-pending');
      const successFailed = $('booking-success-failed');
      const payRetry = $('booking-payment-retry');
      if (hold) hold.hidden = true;
      if (emailForm) emailForm.hidden = true;
      if (payChoice) payChoice.hidden = true;
      if (payErr) payErr.hidden = true;
      if (success) success.hidden = false;
      if (successPending) {
        successPending.hidden = false;
        successPending.textContent = 'Presmerovávam na platbu…';
      }
      if (successFailed) successFailed.hidden = true;
      if (payRetry) payRetry.hidden = true;

      const result = await startPayment(reservationId, paymentType, amount);

      if (result.ok) {
        window.location.href = result.url;
        return;
      }

      showPaymentFailure(result.error);
      window.pendingPaymentRetry = { reservationId, paymentType, amount };
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

  function init() {
    const inner = $('booking-calendar-inner');
    if (!inner) return;

    if (location.hash === '#booking') {
      document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', location.pathname + location.search);
    }

    persistFunnelContext(readFunnelContext());

    const storedLock = getStoredLock();
    if (storedLock) {
      lockToken = storedLock.lockToken;
      lockedSlotId = storedLock.lockedSlotId;
      expiresAt = storedLock.expiresAt;
      const hold = $('booking-hold-banner');
      const emailForm = $('booking-email-form');
      const emailInput = $('booking-email');
      const emailErr = $('booking-email-error');
      if (hold) hold.hidden = false;
      if (emailForm) emailForm.hidden = false;
      if (emailInput) emailInput.value = '';
      if (emailErr) emailErr.hidden = true;
      updateCountdown();
      startCountdown();
    }

    const daysEl = $('booking-calendar-days');
    const heroCta = $('booking-hero-cta');
    const revokeBtn = $('booking-revoke-btn');
    const emailForm = $('booking-email-form');

    if (revokeBtn) revokeBtn.addEventListener('click', revokeSlot);

    if (daysEl) {
      daysEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.booking-slot');
        if (!btn || btn.disabled || !btn.dataset.slotId) return;
        if (lockToken) return;
        lockSlot(Number(btn.dataset.slotId));
      });
    }

    if (heroCta) {
      heroCta.addEventListener('click', () => {
        if (heroCta.disabled || lockToken) return;
        const id = heroCta.dataset.slotId;
        if (id) lockSlot(Number(id));
      });
    }

    if (emailForm) {
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('booking-email').value.trim();
        if (!validateEmail(email)) {
          const err = $('booking-email-error');
          if (err) {
            err.textContent = 'Zadaj platnú e-mailovú adresu.';
            err.hidden = false;
          }
          return;
        }
        const errEl = $('booking-email-error');
        if (errEl) errEl.hidden = true;
        showPaymentChoice();
      });
    }

    const paymentForm = $('booking-payment-form');
    const paymentBackBtn = $('booking-payment-back');
    if (paymentForm) {
      paymentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('booking-email').value.trim();
        const { paymentType, amount } = getPaymentChoice();
        if (paymentType === 'full' && amount < 45) {
          const err = $('booking-payment-error');
          if (err) {
            err.textContent = 'Minimálna suma pri plnej platbe je 45 €.';
            err.hidden = false;
          }
          return;
        }
        submitReservation(email, paymentType, amount);
      });
    }
    if (paymentBackBtn) {
      paymentBackBtn.addEventListener('click', showEmailForm);
    }

    const customAmountInput = $('booking-custom-amount');
    if (customAmountInput) {
      customAmountInput.addEventListener('change', () => {
        const customRadio = document.getElementById('full-amount-custom');
        if (customRadio) customRadio.checked = true;
      });
    }

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
        const result = await startPayment(pending.reservationId, pending.paymentType, pending.amount);
        if (result.ok) {
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

    loadSlots();
    startPoll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
