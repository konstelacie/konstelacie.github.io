const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKrosPayload } = require('../src/services/krosInvoiceService');

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
