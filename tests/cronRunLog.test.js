'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { summarizeJob } = require('../src/jobs/index');

test('summarizeJob reports due count and ok when no errors', () => {
  const summary = summarizeJob({
    name: 'pre-session-reminder',
    due: 2,
    sent: 1,
    skipped: 1,
    errors: [],
  });
  assert.equal(summary.name, 'pre-session-reminder');
  assert.equal(summary.due, 2);
  assert.equal(summary.sent, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.ok, true);
  assert.equal(summary.failed, undefined);
});

test('summarizeJob marks job failed when errors present', () => {
  const summary = summarizeJob({
    name: 'email-delivery-tasks',
    due: 1,
    sent: 0,
    failed: 1,
    errors: ['task 42: send failed'],
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.errors, ['task 42: send failed']);
});

test('summarizeJob marks throttled stripe reconciliation', () => {
  const summary = summarizeJob({
    name: 'stripe-reconciliation',
    skipped: true,
    due: 0,
    errors: [],
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.throttled, true);
  assert.equal(summary.due, 0);
});

test('summarizeJob marks stripe detector failure', () => {
  const summary = summarizeJob({
    name: 'stripe-reconciliation',
    due: 0,
    skipped: false,
    detectorFailed: true,
    errors: ['stripe_list_failed: timeout'],
  });
  assert.equal(summary.ok, false);
});
