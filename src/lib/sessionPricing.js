/**
 * Session totals and supplementary payment math (see docs/SESSION-PRICING.md).
 * Amounts in **euros** for UI; API may convert to cents.
 */

/** Minimum cumulative completed payment for the session (product rule). */
const MIN_SESSION_TOTAL_EUR = 45;

/** Suggested **target totals** (full payment tiers); not a maximum — user may pay more. */
const SUGGESTED_SESSION_TOTAL_TIERS_EUR = [45, 65, 85, 105];

/** Default custom total when choosing “full now” in booking (euros). */
const DEFAULT_CUSTOM_FULL_PAYMENT_EUR = 125;

/**
 * @param {number} paidTotalCents
 * @returns {{ targetTotalEur: number, supplementCents: number }[]}
 */
function suggestedSupplementsFromPaid(paidTotalCents) {
  const paid = Math.max(0, Math.round(paidTotalCents));
  const out = [];
  for (const tierEur of SUGGESTED_SESSION_TOTAL_TIERS_EUR) {
    const targetCents = tierEur * 100;
    if (targetCents <= paid) continue;
    out.push({
      targetTotalEur: tierEur,
      supplementCents: targetCents - paid,
    });
  }
  return out;
}

module.exports = {
  MIN_SESSION_TOTAL_EUR,
  MIN_SESSION_TOTAL_CENTS: MIN_SESSION_TOTAL_EUR * 100,
  SUGGESTED_SESSION_TOTAL_TIERS_EUR,
  DEFAULT_CUSTOM_FULL_PAYMENT_EUR,
  suggestedSupplementsFromPaid,
};
