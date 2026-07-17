/**
 * Life Autopilot Assessment scoring (shared Node + browser).
 * Spec: docs/funnel/it-dev/014-scoring
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AssessmentScoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIE_THRESHOLD_PERCENT = 5;
  const RAW_MIN = 6;
  const RAW_MAX = 30;

  function reverseLikert(value) {
    return 6 - value;
  }

  function normalizePercent(rawSum) {
    return ((rawSum - RAW_MIN) / (RAW_MAX - RAW_MIN)) * 100;
  }

  /**
   * @param {object} options
   * @param {Array<{ id: string, dimensionId: string, reverseScored?: boolean }>} options.questions
   * @param {Array<{ id: string, order?: number }>} options.dimensions
   * @param {Record<string, string>} options.bottlenecks - dimensionId → resultId
   * @param {Record<string, number>} options.answers - questionId → 1..5
   * @param {number} [options.tieThresholdPercent]
   */
  function scoreAssessment(options) {
    const questions = options.questions || [];
    const dimensions = [...(options.dimensions || [])].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );
    const bottlenecks = options.bottlenecks || {};
    const answers = options.answers || {};
    const tieThreshold =
      typeof options.tieThresholdPercent === 'number'
        ? options.tieThresholdPercent
        : TIE_THRESHOLD_PERCENT;

    const rawByDimension = {};
    for (const dim of dimensions) {
      rawByDimension[dim.id] = 0;
    }

    for (const q of questions) {
      const raw = answers[q.id];
      if (!Number.isInteger(raw) || raw < 1 || raw > 5) {
        throw new Error(`Invalid answer for ${q.id}`);
      }
      const scored = q.reverseScored ? reverseLikert(raw) : raw;
      if (!(q.dimensionId in rawByDimension)) {
        throw new Error(`Unknown dimension ${q.dimensionId}`);
      }
      rawByDimension[q.dimensionId] += scored;
    }

    const scores = {};
    const ranked = [];
    for (const dim of dimensions) {
      const raw = rawByDimension[dim.id];
      const percent = normalizePercent(raw);
      scores[dim.id] = {
        raw,
        percent: Math.round(percent * 10) / 10,
      };
      ranked.push({
        dimensionId: dim.id,
        resultId: bottlenecks[dim.id],
        raw,
        percent: scores[dim.id].percent,
      });
    }

    ranked.sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent;
      return (a.dimensionId < b.dimensionId ? -1 : a.dimensionId > b.dimensionId ? 1 : 0);
    });

    const top = ranked[0];
    const second = ranked[1];
    const diff = top && second ? Math.abs(top.percent - second.percent) : 0;
    const isDualPrimary = Boolean(top && second && diff <= tieThreshold);
    const spread =
      ranked.length > 0
        ? Math.max(...ranked.map((r) => r.percent)) - Math.min(...ranked.map((r) => r.percent))
        : 0;
    const isBalanced = spread <= tieThreshold;
    const isLowOverall = ranked.every((r) => r.percent <= 40);

    return {
      scores,
      ranked,
      primaryBottleneck: top ? top.resultId : null,
      secondaryBottleneck: second ? second.resultId : null,
      isDualPrimary,
      isBalanced,
      isLowOverall,
      tieThresholdPercent: tieThreshold,
    };
  }

  return {
    TIE_THRESHOLD_PERCENT,
    RAW_MIN,
    RAW_MAX,
    reverseLikert,
    normalizePercent,
    scoreAssessment,
  };
});
