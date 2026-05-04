const { logLine } = require('../lib/structuredLog');

const KROS_BASE_URL = 'https://api-economy.kros.sk/api';
const KROS_MAX_PER_SECOND = 10;
const KROS_MAX_PER_MINUTE = 300;

const requestTimestampsMs = [];
let rateGate = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneOld(nowMs) {
  while (requestTimestampsMs.length > 0 && nowMs - requestTimestampsMs[0] >= 60_000) {
    requestTimestampsMs.shift();
  }
}

async function waitForRateSlot() {
  while (true) {
    const now = Date.now();
    pruneOld(now);
    const lastSecondCount = requestTimestampsMs.filter((ts) => now - ts < 1_000).length;
    const lastMinuteCount = requestTimestampsMs.length;
    if (lastSecondCount < KROS_MAX_PER_SECOND && lastMinuteCount < KROS_MAX_PER_MINUTE) {
      requestTimestampsMs.push(now);
      return;
    }

    let waitMs = 120;
    if (lastSecondCount >= KROS_MAX_PER_SECOND) {
      const earliestSecond = requestTimestampsMs[requestTimestampsMs.length - lastSecondCount];
      waitMs = Math.max(waitMs, 1_000 - (now - earliestSecond) + 5);
    }
    if (lastMinuteCount >= KROS_MAX_PER_MINUTE) {
      const earliestMinute = requestTimestampsMs[0];
      waitMs = Math.max(waitMs, 60_000 - (now - earliestMinute) + 5);
    }
    await sleep(waitMs);
  }
}

async function reserveRateSlot() {
  const run = rateGate.then(async () => {
    await waitForRateSlot();
  });
  rateGate = run.catch(() => {});
  return run;
}

function authHeader() {
  const token = String(process.env.KROS_API_TOKEN || '').trim();
  if (!token) throw new Error('KROS_API_TOKEN is not configured');
  return `Bearer ${token}`;
}

async function fetchJson(url, options) {
  await reserveRateSlot();
  const response = await fetch(url, options);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

/** Standard invoices — POST /api/invoices (primary KROS sync). */
async function postInvoices(payload) {
  try {
    const url = `${KROS_BASE_URL}/invoices`;
    const headers = {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    };
    logLine({
      level: 'info',
      tag: 'kros_client_request',
      request: {
        method: 'POST',
        url,
        headers: {
          ...headers,
          Authorization: 'Bearer ***',
        },
        body: payload,
      },
    });
    return await fetchJson(`${KROS_BASE_URL}/invoices`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logLine({
      level: 'error',
      tag: 'kros_client_post_invoices_error',
      error: err?.message || String(err),
    });
    throw err;
  }
}

async function getInvoice(documentId) {
  try {
    return await fetchJson(`${KROS_BASE_URL}/invoices/${encodeURIComponent(String(documentId))}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader(),
      },
    });
  } catch (err) {
    logLine({
      level: 'error',
      tag: 'kros_client_get_invoice_error',
      error: err?.message || String(err),
      documentId: String(documentId || ''),
    });
    throw err;
  }
}

async function downloadInvoicePdf(documentId) {
  await reserveRateSlot();
  const url = `${KROS_BASE_URL}/invoices/${encodeURIComponent(String(documentId))}/reports/19`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader() },
  });
  const contentType = response.headers.get('content-type') || '';
  logLine({
    level: 'debug',
    tag: 'kros_download_invoice_response',
    documentId: String(documentId),
    status: response.status,
    contentType,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KROS download failed: ${response.status} ${text.slice(0, 200)}`);
  }
  if (contentType.includes('application/pdf')) {
    const buffer = await response.arrayBuffer();
    return { type: 'pdf', buffer: Buffer.from(buffer) };
  }
  // Unexpected: JSON or other — return as text for diagnostics
  const text = await response.text();
  return { type: 'other', contentType, text: text.slice(0, 1000) };
}

module.exports = {
  postInvoices,
  getInvoice,
  downloadInvoicePdf,
};
