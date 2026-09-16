/**
 * Internal AI summary boundary for Mapa situácie.
 * No third-party provider is selected. `mock` restates facts in-process.
 */

const situationMap = require('../config/situationMap');
const { getAiSummaryConfig } = require('../config/situationMapAiSummary');
const { optionLabel, joinSkList } = require('../lib/situationMapRecap');

function line(label, value) {
  const text = String(value || '').trim();
  return text ? `${label}: ${text}` : `${label}: (nevyplnené)`;
}

function quotedUserText(label, value) {
  const text = String(value || '').trim();
  if (!text) return `${label}: (nevyplnené)`;
  return `${label} (vlastné slová používateľa): „${text}“`;
}

/**
 * Neutral restatement of Map answers. No diagnosis, cause, or recommendation.
 * @param {object} answers
 * @param {object} [config]
 */
function buildFactualRestatement(answers, config = situationMap) {
  const a = answers || {};
  const byField = {};
  for (const q of config.getEnabledQuestions()) {
    byField[q.field] = q;
  }

  const lines = [
    'Interný faktický draft. Obsahuje len to, čo používateľ uviedol; nie je to interpretácia.',
  ];

  const qTopic = byField.topic;
  if (qTopic) {
    const topic =
      a.topic === qTopic.otherValue && String(a.topicOther || '').trim()
        ? String(a.topicOther).trim()
        : optionLabel(qTopic, a.topic);
    lines.push(line('Oblasť (Q1)', topic));
  }

  const qType = byField.situationType;
  if (qType) lines.push(line('Typ situácie (Q3)', optionLabel(qType, a.situationType)));

  const qDuration = byField.duration;
  if (qDuration) lines.push(line('Trvanie (Q4)', optionLabel(qDuration, a.duration)));

  const qPeople = byField.peopleInvolved;
  if (qPeople) {
    const people = [];
    for (const code of a.peopleInvolved || []) {
      if (qPeople.otherValue && code === qPeople.otherValue) {
        people.push(String(a.peopleInvolvedOther || '').trim() || optionLabel(qPeople, code));
      } else {
        people.push(optionLabel(qPeople, code));
      }
    }
    lines.push(line('Koho sa týka (Q5)', joinSkList(people)));
  }

  lines.push(quotedUserText('Opis situácie (Q2)', a.situationDescription));

  const qAttempts = byField.attempts;
  if (qAttempts) {
    const items = [];
    for (const code of a.attempts || []) {
      if (qAttempts.otherValue && code === qAttempts.otherValue) {
        items.push(String(a.attemptsOther || '').trim() || optionLabel(qAttempts, code));
      } else {
        items.push(optionLabel(qAttempts, code));
      }
    }
    lines.push(line('Čo už skúšal/a (Q6)', joinSkList(items)));
  }

  lines.push(quotedUserText('Čo by malo byť inak (Q7)', a.desiredChange));

  const qBarrier = byField.perceivedBarrier;
  if (qBarrier) {
    const barrier =
      a.perceivedBarrier === qBarrier.otherValue && String(a.perceivedBarrierOther || '').trim()
        ? String(a.perceivedBarrierOther).trim()
        : optionLabel(qBarrier, a.perceivedBarrier);
    lines.push(line('Vnímaná prekážka (Q8)', barrier));
  }

  return lines.join('\n');
}

function generateSummaryDraft(answers, config = situationMap) {
  const ai = getAiSummaryConfig();
  if (ai.mode === 'off') {
    return { ok: false, reason: 'disabled', promptVersion: ai.promptVersion };
  }
  if (ai.mode !== 'mock') {
    return { ok: false, reason: 'provider_not_configured', promptVersion: ai.promptVersion };
  }
  return {
    ok: true,
    source: 'mock',
    promptVersion: ai.promptVersion,
    draft: buildFactualRestatement(answers, config),
  };
}

module.exports = {
  buildFactualRestatement,
  generateSummaryDraft,
};
