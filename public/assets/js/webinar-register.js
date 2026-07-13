(function () {
  'use strict';

  var form = document.getElementById('webinar-register-form');
  if (!form) return;

  var loadingEl = document.getElementById('webinar-options-loading');
  var optionsErrorEl = document.getElementById('webinar-options-error');
  var optionListEl = document.getElementById('webinar-option-list');
  var customWrap = document.getElementById('webinar-custom-wrap');
  var customInput = document.getElementById('webinar-custom-datetime');
  var formErrorEl = document.getElementById('webinar-form-error');
  var submitBtn = document.getElementById('webinar-submit');
  var successEl = document.getElementById('webinar-success');
  var successText = document.getElementById('webinar-success-text');
  var successRoomLink = document.getElementById('webinar-success-room-link');

  var state = {
    timezone: 'Europe/Bratislava',
    customEnabled: false,
    customBounds: null,
    optionsBound: false,
  };

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function setFormError(msg) {
    if (!formErrorEl) return;
    if (!msg) {
      hide(formErrorEl);
      formErrorEl.textContent = '';
      return;
    }
    formErrorEl.textContent = msg;
    show(formErrorEl);
  }

  function localDatetimeToUtcIso(value) {
    if (!value) return null;
    var parts = value.split('T');
    if (parts.length !== 2) return null;
    var dateParts = parts[0].split('-').map(Number);
    var timeParts = parts[1].split(':').map(Number);
    if (dateParts.length !== 3 || timeParts.length < 2) return null;

    var y = dateParts[0];
    var mo = dateParts[1] - 1;
    var d = dateParts[2];
    var h = timeParts[0];
    var mi = timeParts[1];

    var utcMs = Date.UTC(y, mo, d, h, mi, 0, 0);
    var probe = new Date(utcMs);
    var formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: state.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    var pieces = formatter.formatToParts(probe);
    var got = {};
    pieces.forEach(function (p) {
      if (p.type !== 'literal') got[p.type] = p.value;
    });
    var asLocalMs = Date.UTC(
      Number(got.year),
      Number(got.month) - 1,
      Number(got.day),
      Number(got.hour),
      Number(got.minute),
      0,
      0
    );
    var offset = asLocalMs - utcMs;
    return new Date(utcMs - offset).toISOString();
  }

  function renderOptions(data) {
    state.timezone = data.timezone || state.timezone;
    state.customEnabled = Boolean(data.customTimeEnabled);
    state.customBounds = data.customBounds || null;

    optionListEl.innerHTML = '';

    (data.options || []).forEach(function (opt, index) {
      var id = 'webinar-opt-' + index;
      var label = document.createElement('label');
      label.className = 'webinar-option';
      label.setAttribute('for', id);

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'webinarOption';
      input.id = id;
      input.value = opt.id;
      input.dataset.type = opt.type;
      if (index === 0) input.checked = true;

      var span = document.createElement('span');
      span.className = 'webinar-option__label';
      span.textContent = opt.label;

      label.appendChild(input);
      label.appendChild(span);
      optionListEl.appendChild(label);
    });

    if (state.customEnabled) {
      var customId = 'webinar-opt-custom';
      var customLabel = document.createElement('label');
      customLabel.className = 'webinar-option';
      customLabel.setAttribute('for', customId);

      var customRadio = document.createElement('input');
      customRadio.type = 'radio';
      customRadio.name = 'webinarOption';
      customRadio.id = customId;
      customRadio.value = 'custom';
      customRadio.dataset.type = 'custom';

      var customSpan = document.createElement('span');
      customSpan.className = 'webinar-option__label';
      customSpan.textContent = 'Vlastný termín';

      customLabel.appendChild(customRadio);
      customLabel.appendChild(customSpan);
      optionListEl.appendChild(customLabel);

      if (state.customBounds) {
        customInput.min = state.customBounds.minLocal;
        customInput.max = state.customBounds.maxLocal;
        customInput.step = String((state.customBounds.stepMinutes || 15) * 60);
        customInput.value = state.customBounds.minLocal;
      }
      show(customWrap);
    } else {
      hide(customWrap);
    }

    if (!state.optionsBound) {
      optionListEl.addEventListener('change', onOptionChange);
      state.optionsBound = true;
    }
    onOptionChange();
  }

  function onOptionChange() {
    var selected = form.querySelector('input[name="webinarOption"]:checked');
    var isCustom = selected && selected.dataset.type === 'custom';
    if (state.customEnabled && customWrap) {
      if (isCustom) show(customWrap);
      else hide(customWrap);
    }
  }

  function buildSelection() {
    var selected = form.querySelector('input[name="webinarOption"]:checked');
    if (!selected) return null;

    var type = selected.dataset.type;
    if (type === 'earliest') {
      return { type: 'earliest' };
    }
    if (type === 'preset') {
      return { type: 'preset', optionId: selected.value };
    }
    if (type === 'custom') {
      var iso = localDatetimeToUtcIso(customInput.value);
      if (!iso) return null;
      return { type: 'custom', startAtUtc: iso };
    }
    return null;
  }

  function loadOptions() {
    fetch('/api/webinar/options')
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        hide(loadingEl);
        if (!result.ok || !result.body.ok) {
          optionsErrorEl.textContent =
            (result.body && result.body.message) || 'Webinár momentálne nie je dostupný.';
          show(optionsErrorEl);
          return;
        }
    if (!result.body.options || result.body.options.length === 0) {
      if (!result.body.customTimeEnabled) {
        optionsErrorEl.textContent = 'Momentálne nie sú dostupné žiadne termíny.';
        show(optionsErrorEl);
        return;
      }
    }
    renderOptions(result.body);
    show(form);
      })
      .catch(function () {
        hide(loadingEl);
        optionsErrorEl.textContent = 'Nepodarilo sa načítať termíny. Skús obnoviť stránku.';
        show(optionsErrorEl);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setFormError('');

    var emailInput = document.getElementById('webinar-email');
    var email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
      setFormError('Zadaj e-mail.');
      return;
    }

    var selection = buildSelection();
    if (!selection) {
      setFormError('Vyber platný termín.');
      return;
    }

    submitBtn.disabled = true;

    fetch('/api/webinar/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, selection: selection }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        submitBtn.disabled = false;
        if (!result.ok || !result.body.ok) {
          setFormError((result.body && result.body.message) || 'Registrácia zlyhala.');
          return;
        }

        var reg = result.body.registration;
        var fmt = reg.formattedStart || {};
        var when =
          (fmt.weekday ? fmt.weekday + ' ' : '') +
          (fmt.date || '') +
          (fmt.time ? ' o ' + fmt.time : '');

        successText.textContent = 'Termín: ' + when + ' (' + (reg.timezone || state.timezone) + ').';
        successRoomLink.href = reg.roomUrl || '/webinar/room/' + encodeURIComponent(reg.accessToken);

        hide(form);
        show(successEl);
      })
      .catch(function () {
        submitBtn.disabled = false;
        setFormError('Registrácia zlyhala. Skús to prosím neskôr.');
      });
  });

  loadOptions();
})();
