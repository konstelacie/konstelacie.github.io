const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

const DB_PATH = require.resolve('../src/db/index');
const REPO_PATH = require.resolve('../src/db/repositories/leadEventsRepo.js');
const PAYMENTS_REPO_PATH = require.resolve('../src/db/repositories/paymentsRepo.js');
const STRIPE_WEBHOOK_PATH = require.resolve('../src/lib/stripeWebhook');
const STRIPE_LOOKUP_PATH = require.resolve('../src/lib/stripeLeadEventLookup');
const STRIPE_ROUTER_PATH = require.resolve('../src/routes/api/stripe');

function captureLogs(fn) {
  const entries = [];
  const origLog = console.log;
  console.log = (msg) => {
    try {
      entries.push(JSON.parse(String(msg)));
    } catch {
      entries.push({ raw: String(msg) });
    }
  };
  return fn(entries).finally(() => {
    console.log = origLog;
  });
}

function reloadLeadEventsRepo(getPoolImpl) {
  const db = require(DB_PATH);
  db.getPool = getPoolImpl;
  delete require.cache[REPO_PATH];
  return require(REPO_PATH);
}

function restoreLeadEventsRepo(origGetPool) {
  require(DB_PATH).getPool = origGetPool;
  delete require.cache[REPO_PATH];
}

test('recordLeadEvent resolves when pool.execute rejects', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;

  try {
    const { recordLeadEvent } = reloadLeadEventsRepo(() => ({
      execute: async () => {
        throw new Error('insert failed');
      },
    }));

    await captureLogs(async (logs) => {
      await recordLeadEvent('email_entered', { email: 'user@example.com' });
      const warn = logs.find((e) => e.tag === 'lead_events_insert_failed');
      assert.ok(warn, 'expected warn log for insert failure');
      assert.equal(warn.eventType, 'email_entered');
      assert.match(warn.error, /insert failed/);
    });
  } finally {
    restoreLeadEventsRepo(origGetPool);
  }
});

test('recordLeadEvent resolves when getPool throws synchronously', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;

  try {
    const { recordLeadEvent } = reloadLeadEventsRepo(() => {
      throw new Error('pool init failed');
    });

    await captureLogs(async (logs) => {
      await recordLeadEvent('email_entered', { email: 'user@example.com' });
      const warn = logs.find((e) => e.tag === 'lead_events_insert_failed');
      assert.ok(warn, 'expected warn log when getPool throws');
      assert.match(warn.error, /pool init failed/);
    });
  } finally {
    restoreLeadEventsRepo(origGetPool);
  }
});

test('recordLeadEvent returns early without email', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  let executeCalled = false;

  try {
    const { recordLeadEvent } = reloadLeadEventsRepo(() => ({
      execute: async () => {
        executeCalled = true;
      },
    }));
    await recordLeadEvent('email_entered', { email: '' });
    assert.equal(executeCalled, false);
  } finally {
    restoreLeadEventsRepo(origGetPool);
  }
});

test('reconcileExpiredStripeCheckouts still expires payments and locks when lookup SELECTs fail', async () => {
  delete require.cache[PAYMENTS_REPO_PATH];
  const { reconcileExpiredStripeCheckouts } = require(PAYMENTS_REPO_PATH);

  const executed = [];
  const executor = {
    execute: async (sql) => {
      const s = String(sql);
      executed.push(s);
      if (s.includes('FROM payments p') && s.includes('user_email')) {
        throw new Error('payments lookup failed');
      }
      if (s.includes('FROM slot_locks sl')) {
        throw new Error('locks lookup failed');
      }
      return [{ affectedRows: 1 }];
    },
  };

  await captureLogs(async (logs) => {
    await reconcileExpiredStripeCheckouts(executor, { slotId: 42 });

    assert.ok(
      executed.some((s) => s.includes("UPDATE payments SET status = 'expired'")),
      'UPDATE payments should still run'
    );
    assert.ok(
      executed.some((s) => s.includes('DELETE FROM slot_locks WHERE expires_at')),
      'DELETE slot_locks should still run'
    );

    const lookupWarns = logs.filter((e) => e.tag === 'lead_events_reconcile_lookup_failed');
    assert.equal(lookupWarns.length, 2);
    assert.ok(lookupWarns.some((e) => e.query === 'paymentsToExpire'));
    assert.ok(lookupWarns.some((e) => e.query === 'locksToExpire'));
  });
});

async function postStripeWebhookWithMocks(eventType) {
  delete require.cache[STRIPE_ROUTER_PATH];

  const stripeWebhook = require(STRIPE_WEBHOOK_PATH);
  const stripeLookup = require(STRIPE_LOOKUP_PATH);
  const db = require(DB_PATH);

  const origConstruct = stripeWebhook.constructStripeEvent;
  const origResolve = stripeLookup.resolvePaymentRowForPaymentIntent;
  const origGetPool = db.getPool;

  const eventObject =
    eventType === 'charge.refunded'
      ? { id: 'ch_test_refund', payment_intent: 'pi_test_refund' }
      : { id: 'pi_test_failed' };

  stripeWebhook.constructStripeEvent = () => ({
    event: {
      id: `evt_test_${eventType}`,
      type: eventType,
      data: { object: eventObject },
    },
    backend: 'test',
  });
  stripeLookup.resolvePaymentRowForPaymentIntent = async () => {
    throw new Error('lookup boom');
  };
  db.getPool = () => ({
    execute: async (sql) => {
      if (String(sql).includes('webhook_events')) return [[]];
      return [[]];
    },
  });

  const stripeRouter = require(STRIPE_ROUTER_PATH);
  const app = express();
  app.use((req, _res, next) => {
    req.id = 'test-req-id';
    next();
  });
  app.use(express.raw({ type: 'application/json' }));
  app.use(stripeRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    stripeWebhook.constructStripeEvent = origConstruct;
    stripeLookup.resolvePaymentRowForPaymentIntent = origResolve;
    db.getPool = origGetPool;
    delete require.cache[STRIPE_ROUTER_PATH];
  }
}

test('stripe webhook responds 200 when payment_failed lead lookup throws', async () => {
  const { status, body } = await postStripeWebhookWithMocks('payment_intent.payment_failed');
  assert.equal(status, 200);
  assert.deepEqual(body, { received: true });
});

test('stripe webhook responds 200 when charge.refunded lead lookup throws', async () => {
  const { status, body } = await postStripeWebhookWithMocks('charge.refunded');
  assert.equal(status, 200);
  assert.deepEqual(body, { received: true });
});

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function seededLeadEventTypeCodes(migrationSql) {
  const codes = new Set();
  const inserts = migrationSql.match(/INSERT INTO lead_event_types[^;]+;/gs) || [];
  const tupleRe = /\(\s*'([a-z_]+)'\s*,/g;
  for (const block of inserts) {
    let m;
    while ((m = tupleRe.exec(block)) !== null) {
      codes.add(m[1]);
    }
  }
  return codes;
}

function usedScheduleLeadEventTypes(srcRoot) {
  const types = new Set();
  const re = /scheduleLeadEvent\(\s*['"]([a-z_]+)['"]/g;
  for (const file of walkJsFiles(srcRoot)) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) {
      types.add(m[1]);
    }
  }
  return types;
}

test('every scheduleLeadEvent type is seeded in migration', () => {
  const migrationPath = path.join(__dirname, '../src/db/migrations/002_lead_events.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const seeded = seededLeadEventTypeCodes(migrationSql);
  const used = usedScheduleLeadEventTypes(path.join(__dirname, '../src'));

  const missing = [...used].filter((t) => !seeded.has(t));
  assert.deepEqual(
    missing,
    [],
    `scheduleLeadEvent types missing from lead_event_types seed: ${missing.join(', ')}`
  );
});

test('checkoutExpiredProviderEventId produces the same key regardless of caller', () => {
  const { checkoutExpiredProviderEventId } = require('../src/lib/leadEventContext');
  const paymentId = 12345;
  const fromJob = checkoutExpiredProviderEventId(paymentId);
  const fromWebhook = checkoutExpiredProviderEventId(Number(paymentId));
  assert.equal(fromJob, fromWebhook);
  assert.equal(fromJob, 'payment_expired:12345');
});

test('reconcileExpiredStripeCheckouts emits providerEventId matching checkoutExpiredProviderEventId', async () => {
  delete require.cache[PAYMENTS_REPO_PATH];
  delete require.cache[REPO_PATH];

  const { checkoutExpiredProviderEventId } = require('../src/lib/leadEventContext');
  const leadEventsRepo = require(REPO_PATH);
  const origSchedule = leadEventsRepo.scheduleLeadEvent;
  const captured = [];
  leadEventsRepo.scheduleLeadEvent = (type, payload) => captured.push({ type, payload });

  try {
    const { reconcileExpiredStripeCheckouts } = require(PAYMENTS_REPO_PATH);
    const executor = {
      execute: async (sql) => {
        const s = String(sql);
        if (s.includes('FROM payments p') && s.includes('user_email')) {
          return [[{ id: 999, slot_id: 1, amount_cents: 4500, currency: 'eur', user_email: 'a@b.com' }]];
        }
        if (s.includes('FROM slot_locks sl')) return [[]];
        return [{ affectedRows: 1 }];
      },
    };

    await reconcileExpiredStripeCheckouts(executor, {});

    const expiredEvent = captured.find((e) => e.type === 'checkout_expired');
    assert.ok(expiredEvent);
    assert.equal(expiredEvent.payload.providerEventId, checkoutExpiredProviderEventId(999));
  } finally {
    leadEventsRepo.scheduleLeadEvent = origSchedule;
    delete require.cache[PAYMENTS_REPO_PATH];
    delete require.cache[REPO_PATH];
  }
});

test('core routes do not await scheduleLeadEvent on the critical path', () => {
  const slotsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/slots.js'), 'utf8');
  assert.equal(slotsSrc.includes('await scheduleLeadEvent'), false);
  assert.equal(slotsSrc.includes('await recordLeadEvent'), false);

  const paymentsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/payments.js'), 'utf8');
  assert.equal(paymentsSrc.includes('await scheduleLeadEvent'), false);
  assert.equal(paymentsSrc.includes('await recordLeadEvent'), false);
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

test('centsToLeadAmount converts payment cents to euros', () => {
  const { centsToLeadAmount } = require('../src/lib/leadEventContext');
  assert.equal(centsToLeadAmount(4500), 45);
  assert.equal(centsToLeadAmount(null), null);
});
