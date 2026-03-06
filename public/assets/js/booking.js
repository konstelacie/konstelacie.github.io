(function () {
  'use strict';

  const TIMEZONE = 'Europe/Bratislava';
  const RANGE_DAYS = 21;

  let selectedDate = null;
  let slotsByDate = {};
  let lockToken = null;
  let expiresAt = null;
  let lockedSlotId = null;
  let countdownInterval = null;

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = 'booking_lock';

  function storeLock() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        lockToken,
        lockedSlotId,
        expiresAt,
        lockedSlotDate: selectedDate,
      }));
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

  function updateDayNavState() {
    const disabled = !!lockToken;
    const prevBtn = $('booking-prev-day');
    const nextBtn = $('booking-next-day');
    const dateInput = $('booking-date');
    if (prevBtn) prevBtn.disabled = disabled;
    if (nextBtn) nextBtn.disabled = disabled;
    if (dateInput) dateInput.disabled = disabled;
  }

  function formatTimeLocal(iso) {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('sk-SK', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  function formatDateForInput(d) {
    return d.toISOString().slice(0, 10);
  }

  function parseQueryFrom() {
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
    return formatDateForInput(new Date());
  }

  function getTodayLocal() {
    const now = new Date();
    return formatDateForInput(new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE })));
  }

  function getMinDate() {
    return getTodayLocal();
  }

  function getMaxDate() {
    const d = new Date();
    d.setDate(d.getDate() + RANGE_DAYS);
    return formatDateForInput(d);
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

  function groupSlotsByDate(slots) {
    const byDate = {};
    for (const s of slots) {
      const localDate = new Date(s.startAt).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
      if (!byDate[localDate]) byDate[localDate] = [];
      byDate[localDate].push(s);
    }
    return byDate;
  }

  function renderSlots(slots) {
    const list = $('booking-slots-list');
    const loading = $('booking-slots-loading');
    const empty = $('booking-slots-empty');
    const err = $('booking-slots-error');
    if (!list || !loading || !empty || !err) return;

    loading.hidden = true;
    err.hidden = true;

    if (!slots || slots.length === 0) {
      list.innerHTML = '';
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = slots
      .map((s) => {
        const timeRange = `${formatTimeLocal(s.startAt)} – ${formatTimeLocal(s.endAt)}`;
        const selectable = s.status === 'open' && !s.isLocked && !lockToken;
        const statusText = s.isMyLock ? 'Podržané pre teba' : s.isLocked ? 'Podržané' : s.status === 'blocked' || s.status === 'cancelled' ? 'Nedostupný' : '';
        return `
          <button type="button" class="booking-slot ${selectable ? '' : 'booking-slot--disabled'}"
            data-slot-id="${s.id}" ${!selectable ? 'disabled' : ''}>
            <span class="booking-slot-time">${timeRange}</span>
            ${statusText ? `<span class="booking-slot-status">${statusText}</span>` : ''}
          </button>
        `;
      })
      .join('');
  }

  function showSlotsError(msg) {
    $('booking-slots-loading').hidden = true;
    $('booking-slots-list').hidden = true;
    $('booking-slots-empty').hidden = true;
    const err = $('booking-slots-error');
    err.textContent = msg || 'Termíny nie sú dostupné';
    err.hidden = false;
  }

  let loadAbortController = null;

  async function loadSlots() {
    const dateEl = $('booking-date');
    const loadingEl = $('booking-slots-loading');
    if (!dateEl || !loadingEl) return;
    const requestedDate = dateEl.value;
    selectedDate = requestedDate;
    const from = dateEl.min;
    const to = getMaxDate();

    if (loadAbortController) loadAbortController.abort();
    loadAbortController = new AbortController();
    const signal = loadAbortController.signal;

    loadingEl.hidden = false;
    const listEl = $('booking-slots-list');
    const emptyEl = $('booking-slots-empty');
    const errEl = $('booking-slots-error');
    if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    if (emptyEl) emptyEl.hidden = true;
    if (errEl) errEl.hidden = true;

    try {
      const data = await fetchSlots(from, to, lockToken, signal);
      if (signal.aborted) return;
      if (dateEl.value !== requestedDate) return;
      slotsByDate = groupSlotsByDate(data.slots || []);
      const daySlots = slotsByDate[requestedDate] || [];
      renderSlots(daySlots);
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) return;
      if (dateEl.value !== requestedDate) return;
      showSlotsError('Termíny nie sú dostupné');
    } finally {
      if (!signal.aborted) loadingEl.hidden = true;
    }
  }

  function updateCountdown() {
    if (!expiresAt) return;
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const rem = Math.max(0, Math.floor((exp - now) / 1000));
    const m = Math.floor(rem / 60);
    const s = rem % 60;
    $('booking-countdown').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (rem <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      lockToken = null;
      expiresAt = null;
      lockedSlotId = null;
      clearStoredLock();
      $('booking-hold-banner').hidden = true;
      $('booking-email-form').hidden = true;
      updateDayNavState();
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
        $('booking-hold-banner').hidden = true;
        $('booking-email-form').hidden = true;
        updateDayNavState();
        loadSlots();
      }
    } catch (_) {}
  }

  async function lockSlot(slotId) {
    const btn = document.querySelector(`[data-slot-id="${slotId}"]`);
    if (btn) btn.disabled = true;

    try {
      const res = await fetch(`/api/slots/${slotId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: null }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.details?.retryAfterSeconds) {
          const min = Math.ceil(data.details.retryAfterSeconds / 60);
          showSlotsError(`Termín je práve podržaný. Skús znova o ${min} min.`);
        } else {
          showSlotsError(userMessage(data.error));
        }
        loadSlots();
        return;
      }

      lockToken = data.lockToken;
      expiresAt = data.expiresAt;
      lockedSlotId = data.slotId;
      storeLock();

      $('booking-hold-banner').hidden = false;
      $('booking-email-form').hidden = false;
      $('booking-email').value = '';
      $('booking-email-error').hidden = true;
      updateDayNavState();
      startCountdown();
      loadSlots();
    } catch (e) {
      showSlotsError('Termíny nie sú dostupné');
      if (btn) btn.disabled = false;
    }
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  async function submitReservation(email) {
    const submitBtn = $('booking-submit-btn');
    submitBtn.disabled = true;
    $('booking-email-error').hidden = true;

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: lockedSlotId, lockToken, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        $('booking-email-error').textContent = userMessage(data.error);
        $('booking-email-error').hidden = false;
        submitBtn.disabled = false;
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

      $('booking-hold-banner').hidden = true;
      $('booking-email-form').hidden = true;
      $('booking-success').hidden = false;
      $('booking-success-status').textContent = data.reservation?.status || 'pending_payment';
      $('booking-success-id').textContent = data.reservation?.id || '';

      loadSlots();
    } catch (e) {
      $('booking-email-error').textContent = 'Niečo sa pokazilo. Skús neskôr.';
      $('booking-email-error').hidden = false;
      submitBtn.disabled = false;
    }
  }

  function init() {
    const dateInput = $('booking-date');
    if (!dateInput) return;

    if (location.hash === '#booking') {
      document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', location.pathname + location.search);
    }
    window.addEventListener('pseudochat:option_clicked', (e) => {
      if (e.detail?.optionId === 'termin') {
        document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    dateInput.min = getMinDate();
    dateInput.max = getMaxDate();

    const storedLock = getStoredLock();
    if (storedLock) {
      lockToken = storedLock.lockToken;
      lockedSlotId = storedLock.lockedSlotId;
      expiresAt = storedLock.expiresAt;
      if (storedLock.lockedSlotDate) {
        const d = storedLock.lockedSlotDate;
        if (d >= dateInput.min && d <= dateInput.max) dateInput.value = d;
      }
      selectedDate = dateInput.value;
      $('booking-hold-banner').hidden = false;
      $('booking-email-form').hidden = false;
      $('booking-email').value = '';
      $('booking-email-error').hidden = true;
      updateCountdown();
      startCountdown();
      updateDayNavState();
    } else {
      dateInput.value = parseQueryFrom();
      updateDayNavState();
    }

    dateInput.addEventListener('change', () => {
      if (lockToken) return;
      loadSlots();
    });

    const prevBtn = $('booking-prev-day');
    const nextBtn = $('booking-next-day');
    const slotsList = $('booking-slots-list');
    const emailForm = $('booking-email-form');
    const revokeBtn = $('booking-revoke-btn');
    if (!prevBtn || !nextBtn || !slotsList || !emailForm) return;

    if (revokeBtn) revokeBtn.addEventListener('click', revokeSlot);

    prevBtn.addEventListener('click', () => {
      if (lockToken) return;
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() - 1);
      const next = formatDateForInput(d);
      if (next >= dateInput.min) dateInput.value = next;
      loadSlots();
    });

    nextBtn.addEventListener('click', () => {
      if (lockToken) return;
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() + 1);
      const next = formatDateForInput(d);
      if (next <= dateInput.max) dateInput.value = next;
      loadSlots();
    });

    slotsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.booking-slot');
      if (btn && !btn.disabled && btn.dataset.slotId) {
        lockSlot(Number(btn.dataset.slotId));
      }
    });

    emailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = $('booking-email').value.trim();
      if (!validateEmail(email)) {
        $('booking-email-error').textContent = 'Zadaj platnú e-mailovú adresu.';
        $('booking-email-error').hidden = false;
        return;
      }
      submitReservation(email);
    });

    loadSlots();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
