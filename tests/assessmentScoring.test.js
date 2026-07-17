const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reverseLikert,
  normalizePercent,
  scoreAssessment,
} = require('../src/lib/assessmentScoring');
const { questions, dimensions, bottlenecks } = require('../src/config/assessmentAutopilot');

function allAnswers(value) {
  const answers = {};
  for (const q of questions) answers[q.id] = value;
  return answers;
}

function answersWithOverrides(base, overrides) {
  return { ...allAnswers(base), ...overrides };
}

test('reverseLikert inverts 1..5', () => {
  assert.equal(reverseLikert(1), 5);
  assert.equal(reverseLikert(2), 4);
  assert.equal(reverseLikert(3), 3);
  assert.equal(reverseLikert(5), 1);
});

test('normalizePercent maps raw 6..30 to 0..100', () => {
  assert.equal(normalizePercent(6), 0);
  assert.equal(normalizePercent(30), 100);
  assert.equal(normalizePercent(18), 50);
});

test('config has 24 questions and five reverse-scored items', () => {
  assert.equal(questions.length, 24);
  const reversed = questions.filter((q) => q.reverseScored).map((q) => q.id).sort();
  assert.deepEqual(reversed, ['A05', 'E05', 'E06', 'I05', 'R05']);
});

test('all-neutral answers score mid and are dual/balanced', () => {
  const result = scoreAssessment({
    questions,
    dimensions,
    bottlenecks,
    answers: allAnswers(3),
  });
  for (const dim of dimensions) {
    assert.equal(result.scores[dim.id].raw, 18);
    assert.equal(result.scores[dim.id].percent, 50);
  }
  assert.equal(result.isDualPrimary, true);
  assert.equal(result.isBalanced, true);
});

test('high identity pressure selects identity_loop primary', () => {
  const answers = allAnswers(1);
  for (const q of questions) {
    if (q.dimensionId === 'identity') {
      answers[q.id] = q.reverseScored ? 1 : 5;
    }
  }
  const result = scoreAssessment({ questions, dimensions, bottlenecks, answers });
  assert.equal(result.primaryBottleneck, 'identity_loop');
  assert.equal(result.isDualPrimary, false);
  assert.ok(result.scores.identity.percent > result.scores.autopilot.percent);
});

test('reverse-scored item contributes inverted value', () => {
  const answers = answersWithOverrides(3, { A05: 5 });
  const withHigh = scoreAssessment({ questions, dimensions, bottlenecks, answers });
  const baseline = scoreAssessment({
    questions,
    dimensions,
    bottlenecks,
    answers: allAnswers(3),
  });
  // A05 reverse: answer 5 → scored 1 → autopilot raw lower than baseline
  assert.ok(withHigh.scores.autopilot.raw < baseline.scores.autopilot.raw);
});

test('tie within 5% marks dual primary', () => {
  const answers = allAnswers(2);
  for (const q of questions) {
    if (q.dimensionId === 'identity') answers[q.id] = q.reverseScored ? 2 : 4;
    if (q.dimensionId === 'energy') answers[q.id] = q.reverseScored ? 2 : 4;
  }
  // Nudge identity one Likert point higher on one non-reverse item
  answers.I01 = 5;
  const result = scoreAssessment({ questions, dimensions, bottlenecks, answers });
  const idPct = result.scores.identity.percent;
  const enPct = result.scores.energy.percent;
  assert.ok(Math.abs(idPct - enPct) <= 5);
  assert.equal(result.isDualPrimary, true);
  assert.ok(
    result.primaryBottleneck === 'identity_loop' || result.primaryBottleneck === 'energy_drain'
  );
});
