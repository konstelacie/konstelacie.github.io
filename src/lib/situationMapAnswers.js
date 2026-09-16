/**
 * Reconstruct Map answers from a submission row and format them for admin review.
 */

const { optionLabel, joinSkList } = require('./situationMapRecap');

function answersFromSubmission(row) {
  if (!row) return null;
  return {
    topic: row.topic ?? null,
    topicOther: row.topicOther ?? null,
    situationDescription: row.situationDescription == null ? '' : String(row.situationDescription),
    situationType: row.situationType ?? null,
    duration: row.duration ?? null,
    peopleInvolved: Array.isArray(row.peopleInvolved) ? row.peopleInvolved : [],
    peopleInvolvedOther: row.peopleInvolvedOther ?? null,
    attempts: Array.isArray(row.attempts) ? row.attempts : [],
    attemptsOther: row.attemptsOther ?? null,
    constellationExperience: Boolean(row.constellationExperience),
    desiredChange: row.desiredChange == null ? '' : String(row.desiredChange),
    perceivedBarrier: row.perceivedBarrier ?? null,
    perceivedBarrierOther: row.perceivedBarrierOther ?? null,
  };
}

function formatSingle(question, answers) {
  const value = answers[question.field];
  if (value == null || value === '') return '';
  if (question.otherValue && value === question.otherValue) {
    const extra = String(answers[question.otherField] || '').trim();
    return extra || optionLabel(question, value);
  }
  return optionLabel(question, value);
}

function formatMulti(question, answers) {
  const codes = answers[question.field];
  if (!Array.isArray(codes) || codes.length === 0) return '';
  const labels = [];
  for (const code of codes) {
    if (question.otherValue && code === question.otherValue) {
      const extra = String(answers[question.otherField] || '').trim();
      labels.push(extra || optionLabel(question, code));
    } else {
      labels.push(optionLabel(question, code));
    }
  }
  return joinSkList(labels);
}

function formatAnswerDisplay(question, answers) {
  if (!question) return '';
  if (question.type === 'textarea') {
    return String(answers[question.field] || '').trim();
  }
  if (question.type === 'multi') return formatMulti(question, answers);
  return formatSingle(question, answers);
}

function listQuestionAnswers(answers, config) {
  const list = [];
  for (const question of config.getEnabledQuestions()) {
    const value = formatAnswerDisplay(question, answers);
    const skipped =
      Boolean(question.skippable) && question.type === 'textarea' && !value;
    list.push({
      id: question.id,
      field: question.field,
      text: question.text,
      skipped,
      value,
    });
  }
  return list;
}

function bodyForSend(response) {
  const finalText = String((response && response.finalResponse) || '').trim();
  if (finalText) return finalText;
  return String((response && response.responseDraft) || '').trim();
}

module.exports = {
  answersFromSubmission,
  formatAnswerDisplay,
  listQuestionAnswers,
  bodyForSend,
};
