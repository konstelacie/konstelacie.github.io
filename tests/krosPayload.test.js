const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKrosPayload, buildKrosPaymentPayload, KROS_PAYMENT_TYPE } = require('../src/services/krosInvoiceService');

const baseRow = {
  customer_name: 'Ján Novák',
  customer_email_snapshot: 'jan@example.com',
  customer_country: 'SK',
  document_type: 'standard',
  line_amount: 1,
  line_measure_unit: 'ks',
  line_vat_rate: 0.23,
  line_total_price_incl_vat_cents: 4500,
  vat_payer_type: 1,
  issue_date: '2026-06-19',
  due_date: '2026-06-19',
  delivery_date: '2026-06-19',
  supplier_iban: 'SK123',
  supplier_swift: 'TATRSKBX',
};

test('buildKrosPayload uses Online platba payment type', () => {
  const payload = buildKrosPayload({ ...baseRow, customer_is_company: 0 }, 'prod');
  assert.equal(payload.data.paymentType, KROS_PAYMENT_TYPE);
  assert.equal(payload.data.paymentType, 'Online platba');
});

test('buildKrosPaymentPayload reuses the same payment type as invoice', () => {
  const payment = buildKrosPaymentPayload(
    {
      kros_external_id: '11111111-2222-3333-4444-555555555555',
      amount_gross_cents: 4500,
      paid_at: '2026-06-19',
      stripe_checkout_session_id: 'cs_test',
      customer_name: 'Test',
    },
    '20260001'
  );
  assert.equal(payment.data[0].paymentType, KROS_PAYMENT_TYPE);
});

test('buildKrosPayload omits country for individual bookings', () => {
  const payload = buildKrosPayload({ ...baseRow, customer_is_company: 0 }, 'prod');
  const address = payload.data.partner.address;
  assert.equal(address.businessName, 'Ján Novák');
  assert.equal(address.contactName, null);
  assert.equal(address.street, null);
  assert.ok(!('country' in address));
});

test('buildKrosPayload includes country for company bookings', () => {
  const payload = buildKrosPayload(
    {
      ...baseRow,
      customer_is_company: 1,
      customer_company_name: 'Acme s.r.o.',
      customer_street: 'Hlavná 1',
      customer_city: 'Bratislava',
      customer_post_code: '81101',
      customer_country: 'CZ',
    },
    'prod'
  );
  const address = payload.data.partner.address;
  assert.equal(address.businessName, 'Acme s.r.o.');
  assert.equal(address.contactName, 'Ján Novák');
  assert.equal(address.country, 'CZ');
});
