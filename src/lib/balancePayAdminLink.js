const sessionPricing = require('./sessionPricing');
const { loadBalanceReservationState } = require('./balancePayReservationState');
const { signBalancePayToken } = require('./balancePayToken');

/** Default signed-link lifetime when generated from admin (30 days). */
const BALANCE_PAY_ADMIN_LINK_TTL_SEC = 30 * 24 * 3600;

function buildPublicBalancePayUrl(token) {
  const path = `/platba-doplatok?token=${encodeURIComponent(token)}`;
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} reservationId
 * @returns {Promise<{
 *   state: 'ready' | 'not_confirmed' | 'below_minimum' | 'already_done' | 'pending_checkout' | 'secret_missing' | 'missing';
 *   message: string | null;
 *   url: string | null;
 *   paidEuros: number | null;
 *   linkTtlDays: number;
 * }>}
 */
async function resolveBalancePayAdminLink(pool, reservationId) {
  const ttlDays = Math.round(BALANCE_PAY_ADMIN_LINK_TTL_SEC / (24 * 3600));
  const data = await loadBalanceReservationState(pool, reservationId);
  if (data.kind === 'missing') {
    return { state: 'missing', message: null, url: null, paidEuros: null, linkTtlDays: ttlDays };
  }

  const { resv, paidCents, topupAlreadyCompleted, topupPending } = data;
  const paidEuros = Math.round((paidCents / 100) * 100) / 100;

  if (resv.status !== 'confirmed') {
    return {
      state: 'not_confirmed',
      message: 'Odkaz na doplatok je len pre potvrdené rezervácie.',
      url: null,
      paidEuros,
      linkTtlDays: ttlDays,
    };
  }

  if (paidCents < sessionPricing.MIN_SESSION_TOTAL_CENTS) {
    return {
      state: 'below_minimum',
      message: `Celková úhrada (${paidEuros} €) ešte nedosiahla minimum ${sessionPricing.MIN_SESSION_TOTAL_EUR} €.`,
      url: null,
      paidEuros,
      linkTtlDays: ttlDays,
    };
  }

  if (topupAlreadyCompleted) {
    return {
      state: 'already_done',
      message: 'Voliteľný doplatok za toto sedenie už bol zaznamenaný.',
      url: null,
      paidEuros,
      linkTtlDays: ttlDays,
    };
  }

  if (topupPending) {
    return {
      state: 'pending_checkout',
      message: 'Klient má nedokončenú platbu doplatku v Stripe — odkaz zatiaľ negenerujeme nový.',
      url: null,
      paidEuros,
      linkTtlDays: ttlDays,
    };
  }

  let token;
  try {
    token = signBalancePayToken(reservationId, BALANCE_PAY_ADMIN_LINK_TTL_SEC);
  } catch (e) {
    const msg =
      process.env.NODE_ENV === 'production'
        ? 'Nastavte premennú BALANCE_PAY_TOKEN_SECRET, aby sa dal odkaz podpísať.'
        : (e && e.message) || 'Nepodarilo sa vytvoriť podpis odkazu.';
    return {
      state: 'secret_missing',
      message: msg,
      url: null,
      paidEuros,
      linkTtlDays: ttlDays,
    };
  }

  const url = buildPublicBalancePayUrl(token);
  const message =
    url.startsWith('/') && !(process.env.BASE_URL || '').trim()
      ? 'Tip: nastavte BASE_URL v prostredí, aby bol odkaz v e-maile absolútny (doména + cesta).'
      : null;

  return {
    state: 'ready',
    message,
    url,
    paidEuros,
    linkTtlDays: ttlDays,
  };
}

module.exports = {
  resolveBalancePayAdminLink,
  BALANCE_PAY_ADMIN_LINK_TTL_SEC,
};
