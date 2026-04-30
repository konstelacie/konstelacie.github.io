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

function latestFolderPath(target) {
  return path.join(DEPLOY_DIR, `latest-${target}`);
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function shouldSkip(relPath, isDir) {
  const p = toPosix(relPath);
  if (!p) return false;
  if (p === '.git' || p.startsWith('.git/')) return true;
  if (p === 'node_modules' || p.startsWith('node_modules/')) return true;
  if (p === 'deploy' || p.startsWith('deploy/')) return true;
  if (p === '.cursor' || p.startsWith('.cursor/')) return true;
  if (p === '.env') return true;
  if (p === 'storage/billing-pdfs' || p.startsWith('storage/billing-pdfs/')) return true;
  if (!isDir && p.startsWith('creative/funnel/') && p.endsWith('.mp4')) return true;
  if (!isDir && p.startsWith('creative/facebook-ads/') && p.endsWith('.mp4')) return true;
  return false;
}

function copyTree(sourceDir, targetDir, relBase = '') {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
    const targetPath = path.join(targetDir, relPath);

    if (shouldSkip(relPath, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetDir, relPath);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function prepareLatestFolder(target) {
  const latestDir = latestFolderPath(target);
  fs.rmSync(latestDir, { recursive: true, force: true });
  fs.mkdirSync(latestDir, { recursive: true });
  copyTree(ROOT_DIR, latestDir);
  console.log(`[${target}] Prepared latest deploy folder: ${latestDir}`);
  return latestDir;
}

function createZip(target, zipPath, sourceDir) {
  const psSourcePath = sourceDir.replace(/'/g, "''");
  const psZipPath = zipPath.replace(/'/g, "''");
  const psCmd = `Compress-Archive -Path '${psSourcePath}\\*' -DestinationPath '${psZipPath}' -Force`;
  run(`powershell -NoProfile -Command "${psCmd}"`, { cwd: ROOT_DIR });
  console.log(`[${target}] Created upload artifact: ${zipPath}`);
}

function writeInfo(target, zipPath, latestDir) {
  const infoPath = path.join(DEPLOY_DIR, `alwaysdata-${target}-latest.txt`);
  const relZipPath = path.relative(ROOT_DIR, zipPath).replace(/\\/g, '/');
  const relLatestDir = path.relative(ROOT_DIR, latestDir).replace(/\\/g, '/');
  const body = [
    `target=${target}`,
    `created_at=${new Date().toISOString()}`,
    `artifact=${relZipPath}`,
    `folder=${relLatestDir}`,
    '',
    'Upload flow:',
    '1) Upload ZIP content or latest folder content into alwaysdata app directory',
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
  const latestDir = prepareLatestFolder(target);
  createZip(target, zipPath, latestDir);
  writeInfo(target, zipPath, latestDir);
}

try {
  main();
} catch (err) {
  console.error(`Deploy packaging failed: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}
