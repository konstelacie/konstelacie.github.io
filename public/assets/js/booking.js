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

  async function fetchSlots(from, to) {
    const res = await fetch(`/api/slots?from=${from}&to=${to}`);
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

    loading.hidden = true;
    err.hidden = true;

    if (!slots || slots.length === 0) {
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
        const statusText = s.isLocked ? 'Podržané' : s.status === 'blocked' || s.status === 'cancelled' ? 'Nedostupný' : '';
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

  async function loadSlots() {
    selectedDate = $('booking-date').value;
    const from = parseQueryFrom();
    const to = getMaxDate();

    $('booking-slots-loading').hidden = false;
    $('booking-slots-list').hidden = true;
    $('booking-slots-empty').hidden = true;
    $('booking-slots-error').hidden = true;

    try {
      const data = await fetchSlots(from, to);
      slotsByDate = groupSlotsByDate(data.slots || []);
      const daySlots = slotsByDate[selectedDate] || [];
      renderSlots(daySlots);
    } catch (e) {
      showSlotsError('Termíny nie sú dostupné');
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
      $('booking-hold-banner').hidden = true;
      $('booking-email-form').hidden = true;
      loadSlots();
    }
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
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

      $('booking-hold-banner').hidden = false;
      $('booking-email-form').hidden = false;
      $('booking-email').value = '';
      $('booking-email-error').hidden = true;
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
    const fromParam = parseQueryFrom();
    const dateInput = $('booking-date');
    dateInput.min = getMinDate();
    dateInput.max = getMaxDate();
    dateInput.value = fromParam;

    dateInput.addEventListener('change', loadSlots);

    $('booking-prev-day').addEventListener('click', () => {
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() - 1);
      const next = formatDateForInput(d);
      if (next >= dateInput.min) dateInput.value = next;
      loadSlots();
    });

    $('booking-next-day').addEventListener('click', () => {
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() + 1);
      const next = formatDateForInput(d);
      if (next <= dateInput.max) dateInput.value = next;
      loadSlots();
    });

    $('booking-slots-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.booking-slot');
      if (btn && !btn.disabled && btn.dataset.slotId) {
        lockSlot(Number(btn.dataset.slotId));
      }
    });

    $('booking-email-form').addEventListener('submit', (e) => {
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
