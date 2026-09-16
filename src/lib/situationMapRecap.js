/**
 * Deterministic recap for Mapa situácie. No scoring, diagnosis, or advice.
 */

function optionLabel(question, value) {
  if (value == null || value === '') return '';
  if (!question) return String(value);
  const lists = [question.options, question.retiredOptions];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return String(value);
}

function joinSkList(items) {
  const list = (items || []).map((s) => String(s).trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} a ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} a ${list[list.length - 1]}`;
}

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ''
  );
}

function peopleLabels(question, codes, otherText) {
  const labels = [];
  for (const code of codes || []) {
    if (question && question.otherValue && code === question.otherValue) {
      const extra = String(otherText || '').trim();
      labels.push(extra || optionLabel(question, code));
    } else {
      labels.push(optionLabel(question, code));
    }
  }
  return labels;
}

/**
 * @param {object} input
 * @param {object} input.answers
 * @param {object} input.config — situationMap module
 */
function buildSituationMapRecap(input) {
  const config = input.config;
  const answers = input.answers || {};
  const copy = config.recapCopy || {};
  const byField = {};
  for (const q of config.getEnabledQuestions()) {
    byField[q.field] = q;
  }

  const qTopic = byField.topic;
  const qType = byField.situationType;
  const qDuration = byField.duration;
  const qPeople = byField.peopleInvolved;
  const qAttempts = byField.attempts;
  const qBarrier = byField.perceivedBarrier;

  const topicLabel =
    qTopic && answers.topic === qTopic.otherValue && String(answers.topicOther || '').trim()
      ? String(answers.topicOther).trim()
      : optionLabel(qTopic, answers.topic);

  const perception = [];
  if (qType && answers.situationType) {
    perception.push(fill(copy.perceptionType, { label: optionLabel(qType, answers.situationType) }));
  }
  if (qDuration && answers.duration) {
    perception.push(fill(copy.perceptionDuration, { label: optionLabel(qDuration, answers.duration) }));
  }
  if (qPeople && Array.isArray(answers.peopleInvolved) && answers.peopleInvolved.length) {
    const people = joinSkList(
      peopleLabels(qPeople, answers.peopleInvolved, answers.peopleInvolvedOther)
    );
    if (people) {
      perception.push(fill(copy.perceptionPeople, { people }));
    }
  }

  const attemptItems = [];
  if (qAttempts && Array.isArray(answers.attempts)) {
    for (const code of answers.attempts) {
      if (qAttempts.otherValue && code === qAttempts.otherValue) {
        const extra = String(answers.attemptsOther || '').trim();
        attemptItems.push(extra || optionLabel(qAttempts, code));
      } else {
        attemptItems.push(optionLabel(qAttempts, code));
      }
    }
  }

  let barrierLine = null;
  if (qBarrier && answers.perceivedBarrier) {
    const barrierLabel =
      answers.perceivedBarrier === qBarrier.otherValue &&
      String(answers.perceivedBarrierOther || '').trim()
        ? String(answers.perceivedBarrierOther).trim()
        : optionLabel(qBarrier, answers.perceivedBarrier);
    barrierLine = fill(copy.barrierLead, { label: barrierLabel });
  }

  const description = String(answers.situationDescription || '').trim();
  const desiredText = String(answers.desiredChange || '').trim();

  return {
    sections: {
      situation: {
        title: copy.situationTitle,
        topicLabel,
        lead: description ? copy.situationLead : null,
        description,
        skippedNote: description ? null : copy.situationSkipped || null,
      },
      perception: {
        title: copy.perceptionTitle,
        paragraphs: perception,
      },
      attempts: {
        title: copy.attemptsTitle,
        items: attemptItems,
      },
      desired: {
        title: copy.desiredTitle,
        text: desiredText,
        skippedNote: desiredText ? null : copy.desiredSkipped || null,
        barrierLine,
      },
    },
    disclaimer: copy.disclaimer,
  };
}

module.exports = {
  buildSituationMapRecap,
  optionLabel,
  joinSkList,
};
