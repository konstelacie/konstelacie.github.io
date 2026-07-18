/**
 * Life Autopilot Assessment — client state machine.
 * Phases: landing | prepare | question | insight | analyzing | email | results
 * Unlock: POST /api/assessment/submit (server scoring authoritative).
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

  /** ~3.5 min for 24 questions ≈ 9s each; whole minutes only. */
  var SECONDS_PER_QUESTION = 9;
  var ALMOST_THERE_FROM = 21;

  function formatRemaining(ui, current1Based, total) {
    if (current1Based >= ALMOST_THERE_FROM) {
      return ui.remainingAlmost || 'Už skoro koniec.';
    }
    var remaining = Math.max(1, total - current1Based + 1);
    var minutes = Math.max(1, Math.ceil((remaining * SECONDS_PER_QUESTION) / 60));
    if (minutes === 1) {
      return ui.remainingMinuteOne || '≈ 1 minúta zostáva';
    }
    var template =
      minutes >= 2 && minutes <= 4
        ? ui.remainingMinutesFew || '≈ {minutes} minúty zostávajú'
        : ui.remainingMinutesMany || '≈ {minutes} minút zostáva';
    return String(template).replace('{minutes}', String(minutes));
  }

  var IMMERSIVE_PHASES = {
    prepare: true,
    question: true,
    insight: true,
    analyzing: true,
    email: true,
  };

  function setImmersiveChrome(phase) {
    var on = Boolean(IMMERSIVE_PHASES[phase]);
    document.body.classList.toggle('assessment-immersive', on);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  var recaptchaScriptPromise = null;

  function getRecaptchaSiteKey() {
    return typeof window !== 'undefined' && window.__ASSESSMENT_RECAPTCHA_SITE_KEY
      ? String(window.__ASSESSMENT_RECAPTCHA_SITE_KEY).trim()
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
          .execute(key, { action: action || 'assessment_submit' })
          .then(resolve)
          .catch(reject);
      });
    });
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

  function dualPrimaryKey(a, b) {
    return [String(a || ''), String(b || '')].sort().join('|');
  }

  function resolveDualPrimaryCopy(config, primaryId, secondaryId) {
    var fallback = config.dualPrimary || {};
    var pairs = config.dualPrimaryPairs || {};
    var pair = pairs[dualPrimaryKey(primaryId, secondaryId)];
    if (!pair) return fallback;
    return {
      intro: pair.intro || fallback.intro || '',
      body: pair.body || fallback.body || '',
    };
  }

  function mailtoHref(email, subject) {
    if (!email) return '#';
    var href = 'mailto:' + email;
    if (subject) href += '?subject=' + encodeURIComponent(subject);
    return href;
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
    var advanceTimer = null;
    var isAdvancing = false;
    /** Brief confirmation before leaving the question (018 flow polish). */
    var SELECTION_FEEDBACK_MS = 130;

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
      if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
      }
      isAdvancing = false;
      state.phase = 'prepare';
      state.questionIndex = 0;
      state.answers = {};
      state.completed = false;
      state.scoreResult = null;
      state.showResume = false;
      pendingInsight = null;
      persist();
      render();
    }

    function beginQuestions() {
      state.phase = 'question';
      state.questionIndex = 0;
      state.showResume = false;
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
      if (isAdvancing) return;
      if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
        isAdvancing = false;
      }
      if (state.phase === 'prepare') {
        setPhase('landing');
        return;
      }
      if (state.phase === 'insight') {
        pendingInsight = null;
        setPhase('question');
        return;
      }
      if (state.phase !== 'question') return;
      if (state.questionIndex <= 0) {
        setPhase('prepare');
        return;
      }
      state.questionIndex -= 1;
      persist();
      render();
    }

    function selectAnswer(value) {
      var q = questions[state.questionIndex];
      if (!q || isAdvancing) return;
      state.answers[q.id] = value;
      isAdvancing = true;
      persist();
      render();
      if (advanceTimer) clearTimeout(advanceTimer);
      advanceTimer = setTimeout(function () {
        advanceTimer = null;
        isAdvancing = false;
        var index1 = state.questionIndex + 1;
        var insight = insightAfter(config, index1);
        if (insight) {
          pendingInsight = insight;
          setPhase('insight');
          return;
        }
        advanceAfterQuestion();
      }, SELECTION_FEEDBACK_MS);
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
        (config.analyzing && config.analyzing.durationMs) || 2000;
      if (analyzingTimer) clearTimeout(analyzingTimer);
      analyzingTimer = setTimeout(function () {
        analyzingTimer = null;
        setPhase('email');
      }, duration);
    }

    async function submitToServer(email, captchaToken) {
      var body = {
        email: email,
        answers: state.answers,
        funnelName: funnelName,
        funnelCampaign: funnelCampaign,
        marketingConsent: Boolean(state.marketingConsent),
        sourceUrl: typeof window !== 'undefined' ? window.location.href : null,
      };
      if (captchaToken) body.captchaToken = captchaToken;

      var res = await fetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_err) {
        data = {};
      }
      return { res: res, data: data };
    }

    function applyServerResult(data) {
      state.scoreResult = {
        scores: data.scores || {},
        ranked: data.ranked || [],
        primaryBottleneck: data.primaryBottleneck,
        secondaryBottleneck: data.secondaryBottleneck,
        isDualPrimary: Boolean(data.isDualPrimary),
        isBalanced: Boolean(data.isBalanced),
        isLowOverall: Boolean(data.isLowOverall),
        submissionId: data.submissionId,
        result: data.result || null,
        secondaryResult: data.secondaryResult || null,
      };
      state.completed = true;
      state.phase = 'results';
      clearSession(funnelName);
      render();
    }

    async function unlockResults(email) {
      state.email = email;
      var first = await submitToServer(email, '');
      if (first.res.status === 403 && first.data && first.data.error === 'captcha_required') {
        var token = '';
        try {
          token = await getRecaptchaToken('assessment_submit');
        } catch (_err) {
          throw new Error('captcha');
        }
        var second = await submitToServer(email, token);
        if (!second.res.ok || !second.data || !second.data.ok) {
          var err = new Error('submit_failed');
          err.payload = second.data;
          err.status = second.res.status;
          throw err;
        }
        applyServerResult(second.data);
        return;
      }
      if (!first.res.ok || !first.data || !first.data.ok) {
        var fail = new Error('submit_failed');
        fail.payload = first.data;
        fail.status = first.res.status;
        throw fail;
      }
      applyServerResult(first.data);
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

    function renderSystemCards(systems, L) {
      var moreLabel = (L && L.systemsMoreLabel) || 'Viac';
      var lessLabel = (L && L.systemsLessLabel) || 'Menej';
      return el(
        'div',
        { className: 'assessment-dim-cards' },
        (systems || []).map(function (item) {
          var label = typeof item === 'string' ? item : item.label || '';
          var summary =
            typeof item === 'string'
              ? ''
              : item.summary || item.description || '';
          var detail = typeof item === 'string' ? '' : item.detail || '';
          var detailId = 'assessment-dim-' + (item && item.id ? item.id : label);
          var kids = [
            el('span', { className: 'assessment-dim-card__label', text: label }),
          ];
          if (summary) {
            kids.push(el('span', { className: 'assessment-dim-card__summary', text: summary }));
          }
          if (detail) {
            kids.push(
              el('span', {
                className: 'assessment-dim-card__detail',
                id: detailId,
                hidden: true,
                text: detail,
              })
            );
            kids.push(
              el('span', {
                className: 'assessment-dim-card__more',
                text: moreLabel,
              })
            );
          }
          var card = el(
            'button',
            {
              type: 'button',
              className: 'assessment-dim-card',
              'aria-expanded': 'false',
              'aria-controls': detail ? detailId : undefined,
            },
            kids
          );
          if (detail) {
            card.addEventListener('click', function () {
              var open = card.getAttribute('aria-expanded') === 'true';
              var next = !open;
              card.setAttribute('aria-expanded', next ? 'true' : 'false');
              card.classList.toggle('is-open', next);
              var detailNode = card.querySelector('.assessment-dim-card__detail');
              var moreNode = card.querySelector('.assessment-dim-card__more');
              if (detailNode) detailNode.hidden = !next;
              if (moreNode) moreNode.textContent = next ? lessLabel : moreLabel;
            });
          }
          return card;
        })
      );
    }

    function renderPreview(L) {
      var rows = L.previewRows || [];
      if (!rows.length) return null;
      var headerKids = [];
      if (L.previewEyebrow) {
        headerKids.push(
          el('p', { className: 'assessment-preview__eyebrow', text: L.previewEyebrow })
        );
      }
      if (L.previewTitle) {
        headerKids.push(el('h2', { text: L.previewTitle }));
      }
      return el('div', { className: 'assessment-block assessment-preview' }, [
        el('div', { className: 'assessment-preview__header' }, headerKids),
        el(
          'div',
          {
            className: 'assessment-scores assessment-scores--preview',
            'aria-hidden': 'true',
          },
          rows.map(function (row) {
            var width = Math.max(0, Math.min(100, Number(row.width) || 0));
            return el('div', { className: 'assessment-score-row' }, [
              el('div', {
                className: 'assessment-score-row__label',
                text: row.label || '',
              }),
              el('div', { className: 'assessment-score-row__track' }, [
                el('div', {
                  className: 'assessment-score-row__fill',
                  style: 'width:' + width + '%',
                }),
              ]),
            ]);
          })
        ),
        L.previewCaption
          ? el('p', { className: 'assessment-preview__caption', text: L.previewCaption })
          : null,
      ]);
    }

    function renderLandingLead(L) {
      var lines = L.leadLines || [];
      if (lines.length || L.leadClose) {
        var parts = lines.map(function (line) {
          return el('p', {
            className: 'assessment-lead assessment-lead--tight',
            text: line,
          });
        });
        if (L.leadClose) {
          parts.push(
            el('p', {
              className: 'assessment-lead assessment-lead--close',
              text: L.leadClose,
            })
          );
        }
        return parts;
      }
      if (L.subhead) {
        return [el('p', { className: 'assessment-lead', text: L.subhead })];
      }
      return [];
    }

    function renderCtaCluster(L) {
      var kids = [];
      if (L.trustBadges && L.trustBadges.length) {
        kids.push(
          el(
            'ul',
            { className: 'assessment-badges' },
            L.trustBadges.map(function (badge) {
              return el('li', { text: badge });
            })
          )
        );
      }
      kids.push(
        el('div', { className: 'assessment-actions' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--block',
            text: L.cta || 'Spustiť',
            onClick: startAssessment,
          }),
        ])
      );
      if (L.privacyNote) {
        kids.push(el('p', { className: 'assessment-privacy-note', text: L.privacyNote }));
      }
      return el('div', { className: 'assessment-cta-cluster' }, kids);
    }

    function renderLanding() {
      var L = config.landing || {};
      var primary = [
        el('p', { className: 'assessment-kicker', text: 'Diagnostika životného autopilota' }),
        el('h1', { className: 'assessment-title', text: L.headline || '' }),
      ].concat(renderLandingLead(L));

      primary.push(
        el('div', { className: 'assessment-block assessment-diff' }, [
          el('h2', { text: L.diffTitle || '' }),
          el('p', { text: L.diffBody || '' }),
        ])
      );

      if (L.recognizeTitle || (L.recognizeBullets && L.recognizeBullets.length)) {
        primary.push(
          el('div', { className: 'assessment-block assessment-recognize' }, [
            el('h2', { text: L.recognizeTitle || '' }),
            el(
              'ul',
              { className: 'assessment-checklist' },
              (L.recognizeBullets || []).map(function (b) {
                return el('li', { text: b });
              })
            ),
            L.recognizeClose
              ? el('p', { className: 'assessment-recognize__close', text: L.recognizeClose })
              : null,
          ])
        );
      }

      primary.push(renderCtaCluster(L));

      if (L.philosophyLine) {
        primary.push(
          el('p', { className: 'assessment-philosophy', text: L.philosophyLine })
        );
      }

      var secondary = [
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
          renderSystemCards(L.systems, L),
        ]),
      ];

      var preview = renderPreview(L);
      if (preview) secondary.push(preview);

      if (L.whyTitle || (L.whyParagraphs && L.whyParagraphs.length)) {
        secondary.push(
          el(
            'div',
            { className: 'assessment-block assessment-why' },
            [el('h2', { text: L.whyTitle || '' })].concat(
              (L.whyParagraphs || []).map(function (p) {
                return el('p', { text: p });
              })
            )
          )
        );
      }

      secondary.push(
        el('div', { className: 'assessment-actions assessment-actions--secondary' }, [
          el('button', {
            type: 'button',
            className: 'assessment-btn assessment-btn--block',
            text: L.cta || 'Spustiť',
            onClick: startAssessment,
          }),
        ])
      );

      return el('section', { className: 'assessment-phase assessment-landing' }, [
        el('div', { className: 'assessment-landing__primary' }, primary),
        el('div', { className: 'assessment-landing__secondary' }, secondary),
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

    function renderBackLink(ui, opts) {
      opts = opts || {};
      return el(
        'div',
        {
          className:
            'assessment-nav' + (opts.compact ? ' assessment-nav--compact' : ''),
        },
        [
          el('button', {
            type: 'button',
            className: 'assessment-back',
            text: ui.back || '← Späť',
            onClick: goBack,
          }),
        ]
      );
    }

    function renderRewardPreview(ui) {
      var items = ui.rewardItems || [];
      if (!items.length) return null;
      return el('div', { className: 'assessment-reward' }, [
        el('p', { className: 'assessment-reward__title', text: ui.rewardTitle || '' }),
        el(
          'ul',
          { className: 'assessment-reward__list' },
          items.map(function (item) {
            return el('li', { text: item });
          })
        ),
      ]);
    }

    function renderPrepare() {
      var P = config.prepare || {};
      var ui = config.ui || {};
      return el('section', { className: 'assessment-phase assessment-prepare' }, [
        renderBackLink(ui, { compact: true }),
        el('div', { className: 'assessment-prepare__inner' }, [
          el('h1', { className: 'assessment-prepare__title', text: P.headline || 'Začíname' }),
          el(
            'div',
            { className: 'assessment-prepare__body' },
            paragraphs(P.paragraphs)
          ),
          el('div', { className: 'assessment-actions' }, [
            el('button', {
              type: 'button',
              className: 'assessment-btn assessment-btn--block',
              text: P.cta || 'Začať diagnostiku',
              onClick: beginQuestions,
            }),
          ]),
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
        var isSelected = selected === value;
        return el(
          'button',
          {
            type: 'button',
            className:
              'assessment-likert__option' +
              (isSelected ? ' is-selected' : '') +
              (isSelected && isAdvancing ? ' is-confirming' : ''),
            'aria-pressed': isSelected ? 'true' : 'false',
            disabled: isAdvancing && !isSelected,
            onClick: function () {
              selectAnswer(value);
            },
          },
          [
            el('span', { className: 'assessment-likert__marker', 'aria-hidden': 'true' }),
            el('span', { className: 'assessment-likert__label', text: label }),
          ]
        );
      });

      var questionBlock = [];
      if (q.contextPrompt) {
        questionBlock.push(
          el('p', { className: 'assessment-context-prompt', text: q.contextPrompt })
        );
      }
      questionBlock.push(
        el('p', { className: 'assessment-question-text', text: q.text })
      );

      return el('section', { className: 'assessment-phase assessment-question' }, [
        renderResumeBanner(),
        renderBackLink(ui, { compact: true }),
        el('div', { className: 'assessment-progress' }, [
          el('div', { className: 'assessment-progress__label' }, [
            el('span', {
              className: 'assessment-progress__count',
              text: formatProgress(ui.progress, current, total),
            }),
            el('span', {
              className: 'assessment-progress__remaining',
              text: formatRemaining(ui, current, total),
            }),
          ]),
          el('div', { className: 'assessment-progress__track' }, [
            el('div', {
              className: 'assessment-progress__fill',
              style: 'width:' + Math.round((current / total) * 100) + '%',
            }),
          ]),
          ui.reassurance
            ? el('p', { className: 'assessment-reassurance', text: ui.reassurance })
            : null,
        ]),
        current === 1 ? renderRewardPreview(ui) : null,
        el('div', { className: 'assessment-question__prompt' }, questionBlock),
        el('div', { className: 'assessment-likert', role: 'group' }, options),
      ]);
    }

    function renderInsight() {
      var ui = config.ui || {};
      var insight = pendingInsight || {};
      return el('section', { className: 'assessment-phase assessment-insight' }, [
        renderBackLink(ui, { compact: true }),
        el('div', { className: 'assessment-insight__inner' }, [
          el('p', {
            className: 'assessment-kicker',
            text: ui.insightKicker || 'Krátke zamyslenie',
          }),
          insight.headline
            ? el('h2', { className: 'assessment-insight__title', text: insight.headline })
            : null,
          el(
            'div',
            { className: 'assessment-block assessment-insight__body' },
            paragraphs(insight.paragraphs)
          ),
          el('div', { className: 'assessment-actions assessment-actions--centered' }, [
            el('button', {
              type: 'button',
              className: 'assessment-btn',
              text: ui.continue || 'Pokračovať',
              onClick: continueFromInsight,
            }),
          ]),
        ]),
      ]);
    }

    function renderAnalyzing() {
      var A = config.analyzing || {};
      var headline = A.headline || A.fallback || 'Analyzujeme vaše odpovede…';
      var body = A.body || '';
      return el('section', { className: 'assessment-phase assessment-analyzing' }, [
        el('div', { className: 'assessment-analyzing__pulse', 'aria-hidden': 'true' }),
        el('h2', { className: 'assessment-analyzing__title', text: headline }),
        body ? el('p', { className: 'assessment-lead', text: body }) : null,
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
        errorNode.hidden = true;
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        unlockResults(email)
          .catch(function (err) {
            errorNode.hidden = false;
            var payload = err && err.payload;
            if (payload && payload.message) {
              errorNode.textContent = payload.message;
            } else if (err && err.message === 'captcha') {
              errorNode.textContent =
                'Potrebujeme overiť, že nie ste robot. Skúste to prosím znova.';
            } else {
              errorNode.textContent = gate.errorGeneric || 'Niečo sa nepodarilo. Skúste to prosím znova.';
            }
          })
          .finally(function () {
            if (submitBtn && state.phase === 'email') submitBtn.disabled = false;
          });
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
        var dualCopy = resolveDualPrimaryCopy(
          config,
          scored.primaryBottleneck,
          scored.secondaryBottleneck
        );
        body.push(
          renderBottleneckBlock(scored.primaryBottleneck, ui.primaryDual)
        );
        body.push(
          el('div', { className: 'assessment-block' }, [
            el('p', { text: dualCopy.intro || '' }),
            el('p', { text: dualCopy.body || '' }),
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
      var infoMailto = mailtoHref(supportEmail, cta.mailtoSubject || '');
      var waitlistMailto = mailtoHref(
        supportEmail,
        cta.waitlistMailtoSubject || cta.mailtoSubject || ''
      );
      var ctaActions = [
        el('a', {
          className: 'assessment-btn',
          href: infoMailto,
          text: cta.primaryCta || '',
        }),
      ];
      if (cta.secondaryCta) {
        ctaActions.push(
          el('a', {
            className: 'assessment-btn assessment-btn--secondary',
            href: waitlistMailto,
            text: cta.secondaryCta,
          })
        );
      }
      body.push(
        el('section', { className: 'assessment-cta' }, [
          el('h2', { text: cta.title || '' }),
          el('p', { text: cta.body || '' }),
          el('div', { className: 'assessment-actions assessment-actions--cta' }, ctaActions),
          el('p', { className: 'assessment-note', text: cta.contactHint || '' }),
        ])
      );

      return el('section', { className: 'assessment-phase assessment-results' }, body);
    }

    function render() {
      if (!mount) return;
      setImmersiveChrome(state.phase);
      mount.replaceChildren();
      var view;
      switch (state.phase) {
        case 'prepare':
          view = renderPrepare();
          break;
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
