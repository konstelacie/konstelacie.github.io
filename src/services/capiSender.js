const crypto = require('crypto');
const config = require('../config');
const { getPool } = require('../db');
const pageVisibility = require('../config/pageVisibility');
const { logLine } = require('../lib/structuredLog');
const { centsToLeadAmount } = require('../lib/leadEventContext');
const {
  tryInsertCapiLog,
  updateCapiLogResult,
  logCapiError,
  handleCapiPoolUnavailable,
} = require('../db/repositories/capiSendLogRepo');
const systemAlertService = require('./systemAlertService');

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;

/**
 * @param {string} lockToken
 * @returns {string}
 */
function buildLeadEventId(lockToken) {
  return `lead:${lockToken}`;
}

/**
 * @param {string} email
 * @returns {string|null}
 */
function hashEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * @param {object|null|undefined} payment
 * @param {{ marketingConsent?: boolean, suppressTracking?: boolean, paymentType?: string }} [ctx]
 * @param {string} eventName
 * @returns {string|null}
 */
function evaluateSkipReason(payment, ctx, eventName) {
  const capi = config.metaCapi;
  if (!capi.enabled) return 'not_enabled';
  if (!capi.accessToken || !capi.pixelId) return 'not_configured';

  const marketingConsent =
    payment != null && payment.marketing_consent != null
      ? Boolean(payment.marketing_consent)
      : Boolean(ctx?.marketingConsent);
  if (!marketingConsent) return 'no_consent';

  const suppressed =
    payment != null && payment.suppressed_tracking != null
      ? Boolean(payment.suppressed_tracking)
      : Boolean(ctx?.suppressTracking);
  if (suppressed) return 'notrack';

  if (eventName === 'Purchase') {
    const paymentType = payment?.payment_type ?? ctx?.paymentType;
    if (paymentType === 'topup') return 'topup';
  }

  return null;
}

/**
 * @param {object|null|undefined} sessionMetadata
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
function resolveEventSourceUrl(sessionMetadata, fallback = null) {
  const md = sessionMetadata || {};
  const funnelName = md.funnelName ? String(md.funnelName).trim() : '';
  if (funnelName) {
    const base = (process.env.BASE_URL || '').replace(/\/$/, '');
    const path = pageVisibility.buildPublicPath(funnelName);
    if (path) return `${base}${path}`;
  }
  return fallback || null;
}

/**
 * @param {object} params
 * @returns {object}
 */
function buildUserData({ email, clientIp, clientUserAgent, metaFbp, metaFbc }) {
  const userData = {};
  const em = hashEmail(email);
  if (em) userData.em = em;
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (metaFbp) userData.fbp = metaFbp;
  if (metaFbc) userData.fbc = metaFbc;
  return userData;
}

/**
 * @param {object} eventPayload
 * @returns {Promise<{ ok: boolean, httpStatus: number, body: object|null, errorMessage: string|null }>}
 */
async function postToMetaApi(eventPayload) {
  const capi = config.metaCapi;
  const url = `https://graph.facebook.com/${capi.apiVersion}/${capi.pixelId}/events`;

  const body = {
    data: [eventPayload],
    access_token: capi.accessToken,
  };
  if (capi.testEventCode) {
    body.test_event_code = capi.testEventCode;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      let responseBody = null;
      try {
        responseBody = await res.json();
      } catch {
        responseBody = null;
      }

      if (res.ok) {
        return { ok: true, httpStatus: res.status, body: responseBody, errorMessage: null };
      }

      const errMsg =
        (responseBody && (responseBody.error?.message || responseBody.message)) ||
        `HTTP ${res.status}`;

      if (res.status >= 400 && res.status < 500) {
        return { ok: false, httpStatus: res.status, body: responseBody, errorMessage: errMsg };
      }

      lastError = errMsg;
    } catch (err) {
      clearTimeout(timer);
      lastError = err?.name === 'AbortError' ? 'request timeout' : err?.message || String(err);
    }
  }

  return { ok: false, httpStatus: 0, body: null, errorMessage: lastError || 'request failed' };
}

/**
 * @param {object} params
 */
async function sendCapiEvent({
  eventName,
  eventId,
  paymentId = null,
  email,
  payment = null,
  skipContext = null,
  eventTime = Math.floor(Date.now() / 1000),
  eventSourceUrl = null,
  customData = {},
  userDataOverrides = null,
}) {
  if (eventId == null || String(eventId).trim() === '') {
    logCapiError('capi_missing_event_id', { eventName });
    return;
  }

  const pool = getPool();
  if (!pool) {
    handleCapiPoolUnavailable({ eventName, eventId });
    return;
  }

  const skipReason = evaluateSkipReason(payment, skipContext, eventName);

  let logRow;
  try {
    logRow = await tryInsertCapiLog(pool, {
      eventName,
      eventId,
      paymentId,
      status: skipReason ? 'skipped' : 'pending',
      skipReason,
    });
  } catch (err) {
    logCapiError('capi_send_log_insert_failed', {
      eventName,
      eventId,
      err: err?.message || String(err),
    });
    return;
  }

  if (!logRow.inserted) return;

  if (skipReason) {
    logLine({
      level: 'info',
      tag: 'capi_event_skipped',
      eventName,
      eventId,
      skipReason,
    });
    return;
  }

  const userData = userDataOverrides || buildUserData({
    email,
    clientIp: payment?.client_ip,
    clientUserAgent: payment?.client_user_agent,
    metaFbp: payment?.meta_fbp,
    metaFbc: payment?.meta_fbc,
  });

  const eventPayload = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
  };
  if (eventSourceUrl) {
    eventPayload.event_source_url = eventSourceUrl;
  }

  try {
    const result = await postToMetaApi(eventPayload);
    await updateCapiLogResult(logRow.id, {
      status: result.ok ? 'sent' : 'failed',
      httpStatus: result.httpStatus || null,
      metaResponse: result.body,
      errorMessage: result.errorMessage,
      sentAt: result.ok,
    });

    if (result.ok) {
      void systemAlertService.resolveCapiAuthFailed().catch(() => {});
    } else if (result.httpStatus === 401 || result.httpStatus === 403) {
      void systemAlertService
        .createCapiAuthFailed({
          httpStatus: result.httpStatus,
          errorMessage: result.errorMessage,
        })
        .catch(() => {});
    }

    logLine({
      level: result.ok ? 'info' : 'warn',
      tag: result.ok ? 'capi_event_sent' : 'capi_event_failed',
      eventName,
      eventId,
      httpStatus: result.httpStatus,
      error: result.errorMessage,
    });
  } catch (err) {
    try {
      await updateCapiLogResult(logRow.id, {
        status: 'failed',
        errorMessage: err?.message || String(err),
        sentAt: false,
      });
    } catch (updateErr) {
      logCapiError('capi_send_log_update_failed', {
        eventName,
        eventId,
        err: updateErr?.message || String(updateErr),
      });
    }
    logCapiError('capi_send_failed', {
      eventName,
      eventId,
      err: err?.message || String(err),
    });
  }
}

/**
 * @param {{
 *   email: string,
 *   lockToken?: string,
 *   eventId?: string,
 *   contentType?: string,
 *   sourceUrl?: string|null,
 *   formId?: string|null,
 * }} params
 * @param {ReturnType<import('../lib/metaAttribution').extractMetaAttribution>} attribution
 */
function scheduleCapiLead(params, attribution) {
  const eventId =
    (params.eventId && String(params.eventId).trim()) ||
    (params.lockToken ? buildLeadEventId(params.lockToken) : '');
  if (!eventId) {
    logCapiError('capi_lead_schedule_failed', { err: 'missing_event_id' });
    return;
  }
  void sendCapiEvent({
    eventName: 'Lead',
    eventId,
    email: params.email,
    skipContext: {
      marketingConsent: attribution.marketingConsent,
      suppressTracking: attribution.suppressTracking,
    },
    eventSourceUrl: params.sourceUrl || null,
    customData: {
      content_type: params.contentType || 'session',
      ...(params.formId ? { content_name: params.formId } : {}),
    },
    userDataOverrides: buildUserData({
      email: params.email,
      clientIp: attribution.clientIp,
      clientUserAgent: attribution.clientUserAgent,
      metaFbp: attribution.metaFbp,
      metaFbc: attribution.metaFbc,
    }),
  }).catch((err) => {
    logCapiError('capi_lead_schedule_failed', { err: err?.message || String(err) });
  });
}

/**
 * @param {object} params
 */
function scheduleCapiInitiateCheckout({
  email,
  paymentId,
  providerRef,
  amountCents,
  paymentType,
  funnel,
  sourceUrl,
  attribution,
}) {
  void sendCapiEvent({
    eventName: 'InitiateCheckout',
    eventId: providerRef,
    paymentId,
    email,
    payment: {
      meta_fbp: attribution.metaFbp,
      meta_fbc: attribution.metaFbc,
      marketing_consent: attribution.marketingConsent ? 1 : 0,
      suppressed_tracking: attribution.suppressTracking ? 1 : 0,
      client_ip: attribution.clientIp,
      client_user_agent: attribution.clientUserAgent,
      payment_type: paymentType,
    },
    skipContext: {
      marketingConsent: attribution.marketingConsent,
      suppressTracking: attribution.suppressTracking,
      paymentType,
    },
    eventSourceUrl: resolveEventSourceUrl(funnel, sourceUrl),
    customData: {
      value: centsToLeadAmount(amountCents),
      currency: 'EUR',
      content_type: 'session',
      num_items: 1,
      ...(funnel?.funnelName ? { funnelName: funnel.funnelName } : {}),
      ...(funnel?.funnelCampaign ? { funnelCampaign: funnel.funnelCampaign } : {}),
      ...(funnel?.funnelVideoId ? { funnelVideoId: funnel.funnelVideoId } : {}),
    },
    userDataOverrides: buildUserData({
      email,
      clientIp: attribution.clientIp,
      clientUserAgent: attribution.clientUserAgent,
      metaFbp: attribution.metaFbp,
      metaFbc: attribution.metaFbc,
    }),
  }).catch((err) => {
    logCapiError('capi_initiate_checkout_schedule_failed', { err: err?.message || String(err) });
  });
}

/**
 * @param {object} payment - row from payments with meta attribution columns
 * @param {object} session - Stripe checkout session
 */
function scheduleCapiPurchase(payment, session) {
  const md = session?.metadata || {};
  const purchaseEmail =
    (session.customer_email && String(session.customer_email).trim()) ||
    (session.customer_details && session.customer_details.email) ||
    '';

  void sendCapiEvent({
    eventName: 'Purchase',
    eventId: session?.id,
    paymentId: payment.id != null ? Number(payment.id) : null,
    email: purchaseEmail,
    payment,
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: resolveEventSourceUrl(md),
    customData: {
      value: centsToLeadAmount(payment.amount_cents),
      currency: 'EUR',
      content_type: 'session',
      ...(md.funnelName ? { funnelName: String(md.funnelName).trim() } : {}),
      ...(md.funnelCampaign ? { funnelCampaign: String(md.funnelCampaign).trim() } : {}),
      ...(md.funnelVideoId ? { funnelVideoId: String(md.funnelVideoId).trim() } : {}),
    },
  }).catch((err) => {
    logCapiError('capi_purchase_schedule_failed', {
      paymentId: payment.id,
      sessionId: session.id,
      err: err?.message || String(err),
    });
  });
}

module.exports = {
  buildLeadEventId,
  hashEmail,
  evaluateSkipReason,
  buildUserData,
  postToMetaApi,
  sendCapiEvent,
  scheduleCapiLead,
  scheduleCapiInitiateCheckout,
  scheduleCapiPurchase,
};
