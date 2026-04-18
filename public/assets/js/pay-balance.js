(function () {
  const root = document.getElementById('pay-balance-root');
  const loadingEl = document.getElementById('pay-balance-loading');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  const sessionId = params.get('session_id');
  const tokenFromUrl = params.get('token') || '';
  const tokenFromData = (root.getAttribute('data-token') || '').trim();
  const token = tokenFromUrl || tokenFromData;

  function clearLoading() {
    if (loadingEl) loadingEl.remove();
  }

  function show(html) {
    clearLoading();
    root.innerHTML = html;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatSk(iso) {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('sk-SK', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Bratislava',
      }).format(d);
    } catch {
      return iso;
    }
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function pollPaymentStatus(cs) {
    for (let i = 0; i < 45; i += 1) {
      const r = await fetch(`/api/payments/status?session_id=${encodeURIComponent(cs)}`);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok && data.payment && data.payment.status === 'completed') {
        return data;
      }
      await sleep(800);
    }
    return null;
  }

  async function runSuccess() {
    show('<p class="muted">Potvrdzujem platbu…</p>');
    const data = await pollPaymentStatus(sessionId);
    if (!data) {
      show(
        '<p>Platba sa spracúva. Ak sa suma strhla z karty, úhrada sa čoskoro zobrazí v systéme. Pri probléme nás kontaktuj.</p>'
      );
      return;
    }
    const eur = (data.payment.amountCents / 100).toFixed(2);
    show(`<p>Ďakujeme. Platbu <strong>${esc(eur)} €</strong> sme zaznamenali.</p>`);
  }

  async function loadContext() {
    const r = await fetch(`/api/payments/balance/context?token=${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => ({}));
    if (r.status === 404 || !data.ok) {
      show('<p>Odkaz je neplatný alebo expirovaný.</p>');
      return;
    }
    if (data.state !== 'ready') {
      show(`<p>${esc(data.message || 'Platba nie je dostupná.')}</p>`);
      return;
    }

    const slot = data.slot || {};
    const slotLine = slot.startAt
      ? `<p class="muted">Termín: <strong>${esc(formatSk(slot.startAt))}</strong> (${esc(slot.timezone || '')})</p>`
      : '';

    const suggested = data.suggestedSupplements || [];
    const radios = suggested
      .map(
        (row, i) => `
      <label class="pay-balance-option">
        <input type="radio" name="supplement" value="${row.supplementEur}" ${i === 0 ? 'checked' : ''}>
        <span>Doplatok <strong>${row.supplementEur} €</strong> (spolu ${row.targetTotalEur} €)</span>
      </label>`
      )
      .join('');

    const customDefault = Number(data.defaultCustomSupplementEur) || data.minSupplementEur || 1;
    const onlyCustom = suggested.length === 0;
    const customChecked = onlyCustom ? 'checked' : '';

    show(`
      ${slotLine}
      <p>Už zaplatené celkom: <strong>${esc(String(data.paidEuros))} €</strong>.</p>
      <p>Môžeš prispieť ďalšou sumou (dobrovoľné):</p>
      <form id="pay-balance-form" class="pay-balance-form">
        <fieldset class="pay-balance-fieldset">
          <legend class="visually-hidden">Suma doplatku</legend>
          ${radios}
          <label class="pay-balance-option">
            <input type="radio" name="supplement" value="custom" id="pay-balance-custom-radio" ${customChecked}>
            <span>Iná suma (€)</span>
          </label>
          <input type="number" id="pay-balance-custom" min="${data.minSupplementEur || 1}" max="50000" step="1" value="${customDefault}" aria-label="Vlastná suma v eurách" ${onlyCustom ? '' : 'disabled'}>
        </fieldset>
        <p id="pay-balance-err" class="booking-error" hidden></p>
        <button type="submit" class="cta" id="pay-balance-submit">Pokračovať k platbe</button>
      </form>
    `);

    const form = document.getElementById('pay-balance-form');
    const err = document.getElementById('pay-balance-err');
    const customRadio = document.getElementById('pay-balance-custom-radio');
    const customInput = document.getElementById('pay-balance-custom');

    function syncCustom() {
      if (!customInput || !customRadio) return;
      customInput.disabled = !customRadio.checked;
    }
    root.querySelectorAll('input[name="supplement"]').forEach((el) => {
      el.addEventListener('change', syncCustom);
    });
    syncCustom();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
      const checked = form.querySelector('input[name="supplement"]:checked');
      let supplementEur;
      if (checked && checked.value === 'custom') {
        supplementEur = parseInt(customInput.value, 10);
      } else if (checked) {
        supplementEur = parseInt(checked.value, 10);
      }
      if (!Number.isInteger(supplementEur) || supplementEur < 1) {
        if (err) {
          err.textContent = 'Zadaj platnú sumu aspoň 1 €.';
          err.hidden = false;
        }
        return;
      }
      const btn = document.getElementById('pay-balance-submit');
      if (btn) btn.disabled = true;
      try {
        const r = await fetch('/api/payments/balance/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, supplementEur }),
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok || !out.url) {
          const msg =
            out.message ||
            (out.error === 'BALANCE_CHECKOUT_PENDING'
              ? 'Platba už prebieha. Dokonči ju v Stripe alebo počkaj na expiráciu relácie.'
              : 'Nepodarilo sa spustiť platbu. Skús znova.');
          if (err) {
            err.textContent = msg;
            err.hidden = false;
          }
          if (btn) btn.disabled = false;
          return;
        }
        window.location.href = out.url;
      } catch {
        if (err) {
          err.textContent = 'Sieťová chyba. Skús znova.';
          err.hidden = false;
        }
        if (btn) btn.disabled = false;
      }
    });
  }

  if (paid === '1') {
    if (!sessionId || !sessionId.startsWith('cs_')) {
      clearLoading();
      show('<p>Chýba identifikátor platby. Vráť sa z platobnej brány alebo použi odkaz z e-mailu.</p>');
    } else {
      runSuccess();
    }
    return;
  }

  if (!token) {
    clearLoading();
    show('<p>Chýba platný odkaz z e-mailu. Otvor stránku cez odkaz, ktorý sme ti poslali.</p>');
    return;
  }

  loadContext();
})();
