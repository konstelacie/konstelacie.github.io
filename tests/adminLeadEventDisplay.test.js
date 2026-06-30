const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  leadEventTypeLabel,
  mapAdminLeadEventRow,
} = require('../src/lib/adminLeadEventDisplay');

test('leadEventTypeLabel returns Slovak label for known types', () => {
  assert.equal(leadEventTypeLabel('email_entered'), 'Zadaný e-mail');
  assert.equal(leadEventTypeLabel('purchase'), 'Zakúpené');
  assert.equal(leadEventTypeLabel('unknown_type'), 'unknown_type');
});

test('mapAdminLeadEventRow formats slot and checkout metadata', () => {
  const row = mapAdminLeadEventRow({
    id: 1,
    email: 'user@example.com',
    event_type: 'initiate_checkout',
    form_id: 'pilot',
    source_url: 'https://citimtedasom.sk/pilot',
    amount: 10,
    currency: 'eur',
    slot_id: 42,
    reservation_id: null,
    payment_id: 7,
    occurred_at: new Date('2026-06-15T10:00:00.000Z'),
    metadata: JSON.stringify({
      paymentType: 'deposit',
      funnelCampaign: 'zavist',
      checkoutSessionId: 'cs_test_1234567890',
    }),
    local_date: '2026-06-20',
    grid_index: 2,
    start_at_utc: new Date('2026-06-20T14:00:00.000Z'),
    timezone: 'Europe/Bratislava',
  });

  assert.equal(row.email, 'user@example.com');
  assert.equal(row.eventTypeLabel, 'Spustená platba');
  assert.equal(row.amountLabel, '10,00 €');
  assert.equal(row.funnelPathLabel, 'pilot / zavist');
  assert.equal(row.slotId, 42);
  assert.match(row.sessionLabel, /2026-06-20/);
  assert.match(row.detailSummary, /Záloha/);
  assert.match(row.metadataFormatted, /checkoutSessionId/);
});
