#!/usr/bin/env node
/**
 * DB migration runner for citimtedasom.sk
 * Uses mysql2/promise and env vars: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * Run: npm run db:migrate | npm run db:status
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'citimtedasom',
  multipleStatements: true,
};

async function ensureSchemaMigrations(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getAppliedMigrations(conn) {
  const [rows] = await conn.execute('SELECT filename FROM schema_migrations ORDER BY id');
  return rows.map((r) => r.filename);
}

async function run() {
  const statusOnly = process.argv.includes('--status');

  if (!config.user || !config.database) {
    console.error('Error: DB_USER and DB_NAME are required. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env');
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection(config);
  } catch (err) {
    console.error('Error: Could not connect to database:', err.message);
    process.exit(1);
  }

  try {
    await ensureSchemaMigrations(conn);
    const applied = await getAppliedMigrations(conn);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (statusOnly) {
      console.log('Migration status:');
      for (const f of files) {
        const ok = applied.includes(f) ? 'applied' : 'pending';
        console.log(`  ${f}  [${ok}]`);
      }
      return;
    }

    for (const filename of files) {
      if (applied.includes(filename)) continue;

      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, 'utf8');

      try {
        await conn.query(sql);
        await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
        console.log(`Applied: ${filename}`);
      } catch (err) {
        console.error(`Error applying ${filename}:`, err.message);
        process.exit(1);
      }
    }

    const pending = files.filter((f) => !applied.includes(f));
    if (pending.length === 0 && files.length > 0) {
      console.log('All migrations already applied.');
    } else if (pending.length === 0) {
      console.log('No migration files found.');
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
