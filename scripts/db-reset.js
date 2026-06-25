#!/usr/bin/env node
/**
 * LOCAL DEV ONLY — drops and recreates the database, then runs migrations.
 * LIVE (since 2026-06): never run on production; use yarn db:migrate with new
 * idempotent migration files instead. See docs/DB-MIGRATIONS.md.
 * Slots are created via the admin UI (no automatic seed).
 * Run: yarn db:reset
 */
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  console.error('Error: db:reset must not run in production (NODE_ENV=production).');
  console.error('Use yarn db:migrate with a new idempotent migration file instead.');
  process.exit(1);
}
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'citim_teda_som',
};

async function run() {
  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME required. Set DB_* in .env');
    process.exit(1);
  }

  // LOCAL ONLY: drop/create empty database
  const connConfig = { ...config, database: undefined };
  let conn;
  try {
    conn = await mysql.createConnection(connConfig);
  } catch (err) {
    console.error('Error: Could not connect to MySQL:', err.message);
    process.exit(1);
  }

  try {
    await conn.execute(`DROP DATABASE IF EXISTS \`${config.database}\``);
    console.log(`Dropped database: ${config.database}`);

    await conn.execute(
      `CREATE DATABASE \`${config.database}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
    );
    console.log(`Created database: ${config.database}`);
  } finally {
    await conn.end();
  }

  console.log('Running migrations...');
  execSync('yarn db:migrate', { stdio: 'inherit', cwd: __dirname + '/..' });

  console.log('DB reset complete.');
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
