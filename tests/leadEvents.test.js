const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoPath = path.join(__dirname, '../src/db/repositories/leadEventsRepo.js');
const repoSrc = fs.readFileSync(repoPath, 'utf8');

test('recordLeadEvent swallows errors and logs warn', () => {
  assert.match(repoSrc, /catch\s*\(err\)/);
  assert.match(repoSrc, /level:\s*'warn'/);
  assert.match(repoSrc, /tag:\s*'lead_events_insert_failed'/);
  assert.equal(repoSrc.includes('throw err'), false);
  assert.equal(repoSrc.includes('throw e'), false);
});

test('recordLeadEvent uses separate pool execute with idempotent provider_event_id', () => {
  assert.match(repoSrc, /INSERT INTO lead_events/);
  assert.match(repoSrc, /ON DUPLICATE KEY UPDATE id = id/);
  assert.match(repoSrc, /getPool\(\)/);
});

test('scheduleLeadEvent is fire-and-forget', () => {
  assert.match(repoSrc, /void recordLeadEvent/);
});

test('migration defines lead_events tables and seeds idempotently', () => {
  const migrationPath = path.join(__dirname, '../src/db/migrations/002_lead_events.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS lead_event_types/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS lead_events/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE/);
  assert.match(sql, /'purchase'/);
  assert.match(sql, /'payment_path_selected'[\s\S]*,\s*0\)/);
});

test('recordLeadEvent returns early without email or pool', async () => {
  const { recordLeadEvent } = require('../src/db/repositories/leadEventsRepo');
  await assert.doesNotReject(() => recordLeadEvent('email_entered', { email: '' }));
  await assert.doesNotReject(() => recordLeadEvent('email_entered', { email: 'user@example.com' }));
});

test('hook points call scheduleLeadEvent', () => {
  const slotsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/slots.js'), 'utf8');
  assert.match(slotsSrc, /scheduleLeadEvent\('email_entered'/);
  assert.match(slotsSrc, /scheduleLeadEvent\('lock_extend_failed'/);

  const paymentsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/payments.js'), 'utf8');
  assert.match(paymentsSrc, /scheduleLeadEvent\('initiate_checkout'/);
  assert.match(paymentsSrc, /scheduleLeadEvent\('payment_retry'/);

  const paymentsRepoSrc = fs.readFileSync(
    path.join(__dirname, '../src/db/repositories/paymentsRepo.js'),
    'utf8'
  );
  assert.match(paymentsRepoSrc, /scheduleLeadEvent\('lock_expired'/);
  assert.match(paymentsRepoSrc, /scheduleLeadEvent\('checkout_expired'/);

  const stripeSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/stripe.js'), 'utf8');
  assert.match(stripeSrc, /scheduleLeadEvent\('purchase'/);
  assert.match(stripeSrc, /scheduleLeadEvent\('checkout_expired'/);
  assert.match(stripeSrc, /scheduleLeadEvent\('payment_failed'/);
  assert.match(stripeSrc, /scheduleLeadEvent\('payment_refunded'/);
  assert.match(stripeSrc, /providerEventId:\s*event\.id/);
});

test('core routes do not await recordLeadEvent on the critical path', () => {
  const slotsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/slots.js'), 'utf8');
  assert.equal(slotsSrc.includes('await recordLeadEvent'), false);
  assert.equal(slotsSrc.includes('await scheduleLeadEvent'), false);

  const paymentsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/payments.js'), 'utf8');
  assert.equal(paymentsSrc.includes('await recordLeadEvent'), false);
  assert.equal(paymentsSrc.includes('await scheduleLeadEvent'), false);
});

test('centsToLeadAmount converts payment cents to euros', () => {
  const { centsToLeadAmount } = require('../src/lib/leadEventContext');
  assert.equal(centsToLeadAmount(4500), 45);
  assert.equal(centsToLeadAmount(null), null);
});
