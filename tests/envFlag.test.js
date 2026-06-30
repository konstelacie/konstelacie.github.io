const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseEnvFlag, ENV_FLAG_TRUTHY, ENV_FLAG_FALSY } = require('../src/lib/envFlag');

test('parseEnvFlag uses default when unset or blank', () => {
  assert.equal(parseEnvFlag(undefined, true), true);
  assert.equal(parseEnvFlag(null, true), true);
  assert.equal(parseEnvFlag('', false), false);
  assert.equal(parseEnvFlag('   ', true), true);
});

test('parseEnvFlag recognizes explicit on and off values', () => {
  for (const v of ENV_FLAG_TRUTHY) {
    assert.equal(parseEnvFlag(v, false), true, `expected truthy: ${v}`);
    assert.equal(parseEnvFlag(v.toUpperCase(), false), true, `expected truthy: ${v}`);
  }
  for (const v of ENV_FLAG_FALSY) {
    assert.equal(parseEnvFlag(v, true), false, `expected falsy: ${v}`);
    assert.equal(parseEnvFlag(`  ${v}  `, true), false, `expected falsy: ${v}`);
  }
});

test('parseEnvFlag falls back to default for typos and unknown values', () => {
  assert.equal(parseEnvFlag('flase', true), true);
  assert.equal(parseEnvFlag('flase', false), false);
  assert.equal(parseEnvFlag('ture', true), true);
  assert.equal(parseEnvFlag('maybe', false), false);
  assert.equal(parseEnvFlag('2', true), true);
  assert.equal(parseEnvFlag('enabled', false), false);
});
