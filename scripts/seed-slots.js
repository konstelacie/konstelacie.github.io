#!/usr/bin/env node
/**
 * Seed 3 one-hour test slots (Europe/Bratislava).
 * Skips "today" and only uses weekdays where each slot is >= now + 24h
 * (same rule as the funnel booking API).
 * Run: node scripts/seed-slots.js  |  npm run db:seed-slots
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'citim_teda_som',
};

const TZ = 'Europe/Bratislava';
const HOURS = [10, 14, 18]; // 10:00, 14:00, 18:00 local
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

/** EU DST: last Sun of March → CEST (+2), last Sun of Oct → CET (+1) */
function getBratislavaOffsetHours(year, month1Based) {
  const lastSunday = (y, m) => {
    const last = new Date(y, m, 0);
    last.setDate(last.getDate() - last.getDay());
    return last;
  };
  const marchLast = lastSunday(year, 3);
  const octLast = lastSunday(year, 10);
  const d = new Date(year, month1Based - 1, 1);
  if (d >= marchLast && d < octLast) return 2;
  return 1;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toUtcDatetime(year, month, day, hourLocal, offsetHours) {
  const str = `${year}-${pad(month)}-${pad(day)}T${pad(hourLocal)}:00:00+${pad(offsetHours)}:00`;
  const d = new Date(str);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

function slotStartUtcMs(y, m, d, hourLocal) {
  const offset = getBratislavaOffsetHours(y, m);
  const str = `${y}-${pad(m)}-${pad(d)}T${pad(hourLocal)}:00:00+${pad(offset)}:00`;
  return new Date(str).getTime();
}

/** Advance calendar date by delta days (Gregorian). */
function advanceCalendarDay(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isWeekendBratislava(y, m, d) {
  const offset = getBratislavaOffsetHours(y, m);
  const str = `${y}-${pad(m)}-${pad(d)}T12:00:00+${pad(offset)}:00`;
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(str));
  return wd === 'Sat' || wd === 'Sun';
}

/**
 * First weekday strictly after "today" in Bratislava where every HOURS slot
 * is at least MIN_LEAD_MS from now (never uses today's calendar date).
 */
function pickSeedDay() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y0 = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const m0 = parseInt(parts.find((p) => p.type === 'month').value, 10);
  const d0 = parseInt(parts.find((p) => p.type === 'day').value, 10);

  let cy = y0;
  let cm = m0;
  let cd = d0;
  ({ y: cy, m: cm, d: cd } = advanceCalendarDay(cy, cm, cd, 1));

  const deadline = Date.now() + MIN_LEAD_MS;

  for (let guard = 0; guard < 45; guard++) {
    while (isWeekendBratislava(cy, cm, cd)) {
      ({ y: cy, m: cm, d: cd } = advanceCalendarDay(cy, cm, cd, 1));
    }
    let allOk = true;
    for (const hour of HOURS) {
      if (slotStartUtcMs(cy, cm, cd, hour) < deadline) {
        allOk = false;
        break;
      }
    }
    if (allOk) {
      return { y: cy, m: cm, d: cd };
    }
    ({ y: cy, m: cm, d: cd } = advanceCalendarDay(cy, cm, cd, 1));
  }

  throw new Error('Could not find a valid seed day within 45 days (weekdays + 24h lead).');
}

async function run() {
  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME required. Set DB_* in .env');
    process.exit(1);
  }

  const { y: year, m: month, d: day } = pickSeedDay();
  const offset = getBratislavaOffsetHours(year, month);

  const conn = await mysql.createConnection(config);
  try {
    for (const hour of HOURS) {
      const startAt = toUtcDatetime(year, month, day, hour, offset);
      const endAt = toUtcDatetime(year, month, day, hour + 1, offset);
      await conn.execute(
        `INSERT INTO slots (start_at, end_at, timezone, status, capacity)
         VALUES (?, ?, ?, 'open', 1)`,
        [startAt, endAt, TZ]
      );
      console.log(
        `Created slot: ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hour}:00–${hour + 1}:00 (${TZ})`
      );
    }
    console.log('Done. 3 slots created (not on “today”; each >= 24h ahead, weekdays only).');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
