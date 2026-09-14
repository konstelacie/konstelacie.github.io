/**
 * Deterministic recap for Mapa situácie. No scoring, diagnosis, or advice.
 */

function optionLabel(question, value) {
  if (!question || !question.options) return value ? String(value) : '';
  const hit = question.options.find((o) => o.value === value);
  return hit ? hit.label : String(value);
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
  const byId = {};
  for (const q of config.getEnabledQuestions()) {
    byId[q.id] = q;
  }

  const q1 = byId.Q1;
  const q3 = byId.Q3;
  const q4 = byId.Q4;
  const q5 = byId.Q5;
  const q6 = byId.Q6;
  const q8 = byId.Q8;

  const topicLabel =
    q1 && answers.topic === q1.otherValue && String(answers.topicOther || '').trim()
      ? String(answers.topicOther).trim()
      : optionLabel(q1, answers.topic);

  const perception = [];
  if (q3 && answers.situationType) {
    perception.push(fill(copy.perceptionType, { label: optionLabel(q3, answers.situationType) }));
  }
  if (q4 && answers.duration) {
    perception.push(fill(copy.perceptionDuration, { label: optionLabel(q4, answers.duration) }));
  }
  if (q5 && Array.isArray(answers.peopleInvolved) && answers.peopleInvolved.length) {
    const people = joinSkList(peopleLabels(q5, answers.peopleInvolved, answers.peopleInvolvedOther));
    if (people) {
      perception.push(fill(copy.perceptionPeople, { people }));
    }
  }

  const attemptItems = [];
  if (q6 && Array.isArray(answers.attempts)) {
    for (const code of answers.attempts) {
      if (q6.otherValue && code === q6.otherValue) {
        const extra = String(answers.attemptsOther || '').trim();
        attemptItems.push(extra || optionLabel(q6, code));
      } else {
        attemptItems.push(optionLabel(q6, code));
      }
    }
  }

  let barrierLine = null;
  if (q8 && answers.perceivedBarrier) {
    const barrierLabel =
      answers.perceivedBarrier === q8.otherValue && String(answers.perceivedBarrierOther || '').trim()
        ? String(answers.perceivedBarrierOther).trim()
        : optionLabel(q8, answers.perceivedBarrier);
    barrierLine = fill(copy.barrierLead, { label: barrierLabel });
  }

  return {
    sections: {
      situation: {
        title: copy.situationTitle,
        topicLabel,
        lead: copy.situationLead,
        description: String(answers.situationDescription || '').trim(),
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
        text: String(answers.desiredChange || '').trim(),
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
