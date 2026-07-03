const assert = require('node:assert/strict');
const test = require('node:test');

const {
  pathToFunnelNameIncludingSubpaths,
  resolveClarityPageContext,
} = require('../src/lib/clarityPageContext');

function mockReq(path) {
  return { path };
}

test('pathToFunnelNameIncludingSubpaths resolves funnel subpaths', () => {
  assert.equal(pathToFunnelNameIncludingSubpaths('/'), 'site');
  assert.equal(pathToFunnelNameIncludingSubpaths('/success'), 'site');
  assert.equal(pathToFunnelNameIncludingSubpaths('/cancel'), 'site');
  assert.equal(pathToFunnelNameIncludingSubpaths('/pilot/success'), 'pilot');
  assert.equal(pathToFunnelNameIncludingSubpaths('/pilot-test/cancel'), 'pilot');
});

test('resolveClarityPageContext environment follows page visibility modes', () => {
  const prevHome = process.env.SITE_HOME_MODE;
  const prevPilot = process.env.FUNNEL_PILOT_MODE;
  try {
    process.env.SITE_HOME_MODE = 'test';
    process.env.FUNNEL_PILOT_MODE = 'prod';
    assert.deepEqual(resolveClarityPageContext(mockReq('/')), {
      environment: 'test',
      funnelName: 'site',
    });
    assert.deepEqual(resolveClarityPageContext(mockReq('/pilot/success')), {
      environment: 'prod',
      funnelName: 'pilot',
    });
  } finally {
    if (prevHome === undefined) delete process.env.SITE_HOME_MODE;
    else process.env.SITE_HOME_MODE = prevHome;
    if (prevPilot === undefined) delete process.env.FUNNEL_PILOT_MODE;
    else process.env.FUNNEL_PILOT_MODE = prevPilot;
  }
});
