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
  assert.equal(out.situationType, 'repeating');
  assert.equal(out.duration, 'over_3_years');
  assert.deepEqual(out.peopleInvolved, ['self', 'partner']);
  assert.equal(out.constellationExperience, true);
  assert.equal(out.perceivedBarrier, 'depends_on_other');
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
  assert.equal(recap.sections.situation.topicLabel, 'partnerský vzťah');
  assert.match(recap.sections.situation.description, /hádky/);
  assert.ok(recap.sections.perception.paragraphs.some((p) => p.includes('Uviedol/a si')));
  assert.ok(recap.sections.attempts.items.includes('konšteláciu'));
  assert.match(recap.sections.desired.barrierLine, /závisí to aj od druhého človeka/);
  assert.doesNotMatch(JSON.stringify(recap.sections), /Príčinou je|To znamená, že/);
  assert.match(recap.disclaimer, /nie je diagnózou/);
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
