const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../src/middleware/apiError');
const {
  validateEmail,
  validateAnswers,
} = require('../src/services/assessmentService');
const { questions } = require('../src/config/assessmentAutopilot');

test('validateEmail normalizes and rejects bad input', () => {
  assert.equal(validateEmail('  A@B.SK '), 'a@b.sk');
  assert.throws(() => validateEmail(''), (err) => err instanceof ApiError);
  assert.throws(() => validateEmail('not-an-email'), (err) => err instanceof ApiError);
});

test('validateAnswers requires all question ids and 1..5 scores', () => {
  const answers = {};
  for (const q of questions) answers[q.id] = 3;
  assert.deepEqual(validateAnswers(answers), answers);

  assert.throws(() => validateAnswers({ ...answers, EXTRA: 3 }), (err) => err instanceof ApiError);

  const missing = { ...answers };
  delete missing.A01;
  assert.throws(() => validateAnswers(missing), (err) => err instanceof ApiError);

  assert.throws(
    () => validateAnswers({ ...answers, A01: 9 }),
    (err) => err instanceof ApiError
  );
});
