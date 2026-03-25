#!/usr/bin/env node
/**
 * Seed test slots (Europe/Bratislava): several weekdays × five session times each.
 * Times match funnel UI grid: 08:30, 10:00, 11:30, 13:00, 14:30 (90 min blocks).
 * Skips "today" and only starts on a weekday where every slot is >= now + 24h.
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
/** Same grid as public booking UI (`booking.js` + docs/ui-ux/booking-calendar.md). */
const SLOT_TIMES = [
  { h: 8, m: 30 },
  { h: 10, m: 0 },
  { h: 11, m: 30 },
  { h: 13, m: 0 },
  { h: 14, m: 30 },
];
const SESSION_MINUTES = 90;
const NUM_WEEKDAYS = 5;
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

function toUtcDatetimeMinutes(year, month, day, hour, minute, offsetHours) {
  const str = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+${pad(offsetHours)}:00`;
  const d = new Date(str);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

function endSqlFromStartMs(startMs) {
  return new Date(startMs + SESSION_MINUTES * 60 * 1000).toISOString().slice(0, 23).replace('T', ' ');
}

function slotStartUtcMsMinutes(y, m, d, hour, minute) {
  const offset = getBratislavaOffsetHours(y, m);
  const str = `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00+${pad(offset)}:00`;
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
 * First weekday strictly after "today" in Bratislava where every SLOT_TIMES
 * start is at least MIN_LEAD_MS from now.
 */
function pickFirstSeedDay() {
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
    for (const { h, m } of SLOT_TIMES) {
      if (slotStartUtcMsMinutes(cy, cm, cd, h, m) < deadline) {
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

/** Next `count` calendar weekdays starting from (y,m,d) (inclusive). */
function enumerateWeekdaysFrom(y, m, d, count) {
  const out = [];
  let cy = y;
  let cm = m;
  let cd = d;
  while (out.length < count) {
    while (isWeekendBratislava(cy, cm, cd)) {
      ({ y: cy, m: cm, d: cd } = advanceCalendarDay(cy, cm, cd, 1));
    }
    out.push({ y: cy, m: cm, d: cd });
    ({ y: cy, m: cm, d: cd } = advanceCalendarDay(cy, cm, cd, 1));
  }
  return out;
}

async function run() {
  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME required. Set DB_* in .env');
    process.exit(1);
  }

  const first = pickFirstSeedDay();
  const days = enumerateWeekdaysFrom(first.y, first.m, first.d, NUM_WEEKDAYS);

  const conn = await mysql.createConnection(config);
  try {
    let n = 0;
    for (const { y: year, m: month, d: day } of days) {
      const offset = getBratislavaOffsetHours(year, month);
      const dateLabel = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      for (const { h, m } of SLOT_TIMES) {
        const startMs = slotStartUtcMsMinutes(year, month, day, h, m);
        const startAt = toUtcDatetimeMinutes(year, month, day, h, m, offset);
        const endAt = endSqlFromStartMs(startMs);
        await conn.execute(
          `INSERT INTO slots (start_at, end_at, timezone, status, capacity)
           VALUES (?, ?, ?, 'open', 1)`,
          [startAt, endAt, TZ]
        );
        n += 1;
        console.log(`Created slot: ${dateLabel} ${pad(h)}:${pad(m)} (${TZ})`);
      }
    }
    console.log(`Done. ${n} slots (${NUM_WEEKDAYS} weekdays × ${SLOT_TIMES.length} times; not on “today”; 24h lead).`);
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
