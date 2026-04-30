#!/usr/bin/env node
/**
 * Seed test slots: weekdays × five session times (see src/config/slotGrid.js).
 * Uses Luxon for Europe/Bratislava wall time → UTC instants.
 * Skips "today" and only starts on a weekday where every slot is >= now + 24h.
 * Run: node scripts/seed-slots.js  |  yarn db:seed-slots
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { DateTime } = require('luxon');
const { SLOT_TIMEZONE, SLOT_TIMES, SLOT_DURATION_MINUTES } = require('../src/config/slotGrid');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'citim_teda_som',
};

const NUM_WEEKDAYS = 5;
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

function slotInstantsForLocalDate(localDateStr) {
  const [y, m, d] = localDateStr.split('-').map(Number);
  return SLOT_TIMES.map((timeKey, gridIndex) => {
    const [hh, mm] = timeKey.split(':').map(Number);
    const startLocal = DateTime.fromObject(
      { year: y, month: m, day: d, hour: hh, minute: mm },
      { zone: SLOT_TIMEZONE }
    );
    if (!startLocal.isValid) {
      throw new Error(`Invalid slot: ${localDateStr} ${timeKey}`);
    }
    const startUtc = startLocal.toUTC();
    const endUtc = startUtc.plus({ minutes: SLOT_DURATION_MINUTES });
    return { gridIndex, startUtc, endUtc };
  });
}

function pickFirstSeedDay() {
  const deadline = DateTime.utc().plus({ milliseconds: MIN_LEAD_MS });
  let d = DateTime.now().setZone(SLOT_TIMEZONE).startOf('day').plus({ days: 1 });

  for (let guard = 0; guard < 45; guard++) {
    while (d.weekday > 5) {
      d = d.plus({ days: 1 });
    }
    const dateStr = d.toFormat('yyyy-MM-dd');
    const instants = slotInstantsForLocalDate(dateStr);
    const allOk = instants.every((x) => x.startUtc > deadline);
    if (allOk) {
      return d;
    }
    d = d.plus({ days: 1 });
  }

  throw new Error('Could not find a valid seed day within 45 days (weekdays + 24h lead).');
}

function enumerateWeekdaysFrom(startDay, count) {
  const out = [];
  let d = startDay;
  while (out.length < count) {
    while (d.weekday > 5) {
      d = d.plus({ days: 1 });
    }
    out.push(d);
    d = d.plus({ days: 1 });
  }
  return out;
}

async function run() {
  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME required. Set DB_* in .env');
    process.exit(1);
  }

  const first = pickFirstSeedDay();
  const days = enumerateWeekdaysFrom(first, NUM_WEEKDAYS);

  const conn = await mysql.createConnection(config);
  try {
    let n = 0;
    for (const day of days) {
      const dateStr = day.toFormat('yyyy-MM-dd');
      const instants = slotInstantsForLocalDate(dateStr);
      for (const { gridIndex, startUtc, endUtc } of instants) {
        await conn.execute(
          `INSERT INTO slots (local_date, grid_index, timezone, start_at_utc, end_at_utc, status, capacity)
           VALUES (?, ?, ?, ?, ?, 'open', 1)`,
          [dateStr, gridIndex, SLOT_TIMEZONE, startUtc.toJSDate(), endUtc.toJSDate()]
        );
        n += 1;
        console.log(`Created slot: ${dateStr} ${SLOT_TIMES[gridIndex]} (${SLOT_TIMEZONE})`);
      }
    }
    console.log(
      `Done. ${n} slots (${NUM_WEEKDAYS} weekdays × ${SLOT_TIMES.length} times; not on “today”; 24h lead).`
    );
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
