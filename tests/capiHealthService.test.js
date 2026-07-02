const test = require('node:test');
const assert = require('node:assert/strict');

const DB_PATH = require.resolve('../src/db/index');
const CAPI_HEALTH_PATH = require.resolve('../src/services/capiHealthService.js');
const SYSTEM_ALERT_PATH = require.resolve('../src/services/systemAlertService.js');

test('checkCapiDeliveryHealth throttles COUNT query within interval', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  let countQueries = 0;

  try {
    delete require.cache[CAPI_HEALTH_PATH];
    db.getPool = () => ({
      execute: async (sql) => {
        if (String(sql).includes('COUNT(*)')) {
          countQueries += 1;
          return [[{ cnt: 0 }]];
        }
        return [[{ affectedRows: 0 }]];
      },
    });

    const capiHealth = require(CAPI_HEALTH_PATH);
    capiHealth.resetDeliveryHealthCacheForTests();

    const t0 = Date.now();
    const first = await capiHealth.checkCapiDeliveryHealth(t0);
    const second = await capiHealth.checkCapiDeliveryHealth(t0 + 60_000);

    assert.equal(first.healthy, true);
    assert.equal(second.healthy, true);
    assert.equal(countQueries, 1);
  } finally {
    db.getPool = origGetPool;
    delete require.cache[CAPI_HEALTH_PATH];
  }
});

test('checkCapiDeliveryHealth runs fresh check after throttle interval', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;
  let countQueries = 0;

  try {
    delete require.cache[CAPI_HEALTH_PATH];
    db.getPool = () => ({
      execute: async (sql) => {
        if (String(sql).includes('COUNT(*)')) {
          countQueries += 1;
          return [[{ cnt: 0 }]];
        }
        return [[{ affectedRows: 0 }]];
      },
    });

    const capiHealth = require(CAPI_HEALTH_PATH);
    capiHealth.resetDeliveryHealthCacheForTests();

    const t0 = Date.now();
    await capiHealth.checkCapiDeliveryHealth(t0);
    await capiHealth.checkCapiDeliveryHealth(t0 + capiHealth.DELIVERY_CHECK_INTERVAL_MS + 1);

    assert.equal(countQueries, 2);
  } finally {
    db.getPool = origGetPool;
    delete require.cache[CAPI_HEALTH_PATH];
  }
});

test('createCapiPoolUnavailable returns null without throwing when pool is missing', async () => {
  const db = require(DB_PATH);
  const origGetPool = db.getPool;

  try {
    delete require.cache[SYSTEM_ALERT_PATH];
    db.getPool = () => null;

    const { createCapiPoolUnavailable } = require(SYSTEM_ALERT_PATH);
    const id = await createCapiPoolUnavailable();
    assert.equal(id, null);
  } finally {
    db.getPool = origGetPool;
    delete require.cache[SYSTEM_ALERT_PATH];
  }
});
