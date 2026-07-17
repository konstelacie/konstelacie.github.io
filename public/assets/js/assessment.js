/**
 * Life Autopilot Assessment — client state machine (Phase 1: client scoring unlock).
 * Phases: landing | question | insight | analyzing | email | results
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'assessment:';

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

  function loadConfig() {
    var node = document.getElementById('assessment-config');
    if (!node || !node.textContent) throw new Error('Missing assessment config');
    return JSON.parse(node.textContent);
  }

  function storageKey(funnelName) {
    return STORAGE_PREFIX + (funnelName || 'autopilot');
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
          email: state.email || '',
          marketingConsent: Boolean(state.marketingConsent),
          completed: Boolean(state.completed),
        })
      );
    } catch (_err) {
      /* ignore quota / private mode */
    }
  }

  function clearSession(funnelName) {
    try {
      sessionStorage.removeItem(storageKey(funnelName));
    } catch (_err) {
      /* ignore */
    }
  }

  function sortedQuestions(config) {
    return (config.questions || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
  }

  function insightAfter(config, questionIndex1Based) {
    var list = config.microInsights || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].afterQuestionIndex === questionIndex1Based) return list[i];
    }
    return null;
  }

  function createApp(root, config, bootstrap) {
    var questions = sortedQuestions(config);
    var total = questions.length;
    var funnelName = bootstrap.funnelName || root.getAttribute('data-funnel-name') || 'autopilot';
    var funnelCampaign =
      bootstrap.funnelCampaign || root.getAttribute('data-funnel-campaign') || 'default';
    var supportEmail = bootstrap.supportEmail || '';
    var mount = $('#assessment-mount', root);
    var pendingInsight = null;
    var analyzingTimer = null;

    var state = {
      phase: 'landing',
      questionIndex: 0,
      answers: {},
      email: '',
      marketingConsent: false,
      completed: false,
      scoreResult: null,
      showResume: false,
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
      var answered = Object.keys(saved.answers).length;
      if (answered < 1 || saved.completed) return;
      state.answers = saved.answers;
      state.questionIndex = Math.min(
        Math.max(0, Number(saved.questionIndex) || 0),
        Math.max(0, total - 1)
      );
      state.email = saved.email || '';
      state.marketingConsent = Boolean(saved.marketingConsent);
      if (saved.phase === 'email' || saved.phase === 'analyzing' || saved.phase === 'results') {
        state.phase = 'email';
        state.questionIndex = total - 1;
      } else if (saved.phase === 'insight' || saved.phase === 'question') {
        state.phase = 'question';
        state.showResume = true;
      }
    }

    function setPhase(phase) {
      state.phase = phase;
      persist();
      render();
    }

    function startAssessment() {
      state.phase = 'question';
      state.questionIndex = 0;
      state.answers = {};
      state.completed = false;
      state.scoreResult = null;
      state.showResume = false;
      pendingInsight = null;
      persist();
      render();
    }

    function resumeAssessment() {
      state.showResume = false;
      render();
    }

    function restartAssessment() {
      clearSession(funnelName);
      startAssessment();
    }

    function goBack() {
      if (state.phase === 'insight') {
        pendingInsight = null;
        setPhase('question');
        return;
      }
      if (state.phase !== 'question') return;
      if (state.questionIndex <= 0) {
        setPhase('landing');
        return;
      }
      state.questionIndex -= 1;
      persist();
      render();
    }

    function selectAnswer(value) {
      var q = questions[state.questionIndex];
      if (!q) return;
      state.answers[q.id] = value;
      var index1 = state.questionIndex + 1;
      var insight = insightAfter(config, index1);
      if (insight) {
        pendingInsight = insight;
        persist();
        setPhase('insight');
        return;
      }
      advanceAfterQuestion();
    }

    function continueFromInsight() {
      pendingInsight = null;
      advanceAfterQuestion();
    }

    function advanceAfterQuestion() {
      if (state.questionIndex >= total - 1) {
        beginAnalyzing();
        return;
      }
      state.questionIndex += 1;
      state.phase = 'question';
      persist();
      render();
    }

    function beginAnalyzing() {
      state.phase = 'analyzing';
      persist();
      render();
      var duration =
        (config.analyzing && config.analyzing.durationMs) || 2500;
      if (analyzingTimer) clearTimeout(analyzingTimer);
      analyzingTimer = setTimeout(function () {
        analyzingTimer = null;
        setPhase('email');
      }, duration);
    }

    function unlockResults(email) {
      if (!window.AssessmentScoring || !window.AssessmentScoring.scoreAssessment) {
        throw new Error('Scoring module missing');
      }
      var result = window.AssessmentScoring.scoreAssessment({
        questions: questions,
        dimensions: config.dimensions,
        bottlenecks: config.bottlenecks,
        answers: state.answers,
      });
      state.email = email;
      state.scoreResult = result;
      state.completed = true;
      state.phase = 'results';
      clearSession(funnelName);
      render();
    }

    function resultCopy(resultId) {
      return (config.bottleneckResults && config.bottleneckResults[resultId]) || null;
    }

    function dimensionLabel(dimensionId) {
      var dims = config.dimensions || [];
      for (var i = 0; i < dims.length; i++) {
        if (dims[i].id === dimensionId) return dims[i].labelSk || dimensionId;
      }
      return dimensionId;
    }

    function renderLanding() {
      var L = config.landing || {};
      var systems = el(
        'ul',
        { className: 'assessment-systems' },
        (L.systems || []).map(function (name) {
          return el('li', { text: name });
        })
      );
      return el('section', { className: 'assessment-phase assessment-landing' }, [
        el('p', { className: 'assessment-kicker', text: 'Diagnostika životného autopilota' }),
        el('h1', { className: 'assessment-title', text: L.headline || '' }),
        el('p', { className: 'assessment-lead', text: L.subhead || '' }),
        el('div', { className: 'assessment-block' }, [
          el('h2', { text: L.diffTitle || '' }),
          el('p', { text: L.diffBody || '' }),
        ]),
        el('div', { className: 'assessment-block' }, [
          el('h2', { text: L.receiveTitle || '' }),
          el(
            'ul',
            { className: 'assessment-list' },
            (L.receiveBullets || []).map(function (b) {
              return el('li', { text: b });
            })
          ),
        ]),
        el('div', { className: 'assessment-block' }, [
          el('h2', { text: L.systemsTitle || '' }),
          systems,
        ]),
        el('p', { className: 'assessment-note', text: L.durationNote || '' }),
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn',
            text: L.cta || 'Spustiť',
            onClick: startAssessment,
          }),
        ]),
      ]);
    }

    function renderResumeBanner() {
      if (!state.showResume) return null;
      var ui = config.ui || {};
      return el('div', { className: 'assessment-resume' }, [
        el('p', { text: ui.resumeBanner || '' }),
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn',
            text: ui.resumeCta || 'Pokračovať',
            onClick: resumeAssessment,
          }),
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--secondary',
            text: ui.restart || 'Začať odznova',
            onClick: restartAssessment,
          }),
        ]),
      ]);
    }

    function renderQuestion() {
      var ui = config.ui || {};
      var q = questions[state.questionIndex];
      var current = state.questionIndex + 1;
      var selected = state.answers[q.id];
      var labels = config.likertLabels || [];
      var options = labels.map(function (label, idx) {
        var value = idx + 1;
        return el(
          'button',
          {
            type: 'button',
            className:
              'assessment-likert__option' + (selected === value ? ' is-selected' : ''),
            onClick: function () {
              selectAnswer(value);
            },
          },
          [
            el('span', { className: 'assessment-likert__value', text: String(value) }),
            el('span', { text: label }),
          ]
        );
      });

      return el('section', { className: 'assessment-phase assessment-question' }, [
        renderResumeBanner(),
        el('div', { className: 'assessment-progress' }, [
          el('div', { className: 'assessment-progress__label' }, [
            el('span', {
              text: formatProgress(ui.progress, current, total),
            }),
          ]),
          el('div', { className: 'assessment-progress__track' }, [
            el('div', {
              className: 'assessment-progress__fill',
              style: 'width:' + Math.round((current / total) * 100) + '%',
            }),
          ]),
        ]),
        el('p', { className: 'assessment-question-text', text: q.text }),
        el('div', { className: 'assessment-likert', role: 'group' }, options),
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--ghost',
            text: ui.back || 'Späť',
            onClick: goBack,
          }),
        ]),
      ]);
    }

    function renderInsight() {
      var ui = config.ui || {};
      var insight = pendingInsight || {};
      return el('section', { className: 'assessment-phase assessment-insight' }, [
        el('p', { className: 'assessment-kicker', text: insight.headline || '' }),
        el('div', { className: 'assessment-block' }, paragraphs(insight.paragraphs)),
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--ghost',
            text: ui.back || 'Späť',
            onClick: goBack,
          }),
          el('button', {
            type: 'button',
            className: 'assessment-btn',
            text: ui.continue || 'Pokračovať',
            onClick: continueFromInsight,
          }),
        ]),
      ]);
    }

    function renderAnalyzing() {
      var messages = (config.analyzing && config.analyzing.messages) || [];
      var msg =
        messages[Math.floor(Math.random() * messages.length)] ||
        (config.analyzing && config.analyzing.fallback) ||
        '';
      return el('section', { className: 'assessment-phase assessment-analyzing' }, [
        el('div', { className: 'assessment-analyzing__pulse', 'aria-hidden': 'true' }),
        el('p', { className: 'assessment-lead', text: msg }),
      ]);
    }

    function renderEmail() {
      var gate = config.emailGate || {};
      var errorNode = el('p', { className: 'assessment-error', hidden: true });
      var emailInput = el('input', {
        type: 'email',
        id: 'assessment-email',
        name: 'email',
        autocomplete: 'email',
        required: true,
        placeholder: gate.emailPlaceholder || '',
        value: state.email || '',
      });
      var consent = el('input', {
        type: 'checkbox',
        id: 'assessment-consent',
      });
      if (state.marketingConsent) consent.checked = true;

      var form = el('form', { className: 'assessment-form' }, [
        el('div', { className: 'assessment-field' }, [
          el('label', { for: 'assessment-email', text: gate.emailLabel || 'E-mail' }),
          emailInput,
        ]),
        el('label', { className: 'assessment-check', for: 'assessment-consent' }, [
          consent,
          el('span', { text: gate.consentOptional || '' }),
        ]),
        el('p', { className: 'assessment-privacy', html: gate.privacyNoteHtml || '' }),
        errorNode,
        el('button', {
          type: 'submit',
          className: 'assessment-btn assessment-btn--block',
          text: gate.cta || 'Odomknúť',
        }),
      ]);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var email = String(emailInput.value || '').trim().toLowerCase();
        if (!isValidEmail(email)) {
          errorNode.hidden = false;
          errorNode.textContent = gate.errorRequired || 'Zadajte platný e-mail.';
          return;
        }
        state.marketingConsent = Boolean(consent.checked);
        try {
          unlockResults(email);
        } catch (_err) {
          errorNode.hidden = false;
          errorNode.textContent = gate.errorGeneric || 'Niečo sa nepodarilo.';
        }
      });

      return el('section', { className: 'assessment-phase assessment-email' }, [
        el('h1', { className: 'assessment-title', text: gate.headline || '' }),
        el('p', { className: 'assessment-lead', text: gate.subhead || '' }),
        form,
      ]);
    }

    function renderBottleneckBlock(resultId, heading) {
      var copy = resultCopy(resultId);
      if (!copy) return null;
      var headings = config.sectionHeadings || {};
      var kids = [
        el('p', { className: 'assessment-kicker', text: heading || '' }),
        el('h2', { className: 'assessment-title', text: copy.title || resultId }),
        el('div', { className: 'assessment-result-card' }, paragraphs(copy.summary)),
      ];
      ['whatItMeans', 'blindSpot', 'longTermRisk', 'firstStep', 'transition'].forEach(
        function (key) {
          if (!copy[key] || !copy[key].length) return;
          kids.push(
            el('section', { className: 'assessment-section' }, [
              el('h3', { text: headings[key] || key }),
            ].concat(paragraphs(copy[key])))
          );
        }
      );
      return el('div', { className: 'assessment-bottleneck' }, kids);
    }

    function renderResults() {
      var ui = config.ui || {};
      var scored = state.scoreResult;
      if (!scored) return el('p', { text: 'Chýbajú výsledky.' });

      var scoreRows = (scored.ranked || [])
        .slice()
        .sort(function (a, b) {
          return b.percent - a.percent;
        })
        .map(function (row) {
          var pct = Math.max(0, Math.min(100, Math.round(row.percent)));
          return el('div', { className: 'assessment-score-row' }, [
            el('div', {
              className: 'assessment-score-row__label',
              text: dimensionLabel(row.dimensionId),
            }),
            el('div', { className: 'assessment-score-row__track' }, [
              el('div', {
                className: 'assessment-score-row__fill',
                style: 'width:' + pct + '%',
              }),
            ]),
            el('div', {
              className: 'assessment-score-row__value',
              text: pct + ' %',
            }),
          ]);
        });

      var body = [
        el('h1', { className: 'assessment-title', text: ui.systemHeading || '' }),
        el('p', { className: 'assessment-note', text: ui.scoreHint || '' }),
        el('div', { className: 'assessment-scores' }, scoreRows),
      ];

      if (scored.isLowOverall && scored.isBalanced) {
        body.push(
          el('div', { className: 'assessment-block' }, paragraphs(config.lowScores))
        );
      } else if (scored.isBalanced) {
        body.push(
          el('div', { className: 'assessment-block' }, paragraphs(config.balancedScores))
        );
      }

      if (scored.isDualPrimary) {
        body.push(
          renderBottleneckBlock(scored.primaryBottleneck, ui.primaryDual)
        );
        body.push(
          el('div', { className: 'assessment-block' }, [
            el('p', { text: (config.dualPrimary && config.dualPrimary.intro) || '' }),
            el('p', { text: (config.dualPrimary && config.dualPrimary.body) || '' }),
          ])
        );
        body.push(
          renderBottleneckBlock(scored.secondaryBottleneck, ui.accompaniedBy)
        );
      } else {
        body.push(
          renderBottleneckBlock(scored.primaryBottleneck, ui.primarySingle)
        );
        if (scored.secondaryBottleneck) {
          var secondaryCopy = resultCopy(scored.secondaryBottleneck);
          body.push(
            el('div', { className: 'assessment-block' }, [
              el('h2', { text: ui.secondary || '' }),
              el('p', {
                text: secondaryCopy ? secondaryCopy.title : scored.secondaryBottleneck,
              }),
            ])
          );
        }
      }

      body.push(
        el('div', { className: 'assessment-block' }, paragraphs(config.closingMessage))
      );

      var cta = config.paidCta || {};
      var mailto = supportEmail
        ? 'mailto:' + supportEmail + '?subject=' + encodeURIComponent(cta.mailtoSubject || '')
        : '#';
      body.push(
        el('section', { className: 'assessment-cta' }, [
          el('h2', { text: cta.title || '' }),
          el('p', { text: cta.body || '' }),
          el('div', { className: 'assessment-actions' }, [
            el('a', {
              className: 'assessment-btn',
              href: mailto,
              text: cta.primaryCta || '',
            }),
          ]),
          el('p', { className: 'assessment-note', text: cta.contactHint || '' }),
        ])
      );

      return el('section', { className: 'assessment-phase assessment-results' }, body);
    }

    function render() {
      if (!mount) return;
      mount.replaceChildren();
      var view;
      switch (state.phase) {
        case 'question':
          view = renderQuestion();
          break;
        case 'insight':
          view = renderInsight();
          break;
        case 'analyzing':
          view = renderAnalyzing();
          break;
        case 'email':
          view = renderEmail();
          break;
        case 'results':
          view = renderResults();
          break;
        default:
          view = renderLanding();
      }
      mount.appendChild(view);
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_err) {
        window.scrollTo(0, 0);
      }
    }

    hydrateFromSession();
    render();
  }

  function boot() {
    var root = document.getElementById('assessment-root');
    if (!root) return;
    var config = loadConfig();
    var bootstrap = window.__ASSESSMENT_BOOTSTRAP || {};
    createApp(root, config, bootstrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
