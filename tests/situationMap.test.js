const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../src/middleware/apiError');
const situationMap = require('../src/config/situationMap');
const { validateAnswers, validateEmail, validateDisplayName } = require('../src/services/situationMapService');
const { buildSituationMapRecap } = require('../src/lib/situationMapRecap');

function validAnswers(overrides) {
  return {
    topic: 'relationship',
    situationDescription: 'Opakujú sa hádky o blízkosti.',
    situationType: 'repeating',
    duration: 'over_3_years',
    peopleInvolved: ['self', 'partner'],
    attempts: ['conversation', 'constellation'],
    desiredChange: 'Chcem pokojnejší vzťah.',
    perceivedBarrier: 'depends_on_other',
    ...overrides,
  };
}

test('validateEmail and display name', () => {
  assert.equal(validateEmail('  A@B.SK '), 'a@b.sk');
  assert.throws(() => validateEmail('nope'), (err) => err instanceof ApiError);
  assert.equal(validateDisplayName('  Jana '), 'Jana');
  assert.throws(() => validateDisplayName('  '), (err) => err instanceof ApiError);
});

test('validateAnswers stores structured fields and constellation flag', () => {
  const out = validateAnswers(validAnswers());
  assert.equal(out.topic, 'relationship');
  assert.equal(out.situationDescription, 'Opakujú sa hádky o blízkosti.');
  assert.equal(out.situationType, 'repeating');
  assert.equal(out.duration, 'over_3_years');
  assert.deepEqual(out.peopleInvolved, ['self', 'partner']);
  assert.equal(out.constellationExperience, true);
  assert.equal(out.perceivedBarrier, 'depends_on_other');
});

test('presentation order puts open description after easy clicks; ids stay semantic', () => {
  const enabled = situationMap.getEnabledQuestions();
  assert.deepEqual(
    enabled.map((q) => q.field),
    [
      'topic',
      'situationType',
      'duration',
      'peopleInvolved',
      'situationDescription',
      'attempts',
      'desiredChange',
      'perceivedBarrier',
    ]
  );
  assert.equal(enabled[4].id, 'Q2');
  assert.equal(situationMap.getQuestionById('Q2').field, 'situationDescription');
  assert.equal(situationMap.getQuestionByField('situationDescription').id, 'Q2');
});

test('validateAnswers requires other text when other is selected', () => {
  assert.throws(
    () => validateAnswers(validAnswers({ topic: 'other', topicOther: '' })),
    (err) => err instanceof ApiError
  );
  const out = validateAnswers(validAnswers({ topic: 'other', topicOther: 'zdravie v práci' }));
  assert.equal(out.topicOther, 'zdravie v práci');
});

test('recap reflects answers without diagnostic language', () => {
  const recap = buildSituationMapRecap({
    answers: validateAnswers(validAnswers()),
    config: situationMap,
  });
  assert.equal(recap.sections.situation.topicLabel, 'Partnerské vzťahy');
  assert.match(recap.sections.situation.description, /hádky/);
  assert.ok(recap.sections.perception.paragraphs.some((p) => p.includes('Uviedol/a si')));
  assert.ok(recap.sections.attempts.items.includes('konšteláciu'));
  assert.match(recap.sections.desired.barrierLine, /závisí to aj od druhého človeka/);
  assert.doesNotMatch(JSON.stringify(recap.sections), /Príčinou je|To znamená, že/);
  assert.match(recap.disclaimer, /nie je diagnózou/);
});

test('Q2 and Q7 are skippable; empty text is stored as empty string', () => {
  assert.equal(situationMap.getQuestionById('Q2').skippable, true);
  assert.equal(situationMap.getQuestionById('Q7').skippable, true);
  const out = validateAnswers(
    validAnswers({ situationDescription: '   ', desiredChange: '' })
  );
  assert.equal(out.situationDescription, '');
  assert.equal(out.desiredChange, '');
});

test('recap without Q2/Q7 still names the situation and notes the skip', () => {
  const recap = buildSituationMapRecap({
    answers: validateAnswers(validAnswers({ situationDescription: '', desiredChange: '' })),
    config: situationMap,
  });
  assert.equal(recap.sections.situation.topicLabel, 'Partnerské vzťahy');
  assert.equal(recap.sections.situation.description, '');
  assert.match(recap.sections.situation.skippedNote, /nevyplnil/);
  assert.equal(recap.sections.desired.text, '');
  assert.match(recap.sections.desired.skippedNote, /nevyplnil/);
  assert.ok(recap.sections.perception.paragraphs.length > 0);
  assert.match(recap.sections.desired.barrierLine, /závisí to aj od druhého človeka/);
});

test('Q8 can be disabled without changing other validation', () => {
  const q8 = situationMap.getQuestionById('Q8');
  const prev = q8.enabled;
  q8.enabled = false;
  try {
    const answers = validAnswers();
    delete answers.perceivedBarrier;
    const out = validateAnswers(answers);
    assert.equal(out.perceivedBarrier, null);
    const recap = buildSituationMapRecap({ answers: out, config: situationMap });
    assert.equal(recap.sections.desired.barrierLine, null);
  } finally {
    q8.enabled = prev;
  }
});

test('Q1 uses the wider pre-launch topic taxonomy without branching', () => {
  const q1 = situationMap.getQuestionById('Q1');
  assert.equal(q1.field, 'topic');
  assert.deepEqual(
    q1.options.map((o) => o.value),
    [
      'relationship',
      'family',
      'children_parenting',
      'work_business',
      'money_finance',
      'health_physical',
      'loss_change_decision',
      'recurring',
      'other',
    ]
  );
  assert.deepEqual(
    q1.options.map((o) => o.label),
    [
      'Partnerské vzťahy',
      'Rodina a blízke vzťahy',
      'Deti a rodičovstvo',
      'Práca, podnikanie a kariéra',
      'Peniaze a financie',
      'Zdravie a telesné ťažkosti',
      'Strata, zmena alebo dôležité životné rozhodnutie',
      'Niečo, čo sa mi v živote opakuje',
      'Iné',
    ]
  );
  const clientQ1 = situationMap.getClientConfig().questions.find((q) => q.id === 'Q1');
  assert.equal(clientQ1.retiredOptions, undefined);
  assert.equal(clientQ1.options.length, 9);
  assert.equal(situationMap.getEnabledQuestions().length, 8);
  assert.equal(situationMap.getEnabledQuestions()[1].id, 'Q3');
});

test('new Q1 submissions accept current topic codes and reject retired ones', () => {
  const current = [
    'relationship',
    'family',
    'children_parenting',
    'work_business',
    'money_finance',
    'health_physical',
    'loss_change_decision',
    'recurring',
  ];
  for (const topic of current) {
    assert.equal(validateAnswers(validAnswers({ topic })).topic, topic);
  }
  const other = validateAnswers(validAnswers({ topic: 'other', topicOther: 'bývanie' }));
  assert.equal(other.topic, 'other');
  assert.equal(other.topicOther, 'bývanie');
  for (const topic of ['parents', 'children', 'extended_family', 'work_money', 'loss_change']) {
    assert.throws(
      () => validateAnswers(validAnswers({ topic })),
      (err) => err instanceof ApiError
    );
  }
});

test('recap and admin labels stay factual for new and retired Q1 topics', () => {
  const health = buildSituationMapRecap({
    answers: validateAnswers(validAnswers({ topic: 'health_physical' })),
    config: situationMap,
  });
  assert.equal(health.sections.situation.topicLabel, 'Zdravie a telesné ťažkosti');
  assert.doesNotMatch(
    JSON.stringify(health),
    /rodinným systémom|finančným problémom|vhodná na váš zdravotný|konštelácia je vhodná/i
  );

  const legacy = buildSituationMapRecap({
    answers: { ...validateAnswers(validAnswers()), topic: 'parents' },
    config: situationMap,
  });
  assert.equal(legacy.sections.situation.topicLabel, 'rodičia a pôvodná rodina');

  const { listQuestionAnswers } = require('../src/lib/situationMapAnswers');
  const listed = listQuestionAnswers(
    { ...validateAnswers(validAnswers()), topic: 'work_money' },
    situationMap
  );
  assert.equal(listed[0].id, 'Q1');
  assert.equal(listed[0].value, 'práca a peniaze');
});

test('marketing consent is versioned separately from email capture', () => {
  assert.equal(typeof situationMap.emailGate.consentVersion, 'string');
  assert.match(situationMap.emailGate.consentVersion, /^mapa-consent-v\d+$/);
  assert.equal(situationMap.getClientConfig().emailGate.consentVersion, situationMap.emailGate.consentVersion);
});

test('offer slot stays off until an enabled offer is configured', () => {
  assert.equal(situationMap.offer, null);
  assert.equal(situationMap.getActiveOffer(), null);
  assert.equal(situationMap.getClientConfig().offer, null);
  assert.match(situationMap.getClientConfig().resultPage.acknowledgement, /Ďakujem/);
  assert.match(situationMap.getClientConfig().resultPage.pendingBody, /osobne pozriem/);
  assert.equal(situationMap.resolveOffer(null), null);
  assert.equal(situationMap.resolveOffer({ id: 'intro-call', enabled: false, headline: 'x' }), null);
  const active = situationMap.resolveOffer({
    id: 'intro-call',
    variant: 'B',
    headline: 'Intro hovor',
    body: '20 minút.',
    ctaLabel: 'Rezervovať',
    ctaUrl: '/rezervacia',
    price: 'zdarma',
    enabled: true,
  });
  assert.deepEqual(active, {
    id: 'intro-call',
    variant: 'B',
    headline: 'Intro hovor',
    body: '20 minút.',
    ctaLabel: 'Rezervovať',
    ctaUrl: '/rezervacia',
    price: 'zdarma',
  });
  assert.equal(situationMap.resolveOffer({
    id: 'bad',
    enabled: true,
    ctaUrl: 'javascript:alert(1)',
  }).ctaUrl, '');
});

test('analytics helpers keep question IDs and drop free-text / PII', () => {
  const {
    answerLengthBucket,
    sanitizeEventProperties,
    sanitizeStepNumber,
    sanitizeSubmissionId,
  } = require('../src/lib/situationMapAnalytics');
  const { ALLOWED_EVENT_TYPES, isClientEventType } = require('../src/db/repositories/situationMapEventsRepo');

  assert.equal(answerLengthBucket(0), '0');
  assert.equal(answerLengthBucket(12), '1-50');
  assert.equal(answerLengthBucket(80), '51-150');
  assert.equal(answerLengthBucket(200), '151-400');
  assert.equal(answerLengthBucket(900), '401+');
  assert.equal(sanitizeStepNumber(5), 5);
  assert.equal(sanitizeStepNumber(0), null);
  assert.equal(sanitizeSubmissionId(12), 12);

  const cleaned = sanitizeEventProperties({
    answered: true,
    answerLengthBucket: '51-150',
    offerId: 'intro-call',
    offerVariant: 'B',
    email: 'a@b.sk',
    displayName: 'Jana',
    text: 'veľmi osobný opis situácie',
    situationDescription: 'tajomstvo',
  });
  assert.deepEqual(cleaned, {
    answered: true,
    answerLengthBucket: '51-150',
    offerId: 'intro-call',
    offerVariant: 'B',
  });
  assert.equal(sanitizeEventProperties({ answerLengthBucket: 'secret-text' }), null);

  assert.equal(situationMap.getQuestionById('Q1').id, 'Q1');
  assert.ok(ALLOWED_EVENT_TYPES.has('map_question_skipped'));
  assert.ok(ALLOWED_EVENT_TYPES.has('offer_viewed'));
  assert.ok(ALLOWED_EVENT_TYPES.has('offer_clicked'));
  assert.ok(ALLOWED_EVENT_TYPES.has('offer_converted'));
  assert.ok(ALLOWED_EVENT_TYPES.has('personal_response_created'));
  assert.equal(isClientEventType('personal_response_sent'), false);
  assert.equal(isClientEventType('result_viewed'), true);

  const droppedSensitive = sanitizeEventProperties({
    responseStatus: 'sent',
    timeToResponseBucket: '4-24h',
    promptVersion: 'ai-summary-v1',
    email: 'a@b.sk',
    response: 'toto je osobná odpoveď',
    situationDescription: 'tajomstvo',
    humanSummary: 'interný text',
  });
  assert.deepEqual(droppedSensitive, {
    responseStatus: 'sent',
    timeToResponseBucket: '4-24h',
    promptVersion: 'ai-summary-v1',
  });
});
