#!/usr/bin/env node
/**
 * Seed 3 one-hour slots for today (Europe/Bratislava).
 * Uses same DB config as db-migrate.js.
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

function toUtcDatetime(year, month, day, hourLocal, offsetHours) {
  const pad = (n) => String(n).padStart(2, '0');
  const str = `${year}-${pad(month)}-${pad(day)}T${pad(hourLocal)}:00:00+${pad(offsetHours)}:00`;
  const d = new Date(str);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

async function run() {
  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME required. Set DB_* in .env');
    process.exit(1);
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month').value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day').value, 10);

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
      console.log(`Created slot: ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hour}:00–${hour + 1}:00 (${TZ})`);
    }
    console.log('Done. 3 slots created.');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
