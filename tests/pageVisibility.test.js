const test = require('node:test');
const assert = require('node:assert/strict');

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const val = overrides[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function loadPageVisibility() {
  delete require.cache[require.resolve('../src/config/pageVisibility')];
  return require('../src/config/pageVisibility');
}

test('home prod is indexable; test is not', () => {
  withEnv({ SITE_HOME_MODE: 'prod' }, () => {
    assert.equal(loadPageVisibility().homeIsIndexable(), true);
  });
  withEnv({ SITE_HOME_MODE: 'test' }, () => {
    assert.equal(loadPageVisibility().homeIsIndexable(), false);
  });
});

test('funnel test mode uses -test segment; prod uses plain name', () => {
  withEnv({ FUNNEL_PILOT_MODE: 'test' }, () => {
    const pv = loadPageVisibility();
    assert.equal(pv.buildPublicPath('pilot'), '/pilot-test');
    assert.equal(pv.pathToFunnelName('/pilot-test'), 'pilot');
    assert.deepEqual(pv.resolveFunnelUrlSegment('pilot-test'), { funnelName: 'pilot' });
  });
  withEnv({ FUNNEL_PILOT_MODE: 'prod' }, () => {
    const pv = loadPageVisibility();
    assert.equal(pv.buildPublicPath('pilot'), '/pilot');
    assert.deepEqual(pv.resolveFunnelUrlSegment('pilot-test'), { redirectHome: true });
  });
});

test('hidden funnel redirects stale URLs', () => {
  withEnv({ FUNNEL_PILOT_MODE: 'hidden' }, () => {
    const pv = loadPageVisibility();
    assert.equal(pv.buildPublicPath('pilot'), null);
    assert.deepEqual(pv.resolveFunnelUrlSegment('pilot'), { redirectHome: true });
    assert.deepEqual(pv.resolveFunnelUrlSegment('pilot-test'), { redirectHome: true });
  });
});

test('home booking paths use root URLs', () => {
  withEnv({}, () => {
    const pv = loadPageVisibility();
    assert.equal(pv.buildPublicPath('site'), '/');
    assert.equal(pv.buildSuccessPath('site'), '/success');
    assert.equal(pv.buildCancelPath('site'), '/cancel');
    assert.equal(pv.pathToFunnelName('/'), 'site');
  });
});
