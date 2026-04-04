#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const TIMEOUT_MS = 120_000;
const PRODUCT_NAME = 'Pluto Photos';

function walk(dir, matches = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matches);
      continue;
    }
    matches.push(fullPath);
  }
  return matches;
}

function scoreCandidate(candidatePath) {
  let score = 0;
  if (candidatePath.includes('win-unpacked')) score += 10;
  if (candidatePath.includes('linux-unpacked')) score += 10;
  if (candidatePath.includes(`${path.sep}Contents${path.sep}MacOS${path.sep}`)) score += 12;
  if (candidatePath.toLowerCase().includes(PRODUCT_NAME.toLowerCase())) score += 4;
  if (candidatePath.includes(process.env.PLUTO_EXPECTED_TARGET || '')) score += 2;
  return score;
}

function findExecutable() {
  if (!existsSync(DIST_DIR)) throw new Error(`dist directory not found: ${DIST_DIR}`);
  const files = walk(DIST_DIR, []);

  const candidates = files.filter((filePath) => {
    const normalized = filePath.toLowerCase();
    if (process.platform === 'win32') {
      return normalized.endsWith('.exe') && normalized.includes('unpacked') && !normalized.includes('uninstall');
    }
    if (process.platform === 'darwin') {
      return filePath.includes(`${path.sep}${PRODUCT_NAME}.app${path.sep}Contents${path.sep}MacOS${path.sep}`) && statSync(filePath).isFile();
    }
    return normalized.includes('linux-unpacked') && statSync(filePath).isFile() && path.extname(filePath) === '';
  });

  if (!candidates.length) {
    throw new Error(`No packaged executable found under ${DIST_DIR}`);
  }

  candidates.sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  return candidates[0];
}

function mapRunnerOs(value) {
  switch (value) {
    case 'Windows': return 'win32';
    case 'macOS': return 'darwin';
    case 'Linux': return 'linux';
    default: return value;
  }
}

function logCheck(ok, label, detail = '') {
  const suffix = detail ? ` (${detail})` : '';
  console.log(`[PackagedSmoke] ${ok ? 'PASS' : 'FAIL'} ${label}${suffix}`);
  if (!ok) throw new Error(detail ? `${label}: ${detail}` : label);
}

function validatePublishConfigText(configText, sourceLabel) {
  logCheck(/provider:\s+generic/.test(configText), 'builder config uses generic publish provider', sourceLabel);
  logCheck(/url:\s+https:\/\/plutophotos\.com\/downloads\//.test(configText), 'builder config includes publish URL', sourceLabel);
}

function validateBuilderConfig() {
  const configPath = path.join(DIST_DIR, 'builder-effective-config.yaml');
  if (existsSync(configPath)) {
    logCheck(true, 'builder effective config present', configPath);
    validatePublishConfigText(readFileSync(configPath, 'utf8'), configPath);
    return;
  }

  const sourceConfigPath = path.join(ROOT, 'electron-builder.yml');
  logCheck(existsSync(sourceConfigPath), 'builder config fallback present', sourceConfigPath);
  validatePublishConfigText(readFileSync(sourceConfigPath, 'utf8'), sourceConfigPath);
  console.log('[PackagedSmoke] PASS builder effective config skipped (not emitted for this --dir build)');
}

function validateReleaseMetadataWhenPresent() {
  const entries = readdirSync(DIST_DIR).filter((entry) => /^latest.*\.yml$/i.test(entry));
  if (!entries.length) {
    console.log('[PackagedSmoke] PASS release metadata skipped (no latest*.yml files in dist)');
    return;
  }

  for (const entry of entries) {
    const metadataPath = path.join(DIST_DIR, entry);
    const text = readFileSync(metadataPath, 'utf8');
    logCheck(/version:\s+.+/.test(text), `${entry} includes version`, metadataPath);
    logCheck(/sha512:\s+.+/.test(text), `${entry} includes sha512`, metadataPath);
    logCheck(/(path:\s+.+|files:\s*)/.test(text), `${entry} includes artifact path metadata`, metadataPath);
  }
}

async function main() {
  const expectedPlatform = mapRunnerOs(process.env.PLUTO_EXPECTED_PLATFORM);
  if (expectedPlatform && expectedPlatform !== process.platform) {
    throw new Error(`Runner/platform mismatch: expected ${expectedPlatform}, got ${process.platform}`);
  }

  const executablePath = findExecutable();
  validateBuilderConfig();
  validateReleaseMetadataWhenPresent();
  console.log(`[PackagedSmoke] Launching ${executablePath}`);

  await new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: 'true',
        PLUTO_PACKAGED_SMOKE_TEST: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Packaged smoke test timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Packaged app exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });

  console.log('[PackagedSmoke] Packaged launch succeeded');
}

main().catch((err) => {
  console.error('[PackagedSmoke] Failed:', err.message);
  process.exit(1);
});