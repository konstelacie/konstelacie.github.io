#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT_DIR, 'deploy');

function run(command, options = {}) {
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit', shell: true, ...options });
}

function argValue(name) {
  const args = process.argv.slice(2);
  const exact = `${name}=`;
  const inline = args.find((a) => a.startsWith(exact));
  if (inline) return inline.slice(exact.length);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return '';
}

function resolveTarget() {
  const raw = (argValue('--target') || '').trim().toLowerCase();
  if (raw === 'prod' || raw === 'preprod') return raw;
  throw new Error('Missing or invalid --target. Use --target=prod or --target=preprod.');
}

function ensureDeployDir() {
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });
}

function timestampForFile() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function zipOutputPath(target) {
  const fileName = `alwaysdata-${target}-${timestampForFile()}.zip`;
  return path.join(DEPLOY_DIR, fileName);
}

function createZip(target, zipPath) {
  const relZipPath = path.relative(ROOT_DIR, zipPath).replace(/\\/g, '/');
  const excludes = [
    '--exclude=.git',
    '--exclude=.git/*',
    '--exclude=node_modules',
    '--exclude=node_modules/*',
    '--exclude=.env',
    '--exclude=deploy',
    '--exclude=deploy/*',
    '--exclude=storage/billing-pdfs',
    '--exclude=storage/billing-pdfs/*',
    '--exclude=.cursor',
    '--exclude=.cursor/*',
    '--exclude=creative/funnel/*.mp4',
    '--exclude=creative/facebook-ads/*.mp4',
  ].join(' ');

  run(`tar -a -c -f "${relZipPath}" ${excludes} .`, { cwd: ROOT_DIR });
  console.log(`[${target}] Created upload artifact: ${zipPath}`);
}

function writeInfo(target, zipPath) {
  const infoPath = path.join(DEPLOY_DIR, `alwaysdata-${target}-latest.txt`);
  const relZipPath = path.relative(ROOT_DIR, zipPath).replace(/\\/g, '/');
  const body = [
    `target=${target}`,
    `created_at=${new Date().toISOString()}`,
    `artifact=${relZipPath}`,
    '',
    'Upload flow:',
    '1) Upload ZIP content into alwaysdata app directory',
    '2) Set env vars in alwaysdata admin',
    '3) Run npm ci --omit=dev on server',
    '4) Run npm run db:migrate on server',
    '',
  ].join('\n');
  fs.writeFileSync(infoPath, body, 'utf8');
  console.log(`[${target}] Wrote deployment info: ${infoPath}`);
}

function main() {
  const target = resolveTarget();
  process.chdir(ROOT_DIR);
  ensureDeployDir();

  const zipPath = zipOutputPath(target);
  createZip(target, zipPath);
  writeInfo(target, zipPath);
}

try {
  main();
} catch (err) {
  console.error(`Deploy packaging failed: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}
