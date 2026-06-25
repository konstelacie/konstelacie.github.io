const test = require('node:test');
const assert = require('node:assert/strict');
const krosClient = require('../src/services/krosClient');
const db = require('../src/db');
const systemAlertService = require('../src/services/systemAlertService');
const {
  buildKrosPaymentPayload,
  krosPaymentExternalId,
  syncPaymentToKros,
} = require('../src/services/krosInvoiceService');

const ORIGINAL_KROS_ENABLED = process.env.KROS_ENABLED;
const ORIGINAL_GET_POOL = db.getPool;

const stubs = {
  postPaymentsBatch: krosClient.postPaymentsBatch,
  getInvoiceVariableSymbol: krosClient.getInvoiceVariableSymbol,
  createKrosPaymentSyncFailed: systemAlertService.createKrosPaymentSyncFailed,
};

test.after(async () => {
  await db.close();
});

test.afterEach(() => {
  process.env.KROS_ENABLED = ORIGINAL_KROS_ENABLED;
  db.getPool = ORIGINAL_GET_POOL;
  krosClient.postPaymentsBatch = stubs.postPaymentsBatch;
  krosClient.getInvoiceVariableSymbol = stubs.getInvoiceVariableSymbol;
  systemAlertService.createKrosPaymentSyncFailed = stubs.createKrosPaymentSyncFailed;
});

const basePaymentRow = {
  kros_external_id: '11111111-2222-3333-4444-555555555555',
  amount_gross_cents: 4500,
  paid_at: '2026-06-19T14:30:00.000Z',
  stripe_checkout_session_id: 'cs_test_abc123',
  customer_name: 'Ján Novák',
};

test('buildKrosPaymentPayload maps paid Stripe amount, date, VS, and card payment type', () => {
  const payload = buildKrosPaymentPayload(basePaymentRow, '20260069');
  assert.equal(payload.data.length, 1);
  const payment = payload.data[0];
  assert.equal(payment.dateOfPayment, '2026-06-19');
  assert.equal(payment.sumOfPayment, 45);
  assert.equal(payment.variableSymbol, '20260069');
  assert.equal(payment.paymentType, 2);
  assert.equal(payment.externalId, krosPaymentExternalId(basePaymentRow.kros_external_id));
  assert.equal(payment.paymentReference, 'cs_test_abc123');
  assert.equal(payment.partnerName, 'Ján Novák');
});

test('krosPaymentExternalId is stable and idempotent per billing document', () => {
  const id = krosPaymentExternalId('11111111-2222-3333-4444-555555555555');
  assert.equal(id, '11111111-2222-3333-4444-555555555555-payment');
  assert.equal(id, krosPaymentExternalId('11111111-2222-3333-4444-555555555555'));
});

function mockPoolForPaymentSync({ row, updates = [] }) {
  return {
    execute: async (sql, params) => {
      if (sql.includes('FROM billing_documents') && sql.includes('WHERE id = ?')) {
        return [[row]];
      }
      if (sql.includes('kros_payment_status = \'synced\'')) {
        updates.push({ type: 'synced', params });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('kros_payment_status = \'failed\'')) {
        updates.push({ type: 'failed', params });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('syncPaymentToKros registers payment after invoice identifiers are known', async () => {
  process.env.KROS_ENABLED = 'true';
  const updates = [];
  const alerts = [];
  const row = {
    id: 7,
    payment_id: 3,
    reservation_id: 9,
    kros_external_id: basePaymentRow.kros_external_id,
    kros_document_id: '159',
    kros_payment_status: null,
    kros_payment_synced_at: null,
    variable_symbol: '20260069',
    amount_gross_cents: basePaymentRow.amount_gross_cents,
    paid_at: basePaymentRow.paid_at,
    stripe_checkout_session_id: basePaymentRow.stripe_checkout_session_id,
    customer_name: basePaymentRow.customer_name,
  };

  db.getPool = () => mockPoolForPaymentSync({ row, updates });
  krosClient.postPaymentsBatch = async (payload) => {
    assert.equal(payload.data[0].sumOfPayment, 45);
    assert.equal(payload.data[0].variableSymbol, '20260069');
    return { status: 202, ok: true, body: { requestId: 'req-1' } };
  };
  systemAlertService.createKrosPaymentSyncFailed = async () => {
    alerts.push(true);
  };

  await syncPaymentToKros(7);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'synced');
  assert.equal(alerts.length, 0);
});

test('syncPaymentToKros skips when payment already synced', async () => {
  process.env.KROS_ENABLED = 'true';
  let postCalled = false;
  const row = {
    id: 8,
    payment_id: 4,
    reservation_id: 10,
    kros_external_id: basePaymentRow.kros_external_id,
    kros_document_id: '160',
    kros_payment_status: 'synced',
    kros_payment_synced_at: '2026-06-19T15:00:00.000Z',
    variable_symbol: '20260070',
    amount_gross_cents: 1000,
    paid_at: basePaymentRow.paid_at,
    stripe_checkout_session_id: basePaymentRow.stripe_checkout_session_id,
    customer_name: basePaymentRow.customer_name,
  };

  db.getPool = () => mockPoolForPaymentSync({ row, updates: [] });
  krosClient.postPaymentsBatch = async () => {
    postCalled = true;
    return { status: 202, ok: true, body: {} };
  };

  await syncPaymentToKros(8);

  assert.equal(postCalled, false);
});

test('syncPaymentToKros stores failure and alert when payment registration fails', async () => {
  process.env.KROS_ENABLED = 'true';
  const updates = [];
  const alerts = [];
  const row = {
    id: 11,
    payment_id: 5,
    reservation_id: 12,
    kros_external_id: basePaymentRow.kros_external_id,
    kros_document_id: '161',
    kros_payment_status: null,
    kros_payment_synced_at: null,
    variable_symbol: '20260071',
    amount_gross_cents: 4500,
    paid_at: basePaymentRow.paid_at,
    stripe_checkout_session_id: basePaymentRow.stripe_checkout_session_id,
    customer_name: basePaymentRow.customer_name,
  };

  db.getPool = () => mockPoolForPaymentSync({ row, updates });
  krosClient.postPaymentsBatch = async () => ({
    status: 400,
    ok: false,
    body: { title: 'Validation failed' },
  });
  systemAlertService.createKrosPaymentSyncFailed = async (params) => {
    alerts.push(params);
  };

  await syncPaymentToKros(11);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'failed');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].billingDocumentId, 11);
  assert.match(alerts[0].errorMessage, /KROS HTTP 400/);
});

test('syncPaymentToKros retry succeeds after prior failure', async () => {
  process.env.KROS_ENABLED = 'true';
  const updates = [];
  const row = {
    id: 12,
    payment_id: 6,
    reservation_id: 13,
    kros_external_id: basePaymentRow.kros_external_id,
    kros_document_id: '162',
    kros_payment_status: 'failed',
    kros_payment_synced_at: null,
    variable_symbol: '20260072',
    amount_gross_cents: 4500,
    paid_at: basePaymentRow.paid_at,
    stripe_checkout_session_id: basePaymentRow.stripe_checkout_session_id,
    customer_name: basePaymentRow.customer_name,
  };

  db.getPool = () => mockPoolForPaymentSync({ row, updates });
  krosClient.postPaymentsBatch = async () => ({ status: 202, ok: true, body: {} });
  systemAlertService.createKrosPaymentSyncFailed = async () => {
    throw new Error('alert should not be created on success');
  };

  await syncPaymentToKros(12);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'synced');
});
