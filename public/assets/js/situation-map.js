/**
 * Mapa situácie v0 — intro → questions → email → recap.
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'situation-map:v0-order:';
  var SESSION_ID_KEY = 'situation-map:session-id';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val == null || val === false) return;
        if (key === 'className') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'html') node.innerHTML = val;
        else if (key.indexOf('on') === 0 && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (key === 'value') {
          node.value = val;
        } else if (key === 'disabled') node.disabled = Boolean(val);
        else node.setAttribute(key, val === true ? '' : String(val));
      });
    }
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function paragraphs(texts) {
    return (texts || []).map(function (t) {
      return el('p', { text: t });
    });
  }

  function formatProgress(template, current, total) {
    return String(template || '')
      .replace('{current}', String(current))
      .replace('{total}', String(total));
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function getSessionId() {
    try {
      var existing = sessionStorage.getItem(SESSION_ID_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
      var id =
        window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : 's' + String(Date.now()) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SESSION_ID_KEY, id);
      return id;
    } catch (_err) {
      return 's' + String(Date.now());
    }
  }

  function loadConfig() {
    var node = document.getElementById('situation-map-config');
    if (!node || !node.textContent) throw new Error('Missing situation map config');
    return JSON.parse(node.textContent);
  }

  function storageKey(funnelName) {
    return STORAGE_PREFIX + (funnelName || 'mapa');
  }

  function readSession(funnelName) {
    try {
      var raw = sessionStorage.getItem(storageKey(funnelName));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function writeSession(funnelName, state) {
    try {
      sessionStorage.setItem(
        storageKey(funnelName),
        JSON.stringify({
          phase: state.phase,
          questionIndex: state.questionIndex,
          answers: state.answers,
          email: state.email,
          displayName: state.displayName,
          marketingConsent: state.marketingConsent,
          completed: state.completed,
        })
      );
    } catch (_err) {
      /* ignore quota */
    }
  }

  function clearSession(funnelName) {
    try {
      sessionStorage.removeItem(storageKey(funnelName));
    } catch (_err) {
      /* ignore */
    }
  }

  var recaptchaScriptPromise = null;

  function getRecaptchaSiteKey() {
    return typeof window !== 'undefined' && window.__SITUATION_MAP_RECAPTCHA_SITE_KEY
      ? String(window.__SITUATION_MAP_RECAPTCHA_SITE_KEY).trim()
      : '';
  }

  async function getRecaptchaToken(action) {
    var key = getRecaptchaSiteKey();
    if (!key) return '';
    if (!recaptchaScriptPromise) {
      recaptchaScriptPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(key);
        s.async = true;
        s.onload = function () {
          resolve();
        };
        s.onerror = function () {
          reject(new Error('recaptcha script'));
        };
        document.head.appendChild(s);
      });
    }
    await recaptchaScriptPromise;
    if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
      throw new Error('grecaptcha');
    }
    return new Promise(function (resolve, reject) {
      window.grecaptcha.ready(function () {
        window.grecaptcha
          .execute(key, { action: action || 'situation_map_submit' })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  function createApp(root, config, bootstrap) {
    var questions = config.questions || [];
    var total = questions.length;
    var funnelName = bootstrap.funnelName || root.getAttribute('data-funnel-name') || 'mapa';
    var funnelCampaign =
      bootstrap.funnelCampaign || root.getAttribute('data-funnel-campaign') || 'default';
    var sessionId = getSessionId();
    var mount = $('#situation-map-mount', root);
    var lastViewedQuestionId = null;
    var advanceTimer = null;
    var isAdvancing = false;
    var SELECTION_FEEDBACK_MS = 140;
    var EXIT_TRANSITION_MS = 170;

    var state = {
      phase: 'landing',
      questionIndex: 0,
      answers: {},
      email: '',
      displayName: '',
      marketingConsent: false,
      completed: false,
      recap: null,
      showResume: false,
      error: '',
    };

    function persist() {
      if (state.completed) {
        clearSession(funnelName);
        return;
      }
      if (state.phase === 'landing') return;
      writeSession(funnelName, state);
    }

    function hydrateFromSession() {
      var saved = readSession(funnelName);
      if (!saved || !saved.answers) return;
      if (saved.completed) return;
      state.answers = saved.answers;
      state.questionIndex = Math.min(
        Math.max(0, Number(saved.questionIndex) || 0),
        Math.max(0, total - 1)
      );
      state.email = saved.email || '';
      state.displayName = saved.displayName || '';
      state.marketingConsent = Boolean(saved.marketingConsent);
      if (saved.phase === 'email' || saved.phase === 'results') {
        state.phase = 'email';
        state.questionIndex = Math.max(0, total - 1);
      } else if (saved.phase === 'question') {
        state.phase = 'question';
        state.showResume = true;
      }
    }

    function setPhase(phase) {
      state.phase = phase;
      persist();
      render();
    }

    function track(eventType, questionId) {
      var payload = {
        sessionId: sessionId,
        funnelName: funnelName,
        funnelCampaign: funnelCampaign,
        eventType: eventType,
      };
      if (questionId) payload.questionId = questionId;
      fetch('/api/situation-map/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {
        /* analytics must not block */
      });
    }

    function cancelAdvance() {
      if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
      }
      isAdvancing = false;
      if (mount) mount.classList.remove('assessment-mount--exit');
    }

    function startMap() {
      cancelAdvance();
      state.phase = 'question';
      state.questionIndex = 0;
      state.answers = {};
      state.completed = false;
      state.recap = null;
      state.showResume = false;
      persist();
      track('map_started');
      render();
    }

    function goBack() {
      var wasAdvancing = isAdvancing || Boolean(advanceTimer);
      cancelAdvance();
      state.error = '';
      if (wasAdvancing && state.phase === 'question') {
        persist();
        render();
        return;
      }
      if (state.phase === 'email') {
        state.phase = 'question';
        state.questionIndex = Math.max(0, total - 1);
        persist();
        render();
        return;
      }
      if (state.phase === 'question' && state.questionIndex > 0) {
        state.questionIndex -= 1;
        persist();
        render();
        return;
      }
      if (state.phase === 'question') {
        state.phase = 'landing';
        persist();
        render();
      }
    }

    function currentQuestion() {
      return questions[state.questionIndex] || null;
    }

    function otherSelected(question, value) {
      if (!question || !question.otherValue) return false;
      if (question.type === 'multi') {
        return Array.isArray(value) && value.indexOf(question.otherValue) !== -1;
      }
      return value === question.otherValue;
    }

    function isQuestionComplete(question) {
      if (!question) return false;
      var value = state.answers[question.field];
      if (question.type === 'textarea') {
        return String(value || '').trim().length > 0;
      }
      if (question.type === 'multi') {
        if (!Array.isArray(value) || value.length === 0) return false;
        if (otherSelected(question, value) && !String(state.answers[question.otherField] || '').trim()) {
          return false;
        }
        return true;
      }
      if (!value) return false;
      if (otherSelected(question, value) && !String(state.answers[question.otherField] || '').trim()) {
        return false;
      }
      return true;
    }

    function needsContinue(question) {
      if (!question || question.type !== 'single') return true;
      if (isAdvancing) return false;
      if (otherSelected(question, state.answers[question.field])) return true;
      return isQuestionComplete(question);
    }

    function goToNextQuestion() {
      state.error = '';
      if (state.questionIndex >= total - 1) {
        track('map_completed');
        setPhase('email');
        return;
      }
      state.questionIndex += 1;
      persist();
      render();
    }

    function advanceFromQuestion() {
      var q = currentQuestion();
      if (!isQuestionComplete(q)) {
        state.error =
          q.type === 'textarea'
            ? config.ui.requiredText
            : q.type === 'multi'
              ? config.ui.requiredMulti
              : otherSelected(q, state.answers[q.field])
                ? config.ui.requiredOther
                : config.ui.requiredChoice;
        render();
        return;
      }
      track('map_question_answered', q.id);
      goToNextQuestion();
    }

    function skipFromQuestion() {
      var q = currentQuestion();
      if (!q || !q.skippable) return;
      if (q.type === 'textarea') {
        state.answers[q.field] = '';
      }
      persist();
      track('map_question_skipped', q.id);
      goToNextQuestion();
    }

    function scheduleAdvanceFromQuestion() {
      isAdvancing = true;
      persist();
      render();
      if (advanceTimer) clearTimeout(advanceTimer);
      advanceTimer = setTimeout(function () {
        if (mount) mount.classList.add('assessment-mount--exit');
        advanceTimer = setTimeout(function () {
          advanceTimer = null;
          if (mount) mount.classList.remove('assessment-mount--exit');
          isAdvancing = false;
          advanceFromQuestion();
        }, EXIT_TRANSITION_MS);
      }, SELECTION_FEEDBACK_MS);
    }

    function toggleMulti(question, optionValue) {
      var current = Array.isArray(state.answers[question.field])
        ? state.answers[question.field].slice()
        : [];
      var idx = current.indexOf(optionValue);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(optionValue);
      state.answers[question.field] = current;
      if (!otherSelected(question, current) && question.otherField) {
        state.answers[question.otherField] = '';
      }
      state.error = '';
      persist();
      render();
    }

    function selectSingle(question, optionValue) {
      if (isAdvancing) return;
      state.answers[question.field] = optionValue;
      if (!otherSelected(question, optionValue) && question.otherField) {
        state.answers[question.otherField] = '';
      }
      state.error = '';
      persist();
      if (otherSelected(question, optionValue)) {
        render();
        var otherInput = mount && mount.querySelector('.situation-map-other');
        if (otherInput && typeof otherInput.focus === 'function') otherInput.focus();
        return;
      }
      scheduleAdvanceFromQuestion();
    }

    async function submitEmail(email, displayName, marketingConsent) {
      var token = '';
      try {
        token = await getRecaptchaToken('situation_map_submit');
      } catch (_err) {
        /* continue; server decides */
      }
      var res = await fetch('/api/situation-map/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          displayName: displayName,
          answers: state.answers,
          funnelName: funnelName,
          funnelCampaign: funnelCampaign,
          sessionId: sessionId,
          marketingConsent: marketingConsent,
          captchaToken: token,
          sourceUrl: window.location.href,
        }),
      });
      var payload = {};
      try {
        payload = await res.json();
      } catch (_err) {
        payload = {};
      }
      if (!res.ok) {
        var err = new Error('submit');
        err.payload = payload;
        if (payload && payload.error === 'captcha_required') err.message = 'captcha';
        throw err;
      }
      state.email = email;
      state.displayName = displayName;
      state.marketingConsent = marketingConsent;
      state.recap = payload.recap;
      state.completed = true;
      clearSession(funnelName);
      track('result_viewed');
      setPhase('results');
    }

    function renderBack(compact) {
      var ui = config.ui || {};
      if (state.phase === 'landing' || state.phase === 'results') return null;
      return el('button', {
        type: 'button',
        className: 'assessment-back' + (compact ? ' assessment-back--compact' : ''),
        text: ui.back || '← Späť',
        onClick: goBack,
      });
    }

    function renderLanding() {
      var L = config.landing || {};
      return el('section', { className: 'assessment-phase' }, [
        el('p', { className: 'assessment-kicker', text: L.kicker || 'Mapa situácie' }),
        el('h1', { className: 'assessment-title', text: L.headline || '' }),
        el('div', { className: 'assessment-block' }, paragraphs(L.paragraphs)),
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--block',
            text: L.cta || 'Vytvoriť svoju Mapu',
            onClick: startMap,
          }),
        ]),
      ]);
    }

    function renderOtherInput(question) {
      if (!otherSelected(question, state.answers[question.field])) return null;
      return el('input', {
        type: 'text',
        className: 'situation-map-other',
        maxlength: '200',
        placeholder: (config.ui && config.ui.otherPlaceholder) || '',
        value: state.answers[question.otherField] || '',
        onInput: function (ev) {
          state.answers[question.otherField] = ev.target.value;
          persist();
        },
      });
    }

    function renderQuestion() {
      var q = currentQuestion();
      if (!q) return el('p', { text: 'Chýba otázka.' });
      if (lastViewedQuestionId !== q.id) {
        lastViewedQuestionId = q.id;
        track('map_question_viewed', q.id);
      }
      var ui = config.ui || {};
      var current = state.questionIndex + 1;
      var progressPct = Math.round((current / total) * 100);
      var selected = state.answers[q.field];
      var choices = (q.options || []).map(function (opt) {
        var isOn =
          q.type === 'multi'
            ? Array.isArray(selected) && selected.indexOf(opt.value) !== -1
            : selected === opt.value;
        return el('button', {
          type: 'button',
          className:
            'situation-map-choice situation-map-choice--' +
            (q.type === 'multi' ? 'multi' : 'single') +
            (isOn ? ' is-selected' : '') +
            (isOn && isAdvancing ? ' is-confirming' : ''),
          'aria-pressed': q.type === 'single' ? (isOn ? 'true' : 'false') : undefined,
          disabled: isAdvancing && !isOn,
          onClick: function () {
            if (q.type === 'multi') toggleMulti(q, opt.value);
            else selectSingle(q, opt.value);
          },
        }, [
          el('span', { className: 'situation-map-choice__mark', 'aria-hidden': 'true' }),
          el('span', { text: opt.label }),
        ]);
      });

      var bodyKids = [];
      if (q.nudge) {
        bodyKids.push(el('p', { className: 'situation-map-nudge', text: q.nudge }));
      }
      bodyKids.push(el('p', { className: 'assessment-question-text', text: q.text }));
      if (q.hint) bodyKids.push(el('p', { className: 'situation-map-hint', text: q.hint }));

      if (q.type === 'textarea') {
        var maxLen = q.maxLength || 800;
        var value = String(state.answers[q.field] || '');
        var rows = Number(q.rows) || 0;
        var textareaAttrs = {
          className:
            'situation-map-textarea' + (rows > 0 && rows <= 3 ? ' situation-map-textarea--compact' : ''),
          maxlength: String(maxLen),
          value: value,
          onInput: function (ev) {
            state.answers[q.field] = ev.target.value;
            persist();
            var counter = mount.querySelector('.situation-map-count');
            if (counter) {
              counter.textContent = ev.target.value.length + ' / ' + maxLen;
            }
          },
        };
        if (rows > 0) textareaAttrs.rows = String(rows);
        bodyKids.push(el('textarea', textareaAttrs));
        bodyKids.push(
          el('p', {
            className: 'situation-map-count',
            text: value.length + ' / ' + maxLen,
          })
        );
      } else {
        bodyKids.push(el('div', { className: 'situation-map-choices' }, choices));
        bodyKids.push(renderOtherInput(q));
      }

      if (state.error) {
        bodyKids.push(el('p', { className: 'assessment-error', text: state.error }));
      }

      if (needsContinue(q)) {
        bodyKids.push(
          el('div', { className: 'assessment-actions' }, [
            el('button', {
              type: 'button',
              className: 'assessment-btn assessment-btn--block',
              text: ui.continue || 'Pokračovať',
              onClick: advanceFromQuestion,
            }),
          ])
        );
      }
      if (q.skippable) {
        bodyKids.push(
          el('button', {
            type: 'button',
            className: 'situation-map-skip',
            text: ui.skip || 'Radšej preskočím',
            onClick: skipFromQuestion,
          })
        );
      }

      var resume = null;
      if (state.showResume && ui.resumeBanner) {
        resume = el('p', { className: 'assessment-resume', text: ui.resumeBanner });
        state.showResume = false;
      }

      return el('section', { className: 'assessment-phase assessment-question' }, [
        renderBack(true),
        resume,
        el('div', { className: 'assessment-progress' }, [
          el('div', { className: 'assessment-progress__label' }, [
            el('span', {
              className: 'assessment-progress__count',
              text: formatProgress(ui.progress, current, total),
            }),
          ]),
          el('div', { className: 'assessment-progress__track' }, [
            el('div', {
              className: 'assessment-progress__fill',
              style: 'width:' + progressPct + '%',
            }),
          ]),
        ]),
        el('div', { className: 'assessment-question__prompt' }, bodyKids),
      ]);
    }

    function renderEmail() {
      var gate = config.emailGate || {};
      var errorNode = el('p', { className: 'assessment-error', hidden: true });
      var nameInput = el('input', {
        type: 'text',
        id: 'situation-map-name',
        name: 'name',
        autocomplete: 'given-name',
        maxlength: '80',
        required: true,
        placeholder: gate.namePlaceholder || '',
        value: state.displayName || '',
      });
      var emailInput = el('input', {
        type: 'email',
        id: 'situation-map-email',
        name: 'email',
        autocomplete: 'email',
        required: true,
        placeholder: gate.emailPlaceholder || '',
        value: state.email || '',
      });
      var consent = el('input', {
        type: 'checkbox',
        id: 'situation-map-consent',
      });
      if (state.marketingConsent) consent.checked = true;

      var form = el('form', { className: 'assessment-form' }, [
        el('div', { className: 'assessment-field' }, [
          el('label', { for: 'situation-map-name', text: gate.nameLabel || 'Meno' }),
          nameInput,
        ]),
        el('div', { className: 'assessment-field' }, [
          el('label', { for: 'situation-map-email', text: gate.emailLabel || 'E-mail' }),
          emailInput,
        ]),
        el('label', { className: 'assessment-check', for: 'situation-map-consent' }, [
          consent,
          el('span', { text: gate.consentOptional || '' }),
        ]),
        el('p', { className: 'assessment-privacy', html: gate.privacyNoteHtml || '' }),
        errorNode,
        el('button', {
          type: 'submit',
          className: 'assessment-btn assessment-btn--block',
          text: gate.cta || 'Zobraziť moju Mapu',
        }),
      ]);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var displayName = String(nameInput.value || '').trim();
        var email = String(emailInput.value || '').trim().toLowerCase();
        if (!displayName) {
          errorNode.hidden = false;
          errorNode.textContent = gate.errorName || 'Zadaj meno alebo oslovenie.';
          return;
        }
        if (!isValidEmail(email)) {
          errorNode.hidden = false;
          errorNode.textContent = gate.errorRequired || 'Zadaj platný e-mail.';
          return;
        }
        errorNode.hidden = true;
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        submitEmail(email, displayName, Boolean(consent.checked))
          .catch(function (err) {
            errorNode.hidden = false;
            var payload = err && err.payload;
            if (payload && payload.message) errorNode.textContent = payload.message;
            else if (err && err.message === 'captcha') {
              errorNode.textContent = 'Potrebujeme overiť, že nie si robot. Skús to prosím znova.';
            } else {
              errorNode.textContent = gate.errorGeneric || 'Niečo sa nepodarilo. Skús to prosím znova.';
            }
          })
          .finally(function () {
            if (submitBtn && state.phase === 'email') submitBtn.disabled = false;
          });
      });

      return el('section', { className: 'assessment-phase assessment-email' }, [
        renderBack(true),
        el('h1', { className: 'assessment-title', text: gate.headline || '' }),
        el('p', { className: 'assessment-lead', text: gate.subhead || '' }),
        form,
      ]);
    }

    function renderResults() {
      var recap = state.recap;
      if (!recap || !recap.sections) {
        return el('p', { text: 'Chýba výsledok.' });
      }
      var s = recap.sections;
      var kids = [
        el('p', { className: 'assessment-kicker', text: config.landing.kicker || 'Mapa situácie' }),
        el('h1', { className: 'assessment-title', text: s.situation.title || '' }),
        el('p', { className: 'assessment-lead', text: s.situation.topicLabel || '' }),
      ];
      if (s.situation.description) {
        kids.push(el('p', { text: s.situation.lead || '' }));
        kids.push(
          el('div', { className: 'situation-map-recap__quote', text: s.situation.description })
        );
      } else if (s.situation.skippedNote) {
        kids.push(
          el('p', { className: 'situation-map-recap__skipped', text: s.situation.skippedNote })
        );
      }
      kids.push(el('h2', { text: s.perception.title || '' }));
      (s.perception.paragraphs || []).forEach(function (p) {
        kids.push(el('p', { text: p }));
      });
      kids.push(el('h2', { text: s.attempts.title || '' }));
      if (s.attempts.items && s.attempts.items.length) {
        kids.push(
          el(
            'ul',
            {},
            s.attempts.items.map(function (item) {
              return el('li', { text: item });
            })
          )
        );
      }
      kids.push(el('h2', { text: s.desired.title || '' }));
      if (s.desired.text) {
        kids.push(el('div', { className: 'situation-map-recap__quote', text: s.desired.text }));
      } else if (s.desired.skippedNote) {
        kids.push(
          el('p', { className: 'situation-map-recap__skipped', text: s.desired.skippedNote })
        );
      }
      if (s.desired.barrierLine) {
        kids.push(el('p', { text: s.desired.barrierLine }));
      }
      kids.push(el('p', { className: 'situation-map-disclaimer', text: recap.disclaimer || '' }));
      kids.push(el('div', { id: 'situation-map-offer', className: 'situation-map-offer' }));
      kids.push(
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn',
            text: (config.ui && config.ui.restart) || 'Vytvoriť novú Mapu',
            onClick: function () {
              state.answers = {};
              state.recap = null;
              state.completed = false;
              startMap();
            },
          }),
        ])
      );

      return el('section', { className: 'assessment-phase situation-map-recap' }, kids);
    }

    function render() {
      if (!mount) return;
      document.body.classList.toggle(
        'assessment-immersive',
        state.phase === 'question' || state.phase === 'email'
      );
      mount.replaceChildren();
      var view =
        state.phase === 'landing'
          ? renderLanding()
          : state.phase === 'question'
            ? renderQuestion()
            : state.phase === 'email'
              ? renderEmail()
              : renderResults();
      mount.appendChild(view);
      var target = mount.querySelector('.assessment-phase') || mount;
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start' });
      }
    }

    hydrateFromSession();
    render();
  }

  function boot() {
    var root = document.getElementById('situation-map-root');
    if (!root) return;
    var config = loadConfig();
    var bootstrap = window.__SITUATION_MAP_BOOTSTRAP || {};
    createApp(root, config, bootstrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
