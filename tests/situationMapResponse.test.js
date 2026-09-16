const test = require('node:test');
const assert = require('node:assert/strict');
const situationMap = require('../src/config/situationMap');
const { validateAnswers } = require('../src/services/situationMapService');
const { answersFromSubmission, listQuestionAnswers } = require('../src/lib/situationMapAnswers');
const { timeToResponseBucket } = require('../src/lib/situationMapAnalytics');
const {
  buildFactualRestatement,
  generateSummaryDraft,
} = require('../src/services/situationMapAiSummaryService');
const { resolveMode, getAiSummaryConfig } = require('../src/config/situationMapAiSummary');
const { bodyForSend } = require('../src/lib/situationMapAnswers');
const personalResponse = require('../src/config/situationMapPersonalResponse');

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

test('answersFromSubmission round-trips structured Map fields', () => {
  const answers = answersFromSubmission({
    topic: 'relationship',
    topicOther: null,
    situationDescription: 'text Q2',
    situationType: 'repeating',
    duration: 'over_3_years',
    peopleInvolved: ['self'],
    peopleInvolvedOther: null,
    attempts: ['conversation'],
    attemptsOther: null,
    constellationExperience: false,
    desiredChange: 'text Q7',
    perceivedBarrier: 'unknown',
    perceivedBarrierOther: null,
  });
  const listed = listQuestionAnswers(answers, situationMap);
  assert.equal(listed.length, 8);
  assert.equal(listed[0].id, 'Q1');
  assert.equal(listed.find((q) => q.id === 'Q2').value, 'text Q2');
});

test('AI mock restates user words and does not interpret', () => {
  const draft = buildFactualRestatement(validateAnswers(validAnswers()));
  assert.match(draft, /hádky o blízkosti/);
  assert.match(draft, /vlastné slová používateľa/);
  assert.match(draft, /Partnerské vzťahy/);
  assert.doesNotMatch(draft, /príčinou je|diagnóza|odporúčam konšteláciu|systémový vzorec/i);
});

test('AI summary stays off by default and does not pick a provider', () => {
  const prev = process.env.SITUATION_MAP_AI_SUMMARY_MODE;
  delete process.env.SITUATION_MAP_AI_SUMMARY_MODE;
  try {
    assert.equal(resolveMode(undefined), 'off');
    assert.equal(getAiSummaryConfig().mode, 'off');
    const generated = generateSummaryDraft(validateAnswers(validAnswers()));
    assert.equal(generated.ok, false);
    assert.equal(generated.reason, 'disabled');
    assert.equal(generated.promptVersion, 'ai-summary-v1');
  } finally {
    if (prev == null) delete process.env.SITUATION_MAP_AI_SUMMARY_MODE;
    else process.env.SITUATION_MAP_AI_SUMMARY_MODE = prev;
  }
});

test('AI mock mode is explicit and still in-process', () => {
  const prev = process.env.SITUATION_MAP_AI_SUMMARY_MODE;
  process.env.SITUATION_MAP_AI_SUMMARY_MODE = 'mock';
  try {
    const generated = generateSummaryDraft(validateAnswers(validAnswers()));
    assert.equal(generated.ok, true);
    assert.equal(generated.source, 'mock');
    assert.match(generated.draft, /Interný faktický draft/);
  } finally {
    if (prev == null) delete process.env.SITUATION_MAP_AI_SUMMARY_MODE;
    else process.env.SITUATION_MAP_AI_SUMMARY_MODE = prev;
  }
});

test('final response stays separate from AI draft in send payload', () => {
  const body = bodyForSend({
    aiSummaryDraft: 'AI text',
    responseDraft: 'ľudský draft',
    finalResponse: 'finálna verzia',
  });
  assert.equal(body, 'finálna verzia');
  assert.equal(
    bodyForSend({ aiSummaryDraft: 'AI text', responseDraft: 'ľudský draft', finalResponse: '' }),
    'ľudský draft'
  );
});

test('time-to-response buckets stay technical', () => {
  const start = new Date('2026-09-15T08:00:00Z');
  assert.equal(timeToResponseBucket(start, new Date('2026-09-15T08:30:00Z')), '0-1h');
  assert.equal(timeToResponseBucket(start, new Date('2026-09-15T10:00:00Z')), '1-4h');
  assert.equal(timeToResponseBucket(start, new Date('2026-09-16T07:00:00Z')), '4-24h');
  assert.equal(timeToResponseBucket(start, new Date('2026-09-17T08:00:00Z')), '1-3d');
});

test('personal response email copy is configurable and not a marketing lock-in', () => {
  assert.equal(personalResponse.TEMPLATE_ID, 'situation-map-personal-response');
  assert.match(personalResponse.emailCopy.footerNote, /nie je to marketingový e-mail/i);
  assert.equal(personalResponse.fillDisplayName('Ahoj {displayName},', 'Jana'), 'Ahoj Jana,');
  assert.doesNotMatch(JSON.stringify(personalResponse), /poradenstvo|rada zdarma/i);
});
