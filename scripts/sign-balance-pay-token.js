#!/usr/bin/env node
/**
 * Print a signed balance-pay token and example URL (dev / ops).
 *
 * Usage:
 *   node scripts/sign-balance-pay-token.js <reservationId> [ttl]
 *
 * ttl examples: 168h (default), 7d, 3600 (seconds if plain number)
 *
 * Requires BALANCE_PAY_TOKEN_SECRET in production; dev uses a fixed fallback (see src/lib/balancePayToken.js).
 */

require('dotenv').config();
const { signBalancePayToken } = require('../src/lib/balancePayToken');

function parseTtl(raw) {
  if (raw == null || raw === '') return 7 * 24 * 3600;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(\d+)\s*([dh])$/i);
  if (!m) {
    console.error('Invalid ttl. Use e.g. 168h, 7d, or seconds as integer.');
    process.exit(1);
  }
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u === 'd') return n * 24 * 3600;
  return n * 3600;
}

const rid = parseInt(process.argv[2], 10);
if (!Number.isInteger(rid) || rid <= 0) {
  console.error('Usage: node scripts/sign-balance-pay-token.js <reservationId> [ttl]');
  process.exit(1);
}

const ttl = parseTtl(process.argv[3]);
let token;
try {
  token = signBalancePayToken(rid, ttl);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const path = `/platba-doplatok?token=${encodeURIComponent(token)}`;

console.log('Token:\n', token);
console.log('\nPath:\n', path);
console.log('\nFull URL:\n', `${base}${path}`);
