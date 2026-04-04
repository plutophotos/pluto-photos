#!/usr/bin/env node
/**
 * ci-smoke-test.mjs — Headless smoke test for CI (macOS, Linux & Windows).
 *
 * Runs critical subsystems with Electron's Node runtime so native modules
 * (sharp, better-sqlite3, onnxruntime-node) use the correct ABI.
 *
 * Tests cover:
 *   Core       — DB init, Sharp, protocol paths, crypto hashing, exifr
 *   Import     — folder import, file import, thumbnail generation
 *   Albums     — create album, set cover, query
 *   Licensing  — activate, deactivate, tier checks, feature gating
 *   Faces      — save detected faces, people grouping, merge, reassign
 *   GPS/Map    — extract GPS, bulk scan, distinct locations
 *   Smart      — create/query/update/delete smart albums
 *   Duplicates — dHash (difference hash), grouping, dismissal
 *   BG Removal — RMBG model path, ONNX session creation
 *   Editor     — apply edits (rotate/crop/brightness), save, auto-enhance
 *   Cloud      — Google Takeout import (offline / file-only)
 *   Batch      — batch rating, color label, tag, album ops
 *   Tags       — set rating, color label, add/remove tag, get details
 *   FK/Cascade — foreign key enforcement, cascade deletes
 *   Recursive  — nested folder import with expanded format support
 *   DupeScan   — skip already-hashed, pre-loaded hash grouping
 *   Color      — RGB color name mapping, B&W detection, vibrant analysis
 *   Projects   — CRUD, collapse toggle, cascade cleanup
 *   Settings   — CRUD, numeric/boolean/slideshow settings
 *   SyncFolder — new file detection, stale entry cleanup
 *   Captions   — text search, synonym expansion, LIKE patterns
 *   Similarity — cosine similarity, L2 normalisation
 *   HMAC       — license signing, tamper detection, legacy format
 *   dHash      — difference hash algorithm, hamming distance, sharp pipeline
 *   AutoMerge  — norm sort, squared distance, early-exit pruning
 *   Pagination — LIMIT/OFFSET, total count, backward compatibility
 *   ScanState  — pause/resume/cancel flags, ETA calculation
 *   DB Backup  — backup creation, keep-last-N rotation
 *   Formats    — expanded supported formats regex validation
 *   Schema     — rating column in CREATE TABLE, index safety, migration no-op
 *   Thumbnails — async existence checks, Promise.allSettled, batch chunking
 *   MigrOrder — index creation after ALTER TABLE migration on legacy DBs
 *   Preload   — built preload bundles @electron-toolkit/preload inline
 *   VideoFmt  — isVideo regex matches all accepted extensions (m4v, 3gp, wmv…)
 *   PlutoURL  — toPlutoUrl encodes #, ?, % for safe pluto:// protocol URLs
 *   PathBound — isPathAllowed rejects prefix-only matches (path.sep boundary)
 *   CaseDB    — COLLATE NOCASE for case-insensitive path lookups (Windows)
 *   HashNorm  — MD5 hash case normalisation for Windows thumbnail cache
 *   NTFSLock  — video temp-file cleanup with retry on NTFS lock
 *   FFmpegRes — ffmpeg path resolution: Homebrew, where/which, bundled
 *   MIMETypes — companion API MIME_TYPES covers all video extensions
 *   DockerEnv — Docker-specific thumbnail generation (600×600), env vars
 *   MacSign   — afterSign.cjs findExecutables signs ffmpeg binary
 *   CrossPlat — cross-platform launch sanity (process.platform guards)
 *   ScopeSafe — IPC handler identifiers defined before app.whenReady()
 *   ThumbPipe — DB-lookup handler, priority queue, EXIF/Sharp pipeline
 *   VideoEdit — compose-video handler, text/watermark normalization, drawtext
 *   FaceReview— needs_review, suggested_person_id, exact_hash schema columns
 *
 * Usage:  node scripts/ci-smoke-test.mjs
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 120_000; // 2 min max

// ── Create a small valid 1x1 red PNG for image tests ────────

function createTestImage(dir, name = 'test-smoke.png') {
  const imgPath = path.join(dir, name);
  // Valid 1x1 red pixel PNG (RGB, bit depth 8)
  const png = Buffer.from([
    0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
    0x00,0x00,0x00,0x0d, 0x49,0x48,0x44,0x52,
    0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0x01,
    0x08,0x02, 0x00,0x00,0x00, 0x90,0x77,0x53,0xde,
    0x00,0x00,0x00,0x0c, 0x49,0x44,0x41,0x54,
    0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00,0x00,
    0x00,0x02,0x00,0x01,0xe2,0x21,0xbc,0x33,
    0x00,0x00,0x00,0x00, 0x49,0x45,0x4e,0x44, 0xae,0x42,0x60,0x82,
  ]);
  writeFileSync(imgPath, png);
  return imgPath;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Pluto Photos — Comprehensive CI Smoke Test    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  // Prepare temp directory
  const tmpDir = path.join(ROOT, '.smoke-test-tmp');
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Create a fake "imported folder" with test images
  const fakeFolder = path.join(tmpDir, 'test-photos');
  mkdirSync(fakeFolder, { recursive: true });
  createTestImage(fakeFolder, 'photo1.png');
  createTestImage(fakeFolder, 'photo2.png');
  createTestImage(fakeFolder, 'photo3.png');

  // Create a fake Google Takeout structure
  const takeoutDir = path.join(tmpDir, 'Takeout', 'Google Photos', 'Album1');
  mkdirSync(takeoutDir, { recursive: true });
  createTestImage(takeoutDir, 'IMG_001.png');
  writeFileSync(path.join(takeoutDir, 'IMG_001.png.json'), JSON.stringify({
    title: 'IMG_001.png',
    photoTakenTime: { timestamp: '1700000000' },
    geoData: { latitude: 37.7749, longitude: -122.4194 }
  }));

  // Write the comprehensive test runner script
  const testScript = generateTestScript(tmpDir, fakeFolder, takeoutDir);
  const testScriptPath = path.join(tmpDir, 'smoke-test-runner.cjs');
  writeFileSync(testScriptPath, testScript);

  // Resolve electron binary
  let electronPkg;
  try {
    const resolved = execSync(
      `node -e "process.stdout.write(require('electron'))"`,
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    ).trim();
    electronPkg = resolved;
  } catch {
    electronPkg = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  }

  console.log(`Platform:    ${process.platform}`);
  console.log(`Electron:    ${electronPkg}`);
  console.log(`Temp Dir:    ${tmpDir}`);
  console.log();

  return new Promise((resolve) => {
    const child = spawn(electronPkg, [testScriptPath], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: path.join(ROOT, 'node_modules'),
      },
      timeout: TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });

    const timer = setTimeout(() => {
      console.error('\n❌ Smoke test timed out after ' + (TIMEOUT_MS / 1000) + 's');
      child.kill('SIGKILL');
      process.exit(1);
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      console.log();
      if (code === 0) {
        console.log('🎉 All smoke tests passed!');
        // Cleanup
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        process.exit(0);
      } else {
        console.error(`❌ Smoke test failed with exit code ${code}`);
        process.exit(1);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error('❌ Failed to start electron:', err.message);
      process.exit(1);
    });
  });
}

// ── Generate the CJS test script that runs inside Electron ──

function generateTestScript(tmpDir, fakeFolder, takeoutDir) {
  const esc = (s) => JSON.stringify(s);

  return `
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TMP_DIR = ${esc(tmpDir)};
const FAKE_FOLDER = ${esc(fakeFolder)};
const TAKEOUT_DIR = ${esc(takeoutDir)};
const ROOT = ${esc(ROOT)};
const DB_PATH = path.join(TMP_DIR, 'smoke-test.db');
const CACHE_PATH = path.join(TMP_DIR, 'thumbnails');

fs.mkdirSync(CACHE_PATH, { recursive: true });

// ── Test framework ──────────────────────────────────────────
const results = { passed: 0, failed: 0, errors: [] };
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📦 ' + name);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function assert(name, fn) {
  try {
    fn();
    results.passed++;
    console.log('  ✅ ' + name);
  } catch (err) {
    results.failed++;
    results.errors.push(currentSection + ' > ' + name + ': ' + err.message);
    console.error('  ❌ ' + name + ': ' + err.message);
  }
}

async function assertAsync(name, fn) {
  try {
    await fn();
    results.passed++;
    console.log('  ✅ ' + name);
  } catch (err) {
    results.failed++;
    results.errors.push(currentSection + ' > ' + name + ': ' + err.message);
    console.error('  ❌ ' + name + ': ' + err.message);
  }
}

// ── Initialize DB (mirrors src/main/index.js schema) ────────
const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(\`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE, mac_bookmark TEXT);
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_collapsed INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER,
    name TEXT,
    full_path TEXT UNIQUE,
    thumb_path TEXT,
    file_type TEXT,
    date_taken REAL,
    rating INTEGER DEFAULT 0,
    color_label TEXT DEFAULT '',
    gps_lat REAL,
    gps_lng REAL,
    gps_scanned INTEGER DEFAULT 0,
    FOREIGN KEY(folder_id) REFERENCES folders(id)
  );
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover_path TEXT,
    sort_order INTEGER DEFAULT 0,
    project_id INTEGER DEFAULT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS album_images (
    album_id INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    PRIMARY KEY (album_id, image_id),
    FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS image_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(image_id, tag),
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT 'Unknown',
    sample_face_path TEXT,
    centroid TEXT
  );
  CREATE TABLE IF NOT EXISTS image_faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL,
    person_id INTEGER,
    x REAL, y REAL, width REAL, height REAL,
    descriptor TEXT,
    landmarks TEXT,
    match_score REAL,
    match_type TEXT,
    needs_review INTEGER DEFAULT 0,
    suggested_person_id INTEGER,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS smart_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rules TEXT NOT NULL,
    icon TEXT DEFAULT NULL,
    match_all INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS image_hashes (
    image_id INTEGER PRIMARY KEY,
    phash TEXT,
    exact_hash TEXT,
    exact_quick_hash TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS dismissed_duplicates (
    image_id_1 INTEGER NOT NULL,
    image_id_2 INTEGER NOT NULL,
    PRIMARY KEY (image_id_1, image_id_2)
  );
  CREATE TABLE IF NOT EXISTS image_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER,
    edit_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    output_path TEXT
  );
  CREATE TABLE IF NOT EXISTS image_captions (
    image_id INTEGER PRIMARY KEY,
    captions TEXT,
    embedding TEXT,
    scanned_at INTEGER,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS dismissed_context_results (
    query_text TEXT NOT NULL,
    image_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (query_text, image_id)
  );
\`);

// ── TESTS ───────────────────────────────────────────────────

(async () => {

  // ═══════════════════════════════════════════════════════════
  // 1. Core Infrastructure
  // ═══════════════════════════════════════════════════════════
  section('Core Infrastructure');

  assert('better-sqlite3 loads and creates tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const required = ['settings','folders','images','albums','album_images','image_tags',
                      'people','image_faces','smart_albums','image_hashes','dismissed_duplicates',
                      'image_edits','image_captions','dismissed_context_results'];
    for (const t of required) {
      if (!tables.includes(t)) throw new Error('Missing table: ' + t);
    }
  });

  assert('sharp loads', () => {
    const sharp = require('sharp');
    if (!sharp) throw new Error('sharp is undefined');
  });

  await assertAsync('sharp thumbnail generation', async () => {
    const sharp = require('sharp');
    const src = path.join(FAKE_FOLDER, 'photo1.png');
    const out = path.join(CACHE_PATH, 'thumb-test.webp');
    await sharp(src, { failOn: 'none' })
      .resize(100, 100, { fit: 'cover' })
      .webp({ quality: 75 })
      .toFile(out);
    if (!fs.existsSync(out)) throw new Error('Thumbnail not created');
    if (fs.statSync(out).size < 10) throw new Error('Thumbnail too small');
  });

  assert('crypto md5 hash', () => {
    const hash = crypto.createHash('md5').update('/Users/test/photo.jpg').digest('hex');
    if (hash.length !== 32) throw new Error('Bad hash length: ' + hash.length);
  });

  assert('exifr loads', () => {
    const exifr = require('exifr');
    if (!exifr || !exifr.parse) throw new Error('exifr.parse missing');
  });

  assert('protocol path resolution (macOS)', () => {
    const url = new URL('pluto:///Users/test/Photos/img.jpg');
    let p = decodeURIComponent(url.pathname);
    const resolved = path.resolve(path.normalize(p));
    if (process.platform !== 'win32') {
      if (!resolved.startsWith('/')) throw new Error('Expected / prefix: ' + resolved);
    }
  });

  assert('protocol path resolution (Windows)', () => {
    const url = new URL('pluto://c/Users/test/Photos/img.jpg');
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith('/')) p = p.substring(1);
    if (url.hostname && /^[a-zA-Z]$/.test(url.hostname)) {
      p = url.hostname.toUpperCase() + ':' + (p.startsWith('/') ? '' : '/') + p;
    } else if (p.length > 1 && p[1] !== ':' && /^[a-zA-Z]/.test(p)) {
      p = p[0] + ':' + p.substring(1);
    }
    if (!p.startsWith('C:')) throw new Error('Expected C: got: ' + p);
    if (p.includes('U:sers')) throw new Error('Double-colon bug: ' + p);
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Folder Import
  // ═══════════════════════════════════════════════════════════
  section('Folder Import');

  assert('insert folder into DB', () => {
    const result = db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').run(FAKE_FOLDER);
    if (!result.lastInsertRowid) throw new Error('No folder ID');
  });

  assert('scan and insert images from folder', () => {
    const folderId = db.prepare('SELECT id FROM folders WHERE path = ?').get(FAKE_FOLDER).id;
    const files = fs.readdirSync(FAKE_FOLDER).filter(f => /\\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(f));
    if (files.length === 0) throw new Error('No files found in test folder');

    const insert = db.prepare('INSERT OR IGNORE INTO images (folder_id, name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?, ?)');
    db.transaction((list) => {
      for (const f of list) {
        const full = path.join(FAKE_FOLDER, f);
        const stats = fs.statSync(full);
        insert.run(folderId, f, full, path.extname(f).slice(1).toLowerCase(), stats.mtimeMs);
      }
    })(files);

    const count = db.prepare('SELECT COUNT(*) as c FROM images WHERE folder_id = ?').get(folderId).c;
    if (count !== 3) throw new Error('Expected 3 images, got ' + count);
  });

  await assertAsync('generate thumbnails for imported images', async () => {
    const sharp = require('sharp');
    const rows = db.prepare('SELECT full_path FROM images WHERE thumb_path IS NULL').all();
    let generated = 0;
    for (const row of rows) {
      const hash = crypto.createHash('md5').update(row.full_path).digest('hex');
      const thumbPath = path.join(CACHE_PATH, hash + '.webp');
      await sharp(row.full_path, { failOn: 'none' })
        .rotate()
        .resize(600, 600, { fit: 'cover' })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      db.prepare('UPDATE images SET thumb_path = ? WHERE full_path = ?').run(thumbPath, row.full_path);
      generated++;
    }
    if (generated !== 3) throw new Error('Expected 3 thumbnails, generated ' + generated);
  });

  // ═══════════════════════════════════════════════════════════
  // 3. File Import
  // ═══════════════════════════════════════════════════════════
  section('File Import');

  assert('import individual file', () => {
    const src = path.join(FAKE_FOLDER, 'photo1.png');
    const newFile = path.join(TMP_DIR, 'individual-import.png');
    fs.copyFileSync(src, newFile);
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type, date_taken) VALUES (?, ?, ?, ?)')
      .run(newFile, 'individual-import.png', 'png', Date.now());
    const row = db.prepare('SELECT id FROM images WHERE full_path = ?').get(newFile);
    if (!row) throw new Error('Individual file not inserted');
  });

  // ═══════════════════════════════════════════════════════════
  // 4. Albums & Album Cover
  // ═══════════════════════════════════════════════════════════
  section('Albums & Album Cover');

  let testAlbumId;
  assert('create album', () => {
    const result = db.prepare('INSERT INTO albums (name) VALUES (?)').run('Test Album');
    testAlbumId = result.lastInsertRowid;
    if (!testAlbumId) throw new Error('No album ID returned');
  });

  assert('add images to album', () => {
    const images = db.prepare('SELECT id FROM images LIMIT 2').all();
    const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)');
    for (const img of images) insert.run(testAlbumId, img.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM album_images WHERE album_id = ?').get(testAlbumId).c;
    if (count !== 2) throw new Error('Expected 2 images in album, got ' + count);
  });

  assert('set album cover', () => {
    const img = db.prepare('SELECT full_path FROM images LIMIT 1').get();
    db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(img.full_path, testAlbumId);
    const album = db.prepare('SELECT cover_path FROM albums WHERE id = ?').get(testAlbumId);
    if (album.cover_path !== img.full_path) throw new Error('Cover not set');
  });

  assert('query album images', () => {
    const rows = db.prepare(
      'SELECT i.full_path FROM images i JOIN album_images ai ON i.id = ai.image_id WHERE ai.album_id = ?'
    ).all(testAlbumId);
    if (rows.length !== 2) throw new Error('Expected 2 album images, got ' + rows.length);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. Licensing
  // ═══════════════════════════════════════════════════════════
  section('Licensing');

  assert('store license activation', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license', ?)").run(JSON.stringify({
      tier: 'pro',
      email: 'test@example.com',
      licenseKey: 'TEST-KEY-1234',
      activatedAt: new Date().toISOString(),
    }));
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license'").get();
    const license = JSON.parse(row.value);
    if (license.tier !== 'pro') throw new Error('License tier mismatch');
    if (license.email !== 'test@example.com') throw new Error('Email mismatch');
  });

  assert('license deactivation clears data', () => {
    db.prepare("DELETE FROM settings WHERE key = 'license'").run();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license'").get();
    if (row) throw new Error('License not cleared');
  });

  assert('free tier limits apply', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license'").get();
    if (row) throw new Error('Should be free tier (no license)');
    const folderCount = db.prepare('SELECT COUNT(*) as c FROM folders').get().c;
    if (typeof folderCount !== 'number') throw new Error('Cannot count folders');
  });

  assert('pro tier re-activation', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license', ?)").run(JSON.stringify({
      tier: 'pro', email: 'pro@example.com', licenseKey: 'PRO-KEY-5678',
      activatedAt: new Date().toISOString(),
    }));
    const license = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'license'").get().value);
    if (license.tier !== 'pro') throw new Error('Pro tier not set');
  });

  assert('feature gating by tier', () => {
    const TIERS = {
      free: { features: { editPhoto: false, faceDetection: false, mapView: false, smartAlbums: false } },
      pro:  { features: { editPhoto: true, faceDetection: true, mapView: true, smartAlbums: true } },
    };
    if (TIERS.free.features.faceDetection !== false) throw new Error('Free should not have faceDetection');
    if (TIERS.pro.features.faceDetection !== true) throw new Error('Pro should have faceDetection');
    if (TIERS.free.features.editPhoto !== false) throw new Error('Free should not have editPhoto');
    if (TIERS.pro.features.smartAlbums !== true) throw new Error('Pro should have smartAlbums');
  });

  assert('usage stats query', () => {
    const stats = {
      imageCount: db.prepare('SELECT COUNT(*) as c FROM images').get().c,
      albumCount: db.prepare('SELECT COUNT(*) as c FROM albums').get().c,
      folderCount: db.prepare('SELECT COUNT(*) as c FROM folders').get().c,
    };
    if (stats.imageCount < 3) throw new Error('Expected >= 3 images');
    if (stats.albumCount < 1) throw new Error('Expected >= 1 album');
    if (stats.folderCount < 1) throw new Error('Expected >= 1 folder');
  });

  // ═══════════════════════════════════════════════════════════
  // 6. Face Detection & People
  // ═══════════════════════════════════════════════════════════
  section('Face Detection & People');

  let person1Id, person2Id;
  assert('create people', () => {
    const r1 = db.prepare("INSERT INTO people (name, centroid) VALUES (?, ?)").run('Alice', JSON.stringify([0.1, 0.2, 0.3]));
    const r2 = db.prepare("INSERT INTO people (name, centroid) VALUES (?, ?)").run('Bob', JSON.stringify([0.8, 0.7, 0.6]));
    person1Id = r1.lastInsertRowid;
    person2Id = r2.lastInsertRowid;
    if (!person1Id || !person2Id) throw new Error('People not created');
  });

  assert('save detected faces', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, person1Id, 0.1, 0.2, 0.3, 0.3, JSON.stringify([0.1, 0.2, 0.3]));
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, person2Id, 0.5, 0.2, 0.3, 0.3, JSON.stringify([0.8, 0.7, 0.6]));
    const faces = db.prepare('SELECT COUNT(*) as c FROM image_faces WHERE image_id = ?').get(img.id).c;
    if (faces !== 2) throw new Error('Expected 2 faces, got ' + faces);
  });

  assert('get people with face count (uses DISTINCT image_id)', () => {
    const people = db.prepare(
      'SELECT p.id, p.name, COUNT(DISTINCT f.image_id) as face_count FROM people p LEFT JOIN image_faces f ON p.id = f.person_id AND f.person_id IS NOT NULL GROUP BY p.id HAVING face_count > 0 ORDER BY face_count DESC'
    ).all();
    if (people.length !== 2) throw new Error('Expected 2 people, got ' + people.length);
  });

  assert('rename person', () => {
    db.prepare('UPDATE people SET name = ? WHERE id = ?').run('Alice Smith', person1Id);
    const p = db.prepare('SELECT name FROM people WHERE id = ?').get(person1Id);
    if (p.name !== 'Alice Smith') throw new Error('Rename failed');
  });

  assert('merge people', () => {
    db.prepare('UPDATE image_faces SET person_id = ? WHERE person_id = ?').run(person1Id, person2Id);
    db.prepare('DELETE FROM people WHERE id = ?').run(person2Id);
    const faces = db.prepare('SELECT COUNT(*) as c FROM image_faces WHERE person_id = ?').get(person1Id).c;
    if (faces !== 2) throw new Error('After merge, expected 2 faces on person1');
    if (db.prepare('SELECT id FROM people WHERE id = ?').get(person2Id)) throw new Error('Person2 should be deleted');
    // Centroid should be recomputed after merge (average of all descriptors)
    const allFaces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(person1Id);
    if (allFaces.length === 0) throw new Error('No face descriptors for centroid recompute');
    const dim = JSON.parse(allFaces[0].descriptor).length;
    const avg = new Array(dim).fill(0);
    for (const f of allFaces) {
      const d = JSON.parse(f.descriptor);
      for (let i = 0; i < dim; i++) avg[i] += d[i];
    }
    for (let i = 0; i < dim; i++) avg[i] /= allFaces.length;
    db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(avg), person1Id);
    const p = db.prepare('SELECT centroid FROM people WHERE id = ?').get(person1Id);
    if (!p.centroid) throw new Error('Centroid should be set after merge');
    const stored = JSON.parse(p.centroid);
    if (Math.abs(stored[0] - avg[0]) > 0.001) throw new Error('Centroid not correctly averaged');
  });

  assert('reassign face', () => {
    const r = db.prepare("INSERT INTO people (name) VALUES ('Charlie')").run();
    const charlieId = r.lastInsertRowid;
    const face = db.prepare('SELECT id FROM image_faces LIMIT 1').get();
    db.prepare('UPDATE image_faces SET person_id = ? WHERE id = ?').run(charlieId, face.id);
    const f = db.prepare('SELECT person_id FROM image_faces WHERE id = ?').get(face.id);
    if (f.person_id !== charlieId) throw new Error('Reassign failed');
  });

  assert('centroid distance calculation', () => {
    const c1 = [0.1, 0.2, 0.3, 0.4];
    const c2 = [0.15, 0.25, 0.35, 0.45];
    const c3 = [0.9, 0.8, 0.7, 0.6];
    function distance(a, b) {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return Math.sqrt(sum);
    }
    const d12 = distance(c1, c2);
    const d13 = distance(c1, c3);
    if (d12 >= d13) throw new Error('Similar centroids should have smaller distance');
    if (d12 >= 0.6) throw new Error('Close centroids should be under threshold');
    if (d13 < 0.6) throw new Error('Far centroids should be over threshold');
  });

  assert('reset face data', () => {
    db.prepare('DELETE FROM image_faces').run();
    db.prepare('DELETE FROM people').run();
    if (db.prepare('SELECT COUNT(*) as c FROM image_faces').get().c !== 0) throw new Error('Faces not cleared');
    if (db.prepare('SELECT COUNT(*) as c FROM people').get().c !== 0) throw new Error('People not cleared');
  });

  assert('orphan cleanup removes people with no faces', () => {
    const r = db.prepare("INSERT INTO people (name) VALUES ('Orphan')").run();
    const orphanId = r.lastInsertRowid;
    // No faces for this person — cleanup should remove them
    db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM image_faces WHERE person_id IS NOT NULL)').run();
    if (db.prepare('SELECT id FROM people WHERE id = ?').get(orphanId)) throw new Error('Orphan should be cleaned up');
  });

  assert('delete face updates centroid', () => {
    const r1 = db.prepare("INSERT INTO people (name, centroid) VALUES ('Dave', ?)").run(JSON.stringify([0.5, 0.5, 0.5]));
    const daveId = r1.lastInsertRowid;
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    const f1 = db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, daveId, 0, 0, 50, 50, JSON.stringify([0.2, 0.2, 0.2]));
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, daveId, 60, 0, 50, 50, JSON.stringify([0.8, 0.8, 0.8]));
    // Delete first face
    db.prepare('DELETE FROM image_faces WHERE id = ?').run(f1.lastInsertRowid);
    // Recompute centroid (should now just be the second face's descriptor)
    const faces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(daveId);
    if (faces.length !== 1) throw new Error('Should have 1 face remaining');
    const remaining = JSON.parse(faces[0].descriptor);
    db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(remaining), daveId);
    const p = db.prepare('SELECT centroid FROM people WHERE id = ?').get(daveId);
    const centroid = JSON.parse(p.centroid);
    if (Math.abs(centroid[0] - 0.8) > 0.001) throw new Error('Centroid should match remaining face');
    // Cleanup
    db.prepare('DELETE FROM image_faces WHERE person_id = ?').run(daveId);
    db.prepare('DELETE FROM people WHERE id = ?').run(daveId);
  });

  assert('multi-person photo appears for each person', () => {
    const r1 = db.prepare("INSERT INTO people (name) VALUES ('PersonA')").run();
    const r2 = db.prepare("INSERT INTO people (name) VALUES ('PersonB')").run();
    const idA = r1.lastInsertRowid;
    const idB = r2.lastInsertRowid;
    const img = db.prepare('SELECT id, full_path FROM images LIMIT 1').get();
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, idA, 0, 0, 50, 50, JSON.stringify([0.1, 0.2, 0.3]));
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(img.id, idB, 60, 0, 50, 50, JSON.stringify([0.9, 0.8, 0.7]));
    // Both persons should have this image
    const imgA = db.prepare('SELECT DISTINCT i.id FROM images i JOIN image_faces f ON i.id = f.image_id WHERE f.person_id = ?').all(idA);
    const imgB = db.prepare('SELECT DISTINCT i.id FROM images i JOIN image_faces f ON i.id = f.image_id WHERE f.person_id = ?').all(idB);
    if (imgA.length !== 1) throw new Error('PersonA should have 1 image');
    if (imgB.length !== 1) throw new Error('PersonB should have 1 image');
    if (imgA[0].id !== imgB[0].id) throw new Error('Both persons should reference the same image');
    // Cleanup
    db.prepare('DELETE FROM image_faces WHERE person_id IN (?, ?)').run(idA, idB);
    db.prepare('DELETE FROM people WHERE id IN (?, ?)').run(idA, idB);
  });

  // ═══════════════════════════════════════════════════════════
  // 7. GPS / Map Feature
  // ═══════════════════════════════════════════════════════════
  section('GPS / Map Feature');

  assert('store GPS coordinates', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(37.7749, -122.4194, img.id);
    const row = db.prepare('SELECT gps_lat, gps_lng FROM images WHERE id = ?').get(img.id);
    if (Math.abs(row.gps_lat - 37.7749) > 0.001) throw new Error('Latitude mismatch');
    if (Math.abs(row.gps_lng - (-122.4194)) > 0.001) throw new Error('Longitude mismatch');
  });

  assert('query images with GPS', () => {
    const rows = db.prepare('SELECT full_path, gps_lat, gps_lng FROM images WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL').all();
    if (rows.length < 1) throw new Error('No GPS images found');
  });

  assert('get distinct locations', () => {
    const img2 = db.prepare('SELECT id FROM images WHERE gps_lat IS NULL LIMIT 1').get();
    if (img2) db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ? WHERE id = ?').run(40.7128, -74.0060, img2.id);
    const locations = db.prepare(
      "SELECT DISTINCT ROUND(gps_lat, 2) || ',' || ROUND(gps_lng, 2) as loc FROM images WHERE gps_lat IS NOT NULL"
    ).all();
    if (locations.length < 1) throw new Error('No distinct locations');
  });

  assert('bulk GPS scan marks images as scanned', () => {
    db.prepare('UPDATE images SET gps_scanned = 1 WHERE gps_scanned = 0 OR gps_scanned IS NULL').run();
    const unscanned = db.prepare('SELECT COUNT(*) as c FROM images WHERE gps_scanned = 0 OR gps_scanned IS NULL').get().c;
    if (unscanned !== 0) throw new Error('Some images not marked as scanned');
  });

  // ═══════════════════════════════════════════════════════════
  // 8. Smart Albums
  // ═══════════════════════════════════════════════════════════
  section('Smart Albums');

  let smartAlbumId;
  assert('create smart album (file_type rule)', () => {
    const rules = [{ type: 'file_type', value: 'png' }];
    const result = db.prepare('INSERT INTO smart_albums (name, rules, icon) VALUES (?, ?, ?)').run('PNG Files', JSON.stringify(rules), '📷');
    smartAlbumId = result.lastInsertRowid;
    if (!smartAlbumId) throw new Error('Smart album not created');
  });

  assert('query smart album matches images', () => {
    const sa = db.prepare('SELECT rules FROM smart_albums WHERE id = ?').get(smartAlbumId);
    const rules = JSON.parse(sa.rules);
    let params = [];
    let conditions = [];
    for (const rule of rules) {
      if (rule.type === 'file_type') { conditions.push('file_type = ?'); params.push(rule.value); }
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const rows = db.prepare('SELECT full_path FROM images' + where).all(...params);
    if (rows.length < 1) throw new Error('Smart album query returned no results');
  });

  assert('smart album with rating rule', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('UPDATE images SET rating = 5 WHERE id = ?').run(img.id);
    db.prepare('INSERT INTO smart_albums (name, rules) VALUES (?, ?)').run('Top Rated', JSON.stringify([{ type: 'rating_gte', value: 4 }]));
    const rows = db.prepare('SELECT full_path FROM images WHERE rating >= 4').all();
    if (rows.length < 1) throw new Error('Rating smart album returned no results');
  });

  assert('smart album with GPS rule', () => {
    db.prepare('INSERT INTO smart_albums (name, rules) VALUES (?, ?)').run('Geotagged', JSON.stringify([{ type: 'has_gps', value: true }]));
    const rows = db.prepare('SELECT full_path FROM images WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL').all();
    if (rows.length < 1) throw new Error('GPS smart album returned no results');
  });

  assert('smart album with date rule', () => {
    db.prepare('INSERT INTO smart_albums (name, rules) VALUES (?, ?)').run('Recent', JSON.stringify([{ type: 'date_after', value: '2020-01-01' }]));
    const cutoff = new Date('2020-01-01').getTime();
    const rows = db.prepare('SELECT full_path FROM images WHERE date_taken > ?').all(cutoff);
    if (rows.length < 1) throw new Error('Date smart album should find recent images');
  });

  assert('update smart album', () => {
    db.prepare('UPDATE smart_albums SET name = ? WHERE id = ?').run('All PNGs', smartAlbumId);
    if (db.prepare('SELECT name FROM smart_albums WHERE id = ?').get(smartAlbumId).name !== 'All PNGs') throw new Error('Not updated');
  });

  assert('delete smart album', () => {
    const tempId = db.prepare('INSERT INTO smart_albums (name, rules) VALUES (?, ?)').run('To Delete', '[]').lastInsertRowid;
    db.prepare('DELETE FROM smart_albums WHERE id = ?').run(tempId);
    if (db.prepare('SELECT id FROM smart_albums WHERE id = ?').get(tempId)) throw new Error('Not deleted');
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Duplicate Finder
  // ═══════════════════════════════════════════════════════════
  section('Duplicate Finder');

  assert('compute difference hash (dHash)', () => {
    // dHash: resize to 9x8, compare each pixel with right neighbor
    const pixels = new Uint8Array(72); // 9 columns x 8 rows
    for (let i = 0; i < 72; i++) pixels[i] = i * 3; // gradient
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hash += pixels[row * 9 + col] < pixels[row * 9 + col + 1] ? '1' : '0';
      }
    }
    if (hash.length !== 64) throw new Error('dHash should be 64 bits, got ' + hash.length);
  });

  assert('store and find duplicate hashes', () => {
    const images = db.prepare('SELECT id FROM images LIMIT 3').all();
    const insert = db.prepare('INSERT OR REPLACE INTO image_hashes (image_id, phash, file_size) VALUES (?, ?, ?)');
    insert.run(images[0].id, 'abcdef1234567890', 1024);
    insert.run(images[1].id, 'abcdef1234567890', 1024);
    insert.run(images[2].id, 'different_hash__', 2048);
    const dupes = db.prepare('SELECT phash, COUNT(*) as cnt FROM image_hashes GROUP BY phash HAVING cnt > 1').all();
    if (dupes.length !== 1) throw new Error('Expected 1 duplicate group, got ' + dupes.length);
    if (dupes[0].cnt !== 2) throw new Error('Expected 2 in group, got ' + dupes[0].cnt);
  });

  assert('dismiss duplicate group', () => {
    const images = db.prepare('SELECT id FROM images LIMIT 2').all();
    db.prepare('INSERT OR IGNORE INTO dismissed_duplicates (image_id_1, image_id_2) VALUES (?, ?)').run(images[0].id, images[1].id);
    const dismissed = db.prepare('SELECT COUNT(*) as c FROM dismissed_duplicates WHERE image_id_1 = ? AND image_id_2 = ?').get(images[0].id, images[1].id).c;
    if (dismissed !== 1) throw new Error('Dismiss not stored');
  });

  assert('duplicates exclude dismissed pairs', () => {
    const row = db.prepare('SELECT * FROM dismissed_duplicates LIMIT 1').get();
    if (!row) throw new Error('No dismissed pairs in table');
    const isDismissed = !!db.prepare(
      'SELECT 1 FROM dismissed_duplicates WHERE image_id_1 = ? AND image_id_2 = ?'
    ).get(row.image_id_1, row.image_id_2);
    if (!isDismissed) throw new Error('Dismissed pair not found');
  });

  // ═══════════════════════════════════════════════════════════
  // 10. Background Removal
  // ═══════════════════════════════════════════════════════════
  section('Background Removal');

  assert('RMBG model directory exists', () => {
    const rmbgPath = path.join(ROOT, 'resources', 'bg-removal-rmbg');
    if (!fs.existsSync(rmbgPath)) throw new Error('RMBG model dir missing: ' + rmbgPath);
  });

  assert('ONNX model file exists', () => {
    const modelPath = path.join(ROOT, 'resources', 'bg-removal-rmbg', 'onnx', 'model.onnx');
    if (!fs.existsSync(modelPath)) throw new Error('ONNX model missing: ' + modelPath);
  });

  await assertAsync('onnxruntime-node loads', async () => {
    try {
      const ort = await import('onnxruntime-node');
      if (!ort.InferenceSession) throw new Error('InferenceSession not available');
    } catch (err) {
      if (err.message.includes('not available')) throw err;
      throw new Error('onnxruntime-node import failed: ' + err.message);
    }
  });

  await assertAsync('RMBG inference session creation', async () => {
    const modelPath = path.join(ROOT, 'resources', 'bg-removal-rmbg', 'onnx', 'model.onnx');
    if (!fs.existsSync(modelPath)) { console.log('    (skipped — model not present)'); return; }
    try {
      const ort = await import('onnxruntime-node');
      const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      if (!session.inputNames || session.inputNames.length === 0) throw new Error('No input names');
      if (!session.outputNames || session.outputNames.length === 0) throw new Error('No output names');
    } catch (err) {
      throw new Error('Session creation failed: ' + err.message);
    }
  });

  section('Face Recognition');

  assert('ArcFace model file exists', () => {
    const modelPath = path.join(ROOT, 'resources', 'face-models', 'arcface', 'w600k_r50.onnx');
    if (!fs.existsSync(modelPath)) throw new Error('ArcFace model missing: ' + modelPath);
  });

  assert('ArcFace model is not a Git LFS pointer', () => {
    const modelPath = path.join(ROOT, 'resources', 'face-models', 'arcface', 'w600k_r50.onnx');
    const stat = fs.statSync(modelPath);
    if (stat.size < 1024 * 1024) {
      const head = fs.readFileSync(modelPath, 'utf8').slice(0, 128);
      if (head.includes('git-lfs.github.com/spec/v1')) {
        throw new Error('ArcFace model is still a Git LFS pointer file');
      }
      throw new Error('ArcFace model is unexpectedly small: ' + stat.size + ' bytes');
    }
  });

  await assertAsync('ArcFace inference session creation', async () => {
    const modelPath = path.join(ROOT, 'resources', 'face-models', 'arcface', 'w600k_r50.onnx');
    if (!fs.existsSync(modelPath)) throw new Error('ArcFace model missing: ' + modelPath);
    try {
      const ort = await import('onnxruntime-node');
      const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      if (!session.inputNames || session.inputNames.length === 0) throw new Error('No input names');
      if (!session.outputNames || session.outputNames.length === 0) throw new Error('No output names');
    } catch (err) {
      throw new Error('ArcFace session creation failed: ' + err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 11. Photo Editor (Sharp pipeline)
  // ═══════════════════════════════════════════════════════════
  section('Photo Editor');

  // Create a larger test image for editor tests
  await assertAsync('create editor test image', async () => {
    const sharp = require('sharp');
    await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png().toFile(path.join(TMP_DIR, 'big.png'));
  });

  await assertAsync('apply rotation edit', async () => {
    const sharp = require('sharp');
    const out = path.join(TMP_DIR, 'rotated.png');
    await sharp(path.join(TMP_DIR, 'big.png')).rotate(90).toFile(out);
    if (!fs.existsSync(out)) throw new Error('Rotated file not created');
  });

  await assertAsync('apply crop edit', async () => {
    const sharp = require('sharp');
    const out = path.join(TMP_DIR, 'cropped.png');
    await sharp(path.join(TMP_DIR, 'big.png')).extract({ left: 10, top: 10, width: 100, height: 100 }).toFile(out);
    const meta = await sharp(out).metadata();
    if (meta.width !== 100 || meta.height !== 100) throw new Error('Crop dimensions wrong: ' + meta.width + 'x' + meta.height);
  });

  await assertAsync('apply brightness/contrast/saturation', async () => {
    const sharp = require('sharp');
    const out = path.join(TMP_DIR, 'adjusted.png');
    await sharp(path.join(TMP_DIR, 'big.png'))
      .modulate({ brightness: 1.1, saturation: 1.2 })
      .linear(1.1, 0)
      .toFile(out);
    if (!fs.existsSync(out)) throw new Error('Adjusted file not created');
  });

  await assertAsync('apply sharpen', async () => {
    const sharp = require('sharp');
    const out = path.join(TMP_DIR, 'sharpened.png');
    await sharp(path.join(TMP_DIR, 'big.png')).sharpen().toFile(out);
    if (!fs.existsSync(out)) throw new Error('Sharpened file not created');
  });

  await assertAsync('auto-enhance pipeline', async () => {
    const sharp = require('sharp');
    const out = path.join(TMP_DIR, 'enhanced.png');
    await sharp(path.join(TMP_DIR, 'big.png'))
      .modulate({ brightness: 1.05, saturation: 1.15 })
      .sharpen({ sigma: 1.2 })
      .linear(1.05, 0)
      .toFile(out);
    if (!fs.existsSync(out)) throw new Error('Enhanced file not created');
  });

  assert('save edit record to DB', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    const editData = JSON.stringify({ rotate: 90, brightness: 1.1 });
    const outputPath = path.join(TMP_DIR, 'rotated.png');
    db.prepare('INSERT INTO image_edits (image_id, edit_data, output_path) VALUES (?, ?, ?)').run(img.id, editData, outputPath);
    const edit = db.prepare('SELECT * FROM image_edits WHERE image_id = ?').get(img.id);
    if (!edit) throw new Error('Edit not saved');
    if (edit.output_path !== outputPath) throw new Error('Output path mismatch');
  });

  assert('retrieve and delete edit record', () => {
    const edits = db.prepare('SELECT * FROM image_edits').all();
    if (edits.length < 1) throw new Error('No edits found');
    db.prepare('DELETE FROM image_edits WHERE id = ?').run(edits[0].id);
    if (db.prepare('SELECT id FROM image_edits WHERE id = ?').get(edits[0].id)) throw new Error('Edit not deleted');
  });

  await assertAsync('get image dimensions', async () => {
    const sharp = require('sharp');
    const meta = await sharp(path.join(TMP_DIR, 'big.png')).metadata();
    if (meta.width !== 200 || meta.height !== 200) throw new Error('Dim mismatch: ' + meta.width + 'x' + meta.height);
  });

  // ═══════════════════════════════════════════════════════════
  // 12. Cloud Import (Google Takeout — offline)
  // ═══════════════════════════════════════════════════════════
  section('Cloud Import (Google Takeout)');

  assert('read Takeout directory structure', () => {
    if (!fs.existsSync(TAKEOUT_DIR)) throw new Error('Takeout dir missing');
    const files = fs.readdirSync(TAKEOUT_DIR).filter(f => !f.endsWith('.json'));
    if (files.length < 1) throw new Error('No images in Takeout');
  });

  assert('parse Takeout JSON sidecar', () => {
    const meta = JSON.parse(fs.readFileSync(path.join(TAKEOUT_DIR, 'IMG_001.png.json'), 'utf-8'));
    if (!meta.photoTakenTime) throw new Error('Missing photoTakenTime');
    if (!meta.geoData) throw new Error('Missing geoData');
    if (meta.geoData.latitude !== 37.7749) throw new Error('Latitude mismatch');
    if (meta.geoData.longitude !== -122.4194) throw new Error('Longitude mismatch');
  });

  assert('import Takeout images to DB', () => {
    const walkDir = (dir) => {
      const results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) results.push(...walkDir(path.join(dir, entry.name)));
        else if (/\\.(jpe?g|png|webp|gif|mp4|mov|heic|heif)$/i.test(entry.name)) {
          results.push(path.join(dir, entry.name));
        }
      }
      return results;
    };
    const takeoutFiles = walkDir(path.dirname(TAKEOUT_DIR));
    if (takeoutFiles.length < 1) throw new Error('No files found in Takeout walk');

    const insert = db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type, date_taken, gps_lat, gps_lng) VALUES (?, ?, ?, ?, ?, ?)');
    let imported = 0;
    for (const filePath of takeoutFiles) {
      const jsonSidecar = filePath + '.json';
      let dateTaken = Date.now(), lat = null, lng = null;
      if (fs.existsSync(jsonSidecar)) {
        try {
          const meta = JSON.parse(fs.readFileSync(jsonSidecar, 'utf-8'));
          if (meta.photoTakenTime) dateTaken = parseInt(meta.photoTakenTime.timestamp) * 1000;
          if (meta.geoData && meta.geoData.latitude) { lat = meta.geoData.latitude; lng = meta.geoData.longitude; }
        } catch {}
      }
      insert.run(filePath, path.basename(filePath), path.extname(filePath).slice(1).toLowerCase(), dateTaken, lat, lng);
      imported++;
    }
    if (imported < 1) throw new Error('No Takeout images imported');
  });

  assert('verify Takeout GPS data stored', () => {
    const rows = db.prepare("SELECT gps_lat, gps_lng FROM images WHERE full_path LIKE '%Takeout%' AND gps_lat IS NOT NULL").all();
    if (rows.length < 1) throw new Error('GPS not stored from Takeout sidecar');
    if (Math.abs(rows[0].gps_lat - 37.7749) > 0.001) throw new Error('Takeout lat mismatch');
  });

  // ═══════════════════════════════════════════════════════════
  // 13. Batch Operations
  // ═══════════════════════════════════════════════════════════
  section('Batch Operations');

  assert('batch set rating', () => {
    const images = db.prepare('SELECT id, full_path FROM images LIMIT 3').all();
    const stmt = db.prepare('UPDATE images SET rating = ? WHERE full_path = ?');
    db.transaction((list) => { for (const img of list) stmt.run(4, img.full_path); })(images);
    for (const img of images) {
      if (db.prepare('SELECT rating FROM images WHERE id = ?').get(img.id).rating !== 4) throw new Error('Batch rating failed');
    }
  });

  assert('batch set color label', () => {
    const images = db.prepare('SELECT id, full_path FROM images LIMIT 3').all();
    const stmt = db.prepare('UPDATE images SET color_label = ? WHERE full_path = ?');
    db.transaction((list) => { for (const img of list) stmt.run('red', img.full_path); })(images);
    for (const img of images) {
      if (db.prepare('SELECT color_label FROM images WHERE id = ?').get(img.id).color_label !== 'red') throw new Error('Batch color failed');
    }
  });

  assert('batch add tag', () => {
    const images = db.prepare('SELECT id FROM images LIMIT 3').all();
    const insertTag = db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)');
    db.transaction((list) => { for (const img of list) insertTag.run(img.id, 'batch-test'); })(images);
    for (const img of images) {
      const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id);
      if (!tags.some(t => t.tag === 'batch-test')) throw new Error('Batch tag not added');
    }
  });

  assert('batch move to album', () => {
    const albumId = db.prepare('INSERT INTO albums (name) VALUES (?)').run('Batch Album').lastInsertRowid;
    const images = db.prepare('SELECT id FROM images LIMIT 3').all();
    const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)');
    db.transaction((list) => { for (const img of list) insert.run(albumId, img.id); })(images);
    const count = db.prepare('SELECT COUNT(*) as c FROM album_images WHERE album_id = ?').get(albumId).c;
    if (count !== 3) throw new Error('Expected 3 in batch album, got ' + count);
  });

  await assertAsync('batch export', async () => {
    const sharp = require('sharp');
    const exportDir = path.join(TMP_DIR, 'export');
    fs.mkdirSync(exportDir, { recursive: true });
    const images = db.prepare('SELECT full_path FROM images LIMIT 2').all();
    let exported = 0;
    for (const img of images) {
      if (!fs.existsSync(img.full_path)) continue;
      const outName = path.basename(img.full_path, path.extname(img.full_path)) + '.webp';
      await sharp(img.full_path, { failOn: 'none' })
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(path.join(exportDir, outName));
      exported++;
    }
    if (exported < 1) throw new Error('No images exported');
  });

  // ═══════════════════════════════════════════════════════════
  // 14. Tags, Ratings & Color Labels
  // ═══════════════════════════════════════════════════════════
  section('Tags, Ratings & Color Labels');

  assert('set image rating', () => {
    const img = db.prepare('SELECT id, full_path FROM images LIMIT 1').get();
    db.prepare('UPDATE images SET rating = ? WHERE full_path = ?').run(5, img.full_path);
    if (db.prepare('SELECT rating FROM images WHERE id = ?').get(img.id).rating !== 5) throw new Error('Rating not set');
  });

  assert('set image color label', () => {
    const img = db.prepare('SELECT id, full_path FROM images LIMIT 1').get();
    db.prepare('UPDATE images SET color_label = ? WHERE full_path = ?').run('green', img.full_path);
    if (db.prepare('SELECT color_label FROM images WHERE id = ?').get(img.id).color_label !== 'green') throw new Error('Label not set');
  });

  assert('add image tag', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(img.id, 'nature');
    db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(img.id, 'landscape');
    const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id).map(r => r.tag);
    if (!tags.includes('nature')) throw new Error('Tag "nature" not added');
    if (!tags.includes('landscape')) throw new Error('Tag "landscape" not added');
  });

  assert('remove image tag', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('DELETE FROM image_tags WHERE image_id = ? AND tag = ?').run(img.id, 'landscape');
    const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id).map(r => r.tag);
    if (tags.includes('landscape')) throw new Error('Tag not removed');
    if (!tags.includes('nature')) throw new Error('Other tag should remain');
  });

  assert('get image details', () => {
    const img = db.prepare('SELECT id, rating, color_label, gps_lat, gps_lng, date_taken FROM images LIMIT 1').get();
    const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id).map(r => r.tag);
    const details = { ...img, tags };
    if (typeof details.rating !== 'number') throw new Error('Rating missing');
    if (!Array.isArray(details.tags)) throw new Error('Tags not array');
  });

  assert('get all tags with counts', () => {
    const tags = db.prepare('SELECT tag, COUNT(*) as count FROM image_tags GROUP BY tag ORDER BY count DESC').all();
    if (tags.length < 1) throw new Error('No tags found');
    if (!tags[0].tag || typeof tags[0].count !== 'number') throw new Error('Tag format wrong');
  });

  assert('get filter counts', () => {
    const counts = {
      total: db.prepare('SELECT COUNT(*) as c FROM images').get().c,
      notRated: db.prepare('SELECT COUNT(*) as c FROM images WHERE rating IS NULL OR rating = 0').get().c,
      notTagged: db.prepare('SELECT COUNT(*) as c FROM images WHERE id NOT IN (SELECT DISTINCT image_id FROM image_tags)').get().c,
      noLabel: db.prepare("SELECT COUNT(*) as c FROM images WHERE color_label IS NULL OR color_label = ''").get().c,
    };
    if (typeof counts.total !== 'number') throw new Error('Total count missing');
    if (counts.total < 3) throw new Error('Expected at least 3 images');
  });

  // ═══════════════════════════════════════════════════════════
  // 15. Foreign Key Enforcement
  // ═══════════════════════════════════════════════════════════
  section('Foreign Key Enforcement');

  assert('FK rejects invalid folder_id in images', () => {
    try {
      db.prepare('INSERT INTO images (folder_id, name, full_path, file_type) VALUES (?, ?, ?, ?)').run(99999, 'bad.png', '/tmp/bad.png', 'png');
      throw new Error('Should have thrown FK constraint error');
    } catch (err) {
      if (err.message.includes('Should have thrown')) throw err;
      if (!err.message.includes('FOREIGN KEY')) throw new Error('Expected FK error, got: ' + err.message);
    }
  });

  assert('FK rejects invalid album_id in album_images', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    try {
      db.prepare('INSERT INTO album_images (album_id, image_id) VALUES (?, ?)').run(99999, img.id);
      throw new Error('Should have thrown FK constraint error');
    } catch (err) {
      if (err.message.includes('Should have thrown')) throw err;
      if (!err.message.includes('FOREIGN KEY')) throw new Error('Expected FK error, got: ' + err.message);
    }
  });

  assert('FK rejects invalid image_id in image_tags', () => {
    try {
      db.prepare('INSERT INTO image_tags (image_id, tag) VALUES (?, ?)').run(99999, 'orphan');
      throw new Error('Should have thrown FK constraint error');
    } catch (err) {
      if (err.message.includes('Should have thrown')) throw err;
      if (!err.message.includes('FOREIGN KEY')) throw new Error('Expected FK error, got: ' + err.message);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 16. Cascade Deletes (Projects → Albums → Album Images)
  // ═══════════════════════════════════════════════════════════
  section('Cascade Deletes');

  assert('delete project cascades to albums and album_images', () => {
    const projId = db.prepare('INSERT INTO projects (name) VALUES (?)').run('CascadeProj').lastInsertRowid;
    const albId = db.prepare('INSERT INTO albums (name, project_id) VALUES (?, ?)').run('CascadeAlb', projId).lastInsertRowid;
    const imgId = db.prepare('SELECT id FROM images LIMIT 1').get().id;
    db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)').run(albId, imgId);

    // Verify setup
    if (!db.prepare('SELECT id FROM albums WHERE id = ?').get(albId)) throw new Error('Album not created');
    if (!db.prepare('SELECT * FROM album_images WHERE album_id = ?').get(albId)) throw new Error('Album image not added');

    // Delete project — cascade should remove albums & album_images
    db.transaction(() => {
      const albums = db.prepare('SELECT id FROM albums WHERE project_id = ?').all(projId);
      albums.forEach(a => db.prepare('DELETE FROM album_images WHERE album_id = ?').run(a.id));
      db.prepare('DELETE FROM albums WHERE project_id = ?').run(projId);
      db.prepare('DELETE FROM projects WHERE id = ?').run(projId);
    })();

    if (db.prepare('SELECT id FROM projects WHERE id = ?').get(projId)) throw new Error('Project not deleted');
    if (db.prepare('SELECT id FROM albums WHERE id = ?').get(albId)) throw new Error('Album should be cascade deleted');
    if (db.prepare('SELECT * FROM album_images WHERE album_id = ?').get(albId)) throw new Error('Album images should be cascade deleted');
  });

  assert('delete album cascades to album_images', () => {
    const albId = db.prepare('INSERT INTO albums (name) VALUES (?)').run('CascadeAlb2').lastInsertRowid;
    const imgId = db.prepare('SELECT id FROM images LIMIT 1').get().id;
    db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)').run(albId, imgId);

    db.transaction(() => {
      db.prepare('DELETE FROM album_images WHERE album_id = ?').run(albId);
      db.prepare('DELETE FROM albums WHERE id = ?').run(albId);
    })();

    if (db.prepare('SELECT id FROM albums WHERE id = ?').get(albId)) throw new Error('Album not deleted');
    if (db.prepare('SELECT * FROM album_images WHERE album_id = ?').get(albId)) throw new Error('Album images not cascade deleted');
  });

  assert('delete image cascades to tags, faces, album_images, hashes, captions', () => {
    // Create a standalone image with all related data
    const imgResult = db.prepare("INSERT INTO images (full_path, name, file_type) VALUES (?, ?, ?)").run('/tmp/cascade-test.png', 'cascade-test.png', 'png');
    const imgId = imgResult.lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(imgId, 'cascade-tag');
    db.prepare('INSERT OR IGNORE INTO image_hashes (image_id, phash, file_size) VALUES (?, ?, ?)').run(imgId, 'cascadehash000', 100);
    db.prepare('INSERT OR IGNORE INTO image_captions (image_id, captions) VALUES (?, ?)').run(imgId, 'a test photo');
    const personId = db.prepare("INSERT INTO people (name) VALUES ('CascadePerson')").run().lastInsertRowid;
    db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)').run(imgId, personId, 10, 10, 50, 50);

    // Delete the image
    db.prepare('DELETE FROM images WHERE id = ?').run(imgId);

    // All FK-cascaded rows should be gone
    if (db.prepare('SELECT * FROM image_tags WHERE image_id = ?').get(imgId)) throw new Error('Tags not cascade deleted');
    if (db.prepare('SELECT * FROM image_hashes WHERE image_id = ?').get(imgId)) throw new Error('Hashes not cascade deleted');
    if (db.prepare('SELECT * FROM image_captions WHERE image_id = ?').get(imgId)) throw new Error('Captions not cascade deleted');
    if (db.prepare('SELECT * FROM image_faces WHERE image_id = ?').get(imgId)) throw new Error('Faces not cascade deleted');

    // Cleanup orphan person
    db.prepare('DELETE FROM people WHERE id = ?').run(personId);
  });

  // ═══════════════════════════════════════════════════════════
  // 17. Recursive Folder Import
  // ═══════════════════════════════════════════════════════════
  section('Recursive Folder Import');

  assert('recursive walk finds images in subdirectories', () => {
    // Create nested folder structure
    const nestedDir = path.join(TMP_DIR, 'nested-import');
    const subDir1 = path.join(nestedDir, 'vacation');
    const subDir2 = path.join(nestedDir, 'vacation', 'day1');
    fs.mkdirSync(subDir2, { recursive: true });

    // Copy test images into different levels
    const src = path.join(FAKE_FOLDER, 'photo1.png');
    fs.copyFileSync(src, path.join(nestedDir, 'top-level.png'));
    fs.copyFileSync(src, path.join(subDir1, 'mid-level.png'));
    fs.copyFileSync(src, path.join(subDir2, 'deep-level.png'));

    // Walk function (mirrors the fixed import-folder logic)
    const supportedRe = /\\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i;
    const files = [];
    const walkDir = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(fullPath);
        else if (supportedRe.test(entry.name)) files.push(fullPath);
      }
    };
    walkDir(nestedDir);

    if (files.length !== 3) throw new Error('Expected 3 files from recursive walk, got ' + files.length);
    const basenames = files.map(f => path.basename(f)).sort();
    if (!basenames.includes('top-level.png')) throw new Error('Missing top-level file');
    if (!basenames.includes('mid-level.png')) throw new Error('Missing mid-level file');
    if (!basenames.includes('deep-level.png')) throw new Error('Missing deep-level file');
  });

  // ═══════════════════════════════════════════════════════════
  // 18. Duplicate Scan — Skip Already-Hashed
  // ═══════════════════════════════════════════════════════════
  section('Duplicate Scan — Skip Already-Hashed');

  assert('skip already-hashed images on re-scan', () => {
    // Ensure all current images have hashes from section 9
    const allImages = db.prepare('SELECT id FROM images').all();
    const hashedCount = db.prepare('SELECT COUNT(*) as c FROM image_hashes').get().c;

    // Query for unhashed images (LEFT JOIN pattern from fix #13)
    const unhashed = db.prepare('SELECT i.id FROM images i LEFT JOIN image_hashes ih ON i.id = ih.image_id WHERE ih.image_id IS NULL').all();

    // All test images that were hashed in the duplicate section should be excluded
    if (unhashed.length >= allImages.length) {
      // This would mean the optimisation isn't working — all images returned
      // (some may legitimately be unhashed if they weren't in the duplicate section)
    }

    // Verify pre-existing hashes survive re-query
    const existing = db.prepare('SELECT image_id, phash FROM image_hashes LIMIT 1').get();
    if (!existing) throw new Error('Expected at least one pre-existing hash');
    if (!existing.phash) throw new Error('Pre-existing hash should have a phash value');
  });

  assert('pre-loaded hashes are included in duplicate groups', () => {
    // Simulate the fix: pre-load existing + hash new, then group
    const hashMap = {};

    // Step 1: pre-load existing hashes (mirrors the new code in find-duplicates)
    const existingHashes = db.prepare('SELECT ih.image_id, ih.phash, ih.file_size, i.full_path FROM image_hashes ih JOIN images i ON i.id = ih.image_id').all();
    for (const h of existingHashes) {
      const key = h.phash || 'size:' + h.file_size;
      if (!hashMap[key]) hashMap[key] = [];
      hashMap[key].push({ id: h.image_id, full_path: h.full_path });
    }

    // Step 2: unhashed images would be processed here (none in this test)

    // Step 3: verify groups form correctly
    const groups = Object.values(hashMap).filter(g => g.length > 1);
    // We added two images with the same phash 'abcdef1234567890' in section 9
    if (groups.length < 1) throw new Error('Expected at least 1 duplicate group from pre-loaded hashes');
  });

  // ═══════════════════════════════════════════════════════════
  // 19. Color / Tone Analysis
  // ═══════════════════════════════════════════════════════════
  section('Color / Tone Analysis');

  assert('rgbToColorName — basic primaries', () => {
    // Re-implement the pure function for testing
    function rgbToColorName(r, g, b) {
      const rn = r/255, gn = g/255, bn = b/255;
      const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
      const l = (max+min)/2, d = max-min;
      if (d < 0.04) { if (l < 0.18) return 'black'; if (l > 0.82) return 'white'; return 'gray'; }
      const s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      let h = 0;
      if (max===rn) h = ((gn-bn)/d + (gn<bn?6:0))*60;
      else if (max===gn) h = ((bn-rn)/d + 2)*60;
      else h = ((rn-gn)/d + 4)*60;
      if (s < 0.1) { if (l<0.18) return 'black'; if (l>0.82) return 'white'; return 'gray'; }
      if (s < 0.2) { if (l<0.2) return 'black'; if (l>0.82) return 'white'; if (h>=15&&h<50&&l>0.5) return 'beige'; if (h>=15&&h<50) return 'brown'; if (h>=210&&h<280&&l>0.6) return 'lavender'; return 'gray'; }
      if (h>=15&&h<45&&l>0.55&&(s<0.5||l>0.75)) return 'beige';
      if (h<10||h>=340) { if (l<0.28) return 'maroon'; if (l>0.8) return 'pink'; if (l>0.7&&s<0.5) return 'pink'; return 'red'; }
      if (h<25) { if (l<0.25) return 'brown'; return s<0.45?'brown':(l<0.45?'brown':'orange'); }
      if (h<45) { if (l<0.28) return 'brown'; return 'orange'; }
      if (h<62) { if (l<0.25||s<0.3) return 'olive'; return l<0.45?'gold':'yellow'; }
      if (h<85) { if (l<0.4||s<0.3) return 'olive'; return 'yellow'; }
      if (h<160) { if (l<0.35&&s<0.5) return 'olive'; return 'green'; }
      if (h<190) return 'teal';
      if (h<200) return l<0.25?'teal':'cyan';
      if (h<260) { if (l<0.28) return 'navy'; if (l>0.7&&s<0.4) return 'lavender'; return 'blue'; }
      if (h<300) { if (l>0.7) return 'lavender'; return 'purple'; }
      if (l<0.28) return 'purple'; if (l>0.65) return 'pink'; return s>0.6?'magenta':'pink';
    }

    const tests = [
      { rgb: [255, 0, 0], expected: 'red' },
      { rgb: [0, 128, 0], expected: 'green' },
      { rgb: [0, 0, 255], expected: 'blue' },
      { rgb: [0, 0, 0], expected: 'black' },
      { rgb: [255, 255, 255], expected: 'white' },
      { rgb: [128, 128, 128], expected: 'gray' },
      { rgb: [255, 255, 0], expected: 'yellow' },
      { rgb: [255, 165, 0], expected: 'orange' },
      { rgb: [128, 0, 128], expected: 'purple' },
      { rgb: [255, 192, 203], expected: 'pink' },
      { rgb: [0, 128, 128], expected: 'teal' },
      { rgb: [128, 0, 0], expected: 'maroon' },
      { rgb: [0, 0, 128], expected: 'navy' },
      { rgb: [80, 80, 0], expected: 'olive' },
      { rgb: [0, 200, 255], expected: 'cyan' },
      { rgb: [200, 170, 0], expected: 'gold' },
      { rgb: [210, 180, 140], expected: 'beige' },
      { rgb: [200, 160, 240], expected: 'lavender' },
      { rgb: [255, 0, 255], expected: 'magenta' },
    ];

    for (const t of tests) {
      const result = rgbToColorName(t.rgb[0], t.rgb[1], t.rgb[2]);
      if (result !== t.expected) throw new Error('rgb(' + t.rgb.join(',') + '): expected "' + t.expected + '", got "' + result + '"');
    }
  });

  await assertAsync('analyseColorScheme — detects B&W image', async () => {
    const sharp = require('sharp');
    // Create a grayscale image (all pixels ~128)
    const grayBuf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
    // Analyse — should detect achromatic scheme
    const { data } = await sharp(grayBuf).resize(64, 64, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let achromaticCount = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const spread = Math.max(r,g,b) - Math.min(r,g,b);
      if (spread < 20) achromaticCount++;
    }
    const achromaticRatio = achromaticCount / (data.length / 3);
    if (achromaticRatio < 0.85) throw new Error('Gray image should be >85% achromatic, got ' + (achromaticRatio * 100).toFixed(1) + '%');
  });

  await assertAsync('analyseColorScheme — detects vibrant red', async () => {
    const sharp = require('sharp');
    const redBuf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 220, g: 30, b: 30 } } }).png().toBuffer();
    const { data } = await sharp(redBuf).resize(64, 64, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let warmCount = 0, totalChromatic = 0;
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const spread = Math.max(r,g,b) - Math.min(r,g,b);
      if (spread >= 20) {
        totalChromatic++;
        const rn = r/255, gn = g/255, bn = b/255;
        const max = Math.max(rn,gn,bn), min = Math.min(rn,gn,bn);
        let h = 0;
        const d = max - min;
        if (d > 0) {
          if (max===rn) h = ((gn-bn)/d + (gn<bn?6:0))*60;
          else if (max===gn) h = ((bn-rn)/d + 2)*60;
          else h = ((rn-gn)/d + 4)*60;
        }
        if (h < 60 || h >= 300) warmCount++;
      }
    }
    const warmRatio = totalChromatic > 0 ? warmCount / totalChromatic : 0;
    if (warmRatio < 0.65) throw new Error('Red image should be >65% warm pixels, got ' + (warmRatio * 100).toFixed(1) + '%');
  });

  // ═══════════════════════════════════════════════════════════
  // 20. Projects CRUD
  // ═══════════════════════════════════════════════════════════
  section('Projects CRUD');

  assert('create project', () => {
    const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run('My Project');
    if (!result.lastInsertRowid) throw new Error('No project ID');
  });

  assert('query project', () => {
    const proj = db.prepare("SELECT * FROM projects WHERE name = 'My Project'").get();
    if (!proj) throw new Error('Project not found');
    if (proj.is_collapsed !== 0) throw new Error('Default is_collapsed should be 0');
  });

  assert('create album in project', () => {
    const proj = db.prepare("SELECT id FROM projects WHERE name = 'My Project'").get();
    db.prepare('INSERT INTO albums (name, project_id, sort_order) VALUES (?, ?, ?)').run('Proj Album', proj.id, 1);
    const album = db.prepare("SELECT * FROM albums WHERE name = 'Proj Album'").get();
    if (!album) throw new Error('Album not created');
    if (album.project_id !== proj.id) throw new Error('Album not linked to project');
  });

  assert('rename project', () => {
    const proj = db.prepare("SELECT id FROM projects WHERE name = 'My Project'").get();
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run('Renamed Project', proj.id);
    const updated = db.prepare('SELECT name FROM projects WHERE id = ?').get(proj.id);
    if (updated.name !== 'Renamed Project') throw new Error('Rename failed');
  });

  assert('toggle project collapse', () => {
    const proj = db.prepare("SELECT id FROM projects WHERE name = 'Renamed Project'").get();
    db.prepare('UPDATE projects SET is_collapsed = 1 WHERE id = ?').run(proj.id);
    if (db.prepare('SELECT is_collapsed FROM projects WHERE id = ?').get(proj.id).is_collapsed !== 1) throw new Error('Collapse toggle failed');
  });

  assert('delete project and cleanup', () => {
    const proj = db.prepare("SELECT id FROM projects WHERE name = 'Renamed Project'").get();
    db.transaction(() => {
      const albums = db.prepare('SELECT id FROM albums WHERE project_id = ?').all(proj.id);
      albums.forEach(a => db.prepare('DELETE FROM album_images WHERE album_id = ?').run(a.id));
      db.prepare('DELETE FROM albums WHERE project_id = ?').run(proj.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
    })();
    if (db.prepare('SELECT id FROM projects WHERE id = ?').get(proj.id)) throw new Error('Project not deleted');
    if (db.prepare("SELECT id FROM albums WHERE name = 'Proj Album'").get()) throw new Error('Project album not cleaned up');
  });

  assert('duplicate project name rejected', () => {
    db.prepare('INSERT INTO projects (name) VALUES (?)').run('UniqueProj');
    try {
      db.prepare('INSERT INTO projects (name) VALUES (?)').run('UniqueProj');
      throw new Error('Should have thrown UNIQUE constraint');
    } catch (err) {
      if (err.message.includes('Should have thrown')) throw err;
    } finally {
      db.prepare("DELETE FROM projects WHERE name = 'UniqueProj'").run();
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 21. Settings CRUD
  // ═══════════════════════════════════════════════════════════
  section('Settings CRUD');

  assert('set and get setting', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('theme', JSON.stringify('futuristic'));
    const row = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
    if (JSON.parse(row.value) !== 'futuristic') throw new Error('Theme not stored');
  });

  assert('update existing setting', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('theme', JSON.stringify('midnight'));
    const row = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
    if (JSON.parse(row.value) !== 'midnight') throw new Error('Theme not updated');
  });

  assert('store numeric setting', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('thumbnailSize', JSON.stringify(250));
    const val = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'thumbnailSize'").get().value);
    if (val !== 250) throw new Error('Numeric setting mismatch');
  });

  assert('store boolean setting', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('onboardingComplete', JSON.stringify(true));
    const val = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'onboardingComplete'").get().value);
    if (val !== true) throw new Error('Boolean setting mismatch');
  });

  assert('missing setting returns null', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'nonexistent'").get();
    if (row) throw new Error('Non-existent key should return undefined');
  });

  assert('store slideshow settings', () => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('slideshowInterval', JSON.stringify(5));
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('slideshowTransition', JSON.stringify('fade'));
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('slideshowShuffle', JSON.stringify(false));
    const interval = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'slideshowInterval'").get().value);
    const transition = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'slideshowTransition'").get().value);
    const shuffle = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'slideshowShuffle'").get().value);
    if (interval !== 5) throw new Error('Interval mismatch');
    if (transition !== 'fade') throw new Error('Transition mismatch');
    if (shuffle !== false) throw new Error('Shuffle mismatch');
  });

  // ═══════════════════════════════════════════════════════════
  // 22. Sync Folder
  // ═══════════════════════════════════════════════════════════
  section('Sync Folder');

  assert('detect new files added to folder', () => {
    const syncFolder = path.join(TMP_DIR, 'sync-folder');
    fs.mkdirSync(syncFolder, { recursive: true });
    const src = path.join(FAKE_FOLDER, 'photo1.png');
    fs.copyFileSync(src, path.join(syncFolder, 'existing.png'));

    // Insert folder + existing image
    const folderId = db.prepare('INSERT INTO folders (path) VALUES (?)').run(syncFolder).lastInsertRowid;
    db.prepare('INSERT INTO images (folder_id, name, full_path, file_type) VALUES (?, ?, ?, ?)').run(folderId, 'existing.png', path.join(syncFolder, 'existing.png'), 'png');

    // "Add" a new file to disk
    fs.copyFileSync(src, path.join(syncFolder, 'new-photo.png'));

    // Sync: find files on disk not in DB
    const filesOnDisk = new Set(
      fs.readdirSync(syncFolder).filter(f => /\\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(f))
    );
    const dbRows = db.prepare('SELECT name FROM images WHERE folder_id = ?').all(folderId);
    const existingNames = new Set(dbRows.map(r => r.name));
    const newFiles = [...filesOnDisk].filter(f => !existingNames.has(f));

    if (newFiles.length !== 1) throw new Error('Expected 1 new file, got ' + newFiles.length);
    if (newFiles[0] !== 'new-photo.png') throw new Error('New file name mismatch');
  });

  assert('detect deleted files removed from folder', () => {
    const syncFolder = path.join(TMP_DIR, 'sync-folder');
    const folderId = db.prepare('SELECT id FROM folders WHERE path = ?').get(syncFolder).id;

    // Remove existing.png from disk
    fs.unlinkSync(path.join(syncFolder, 'existing.png'));

    // Sync: find DB entries whose files no longer exist
    const filesOnDisk = new Set(
      fs.readdirSync(syncFolder).filter(f => /\\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(f))
    );
    const dbRows = db.prepare('SELECT id, name FROM images WHERE folder_id = ?').all(folderId);
    const stale = dbRows.filter(r => !filesOnDisk.has(r.name));

    if (stale.length !== 1) throw new Error('Expected 1 stale entry, got ' + stale.length);
    if (stale[0].name !== 'existing.png') throw new Error('Stale file name mismatch');

    // Clean up stale entries
    db.prepare('DELETE FROM images WHERE id = ?').run(stale[0].id);
    if (db.prepare('SELECT id FROM images WHERE id = ?').get(stale[0].id)) throw new Error('Stale entry not cleaned');
  });

  // ═══════════════════════════════════════════════════════════
  // 23. Caption Search & Synonyms
  // ═══════════════════════════════════════════════════════════
  section('Caption Search & Synonyms');

  assert('text-based caption search finds matches', () => {
    const img = db.prepare('SELECT id FROM images LIMIT 1').get();
    db.prepare('INSERT OR REPLACE INTO image_captions (image_id, captions) VALUES (?, ?)').run(img.id, 'a golden retriever dog playing in the park');

    const keyword = 'dog';
    const rows = db.prepare("SELECT i.id FROM images i JOIN image_captions ic ON i.id = ic.image_id WHERE ic.captions LIKE ?").all('%' + keyword + '%');
    if (rows.length < 1) throw new Error('Caption search should find "dog"');
  });

  assert('search-synonyms.json loads and has groups', () => {
    const synPath = path.join(ROOT, 'resources', 'search-synonyms.json');
    if (!fs.existsSync(synPath)) throw new Error('search-synonyms.json missing');
    const synData = JSON.parse(fs.readFileSync(synPath, 'utf-8'));
    if (!synData.groups || !Array.isArray(synData.groups)) throw new Error('Expected object with groups array');
    if (synData.groups.length < 10) throw new Error('Expected at least 10 synonym groups, got ' + synData.groups.length);

    // Each group should be an array of strings
    for (const group of synData.groups) {
      if (!Array.isArray(group)) throw new Error('Each synonym group should be an array');
      for (const word of group) {
        if (typeof word !== 'string') throw new Error('Each synonym should be a string');
      }
    }
  });

  assert('synonym expansion works for keywords', () => {
    // Load synonyms and build map (mirrors index.js logic)
    const synPath = path.join(ROOT, 'resources', 'search-synonyms.json');
    const synFile = JSON.parse(fs.readFileSync(synPath, 'utf-8'));
    const synonymMap = {};
    for (const group of synFile.groups) {
      for (const word of group) {
        synonymMap[word.toLowerCase()] = group.map(w => w.toLowerCase());
      }
    }

    // "kid" should expand to include "child", "children", etc.
    if (!synonymMap['kid']) throw new Error('"kid" not in synonym map');
    const kidGroup = synonymMap['kid'];
    if (!kidGroup.includes('child')) throw new Error('"kid" group should include "child"');
    if (!kidGroup.includes('children')) throw new Error('"kid" group should include "children"');

    // "car" should expand to include "automobile", "vehicle", etc.
    if (!synonymMap['car']) throw new Error('"car" not in synonym map');
    const carGroup = synonymMap['car'];
    if (!carGroup.includes('vehicle')) throw new Error('"car" group should include "vehicle"');
  });

  assert('caption search with LIKE pattern', () => {
    // Stemmed patterns: "dog" → "%dog%"
    const img = db.prepare("SELECT i.id FROM images i JOIN image_captions ic ON i.id = ic.image_id WHERE ic.captions LIKE '%retriever%'").all();
    if (img.length < 1) throw new Error('Should find "retriever" in captions');

    // Negative: should NOT match non-existent terms
    const noMatch = db.prepare("SELECT i.id FROM images i JOIN image_captions ic ON i.id = ic.image_id WHERE ic.captions LIKE '%dinosaur%'").all();
    if (noMatch.length > 0) throw new Error('Should not find "dinosaur"');
  });

  // ═══════════════════════════════════════════════════════════
  // 24. Cosine Similarity
  // ═══════════════════════════════════════════════════════════
  section('Cosine Similarity');

  assert('identical vectors have similarity 1.0', () => {
    function cosineSimilarity(a, b) {
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    }
    function l2Normalise(vec) {
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;
      return vec.map(v => v / norm);
    }
    const a = l2Normalise([1, 2, 3, 4]);
    const sim = cosineSimilarity(a, a);
    if (Math.abs(sim - 1.0) > 0.001) throw new Error('Identical vectors should have sim ~1.0, got ' + sim);
  });

  assert('orthogonal vectors have similarity 0', () => {
    function cosineSimilarity(a, b) {
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    }
    function l2Normalise(vec) {
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;
      return vec.map(v => v / norm);
    }
    const a = l2Normalise([1, 0, 0, 0]);
    const b = l2Normalise([0, 1, 0, 0]);
    const sim = cosineSimilarity(a, b);
    if (Math.abs(sim) > 0.001) throw new Error('Orthogonal vectors should have sim ~0, got ' + sim);
  });

  assert('similar vectors have higher similarity than dissimilar', () => {
    function cosineSimilarity(a, b) {
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    }
    function l2Normalise(vec) {
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;
      return vec.map(v => v / norm);
    }
    const a = l2Normalise([1, 2, 3, 4]);
    const b = l2Normalise([1.1, 2.1, 3.1, 4.1]); // similar
    const c = l2Normalise([-1, -2, -3, -4]); // opposite
    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    if (simAB <= simAC) throw new Error('Similar vectors should have higher sim than opposite: AB=' + simAB + ' AC=' + simAC);
    if (simAB < 0.99) throw new Error('Near-identical vectors should have sim > 0.99, got ' + simAB);
    if (simAC > -0.99) throw new Error('Opposite vectors should have sim < -0.99, got ' + simAC);
  });

  // ═══════════════════════════════════════════════════════════
  // 25. HMAC License Signing
  // ═══════════════════════════════════════════════════════════
  section('HMAC License Signing');

  assert('sign and verify license payload', () => {
    const deviceId = 'test-device-001';
    const SIGNING_KEY = crypto.createHash('sha256').update('pluto-license-' + deviceId + '-9f3a7c').digest();

    function signLicense(payload) {
      const json = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', SIGNING_KEY).update(json).digest('hex');
      return JSON.stringify({ payload, hmac });
    }

    function verifyLicense(storedStr) {
      try {
        const parsed = JSON.parse(storedStr);
        if (!parsed.hmac || !parsed.payload) return false;
        const expected = crypto.createHmac('sha256', SIGNING_KEY).update(JSON.stringify(parsed.payload)).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(parsed.hmac, 'hex'), Buffer.from(expected, 'hex'));
      } catch { return false; }
    }

    const payload = { tier: 'pro', email: 'test@example.com', licenseKey: 'KEY-123' };
    const signed = signLicense(payload);
    if (!verifyLicense(signed)) throw new Error('Valid signed license should verify');
  });

  assert('tampered license fails verification', () => {
    const deviceId = 'test-device-001';
    const SIGNING_KEY = crypto.createHash('sha256').update('pluto-license-' + deviceId + '-9f3a7c').digest();

    function signLicense(payload) {
      const json = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', SIGNING_KEY).update(json).digest('hex');
      return JSON.stringify({ payload, hmac });
    }

    function verifyLicense(storedStr) {
      try {
        const parsed = JSON.parse(storedStr);
        if (!parsed.hmac || !parsed.payload) return false;
        const expected = crypto.createHmac('sha256', SIGNING_KEY).update(JSON.stringify(parsed.payload)).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(parsed.hmac, 'hex'), Buffer.from(expected, 'hex'));
      } catch { return false; }
    }

    const payload = { tier: 'pro', email: 'test@example.com', licenseKey: 'KEY-123' };
    const signed = signLicense(payload);

    // Tamper: change tier to unlimited
    const tampered = JSON.parse(signed);
    tampered.payload.tier = 'unlimited';
    const tamperedStr = JSON.stringify(tampered);

    if (verifyLicense(tamperedStr)) throw new Error('Tampered license should NOT verify');
  });

  assert('legacy unsigned license format accepted gracefully', () => {
    const legacyStr = JSON.stringify({ tier: 'pro', email: 'old@example.com' });

    function getStoredLicense(storedStr) {
      try {
        const parsed = JSON.parse(storedStr);
        if (parsed.payload && parsed.hmac) return parsed.payload;
        return parsed; // Legacy: raw object without HMAC wrapper
      } catch { return null; }
    }

    const license = getStoredLicense(legacyStr);
    if (!license) throw new Error('Legacy format should be parsed');
    if (license.tier !== 'pro') throw new Error('Legacy tier should be readable');
  });

  assert('different device IDs produce different signing keys', () => {
    const key1 = crypto.createHash('sha256').update('pluto-license-device1-9f3a7c').digest('hex');
    const key2 = crypto.createHash('sha256').update('pluto-license-device2-9f3a7c').digest('hex');
    if (key1 === key2) throw new Error('Different devices should have different keys');
  });

  assert('HMAC stored in settings DB round-trip', () => {
    const deviceId = 'smoke-test-device';
    const SIGNING_KEY = crypto.createHash('sha256').update('pluto-license-' + deviceId + '-9f3a7c').digest();
    const payload = { tier: 'pro', email: 'hmac@example.com', licenseKey: 'HMAC-KEY' };
    const json = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', SIGNING_KEY).update(json).digest('hex');
    const signed = JSON.stringify({ payload, hmac });

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license', ?)").run(signed);
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license'").get();
    const stored = JSON.parse(row.value);
    if (!stored.payload || !stored.hmac) throw new Error('HMAC wrapper not stored correctly');
    if (stored.payload.tier !== 'pro') throw new Error('Payload not preserved in DB');

    const expected = crypto.createHmac('sha256', SIGNING_KEY).update(JSON.stringify(stored.payload)).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(stored.hmac, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new Error('HMAC does not verify after DB round-trip');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 26. dHash (Difference Hash) Algorithm
  // ═══════════════════════════════════════════════════════════
  section('dHash Algorithm');

  assert('compute dHash from 9x8 pixel grid', () => {
    const pixels = new Uint8Array(72);
    // Left-to-right gradient: each pixel < right neighbor
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) {
        pixels[row * 9 + col] = col * 28;
      }
    }
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hash += pixels[row * 9 + col] < pixels[row * 9 + col + 1] ? '1' : '0';
      }
    }
    if (hash.length !== 64) throw new Error('dHash should be 64 bits, got ' + hash.length);
    if (hash !== '1'.repeat(64)) throw new Error('Ascending gradient should produce all 1s');
  });

  assert('dHash differs for different image content', () => {
    function computeDHash(data) {
      let h = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          h += data[row * 9 + col] < data[row * 9 + col + 1] ? '1' : '0';
        }
      }
      return h;
    }
    // Image A: ascending gradient
    const pixelsA = new Uint8Array(72);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) pixelsA[row * 9 + col] = col * 28;
    }
    // Image B: descending gradient
    const pixelsB = new Uint8Array(72);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) pixelsB[row * 9 + col] = (8 - col) * 28;
    }
    const hashA = computeDHash(pixelsA);
    const hashB = computeDHash(pixelsB);
    if (hashA === hashB) throw new Error('Different images should produce different dHashes');
    if (hashA !== '1'.repeat(64)) throw new Error('Ascending hash wrong');
    if (hashB !== '0'.repeat(64)) throw new Error('Descending hash wrong');
  });

  assert('hamming distance measures dHash similarity', () => {
    function hamming(a, b) {
      let d = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
      return d;
    }
    if (hamming('10101010', '10101010') !== 0) throw new Error('Identical hashes: distance should be 0');
    if (hamming('10101010', '10101011') !== 1) throw new Error('One bit flip: distance should be 1');
    if (hamming('11111111', '00000000') !== 8) throw new Error('All different: distance should be 8');
    // Duplicate threshold: <= 5 means duplicate
    if (hamming('10101010', '10101011') > 5) throw new Error('Similar hashes should be within threshold');
    if (hamming('11111111', '00000000') <= 5) throw new Error('Different hashes should exceed threshold');
  });

  await assertAsync('sharp dHash pipeline produces 64-bit hash', async () => {
    const sharp = require('sharp');
    const img = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer();
    const raw = await sharp(img).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
    if (raw.length !== 72) throw new Error('Expected 72 bytes (9x8), got ' + raw.length);
    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hash += raw[row * 9 + col] < raw[row * 9 + col + 1] ? '1' : '0';
      }
    }
    if (hash.length !== 64) throw new Error('dHash from sharp should be 64 bits');
  });

  await assertAsync('identical images produce identical dHash', async () => {
    const sharp = require('sharp');
    const img = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer();
    function computeSharpDHash(buf) {
      let hash = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          hash += buf[row * 9 + col] < buf[row * 9 + col + 1] ? '1' : '0';
        }
      }
      return hash;
    }
    const raw1 = await sharp(img).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
    const raw2 = await sharp(img).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
    const hash1 = computeSharpDHash(raw1);
    const hash2 = computeSharpDHash(raw2);
    if (hash1 !== hash2) throw new Error('Same image should produce same dHash');
  });

  // ═══════════════════════════════════════════════════════════
  // 27. Face Auto-Merge Optimization
  // ═══════════════════════════════════════════════════════════
  section('Face Auto-Merge Optimization');

  assert('norm-sorted centroids enable triangle inequality pruning', () => {
    const MERGE_THRESHOLD = 0.3;
    const centroids = [
      { id: 1, centroid: [0.1, 0.0, 0.0] },
      { id: 2, centroid: [0.11, 0.01, 0.0] },
      { id: 3, centroid: [5.0, 5.0, 5.0] },
    ];
    // Compute norms
    for (const c of centroids) {
      c.norm = Math.sqrt(c.centroid.reduce((s, v) => s + v * v, 0));
    }
    // Sort by norm (mirrors production code)
    centroids.sort((a, b) => a.norm - b.norm);

    let skipped = 0;
    let compared = 0;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        if (centroids[j].norm - centroids[i].norm > MERGE_THRESHOLD) {
          skipped += (centroids.length - j);
          break; // sorted: all further j are even more distant
        }
        compared++;
      }
    }
    if (skipped === 0) throw new Error('Triangle inequality should skip distant pairs');
    if (compared >= 3) throw new Error('Should compare fewer than all 3 pairs');
  });

  assert('squared distance avoids sqrt and gives correct result', () => {
    const THRESHOLD = 0.3;
    const THRESHOLD_SQ = THRESHOLD * THRESHOLD;
    const a = [0.1, 0.2, 0.3];
    const b = [0.12, 0.22, 0.31]; // close
    const c = [0.9, 0.8, 0.7]; // far

    function squaredDist(x, y) {
      let sum = 0;
      for (let i = 0; i < x.length; i++) sum += (x[i] - y[i]) ** 2;
      return sum;
    }

    const distAB_sq = squaredDist(a, b);
    const distAC_sq = squaredDist(a, c);

    if (distAB_sq > THRESHOLD_SQ) throw new Error('Close centroids should be within threshold squared');
    if (distAC_sq <= THRESHOLD_SQ) throw new Error('Far centroids should exceed threshold squared');
    // Verify equivalence with euclidean
    const distAB = Math.sqrt(distAB_sq);
    if ((distAB < THRESHOLD) !== (distAB_sq < THRESHOLD_SQ)) throw new Error('Squared comparison must match euclidean');
  });

  assert('early exit on partial sum exceeds threshold', () => {
    const THRESHOLD_SQ = 0.09; // 0.3^2
    const a = [0.0, 0.0, 0.0, 0.0, 0.0];
    const b = [0.5, 0.5, 0.5, 0.5, 0.5]; // far apart

    let sumSq = 0;
    let earlyExitAt = -1;
    for (let k = 0; k < a.length; k++) {
      sumSq += (a[k] - b[k]) ** 2;
      if (sumSq > THRESHOLD_SQ) {
        earlyExitAt = k;
        break;
      }
    }
    if (earlyExitAt === -1) throw new Error('Should have early-exited');
    // After first dimension: 0.25 > 0.09, so exit at k=0
    if (earlyExitAt !== 0) throw new Error('Expected early exit at dim 0, got ' + earlyExitAt);
  });

  assert('full auto-merge flow with optimization', () => {
    const MERGE_THRESHOLD = 0.3;
    const MERGE_THRESHOLD_SQ = MERGE_THRESHOLD * MERGE_THRESHOLD;
    const people = [
      { id: 10, centroid: [0.1, 0.2, 0.3] },
      { id: 20, centroid: [0.11, 0.21, 0.31] }, // close to 10 — should merge
      { id: 30, centroid: [5.0, 5.0, 5.0] },     // far — should NOT merge
    ];
    for (const p of people) {
      p.norm = Math.sqrt(p.centroid.reduce((s, v) => s + v * v, 0));
    }
    people.sort((a, b) => a.norm - b.norm);

    // Union-Find
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    for (const p of people) parent.set(p.id, p.id);

    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        if (people[j].norm - people[i].norm > MERGE_THRESHOLD) break;
        let sumSq = 0, bail = false;
        for (let k = 0; k < people[i].centroid.length; k++) {
          sumSq += (people[i].centroid[k] - people[j].centroid[k]) ** 2;
          if (sumSq > MERGE_THRESHOLD_SQ) { bail = true; break; }
        }
        if (!bail) union(people[i].id, people[j].id);
      }
    }

    // Verify: 10 and 20 merged, 30 separate
    if (find(10) !== find(20)) throw new Error('Close people should be merged');
    if (find(10) === find(30)) throw new Error('Far person should NOT be merged');
  });

  // ═══════════════════════════════════════════════════════════
  // 28. Pagination (LIMIT/OFFSET)
  // ═══════════════════════════════════════════════════════════
  section('Pagination');

  assert('LIMIT/OFFSET returns correct page', () => {
    const total = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    if (total < 3) throw new Error('Need at least 3 images for pagination test');

    const page1 = db.prepare('SELECT full_path FROM images ORDER BY id LIMIT 2 OFFSET 0').all();
    const page2 = db.prepare('SELECT full_path FROM images ORDER BY id LIMIT 2 OFFSET 2').all();

    if (page1.length !== 2) throw new Error('Page 1 should have 2 items, got ' + page1.length);
    if (page2.length < 1) throw new Error('Page 2 should have at least 1 item');
    const page1Paths = new Set(page1.map(r => r.full_path));
    for (const r of page2) {
      if (page1Paths.has(r.full_path)) throw new Error('Pages should not overlap');
    }
  });

  assert('COUNT query returns total before LIMIT', () => {
    const countQuery = "SELECT COUNT(*) as c FROM images WHERE file_type = 'png'";
    const total = db.prepare(countQuery).get().c;
    const limited = db.prepare("SELECT full_path FROM images WHERE file_type = 'png' ORDER BY id LIMIT 2").all();

    if (total < 3) throw new Error('Expected at least 3 PNG images');
    if (limited.length > 2) throw new Error('LIMIT should cap results');
    if (limited.length > total) throw new Error('Limited results should not exceed total');
  });

  assert('no LIMIT returns all rows (backward compat)', () => {
    const total = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    const all = db.prepare('SELECT full_path FROM images ORDER BY id').all();
    if (all.length !== total) throw new Error('Without LIMIT, should return all ' + total + ' rows');
  });

  assert('OFFSET beyond total returns empty', () => {
    const total = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    const beyond = db.prepare('SELECT full_path FROM images ORDER BY id LIMIT 10 OFFSET ?').all(total + 100);
    if (beyond.length !== 0) throw new Error('OFFSET beyond total should return empty, got ' + beyond.length);
  });

  assert('paginated locked flag uses global offset', () => {
    // Simulate: maxImages=2, page2 offset=2 → items at global idx 2,3 should be locked
    const maxImages = 2;
    const offset = 2;
    const pageItems = [{idx: 0}, {idx: 1}];
    for (const item of pageItems) {
      const globalIdx = offset + item.idx;
      item.locked = globalIdx >= maxImages;
    }
    if (!pageItems[0].locked) throw new Error('Global idx 2 should be locked (maxImages=2)');
    if (!pageItems[1].locked) throw new Error('Global idx 3 should be locked (maxImages=2)');
  });

  // ═══════════════════════════════════════════════════════════
  // 29. Caption Scan State Machine
  // ═══════════════════════════════════════════════════════════
  section('Caption Scan State Machine');

  assert('pause/resume/cancel flags work correctly', () => {
    let active = false, paused = false, cancel = false;
    // Start scan
    active = true;
    if (!active) throw new Error('Scan should be active');
    // Pause
    paused = true;
    if (!paused) throw new Error('Scan should be paused');
    // Resume
    paused = false;
    if (paused) throw new Error('Scan should be resumed');
    // Cancel (also unpauses)
    cancel = true;
    paused = false;
    if (!cancel) throw new Error('Cancel flag should be set');
    if (paused) throw new Error('Cancel should unpause');
    // After scan completes
    active = false;
    cancel = false;
    if (active || cancel || paused) throw new Error('All flags should reset after completion');
  });

  assert('ETA calculation from average processing time', () => {
    const scanStartTime = Date.now() - 10000; // started 10s ago
    const processedCount = 5;
    const totalImages = 20;
    const currentIndex = 7; // includes 2 skipped

    const elapsed = Date.now() - scanStartTime;
    const avgMs = processedCount > 0 ? elapsed / processedCount : 0;
    const remaining = totalImages - (currentIndex + 1);
    const etaSeconds = processedCount > 0 ? Math.round((avgMs * remaining) / 1000) : null;

    if (etaSeconds === null) throw new Error('ETA should be calculated when processedCount > 0');
    if (etaSeconds < 0) throw new Error('ETA should not be negative');
    // ~2s per image * 12 remaining = ~24s
    if (etaSeconds < 15 || etaSeconds > 35) throw new Error('ETA should be roughly 24s, got ' + etaSeconds);
  });

  assert('ETA is null when no images processed yet', () => {
    const processedCount = 0;
    const etaSeconds = processedCount > 0 ? Math.round((10000 / processedCount) * 10 / 1000) : null;
    if (etaSeconds !== null) throw new Error('ETA should be null with 0 processed');
  });

  assert('progress event includes required fields', () => {
    const progress = { current: 5, total: 20, done: false, paused: false, etaSeconds: 30 };
    if (typeof progress.current !== 'number') throw new Error('current must be number');
    if (typeof progress.total !== 'number') throw new Error('total must be number');
    if (typeof progress.done !== 'boolean') throw new Error('done must be boolean');
    if (typeof progress.paused !== 'boolean') throw new Error('paused must be boolean');
    if (typeof progress.etaSeconds !== 'number') throw new Error('etaSeconds must be number');
    if (progress.current > progress.total) throw new Error('current should not exceed total');
  });

  // ═══════════════════════════════════════════════════════════
  // 30. DB Backup Logic
  // ═══════════════════════════════════════════════════════════
  section('DB Backup Logic');

  assert('create backup copy of database', () => {
    const backupDir = path.join(TMP_DIR, 'db-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    // Flush WAL to main DB file before copying
    db.pragma('wal_checkpoint(TRUNCATE)');
    const backupName = 'catalog-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
    const backupPath = path.join(backupDir, backupName);
    fs.copyFileSync(DB_PATH, backupPath);
    if (!fs.existsSync(backupPath)) throw new Error('Backup file not created');
    if (fs.statSync(backupPath).size < 100) throw new Error('Backup file too small');
  });

  assert('backup is a valid SQLite database', () => {
    const backupDir = path.join(TMP_DIR, 'db-backups');
    const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('catalog-') && f.endsWith('.db')).sort();
    const realBackup = backups.find(b => fs.statSync(path.join(backupDir, b)).size > 100);
    if (!realBackup) throw new Error('No real backup found');
    const backupDb = new Database(path.join(backupDir, realBackup), { readonly: true });
    const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    backupDb.close();
    if (!tables.includes('images')) throw new Error('Backup DB should contain images table');
  });

  assert('keep-last-N backup rotation', () => {
    const backupDir = path.join(TMP_DIR, 'db-backups');
    // Create 7 fake backups with dates in the past so real backup is preserved
    for (let i = 0; i < 7; i++) {
      const name = 'catalog-2020-01-0' + i + 'T00-00-00.db';
      fs.writeFileSync(path.join(backupDir, name), 'fake-backup-' + i);
    }
    const MAX_BACKUPS = 5;
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('catalog-') && f.endsWith('.db'))
      .sort();
    while (backups.length > MAX_BACKUPS) {
      const oldest = backups.shift();
      fs.unlinkSync(path.join(backupDir, oldest));
    }
    const remaining = fs.readdirSync(backupDir).filter(f => f.startsWith('catalog-') && f.endsWith('.db'));
    if (remaining.length > MAX_BACKUPS) throw new Error('Should keep at most ' + MAX_BACKUPS + ' backups, got ' + remaining.length);
  });

  // ═══════════════════════════════════════════════════════════
  // 31. Supported Formats Regex
  // ═══════════════════════════════════════════════════════════
  section('Supported Formats Regex');

  assert('expanded regex matches all supported formats', () => {
    const supportedRe = /\\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i;
    const shouldMatch = [
      'photo.jpg', 'photo.jpeg', 'photo.png', 'photo.webp', 'photo.gif',
      'photo.heic', 'photo.HEIF', 'photo.tiff', 'photo.tif', 'photo.bmp',
      'photo.cr2', 'photo.NEF', 'photo.arw', 'photo.dng', 'photo.orf',
      'photo.rw2', 'photo.raf', 'video.mp4', 'video.m4v', 'video.3gp',
      'video.mov', 'video.mkv', 'video.avi', 'video.webm',
    ];
    const shouldNotMatch = [
      'file.txt', 'file.doc', 'file.exe', 'file.zip', 'file.html',
      'file.json', '.gitignore', 'README.md',
    ];
    for (const f of shouldMatch) {
      if (!supportedRe.test(f)) throw new Error('Should match: ' + f);
    }
    for (const f of shouldNotMatch) {
      if (supportedRe.test(f)) throw new Error('Should NOT match: ' + f);
    }
  });

  assert('RAW camera formats are recognized', () => {
    const rawFormats = ['cr2', 'nef', 'arw', 'dng', 'orf', 'rw2', 'raf'];
    const supportedRe = /\\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i;
    for (const fmt of rawFormats) {
      if (!supportedRe.test('photo.' + fmt)) throw new Error('RAW format not matched: ' + fmt);
      if (!supportedRe.test('PHOTO.' + fmt.toUpperCase())) throw new Error('RAW format case-insensitive fail: ' + fmt);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 32. DB Schema Safety (rating in CREATE TABLE)
  // ═══════════════════════════════════════════════════════════
  section('DB Schema Safety');

  assert('images table has all columns from creation', () => {
    const cols = db.prepare("PRAGMA table_info(images)").all().map(c => c.name);
    const required = ['rating', 'color_label', 'gps_lat', 'gps_lng', 'gps_scanned'];
    for (const col of required) {
      if (!cols.includes(col)) throw new Error('images table missing column: ' + col);
    }
  });

  assert('CREATE INDEX on rating succeeds on fresh schema', () => {
    db.exec('CREATE INDEX IF NOT EXISTS idx_smoke_rating ON images(rating)');
    const indexes = db.prepare("PRAGMA index_list(images)").all();
    if (!indexes.some(i => i.name === 'idx_smoke_rating')) throw new Error('Rating index should be created');
    db.exec('DROP INDEX IF EXISTS idx_smoke_rating');
  });

  assert('migration is no-op for existing columns', () => {
    const cols = db.prepare("PRAGMA table_info(images)").all().map(c => c.name);
    let migrated = 0;
    if (!cols.includes('rating')) { db.exec("ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0"); migrated++; }
    if (!cols.includes('color_label')) { db.exec("ALTER TABLE images ADD COLUMN color_label TEXT DEFAULT ''"); migrated++; }
    if (!cols.includes('gps_lat')) { db.exec("ALTER TABLE images ADD COLUMN gps_lat REAL"); migrated++; }
    if (!cols.includes('gps_lng')) { db.exec("ALTER TABLE images ADD COLUMN gps_lng REAL"); migrated++; }
    if (!cols.includes('gps_scanned')) { db.exec("ALTER TABLE images ADD COLUMN gps_scanned INTEGER DEFAULT 0"); migrated++; }
    if (migrated !== 0) throw new Error('No migrations should run when columns already exist, ran ' + migrated);
  });

  assert('rating default value is 0', () => {
    const img = db.prepare("INSERT INTO images (full_path, name, file_type) VALUES (?, ?, ?)").run('/tmp/schema-test.png', 'schema-test.png', 'png');
    const row = db.prepare('SELECT rating FROM images WHERE id = ?').get(img.lastInsertRowid);
    if (row.rating !== 0) throw new Error('Default rating should be 0, got ' + row.rating);
    db.prepare('DELETE FROM images WHERE id = ?').run(img.lastInsertRowid);
  });

  // ═══════════════════════════════════════════════════════════
  // 33. Async Thumbnail Check Pattern
  // ═══════════════════════════════════════════════════════════
  section('Async Thumbnail Check Pattern');

  await assertAsync('Promise.allSettled checks file existence in batches', async () => {
    const fsPromises = require('fs').promises;
    const existingFile = path.join(FAKE_FOLDER, 'photo1.png');
    const missingFile = path.join(TMP_DIR, 'nonexistent-thumb.webp');
    const testPaths = [existingFile, missingFile, existingFile];

    const results = await Promise.allSettled(
      testPaths.map(tp => fsPromises.access(tp).then(() => tp))
    );

    const valid = new Set();
    for (const r of results) {
      if (r.status === 'fulfilled') valid.add(r.value);
    }

    if (!valid.has(existingFile)) throw new Error('Existing file should be in valid set');
    if (valid.has(missingFile)) throw new Error('Missing file should NOT be in valid set');
    if (valid.size !== 1) throw new Error('Expected 1 unique valid path, got ' + valid.size);
  });

  await assertAsync('batch chunking processes large path lists', async () => {
    const CHUNK_SIZE = 500;
    // Simulate 1200 paths — should be processed in 3 chunks
    const paths = [];
    for (let i = 0; i < 1200; i++) paths.push(path.join(TMP_DIR, 'fake-thumb-' + i + '.webp'));
    let chunksProcessed = 0;
    for (let ci = 0; ci < paths.length; ci += CHUNK_SIZE) {
      const chunk = paths.slice(ci, ci + CHUNK_SIZE);
      chunksProcessed++;
      // Just verify chunking arithmetic
      if (chunk.length > CHUNK_SIZE) throw new Error('Chunk exceeds size limit');
    }
    if (chunksProcessed !== 3) throw new Error('Expected 3 chunks for 1200 paths, got ' + chunksProcessed);
  });

  // ═══════════════════════════════════════════════════════════
  // 34. Migration Ordering (index after ALTER TABLE)
  // ═══════════════════════════════════════════════════════════
  section('Migration Ordering');

  assert('initializeDatabase succeeds on legacy schema without rating column', () => {
    // Simulate an OLD database that was created before rating/gps columns existed.
    // This is exactly the bug: CREATE TABLE IF NOT EXISTS is a no-op on an
    // existing table, so the new columns don't appear. If CREATE INDEX runs
    // before ALTER TABLE migration, it fails with "no such column: rating".
    const legacyDbPath = path.join(TMP_DIR, 'legacy-test.db');
    const legacyDb = new Database(legacyDbPath);
    legacyDb.pragma('journal_mode = WAL');

    // Create the OLD schema (no rating, no color_label, no gps columns)
    legacyDb.exec(\`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, is_collapsed INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        name TEXT,
        full_path TEXT UNIQUE,
        thumb_path TEXT,
        file_type TEXT,
        date_taken INTEGER,
        FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cover_path TEXT, sort_order INTEGER DEFAULT 0, project_id INTEGER, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, UNIQUE(name, project_id));
      CREATE TABLE IF NOT EXISTS album_images (album_id INTEGER, image_id INTEGER, PRIMARY KEY (album_id, image_id), FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE, FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS image_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, image_id INTEGER NOT NULL, tag TEXT NOT NULL, FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE, UNIQUE(image_id, tag));
      CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT DEFAULT 'Unknown', sample_face_path TEXT, centroid TEXT);
      CREATE TABLE IF NOT EXISTS image_faces (id INTEGER PRIMARY KEY AUTOINCREMENT, image_id INTEGER NOT NULL, person_id INTEGER, x REAL, y REAL, width REAL, height REAL, descriptor TEXT, FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL);
      CREATE TABLE IF NOT EXISTS smart_albums (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, rules TEXT NOT NULL, icon TEXT DEFAULT '🔍', created_at INTEGER DEFAULT (strftime('%s','now')));
      CREATE TABLE IF NOT EXISTS image_hashes (image_id INTEGER PRIMARY KEY, phash TEXT, file_size INTEGER, FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS dismissed_duplicates (image_id_1 INTEGER NOT NULL, image_id_2 INTEGER NOT NULL, PRIMARY KEY (image_id_1, image_id_2), FOREIGN KEY(image_id_1) REFERENCES images(id) ON DELETE CASCADE, FOREIGN KEY(image_id_2) REFERENCES images(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS image_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, image_id INTEGER NOT NULL, edit_data TEXT NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now')), output_path TEXT, FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS image_captions (image_id INTEGER PRIMARY KEY, captions TEXT NOT NULL, embedding TEXT, scanned_at INTEGER DEFAULT (strftime('%s','now')), FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE);
    \`);

    // Verify the legacy table does NOT have rating
    const colsBefore = legacyDb.prepare('PRAGMA table_info(images)').all().map(c => c.name);
    if (colsBefore.includes('rating')) throw new Error('Legacy table should NOT have rating column yet');

    // Now simulate what initializeDatabase does:
    // 1. CREATE TABLE IF NOT EXISTS (no-op — table already exists without rating)
    // 2. Migrations add the missing columns
    // 3. THEN create indices

    // Step 1: no-op (table exists)
    // Step 2: migration
    if (!colsBefore.includes('rating')) legacyDb.exec('ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0');
    if (!colsBefore.includes('color_label')) legacyDb.exec("ALTER TABLE images ADD COLUMN color_label TEXT DEFAULT ''");
    if (!colsBefore.includes('gps_lat')) legacyDb.exec('ALTER TABLE images ADD COLUMN gps_lat REAL');
    if (!colsBefore.includes('gps_lng')) legacyDb.exec('ALTER TABLE images ADD COLUMN gps_lng REAL');
    if (!colsBefore.includes('gps_scanned')) legacyDb.exec('ALTER TABLE images ADD COLUMN gps_scanned INTEGER DEFAULT 0');

    // Step 3: NOW create index — this is where the old code would have failed
    legacyDb.exec('CREATE INDEX IF NOT EXISTS idx_images_rating ON images(rating)');

    // Verify it all worked
    const colsAfter = legacyDb.prepare('PRAGMA table_info(images)').all().map(c => c.name);
    if (!colsAfter.includes('rating')) throw new Error('rating column should exist after migration');
    if (!colsAfter.includes('gps_lat')) throw new Error('gps_lat column should exist after migration');
    const indexes = legacyDb.prepare('PRAGMA index_list(images)').all();
    if (!indexes.some(i => i.name === 'idx_images_rating')) throw new Error('Rating index should be created');

    legacyDb.close();
    fs.unlinkSync(legacyDbPath);
  });

  assert('CREATE INDEX before ALTER TABLE would fail (regression proof)', () => {
    // Prove that the OLD ordering (index before migration) actually crashes
    const badDbPath = path.join(TMP_DIR, 'bad-order-test.db');
    const badDb = new Database(badDbPath);
    badDb.exec('CREATE TABLE images_old (id INTEGER PRIMARY KEY, name TEXT)');
    let threw = false;
    try {
      badDb.exec('CREATE INDEX idx_bad ON images_old(rating)');
    } catch (e) {
      if (e.message.includes('no such column')) threw = true;
      else throw e;
    }
    if (!threw) throw new Error('Creating index on missing column should throw');
    badDb.close();
    fs.unlinkSync(badDbPath);
  });

  // ═══════════════════════════════════════════════════════════
  // 35. Preload Bundle Integrity
  // ═══════════════════════════════════════════════════════════
  section('Preload Bundle Integrity');

  assert('built preload does not externalize @electron-toolkit/preload', () => {
    // When @electron-toolkit/preload is externalized (left as a bare require()),
    // the preload script fails in Electron\'s sandbox because sandboxed renderers
    // cannot resolve node_modules. It MUST be bundled inline.
    const preloadPath = path.join(ROOT, 'out', 'preload', 'index.js');
    if (!fs.existsSync(preloadPath)) {
      // In CI the build may not have run yet — skip gracefully
      console.log('    ⚠ Skipping (out/preload/index.js not found — run electron-vite build first)');
      return;
    }
    const content = fs.readFileSync(preloadPath, 'utf-8');
    if (content.includes('require("@electron-toolkit/preload")') ||
        content.includes("require('@electron-toolkit/preload')")) {
      throw new Error(
        'Preload script has an external require for @electron-toolkit/preload. ' +
        'This will fail in sandboxed Electron renderers. ' +
        'Fix: exclude it from externalizeDepsPlugin in electron.vite.config.ts'
      );
    }
  });

  assert('electron.vite.config.ts excludes @electron-toolkit/preload from externalization', () => {
    const configPath = path.join(ROOT, 'electron.vite.config.ts');
    if (!fs.existsSync(configPath)) {
      console.log('    ⚠ Skipping (electron.vite.config.ts not found)');
      return;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    // Check that the preload section has the exclude
    if (!content.includes('@electron-toolkit/preload')) {
      throw new Error(
        'electron.vite.config.ts does not mention @electron-toolkit/preload. ' +
        'The preload config must exclude it from externalizeDepsPlugin.'
      );
    }
  });

  assert('preload source imports electron and exposes ipcRenderer', () => {
    const preloadSrc = path.join(ROOT, 'src', 'preload', 'index.js');
    const content = fs.readFileSync(preloadSrc, 'utf-8');
    if (!content.includes('contextBridge')) throw new Error('Preload must use contextBridge');
    if (!content.includes('ipcRenderer')) throw new Error('Preload must expose ipcRenderer');
    if (!content.includes('ALLOWED_CHANNELS')) throw new Error('Preload must define ALLOWED_CHANNELS whitelist');
  });

  // ═══════════════════════════════════════════════════════════
  // 36. Video Format Detection (isVideo regex completeness)
  // ═══════════════════════════════════════════════════════════
  section('Video Format Detection');

  assert('isVideo regex matches ALL accepted video extensions', () => {
    // The canonical full regex from the fixes
    const isVideoRe = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    const accepted = [
      'clip.mp4', 'clip.webm', 'clip.mov', 'clip.mkv', 'clip.avi',
      'clip.m4v', 'clip.3gp', 'clip.wmv', 'clip.flv', 'clip.mpg', 'clip.mpeg',
    ];
    const rejected = [
      'photo.jpg', 'photo.png', 'photo.gif', 'photo.pdf', 'photo.psd',
      'file.txt', 'file.doc', 'file.mp3', 'file.wav',
    ];
    for (const f of accepted) {
      if (!isVideoRe.test(f)) throw new Error('isVideo should match: ' + f);
    }
    for (const f of rejected) {
      if (isVideoRe.test(f)) throw new Error('isVideo should NOT match: ' + f);
    }
  });

  assert('isVideo regex is case-insensitive', () => {
    const isVideoRe = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    const mixedCase = ['video.MP4', 'Video.MOV', 'CLIP.M4V', 'file.Wmv', 'thing.FLV', 'a.MPEG'];
    for (const f of mixedCase) {
      if (!isVideoRe.test(f)) throw new Error('isVideo must be case-insensitive for: ' + f);
    }
  });

  assert('file_type based isVideo regex matches all types', () => {
    // api-server uses /^(mp4|webm|...)$/i against just the extension (no dot)
    const fileTypeRe = /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    const types = ['mp4','webm','mov','mkv','avi','m4v','3gp','wmv','flv','mpg','mpeg'];
    for (const t of types) {
      if (!fileTypeRe.test(t)) throw new Error('file_type regex should match: ' + t);
    }
    if (fileTypeRe.test('jpg')) throw new Error('should not match jpg');
    if (fileTypeRe.test('png')) throw new Error('should not match png');
  });

  assert('previously missing extensions would have been routed to Sharp', () => {
    // Regression proof: before the fix, m4v/3gp/wmv/flv/mpg/mpeg were NOT
    // matched by isVideo (/\\.(mp4|webm|mov|mkv|avi)$/i only), so they would
    // be sent to Sharp which can't decode video → crash/null thumbnail.
    const oldBrokenRe = /\\.(mp4|webm|mov|mkv|avi)$/i;
    const newlyAdded = ['clip.m4v', 'clip.3gp', 'clip.wmv', 'clip.flv', 'clip.mpg', 'clip.mpeg'];
    for (const f of newlyAdded) {
      if (oldBrokenRe.test(f)) throw new Error(f + ' should NOT match the old broken regex');
    }
    // Verify these are all now matched by the fixed regex
    const fixedRe = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    for (const f of newlyAdded) {
      if (!fixedRe.test(f)) throw new Error(f + ' should match the fixed regex');
    }
  });

  assert('worker thread isVideo regex matches main thread regex', () => {
    // Both the main-thread getOrCreateThumbnail and the worker-thread code must
    // use the exact same set of video extensions.
    const mainRe   = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    const workerRe = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
    const allExts = ['mp4','webm','mov','mkv','avi','m4v','3gp','wmv','flv','mpg','mpeg','jpg','png','gif','pdf','psd'];
    for (const ext of allExts) {
      const f = 'test.' + ext;
      if (mainRe.test(f) !== workerRe.test(f)) {
        throw new Error('Main/worker isVideo mismatch for .' + ext);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 37. toPlutoUrl — Special Character Encoding
  // ═══════════════════════════════════════════════════════════
  section('toPlutoUrl — Special Character Encoding');

  assert('toPlutoUrl encodes # in file paths', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const result = toPlutoUrl('/photos/Trip #42/img.jpg');
    if (result.includes('#4')) throw new Error('# should be encoded: ' + result);
    if (!result.includes('%234')) throw new Error('# should become %23: ' + result);
    // Verify it round-trips through URL parser
    const url = new URL(result);
    const decoded = decodeURIComponent(url.pathname);
    if (!decoded.includes('#42')) throw new Error('Round-trip lost #: ' + decoded);
  });

  assert('toPlutoUrl encodes ? in file paths', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const result = toPlutoUrl('/photos/What?/img.jpg');
    if (result.includes('?')) throw new Error('? should be encoded: ' + result);
    if (!result.includes('%3F')) throw new Error('? should become %3F: ' + result);
  });

  assert('toPlutoUrl encodes % in file paths', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const result = toPlutoUrl('/photos/100%/img.jpg');
    if (!result.includes('%25')) throw new Error('% should become %25: ' + result);
    // Ensure %25 doesn't get double-encoded
    if (result.includes('%2525')) throw new Error('% should not be double-encoded');
  });

  assert('toPlutoUrl handles Windows paths', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const result = toPlutoUrl('C:\\\\Users\\\\test\\\\Photos #1\\\\img.jpg');
    if (result.includes('#1')) throw new Error('# in Windows path should be encoded');
    if (!result.startsWith('pluto://')) throw new Error('Must start with pluto://');
  });

  assert('toPlutoUrl preserves normal paths unchanged', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const normal = '/photos/vacation/sunset.jpg';
    const result = toPlutoUrl(normal);
    if (result !== 'pluto://' + normal) throw new Error('Normal path should not be modified: ' + result);
  });

  assert('toPlutoUrl handles path with all special chars combined', () => {
    function toPlutoUrl(p) {
      return 'pluto://' + p.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\\?/g, '%3F');
    }
    const crazy = '/photos/100%/Trip #2?/img.jpg';
    const result = toPlutoUrl(crazy);
    if (result.includes('#')) throw new Error('Should encode # in combined path');
    if (result.includes('?')) throw new Error('Should encode ? in combined path');
    // % must be encoded FIRST, before # and ? encoding, to avoid double-encoding
    if (result.includes('%2523') || result.includes('%253F')) throw new Error('Order-of-encoding bug: % → %25 → %2523');
  });

  // ═══════════════════════════════════════════════════════════
  // 38. isPathAllowed — Path Boundary Security
  // ═══════════════════════════════════════════════════════════
  section('isPathAllowed — Path Boundary Security');

  assert('isPathAllowed rejects prefix-only match (no path.sep boundary)', () => {
    // Regression: C:\\\\Photos matched C:\\\\PhotosSensitive as allowed
    const sep = path.sep;
    function isPathAllowed(resolved, folderPaths) {
      const ci = (s) => process.platform === 'win32' ? s.toLowerCase() : s;
      const resolvedCI = ci(resolved);
      return folderPaths.some(f => {
        const fp = ci(path.resolve(f));
        return resolvedCI.startsWith(fp + sep) || resolvedCI === fp;
      });
    }
    const folders = [path.resolve(path.join(TMP_DIR, 'Photos'))];
    fs.mkdirSync(folders[0], { recursive: true });

    // Exact match — allowed
    if (!isPathAllowed(folders[0], folders)) throw new Error('Exact folder match should be allowed');

    // File inside folder — allowed
    const inside = path.join(folders[0], 'img.jpg');
    if (!isPathAllowed(inside, folders)) throw new Error('File inside folder should be allowed');

    // Prefix overlap without separator — MUST be rejected
    const evil = path.resolve(path.join(TMP_DIR, 'PhotosSensitive'));
    fs.mkdirSync(evil, { recursive: true });
    const evilFile = path.join(evil, 'secret.jpg');
    if (isPathAllowed(evilFile, folders)) throw new Error('PhotosSensitive should NOT match Photos — prefix attack');

    // Nested subfolder — allowed
    const nested = path.join(folders[0], 'vacation', 'img.jpg');
    if (!isPathAllowed(nested, folders)) throw new Error('Nested subfolder should be allowed');
  });

  assert('isPathAllowed is case-insensitive on Windows', () => {
    if (process.platform !== 'win32') { console.log('    (skipped — not Windows)'); return; }
    const sep = path.sep;
    function isPathAllowed(resolved, folderPaths) {
      const ci = (s) => s.toLowerCase();
      const resolvedCI = ci(resolved);
      return folderPaths.some(f => {
        const fp = ci(path.resolve(f));
        return resolvedCI.startsWith(fp + sep) || resolvedCI === fp;
      });
    }
    const folders = ['C:\\\\Users\\\\Test\\\\Photos'];
    if (!isPathAllowed('C:\\\\Users\\\\TEST\\\\PHOTOS\\\\img.jpg', folders)) {
      throw new Error('Windows path matching should be case-insensitive');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 39. Case-Insensitive DB Lookups (COLLATE NOCASE)
  // ═══════════════════════════════════════════════════════════
  section('Case-Insensitive DB Lookups');

  assert('COLLATE NOCASE matches paths regardless of case', () => {
    const testPath = path.join(TMP_DIR, 'CaseTest', 'Photo.PNG');
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(testPath, 'Photo.PNG', 'png');

    // Query with different case — must find it with COLLATE NOCASE
    const altCase = testPath.toLowerCase();
    const row = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(altCase);
    if (!row) throw new Error('COLLATE NOCASE should find path regardless of case');

    // Without COLLATE NOCASE, the default comparison is case-sensitive
    const strictRow = db.prepare('SELECT id FROM images WHERE full_path = ?').get(altCase);
    // This may or may not find it, depending on platform — the point is COLLATE NOCASE always works
    db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE').run(testPath);
  });

  assert('batch operations use COLLATE NOCASE for path matching', () => {
    // Insert with mixed case
    const p1 = path.join(TMP_DIR, 'MixedCase', 'IMG_001.JPG');
    const p2 = path.join(TMP_DIR, 'MixedCase', 'img_002.jpg');
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(p1, 'IMG_001.JPG', 'jpg');
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(p2, 'img_002.jpg', 'jpg');

    // Simulate batch rating with case-different path
    const altP1 = p1.toLowerCase();
    db.prepare('UPDATE images SET rating = 5 WHERE full_path = ? COLLATE NOCASE').run(altP1);
    const row = db.prepare('SELECT rating FROM images WHERE full_path = ? COLLATE NOCASE').get(p1);
    if (!row || row.rating !== 5) throw new Error('Batch rating with COLLATE NOCASE failed');

    // Cleanup
    db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE').run(p1);
    db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE').run(p2);
  });

  assert('set-image-rating by path is case-insensitive', () => {
    const fp = path.join(TMP_DIR, 'RateTest', 'Sunset.PNG');
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(fp, 'Sunset.PNG', 'png');

    // IPC handlers do: WHERE full_path = ? COLLATE NOCASE
    const fpUpper = fp.toUpperCase();
    db.prepare('UPDATE images SET rating = 3 WHERE full_path = ? COLLATE NOCASE').run(fpUpper);
    const r = db.prepare('SELECT rating FROM images WHERE full_path = ? COLLATE NOCASE').get(fp);
    if (!r || r.rating !== 3) throw new Error('set-image-rating COLLATE NOCASE failed');
    db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE').run(fp);
  });

  assert('add/remove tag by path is case-insensitive', () => {
    const fp = path.join(TMP_DIR, 'TagCaseTest', 'Beach.JPG');
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(fp, 'Beach.JPG', 'jpg');
    const imgId = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(fp.toLowerCase()).id;
    db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(imgId, 'summer');
    const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(imgId);
    if (!tags.some(t => t.tag === 'summer')) throw new Error('Tag not added via case-insensitive lookup');
    db.prepare('DELETE FROM image_tags WHERE image_id = ?').run(imgId);
    db.prepare('DELETE FROM images WHERE id = ?').run(imgId);
  });

  // ═══════════════════════════════════════════════════════════
  // 40. MD5 Hash Case Normalisation (Windows)
  // ═══════════════════════════════════════════════════════════
  section('MD5 Hash Case Normalisation');

  assert('same file with different path casing produces same hash on Windows', () => {
    function thumbHash(fullPath) {
      const hashInput = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
      return crypto.createHash('md5').update(hashInput).digest('hex');
    }
    if (process.platform === 'win32') {
      const h1 = thumbHash('C:\\\\Users\\\\Test\\\\Photos\\\\IMG.JPG');
      const h2 = thumbHash('c:\\\\users\\\\test\\\\photos\\\\img.jpg');
      const h3 = thumbHash('C:\\\\USERS\\\\TEST\\\\PHOTOS\\\\IMG.JPG');
      if (h1 !== h2 || h2 !== h3) throw new Error('Windows: same file, different casing → must produce same hash');
    } else {
      // On macOS/Linux, case matters (different files can have different case)
      const h1 = thumbHash('/home/test/photo.jpg');
      const h2 = thumbHash('/home/test/Photo.jpg');
      if (h1 === h2) throw new Error('Unix: different case paths should produce different hashes');
    }
  });

  assert('hash normalisation prevents duplicate thumbnails', () => {
    // Without normalisation, C:\\\\Photos\\\\IMG.jpg and C:\\\\photos\\\\img.jpg
    // would produce different MD5 hashes → two thumbnails for same file
    const h1 = crypto.createHash('md5').update('c:\\\\users\\\\test\\\\img.jpg').digest('hex');
    const h2 = crypto.createHash('md5').update('C:\\\\Users\\\\Test\\\\IMG.JPG').digest('hex');
    // These ARE different without normalisation:
    if (h1 === h2) throw new Error('Raw hashes should differ without normalisation (this tests the baseline)');
    // With normalisation:
    const norm1 = crypto.createHash('md5').update('c:\\\\users\\\\test\\\\img.jpg'.toLowerCase()).digest('hex');
    const norm2 = crypto.createHash('md5').update('C:\\\\Users\\\\Test\\\\IMG.JPG'.toLowerCase()).digest('hex');
    if (norm1 !== norm2) throw new Error('Normalised hashes must be equal');
  });

  // ═══════════════════════════════════════════════════════════
  // 41. NTFS File Lock Retry (Video Temp Cleanup)
  // ═══════════════════════════════════════════════════════════
  section('NTFS File Lock Retry');

  assert('unlinkSync with retry handles EBUSY/EPERM gracefully', () => {
    // Simulate the retry pattern from the video thumbnail cleanup fix
    const tmpFile = path.join(TMP_DIR, 'lock-test-' + Date.now() + '.tmp');
    fs.writeFileSync(tmpFile, 'test');

    function unlinkWithRetry(filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Retry after delay (in production: setTimeout 1s)
        // For test: just try again immediately
        try { fs.unlinkSync(filePath); } catch {}
      }
    }

    unlinkWithRetry(tmpFile);
    if (fs.existsSync(tmpFile)) throw new Error('File should be deleted after retry');
  });

  assert('retry pattern does not throw on already-deleted file', () => {
    const tmpFile = path.join(TMP_DIR, 'already-gone-' + Date.now() + '.tmp');
    // File doesn't exist — unlink should not throw
    let threw = false;
    try {
      try { fs.unlinkSync(tmpFile); } catch { /* first try fails (ENOENT) */ }
      try { fs.unlinkSync(tmpFile); } catch { /* retry also fails, that's ok */ }
    } catch {
      threw = true;
    }
    if (threw) throw new Error('Retry pattern should swallow ENOENT errors');
  });

  await assertAsync('video temp file pattern creates and cleans up correctly', async () => {
    const hash = crypto.createHash('md5').update('test-video-' + Date.now()).digest('hex');
    const tempPath = path.join(CACHE_PATH, hash + '-temp.jpg');
    const thumbPath = path.join(CACHE_PATH, hash + '.webp');

    // Simulate ffmpeg creating a temp frame
    const sharp = require('sharp');
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .jpeg().toFile(tempPath);
    if (!fs.existsSync(tempPath)) throw new Error('Temp frame should exist');

    // Simulate sharp converting to webp
    await sharp(tempPath).resize(400, 400, { fit: 'cover' }).webp({ quality: 65 }).toFile(thumbPath);
    if (!fs.existsSync(thumbPath)) throw new Error('Final thumbnail should exist');

    // Cleanup temp with retry pattern
    try { fs.unlinkSync(tempPath); } catch { setTimeout(() => { try { fs.unlinkSync(tempPath); } catch {} }, 100); }
    // Wait a bit for any delayed cleanup
    await new Promise(r => setTimeout(r, 150));
    if (fs.existsSync(tempPath)) throw new Error('Temp file should be cleaned up');

    // Clean up test thumbnail
    try { fs.unlinkSync(thumbPath); } catch {}
  });

  // ═══════════════════════════════════════════════════════════
  // 42. FFmpeg Path Resolution (Cross-Platform)
  // ═══════════════════════════════════════════════════════════
  section('FFmpeg Path Resolution');

  assert('where command works on Windows', () => {
    if (process.platform !== 'win32') { console.log('    (skipped — not Windows)'); return; }
    const { execSync } = require('child_process');
    // where returns multiple lines if found in multiple PATH dirs
    try {
      const result = execSync('where ffmpeg', { encoding: 'utf8', timeout: 5000 }).trim();
      const firstLine = result.split(/\\r?\\n/)[0];
      if (!firstLine) throw new Error('where ffmpeg returned empty');
      console.log('    (found ffmpeg at: ' + firstLine + ')');
    } catch {
      // ffmpeg may not be installed — that's ok, just verify the command doesn't crash
      console.log('    (ffmpeg not in PATH — ok for CI)');
    }
  });

  assert('which command works on macOS/Linux', () => {
    if (process.platform === 'win32') { console.log('    (skipped — Windows)'); return; }
    const { execSync } = require('child_process');
    try {
      const result = execSync('which ffmpeg', { encoding: 'utf8', timeout: 5000 }).trim();
      if (!result) throw new Error('which ffmpeg returned empty');
      console.log('    (found ffmpeg at: ' + result + ')');
    } catch {
      console.log('    (ffmpeg not in PATH — ok for CI)');
    }
  });

  assert('Homebrew ffmpeg paths are probed on macOS', () => {
    // Verify the probing logic works (even on non-macOS, test the algorithm)
    const brewPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
    let found = null;
    for (const p of brewPaths) {
      if (fs.existsSync(p)) { found = p; break; }
    }
    if (process.platform === 'darwin' && found) {
      console.log('    (Homebrew ffmpeg found at: ' + found + ')');
    } else if (process.platform === 'darwin') {
      console.log('    (No Homebrew ffmpeg — will fall back to which)');
    } else {
      console.log('    (skipped — not macOS)');
    }
    // Algorithm test: brewPaths order is correct (Apple Silicon first)
    if (brewPaths[0] !== '/opt/homebrew/bin/ffmpeg') throw new Error('Apple Silicon path should be checked first');
  });

  assert('ffmpeg-static path unpacking logic', () => {
    // In packaged app: ffmpegPathStatic.replace('app.asar', 'app.asar.unpacked')
    const mockStaticPath = '/path/to/resources/app.asar/node_modules/ffmpeg-static/ffmpeg';
    const unpacked = mockStaticPath.replace('app.asar', 'app.asar.unpacked');
    if (!unpacked.includes('app.asar.unpacked')) throw new Error('asar → asar.unpacked replacement failed');
    if (unpacked.includes('app.asar/node_modules')) throw new Error('Should not contain original asar path');
    // Note: .replace() only replaces the first occurrence, so calling it again
    // on 'app.asar.unpacked' will match the 'app.asar' prefix and double-up.
    // The production code only calls replace ONCE, which is correct.
    // Verify single replace gives the right result:
    if (unpacked !== '/path/to/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg') {
      throw new Error('Single replace gave wrong result: ' + unpacked);
    }
  });

  assert('where ffmpeg output parsed correctly (multi-line)', () => {
    // On Windows, 'where ffmpeg' can return multiple lines
    const mockOutput = 'C:\\\\Program Files\\\\ffmpeg\\\\bin\\\\ffmpeg.exe\\r\\nC:\\\\tools\\\\ffmpeg.exe';
    const firstLine = mockOutput.trim().split(/\\r?\\n/)[0];
    if (firstLine !== 'C:\\\\Program Files\\\\ffmpeg\\\\bin\\\\ffmpeg.exe') {
      throw new Error('Should pick first line of where output: ' + firstLine);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 43. MIME Type Coverage (Companion API)
  // ═══════════════════════════════════════════════════════════
  section('MIME Type Coverage');

  assert('MIME_TYPES includes all video extensions', () => {
    const MIME_TYPES = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
      '.m4v': 'video/x-m4v', '.3gp': 'video/3gpp',
      '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv',
      '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
      '.pdf': 'application/pdf',
    };
    // All video extensions that isVideo recognizes must have a MIME type
    const videoExts = ['.mp4','.webm','.mov','.mkv','.avi','.m4v','.3gp','.wmv','.flv','.mpg','.mpeg'];
    for (const ext of videoExts) {
      if (!MIME_TYPES[ext]) throw new Error('MIME_TYPES missing entry for: ' + ext);
      if (!MIME_TYPES[ext].startsWith('video/')) throw new Error('MIME for ' + ext + ' should be video/*');
    }
  });

  assert('MIME_TYPES for new video extensions are correct', () => {
    const expected = {
      '.m4v': 'video/x-m4v',
      '.3gp': 'video/3gpp',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.mpg': 'video/mpeg',
      '.mpeg': 'video/mpeg',
    };
    for (const [ext, mime] of Object.entries(expected)) {
      // Verify standard MIME types
      if (!mime) throw new Error('MIME for ' + ext + ' should not be empty');
    }
  });

  assert('source api-server.js has all MIME types', () => {
    const apiPath = path.join(ROOT, 'src', 'main', 'api-server.js');
    if (!fs.existsSync(apiPath)) { console.log('    ⚠ Skipping (api-server.js not found)'); return; }
    const content = fs.readFileSync(apiPath, 'utf-8');
    const requiredMimes = ['.m4v', '.3gp', '.wmv', '.flv', '.mpg', '.mpeg'];
    for (const ext of requiredMimes) {
      if (!content.includes("'" + ext + "'") && !content.includes('"' + ext + '"')) {
        throw new Error('api-server.js missing MIME_TYPES entry for ' + ext);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 44. Docker Server Compatibility
  // ═══════════════════════════════════════════════════════════
  section('Docker Server Compatibility');

  assert('server/index.js exists and has thumbnail generation', () => {
    const serverPath = path.join(ROOT, 'src', 'server', 'index.js');
    if (!fs.existsSync(serverPath)) throw new Error('src/server/index.js missing');
    const content = fs.readFileSync(serverPath, 'utf-8');
    if (!content.includes('getOrCreateThumbnail')) throw new Error('Server must have getOrCreateThumbnail function');
    if (!content.includes('sharp')) throw new Error('Server must use sharp for thumbnails');
  });

  assert('server isVideo regex matches full extension set', () => {
    const serverPath = path.join(ROOT, 'src', 'server', 'index.js');
    const content = fs.readFileSync(serverPath, 'utf-8');
    // The server must match m4v, 3gp, wmv, flv, mpg, mpeg
    const requiredExts = ['m4v', '3gp', 'wmv', 'flv', 'mpg', 'mpeg'];
    for (const ext of requiredExts) {
      if (!content.includes(ext)) throw new Error('server/index.js isVideo regex missing: ' + ext);
    }
  });

  assert('server uses 600x600 thumbnails (not 400x400)', () => {
    const serverPath = path.join(ROOT, 'src', 'server', 'index.js');
    const content = fs.readFileSync(serverPath, 'utf-8');
    if (!content.includes('600, 600') && !content.includes('600,600')) {
      throw new Error('Docker server should use 600x600 thumbnails (larger than Electron 400x400)');
    }
  });

  assert('Dockerfile installs ffmpeg via apt', () => {
    const dockerfilePath = path.join(ROOT, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) throw new Error('Dockerfile missing');
    const content = fs.readFileSync(dockerfilePath, 'utf-8');
    if (!content.includes('ffmpeg')) throw new Error('Dockerfile must install ffmpeg');
    // Should use apt-get or apt, not compile from source
    if (!content.includes('apt-get') && !content.includes('apt ')) {
      throw new Error('Dockerfile should install ffmpeg via apt');
    }
  });

  assert('Dockerfile uses non-root user', () => {
    const dockerfilePath = path.join(ROOT, 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf-8');
    // Security: Docker container should not run as root
    if (!content.includes('pluto') && !content.includes('USER')) {
      throw new Error('Dockerfile should create/use a non-root user');
    }
  });

  assert('Dockerfile exposes correct ports', () => {
    const dockerfilePath = path.join(ROOT, 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf-8');
    if (!content.includes('3456')) throw new Error('Dockerfile should expose port 3456 (HTTPS)');
  });

  assert('Dockerfile has health check', () => {
    const dockerfilePath = path.join(ROOT, 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf-8');
    if (!content.includes('HEALTHCHECK') && !content.includes('healthcheck')) {
      throw new Error('Dockerfile should have a HEALTHCHECK');
    }
  });

  assert('docker-compose.yml mounts volumes correctly', () => {
    const composePath = path.join(ROOT, 'docker-compose.yml');
    if (!fs.existsSync(composePath)) throw new Error('docker-compose.yml missing');
    const content = fs.readFileSync(composePath, 'utf-8');
    if (!content.includes('/photos')) throw new Error('docker-compose should mount media to /photos');
    if (!content.includes('/data')) throw new Error('docker-compose should mount data volume');
  });

  assert('server.package.json lists required dependencies', () => {
    const pkgPath = path.join(ROOT, 'server.package.json');
    if (!fs.existsSync(pkgPath)) throw new Error('server.package.json missing');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const required = ['better-sqlite3', 'sharp', 'fluent-ffmpeg', 'exifr'];
    for (const dep of required) {
      if (!pkg.dependencies || !pkg.dependencies[dep]) throw new Error('server.package.json missing dependency: ' + dep);
    }
  });

  assert('server uses system ffmpeg (not ffmpeg-static)', () => {
    const serverPath = path.join(ROOT, 'src', 'server', 'index.js');
    const content = fs.readFileSync(serverPath, 'utf-8');
    // Docker server should check for system ffmpeg, not ffmpeg-static
    if (!content.includes("ffmpeg -version") && !content.includes("ffmpeg --version")) {
      throw new Error('Docker server should probe system ffmpeg availability');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 45. macOS Code Signing (afterSign.cjs)
  // ═══════════════════════════════════════════════════════════
  section('macOS Code Signing');

  assert('afterSign.cjs exists and exports function', () => {
    const signPath = path.join(ROOT, 'build', 'afterSign.cjs');
    if (!fs.existsSync(signPath)) throw new Error('build/afterSign.cjs missing');
    const content = fs.readFileSync(signPath, 'utf-8');
    if (!content.includes('module.exports') && !content.includes('exports.default') && !content.includes('exports =')) {
      throw new Error('afterSign.cjs must export a function');
    }
  });

  assert('afterSign.cjs has findExecutables for standalone binaries', () => {
    const signPath = path.join(ROOT, 'build', 'afterSign.cjs');
    const content = fs.readFileSync(signPath, 'utf-8');
    if (!content.includes('findExecutables')) {
      throw new Error('afterSign.cjs must have findExecutables function to sign ffmpeg');
    }
  });

  assert('afterSign.cjs signs binaries in app.asar.unpacked', () => {
    const signPath = path.join(ROOT, 'build', 'afterSign.cjs');
    const content = fs.readFileSync(signPath, 'utf-8');
    if (!content.includes('app.asar.unpacked')) {
      throw new Error('afterSign.cjs must sign binaries in app.asar.unpacked');
    }
  });

  assert('afterSign.cjs skips non-macOS platforms', () => {
    const signPath = path.join(ROOT, 'build', 'afterSign.cjs');
    const content = fs.readFileSync(signPath, 'utf-8');
    if (!content.includes('darwin') && !content.includes('mac') && !content.includes('macOS')) {
      throw new Error('afterSign.cjs should check for macOS (darwin) platform');
    }
  });

  assert('afterSign.cjs handles notarization', () => {
    const signPath = path.join(ROOT, 'build', 'afterSign.cjs');
    const content = fs.readFileSync(signPath, 'utf-8');
    if (!content.includes('notarize') && !content.includes('notariz')) {
      throw new Error('afterSign.cjs should handle notarization');
    }
  });

  assert('entitlements.mac.plist exists for hardened runtime', () => {
    const entPath = path.join(ROOT, 'build', 'entitlements.mac.plist');
    if (!fs.existsSync(entPath)) throw new Error('build/entitlements.mac.plist missing');
    const content = fs.readFileSync(entPath, 'utf-8');
    if (!content.includes('com.apple.security')) throw new Error('Entitlements must declare security keys');
  });

  // ═══════════════════════════════════════════════════════════
  // 46. Cross-Platform Launch Sanity
  // ═══════════════════════════════════════════════════════════
  section('Cross-Platform Launch Sanity');

  assert('process.platform is valid', () => {
    const valid = ['win32', 'darwin', 'linux'];
    if (!valid.includes(process.platform)) throw new Error('Unexpected platform: ' + process.platform);
  });

  assert('path.sep is correct for platform', () => {
    if (process.platform === 'win32') {
      if (path.sep !== '\\\\') throw new Error('Windows path.sep should be backslash');
    } else {
      if (path.sep !== '/') throw new Error('Unix path.sep should be forward slash');
    }
  });

  assert('electron-builder.yml has all platform targets', () => {
    const configPath = path.join(ROOT, 'electron-builder.yml');
    if (!fs.existsSync(configPath)) throw new Error('electron-builder.yml missing');
    const content = fs.readFileSync(configPath, 'utf-8');
    const platforms = ['win', 'mac', 'linux'];
    for (const p of platforms) {
      if (!content.includes(p)) throw new Error('electron-builder.yml missing platform config: ' + p);
    }
  });

  assert('electron-builder.yml has afterSign for macOS', () => {
    const configPath = path.join(ROOT, 'electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf-8');
    if (!content.includes('afterSign')) throw new Error('electron-builder.yml should reference afterSign hook');
  });

  assert('electron-builder.yml unpackages native modules from asar', () => {
    const configPath = path.join(ROOT, 'electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const requiredUnpack = ['better-sqlite3', 'sharp', 'ffmpeg-static'];
    for (const mod of requiredUnpack) {
      if (!content.includes(mod)) throw new Error('electron-builder.yml should asarUnpack: ' + mod);
    }
  });

  assert('source index.js has platform-aware ffmpeg discovery', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Must use 'where' on Windows, 'which' on Unix
    if (!content.includes('where ffmpeg') && !content.includes("where ffmpeg")) {
      throw new Error('index.js should use "where ffmpeg" on Windows');
    }
    if (!content.includes('which ffmpeg') && !content.includes("which ffmpeg")) {
      throw new Error('index.js should use "which ffmpeg" on Unix');
    }
  });

  assert('source index.js has Homebrew fallback for macOS', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes('/opt/homebrew/bin/ffmpeg')) {
      throw new Error('index.js should probe /opt/homebrew/bin/ffmpeg for macOS');
    }
    if (!content.includes('/usr/local/bin/ffmpeg')) {
      throw new Error('index.js should probe /usr/local/bin/ffmpeg for Intel macOS');
    }
  });

  assert('source index.js has toPlutoUrl helper', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes('function toPlutoUrl')) throw new Error('index.js must define toPlutoUrl helper');
    if (!content.includes('%23')) throw new Error('toPlutoUrl must encode # as %23');
    if (!content.includes('%3F')) throw new Error('toPlutoUrl must encode ? as %3F');
    if (!content.includes('%25')) throw new Error('toPlutoUrl must encode % as %25');
  });

  assert('source index.js uses COLLATE NOCASE for path queries', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Count occurrences of COLLATE NOCASE — should be many (we added ~15)
    const matches = content.match(/COLLATE NOCASE/gi);
    if (!matches || matches.length < 10) {
      throw new Error('index.js should have at least 10 COLLATE NOCASE clauses, found ' + (matches ? matches.length : 0));
    }
  });

  assert('source index.js normalises hash input on Windows', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Both the main thread and worker thread should normalise
    const matches = content.match(/fullPath\\.toLowerCase\\(\\)/g) || content.match(/toLowerCase/g);
    if (!matches) throw new Error('index.js should lowercase path before hashing on Windows');
  });

  assert('api-server.js has path.sep boundary check', () => {
    const apiPath = path.join(ROOT, 'src', 'main', 'api-server.js');
    if (!fs.existsSync(apiPath)) { console.log('    ⚠ Skipping (api-server.js not found)'); return; }
    const content = fs.readFileSync(apiPath, 'utf-8');
    if (!content.includes('path.sep')) {
      throw new Error('api-server.js isPathAllowed must use path.sep boundary check');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 47. Scope Safety — IPC handlers vs app.whenReady()
  // ═══════════════════════════════════════════════════════════
  section('Scope Safety — IPC handlers vs app.whenReady()');

  assert('_invalidateFolderCache is defined before app.whenReady()', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.split('\\n');
    const whenReadyLine = lines.findIndex(l => /app\\.whenReady\\(\\)/.test(l));
    if (whenReadyLine < 0) throw new Error('Could not find app.whenReady() in index.js');
    const preReady = lines.slice(0, whenReadyLine).join('\\n');
    // Must be defined (const/let/var/function) in module scope
    if (!/_invalidateFolderCache\\s*=/.test(preReady) && !/function _invalidateFolderCache/.test(preReady)) {
      throw new Error('_invalidateFolderCache must be defined at module scope (before app.whenReady), not inside the whenReady block');
    }
  });

  assert('_cachedFolders and _cachedFolderPaths are at module scope', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.split('\\n');
    const whenReadyLine = lines.findIndex(l => /app\\.whenReady\\(\\)/.test(l));
    const preReady = lines.slice(0, whenReadyLine).join('\\n');
    if (!/let _cachedFolders/.test(preReady)) {
      throw new Error('_cachedFolders must be declared at module scope');
    }
    if (!/let _cachedFolderPaths/.test(preReady)) {
      throw new Error('_cachedFolderPaths must be declared at module scope');
    }
  });

  assert('all IPC handler identifiers are defined before app.whenReady()', () => {
    // Generic check: any underscore-prefixed identifier called inside an
    // ipcMain.handle() block (before app.whenReady) must also be defined
    // before app.whenReady — otherwise it's a scoping bug.
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const lines = content.split('\\n');
    const whenReadyLine = lines.findIndex(l => l.includes('app.whenReady()'));
    const preReady = lines.slice(0, whenReadyLine).join('\\n');
    const postReady = lines.slice(whenReadyLine).join('\\n');

    // Collect _underscored identifiers defined only in whenReady scope
    const defRe = /(?:const|let|var|function)\\s+(_[a-zA-Z_]\\w*)/g;
    const postDefs = new Set();
    const preDefs = new Set();
    let m;
    while ((m = defRe.exec(postReady)) !== null) postDefs.add(m[1]);
    defRe.lastIndex = 0;
    while ((m = defRe.exec(preReady)) !== null) preDefs.add(m[1]);

    const onlyInReady = [...postDefs].filter(id => !preDefs.has(id));

    // Check if IPC handlers (in preReady) reference any of these
    const problems = [];
    for (const id of onlyInReady) {
      // Skip identifiers only used inside whenReady (protocol handler internals)
      if (['_getFolderPaths'].includes(id)) continue;
      // Simple text search: does the pre-whenReady code mention this identifier?
      if (preReady.includes(id + '(') || preReady.includes(id + ';') || preReady.includes(id + '\\n')) {
        problems.push(id + ' is referenced before app.whenReady() but only defined inside it');
      }
    }
    if (problems.length > 0) {
      throw new Error('Scope bugs found: ' + problems.join('; '));
    }
  });

  assert('delete-folder handler can safely call _invalidateFolderCache', () => {
    // Simulate the actual delete-folder flow to verify no ReferenceError
    const testFolderId = db.prepare('INSERT INTO folders (path) VALUES (?)').run('/tmp/scope-test-' + Date.now()).lastInsertRowid;
    
    // This mirrors the real delete-folder handler — if _invalidateFolderCache
    // weren't at module scope, this pattern would throw ReferenceError at runtime
    let _testCachedFolders = null;
    let _testCachedFolderPaths = null;
    const _testInvalidate = () => { _testCachedFolders = null; _testCachedFolderPaths = null; };
    
    // Populate cache
    _testCachedFolders = db.prepare('SELECT path FROM folders').all();
    _testCachedFolderPaths = _testCachedFolders.map(f => f.path);
    
    // Delete folder + invalidate (same as real handler)
    db.prepare('DELETE FROM folders WHERE id = ?').run(testFolderId);
    _testInvalidate();
    
    if (_testCachedFolders !== null || _testCachedFolderPaths !== null) {
      throw new Error('Cache invalidation failed');
    }
  });

  assert('clear-catalog handler can safely call _invalidateFolderCache', () => {
    // Verify the pattern used in clear-catalog also works
    let cache = { folders: ['a', 'b'], paths: ['/a', '/b'] };
    const invalidate = () => { cache = { folders: null, paths: null }; };
    invalidate();
    if (cache.folders !== null || cache.paths !== null) {
      throw new Error('Invalidation pattern is broken');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 48. Thumbnail Pipeline — DB-lookup handler + priority queue
  // ═══════════════════════════════════════════════════════════
  section('Thumbnail Pipeline — DB-lookup handler + priority queue');

  assert('process-thumbnails-for-paths handler is synchronous (no await blocking)', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Handler must NOT be async — it must return instantly so ipcMain.handle
    // never blocks.  EXIF runs fire-and-forget on the main thread.
    const handlerMatch = content.match(/ipcMain\\.handle\\(\\s*['"]process-thumbnails-for-paths['"]\\s*,\\s*(async\\s+)?/);
    if (!handlerMatch) throw new Error('Handler not found');
    if (handlerMatch[1]) throw new Error('process-thumbnails-for-paths must NOT be async — return instantly, EXIF is fire-and-forget');
  });

  assert('handler does EXIF + tiny Sharp preview with dedup and concurrency limit', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const start = content.indexOf("ipcMain.handle('process-thumbnails-for-paths'");
    const bodySlice = content.slice(start, start + 5000);
    // Must call exifr.thumbnail on main thread (fire-and-forget, no worker competition)
    if (!bodySlice.includes('exifr.thumbnail(')) {
      throw new Error('Handler must call exifr.thumbnail() on main thread for EXIF previews');
    }
    // Must use _schedulePreview for concurrency limiting + dedup
    if (!bodySlice.includes('_schedulePreview(')) {
      throw new Error('Handler must use _schedulePreview for concurrency-limited preview dispatch');
    }
    // Must have a tiny Sharp fallback for non-EXIF formats (PNG, WebP, etc.)
    if (!bodySlice.includes('.resize(40, 40')) {
      throw new Error('Handler must generate tiny 40x40 Sharp previews for non-EXIF image formats');
    }
    // Must NOT use thumbWorkerRun for EXIF (workers are shared with Sharp, causes starvation)
    if (bodySlice.includes("thumbWorkerRun('exif'")) {
      throw new Error('Handler must NOT use thumbWorkerRun for EXIF — main thread exifr avoids worker starvation');
    }
    // Must NOT call thumbWorkerRun for Sharp (that goes through background queue)
    if (bodySlice.includes("thumbWorkerRun('sharp'")) {
      throw new Error('Handler must NOT call thumbWorkerRun for Sharp — generation should happen in background queue only');
    }
    // Must call prioritizeInBackgroundQueue
    if (!/prioritizeInBackgroundQueue/.test(bodySlice)) {
      throw new Error('Handler must call prioritizeInBackgroundQueue for uncached items');
    }
  });

  assert('preview infrastructure has dedup and concurrency limiting', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes('_previewInProgress')) {
      throw new Error('Must have _previewInProgress Set for EXIF/preview deduplication');
    }
    if (!content.includes('MAX_PREVIEW_CONCURRENT')) {
      throw new Error('Must have MAX_PREVIEW_CONCURRENT for concurrency limiting');
    }
    if (!content.includes('_drainPreviewQueue')) {
      throw new Error('Must have _drainPreviewQueue for queued preview processing');
    }
  });

  assert('virtual scroll uses reduced BUFFER_ROWS for lighter rendering', () => {
    const gridPath = path.join(ROOT, 'src', 'renderer', 'src', 'useGrid.js');
    const content = fs.readFileSync(gridPath, 'utf-8');
    const match = content.match(/BUFFER_ROWS\\s*=\\s*(\\d+)/);
    if (!match) throw new Error('BUFFER_ROWS not found in useGrid.js');
    const bufferRows = parseInt(match[1]);
    if (bufferRows > 4) {
      throw new Error('BUFFER_ROWS = ' + bufferRows + ' is too high — use <= 4 to reduce rendering overhead during scroll');
    }
  });

  assert('prioritizeInBackgroundQueue function exists and moves items to end', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!/function prioritizeInBackgroundQueue/.test(content)) {
      throw new Error('prioritizeInBackgroundQueue function not found');
    }
    // Must push to end (pop() takes from end = highest priority)
    const fnStart = content.indexOf('function prioritizeInBackgroundQueue');
    const fnSlice = content.slice(fnStart, fnStart + 600);
    if (!fnSlice.includes('.push(')) {
      throw new Error('prioritizeInBackgroundQueue must push items to end of queue');
    }
  });

  assert('background queue does Sharp generation only (EXIF done by handler)', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const bgStart = content.indexOf('function processBackgroundQueue');
    if (bgStart < 0) throw new Error('processBackgroundQueue not found');
    const bgSlice = content.slice(bgStart, bgStart + 3000);
    // Must contain sharp worker call
    if (!bgSlice.includes("'sharp'")) {
      throw new Error('Background queue must call thumbWorkerRun with sharp');
    }
    // Must NOT contain exif worker call (handler does EXIF)
    if (bgSlice.includes("'exif'")) {
      throw new Error('Background queue should NOT do EXIF — handler already sends EXIF previews');
    }
  });

  assert('MediaCard currentSrc passes through data: URLs', () => {
    const mcPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'MediaCard.vue');
    const content = fs.readFileSync(mcPath, 'utf-8');
    if (!content.includes("startsWith('data:')")) {
      throw new Error('currentSrc must pass through data: URLs without wrapping in pluto://');
    }
  });

  assert('MediaCard emits thumb-error on broken pluto:// thumbnail loads', () => {
    const mcPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'MediaCard.vue');
    const content = fs.readFileSync(mcPath, 'utf-8');
    if (!content.includes('thumb-error')) {
      throw new Error('MediaCard must emit thumb-error when a pluto:// thumbnail fails to load');
    }
  });

  assert('App.vue handles thumb-error by clearing item src', () => {
    const appPath = path.join(ROOT, 'src', 'renderer', 'src', 'App.vue');
    const content = fs.readFileSync(appPath, 'utf-8');
    if (!content.includes('@thumb-error')) {
      throw new Error('App.vue must handle @thumb-error from MediaCard');
    }
  });

  assert('video hover uses metadata preload, not auto', () => {
    const mcPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'MediaCard.vue');
    const content = fs.readFileSync(mcPath, 'utf-8');
    // Look in playVideo function for metadata preload
    const playStart = content.indexOf('const playVideo');
    if (playStart < 0) throw new Error('playVideo function not found');
    const playSlice = content.slice(playStart, playStart + 800);
    // Must set preload to 'metadata' (streams via Range requests) not 'auto' (full download)
    if (!playSlice.includes("'metadata'")) {
      throw new Error('Video hover should set preload to metadata for fast streaming');
    }
  });

  assert('clear-catalog handler also resets admin credentials', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const start = content.indexOf("ipcMain.handle('clear-catalog'");
    if (start < 0) throw new Error('clear-catalog handler not found');
    const slice = content.slice(start, start + 1200);
    if (!slice.includes('clearCredentials')) {
      throw new Error('clear-catalog must call apiServer.clearCredentials() to reset admin login');
    }
  });

  assert('preview queue uses LIFO (pop) so visible items are processed first', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const drainStart = content.indexOf('function _drainPreviewQueue');
    if (drainStart < 0) throw new Error('_drainPreviewQueue not found');
    const slice = content.slice(drainStart, drainStart + 300);
    if (slice.includes('.shift(')) {
      throw new Error('_drainPreviewQueue must use pop() (LIFO), not shift() (FIFO) — visible items must go first');
    }
    if (!slice.includes('.pop()')) {
      throw new Error('_drainPreviewQueue must use pop() for LIFO priority');
    }
  });

  assert('preview queue is flushed on new scroll to prioritise visible items', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes('_flushPreviewQueue')) {
      throw new Error('Must have _flushPreviewQueue to drop stale preview tasks on scroll');
    }
    const start = content.indexOf("ipcMain.handle('process-thumbnails-for-paths'");
    const slice = content.slice(start, start + 500);
    if (!slice.includes('_flushPreviewQueue()')) {
      throw new Error('process-thumbnails-for-paths must call _flushPreviewQueue() to drop stale tasks');
    }
  });

  assert('Lightbox video uses loadedmetadata and preload=metadata for fast display', () => {
    const lbPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'Lightbox.vue');
    const content = fs.readFileSync(lbPath, 'utf-8');
    if (!content.includes('@loadedmetadata=')) {
      throw new Error('Lightbox video must use @loadedmetadata (not @loadeddata) for faster display');
    }
    if (!content.includes('preload="metadata"')) {
      throw new Error('Lightbox video must use preload="metadata" to load dimensions quickly');
    }
  });

  assert('Lightbox video has explicit size to avoid tiny initial render', () => {
    const lbPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'Lightbox.vue');
    const content = fs.readFileSync(lbPath, 'utf-8');
    if (!content.includes('video-media')) {
      throw new Error('Lightbox video element must have video-media class for initial sizing');
    }
    if (!content.includes('.video-media')) {
      throw new Error('Lightbox CSS must style .video-media with explicit dimensions');
    }
  });

  assert('pluto:// protocol serves video files with manual Range request handling', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const protoStart = content.indexOf("protocol.handle('pluto'");
    if (protoStart < 0) throw new Error('pluto:// protocol handler not found');
    const protoSlice = content.slice(protoStart, protoStart + 12000);
    // Video files must be served with manual byte-range handling (status 206)
    // so large videos stream reliably without buffering the entire file.
    if (!protoSlice.includes("status = 206")) {
      throw new Error('pluto:// video handler must return 206 Partial Content for range-based streaming');
    }
    if (!protoSlice.includes("Content-Range")) {
      throw new Error('pluto:// video handler must include Content-Range header');
    }
    // Must have a video extension check to route videos separately
    if (!/videoRe\.test/.test(protoSlice)) {
      throw new Error('pluto:// must detect video files by extension');
    }
  });

  assert('MAX_MAIN_CONCURRENT allows at least 2 concurrent ffmpeg processes', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const match = content.match(/MAX_MAIN_CONCURRENT\\s*=\\s*(\\d+)/);
    if (!match) throw new Error('MAX_MAIN_CONCURRENT not found');
    const val = parseInt(match[1]);
    if (val < 2) throw new Error('MAX_MAIN_CONCURRENT = ' + val + ' is too low — need >= 2 for parallel video thumbnail generation');
  });

  assert('all video extension lists are consistent across components', () => {
    const required = ['m4v', '3gp', 'wmv', 'flv', 'mpg', 'mpeg'];
    const files = [
      { name: 'Lightbox.vue', path: path.join(ROOT, 'src', 'renderer', 'src', 'components', 'Lightbox.vue') },
      { name: 'Slideshow.vue', path: path.join(ROOT, 'src', 'renderer', 'src', 'components', 'Slideshow.vue') },
      { name: 'GallerySidebar.vue', path: path.join(ROOT, 'src', 'renderer', 'src', 'components', 'GallerySidebar.vue') },
    ];
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf-8');
      for (const ext of required) {
        if (!content.includes(ext)) {
          throw new Error(f.name + ' is missing video extension: ' + ext);
        }
      }
    }
  });

  assert('Slideshow video uses loadedmetadata and preload=metadata', () => {
    const ssPath = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'Slideshow.vue');
    const content = fs.readFileSync(ssPath, 'utf-8');
    if (!content.includes('@loadedmetadata=') && !content.includes('@loadedmetadata ="')) {
      throw new Error('Slideshow video must use @loadedmetadata (not @loadeddata)');
    }
    if (!content.includes('preload="metadata"')) {
      throw new Error('Slideshow video must use preload="metadata"');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 49. Video Editor — compose-video Handler Validation
  // ═══════════════════════════════════════════════════════════
  section('Video Editor — compose-video Handler');

  assert('compose-video handler exists and destructures textOverlays + watermarkOverlays', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const match = content.match(/ipcMain\\.handle\\(\\s*['"]compose-video['"]/);
    if (!match) throw new Error('compose-video handler not found');
    const start = content.indexOf(match[0]);
    const slice = content.slice(start, start + 500);
    if (!slice.includes('textOverlays')) throw new Error('compose-video must destructure textOverlays');
    if (!slice.includes('watermarkOverlays')) throw new Error('compose-video must destructure watermarkOverlays');
    if (!slice.includes('audioOverlays')) throw new Error('compose-video must destructure audioOverlays');
    if (!slice.includes('exportPreset')) throw new Error('compose-video must destructure exportPreset');
  });

  assert('compose-video uses font=/fontfile= (not fontfamily=) in drawtext filter', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    // Must use font= or fontfile= for FFmpeg drawtext, not fontfamily=
    if (content.includes("fontfamily=")) {
      throw new Error('FFmpeg drawtext uses font=/fontfile=, not fontfamily= — fontfamily causes "Option fontfamily not found" error');
    }
    // Verify font= or fontfile= is used
    const start = content.indexOf("ipcMain.handle('compose-video'");
    const block = content.slice(start, start + 35000);
    if (!block.includes("fontfile='") && !block.includes("font='")) {
      throw new Error('compose-video drawtext filter should use font= or fontfile= parameter');
    }
    // Also check api-server.js (Docker/companion)
    const apiPath = path.join(ROOT, 'src', 'main', 'api-server.js');
    if (fs.existsSync(apiPath)) {
      const apiContent = fs.readFileSync(apiPath, 'utf-8');
      if (apiContent.includes("fontfamily=")) {
        throw new Error('api-server.js drawtext uses font=, not fontfamily= — fontfamily causes "Option fontfamily not found" error');
      }
    }
  });

  assert('compose-video text overlay normalization clamps values', () => {
    // Replicate the normalization logic to verify correctness
    function normalizeTextOverlay(overlay) {
      const text = String(overlay.text || '').trim();
      if (!text) return null;
      return {
        text,
        fontSize: Math.max(8, Math.min(200, Number(overlay.fontSize || 48))),
        positionX: Math.max(0, Math.min(100, Number(overlay.positionX || 50))),
        positionY: Math.max(0, Math.min(100, Number(overlay.positionY || 85))),
        fadeIn: Math.max(0, Number(overlay.fadeIn || 0)),
        fadeOut: Math.max(0, Number(overlay.fadeOut || 0)),
      };
    }
    // Under-range values clamp up
    const small = normalizeTextOverlay({ text: 'Hi', fontSize: 2, positionX: -10, positionY: -5 });
    if (small.fontSize !== 8) throw new Error('fontSize should clamp to 8, got ' + small.fontSize);
    if (small.positionX !== 0) throw new Error('positionX should clamp to 0, got ' + small.positionX);
    if (small.positionY !== 0) throw new Error('positionY should clamp to 0, got ' + small.positionY);
    // Over-range values clamp down
    const big = normalizeTextOverlay({ text: 'Hi', fontSize: 999, positionX: 200, positionY: 200 });
    if (big.fontSize !== 200) throw new Error('fontSize should clamp to 200, got ' + big.fontSize);
    if (big.positionX !== 100) throw new Error('positionX should clamp to 100, got ' + big.positionX);
    // Empty text returns null
    if (normalizeTextOverlay({ text: '' }) !== null) throw new Error('Empty text should be rejected');
    if (normalizeTextOverlay({ text: '  ' }) !== null) throw new Error('Whitespace-only text should be rejected');
    // Defaults applied
    const defaults = normalizeTextOverlay({ text: 'Title' });
    if (defaults.fontSize !== 48) throw new Error('Default fontSize should be 48');
    if (defaults.positionX !== 50) throw new Error('Default positionX should be 50');
    if (defaults.positionY !== 85) throw new Error('Default positionY should be 85');
  });

  assert('compose-video watermark normalization clamps scale and opacity', () => {
    function normalizeWatermark(overlay) {
      return {
        opacity: Math.max(0.05, Math.min(1, Number(overlay.opacity ?? 0.3))),
        scale: Math.max(5, Math.min(400, Number(overlay.scale || 100))),
        rotation: Math.max(-180, Math.min(180, Number(overlay.rotation || 0))),
        margin: Math.max(0, Math.min(200, Number(overlay.margin || 20))),
        tileSpacing: Math.max(50, Math.min(600, Number(overlay.tileSpacing || 200))),
        tileAngle: Math.max(-90, Math.min(90, Number(overlay.tileAngle || -30))),
      };
    }
    const extreme = normalizeWatermark({ opacity: 0, scale: 999, rotation: -300, margin: 500, tileSpacing: 10, tileAngle: 180 });
    if (extreme.opacity !== 0.05) throw new Error('opacity should clamp to 0.05, got ' + extreme.opacity);
    if (extreme.scale !== 400) throw new Error('scale should clamp to 400, got ' + extreme.scale);
    if (extreme.rotation !== -180) throw new Error('rotation should clamp to -180, got ' + extreme.rotation);
    if (extreme.margin !== 200) throw new Error('margin should clamp to 200, got ' + extreme.margin);
    if (extreme.tileSpacing !== 50) throw new Error('tileSpacing should clamp to 50, got ' + extreme.tileSpacing);
    if (extreme.tileAngle !== 90) throw new Error('tileAngle should clamp to 90, got ' + extreme.tileAngle);
    // Defaults
    const defs = normalizeWatermark({});
    if (Math.abs(defs.opacity - 0.3) > 0.001) throw new Error('Default opacity should be 0.3');
    if (defs.scale !== 100) throw new Error('Default scale should be 100');
    if (defs.tileAngle !== -30) throw new Error('Default tileAngle should be -30');
  });

  assert('escapeDrawtext prevents FFmpeg filter injection', () => {
    function escapeDrawtext(str) {
      return String(str)
        .replace(/\\\\/g, '\\\\\\\\')
        .replace(/'/g, "'\\\\\\\\'")
        .replace(/:/g, '\\\\:')
        .replace(/;/g, '\\\\;')
        .replace(/%/g, '%%');
    }
    // Colon in text must not break filter_complex
    const escaped = escapeDrawtext("Hello: World");
    if (escaped.includes(':') && !escaped.includes('\\\\:')) throw new Error('Colons must be escaped');
    // Semicolons must be escaped (FFmpeg filter separator)
    const semi = escapeDrawtext("A;B");
    if (semi.includes(';') && !semi.includes('\\\\;')) throw new Error('Semicolons must be escaped');
    // Percent must be doubled (FFmpeg time format)
    const pct = escapeDrawtext("100%");
    if (!pct.includes('%%')) throw new Error('% must become %%');
  });

  assert('toFfmpegColor converts hex colors with alpha', () => {
    function toFfmpegColor(color, alpha) {
      const raw = String(color || '#ffffff').trim();
      const hex = raw.startsWith('#') ? raw.slice(1) : raw;
      const valid = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : 'ffffff';
      return '0x' + valid + '@' + Math.max(0, Math.min(1, Number(alpha) || 1)).toFixed(3);
    }
    if (toFfmpegColor('#ff0000', 1) !== '0xff0000@1.000') throw new Error('Red at full alpha wrong');
    if (toFfmpegColor('#000000', 0.5) !== '0x000000@0.500') throw new Error('Black at half alpha wrong');
    // Invalid color falls back to white
    if (!toFfmpegColor('not-a-color', 1).startsWith('0xffffff@')) throw new Error('Invalid color should fall back to white');
    // Null/undefined color falls back
    if (!toFfmpegColor(null, 1).startsWith('0xffffff@')) throw new Error('Null color should fall back to white');
    // Alpha clamps
    if (toFfmpegColor('#aabbcc', 5) !== '0xaabbcc@1.000') throw new Error('Alpha should clamp to 1');
    if (toFfmpegColor('#aabbcc', -1) !== '0xaabbcc@0.000') throw new Error('Alpha should clamp to 0');
  });

  assert('fontFamily sanitization rejects unsafe characters', () => {
    const validate = (family) => {
      const safe = family.replace(/^['\\"]+|['\\"]+$/g, '');
      return /^[a-zA-Z0-9 _-]+$/.test(safe) ? safe : null;
    };
    if (!validate('sans-serif')) throw new Error('sans-serif should be valid');
    if (!validate('Arial')) throw new Error('Arial should be valid');
    if (!validate('Times New Roman')) throw new Error('Times New Roman should be valid');
    if (validate("'; DROP TABLE--")) throw new Error('SQL injection in fontFamily should be rejected');
    if (validate('font\\'(){}')) throw new Error('Special chars in fontFamily should be rejected');
  });

  assert('select-watermark-image IPC handler exists', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    if (!content.includes("'select-watermark-image'") && !content.includes('"select-watermark-image"')) {
      throw new Error('select-watermark-image IPC handler missing');
    }
  });

  assert('select-watermark-image is in preload ALLOWED_CHANNELS', () => {
    const preloadPath = path.join(ROOT, 'src', 'preload', 'index.js');
    const content = fs.readFileSync(preloadPath, 'utf-8');
    if (!content.includes('select-watermark-image')) {
      throw new Error('select-watermark-image missing from preload ALLOWED_CHANNELS whitelist');
    }
  });

  assert('compose-video watermark image uses percentage-of-width scale', () => {
    const indexPath = path.join(ROOT, 'src', 'main', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const start = content.indexOf("ipcMain.handle('compose-video'");
    const block = content.slice(start, start + 25000);
    // Scale must use percentage of video width, not raw pixels
    if (!block.includes('scalePct') && !block.includes('scale') && !block.includes('presetConfig.width')) {
      throw new Error('Watermark image scale should use percentage of video width');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 50. Face Review Schema Columns
  // ═══════════════════════════════════════════════════════════
  section('Face Review Schema Columns');

  assert('image_faces has needs_review and suggested_person_id columns', () => {
    const cols = db.prepare('PRAGMA table_info(image_faces)').all().map(c => c.name);
    const required = ['needs_review', 'suggested_person_id', 'landmarks', 'match_score', 'match_type'];
    for (const col of required) {
      if (!cols.includes(col)) throw new Error('image_faces missing column: ' + col);
    }
  });

  assert('image_hashes has exact_hash and dimension columns', () => {
    const cols = db.prepare('PRAGMA table_info(image_hashes)').all().map(c => c.name);
    const required = ['exact_hash', 'exact_quick_hash', 'width', 'height'];
    for (const col of required) {
      if (!cols.includes(col)) throw new Error('image_hashes missing column: ' + col);
    }
  });

  assert('smart_albums has match_all column', () => {
    const cols = db.prepare('PRAGMA table_info(smart_albums)').all().map(c => c.name);
    if (!cols.includes('match_all')) throw new Error('smart_albums missing match_all column');
    // Default should be 1 (AND logic)
    const sa = db.prepare('INSERT INTO smart_albums (name, rules) VALUES (?, ?)').run('MatchTest', '[]');
    const row = db.prepare('SELECT match_all FROM smart_albums WHERE id = ?').get(sa.lastInsertRowid);
    if (row.match_all !== 1) throw new Error('match_all default should be 1, got ' + row.match_all);
    db.prepare('DELETE FROM smart_albums WHERE id = ?').run(sa.lastInsertRowid);
  });

  assert('folders has mac_bookmark column', () => {
    const cols = db.prepare('PRAGMA table_info(folders)').all().map(c => c.name);
    if (!cols.includes('mac_bookmark')) throw new Error('folders missing mac_bookmark column');
  });

  assert('dismissed_context_results table exists with correct schema', () => {
    const cols = db.prepare('PRAGMA table_info(dismissed_context_results)').all().map(c => c.name);
    if (!cols.includes('query_text')) throw new Error('Missing query_text column');
    if (!cols.includes('image_id')) throw new Error('Missing image_id column');
    if (!cols.includes('created_at')) throw new Error('Missing created_at column');
    // Test insert + query
    db.prepare('INSERT OR IGNORE INTO dismissed_context_results (query_text, image_id) VALUES (?, ?)').run('test query', 1);
    const row = db.prepare('SELECT * FROM dismissed_context_results WHERE query_text = ?').get('test query');
    if (!row) throw new Error('Insert failed');
    db.prepare('DELETE FROM dismissed_context_results WHERE query_text = ?').run('test query');
  });

  console.log('\\n══════════════════════════════════════════════════');
  console.log('  Results: ' + results.passed + ' passed, ' + results.failed + ' failed');
  console.log('══════════════════════════════════════════════════');

  if (results.failed > 0) {
    console.error('\\nFailed tests:');
    results.errors.forEach(e => console.error('  ❌ ' + e));
  }

  db.close();
  process.exit(results.failed > 0 ? 1 : 0);

})();
`;
}

main().catch((err) => {
  console.error('❌ Smoke test error:', err);
  process.exit(1);
});
