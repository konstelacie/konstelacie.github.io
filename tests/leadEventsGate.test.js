const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const GATE_PATH = require.resolve('../src/lib/leadEventsGate.js');

function reloadGate(envPatch = {}) {
  const prev = {};
  for (const key of ['LEAD_EVENTS_ENABLED', 'LEAD_EVENTS_ADMIN_ENABLED']) {
    prev[key] = process.env[key];
    if (Object.prototype.hasOwnProperty.call(envPatch, key)) {
      process.env[key] = envPatch[key];
    }
  }
  delete require.cache[GATE_PATH];
  const gate = require(GATE_PATH);
  return {
    gate,
    restore() {
      for (const key of ['LEAD_EVENTS_ENABLED', 'LEAD_EVENTS_ADMIN_ENABLED']) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
      delete require.cache[GATE_PATH];
    },
  };
}

beforeEach(() => {
  delete require.cache[GATE_PATH];
});

test('shouldScheduleWrite respects LEAD_EVENTS_ENABLED kill switch', () => {
  const off = reloadGate({ LEAD_EVENTS_ENABLED: '0' });
  try {
    assert.equal(off.gate.shouldScheduleWrite('email_entered'), false);
    assert.equal(off.gate.isWritesEnabled(), false);
  } finally {
    off.restore();
  }

  const on = reloadGate({ LEAD_EVENTS_ENABLED: 'true' });
  try {
    assert.equal(on.gate.shouldScheduleWrite('email_entered'), true);
  } finally {
    on.restore();
  }
});

test('invalid LEAD_EVENTS_ENABLED falls back to default (true)', () => {
  const typo = reloadGate({ LEAD_EVENTS_ENABLED: 'flase' });
  try {
    assert.equal(typo.gate.isWritesEnabled(), typo.gate.DEFAULT_WRITES_ENABLED);
    assert.equal(typo.gate.isWritesEnabled(), true);
  } finally {
    typo.restore();
  }
});

test('invalid LEAD_EVENTS_ADMIN_ENABLED falls back to default (true)', () => {
  const typo = reloadGate({ LEAD_EVENTS_ADMIN_ENABLED: 'nope' });
  try {
    assert.equal(typo.gate.isAdminEnabled(), true);
  } finally {
    typo.restore();
  }
});

test('shouldScheduleWrite rejects unknown event types', () => {
  const { gate, restore } = reloadGate({});
  try {
    assert.equal(gate.shouldScheduleWrite('slot_selected'), false);
    assert.equal(gate.shouldScheduleWrite('not_a_real_type'), false);
  } finally {
    restore();
  }
});

test('sanitizePayload rejects invalid email and oversized metadata', () => {
  const { gate, restore } = reloadGate({});
  try {
    assert.equal(gate.sanitizePayload('email_entered', { email: 'bad' }), null);
    const stripped = gate.sanitizePayload('email_entered', {
      email: 'ok@example.com',
      metadata: { blob: 'x'.repeat(20_000) },
    });
    assert.equal(stripped.email, 'ok@example.com');
    assert.equal(stripped.metadata, null);
    const ok = gate.sanitizePayload('initiate_checkout', {
      email: 'User@Example.COM',
      slotId: 12,
      amount: 10,
    });
    assert.equal(ok.email, 'user@example.com');
    assert.equal(ok.slotId, 12);
  } finally {
    restore();
  }
});

test('sanitizeAdminListOpts rejects invalid days and segment', () => {
  const { gate, restore } = reloadGate({});
  try {
    const { opts, warnings } = gate.sanitizeAdminListOpts({
      days: '365',
      segment: 'hacked',
    });
    assert.equal(opts.days, '30');
    assert.equal(opts.segment, undefined);
    assert.ok(warnings.includes('invalid_days'));
    assert.ok(warnings.includes('invalid_segment'));
  } finally {
    restore();
  }
});

test('sanitizeAdminListOpts clamps unpaid+all days and caps offset', () => {
  const { gate, restore } = reloadGate({});
  try {
    const { opts, warnings } = gate.sanitizeAdminListOpts({
      days: 'all',
      segment: 'unpaid',
      offset: 99_999,
      eventType: 'DROP TABLE;',
    });
    assert.equal(opts.days, '90');
    assert.equal(opts.segment, 'unpaid');
    assert.equal(opts.offset, gate.ADMIN_MAX_OFFSET);
    assert.equal(opts.eventType, undefined);
    assert.ok(warnings.includes('unpaid_days_clamped'));
    assert.ok(warnings.includes('invalid_event_type'));
  } finally {
    restore();
  }
});

test('getReadiness caches migration flags from schema_migrations', async () => {
  const { gate, restore } = reloadGate({});
  try {
    gate.clearReadinessCache();
    const calls = [];
    const pool = {
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('information_schema.tables')) {
          return [[{ ok: 1 }]];
        }
        if (sql.includes('schema_migrations')) {
          return [[{ filename: '002_lead_events.sql' }]];
        }
        return [[]];
      },
    };

    const first = await gate.getReadiness(pool);
    const second = await gate.getReadiness(pool);
    assert.equal(first.table, true);
    assert.equal(first.coreMigration, true);
    assert.equal(first.activationMigration, false);
    assert.equal(second.coreMigration, true);
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test('requiresActivationMigration is true only for new instrumentation types', () => {
  const { gate, restore } = reloadGate({});
  try {
    assert.equal(gate.requiresActivationMigration('payment_path_selected'), true);
    assert.equal(gate.requiresActivationMigration('lock_revoked'), true);
    assert.equal(gate.requiresActivationMigration('email_entered'), false);
  } finally {
    restore();
  }
});
