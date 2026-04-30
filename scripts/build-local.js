#!/usr/bin/env node
'use strict';

/**
 * Local setup helper (dev only).
 *
 * What it does:
 *  - Ensures `.env` exists (copies from `.env.example` if missing)
 *  - Runs `yarn install` if `node_modules` is missing
 *  - Runs `yarn db:migrate` if DB_* creds are present in `.env`
 *  - Optional: `--seed-slots` to run `yarn db:seed-slots` (inserts new rows)
 *
 * Usage:
 *   node scripts/build-local.js [--skip-install] [--skip-db] [--seed-slots]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DOTENV_EXAMPLE = path.join(ROOT_DIR, '.env.example');
const DOTENV_PATH = path.join(ROOT_DIR, '.env');
const NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function ensureDotenv() {
  if (fs.existsSync(DOTENV_PATH)) return false;
  if (!fs.existsSync(DOTENV_EXAMPLE)) {
    throw new Error(`Missing ${path.basename(DOTENV_EXAMPLE)} at repo root.`);
  }
  fs.copyFileSync(DOTENV_EXAMPLE, DOTENV_PATH);
  console.warn('Created .env from .env.example (edit DB_* and secrets before DB-dependent tasks).');
  return true;
}

function loadEnv() {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: DOTENV_PATH });
}

function main() {
  const skipInstall = hasArg('--skip-install');
  const skipDb = hasArg('--skip-db');
  const seedSlots = hasArg('--seed-slots');

  process.chdir(ROOT_DIR);

  ensureDotenv();
  loadEnv();

  if (!skipInstall && !fs.existsSync(NODE_MODULES_DIR)) {
    run('yarn install');
  } else if (skipInstall) {
    console.log('Skipping yarn install (--skip-install).');
  } else {
    console.log('node_modules present; skipping yarn install.');
  }

  if (!skipDb) {
    const hasDbCreds = Boolean(process.env.DB_USER && process.env.DB_NAME);
    if (!hasDbCreds) {
      console.warn('Skipping db:migrate: set DB_USER and DB_NAME in .env to enable DB tasks.');
    } else {
      run('yarn db:migrate');

      if (seedSlots) {
        // Inserts new rows; use only if you want fresh slot availability.
        run('yarn db:seed-slots');
      }
    }
  } else {
    console.log('Skipping DB tasks (--skip-db).');
  }

  console.log('Local build prep complete.');
}

try {
  main();
} catch (err) {
  console.error(`Local build failed: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}

