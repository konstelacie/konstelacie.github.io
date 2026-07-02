const test = require('node:test');
const assert = require('node:assert/strict');

const META_ATTR_PATH = require.resolve('../src/lib/metaAttribution.js');
const CAPI_SENDER_PATH = require.resolve('../src/services/capiSender.js');
const CAPI_REPO_PATH = require.resolve('../src/db/repositories/capiSendLogRepo.js');
const DB_PATH = require.resolve('../src/db/index');
const CONFIG_PATH = require.resolve('../src/config/index.js');

function reloadModule(path, setup) {
  if (setup) setup();
  delete require.cache[path];
  return require(path);
}

function mockConfig(overrides = {}) {
  const orig = require(CONFIG_PATH);
  require.cache[CONFIG_PATH] = {
    id: CONFIG_PATH,
    filename: CONFIG_PATH,
    loaded: true,
    exports: {
      ...orig,
      metaCapi: {
        enabled: true,
        accessToken: 'test-token',
        pixelId: '123456789',
        testEventCode: '',
        apiVersion: 'v21.0',
        ...overrides.metaCapi,
      },
    },
  };
}

function restoreConfig() {
  delete require.cache[CONFIG_PATH];
  require(CONFIG_PATH);
}

test('validateMetaCookie accepts fb. prefix and rejects garbage', () => {
  const { validateMetaCookie } = require(META_ATTR_PATH);
  assert.equal(validateMetaCookie('fb.1.123.456'), 'fb.1.123.456');
  assert.equal(validateMetaCookie('evil; DROP TABLE'), null);
  assert.equal(validateMetaCookie('x' + 'a'.repeat(250)), null);
  assert.equal(validateMetaCookie(null), null);
});

test('extractMetaAttribution reads cookies and body flags', () => {
  const { extractMetaAttribution } = require(META_ATTR_PATH);
  const req = {
    cookies: { _fbp: 'fb.1.abc', _fbc: 'not-valid' },
    ip: '203.0.113.10',
    get(name) {
      if (name === 'user-agent') return 'TestAgent/1.0';
      return null;
    },
  };
  const attr = extractMetaAttribution(req, { marketingConsent: true, suppressTracking: false });
  assert.equal(attr.metaFbp, 'fb.1.abc');
  assert.equal(attr.metaFbc, null);
  assert.equal(attr.clientIp, '203.0.113.10');
  assert.equal(attr.marketingConsent, true);
  assert.equal(attr.suppressTracking, false);
});

test('hashEmail normalizes and SHA-256 hashes', () => {
  const { hashEmail } = require(CAPI_SENDER_PATH);
  const crypto = require('crypto');
  const expected = crypto.createHash('sha256').update('user@example.com').digest('hex');
  assert.equal(hashEmail('  User@Example.com '), expected);
  assert.equal(hashEmail(''), null);
});

test('buildLeadEventId uses lock token', () => {
  const { buildLeadEventId } = require(CAPI_SENDER_PATH);
  assert.equal(buildLeadEventId('550e8400-e29b-41d4-a716-446655440000'), 'lead:550e8400-e29b-41d4-a716-446655440000');
});

test('evaluateSkipReason — no_consent, notrack, topup, not_configured', () => {
  mockConfig({ metaCapi: { enabled: true, accessToken: 'tok', pixelId: 'pid' } });
  const { evaluateSkipReason } = reloadModule(CAPI_SENDER_PATH);

  assert.equal(evaluateSkipReason({ marketing_consent: 0, suppressed_tracking: 0, payment_type: 'session' }, null, 'Purchase'), 'no_consent');
  assert.equal(
    evaluateSkipReason({ marketing_consent: 1, suppressed_tracking: 1, payment_type: 'session' }, null, 'Purchase'),
    'notrack'
  );
  assert.equal(
    evaluateSkipReason({ marketing_consent: 1, suppressed_tracking: 0, payment_type: 'topup' }, null, 'Purchase'),
    'topup'
  );

  mockConfig({ metaCapi: { enabled: true, accessToken: '', pixelId: 'pid' } });
  const capi2 = reloadModule(CAPI_SENDER_PATH);
  assert.equal(capi2.evaluateSkipReason({ marketing_consent: 1, suppressed_tracking: 0, payment_type: 'session' }, null, 'Purchase'), 'not_configured');

  restoreConfig();
});

test('buildUserData includes fbp/fbc only when set', () => {
  const { buildUserData } = require(CAPI_SENDER_PATH);
  const withBoth = buildUserData({
    email: 'a@b.cz',
    clientIp: '1.2.3.4',
    clientUserAgent: 'UA',
    metaFbp: 'fb.1.x',
    metaFbc: 'fb.2.y',
  });
  assert.equal(withBoth.fbp, 'fb.1.x');
  assert.equal(withBoth.fbc, 'fb.2.y');
  assert.ok(withBoth.em);

  const without = buildUserData({ email: 'a@b.cz', clientIp: null, clientUserAgent: null, metaFbp: null, metaFbc: null });
  assert.equal(without.fbp, undefined);
  assert.equal(without.fbc, undefined);
});

test('sendCapiEvent posts Purchase with correct event_id and hashed email', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  const executed = [];
    let fetchCalls = [];

  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1 }),
    };
  };

  try {
    mockConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];

    db.getPool = () => ({
      execute: async (sql, params) => {
        executed.push({ sql: String(sql), params });
        if (String(sql).includes('INSERT INTO capi_send_log')) {
          return [{ insertId: 99 }];
        }
        if (String(sql).includes('UPDATE capi_send_log')) {
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      },
    });

    const { sendCapiEvent, hashEmail } = require(CAPI_SENDER_PATH);
    await sendCapiEvent({
      eventName: 'Purchase',
      eventId: 'cs_test_123',
      paymentId: 7,
      email: 'buyer@example.com',
      payment: {
        marketing_consent: 1,
        suppressed_tracking: 0,
        payment_type: 'session',
        amount_cents: 5000,
        meta_fbp: 'fb.1.a',
        meta_fbc: null,
        client_ip: '10.0.0.1',
        client_user_agent: 'Mozilla',
      },
      customData: { value: 50, currency: 'EUR', content_type: 'session' },
    });

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /\/v21\.0\/123456789\/events$/);
    const event = fetchCalls[0].body.data[0];
    assert.equal(event.event_name, 'Purchase');
    assert.equal(event.event_id, 'cs_test_123');
    assert.equal(event.user_data.em, hashEmail('buyer@example.com'));
    assert.equal(event.user_data.fbp, 'fb.1.a');
    assert.equal(event.user_data.fbc, undefined);

    const insert = executed.find((e) => e.sql.includes('INSERT INTO capi_send_log'));
    assert.ok(insert);
    assert.equal(insert.params[0], 'Purchase');
    assert.equal(insert.params[1], 'cs_test_123');
  } finally {
    global.fetch = origFetch;
    db.getPool = origGetPool;
    restoreConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];
  }
});

test('sendCapiEvent skips with no_consent without calling Meta API', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  let fetchCalled = false;
  const origFetch = global.fetch;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    mockConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];

    db.getPool = () => ({
      execute: async (sql) => {
        if (String(sql).includes('INSERT INTO capi_send_log')) {
          return [{ insertId: 1 }];
        }
        return [{ affectedRows: 1 }];
      },
    });

    const { sendCapiEvent } = require(CAPI_SENDER_PATH);
    await sendCapiEvent({
      eventName: 'Lead',
      eventId: 'lead:uuid',
      email: 'x@y.z',
      payment: { marketing_consent: 0, suppressed_tracking: 0 },
    });

    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = origFetch;
    db.getPool = origGetPool;
    restoreConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];
  }
});

test('tryInsertCapiLog duplicate key returns inserted false', async () => {
  const { tryInsertCapiLog } = require(CAPI_REPO_PATH);
  const pool = {
    execute: async () => {
      const err = new Error('dup');
      err.code = 'ER_DUP_ENTRY';
      err.errno = 1062;
      throw err;
    },
  };
  const result = await tryInsertCapiLog(pool, {
    eventName: 'Purchase',
    eventId: 'cs_dup',
    paymentId: 1,
  });
  assert.equal(result.inserted, false);
});

test('duplicate webhook delivery — second insert blocked by UNIQUE', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  let insertCount = 0;
  const fetchCalls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1 }),
    };
  };

  try {
    mockConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];

    db.getPool = () => ({
      execute: async (sql) => {
        if (String(sql).includes('INSERT INTO capi_send_log')) {
          insertCount += 1;
          if (insertCount > 1) {
            const err = new Error('dup');
            err.code = 'ER_DUP_ENTRY';
            throw err;
          }
          return [{ insertId: 1 }];
        }
        return [{ affectedRows: 1 }];
      },
    });

    const { sendCapiEvent } = require(CAPI_SENDER_PATH);
    const payment = {
      marketing_consent: 1,
      suppressed_tracking: 0,
      payment_type: 'session',
      amount_cents: 1000,
      client_ip: '1.1.1.1',
      client_user_agent: 'UA',
    };
    await sendCapiEvent({
      eventName: 'Purchase',
      eventId: 'cs_retry',
      email: 'a@b.c',
      payment,
    });
    await sendCapiEvent({
      eventName: 'Purchase',
      eventId: 'cs_retry',
      email: 'a@b.c',
      payment,
    });

    assert.equal(insertCount, 2);
    assert.equal(fetchCalls.length, 1);
  } finally {
    global.fetch = origFetch;
    db.getPool = origGetPool;
    restoreConfig();
    delete require.cache[CAPI_REPO_PATH];
    delete require.cache[CAPI_SENDER_PATH];
  }
});
