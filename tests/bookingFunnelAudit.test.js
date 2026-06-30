const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  mapAdminAuditFunnelRow,
  mergeLeadAndAuditTimeline,
  resolveAuditEmail,
  auditActionLabel,
} = require('../src/lib/bookingFunnelAudit');

test('auditActionLabel returns Slovak labels for booking funnel actions', () => {
  assert.equal(auditActionLabel('lock_created'), 'Termín zvolený');
  assert.equal(auditActionLabel('lock_revoked'), 'Zámok zrušený (technické)');
});

test('resolveAuditEmail prefers payload email over inferred', () => {
  assert.equal(
    resolveAuditEmail({
      payload_json: { email: 'a@b.sk' },
      inferred_email: 'c@d.sk',
    }),
    'a@b.sk'
  );
});

test('mapAdminAuditFunnelRow marks missing email and maps slot label', () => {
  const row = mapAdminAuditFunnelRow({
    id: 9,
    action: 'lock_created',
    slot_id: 5,
    payload_json: null,
    created_at: new Date('2026-06-15T10:00:00.000Z'),
    local_date: '2026-06-20',
    grid_index: 2,
    inferred_email: null,
  });

  assert.equal(row.emailIsMissing, true);
  assert.equal(row.email, '—');
  assert.equal(row.eventTypeLabel, 'Termín zvolený');
  assert.equal(row.timelineSource, 'audit');
  assert.match(row.sessionLabel, /2026-06-20/);
});

test('mergeLeadAndAuditTimeline dedupes lock_revoked when lead event exists', () => {
  const at = new Date('2026-06-15T12:00:00.000Z');
  const lead = {
    id: 1,
    eventType: 'lock_revoked',
    slotId: 10,
    sortAt: at,
    rawId: 1,
    timelineSource: 'lead',
  };
  const audit = {
    id: 'audit-2',
    eventType: 'lock_revoked',
    slotId: 10,
    sortAt: at,
    rawId: 2,
    timelineSource: 'audit',
  };
  const other = {
    id: 'audit-3',
    eventType: 'lock_created',
    slotId: 10,
    sortAt: new Date('2026-06-15T11:59:00.000Z'),
    rawId: 3,
    timelineSource: 'audit',
  };

  const merged = mergeLeadAndAuditTimeline([lead], [audit, other]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].eventType, 'lock_revoked');
  assert.equal(merged[0].timelineSource, 'lead');
  assert.equal(merged[1].eventType, 'lock_created');
});
