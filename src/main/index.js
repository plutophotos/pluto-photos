import { app, shell, BrowserWindow, ipcMain, protocol, dialog, Menu } from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import { Readable } from 'stream'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import crypto from 'crypto'
import exifr from 'exifr'
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPathStatic from 'ffmpeg-static';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPsd, initializeCanvas as initPsdCanvas } from 'ag-psd'
import { createApiServer } from './api-server.js'
import { createLicenseManager } from './license.js'
import { CLIPTokenizer } from './clip-tokenizer.js'
import { autoUpdater } from 'electron-updater'
import { initializeDatabase } from './db.js'
import { Worker } from 'worker_threads'
import {
  recomputePersonCentroid, cleanupOrphanedPeople, euclidean,
  loadSynonymMap, synonymLikeCondition,
  cosineSimilarity, l2Normalise, analyseColorScheme,
  ensureArcFace, computeArcFaceDescriptor
} from './shared.js'

// Disable worker for Node.js environment
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// Limit Sharp to 1 internal thread per operation on the main thread, matching
// the worker-thread setting.  Prevents multi-core contention when main-thread
// fast-preview and worker full-thumbnail pipelines run concurrently.
sharp.concurrency(1);

// Initialize ag-psd with node-canvas so it can render PSD composites
initPsdCanvas(createCanvas);

// Ensure the app name is correct in dev mode (taskbar, task manager, etc.)
app.setName('Pluto Photos');

const isDev = process.env.NODE_ENV === 'development';
const isPackagedSmokeTest = process.env.PLUTO_PACKAGED_SMOKE_TEST === '1';
const supportsSecurityScopedBookmarks = process.platform === 'darwin' && process.mas === true;

const getAssetPath = (relPath) => {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', relPath)
    : path.join(app.getAppPath(), relPath);
};

let ffmpegPath = ffmpegPathStatic ? ffmpegPathStatic.replace('app.asar', 'app.asar.unpacked') : null;
// Verify the bundled binary actually exists (npm install on Windows won't download the Linux binary)
if (ffmpegPath && !fs.existsSync(ffmpegPath)) {
  console.warn('[FFmpeg] Bundled binary not found at', ffmpegPath, '— trying system ffmpeg');
  ffmpegPath = null;
}
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  // Ensure execute permission on macOS/Linux (may be stripped during asar unpacking)
  if (process.platform !== 'win32') {
    try { fs.accessSync(ffmpegPath, fs.constants.X_OK); }
    catch { try { fs.chmodSync(ffmpegPath, 0o755); console.log('[FFmpeg] Set execute permission on binary'); } catch (e) { console.warn('[FFmpeg] chmod failed:', e.message); } }
  }
} else {
  // Fall back to system-installed ffmpeg
  // On macOS, Dock-launched apps get a minimal PATH that excludes Homebrew.
  // Check common Homebrew paths first before relying on `which`.
  if (process.platform === 'darwin') {
    const brewPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
    for (const p of brewPaths) {
      if (fs.existsSync(p)) {
        ffmpegPath = p;
        ffmpeg.setFfmpegPath(p);
        console.log('[FFmpeg] Using Homebrew ffmpeg:', p);
        break;
      }
    }
  }
  if (!ffmpegPath) {
    try {
      const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
      const systemFfmpeg = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      if (systemFfmpeg) {
        ffmpegPath = systemFfmpeg;
        ffmpeg.setFfmpegPath(systemFfmpeg);
        console.log('[FFmpeg] Using system ffmpeg:', systemFfmpeg);
      }
    } catch {
      console.warn('[FFmpeg] No ffmpeg found — video thumbnails will be unavailable');
    }
  }
}

// Enable modest Sharp cache for decode reuse; single-thread per pipeline to
// avoid thread contention when multiple workers run in parallel.
sharp.cache({ memory: 50, files: 20, items: 200 });
sharp.concurrency(1);

const dbPath = join(app.getPath('userData'), 'image_catalog.db');
const db = new Database(dbPath);
const cachePath = join(app.getPath('userData'), 'thumbnails');
const SUPPORTED_MEDIA_RE = /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i;
const IMPORT_SCAN_PROGRESS_EVERY = 20;
const IMPORT_INSERT_BATCH_SIZE = 200;

// Protocol folder cache — module-scope so IPC handlers can invalidate it
let _cachedFolders = null;
let _cachedFolderPaths = null;
const _ephemeralAllowedPaths = new Set();
const _scopedFolderAccessStops = new Map();
const _macFolderAccessIssues = new Map();
const _invalidateFolderCache = () => { _cachedFolders = null; _cachedFolderPaths = null; };

function normalizeAllowedPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function setMacFolderAccessIssue(folderPath, operation, error, extra = {}) {
  if (process.platform !== 'darwin' || !folderPath) return;
  const key = normalizeAllowedPath(folderPath);
  const message = extra.message || error?.message || String(error || 'Unknown macOS folder access error');
  const code = extra.code || error?.code || null;
  _macFolderAccessIssues.set(key, {
    path: path.resolve(folderPath),
    operation,
    message,
    code,
    guidance: extra.guidance || null,
    at: new Date().toISOString(),
  });
}

function clearMacFolderAccessIssue(folderPath) {
  if (process.platform !== 'darwin' || !folderPath) return;
  _macFolderAccessIssues.delete(normalizeAllowedPath(folderPath));
}

function getContainingLibraryFolder(filePath) {
  const resolved = normalizeAllowedPath(filePath);
  const folders = db.prepare('SELECT path FROM folders').all();
  for (const folder of folders) {
    const folderPath = normalizeAllowedPath(folder.path);
    if (resolved === folderPath || resolved.startsWith(folderPath + path.sep)) return folder.path;
  }
  return null;
}

function getFolderAccessGuidance({ exists, readable, bookmarkStored, bookmarkActive, lastIssue }) {
  if (!exists) return 'Folder is missing at this path. Reconnect the drive or remove and re-add the folder.';
  if (!readable) {
    if (supportsSecurityScopedBookmarks) {
      if (bookmarkStored && !bookmarkActive) return 'Stored macOS access could not be restored. Remove and re-add the folder, then retry the import or sync.';
      return 'macOS is denying access to this folder. Remove and re-add the folder in Pluto Photos, then retry.';
    }
    return 'Non-MAS macOS builds cannot persist security-scoped bookmarks across launches. Re-add the folder in Pluto Photos after macOS revokes access.';
  }
  if (lastIssue?.code === 'EPERM' || lastIssue?.code === 'EACCES') {
    return 'Access is working now, but Pluto previously hit a macOS permission failure here. If thumbnails break again after relaunch, remove and re-add this folder.';
  }
  if (process.platform === 'darwin' && app.isPackaged && !supportsSecurityScopedBookmarks) {
    return 'Access is healthy right now. Note that non-MAS macOS builds cannot persist folder grants as security-scoped bookmarks across launches.';
  }
  return 'Access looks healthy.';
}

function getMacFolderAccessDiagnostics() {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      supported: false,
      isMasBuild: false,
      folders: [],
      summary: { total: 0, healthy: 0, warning: 0, error: 0 },
    };
  }

  const folders = db.prepare('SELECT id, path, mac_bookmark FROM folders ORDER BY path COLLATE NOCASE').all();
  const diagnostics = folders.map((folder) => {
    const folderPath = path.resolve(folder.path);
    const normalized = normalizeAllowedPath(folderPath);
    const bookmarkStored = !!(typeof folder.mac_bookmark === 'string' && folder.mac_bookmark.trim());
    const bookmarkActive = _scopedFolderAccessStops.has(normalized);
    const lastIssue = _macFolderAccessIssues.get(normalized) || null;
    const exists = fs.existsSync(folderPath);
    let readable = false;
    if (exists) {
      try {
        fs.accessSync(folderPath, fs.constants.R_OK);
        readable = true;
      } catch (err) {
        readable = false;
        if (!lastIssue && (err?.code === 'EACCES' || err?.code === 'EPERM')) {
          setMacFolderAccessIssue(folderPath, 'folder-access-check', err, {
            guidance: supportsSecurityScopedBookmarks
              ? 'Remove and re-add the folder so Pluto Photos can refresh its macOS access token.'
              : 'Re-add the folder after relaunch if macOS revoked access to it.',
          });
        }
      }
    }

    const refreshedIssue = _macFolderAccessIssues.get(normalized) || lastIssue;
    const severity = !exists || !readable ? 'error' : (refreshedIssue ? 'warning' : 'healthy');
    return {
      id: folder.id,
      path: folderPath,
      severity,
      exists,
      readable,
      bookmarkStored,
      bookmarkActive,
      accessMode: supportsSecurityScopedBookmarks ? 'security-scoped-bookmark' : 'standard-macos',
      lastIssue: refreshedIssue,
      guidance: getFolderAccessGuidance({ exists, readable, bookmarkStored, bookmarkActive, lastIssue: refreshedIssue }),
    };
  });

  return {
    platform: process.platform,
    supported: true,
    isMasBuild: !!process.mas,
    folders: diagnostics,
    summary: {
      total: diagnostics.length,
      healthy: diagnostics.filter((entry) => entry.severity === 'healthy').length,
      warning: diagnostics.filter((entry) => entry.severity === 'warning').length,
      error: diagnostics.filter((entry) => entry.severity === 'error').length,
    },
  };
}

function stopScopedFolderAccess(folderPath) {
  const key = normalizeAllowedPath(folderPath);
  const stop = _scopedFolderAccessStops.get(key);
  if (!stop) return;
  try { stop(); } catch (err) {
    console.warn('[MacAccess] Failed to stop scoped access for', folderPath, err.message);
  }
  _scopedFolderAccessStops.delete(key);
}

function restoreScopedFolderAccess(folderPath, bookmarkData) {
  if (!supportsSecurityScopedBookmarks || !bookmarkData || !folderPath) return false;
  const key = normalizeAllowedPath(folderPath);
  if (_scopedFolderAccessStops.has(key)) return true;
  try {
    const stop = app.startAccessingSecurityScopedResource(bookmarkData);
    if (typeof stop === 'function') {
      _scopedFolderAccessStops.set(key, stop);
      clearMacFolderAccessIssue(folderPath);
      return true;
    }
  } catch (err) {
    console.warn('[MacAccess] Failed to restore bookmark for', folderPath, err.message);
    setMacFolderAccessIssue(folderPath, 'restore-bookmark', err, {
      guidance: 'Remove and re-add the folder so Pluto Photos can request macOS access again.',
    });
  }
  return false;
}

function restoreAllScopedFolderAccess() {
  if (!supportsSecurityScopedBookmarks) return;
  const folders = db.prepare('SELECT path, mac_bookmark FROM folders WHERE mac_bookmark IS NOT NULL AND mac_bookmark != ""').all();
  for (const folder of folders) restoreScopedFolderAccess(folder.path, folder.mac_bookmark);
}

function persistFolderBookmark(folderPath, bookmarkData = null) {
  if (!folderPath) return;
  const normalizedBookmark = typeof bookmarkData === 'string' && bookmarkData.trim() ? bookmarkData : null;
  db.prepare('UPDATE folders SET mac_bookmark = ? WHERE path = ?').run(normalizedBookmark, folderPath);
  clearMacFolderAccessIssue(folderPath);
  if (normalizedBookmark) restoreScopedFolderAccess(folderPath, normalizedBookmark);
}

async function runPackagedStartupSmokeTest() {
  const failures = [];
  const logCheck = (ok, label, detail = '') => {
    const suffix = detail ? ` (${detail})` : '';
    console.log(`[PackagedSmoke] ${ok ? 'PASS' : 'FAIL'} ${label}${suffix}`);
    if (!ok) failures.push(detail ? `${label}: ${detail}` : label);
  };

  logCheck(app.isPackaged, 'app is packaged');

  const preloadPath = join(__dirname, '../preload/index.js');
  logCheck(fs.existsSync(preloadPath), 'preload bundle present', preloadPath);

  const unpackedNodeModules = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
  logCheck(fs.existsSync(unpackedNodeModules), 'unpacked node_modules present', unpackedNodeModules);

  const requiredUnpackedPaths = [
    path.join(unpackedNodeModules, 'sharp'),
    path.join(unpackedNodeModules, 'better-sqlite3'),
    path.join(unpackedNodeModules, '@napi-rs'),
    path.join(unpackedNodeModules, 'onnxruntime-node'),
    path.join(unpackedNodeModules, 'ffmpeg-static'),
  ];
  for (const requiredPath of requiredUnpackedPaths) {
    logCheck(fs.existsSync(requiredPath), 'required unpacked dependency present', requiredPath);
  }

  logCheck(!!ffmpegPath, 'ffmpeg resolved', ffmpegPath || 'not found');
  if (ffmpegPath) {
    logCheck(fs.existsSync(ffmpegPath), 'ffmpeg path exists', ffmpegPath);
  }

  logCheck(fs.existsSync(cachePath), 'thumbnail cache directory ready', cachePath);
  logCheck(typeof apiServer?.start === 'function' && typeof apiServer?.stop === 'function', 'api server constructed');
  logCheck(db.prepare('SELECT 1 AS value').get()?.value === 1, 'better-sqlite3 native query works');
  logCheck(typeof sharp?.versions === 'object', 'sharp native module loaded');
  logCheck(typeof autoUpdater?.checkForUpdates === 'function' && typeof autoUpdater?.downloadUpdate === 'function', 'auto updater runtime available');

  try {
    const ort = await import('onnxruntime-node');
    logCheck(typeof ort?.InferenceSession?.create === 'function', 'onnxruntime native module loaded');
  } catch (err) {
    logCheck(false, 'onnxruntime native module loaded', err.message);
  }

  if (failures.length) {
    console.error('[PackagedSmoke] Startup validation failed');
    failures.forEach((failure) => console.error('[PackagedSmoke] ', failure));
    return 1;
  }

  console.log('[PackagedSmoke] Startup validation passed');
  return 0;
}

function sendImportProgress(win, payload) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('import-progress', payload);
}

if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true });

/** Encode a file path for safe use in pluto:// URLs.
 *  Percent-encodes characters that URL parsers treat as delimiters (#, ?, %)
 *  so paths containing them survive round-trip through new URL() / img src. */
function toPlutoUrl(filePath) {
  return 'pluto://' + filePath.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F');
}

/** Check if a resolved absolute path is within a registered library folder or individually imported file */
function isPathAllowed(resolved) {
  const ci = (s) => process.platform === 'win32' ? s.toLowerCase() : s;
  const folders = db.prepare('SELECT path FROM folders').all();
  const resolvedCI = normalizeAllowedPath(resolved);
  return folders.some(f => {
    const fp = ci(path.resolve(f.path));
    return resolvedCI.startsWith(fp + path.sep) || resolvedCI === fp;
  })
    || _ephemeralAllowedPaths.has(resolvedCI)
    || !!db.prepare('SELECT 1 FROM images WHERE full_path = ? COLLATE NOCASE').get(resolved);
}

// NOTE: apiServer is created later, after licenseManager is initialised
let apiServer;

// --- Auto-backup database on startup (keep last 5) ---
(async () => {
  try {
    if (fs.existsSync(dbPath)) {
      const backupDir = join(app.getPath('userData'), 'db-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = join(backupDir, `catalog-${ts}.db`);
      // Use SQLite backup API instead of raw file copy — safe with WAL mode
      await db.backup(backupPath);
      console.log(`[DB] Backup created: ${backupPath}`);
      // Prune old backups — keep only the most recent 5
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
      while (backups.length > 5) {
        fs.unlinkSync(join(backupDir, backups.shift()));
      }
    }
  } catch (e) {
    console.warn('[DB] Backup failed:', e.message);
  }
})();

initializeDatabase(db);

// --- License manager (must be after DB tables are created) ---
const licenseManager = createLicenseManager(db);

// --- Periodic license validation ---
// validateLicense() internally skips server calls for permanent licenses
// validated within the last 30 days (offline-first). Trial licenses always
// phone home so countdown stays accurate.
setTimeout(() => licenseManager.validateLicense().catch(() => {}), 60_000)       // 60s after startup
setInterval(() => licenseManager.validateLicense().catch(() => {}), 24 * 60 * 60_000) // Daily

// --- API server (companion browser) — created AFTER licenseManager so Pro status is visible ---
// getOrCreateThumbnail is defined below but accessible here because function declarations are hoisted.
apiServer = createApiServer(db, app, getOrCreateThumbnail, licenseManager);

// --- THUMBNAIL GENERATION SYSTEM (worker-thread pool) ---
//
// Heavy image work (Sharp decode+resize+encode, EXIF extraction) runs in a
// pool of real OS threads via Node worker_threads.  The main thread only does
// lightweight orchestration (DB updates, IPC sends), staying free for UI events.

// ---- Worker pool ----
const POOL_SIZE = Math.min(Math.max(os.cpus().length - 2, 2), 6); // 2-6 workers
const _thumbWorkers = [];
const _thumbTaskQueue = [];   // pending tasks when all workers are busy
let _thumbWorkerReady = [];   // idle workers ready for work
let _thumbWorkerFailCount = 0; // guard against infinite respawn loops

// Worker script:  self-contained, importable via eval.
// Each worker can do two things: 'exif' (fast EXIF thumb extraction) and
// 'sharp' (full Sharp decode+resize+encode to cached WebP).
const _thumbWorkerCode = `
const { parentPort, workerData } = require('worker_threads');
// Fix module resolution in packaged app — CWD may be outside the app bundle
// (e.g. '/' on macOS Dock launch, '/mnt/...' in WSL AppImage).
// All worker-required modules are in app.asar.unpacked/node_modules/.
if (workerData.modulePaths && workerData.modulePaths.length > 0) {
  module.paths.unshift(...workerData.modulePaths);
}
const sharp = require('sharp');
const exifr = require('exifr');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

sharp.cache({ memory: 25, files: 10, items: 100 });
sharp.concurrency(1);

const cachePath = workerData.cachePath;

parentPort.on('message', async (msg) => {
  const { id, type, fullPath } = msg;
  try {
    if (type === 'exif') {
      const ext = path.extname(fullPath).toLowerCase();
      const eligible = ['.jpg','.jpeg','.heic','.heif','.tiff','.tif'];
      if (!eligible.includes(ext)) { parentPort.postMessage({ id, type, result: null }); return; }
      const buf = await exifr.thumbnail(fullPath);
      if (buf && buf.length > 0) {
        parentPort.postMessage({ id, type, result: buf.toString('base64'), fullPath });
      } else {
        parentPort.postMessage({ id, type, result: null });
      }
    } else if (type === 'sharp') {
      const hashInput = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
      const hash = crypto.createHash('md5').update(hashInput).digest('hex');
      const thumbFilePath = path.join(cachePath, hash + '.webp');
      try { fs.accessSync(thumbFilePath); parentPort.postMessage({ id, type, result: thumbFilePath, fullPath }); return; } catch {}
      const ext = path.extname(fullPath).toLowerCase();
      const isVideo = /\\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(fullPath);
      if (isVideo || ext === '.pdf' || ext === '.psd') {
        // Videos/PDFs/PSDs handled on main thread (need ffmpeg/pdfjs/ag-psd)
        parentPort.postMessage({ id, type, result: '__MAIN_THREAD__', fullPath });
        return;
      }
      await sharp(fullPath, { failOn: 'none', sequentialRead: true })
        .rotate()
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 65 })
        .toFile(thumbFilePath);
      parentPort.postMessage({ id, type, result: thumbFilePath, fullPath });
    }
  } catch (err) {
    parentPort.postMessage({ id, type, result: null, error: err.message, fullPath });
  }
});
`;

const _libraryImportWorkerCode = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const supportedRe = new RegExp(workerData.supportedMediaPattern, workerData.supportedMediaFlags);
const scanProgressEvery = workerData.scanProgressEvery || 20;

function post(type, payload) {
  parentPort.postMessage({ type, payload });
}

async function collectRecords(rootPath, progressPrefix) {
  const records = [];
  const visited = new Set([path.resolve(rootPath)]);
  const stack = [rootPath];
  let scannedDirs = 0;

  post('progress', {
    current: 0,
    total: 0,
    message: \`${'${'}progressPrefix} Scanning folders...\`,
    done: false,
    indeterminate: true
  });

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.error('[ImportWorker] Cannot read directory:', dir, err.code, err.message);
      if (dir === rootPath) {
        const rootErr = new Error(err.message);
        rootErr.code = err.code;
        rootErr.root = true;
        throw rootErr;
      }
      continue;
    }

    scannedDirs++;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.isSymbolicLink()) continue;
        const resolved = path.resolve(fullPath);
        if (visited.has(resolved)) continue;
        visited.add(resolved);
        stack.push(fullPath);
      } else if (supportedRe.test(entry.name)) {
        try {
          const stats = await fs.promises.stat(fullPath);
          records.push({
            fullPath,
            name: path.basename(fullPath),
            fileType: path.extname(fullPath).slice(1).toLowerCase(),
            dateTaken: stats.mtimeMs
          });
        } catch (err) {
          console.warn(\`[${'${'}progressPrefix}] Skipping file: ${'${'}fullPath} ${'${'}err.message}\`);
        }
      }
    }

    if (scannedDirs === 1 || scannedDirs % scanProgressEvery === 0) {
      post('progress', {
        current: scannedDirs,
        total: 0,
        message: \`${'${'}progressPrefix} Scanning folders... found ${'${'}records.length} file(s) so far\`,
        done: false,
        indeterminate: true
      });
    }
  }

  return records;
}

(async () => {
  try {
    if (workerData.mode === 'import-folder' || workerData.mode === 'sync-folder') {
      const records = await collectRecords(workerData.folderPath, workerData.progressPrefix);
      post('result', {
        mode: workerData.mode,
        path: workerData.folderPath,
        records
      });
      return;
    }

    throw new Error(\`Unknown import worker mode: ${'${'}workerData.mode}\`);
  } catch (err) {
    post('error', {
      code: err.code || null,
      root: !!err.root,
      message: err.message || 'Import worker failed'
    });
  }
})();
`;

// Worker module paths — in packaged app, worker threads launched via eval don't
// have Electron's asar-aware require patches, so all required modules (sharp,
// exifr, and their deps like detect-libc/semver) must be in app.asar.unpacked.
// See asarUnpack in electron-builder.yml for the full list.
const _workerModulePaths = app.isPackaged
  ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')]
  : [];

function formatImportWorkerError(err, actionLabel) {
  const isMac = process.platform === 'darwin';
  const isPermErr = err?.code === 'EACCES' || err?.code === 'EPERM';
  if (isMac && isPermErr) {
    return 'macOS denied access to this folder. Go to System Settings → Privacy & Security → Files and Folders (or Full Disk Access) and grant access to Pluto Photos, then restart the app and try again.';
  }
  if (err?.root) {
    return `Could not read folder: ${err.message}`;
  }
  return `${actionLabel} failed: ${err?.message || 'Unexpected import worker error.'}`;
}

function persistImportedRecords({ records, folderId, progressPrefix, emptyMessage, win }) {
  const safeRecords = Array.isArray(records) ? records : [];

  if (safeRecords.length === 0) {
    sendImportProgress(win, {
      current: 0,
      total: 0,
      message: emptyMessage,
      done: true,
      indeterminate: false
    });
    return { fileCount: 0, importedPaths: [] };
  }

  const insert = db.prepare('INSERT OR IGNORE INTO images (folder_id, name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?, ?)');
  const insertBatch = db.transaction((batch) => {
    batch.forEach((record) => {
      insert.run(folderId, record.name, record.fullPath, record.fileType, record.dateTaken);
    });
  });

  for (let start = 0; start < safeRecords.length; start += IMPORT_INSERT_BATCH_SIZE) {
    const batch = safeRecords.slice(start, start + IMPORT_INSERT_BATCH_SIZE);
    insertBatch(batch);

    const completed = Math.min(start + batch.length, safeRecords.length);
    sendImportProgress(win, {
      current: completed,
      total: safeRecords.length,
      message: `${progressPrefix} Importing ${completed}/${safeRecords.length}...`,
      done: false,
      indeterminate: false
    });
  }

  sendImportProgress(win, {
    current: safeRecords.length,
    total: safeRecords.length,
    message: `${progressPrefix} Done!`,
    done: true,
    indeterminate: false
  });

  return {
    fileCount: safeRecords.length,
    importedPaths: safeRecords.map((record) => record.fullPath)
  };
}

function syncImportedRecords({ records, folderId, progressPrefix, win }) {
  const safeRecords = Array.isArray(records) ? records : [];
  const dbRows = db.prepare('SELECT id, full_path FROM images WHERE folder_id = ?').all(folderId);
  const existingFiles = new Map(dbRows.map((row) => [row.full_path, row.id]));
  const filesOnDisk = new Set(safeRecords.map((record) => record.fullPath));

  const staleIds = dbRows.filter((row) => !filesOnDisk.has(row.full_path)).map((row) => row.id);
  if (staleIds.length > 0) {
    const del = db.prepare('DELETE FROM images WHERE id = ?');
    db.transaction((ids) => { ids.forEach((id) => del.run(id)); })(staleIds);
  }

  const newRecords = safeRecords.filter((record) => !existingFiles.has(record.fullPath));
  const inserted = persistImportedRecords({
    records: newRecords,
    folderId,
    progressPrefix,
    emptyMessage: 'Sync complete - no new files found',
    win
  });

  return {
    added: newRecords.length,
    removed: staleIds.length,
    importedPaths: inserted.importedPaths
  };
}

function runLibraryImportWorker({ mode, folderPath, folderId, progressPrefix, win }) {
  return new Promise((resolve) => {
    let settled = false;
    const worker = new Worker(_libraryImportWorkerCode, {
      eval: true,
      workerData: {
        mode,
        folderPath,
        folderId,
        progressPrefix,
        supportedMediaPattern: SUPPORTED_MEDIA_RE.source,
        supportedMediaFlags: SUPPORTED_MEDIA_RE.flags,
        scanProgressEvery: IMPORT_SCAN_PROGRESS_EVERY
      }
    });

    worker.on('message', (msg) => {
      if (msg?.type === 'progress') {
        sendImportProgress(win, msg.payload);
        return;
      }
      if (msg?.type === 'result') {
        settled = true;
        resolve(msg.payload);
        return;
      }
      if (msg?.type === 'error') {
        settled = true;
        resolve({ error: msg.payload });
      }
    });

    worker.on('error', (err) => {
      console.error('[ImportWorker] Worker error:', err.message);
      if (settled) return;
      settled = true;
      resolve({ error: { message: err.message || 'Import worker crashed' } });
    });

    worker.on('exit', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        console.error(`[ImportWorker] Worker exited with code ${code}`);
      }
      resolve({ error: { message: `Import worker exited with code ${code} without sending results` } });
    });
  });
}

function spawnThumbWorker() {
  const w = new Worker(_thumbWorkerCode, {
    eval: true,
    workerData: { cachePath, modulePaths: _workerModulePaths }
  });
  w._taskCallback = null;
  w.on('message', (msg) => {
    const cb = w._taskCallback;
    w._taskCallback = null;
    _thumbWorkerReady.push(w);
    if (cb) cb(msg);
    _drainThumbQueue();
  });
  w.on('error', (err) => {
    console.error('[ThumbWorker] Worker error:', err.message);
    const cb = w._taskCallback;
    w._taskCallback = null;
    // Don't push back — worker is terminated after uncaught exception
    if (cb) cb({ result: null, error: err.message });
  });
  w.on('exit', (code) => {
    // Remove dead worker from pools
    const wIdx = _thumbWorkers.indexOf(w);
    if (wIdx >= 0) _thumbWorkers.splice(wIdx, 1);
    const rIdx = _thumbWorkerReady.indexOf(w);
    if (rIdx >= 0) _thumbWorkerReady.splice(rIdx, 1);
    if (code !== 0 && !_appQuitting) {
      _thumbWorkerFailCount++;
      if (_thumbWorkerFailCount > POOL_SIZE * 3) {
        console.error('[ThumbWorker] Too many worker failures — disabling thumbnail worker pool');
        return;
      }
      console.warn(`[ThumbWorker] Worker exited with code ${code}, spawning replacement`);
      spawnThumbWorker();
      _drainThumbQueue();
    }
  });
  _thumbWorkerReady.push(w);
  _thumbWorkers.push(w);
  return w;
}

function initThumbWorkerPool() {
  for (let i = 0; i < POOL_SIZE; i++) spawnThumbWorker();
  console.log(`[ThumbPool] ${POOL_SIZE} worker threads started`);
}

function _drainThumbQueue() {
  while (_thumbTaskQueue.length > 0 && _thumbWorkerReady.length > 0) {
    const task = _thumbTaskQueue.shift();
    _dispatchToWorker(task.msg, task.cb);
  }
}

function _dispatchToWorker(msg, cb) {
  if (_thumbWorkerReady.length > 0) {
    const w = _thumbWorkerReady.pop();
    w._taskCallback = cb;
    w.postMessage(msg);
  } else {
    // All workers busy — queue it
    _thumbTaskQueue.push({ msg, cb });
  }
}

// Convenience: returns a Promise
function thumbWorkerRun(type, fullPath) {
  return new Promise((resolve) => {
    const msg = { id: Date.now() + Math.random(), type, fullPath };
    _dispatchToWorker(msg, (result) => resolve(result));
  });
}

// ----- Background (import) pool  — uses the shared worker pool -----
const thumbBackgroundQueue = [];
const thumbBackgroundSet = new Set();
let activeBgTasks = 0;
const MAX_BG_CONCURRENT = 4;

// Batched thumbnail-ready IPC: collect completions and flush every 150ms
let _thumbReadyBatch = [];
let _thumbReadyTimer = null;
let _thumbReadyTarget = null; // webContents reference
function queueThumbReadyEvent(webContents, original, thumbnail) {
  _thumbReadyBatch.push({ original, thumbnail });
  _thumbReadyTarget = webContents;
  if (!_thumbReadyTimer) {
    _thumbReadyTimer = setTimeout(flushThumbReadyBatch, 150);
  }
}
function flushThumbReadyBatch() {
  _thumbReadyTimer = null;
  if (_thumbReadyBatch.length === 0) return;
  const batch = _thumbReadyBatch.splice(0);
  if (_thumbReadyTarget && !_thumbReadyTarget.isDestroyed()) {
    _thumbReadyTarget.send('thumbnails-ready-batch', batch);
  }
}

// In-flight thumbnail deduplication — prevents concurrent Sharp writes to the same file
const _thumbInFlight = new Map();

// ---- Fast-preview infrastructure (EXIF + tiny Sharp fallback) ----
// Dedup: don't start a second EXIF / preview read for a path that's already in progress
const _previewInProgress = new Set();
// Concurrency: limit how many EXIF / preview reads run at once to avoid
// flooding the libuv thread pool (which also serves protocol-handler I/O).
let _previewActive = 0;
const MAX_PREVIEW_CONCURRENT = 6;
const _previewQueue = []; // stores { run, fp } objects

function _drainPreviewQueue() {
  while (_previewQueue.length > 0 && _previewActive < MAX_PREVIEW_CONCURRENT) {
    const task = _previewQueue.pop(); // LIFO: newest (visible) items first
    _previewActive++;
    task.run();
  }
}

// Drop all queued-but-not-started preview tasks so the next scroll batch
// jumps to the front.  In-progress tasks (up to MAX_PREVIEW_CONCURRENT)
// are unaffected — they finish normally.
function _flushPreviewQueue() {
  for (const item of _previewQueue) _previewInProgress.delete(item.fp);
  _previewQueue.length = 0;
}

// Fire an async preview task with concurrency limiting.
// `taskFn` must return a Promise; its .finally handles cleanup.
function _schedulePreview(fp, taskFn) {
  if (_previewInProgress.has(fp)) return;
  _previewInProgress.add(fp);
  const run = () => {
    taskFn().finally(() => {
      _previewInProgress.delete(fp);
      _previewActive--;
      _drainPreviewQueue();
    });
  };
  if (_previewActive < MAX_PREVIEW_CONCURRENT) {
    _previewActive++;
    run();
  } else {
    _previewQueue.push({ run, fp });
  }
}

async function getOrCreateThumbnail(fullPath) {
  const hashInput = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
  const hash = crypto.createHash('md5').update(hashInput).digest('hex');
  const thumbFilePath = join(cachePath, `${hash}.webp`);
  if (fs.existsSync(thumbFilePath)) return thumbFilePath;
  // Deduplicate concurrent requests for the same thumbnail
  if (_thumbInFlight.has(hash)) return _thumbInFlight.get(hash);
  const promise = _generateThumbnail(fullPath, hash, thumbFilePath);
  _thumbInFlight.set(hash, promise);
  promise.finally(() => _thumbInFlight.delete(hash));
  return promise;
}

async function _generateThumbnail(fullPath, hash, thumbFilePath) {

  const ext = path.extname(fullPath).toLowerCase();
  const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(fullPath);
  const isPdf = ext === '.pdf';

  try {
    // PDFs: Render first page using pdf.js
    if (isPdf) {
      try {
        const data = new Uint8Array(fs.readFileSync(fullPath));
        
        // Custom canvas factory for node-canvas
        const canvasFactory = {
          create: (width, height) => {
            const canvas = createCanvas(width, height);
            return { canvas, context: canvas.getContext('2d') };
          },
          reset: (canvasAndContext, width, height) => {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
          },
          destroy: (canvasAndContext) => {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
          }
        };
        
        const doc = await pdfjsLib.getDocument({ 
          data, 
          useSystemFonts: true,
          canvasFactory,
          disableFontFace: true,
          isEvalSupported: false
        }).promise;
        const page = await doc.getPage(1);
        
        // Scale to fit 400x400 thumbnail
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(400 / viewport.width, 400 / viewport.height);
        const scaledViewport = page.getViewport({ scale });
        
        const canvasAndContext = canvasFactory.create(
          Math.floor(scaledViewport.width),
          Math.floor(scaledViewport.height)
        );
        
        await page.render({ 
          canvasContext: canvasAndContext.context, 
          viewport: scaledViewport 
        }).promise;
        
        const pngBuffer = canvasAndContext.canvas.toBuffer('image/png');
        await sharp(pngBuffer)
          .resize(400, 400, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } })
          .webp({ quality: 65 })
          .toFile(thumbFilePath);
        
        return thumbFilePath;
      } catch (pdfErr) {
        console.error('PDF thumbnail error:', pdfErr);
        // Fallback to placeholder if PDF rendering fails
        const svgBuffer = Buffer.from(`
          <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="600" fill="#1a1a1a"/>
            <rect x="150" y="100" width="300" height="400" rx="20" fill="#E53935"/>
            <text x="300" y="340" text-anchor="middle" font-size="100" fill="white" font-family="Arial, sans-serif" font-weight="bold">PDF</text>
          </svg>
        `);
        await sharp(svgBuffer).webp({ quality: 80 }).toFile(thumbFilePath);
        return thumbFilePath;
      }
    }

    // Videos use FFmpeg for thumbnails
    if (isVideo) {
      if (!ffmpegPath) {
        console.warn('[thumbnail] FFmpeg not available — cannot generate video thumbnail for:', path.basename(fullPath));
        return null;
      }
      return new Promise((resolve) => {
        // Use -ss before -i for fast keyframe seeking (near-instant even for
        // multi-GB files, vs output seeking which decodes every frame).
        // Pipe to stdout instead of writing temp file.
        const args = [
          '-ss', '1',
          '-i', fullPath,
          '-frames:v', '1',
          '-f', 'image2pipe',
          '-vcodec', 'mjpeg',
          '-q:v', '5',
          'pipe:1'
        ];
        const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = [];
        const timeout = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {}
          console.warn('[thumbnail] FFmpeg timeout for:', path.basename(fullPath));
          resolve(null);
        }, 15000);
        proc.stdout.on('data', (c) => chunks.push(c));
        proc.on('close', async () => {
          clearTimeout(timeout);
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) { resolve(null); return; }
          try {
            await sharp(buf).resize(400, 400, { fit: 'cover' }).webp({ quality: 65 }).toFile(thumbFilePath);
            resolve(fs.existsSync(thumbFilePath) ? thumbFilePath : null);
          } catch (err) {
            console.warn('[thumbnail] Sharp failed for video frame:', path.basename(fullPath), err?.message);
            resolve(null);
          }
        });
        proc.on('error', () => { clearTimeout(timeout); resolve(null); });
      });
    }

    // PSD files: render composite via ag-psd, then thumbnail with Sharp
    if (ext === '.psd') {
      try {
        const buffer = fs.readFileSync(fullPath);
        const psd = readPsd(buffer, { skipLayerImageData: true, skipThumbnail: false });
        // Use the composite canvas if available
        if (psd.canvas) {
          const pngBuffer = Buffer.from(psd.canvas.toBuffer('image/png'));
          await sharp(pngBuffer)
            .resize(400, 400, { fit: 'cover' })
            .webp({ quality: 65 })
            .toFile(thumbFilePath);
          return thumbFilePath;
        }
      } catch (psdErr) {
        console.error('PSD thumbnail error:', psdErr);
        // Generate a placeholder
        const svgBuffer = Buffer.from(`
          <svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="600" height="600" fill="#1a1a1a"/>
            <rect x="150" y="120" width="300" height="360" rx="20" fill="#2d5a9e"/>
            <text x="300" y="330" text-anchor="middle" font-size="80" fill="white" font-family="Arial, sans-serif" font-weight="bold">PSD</text>
          </svg>
        `);
        await sharp(svgBuffer).webp({ quality: 80 }).toFile(thumbFilePath);
        return thumbFilePath;
      }
    }

    // Images and .ico files use Sharp
    await sharp(fullPath, { failOn: 'none', sequentialRead: true })
      .rotate()
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 65 })
      .toFile(thumbFilePath);
    
    return thumbFilePath;
  } catch (err) {
    console.error('Sharp error:', err);
    return null;
  }
}

let thumbSuccessCount = 0;
let thumbFailCount = 0;
const _thumbFailedPaths = new Set();  // Skip paths that consistently fail (prevents infinite retry)

// ---- Background pool scheduler (uses worker threads) ----
let activeMainThreadTasks = 0; // Limit concurrent ffmpeg/pdfjs (heavy main-thread work)
const MAX_MAIN_CONCURRENT = 2; // Allow 2 concurrent ffmpeg processes for faster video thumbnail generation

// Move paths to the end of the queue (highest priority — pop() takes from end).
// Called by the scroll handler so visible items are processed first.
function prioritizeInBackgroundQueue(paths) {
  const pathSet = new Set(paths);
  // Remove from current position in queue
  let w = 0;
  for (let i = 0; i < thumbBackgroundQueue.length; i++) {
    if (pathSet.has(thumbBackgroundQueue[i].fullPath)) {
      thumbBackgroundSet.delete(thumbBackgroundQueue[i].fullPath);
    } else {
      thumbBackgroundQueue[w++] = thumbBackgroundQueue[i];
    }
  }
  thumbBackgroundQueue.length = w;
  // Push to end (highest priority)
  for (const fp of paths) {
    if (!thumbBackgroundSet.has(fp)) {
      thumbBackgroundQueue.push({ fullPath: fp });
      thumbBackgroundSet.add(fp);
    }
  }
}

function processBackgroundQueue(webContents) {
  while (activeBgTasks < MAX_BG_CONCURRENT && thumbBackgroundQueue.length > 0 && !_appQuitting) {
    const nextItem = thumbBackgroundQueue[thumbBackgroundQueue.length - 1];
    const nextExt = path.extname(nextItem.fullPath).toLowerCase();
    const nextIsMainOnly = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(nextItem.fullPath) || nextExt === '.pdf' || nextExt === '.psd';

    if (nextIsMainOnly && activeMainThreadTasks >= MAX_MAIN_CONCURRENT) break;

    const item = thumbBackgroundQueue.pop();
    thumbBackgroundSet.delete(item.fullPath);
    if (_thumbFailedPaths.has(item.fullPath)) continue;

    activeBgTasks++;
    if (nextIsMainOnly) activeMainThreadTasks++;

    const fullPath = item.fullPath;

    const doWork = async () => {
      // Full Sharp/ffmpeg thumbnail (EXIF previews already sent by the handler)
      if (nextIsMainOnly) {
        return getOrCreateThumbnail(fullPath);
      }
      const msg = await thumbWorkerRun('sharp', fullPath);
      return msg.result === '__MAIN_THREAD__' ? getOrCreateThumbnail(fullPath) : msg.result;
    };

    doWork().then(thumbPath => {
      if (thumbPath && !_appQuitting) {
        thumbSuccessCount++;
        if (thumbSuccessCount <= 3) console.log(`[Thumbnail] Generated #${thumbSuccessCount}: ${thumbPath}`);
        db.prepare('UPDATE images SET thumb_path = ? WHERE full_path = ?').run(thumbPath, fullPath);
        queueThumbReadyEvent(webContents, toPlutoUrl(fullPath), toPlutoUrl(thumbPath));
      } else if (!thumbPath) {
        thumbFailCount++;
        _thumbFailedPaths.add(fullPath);
      }
    }).catch((err) => { thumbFailCount++; _thumbFailedPaths.add(fullPath); console.warn('[Thumbnail] BG error:', path.basename(fullPath), err?.message); }).finally(() => {
      activeBgTasks--;
      if (nextIsMainOnly) activeMainThreadTasks--;
      setImmediate(() => processBackgroundQueue(webContents));
    });
  }
}

// --- IPC HANDLERS ---

ipcMain.handle('get-all-image-paths', async (_, params) => {
  const { albumId, folderId, filePath, search, sort, filter, limit, offset } = params || {};
  let query = '';
  let queryParams = [];
  let conditions = [];

  // Filter by specific file path
  if (filePath) {
    query = `SELECT full_path, thumb_path FROM images`;
    conditions.push('full_path = ?');
    queryParams.push(filePath);
  } else if (albumId) {
    query = `SELECT i.full_path, i.thumb_path FROM images i JOIN album_images ai ON i.id = ai.image_id`;
    conditions.push('ai.album_id = ?');
    queryParams.push(albumId);
  } else {
    query = `SELECT full_path, thumb_path, CASE WHEN id IN (SELECT image_id FROM album_images) THEN 1 ELSE 0 END as in_album FROM images`;
    if (folderId) {
      conditions.push('folder_id = ?');
      queryParams.push(folderId);
    }
    // Apply quick filters
    if (filter === 'not-in-albums') {
      conditions.push('id NOT IN (SELECT image_id FROM album_images)');
    } else if (filter === 'not-rated') {
      conditions.push('(rating IS NULL OR rating = 0)');
    } else if (filter === 'not-tagged') {
      conditions.push('id NOT IN (SELECT DISTINCT image_id FROM image_tags)');
    } else if (filter === 'no-label') {
      conditions.push("(color_label IS NULL OR color_label = '')");
    }
  }

  if (search) {
    const idCol = albumId ? 'i.id' : 'id';
    const colName = albumId ? 'i.name' : 'name';
    // Escape LIKE wildcards in user search input
    const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
    // Search filename AND captions (stem + synonym aware via search-synonyms.json)
    const { sql: captionCond, params: captionParams } = synonymLikeCondition(_synonymMap, search);
    conditions.push(`(${colName} LIKE ? ESCAPE '\\' OR ${idCol} IN (SELECT image_id FROM image_captions WHERE ${captionCond}))`);
    queryParams.push(`%${escapedSearch}%`, ...captionParams);
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');

  const sortMap = {
    'date_taken-ASC': 'date_taken ASC', 'date_taken-DESC': 'date_taken DESC',
    'name-ASC': 'name ASC', 'name-DESC': 'name DESC'
  };
  const mainSort = sortMap[sort] || 'date_taken DESC';
  // Sort album items to the bottom when viewing folder/all photos
  const hasInAlbum = !filePath && !albumId;
  query += ` ORDER BY ${hasInAlbum ? 'in_album ASC, ' : ''}${mainSort}`;

  // --- Pagination: optional LIMIT/OFFSET for large libraries ---
  let totalCount = undefined;
  if (limit && Number.isFinite(limit) && limit > 0) {
    // Build count query from conditions directly (avoids fragile regex transformation)
    let countQuery;
    if (albumId) {
      countQuery = 'SELECT COUNT(*) as c FROM images i JOIN album_images ai ON i.id = ai.image_id';
    } else {
      countQuery = 'SELECT COUNT(*) as c FROM images';
    }
    if (conditions.length > 0) countQuery += ' WHERE ' + conditions.join(' AND ');
    try { totalCount = db.prepare(countQuery).get(...queryParams)?.c ?? 0; } catch { /* fallback: count after fetch */ }
    query += ` LIMIT ${Math.min(limit, 50000)}`;
    if (offset && Number.isFinite(offset) && offset > 0) query += ` OFFSET ${offset}`;
  }

  const rows = db.prepare(query).all(...queryParams);
  if (totalCount === undefined) totalCount = rows.length;
  
  // --- License limit: mark items beyond the free tier cap ---
  const maxImages = licenseManager.checkLimit('maxImages');
  const globalOffset = (offset && Number.isFinite(offset)) ? offset : 0;

  // Trust the DB for thumbnail paths — avoids 4500+ fs.access calls per gallery load.
  // If a thumb file was deleted externally, the img tag gracefully falls back to wireframe
  // and the next requestThumbnail call will regenerate it.
  const items = rows.map((row, idx) => ({
    rawPath: row.full_path,
    original: toPlutoUrl(row.full_path),
    thumb: row.thumb_path ? toPlutoUrl(row.thumb_path) : '',
    inAlbum: row.in_album === 1,
    locked: (maxImages !== Infinity && isFinite(maxImages)) ? (globalOffset + idx) >= maxImages : false
  }));

  // If paginated, return object with totalCount; otherwise flat array for backward compat
  if (limit && Number.isFinite(limit)) {
    return { items, totalCount };
  }
  return items;
});

ipcMain.handle('copy-to-album', async (_, { albumId, imagePath }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return { success: false };
  db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)').run(albumId, img.id);
  return { success: true };
});

ipcMain.handle('add-to-album', async (_, { albumId, paths }) => {
  const findId = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE');
  const findEdit = db.prepare('SELECT output_path FROM image_edits WHERE output_path = ?');
  const insertImg = db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)');
  const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)');
  let addedCount = 0;
  db.transaction((list) => {
    for (const p of list) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      let img = findId.get(clean);
      // If not found in images table, check if it's an edited file and create an images record
      if (!img) {
        const edit = findEdit.get(clean);
        if (edit) {
          const ext = path.extname(clean).replace('.', '').toLowerCase();
          insertImg.run(clean, path.basename(clean), ext);
          img = findId.get(clean);
        }
      }
      if (img) {
        insert.run(albumId, img.id);
        addedCount++;
      }
    }
  })(paths);
  return { success: true };
});

ipcMain.handle('remove-from-album', async (_, { albumId, paths }) => {
  const findId = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE');
  const remove = db.prepare('DELETE FROM album_images WHERE album_id = ? AND image_id = ?');
  db.transaction((list) => {
    for (const p of list) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      const img = findId.get(clean);
      if (img) remove.run(albumId, img.id);
    }
  })(paths);
  return { success: true };
});

ipcMain.handle('get-file-metadata', async (_, filePath) => {
  try {
    if (!isPathAllowed(path.resolve(filePath))) return null;
    const stats = fs.statSync(filePath);
    let exif = await exifr.parse(filePath, true).catch(() => null);
    const width = exif?.ExifImageWidth || exif?.PixelXDimension || 'Unknown';
    const height = exif?.ExifImageHeight || exif?.PixelYDimension || 'Unknown';
    return {
      fileName: path.basename(filePath),
      type: path.extname(filePath).slice(1).toUpperCase() + ' File',
      size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      dimensions: width !== 'Unknown' ? `${width} x ${height}` : 'Unknown',
      dateTaken: (exif?.DateTimeOriginal) ? new Date(exif.DateTimeOriginal).toLocaleString() : 'N/A',
      camera: exif?.Make ? `${exif.Make} ${exif.Model || ''}` : 'N/A',
      fStop: exif?.FNumber ? `f/${exif.FNumber}` : 'N/A',
      iso: exif?.ISO || 'N/A',
      exposure: exif?.ExposureTime ? `1/${Math.round(1/exif.ExposureTime)}s` : 'N/A'
    };
  } catch (err) { return null; }
});

ipcMain.handle('process-thumbnails-for-paths', (event, paths) => {
  if (!paths || paths.length === 0 || _appQuitting) return { queued: false };

  // Drop stale preview tasks from a previous scroll position so these
  // visible items jump to the front of the queue.
  _flushPreviewQueue();

  // --- Phase 0: Fast sync DB lookup (<5ms) ---
  const placeholders = paths.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT full_path, thumb_path FROM images WHERE full_path IN (${placeholders})`
  ).all(...paths);

  const cachedBatch = [];
  const uncached = [];
  const clearThumb = db.prepare('UPDATE images SET thumb_path = NULL WHERE full_path = ?');
  for (const row of rows) {
    if (row.thumb_path) {
      // Verify the thumbnail file still exists on disk — it may have been
      // deleted (cache clear, disk cleanup, etc.) while the DB still
      // references it.  If missing, clear the DB entry and re-queue.
      const thumbResolved = row.thumb_path.startsWith('pluto://')
        ? row.thumb_path  // shouldn't happen but guard
        : row.thumb_path;
      if (fs.existsSync(thumbResolved)) {
        cachedBatch.push({ original: toPlutoUrl(row.full_path), thumbnail: toPlutoUrl(row.thumb_path) });
      } else {
        clearThumb.run(row.full_path);
        uncached.push(row.full_path);
      }
    } else if (!_thumbFailedPaths.has(row.full_path)) {
      uncached.push(row.full_path);
    }
  }

  if (cachedBatch.length > 0 && event.sender && !event.sender.isDestroyed()) {
    event.sender.send('thumbnails-ready-batch', cachedBatch);
  }

  if (uncached.length === 0) return { queued: false, cached: cachedBatch.length };

  // --- Phase 1: Fast previews on main thread (fire-and-forget) ---
  // Two strategies, both concurrency-limited and deduplicated:
  //  A) EXIF thumbnail extraction for formats that embed JPEG thumbnails
  //     (~10-50ms, pure async header read, no CPU work).
  //  B) Tiny Sharp preview for remaining image formats (PNG, WebP, GIF, etc.)
  //     (~50-200ms, small decode + 40×40 resize, quality 15).
  // Both avoid the worker pool, which is reserved for full 400×400 thumbnail
  // generation in the background queue.
  const sender = event.sender;
  const exifEligibleRe = /\.(jpe?g|heic|heif|tiff?|cr2|nef|arw|dng|orf|rw2|raf)$/i;
  const otherImageRe   = /\.(png|webp|gif|bmp|ico)$/i;

  for (const fp of uncached) {
    if (exifEligibleRe.test(fp)) {
      // Strategy A: EXIF — fast header read, returns embedded JPEG thumb
      _schedulePreview(fp, () =>
        exifr.thumbnail(fp).then(buf => {
          if (buf && sender && !sender.isDestroyed()) {
            queueThumbReadyEvent(sender, toPlutoUrl(fp),
              `data:image/jpeg;base64,${buf.toString('base64')}`);
          } else if (!buf) {
            // EXIF returned nothing (e.g. HEIC without embedded JPEG thumb).
            // Fall back to tiny Sharp preview, which decodes the image at
            // minimal resolution.  _previewInProgress was already cleared by
            // the .finally in _schedulePreview, so we can re-schedule.
            _schedulePreview(fp + ':sharpFallback', () =>
              sharp(fp, { failOn: 'none' })
                .resize(40, 40, { fit: 'cover' })
                .jpeg({ quality: 15 })
                .toBuffer()
                .then(b => {
                  if (b && sender && !sender.isDestroyed()) {
                    queueThumbReadyEvent(sender, toPlutoUrl(fp),
                      `data:image/jpeg;base64,${b.toString('base64')}`);
                  }
                })
            );
          }
        }).catch(() => {})
      );
    } else if (otherImageRe.test(fp)) {
      // Strategy B: tiny Sharp decode for non-EXIF formats
      _schedulePreview(fp, () =>
        sharp(fp, { failOn: 'none' })
          .resize(40, 40, { fit: 'cover' })
          .jpeg({ quality: 15 })
          .toBuffer()
          .then(buf => {
            if (buf && sender && !sender.isDestroyed()) {
              queueThumbReadyEvent(sender, toPlutoUrl(fp),
                `data:image/jpeg;base64,${buf.toString('base64')}`);
            }
          }).catch(() => {})
      );
    }
    // Videos / PDFs / PSDs: no fast preview — background queue only
  }

  // --- Phase 2: Prioritize uncached in background queue for Sharp ---
  prioritizeInBackgroundQueue(uncached);
  processBackgroundQueue(sender);

  return { queued: true, cached: cachedBatch.length };
});

ipcMain.handle('import-folder', async () => {
  // --- License limit check ---
  const maxFolders = licenseManager.checkLimit('maxFolders');
  if (maxFolders !== Infinity) {
    const folderCount = db.prepare('SELECT COUNT(*) as cnt FROM folders').get().cnt;
    if (folderCount >= maxFolders) {
      return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxFolders} folder(s). Upgrade to add more.` };
    }
  }
  const maxImages = licenseManager.checkLimit('maxImages');
  if (maxImages !== Infinity) {
    const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
    if (imageCount >= maxImages) {
      return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxImages} images. Upgrade to import more.` };
    }
  }

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    ...(supportsSecurityScopedBookmarks ? { securityScopedBookmarks: true } : {}),
  });
  if (res.canceled) return null;
  const folderPath = res.filePaths[0];
  const folderBookmark = supportsSecurityScopedBookmarks ? (res.bookmarks?.[0] || null) : null;
  const insertFolderResult = db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').run(folderPath);
  const folderId = insertFolderResult.lastInsertRowid || db.prepare('SELECT id FROM folders WHERE path = ?').get(folderPath).id;
  const createdFolder = !!insertFolderResult.lastInsertRowid;
  persistFolderBookmark(folderPath, folderBookmark);
  _invalidateFolderCache();
  const result = await runLibraryImportWorker({ mode: 'import-folder', folderPath, folderId, progressPrefix: 'Import', win });
  if (result?.error) {
    if (createdFolder) {
      db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
      _invalidateFolderCache();
    }
    if (result.error.root) {
      setMacFolderAccessIssue(folderPath, 'import-folder', new Error(formatImportWorkerError(result.error, 'Import')), {
        code: result.error.root.code,
        guidance: supportsSecurityScopedBookmarks
          ? 'Remove and re-add the folder so Pluto Photos can refresh macOS access.'
          : 'Re-add the folder after relaunch if macOS revoked access to it.',
      });
    }
    return { error: result.error.root ? 'permission' : 'worker', message: formatImportWorkerError(result.error, 'Import') };
  }

  const persisted = persistImportedRecords({
    records: result.records,
    folderId,
    progressPrefix: 'Import',
    emptyMessage: 'Import complete - no supported files found',
    win
  });
  clearMacFolderAccessIssue(folderPath);

  // Immediately queue all imported images for background thumbnail generation
  let thumbQueued = 0;
  for (const fullPath of persisted.importedPaths || []) {
    if (thumbBackgroundSet.has(fullPath)) continue;
    const row = db.prepare('SELECT thumb_path FROM images WHERE full_path = ?').get(fullPath);
    if (!row?.thumb_path || !fs.existsSync(row.thumb_path)) {
      if (!_thumbFailedPaths.has(fullPath)) {
        thumbBackgroundQueue.push({ fullPath });
        thumbBackgroundSet.add(fullPath);
        thumbQueued++;
      }
    }
  }
  if (thumbQueued > 0 && win) {
    console.log(`[Import] Queued ${thumbQueued} thumbnails for background generation`);
    processBackgroundQueue(win.webContents);
  }

  // Context scans are manual-only and are started from the ContextScanPanel.

  return { path: folderPath, fileCount: persisted.fileCount || 0 };
});

ipcMain.handle('sync-folder', async (event, folderId) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const folder = db.prepare('SELECT path FROM folders WHERE id = ?').get(folderId);
  if (!folder) return { success: false };
  const result = await runLibraryImportWorker({ mode: 'sync-folder', folderPath: folder.path, folderId, progressPrefix: 'Sync', win });
  if (result?.error) {
    if (result.error.root) {
      setMacFolderAccessIssue(folder.path, 'sync-folder', new Error(formatImportWorkerError(result.error, 'Sync')), {
        code: result.error.root.code,
        guidance: supportsSecurityScopedBookmarks
          ? 'Remove and re-add the folder so Pluto Photos can refresh macOS access.'
          : 'Re-add the folder after relaunch if macOS revoked access to it.',
      });
    }
    return { success: false, error: result.error.root ? 'permission' : 'worker', message: formatImportWorkerError(result.error, 'Sync') };
  }

  const synced = syncImportedRecords({
    records: result.records,
    folderId,
    progressPrefix: 'Sync',
    win
  });
  clearMacFolderAccessIssue(folder.path);

  // Queue new files for background thumbnail generation
  if ((synced.importedPaths || []).length > 0 && win) {
    let thumbQueued = 0;
    for (const fullPath of synced.importedPaths) {
      if (thumbBackgroundSet.has(fullPath)) continue;
      const row = db.prepare('SELECT thumb_path FROM images WHERE full_path = ?').get(fullPath);
      if (!row?.thumb_path || !fs.existsSync(row.thumb_path)) {
        if (!_thumbFailedPaths.has(fullPath)) {
          thumbBackgroundQueue.push({ fullPath });
          thumbBackgroundSet.add(fullPath);
          thumbQueued++;
        }
      }
    }
    if (thumbQueued > 0) {
      console.log(`[Sync] Queued ${thumbQueued} new thumbnails for background generation`);
      processBackgroundQueue(win.webContents);
    }
  }

  return { success: true, added: synced.added || 0, removed: synced.removed || 0 };
});

ipcMain.handle('import-files', async () => {
  // --- License limit check ---
  const maxImages = licenseManager.checkLimit('maxImages');
  if (maxImages !== Infinity) {
    const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
    if (imageCount >= maxImages) {
      return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxImages} images. Upgrade to import more.` };
    }
  }

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Import Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported Files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'cr2', 'nef', 'arw', 'dng', 'orf', 'rw2', 'raf', 'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp', 'ico', 'pdf', 'psd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { paths: [] };

  // Import logic: add files to DB and generate thumbnails
  const importedPaths = [];
  for (const filePath of result.filePaths) {
    try {
      // Check if already exists
      const exists = db.prepare('SELECT id FROM images WHERE full_path = ?').get(filePath);
      if (!exists) {
        const name = path.basename(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        let dateTaken = null;
        try {
          const exif = await exifr.parse(filePath, true).catch(() => null);
          dateTaken = exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal).getTime() : null;
        } catch {}
        db.prepare('INSERT INTO images (name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?)')
          .run(name, filePath, ext, dateTaken);
        if (!_thumbFailedPaths.has(filePath)) {
          thumbBackgroundQueue.push({ fullPath: filePath });
          thumbBackgroundSet.add(filePath);
        }
        importedPaths.push(filePath);
      }
    } catch (err) { console.error('Import file error:', err); }
  }
  if (win) processBackgroundQueue(win.webContents);

  // Context scans are manual-only and are started from the ContextScanPanel.

  return { paths: importedPaths };
});

ipcMain.handle('select-video-files', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Add Videos to Timeline',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { paths: [] };

  const paths = [];
  for (const filePath of result.filePaths) {
    const resolved = path.resolve(filePath);
    _ephemeralAllowedPaths.add(process.platform === 'win32' ? resolved.toLowerCase() : resolved);
    paths.push(filePath);
  }
  return { paths };
});

ipcMain.handle('select-audio-files', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Add Audio Overlay Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'aiff'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { paths: [] };

  const paths = [];
  for (const filePath of result.filePaths) {
    const resolved = path.resolve(filePath);
    _ephemeralAllowedPaths.add(process.platform === 'win32' ? resolved.toLowerCase() : resolved);
    paths.push(filePath);
  }
  return { paths };
});

ipcMain.handle('select-watermark-image', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose Watermark Image',
    properties: ['openFile'],
    filters: [
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { path: null };

  const filePath = result.filePaths[0];
  const resolved = path.resolve(filePath);
  _ephemeralAllowedPaths.add(process.platform === 'win32' ? resolved.toLowerCase() : resolved);
  return { path: filePath };
});

ipcMain.handle('select-lut-file', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose LUT File',
    properties: ['openFile'],
    filters: [
      { name: 'LUT Files', extensions: ['cube', '3dl', 'csp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { path: null };

  const filePath = result.filePaths[0];
  const resolved = path.resolve(filePath);
  _ephemeralAllowedPaths.add(process.platform === 'win32' ? resolved.toLowerCase() : resolved);
  return { path: filePath };
});

ipcMain.handle('get-builtin-luts', () => {
  const lutsDir = getAssetPath(path.join('resources', 'luts'));
  try {
    return fs.readdirSync(lutsDir)
      .filter(f => f.endsWith('.cube') && !f.startsWith('_'))
      .map(f => ({ name: f.replace('.cube', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), file: f, path: path.join(lutsDir, f) }));
  } catch { return []; }
});

ipcMain.handle('get-projects', () => {
  const projects = db.prepare('SELECT * FROM projects').all();
  const albums = db.prepare('SELECT * FROM albums ORDER BY sort_order ASC, id ASC').all();
  const maxProjects = licenseManager.checkLimit('maxProjects');
  const maxAlbums = licenseManager.checkLimit('maxAlbums');
  let albumCount = 0;
  return projects.map((p, pIdx) => {
    const projectLocked = (maxProjects !== Infinity && isFinite(maxProjects)) ? pIdx >= maxProjects : false;
    const projectAlbums = albums.filter(a => a.project_id === p.id).map(a => {
      const albumLocked = projectLocked || ((maxAlbums !== Infinity && isFinite(maxAlbums)) ? albumCount >= maxAlbums : false);
      albumCount++;
      return { ...a, locked: albumLocked };
    });
    return { ...p, is_collapsed: !!p.is_collapsed, albums: projectAlbums, locked: projectLocked };
  });
});

ipcMain.handle('create-project', (_, name) => {
  // --- License limit check ---
  const maxProjects = licenseManager.checkLimit('maxProjects');
  if (maxProjects !== Infinity) {
    const projectCount = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
    if (projectCount >= maxProjects) {
      return { success: false, error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxProjects} project(s). Upgrade to create more.` };
    }
  }

  const projectName = typeof name === 'string' ? name : (name?.name || "New Project");
  const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName);
  if (existing) {
    return { success: false, error: 'duplicate', message: `A project named "${projectName}" already exists.` };
  }
  const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(projectName);
  return { success: true, id: result.lastInsertRowid };
});

ipcMain.handle('create-album', (_, data) => {
  const name = data?.name || "New Album";
  const pId = data?.projectId || data;

  // --- License limit check for albums ---
  const maxAlbums = licenseManager.checkLimit('maxAlbums');
  if (maxAlbums !== Infinity) {
    const albumCount = db.prepare('SELECT COUNT(*) as cnt FROM albums').get().cnt;
    if (albumCount >= maxAlbums) {
      return { success: false, error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxAlbums} album(s). Upgrade to create more.` };
    }
  }
  
  // Only check for duplicate names within the same project
  const existing = db.prepare('SELECT id FROM albums WHERE name = ? AND project_id = ?').get(name, pId);
  if (existing) {
    return { success: false, error: 'duplicate', message: `An album named "${name}" already exists in this project.` };
  }
  
  const row = db.prepare('SELECT MAX(sort_order) as maxOrder FROM albums WHERE project_id = ?').get(pId);
  const result = db.prepare('INSERT INTO albums (name, sort_order, project_id) VALUES (?, ?, ?)').run(name, (row?.maxOrder || 0) + 1, pId);
  return { success: true, id: result.lastInsertRowid };
});

ipcMain.handle('reorder-albums', (_, { draggedId, targetId, position }) => {
  const dragged = db.prepare('SELECT sort_order, project_id FROM albums WHERE id = ?').get(draggedId);
  const target = db.prepare('SELECT sort_order FROM albums WHERE id = ?').get(targetId);
  
  if (!dragged || !target) return { success: false };
  
  const oldOrder = dragged.sort_order;
  const targetOrder = target.sort_order;
  
  // Simple approach: Calculate final position and use a transaction to avoid conflicts
  let finalOrder;
  if (position === 'before') {
    finalOrder = targetOrder;
  } else {
    finalOrder = targetOrder + 1;
  }
  
  // Adjust finalOrder if we're moving down (since removing from old spot shifts everything)
  if (finalOrder > oldOrder) {
    finalOrder = finalOrder - 1;
  }
  
  // No change needed
  if (finalOrder === oldOrder) {
    return { success: true };
  }
  
  // Use transaction for atomic update
  db.transaction(() => {
    if (finalOrder < oldOrder) {
      // Moving UP: shift items down to make room
      db.prepare('UPDATE albums SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order >= ? AND sort_order < ?')
        .run(dragged.project_id, finalOrder, oldOrder);
    } else {
      // Moving DOWN: shift items up to fill gap
      db.prepare('UPDATE albums SET sort_order = sort_order - 1 WHERE project_id = ? AND sort_order > ? AND sort_order <= ?')
        .run(dragged.project_id, oldOrder, finalOrder);
    }
    // Place dragged item at final position
    db.prepare('UPDATE albums SET sort_order = ? WHERE id = ?').run(finalOrder, draggedId);
  })();
  
  return { success: true };
});

ipcMain.handle('delete-project', (_, id) => {
    db.transaction(() => {
        const albums = db.prepare('SELECT id FROM albums WHERE project_id = ?').all(id);
        albums.forEach(a => db.prepare('DELETE FROM album_images WHERE album_id = ?').run(a.id));
        db.prepare('DELETE FROM albums WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    })();
    return { success: true };
});

ipcMain.handle('delete-album', (_, id) => {
    db.transaction(() => {
        db.prepare('DELETE FROM album_images WHERE album_id = ?').run(id);
        db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    })();
    return { success: true };
});

ipcMain.handle('set-album-cover', async (_, { albumId, coverPath }) => {
  const clean = path.normalize(decodeURIComponent(coverPath.replace(/^pluto:\/\//i, '')));
  const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(clean);

  if (isVideo) {
    // Videos can't be rendered by <img>, so use the thumbnail instead
    const row = db.prepare('SELECT thumb_path FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
    let thumbPath = row?.thumb_path;
    // Generate thumbnail on the fly if it doesn't exist yet
    if (!thumbPath || !fs.existsSync(thumbPath)) {
      thumbPath = await getOrCreateThumbnail(clean);
      if (thumbPath) {
        db.prepare('UPDATE images SET thumb_path = ? WHERE full_path = ? COLLATE NOCASE').run(thumbPath, clean);
      }
    }
    if (thumbPath) {
      return db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(thumbPath, albumId);
    }
  }

  return db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(clean, albumId);
});

ipcMain.handle('delete-selected', async (_, paths) => {
  const del = db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE');
  const delEdit = db.prepare('DELETE FROM image_edits WHERE output_path = ?');
  for (const p of paths) {
    const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
    const resolved = path.resolve(clean);
    if (!isPathAllowed(resolved)) continue;
    try {
      if (fs.existsSync(clean)) await shell.trashItem(clean);
      del.run(clean);
      delEdit.run(clean);
    } catch (e) { console.warn('[Delete] Failed to trash file:', clean, e.message); }
  }
  return { success: true };
});

ipcMain.handle('get-all-folders', () => {
  const folders = db.prepare('SELECT * FROM folders').all();
  return folders.map(folder => {
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM images WHERE folder_id = ?').get(folder.id).count;
    const inAlbumsCount = db.prepare(`
      SELECT COUNT(DISTINCT i.id) as count 
      FROM images i 
      INNER JOIN album_images ai ON i.id = ai.image_id 
      WHERE i.folder_id = ?
    `).get(folder.id).count;
    const { mac_bookmark: _macBookmark, ...safeFolder } = folder;
    const macIssue = process.platform === 'darwin' ? _macFolderAccessIssues.get(normalizeAllowedPath(folder.path)) || null : null;
    return { ...safeFolder, totalCount, inAlbumsCount, hasAccessIssue: !!macIssue, lastAccessIssue: macIssue };
  });
});
ipcMain.handle('get-mac-folder-access-diagnostics', () => getMacFolderAccessDiagnostics());
ipcMain.handle('delete-folder', (_, id) => {
  const folder = db.prepare('SELECT path FROM folders WHERE id = ?').get(id);
  if (folder?.path) stopScopedFolderAccess(folder.path);
  if (folder?.path) clearMacFolderAccessIssue(folder.path);
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  _invalidateFolderCache();
  // Clean up orphaned people with no remaining face detections
  db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM image_faces WHERE person_id IS NOT NULL)').run();
});
ipcMain.handle('clear-catalog', () => {
  // Create a safety backup before wiping the catalog
  try {
    const backupDir = join(app.getPath('userData'), 'db-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(dbPath, join(backupDir, `catalog-pre-clear-${ts}.db`));
  } catch (e) { console.warn('[ClearCatalog] Backup failed:', e.message); }
  // Wrap in transaction so it's all-or-nothing
  db.transaction(() => {
    db.exec('DELETE FROM album_images; DELETE FROM image_edits; DELETE FROM image_faces; DELETE FROM people; DELETE FROM images; DELETE FROM folders; DELETE FROM albums; DELETE FROM projects; DELETE FROM smart_albums; DELETE FROM image_captions; DELETE FROM image_hashes; DELETE FROM dismissed_duplicates;');
  })();
  for (const stop of _scopedFolderAccessStops.values()) {
    try { stop(); } catch {}
  }
  _scopedFolderAccessStops.clear();
  _invalidateFolderCache();
  // Also reset admin login credentials so the user can re-register
  try { apiServer.clearCredentials(); } catch (_) {}
});
ipcMain.handle('open-external-file', (_, p) => {
  const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
  const resolved = path.resolve(clean);
  if (!isPathAllowed(resolved)) return '';
  return shell.openPath(resolved);
});
ipcMain.handle('show-in-folder', (_, p) => {
  const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
  const resolved = path.resolve(clean);
  if (!isPathAllowed(resolved)) return;
  shell.showItemInFolder(resolved);
});
ipcMain.handle('toggle-project-collapse', (_, { projectId, isCollapsed }) => db.prepare('UPDATE projects SET is_collapsed = ? WHERE id = ?').run(isCollapsed ? 1 : 0, projectId));

ipcMain.handle('get-server-info', () => apiServer.getInfo());

ipcMain.handle('set-web-credentials', (_, { username, password }) => {
  try {
    apiServer.setCredentials(username, password);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clear-web-credentials', () => {
  try {
    apiServer.clearCredentials();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('verify-web-password', (_, { password }) => {
  try {
    return { valid: apiServer.verifyCurrentPassword(password) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
});

// ============================================================
// FEATURE: Quick Filter Counts
// ============================================================
ipcMain.handle('get-filter-counts', () => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM images').get().c;
    const notInAlbums = db.prepare('SELECT COUNT(*) as c FROM images WHERE id NOT IN (SELECT image_id FROM album_images)').get().c;
    const notRated = db.prepare('SELECT COUNT(*) as c FROM images WHERE rating IS NULL OR rating = 0').get().c;
    const notTagged = db.prepare("SELECT COUNT(*) as c FROM images WHERE id NOT IN (SELECT DISTINCT image_id FROM image_tags)").get().c;
    const noLabel = db.prepare("SELECT COUNT(*) as c FROM images WHERE color_label IS NULL OR color_label = ''").get().c;
    return { total, notInAlbums, notRated, notTagged, noLabel };
  } catch (err) {
    console.error('[get-filter-counts] Error:', err);
    return { total: 0, notInAlbums: 0, notRated: 0, notTagged: 0, noLabel: 0 };
  }
});

// ============================================================
// FEATURE 5: Tagging & Star Ratings
// ============================================================
ipcMain.handle('set-image-rating', (_, { imagePath, rating }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  db.prepare('UPDATE images SET rating = ? WHERE full_path = ? COLLATE NOCASE').run(rating, clean);
  return { success: true };
});

ipcMain.handle('set-image-color-label', (_, { imagePath, color }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  db.prepare('UPDATE images SET color_label = ? WHERE full_path = ? COLLATE NOCASE').run(color, clean);
  return { success: true };
});

ipcMain.handle('get-image-tags', (_, imagePath) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return [];
  return db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id).map(r => r.tag);
});

ipcMain.handle('add-image-tag', (_, { imagePath, tag }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return { success: false };
  // Validate tag: trim, strip control characters, cap at 100 chars (matches batch-add-tag)
  const sanitized = (tag || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
  if (!sanitized) return { success: false, error: 'Tag is empty' };
  db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(img.id, sanitized);
  return { success: true };
});

ipcMain.handle('remove-image-tag', (_, { imagePath, tag }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return { success: false };
  db.prepare('DELETE FROM image_tags WHERE image_id = ? AND tag = ?').run(img.id, tag);
  return { success: true };
});

ipcMain.handle('get-image-details', (_, imagePath) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id, rating, color_label, gps_lat, gps_lng, date_taken FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return null;
  const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(img.id).map(r => r.tag);
  const captionRow = db.prepare('SELECT captions FROM image_captions WHERE image_id = ?').get(img.id);
  return { ...img, tags, captions: captionRow ? captionRow.captions : null };
});

ipcMain.handle('get-all-tags', () => {
  return db.prepare('SELECT DISTINCT tag, COUNT(*) as count FROM image_tags GROUP BY tag ORDER BY count DESC').all();
});

// ============================================================
// FEATURE 6: Smart Albums / Saved Filters
// ============================================================
ipcMain.handle('get-smart-albums', () => {
  return db.prepare('SELECT * FROM smart_albums ORDER BY created_at DESC').all().map(sa => {
    try {
      return { ...sa, rules: JSON.parse(sa.rules), matchAll: sa.match_all !== 0 };
    } catch {
      // Corrupt JSON in rules column — return empty rules so the album list still loads
      return { ...sa, rules: [], matchAll: sa.match_all !== 0 };
    }
  });
});

ipcMain.handle('create-smart-album', (_, { name, rules, icon, matchAll = true }) => {
  const result = db.prepare('INSERT INTO smart_albums (name, rules, match_all, icon) VALUES (?, ?, ?, ?)').run(name, JSON.stringify(rules), matchAll ? 1 : 0, icon || '🔍');
  return { success: true, id: result.lastInsertRowid };
});

ipcMain.handle('update-smart-album', (_, { id, name, rules, icon, matchAll = true }) => {
  db.prepare('UPDATE smart_albums SET name = ?, rules = ?, match_all = ?, icon = ? WHERE id = ?').run(name, JSON.stringify(rules), matchAll ? 1 : 0, icon || '🔍', id);
  return { success: true };
});

ipcMain.handle('delete-smart-album', (_, arg) => {
  const id = typeof arg === 'object' ? arg.id : arg;
  db.prepare('DELETE FROM smart_albums WHERE id = ?').run(id);
  return { success: true };
});

ipcMain.handle('query-smart-album', async (_, args) => {
  let rules = args.rules;
  const sort = args.sort;
  const matchAll = args.matchAll !== false;
  
  // Ensure rules is a proper array - handle string, object, or array
  if (typeof rules === 'string') {
    try { rules = JSON.parse(rules); } catch { rules = []; }
  }
  if (!Array.isArray(rules)) rules = [];
  
  // Build dynamic query from rules
  let conditions = [];
  let params = [];
  
  for (const rule of rules) {
    const val = rule.value;
    switch (rule.type) {
      case 'file_type': {
        const FILE_TYPE_MAP = {
          image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif', 'svg'],
          video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp'],
          gif: ['gif'],
          pdf: ['pdf'],
          psd: ['psd', 'psb']
        };
        const customExt = rule.customExt;
        let exts;
        if (val === 'custom' && customExt) {
          exts = customExt.split(',').map(e => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
        } else {
          exts = FILE_TYPE_MAP[val] || [val];
        }
        if (exts.length === 1) {
          conditions.push('i.file_type = ?');
          params.push(exts[0]);
        } else if (exts.length > 1) {
          conditions.push(`i.file_type IN (${exts.map(() => '?').join(',')})`);
          params.push(...exts);
        }
        break;
      }
      case 'rating_gte':
        conditions.push('i.rating >= ?');
        params.push(Number(val));
        break;
      case 'rating_eq':
        conditions.push('i.rating = ?');
        params.push(Number(val));
        break;
      case 'color_label':
        conditions.push('i.color_label = ?');
        params.push(val);
        break;
      case 'tag':
        conditions.push('i.id IN (SELECT image_id FROM image_tags WHERE tag = ?)');
        params.push(val);
        break;
      case 'date_after':
        conditions.push('i.date_taken >= ?');
        params.push(Number(val));
        break;
      case 'date_before':
        conditions.push('i.date_taken <= ?');
        params.push(Number(val));
        break;
      case 'has_gps':
        if (val && val !== 'any' && val !== true) {
          // Specific location — val is "lat, lng" rounded to 2 decimals
          const parts = String(val).split(',').map(s => parseFloat(s.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            conditions.push('ROUND(i.gps_lat, 2) = ? AND ROUND(i.gps_lng, 2) = ?');
            params.push(parts[0], parts[1]);
          } else {
            conditions.push('i.gps_lat IS NOT NULL AND i.gps_lng IS NOT NULL');
          }
        } else {
          conditions.push('i.gps_lat IS NOT NULL AND i.gps_lng IS NOT NULL');
        }
        break;
      case 'has_faces':
        if (val && val !== 'any' && val !== true) {
          // Specific person ID
          conditions.push('i.id IN (SELECT image_id FROM image_faces WHERE person_id = ? AND width > 0)');
          params.push(Number(val));
        } else {
          conditions.push('i.id IN (SELECT image_id FROM image_faces WHERE width > 0)');
        }
        break;
      case 'person':
        conditions.push('i.id IN (SELECT image_id FROM image_faces WHERE person_id = ? AND width > 0)');
        params.push(Number(val));
        break;
      case 'name_contains': {
        const esc = val.replace(/[%_\\]/g, '\\$&');
        conditions.push("(i.name LIKE ? ESCAPE '\\' OR i.full_path LIKE ? ESCAPE '\\')");
        params.push(`%${esc}%`, `%${esc}%`);
      }
        break;
      case 'context_contains':
        // Contextual search: stem + synonym aware (via search-synonyms.json)
        if (val) {
          const keywords = String(val).toLowerCase().split(/[\s,]+/).filter(Boolean);
          const subConds = [];
          const synParams = [];
          for (const k of keywords) {
            const { sql, params: p } = synonymLikeCondition(_synonymMap, k, 'ic_sub.captions');
            subConds.push(sql);
            synParams.push(...p);
          }
          conditions.push(`i.id IN (SELECT ic_sub.image_id FROM image_captions ic_sub WHERE ${subConds.join(' AND ')})`);
          params.push(...synParams);
        }
        break;
    }
  }

  let query = 'SELECT i.full_path, i.thumb_path FROM images i';
  if (conditions.length) query += ' WHERE ' + conditions.join(matchAll ? ' AND ' : ' OR ');
  
  const sortMap = { 'date_taken-ASC': 'i.date_taken ASC', 'date_taken-DESC': 'i.date_taken DESC', 'name-ASC': 'i.name ASC', 'name-DESC': 'i.name DESC', 'rating-DESC': 'i.rating DESC' };
  query += ` ORDER BY ${sortMap[sort] || 'i.date_taken DESC'}`;

  const rows = db.prepare(query).all(...params);
  return rows.map(row => ({
    rawPath: row.full_path,
    original: toPlutoUrl(row.full_path),
    thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path)
  }));
});

// ============================================================
// FEATURE 7: Face Detection / People Grouping
// ============================================================

// Get distinct location coordinates for Smart Album location rules
ipcMain.handle('get-distinct-locations', () => {
  try {
    const rows = db.prepare('SELECT DISTINCT ROUND(gps_lat, 2) as lat, ROUND(gps_lng, 2) as lng FROM images WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL').all();
    return rows.map(r => `${r.lat}, ${r.lng}`);
  } catch { return []; }
});

ipcMain.handle('get-people', () => {
  const people = db.prepare(`
    SELECT p.*, COUNT(DISTINCT f.image_id) as face_count
    FROM people p
    LEFT JOIN image_faces f ON p.id = f.person_id AND f.person_id IS NOT NULL
    GROUP BY p.id
    HAVING face_count > 0
    ORDER BY face_count DESC
  `).all();
  return people;
});

ipcMain.handle('get-face-review-summary', () => {
  const row = db.prepare('SELECT COUNT(*) as count FROM image_faces WHERE needs_review = 1 AND width > 0').get();
  return { count: row?.count || 0 };
});

ipcMain.handle('get-face-review-queue', async () => {
  const rows = db.prepare(`
    SELECT f.id as face_id, f.image_id, f.x, f.y, f.width, f.height, f.person_id,
           f.match_score, f.match_type, f.suggested_person_id,
           sp.name as suggested_person_name,
           i.full_path, i.thumb_path, i.name as image_name
    FROM image_faces f
    JOIN images i ON f.image_id = i.id
    LEFT JOIN people sp ON sp.id = f.suggested_person_id
    WHERE f.needs_review = 1 AND f.width > 0
    ORDER BY COALESCE(f.match_score, 0) DESC, f.id DESC
  `).all();

  const results = [];
  for (const r of rows) {
    let faceCrop = null;
    const cropPath = join(cachePath, `face_crop_${r.face_id}.jpg`);
    if (fs.existsSync(cropPath)) {
      faceCrop = toPlutoUrl(cropPath);
    }
    results.push({
      faceId: r.face_id,
      imageId: r.image_id,
      personId: r.person_id,
      suggestedPersonId: r.suggested_person_id,
      suggestedPersonName: r.suggested_person_name,
      matchScore: r.match_score,
      matchType: r.match_type,
      x: r.x, y: r.y, width: r.width, height: r.height,
      imagePath: r.full_path,
      imageName: r.image_name,
      original: toPlutoUrl(r.full_path),
      thumb: r.thumb_path && fs.existsSync(r.thumb_path) ? toPlutoUrl(r.thumb_path) : toPlutoUrl(r.full_path),
      faceCrop,
    });
  }
  return results;
});

ipcMain.handle('rename-person', (_, arg) => {
  const id = arg.id || arg.personId;
  const name = arg.name;
  db.prepare('UPDATE people SET name = ? WHERE id = ?').run(name, id);
  return { success: true };
});

ipcMain.handle('merge-people', (_, { keepId, mergeId }) => {
  db.prepare('UPDATE image_faces SET person_id = ? WHERE person_id = ?').run(keepId, mergeId);
  db.prepare('DELETE FROM people WHERE id = ?').run(mergeId);
  // Recalculate centroid for the merged person so future matching stays accurate
  recomputePersonCentroid(db, keepId);
  return { success: true };
});

// Get individual face entries for a person (for reviewing/reassigning)
// Generates face-crop thumbnails on demand for the review gallery
ipcMain.handle('get-person-faces', async (_, arg) => {
  const personId = typeof arg === 'object' ? (arg.personId || arg.id) : arg;
  const rows = db.prepare(`
    SELECT f.id as face_id, f.image_id, f.x, f.y, f.width, f.height, f.person_id,
           i.full_path, i.thumb_path, i.name as image_name
    FROM image_faces f
    JOIN images i ON f.image_id = i.id
    WHERE f.person_id = ? AND f.width > 0
    ORDER BY f.id DESC
  `).all(personId);

  const results = [];
  for (const r of rows) {
    let faceCrop = null;
    const cropPath = join(cachePath, `face_crop_${r.face_id}.jpg`);
    if (fs.existsSync(cropPath)) {
      faceCrop = toPlutoUrl(cropPath);
    }
    results.push({
      faceId: r.face_id,
      imageId: r.image_id,
      personId: r.person_id,
      x: r.x, y: r.y, width: r.width, height: r.height,
      imagePath: r.full_path,
      imageName: r.image_name,
      original: toPlutoUrl(r.full_path),
      thumb: r.thumb_path && fs.existsSync(r.thumb_path) ? toPlutoUrl(r.thumb_path) : toPlutoUrl(r.full_path),
      faceCrop
    });
  }
  return results;
});

// Set a specific face detection as the person's avatar thumbnail
ipcMain.handle('set-person-avatar', async (_, { personId, faceId }) => {
  const face = db.prepare(`
    SELECT f.x, f.y, f.width, f.height, i.full_path
    FROM image_faces f JOIN images i ON f.image_id = i.id
    WHERE f.id = ?
  `).get(faceId);
  if (!face) return { success: false };
  try {
    const metadata = await sharp(face.full_path).metadata();
    const pad = Math.round(Math.max(face.width, face.height) * 0.35);
    const left = Math.max(0, Math.round(face.x - pad));
    const top = Math.max(0, Math.round(face.y - pad));
    const w = Math.min(metadata.width - left, Math.round(face.width + pad * 2));
    const h = Math.min(metadata.height - top, Math.round(face.height + pad * 2));
    if (w > 10 && h > 10) {
      const facePath = join(cachePath, `face_${personId}.jpg`);
      await sharp(face.full_path)
        .extract({ left, top, width: w, height: h })
        .resize(150, 150, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(facePath);
      db.prepare('UPDATE people SET sample_face_path = ? WHERE id = ?').run(facePath, personId);
    }
  } catch {}
  return { success: true };
});

// Reassign a face to a different person — also generate a thumbnail if the target person has none
ipcMain.handle('reassign-face', async (_, { faceId, newPersonId }) => {
  // Get the old person ID before reassigning so we can update their centroid too
  const oldFace = db.prepare('SELECT person_id FROM image_faces WHERE id = ?').get(faceId);
  const oldPersonId = oldFace ? oldFace.person_id : null;

  db.prepare('UPDATE image_faces SET person_id = ?, needs_review = 0, suggested_person_id = NULL, match_type = ? WHERE id = ?').run(newPersonId, oldPersonId ? 'manual-reassign' : 'manual-assign', faceId);

  // Recalculate centroids for both old and new person
  if (oldPersonId && oldPersonId !== newPersonId) {
    recomputePersonCentroid(db, oldPersonId);
    cleanupOrphanedPeople(db);
  }
  recomputePersonCentroid(db, newPersonId);

  // Generate face crop thumbnail for the new person if they don't have one yet
  try {
    const person = db.prepare('SELECT sample_face_path FROM people WHERE id = ?').get(newPersonId);
    if (person && !person.sample_face_path) {
      const face = db.prepare(`
        SELECT f.x, f.y, f.width, f.height, i.full_path
        FROM image_faces f JOIN images i ON f.image_id = i.id
        WHERE f.id = ?
      `).get(faceId);
      if (face && face.width > 10 && face.height > 10) {
        const clean = face.full_path.replace(/^pluto:\/\//, '');
        const metadata = await sharp(clean).metadata();
        const pad = Math.round(Math.max(face.width, face.height) * 0.35);
        const left = Math.max(0, Math.round(face.x - pad));
        const top = Math.max(0, Math.round(face.y - pad));
        const w = Math.min(metadata.width - left, Math.round(face.width + pad * 2));
        const h = Math.min(metadata.height - top, Math.round(face.height + pad * 2));
        if (w > 10 && h > 10) {
          const facePath = join(cachePath, `face_${newPersonId}.jpg`);
          await sharp(clean)
            .extract({ left, top, width: w, height: h })
            .resize(150, 150, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toFile(facePath);
          db.prepare('UPDATE people SET sample_face_path = ? WHERE id = ?').run(facePath, newPersonId);
        }
      }
    }
  } catch (err) {
    console.error('Failed to generate face thumbnail on reassign:', err);
  }

  return { success: true };
});

// Create a new person (for face reassignment)
ipcMain.handle('create-person', (_, arg) => {
  const name = typeof arg === 'object' ? arg.name : arg;
  const result = db.prepare('INSERT INTO people (name) VALUES (?)').run(name || 'Unknown');
  return { id: Number(result.lastInsertRowid), name: name || 'Unknown' };
});

// Delete a specific face detection (incorrect detection)
ipcMain.handle('delete-face', (_, arg) => {
  const faceId = typeof arg === 'object' ? arg.faceId : arg;
  // Get the person ID before deleting so we can update their centroid
  const face = db.prepare('SELECT person_id FROM image_faces WHERE id = ?').get(faceId);
  db.prepare('DELETE FROM image_faces WHERE id = ?').run(faceId);
  // Recalculate centroid and clean up orphaned people
  if (face && face.person_id) {
    recomputePersonCentroid(db, face.person_id);
    cleanupOrphanedPeople(db);
  }
  return { success: true };
});

ipcMain.handle('get-person-images', (_, arg) => {
  const personId = typeof arg === 'object' ? arg.personId : arg;
  const rows = db.prepare(`
    SELECT DISTINCT i.full_path, i.thumb_path FROM images i 
    JOIN image_faces f ON i.id = f.image_id 
    WHERE f.person_id = ? ORDER BY i.date_taken DESC
  `).all(personId);
  return rows.map(row => ({
    rawPath: row.full_path,
    original: toPlutoUrl(row.full_path),
    thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path)
  }));
});

ipcMain.handle('save-detected-faces', async (_, { imagePath, faces }) => {
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
  if (!img) return { success: false };

  // Clear any existing face data for this image to prevent duplicates on rescan
  const saveFacesTransaction = db.transaction(() => {
    db.prepare('DELETE FROM image_faces WHERE image_id = ?').run(img.id);
    if (!faces || faces.length === 0) {
      db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor) VALUES (?, NULL, 0, 0, 0, 0, NULL)').run(img.id);
      return { earlyReturn: true };
    }
    return { earlyReturn: false };
  });
  const txResult = saveFacesTransaction();
  if (txResult.earlyReturn) return { success: true, results: [] };

  // Ensure ArcFace ONNX model is loaded
  const arcfaceModelPath = join(getAssetPath('resources/face-models/arcface'), 'w600k_r50.onnx');
  await ensureArcFace(arcfaceModelPath);
  
  const insertFace = db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor, landmarks, match_score, match_type, needs_review, suggested_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const updatePersonThumb = db.prepare('UPDATE people SET sample_face_path = ? WHERE id = ? AND sample_face_path IS NULL');

  // ── Person matching (InsightFace w600k_r50 512-dim) ──
  // Cosine similarity: same person ~0.3–0.7, different person < ~0.3.
  const CENTROID_THRESHOLD = 0.43;
  const INDIVIDUAL_THRESHOLD = 0.38;
  const REVIEW_CENTROID_THRESHOLD = 0.36;
  const REVIEW_INDIVIDUAL_THRESHOLD = 0.33;
  const allPeople = db.prepare('SELECT id, name, centroid FROM people WHERE centroid IS NOT NULL').all();
  const centroids = [];
  for (const p of allPeople) {
    try {
      const c = JSON.parse(p.centroid);
      const allFaces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(p.id);
      const descriptors = [];
      for (const f of allFaces) { try { descriptors.push(JSON.parse(f.descriptor)); } catch {} }
      centroids.push({ id: p.id, name: p.name, centroid: c, descriptors });
    } catch {}
  }

  console.log(`[FaceSave] Image: ${path.basename(clean)}, ${faces.length} face(s), ${centroids.length} existing people`);

  const results = [];
  for (const face of faces) {
    // Compute 512-dim ArcFace descriptor server-side from image + landmarks
    let desc = null;
    const lm = face.landmarks;
    if (lm && lm.length === 5) {
      try {
        desc = await computeArcFaceDescriptor(clean, face, lm);
      } catch (e) {
        console.warn(`[FaceSave] ArcFace descriptor failed: ${e.message}`);
      }
    }
    // Fallback: if renderer sent a descriptor (legacy 128-dim), use it
    if (!desc && face.descriptor && face.descriptor.length > 0) {
      desc = l2Normalise(Array.from(face.descriptor));
      console.log(`[FaceSave] Using legacy renderer descriptor (${desc.length}-dim)`);
    }

    let matchedPersonId = null;
    let suggestedPersonId = null;
    let matchScore = null;
    let matchType = desc ? 'new-person' : 'no-descriptor';
    let needsReview = 0;
    if (desc && desc.length > 0) {
      // Dual threshold: centroid match OR best individual descriptor match
      const centroidBest = centroids.reduce((best, p) => {
        if (p.centroid.length !== desc.length) return best; // skip dimension mismatch
        const s = cosineSimilarity(desc, p.centroid);
        return s > best.sim ? { sim: s, id: p.id, name: p.name } : best;
      }, { sim: -1, id: null, name: null });
      const individualBest = { sim: -1, id: null, name: null };
      for (const p of centroids) {
        for (const d of p.descriptors) {
          if (d.length !== desc.length) continue; // skip dimension mismatch
          const s = cosineSimilarity(desc, d);
          if (s > individualBest.sim) { individualBest.sim = s; individualBest.id = p.id; individualBest.name = p.name; }
        }
      }
      if (centroidBest.sim >= CENTROID_THRESHOLD) {
        matchedPersonId = centroidBest.id;
        matchScore = centroidBest.sim;
        matchType = 'centroid';
        console.log(`[FaceSave] Matched → person #${matchedPersonId} (${centroidBest.name}) centroid-sim=${centroidBest.sim.toFixed(4)}`);
      } else if (individualBest.sim >= INDIVIDUAL_THRESHOLD) {
        matchedPersonId = individualBest.id;
        matchScore = individualBest.sim;
        matchType = 'individual';
        console.log(`[FaceSave] Matched → person #${matchedPersonId} (${individualBest.name}) individual-sim=${individualBest.sim.toFixed(4)}`);
      } else if (centroidBest.sim >= REVIEW_CENTROID_THRESHOLD || individualBest.sim >= REVIEW_INDIVIDUAL_THRESHOLD) {
        const reviewCandidate = centroidBest.sim >= individualBest.sim
          ? { id: centroidBest.id, sim: centroidBest.sim, type: 'review-centroid', name: centroidBest.name }
          : { id: individualBest.id, sim: individualBest.sim, type: 'review-individual', name: individualBest.name };
        suggestedPersonId = reviewCandidate.id;
        matchScore = reviewCandidate.sim;
        matchType = reviewCandidate.type;
        needsReview = 1;
        console.log(`[FaceSave] REVIEW → suggested person #${suggestedPersonId} (${reviewCandidate.name}) ${reviewCandidate.type}=${reviewCandidate.sim.toFixed(4)}`);
      } else if (centroids.length > 0) {
        console.log(`[FaceSave] NO MATCH — centroid-best=${centroidBest.sim.toFixed(4)} individual-best=${individualBest.sim.toFixed(4)} (checked ${centroids.length} people)`);
      }
    } else {
      console.log(`[FaceSave] *** NO DESCRIPTOR — creating isolated person`);
    }
    
    if (!matchedPersonId && !needsReview) {
      const centroidJson = desc ? JSON.stringify(desc) : null;
      const p = db.prepare('INSERT INTO people (name, centroid) VALUES (?, ?)').run('Unknown', centroidJson);
      matchedPersonId = p.lastInsertRowid;
      matchType = desc ? 'new-person' : 'no-descriptor';
      if (desc) centroids.push({ id: matchedPersonId, centroid: desc, name: 'Unknown', descriptors: [desc] });
    }
    
    const landmarksJson = lm ? JSON.stringify(lm) : null;
    insertFace.run(img.id, matchedPersonId, face.x, face.y, face.width, face.height, desc ? JSON.stringify(desc) : null, landmarksJson, matchScore, matchType, needsReview, suggestedPersonId);
    
    // Generate face crop thumbnail for this person if they don't have one yet
    try {
      if (!matchedPersonId) throw new Error('review face has no assigned person');
      const existing = db.prepare('SELECT sample_face_path FROM people WHERE id = ?').get(matchedPersonId);
      if (!existing?.sample_face_path) {
        const thumbMeta = await sharp(clean, { failOn: 'none' }).metadata();
        const thumbW = thumbMeta.orientation && thumbMeta.orientation >= 5 ? thumbMeta.height : thumbMeta.width;
        const thumbH = thumbMeta.orientation && thumbMeta.orientation >= 5 ? thumbMeta.width : thumbMeta.height;
        const pad = Math.round(Math.max(face.width, face.height) * 0.35);
        const left = Math.max(0, Math.round(face.x - pad));
        const top = Math.max(0, Math.round(face.y - pad));
        const w = Math.min(thumbW - left, Math.round(face.width + pad * 2));
        const h = Math.min(thumbH - top, Math.round(face.height + pad * 2));
        if (w > 10 && h > 10) {
          const facePath = join(cachePath, `face_${matchedPersonId}.jpg`);
          await sharp(clean, { failOn: 'none' })
            .rotate()
            .extract({ left, top, width: w, height: h })
            .resize(150, 150, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toFile(facePath);
          updatePersonThumb.run(facePath, matchedPersonId);
          console.log(`[FaceSave] Thumbnail saved: face_${matchedPersonId}.jpg`);
        } else {
          console.warn(`[FaceSave] Thumbnail skipped: crop too small (${w}x${h})`);
        }
      }
    } catch (thumbErr) {
      console.error(`[FaceSave] Thumbnail FAILED for person #${matchedPersonId}:`, thumbErr.message);
    }

    // Update centroid for matched person (running average of L2-normalized embeddings)
    if (matchedPersonId && desc && desc.length > 0) {
      const allFaces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(matchedPersonId);
      const newCentroid = new Array(desc.length).fill(0);
      let count = 0;
      for (const f of allFaces) {
        try {
          const d = JSON.parse(f.descriptor);
          if (d.length !== desc.length) continue; // skip dimension mismatch during transition
          for (let i = 0; i < d.length; i++) newCentroid[i] += d[i];
          count++;
        } catch {}
      }
      if (count > 0) {
        for (let i = 0; i < newCentroid.length; i++) newCentroid[i] /= count;
        l2Normalise(newCentroid);
        db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(newCentroid), matchedPersonId);
        const idx = centroids.findIndex(c => c.id === matchedPersonId);
        if (idx >= 0) centroids[idx].centroid = newCentroid;
      }
    }
    
    results.push({ personId: matchedPersonId, suggestedPersonId, needsReview: !!needsReview, matchScore, matchType });
  }
  return { success: true, results };
});

// Return all scannable image paths (skip already-scanned ones unless rescan=true)
ipcMain.handle('get-all-image-paths-for-scan', (_, opts) => {
  const rescan = opts?.rescan || false;
  let sql = `SELECT full_path FROM images WHERE file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'tiff', 'tif', 'bmp')`;
  if (!rescan) {
    sql += ` AND id NOT IN (SELECT DISTINCT image_id FROM image_faces)`;
  }
  const rows = db.prepare(sql).all();
  return rows.map(r => r.full_path);
});

// Return the path to bundled face-api models
ipcMain.handle('get-face-model-path', () => {
  const isDev = !app.isPackaged;
  if (isDev) {
    return join(process.cwd(), 'resources', 'face-models', 'model');
  }
  return join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'face-models', 'model');
});

// Auto-merge similar people using single-linkage with avg-linkage floor.
// Single-linkage merges if ANY pair between two clusters is very similar (bridge faces).
// Avg-linkage floor prevents merging via a single spurious high-similarity pair.
ipcMain.handle('auto-merge-people', () => {
  const MERGE_BEST_THRESHOLD = 0.50;  // at least one pair must be this similar (w600k_r50 512-dim)
  const MERGE_AVG_FLOOR = 0.35;       // overall average must exceed this

  let totalMerged = 0;
  for (let pass = 0; pass < 10; pass++) {
    const allPeople = db.prepare('SELECT id, name FROM people').all();
    const clusters = [];
    for (const p of allPeople) {
      const rows = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(p.id);
      const descs = [];
      for (const r of rows) { try { descs.push(JSON.parse(r.descriptor)); } catch {} }
      if (descs.length > 0) clusters.push({ id: p.id, name: p.name, descs });
    }
    if (pass === 0) console.log(`[AutoMerge] Checking ${clusters.length} people (best-pair>=${MERGE_BEST_THRESHOLD}, avg-floor>=${MERGE_AVG_FLOOR})`);

    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    for (const c of clusters) parent.set(c.id, c.id);

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let totalSim = 0, pairs = 0, bestPair = -1;
        for (const di of clusters[i].descs) {
          for (const dj of clusters[j].descs) {
            const s = cosineSimilarity(di, dj);
            totalSim += s;
            pairs++;
            if (s > bestPair) bestPair = s;
          }
        }
        if (pairs > 0 && bestPair >= MERGE_BEST_THRESHOLD && totalSim / pairs >= MERGE_AVG_FLOOR) {
          if (pass === 0) console.log(`[AutoMerge] Merging #${clusters[j].id} (${clusters[j].name}) into #${clusters[i].id} (${clusters[i].name}) best=${bestPair.toFixed(3)} avg=${(totalSim/pairs).toFixed(3)}`);
          union(clusters[i].id, clusters[j].id);
        }
      }
    }

    const groups = new Map();
    for (const c of clusters) {
      const root = find(c.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(c.id);
    }
    let passMerged = 0;
    for (const [keepId, members] of groups) {
      if (members.length <= 1) continue;
      for (const memberId of members) {
        if (memberId === keepId) continue;
        db.prepare('UPDATE image_faces SET person_id = ? WHERE person_id = ?').run(keepId, memberId);
        db.prepare('DELETE FROM people WHERE id = ?').run(memberId);
        passMerged++;
      }
      // Recompute centroid from all face descriptors
      const faces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(keepId);
      if (faces.length > 0) {
        const dim = JSON.parse(faces[0].descriptor).length;
        const avg = new Array(dim).fill(0);
        let count = 0;
        for (const f of faces) {
          try { const d = JSON.parse(f.descriptor); for (let i = 0; i < dim; i++) avg[i] += d[i]; count++; } catch {}
        }
        if (count > 0) {
          for (let i = 0; i < dim; i++) avg[i] /= count;
          let norm = 0;
          for (let i = 0; i < dim; i++) norm += avg[i] * avg[i];
          norm = Math.sqrt(norm);
          if (norm > 0) for (let i = 0; i < dim; i++) avg[i] /= norm;
          db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(avg), keepId);
        }
      }
    }
    totalMerged += passMerged;
    console.log(`[AutoMerge] Pass ${pass + 1}: merged ${passMerged}`);
    if (passMerged === 0) break;
  }
  return { merged: totalMerged, remainingPeople: db.prepare('SELECT COUNT(*) as c FROM people').get().c };
});

// Reset all face data for a full rescan
ipcMain.handle('reset-face-data', () => {
  db.prepare('DELETE FROM image_faces').run();
  db.prepare('DELETE FROM people').run();
  return { success: true };
});

// ============================================================
// FEATURE 8: Map View / GPS Data
// ============================================================

/**
 * Extract GPS coordinates from an image file.
 * 1. Try EXIF data embedded in the image (exifr.gps is the most reliable method)
 * 2. Try exifr.parse with gps:true as fallback
 * 3. Look for Google Takeout sidecar JSON files (.supplemental-metadata.json)
 * Returns { lat, lng } or null.
 */
async function extractGpsFromFile(filePath) {
  // Method 1: exifr.gps() — purpose-built, handles all EXIF GPS variants
  try {
    const gps = await exifr.gps(filePath).catch(() => null);
    if (gps && gps.latitude && gps.longitude) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {}

  // Method 2: exifr.parse with gps flag
  try {
    const exif = await exifr.parse(filePath, { gps: true }).catch(() => null);
    if (exif && exif.latitude && exif.longitude) {
      return { lat: exif.latitude, lng: exif.longitude };
    }
  } catch {}

  // Method 3: Google Takeout sidecar JSON
  const fileName = path.basename(filePath);
  const dir = path.dirname(filePath);
  const sidecarCandidates = [
    path.join(dir, fileName + '.supplemental-metadata.json'),
    path.join(dir, fileName + '.json'),
  ];
  for (const sidecar of sidecarCandidates) {
    try {
      if (fs.existsSync(sidecar)) {
        const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
        const geo = meta.geoData || meta.geoDataExif;
        if (geo && geo.latitude && geo.latitude !== 0 && geo.longitude && geo.longitude !== 0) {
          return { lat: geo.latitude, lng: geo.longitude };
        }
      }
    } catch {}
  }

  return null;
}

ipcMain.handle('get-images-with-gps', () => {
  return db.prepare('SELECT full_path, thumb_path, gps_lat, gps_lng, name, date_taken FROM images WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL').all().map(row => ({
    ...row,
    original: toPlutoUrl(row.full_path),
    thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path)
  }));
});

ipcMain.handle('extract-gps-for-image', async (_, imagePath) => {
  try {
    const gps = await extractGpsFromFile(imagePath);
    if (gps) {
      db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ? WHERE full_path = ?').run(gps.lat, gps.lng, imagePath);
      return gps;
    }
    return null;
  } catch { return null; }
});

ipcMain.handle('extract-gps-bulk', async (event) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const images = db.prepare('SELECT id, full_path FROM images WHERE gps_lat IS NULL AND file_type IN (?, ?, ?, ?, ?, ?, ?, ?, ?)').all('jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'tiff', 'tif');
  let processed = 0;
  // Send initial progress so UI shows the total immediately
  if (win) win.webContents.send('import-progress', { current: 0, total: images.length, message: `Extracting GPS from ${images.length} images...`, done: false });
  for (const img of images) {
    try {
      const gps = await extractGpsFromFile(img.full_path);
      if (gps) {
        db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(gps.lat, gps.lng, img.id);
      } else {
        db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id);
      }
    } catch {
      db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id);
    }
    processed++;
    if (processed % 10 === 0 && win) {
      win.webContents.send('import-progress', { current: processed, total: images.length, message: 'Extracting GPS...', done: false });
    }
  }
  if (win) win.webContents.send('import-progress', { current: images.length, total: images.length, message: 'GPS extraction complete!', done: true });
  const count = db.prepare('SELECT COUNT(*) as c FROM images WHERE gps_lat IS NOT NULL').get().c;
  return { success: true, found: count };
});

// ============================================================
// FEATURE 9: Timeline / Date Grouping
// ============================================================
ipcMain.handle('get-timeline-groups', (_, params) => {
  const { albumId, folderId, search, sort } = params || {};
  let conditions = [];
  let queryParams = [];
  
  if (albumId) {
    // Need JOIN for albums
    let q = `SELECT i.full_path, i.thumb_path, i.date_taken, i.name, i.rating, i.color_label FROM images i JOIN album_images ai ON i.id = ai.image_id WHERE ai.album_id = ?`;
    queryParams.push(albumId);
    if (search) { const escaped = search.replace(/[%_\\]/g, '\\$&'); q += " AND i.name LIKE ? ESCAPE '\\'"; queryParams.push(`%${escaped}%`); }
    q += ' ORDER BY i.date_taken DESC';
    const rows = db.prepare(q).all(...queryParams);
    return groupByDate(rows);
  }
  
  let q = 'SELECT full_path, thumb_path, date_taken, name, rating, color_label FROM images';
  if (folderId) { conditions.push('folder_id = ?'); queryParams.push(folderId); }
  if (!albumId) conditions.push('id NOT IN (SELECT image_id FROM album_images)');
  if (search) { const escaped = search.replace(/[%_\\]/g, '\\$&'); conditions.push("name LIKE ? ESCAPE '\\'"); queryParams.push(`%${escaped}%`); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY date_taken DESC';
  
  const rows = db.prepare(q).all(...queryParams);
  return groupByDate(rows);
});

function groupByDate(rows) {
  const groups = {};
  for (const row of rows) {
    const date = row.date_taken ? new Date(row.date_taken) : new Date(0);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    if (!groups[key]) groups[key] = { key, label, items: [] };
    groups[key].items.push({
      rawPath: row.full_path,
      original: toPlutoUrl(row.full_path),
      thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path),
      rating: row.rating || 0,
      color_label: row.color_label || ''
    });
  }
  return Object.values(groups);
}

// ============================================================
// FEATURE 10: Batch Operations
// ============================================================
ipcMain.handle('batch-set-rating', (_, { paths, rating }) => {
  const stmt = db.prepare('UPDATE images SET rating = ? WHERE full_path = ?');
  db.transaction(() => {
    for (const p of paths) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      stmt.run(rating, clean);
    }
  })();
  return { success: true };
});

ipcMain.handle('batch-set-color-label', (_, { paths, color }) => {
  const stmt = db.prepare('UPDATE images SET color_label = ? WHERE full_path = ?');
  db.transaction(() => {
    for (const p of paths) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      stmt.run(color, clean);
    }
  })();
  return { success: true };
});

ipcMain.handle('batch-add-tag', (_, { paths, tag }) => {
  // Validate tag input
  if (!tag || typeof tag !== 'string') return { success: false, error: 'Missing tag' };
  const cleanTag = tag.trim().replace(/[\x00-\x1f]/g, '').slice(0, 100);
  if (!cleanTag) return { success: false, error: 'Invalid tag' };

  const findId = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE');
  const insert = db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)');
  db.transaction(() => {
    for (const p of paths) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      const img = findId.get(clean);
      if (img) insert.run(img.id, cleanTag);
    }
  })();
  return { success: true };
});

ipcMain.handle('batch-move-to-album', (_, { paths, albumId }) => {
  const findId = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE');
  const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)');
  db.transaction(() => {
    for (const p of paths) {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      const img = findId.get(clean);
      if (img) insert.run(albumId, img.id);
    }
  })();
  return { success: true };
});

ipcMain.handle('batch-export', async (_, { paths, options }) => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select export folder' });
  if (result.canceled) return { success: false };
  const outputDir = result.filePaths[0];
  let exported = 0;
  
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    try {
      const clean = path.normalize(decodeURIComponent(p.replace(/^pluto:\/\//i, '')));
      const baseName = path.basename(clean, path.extname(clean));
      const origExt = path.extname(clean).slice(1);
      const isVideo = /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(origExt);
      // Don't change extension for videos — format conversion only applies to images
      const ext = isVideo ? origExt : (options.format || origExt);
      let outName;
      if (options.renamePattern && options.renamePattern.trim()) {
        outName = options.renamePattern
          .replace(/\{name\}/g, baseName)
          .replace(/\{n\}/g, String(i + 1).padStart(4, '0'));
        // Strip path separators to prevent directory traversal via rename pattern
        outName = outName.replace(/[/\\]/g, '_');
      } else {
        // No rename pattern — use original name with _1, _2, etc. suffix when multiple files
        outName = paths.length > 1 ? `${baseName}_${i + 1}` : baseName;
      }
      // Prevent overwriting by appending a counter if file already exists
      let outPath = path.join(outputDir, `${outName}.${ext}`);
      // Security: ensure the output path is within the chosen output directory
      if (!path.resolve(outPath).startsWith(path.resolve(outputDir))) {
        console.warn(`[Export] Path traversal blocked: ${outPath}`);
        continue;
      }
      let counter = 1;
      while (fs.existsSync(outPath)) {
        outPath = path.join(outputDir, `${outName}_${counter}.${ext}`);
        counter++;
      }
      
      if (/\.(jpe?g|png|webp|gif)$/i.test(clean)) {
        let pipeline = sharp(clean, { failOn: 'none' }).rotate();
        if (options.maxWidth || options.maxHeight) {
          pipeline = pipeline.resize(options.maxWidth || null, options.maxHeight || null, { fit: 'inside', withoutEnlargement: true });
        }
        if (ext === 'jpg' || ext === 'jpeg') pipeline = pipeline.jpeg({ quality: options.quality || 90 });
        else if (ext === 'png') pipeline = pipeline.png();
        else if (ext === 'webp') pipeline = pipeline.webp({ quality: options.quality || 90 });
        await pipeline.toFile(outPath);
      } else {
        fs.copyFileSync(clean, outPath);
      }
      exported++;
    } catch (err) { console.error('Export error:', err); }
  }
  return { success: true, exported, outputDir };
});

// ============================================================
// FEATURE 11: Non-Destructive Editing
// ============================================================
ipcMain.handle('apply-image-edit', async (_, { imagePath, edits }) => {
  try {
    const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
    // Security: verify path is within a registered library folder or individually imported
    const resolved = path.resolve(clean);
    if (!isPathAllowed(resolved)) return { success: false, error: 'Path is not in a registered library folder' };
    const ext = path.extname(clean);
    const baseName = path.basename(clean, ext);
    const dir = path.dirname(clean);
    const outputPath = path.join(dir, `${baseName}_edited${ext}`);
    
    let pipeline = sharp(clean, { failOn: 'none' });
    
    // Rotation
    if (edits.rotate) pipeline = pipeline.rotate(edits.rotate);
    
    // Crop (left, top, width, height in pixels)
    if (edits.crop) {
      pipeline = pipeline.extract({
        left: Math.round(edits.crop.left),
        top: Math.round(edits.crop.top),
        width: Math.round(edits.crop.width),
        height: Math.round(edits.crop.height)
      });
    }
    
    // Brightness/Contrast/Saturation
    if (edits.brightness !== undefined || edits.contrast !== undefined || edits.saturation !== undefined) {
      const modulate = {};
      if (edits.brightness !== undefined) modulate.brightness = edits.brightness; // 0.5 to 2.0, 1.0 = normal
      if (edits.saturation !== undefined) modulate.saturation = edits.saturation;
      pipeline = pipeline.modulate(modulate);
    }
    
    // Contrast via linear transform
    if (edits.contrast !== undefined && edits.contrast !== 1.0) {
      pipeline = pipeline.linear(edits.contrast, -(128 * (edits.contrast - 1)));
    }
    
    // Sharpen
    if (edits.sharpen) pipeline = pipeline.sharpen();
    
    // Save
    if (ext === '.png') pipeline = pipeline.png();
    else if (ext === '.webp') pipeline = pipeline.webp({ quality: 90 });
    else pipeline = pipeline.jpeg({ quality: 92 });
    
    await pipeline.toFile(outputPath);
    
    // Save edit record
    let img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
    if (!img) {
      img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(imagePath);
    }
    if (!img) {
      // Create an image record so we have a valid FK target
      db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(clean, path.basename(clean), ext.replace('.', ''));
      img = db.prepare('SELECT id FROM images WHERE full_path = ?').get(clean);
    }
    if (img) {
      db.prepare('INSERT INTO image_edits (image_id, edit_data, output_path) VALUES (?, ?, ?)').run(img.id, JSON.stringify(edits), outputPath);
      // Also add the edited file to the images table so it appears in All Photos
      const origRow = db.prepare('SELECT folder_id FROM images WHERE id = ?').get(img.id);
      db.prepare('INSERT OR IGNORE INTO images (folder_id, name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?, ?)')
        .run(origRow?.folder_id || null, path.basename(outputPath), outputPath, ext.replace('.', ''), Date.now());
    } else {
      console.error('[apply-image-edit] Could not create image record for:', clean);
    }
    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save processed image data (e.g. after background removal in renderer)
ipcMain.handle('save-raw-edit', async (_, { originalPath, imageData, edits }) => {
  try {
    const clean = path.normalize(decodeURIComponent(originalPath.replace(/^pluto:\/\//i, '')));
    // Security: verify path is within a registered library folder or individually imported
    const resolved = path.resolve(clean);
    if (!isPathAllowed(resolved)) return { success: false, error: 'Path is not in a registered library folder' };
    const ext = path.extname(clean);
    const baseName = path.basename(clean, ext);
    const dir = path.dirname(clean);
    const format = ['png', 'jpeg', 'webp'].includes(edits.outputFormat) ? edits.outputFormat : 'png';
    const extension = format === 'jpeg' ? 'jpg' : format;
    const suffix = typeof edits.outputSuffix === 'string' && edits.outputSuffix.trim() ? edits.outputSuffix.trim().replace(/[^a-z0-9._-]/gi, '_') : '_edited';
    const outputPath = path.join(dir, `${baseName}${suffix}.${extension}`);

    let pipeline = sharp(Buffer.from(imageData), { failOn: 'none' });

    if (edits.rotate) pipeline = pipeline.rotate(edits.rotate);
    if (edits.crop) {
      pipeline = pipeline.extract({
        left: Math.round(edits.crop.left),
        top: Math.round(edits.crop.top),
        width: Math.round(edits.crop.width),
        height: Math.round(edits.crop.height)
      });
    }
    if (edits.brightness !== undefined || edits.saturation !== undefined) {
      const modulate = {};
      if (edits.brightness !== undefined) modulate.brightness = edits.brightness;
      if (edits.saturation !== undefined) modulate.saturation = edits.saturation;
      pipeline = pipeline.modulate(modulate);
    }
    if (edits.contrast !== undefined && edits.contrast !== 1.0) {
      pipeline = pipeline.linear(edits.contrast, -(128 * (edits.contrast - 1)));
    }
    if (edits.sharpen) pipeline = pipeline.sharpen();

    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: Math.max(1, Math.min(100, Number(edits.outputQuality) || 92)) });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: Math.max(1, Math.min(100, Number(edits.outputQuality) || 92)) });
    } else {
      pipeline = pipeline.png();
    }
    await pipeline.toFile(outputPath);

    // Save edit record
    let img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
    if (!img) {
      db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type) VALUES (?, ?, ?)').run(clean, path.basename(clean), extension);
      img = db.prepare('SELECT id FROM images WHERE full_path = ?').get(clean);
    }
    if (img) {
      db.prepare('INSERT INTO image_edits (image_id, edit_data, output_path) VALUES (?, ?, ?)').run(
        img.id, JSON.stringify({ ...edits, backgroundRemoved: true }), outputPath
      );
      // Also add the edited file to the images table so it appears in All Photos
      const origRow = db.prepare('SELECT folder_id FROM images WHERE id = ?').get(img.id);
      db.prepare('INSERT OR IGNORE INTO images (folder_id, name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?, ?)')
        .run(origRow?.folder_id || null, path.basename(outputPath), outputPath, extension, Date.now());
    }

    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto-enhance', async (_, imagePath) => {
  try {
    const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
    const resolved = path.resolve(clean);
    if (!isPathAllowed(resolved)) return { success: false, error: 'Path is not in a registered library folder' };
    const ext = path.extname(clean);
    const baseName = path.basename(clean, ext);
    const dir = path.dirname(clean);
    const outputPath = path.join(dir, `${baseName}_enhanced${ext}`);
    
    let pipeline = sharp(clean, { failOn: 'none' })
      .rotate()
      .modulate({ brightness: 1.05, saturation: 1.15 })
      .sharpen({ sigma: 1.0 })
      .linear(1.1, -(128 * 0.1)); // slight contrast boost
    
    if (ext === '.png') pipeline = pipeline.png();
    else if (ext === '.webp') pipeline = pipeline.webp({ quality: 92 });
    else pipeline = pipeline.jpeg({ quality: 92 });
    
    await pipeline.toFile(outputPath);
    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-image-dimensions', async (_, imagePath) => {
  try {
    const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
    if (!isPathAllowed(path.resolve(clean))) return null;
    const meta = await sharp(clean).metadata();
    return { width: meta.width, height: meta.height };
  } catch { return null; }
});

// ============================================================
// FEATURE 11b: Video Trimming
// ============================================================
function buildDerivedVideoPath(inputPath, suffix = 'edited') {
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);
  const outputExt = /^\.(mkv|avi)$/i.test(ext) ? '.mp4' : (ext || '.mp4');
  let outputPath = path.join(dir, `${baseName}_${suffix}${outputExt}`);
  let counter = 1;
  while (fs.existsSync(outputPath)) {
    outputPath = path.join(dir, `${baseName}_${suffix}_${counter}${outputExt}`);
    counter++;
  }
  return { outputPath, outputExt };
}

function runFfmpegCommand(args, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('FFmpeg is not available.'));
      return;
    }

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onProgress) {
        const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (match) {
          const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          onProgress(seconds);
        }
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

/**
 * Run vidstabdetect on a trimmed clip to produce a .trf transforms file.
 * Returns the path to the transforms file, or null if analysis fails.
 */
async function runVidstabDetect({ inputPath, startTime, duration, rotation = 0, wobbleRepair = 0 }) {
  const wobbleNorm = Math.max(0, Math.min(1, wobbleRepair / 100));
  const trfPath = path.join(os.tmpdir(), `pluto-vidstab-${Date.now()}-${Math.random().toString(16).slice(2)}.trf`);
  const shakiness = Math.max(1, Math.min(10, Math.round(6 + wobbleNorm * 4)));
  const accuracy = 15;
  const stepsize = Math.max(1, Math.min(6, Math.round(6 - wobbleNorm * 4)));

  const rotationFilters = [];
  if (rotation === 90) rotationFilters.push('transpose=1');
  else if (rotation === 180) rotationFilters.push('transpose=1', 'transpose=1');
  else if (rotation === 270) rotationFilters.push('transpose=2');

  const detectFilter = `vidstabdetect=shakiness=${shakiness}:accuracy=${accuracy}:stepsize=${stepsize}:result='${trfPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}':show=0`;
  const vfChain = [...rotationFilters, detectFilter].join(',');

  try {
    await runFfmpegCommand([
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputPath,
      '-vf', vfChain,
      '-f', 'null',
      '-',
    ]);
    if (fs.existsSync(trfPath)) return trfPath;
    return null;
  } catch {
    // vidstabdetect not available in this FFmpeg build — fall back gracefully
    try { fs.unlinkSync(trfPath); } catch { /* ignore */ }
    return null;
  }
}

async function probeVideoStreamInfo(inputPath) {
  try {
    await runFfmpegCommand(['-hide_banner', '-i', inputPath]);
    return { hasAudio: false, width: 1280, height: 720, duration: 0 };
  } catch (err) {
    const message = err?.message || '';
    const videoMatch = message.match(/Video:.*?(\d{2,5})x(\d{2,5})/i);
    const durationMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    return {
      hasAudio: /Audio:/i.test(message),
      width: videoMatch ? Number(videoMatch[1]) : 1280,
      height: videoMatch ? Number(videoMatch[2]) : 720,
      duration: durationMatch
        ? (Number(durationMatch[1]) * 3600) + (Number(durationMatch[2]) * 60) + Number(durationMatch[3])
        : 0,
    };
  }
}

function buildExportPresetConfig(exportPreset, referenceInfo = {}) {
  const even = (value, fallback) => {
    const numeric = Number(value) || fallback;
    const rounded = Math.max(2, Math.round(numeric));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  };

  if (exportPreset === '480p') return { width: 854, height: 480, label: '480p' };
  if (exportPreset === '720p') return { width: 1280, height: 720, label: '720p' };
  if (exportPreset === '1080p') return { width: 1920, height: 1080, label: '1080p' };

  return {
    width: even(referenceInfo.width, 1280),
    height: even(referenceInfo.height, 720),
    label: 'Source',
  };
}

function buildPreviewPresetConfig(referenceInfo = {}) {
  const even = (value, fallback) => {
    const numeric = Number(value) || fallback;
    const rounded = Math.max(2, Math.round(numeric));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  };
  const sourceWidth = Math.max(2, Number(referenceInfo.width) || 1280);
  const sourceHeight = Math.max(2, Number(referenceInfo.height) || 720);
  const dominant = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, 960 / dominant);
  return {
    width: even(sourceWidth * scale, 640),
    height: even(sourceHeight * scale, 360),
    label: 'Fast Preview',
  };
}

function getEffectiveClipFadeWindow({ duration, fadeIn = 0, fadeOut = 0, incomingTransition = 0, outgoingTransition = 0 }) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safeIncomingTransition = Math.max(0, Number(incomingTransition) || 0);
  const safeOutgoingTransition = Math.max(0, Number(outgoingTransition) || 0);

  // When there's a crossfade INTO this clip, skip the fade-in — the crossfade handles it.
  // Otherwise the fade-in filter would start from black after the crossfade already brought us in.
  const fadeInStart = safeIncomingTransition > 0.01 ? 0 : 0;
  const fadeInDuration = safeIncomingTransition > 0.01
    ? 0
    : Math.min(Math.max(0, Number(fadeIn) || 0), Math.max(0, safeDuration - 0.01));

  // When there's a crossfade OUT of this clip, skip the fade-out — the crossfade handles it.
  // Otherwise the fade-out filter would darken to black before xfade begins, causing an
  // unintended dip-to-black even when the user chose a dissolve or wipe transition.
  const fadeOutEnd = safeOutgoingTransition > 0.01 ? safeDuration : safeDuration;
  const fadeOutDuration = safeOutgoingTransition > 0.01
    ? 0
    : Math.min(Math.max(0, Number(fadeOut) || 0), Math.max(0, fadeOutEnd - 0.01));
  const fadeOutStart = Math.max(0, fadeOutEnd - fadeOutDuration);

  return {
    fadeInStart,
    fadeInDuration,
    fadeOutStart,
    fadeOutDuration,
  };
}

function buildClipVideoFilter({ width, height, duration, fadeIn = 0, fadeOut = 0, fadeInStart = 0, fadeOutStart = 0, rotation = 0, exposure = 0, contrast = 100, saturation = 100, temperature = 0, tint = 0, stabilize = 0, stabilizeMode = 'standard', wobbleRepair = 0, wobbleCrop = 0, clarity = 0, videoDenoise = 0, vidstabTransformsPath = '', letterbox = 0, vignette = 0, grain = 0, blur = 0, lutPath = '', chromakeyColor = '', chromakeyTolerance = 30 }) {
  const filters = [];
  const wobbleAmount = Math.max(0, Number(wobbleRepair) || 0);
  const baseWobbleCropAmount = Math.min(25, Math.max(0, Number(wobbleCrop) || 0));
  const rollingShutterSafe = stabilizeMode === 'rolling';
  const effectiveStabilize = Math.max(0, Number(stabilize) || 0);
  if (rotation === 90) filters.push('transpose=1');
  else if (rotation === 180) filters.push('transpose=1', 'transpose=1');
  else if (rotation === 270) filters.push('transpose=2');

  // Jello repair: use vidstabtransform for real geometric correction when available.
  // vidstab performs actual motion-compensated warping — it corrects the per-scanline
  // timing offsets that cause rolling shutter jello, unlike hqdn3d which only smooths
  // pixel values. When vidstab is active it also handles stabilization, so skip deshake.
  const wobbleNorm = wobbleAmount / 100;
  const hasVidstab = wobbleAmount > 0.01 && !!vidstabTransformsPath;
  if (hasVidstab) {
    const smoothing = Math.max(10, Math.round(10 + wobbleNorm * 40));
    const zoom = Math.max(0, Math.round(2 + wobbleNorm * 10));
    const trfEscaped = vidstabTransformsPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
    filters.push(`vidstabtransform=input='${trfEscaped}':smoothing=${smoothing}:zoom=${zoom}:optalgo=gauss:interpol=bicubic:crop=black:relative=1`);
  } else if (effectiveStabilize > 0.01) {
    // Fallback: deshake for basic camera stabilization when vidstab is not used
    const radius = Math.max(16, Math.round((16 + (effectiveStabilize / 100) * 48) / 16) * 16);
    const blocksize = Math.max(4, Math.min(12, Math.round(4 + (effectiveStabilize / 100) * 6)));
    filters.push(`deshake=rx=${radius}:ry=${radius}:edge=${rollingShutterSafe ? 'blank' : 'mirror'}:blocksize=${blocksize}`);
  }

  // Video denoise via hqdn3d — used for the user's denoise slider and as a light
  // residual smoother when vidstab is active (to clean up any remaining micro-jitter).
  const userDenoise = Math.max(0, Number(videoDenoise) || 0);
  const needsDenoise = userDenoise > 0.01 || (wobbleAmount > 0.01 && !hasVidstab);
  if (needsDenoise || (hasVidstab && userDenoise > 0.01)) {
    const denoiseNorm = userDenoise / 100;
    const residualWobble = hasVidstab ? 0 : wobbleNorm;
    const lumaSpatial = (1.0 + denoiseNorm * 5.5 + residualWobble * 0.8).toFixed(2);
    const chromaSpatial = (0.6 + denoiseNorm * 3.5 + residualWobble * 0.5).toFixed(2);
    const lumaTemporal = (1.5 + denoiseNorm * 6 + residualWobble * 18).toFixed(2);
    const chromaTemporal = (1.0 + denoiseNorm * 4 + residualWobble * 13).toFixed(2);
    filters.push(`hqdn3d=${lumaSpatial}:${chromaSpatial}:${lumaTemporal}:${chromaTemporal}`);
  }
  const wobbleCropAmount = Math.min(
    25,
    Math.max(baseWobbleCropAmount, wobbleAmount > 0.01 ? Math.round(2 + wobbleNorm * 6) : 0),
  );
  filters.push(
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  );
  if (wobbleCropAmount > 0.01) {
    const cropRatio = Math.max(0.72, 1 - (wobbleCropAmount / 100));
    const cropWidth = Math.max(2, Math.round((width * cropRatio) / 2) * 2);
    const cropHeight = Math.max(2, Math.round((height * cropRatio) / 2) * 2);
    filters.push(`crop=${cropWidth}:${cropHeight}:(iw-${cropWidth})/2:(ih-${cropHeight})/2`);
    filters.push(`scale=${width}:${height}:flags=lanczos`);
    filters.push('setsar=1');
  }
  filters.push('fps=30', 'format=yuv420p', 'setsar=1');
  if (Math.abs(exposure) > 0.01 || Math.abs(contrast - 100) > 0.01 || Math.abs(saturation - 100) > 0.01) {
    const brightness = (exposure / 100 * 0.35).toFixed(3);
    const contrastValue = (contrast / 100).toFixed(3);
    const saturationValue = (saturation / 100).toFixed(3);
    filters.push(`eq=brightness=${brightness}:contrast=${contrastValue}:saturation=${saturationValue}`);
  }
  if (Math.abs(temperature) > 0.01 || Math.abs(tint) > 0.01) {
    const warmth = Math.max(-0.4, Math.min(0.4, temperature / 100 * 0.35)).toFixed(3);
    const greenShift = Math.max(-0.3, Math.min(0.3, tint / 100 * -0.25)).toFixed(3);
    filters.push(`colorbalance=rs=${warmth}:rm=${warmth}:rh=${warmth}:bs=${(-Number(warmth)).toFixed(3)}:bm=${(-Number(warmth)).toFixed(3)}:bh=${(-Number(warmth)).toFixed(3)}:gs=${greenShift}:gm=${greenShift}:gh=${greenShift}`);
  }
  if (clarity > 0.01) {
    const sharpenAmount = (clarity / 100 * 2.2).toFixed(2);
    filters.push(`unsharp=5:5:${sharpenAmount}:5:5:0.0`);
  }
  // --- Cinematic Effects ---

  // Chromakey (green screen removal) — needs alpha channel to mark transparent pixels
  if (chromakeyColor && /^#?[0-9a-fA-F]{6}$/.test(chromakeyColor.replace('#', ''))) {
    const rawHex = chromakeyColor.replace('#', '');
    const similarity = (Math.max(1, Math.min(100, chromakeyTolerance)) / 100 * 0.45 + 0.05).toFixed(3);
    const blend = (Number(similarity) * 0.4).toFixed(3);
    filters.push('format=yuva420p');
    filters.push(`chromakey=color=0x${rawHex}:similarity=${similarity}:blend=${blend}`);
    filters.push('format=yuv420p');
  }

  // LUT 3D color grading — .cube file support
  if (lutPath) {
    const safePath = lutPath.replace(/\\/g, '/').replace(/:/g, '\\\\:').replace(/ /g, '\\ ');
    filters.push(`lut3d='${safePath}'`);
  }

  // Gaussian blur (defocus / dream effect)
  if (blur > 0.01) {
    const sigma = (blur / 100 * 20).toFixed(2);
    filters.push(`gblur=sigma=${sigma}`);
  }

  // Vignette — darkened edges for cinematic focus
  if (vignette > 0.01) {
    const angle = (vignette / 100 * 0.6 + 0.15).toFixed(3);
    filters.push(`vignette=a=${angle}`);
  }

  // Film grain — additive noise for organic texture
  if (grain > 0.01) {
    const strength = Math.round(grain / 100 * 45 + 3);
    filters.push(`noise=alls=${strength}:allf=t+u`);
  }

  // Letterbox — cinematic aspect ratio bars
  if (letterbox > 0.01) {
    const barRatio = letterbox / 100;
    // Map 0→source, 50→1.85:1, 100→2.39:1 anamorphic
    const targetAspect = 1.78 + barRatio * 0.61; // 16:9 → 2.39
    const currentAspect = width / height;
    if (targetAspect > currentAspect + 0.01) {
      const visibleHeight = Math.max(2, Math.round((width / targetAspect) / 2) * 2);
      const barHeight = Math.round((height - visibleHeight) / 2);
      if (barHeight > 0) {
        filters.push(`drawbox=x=0:y=0:w=iw:h=${barHeight}:c=black:t=fill`);
        filters.push(`drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:c=black:t=fill`);
      }
    }
  }

  if (fadeIn > 0.01) filters.push(`fade=t=in:st=${Math.max(0, fadeInStart).toFixed(3)}:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0.01 && duration > fadeOutStart) {
    filters.push(`fade=t=out:st=${Math.max(0, fadeOutStart).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }
  return filters.join(',');
}

function buildClipAudioFilter({ duration, fadeIn = 0, fadeOut = 0, fadeInStart = 0, fadeOutStart = 0, volume = 1, muted = false, audioDenoise = 0, speechFocus = false, loudnessNormalize = false, peakLimiter = false }) {
  const filters = [];
  filters.push('aresample=48000');
  filters.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
  filters.push(`volume=${muted ? 0 : Math.max(0, Number(volume) || 1).toFixed(3)}`);
  if (!muted && audioDenoise > 0.01) {
    const noiseReduction = (6 + (audioDenoise / 100) * 24).toFixed(1);
    filters.push(`afftdn=nr=${noiseReduction}:nf=-28:tn=1`);
  }
  if (!muted && speechFocus) {
    filters.push('highpass=f=110');
    filters.push('lowpass=f=7800');
    filters.push('acompressor=threshold=-18dB:ratio=2.2:attack=5:release=80:makeup=1.6');
  }
  if (!muted && loudnessNormalize) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }
  if (!muted && peakLimiter) {
    filters.push('alimiter=limit=0.95:level=disabled');
  }
  if (fadeIn > 0.01) filters.push(`afade=t=in:st=${Math.max(0, fadeInStart).toFixed(3)}:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0.01 && duration > fadeOutStart) {
    filters.push(`afade=t=out:st=${Math.max(0, fadeOutStart).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }
  return filters.join(',');
}

function clampCrossfadeDuration(value, leftDuration, rightDuration) {
  const cap = Math.max(0, Math.min(Number(leftDuration) || 0, Number(rightDuration) || 0) - 0.05);
  return Math.min(Math.max(0, Number(value) || 0), cap);
}

function sanitizeTransitionType(value) {
  const allowed = new Set(['fade', 'fadeblack', 'fadewhite', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown', 'circlecrop', 'circleopen', 'circleclose', 'vertopen', 'vertclose', 'horzopen', 'horzclose', 'dissolve', 'pixelize', 'radial', 'zoomin']);
  return allowed.has(value) ? value : 'fade';
}

function sanitizeAudioTransitionCurve(value) {
  const allowed = new Set(['tri', 'qsin', 'hsin', 'exp']);
  return allowed.has(value) ? value : 'tri';
}

function sanitizeClipRotation(value) {
  const numeric = Number(value) || 0;
  const snapped = Math.round(numeric / 90) * 90;
  const normalized = ((snapped % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}

function sanitizePercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function sanitizeRange(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function generateVideoThumbnailData(inputPath, timeSec) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('FFmpeg is not available.'));
      return;
    }

    const args = [
      '-y',
      '-ss', String(Math.max(0, Number(timeSec) || 0)),
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', 'scale=320:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`);
    });
  });
}

function insertGeneratedVideo(outputPath, outputExt, sourcePath) {
  const name = path.basename(outputPath);
  const fileType = outputExt.replace('.', '');
  const srcRow = db.prepare('SELECT folder_id FROM images WHERE full_path = ?').get(sourcePath);
  const folderId = srcRow ? srcRow.folder_id : null;
  db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type, folder_id) VALUES (?, ?, ?, ?)').run(outputPath, name, fileType, folderId);
}

ipcMain.handle('trim-video', async (_, { inputPath, startTime, endTime }) => {
  try {
    const clean = path.normalize(decodeURIComponent(inputPath.replace(/^pluto:\/\//i, '')));
    if (!isPathAllowed(path.resolve(clean))) return { success: false, error: 'Access denied' };
    if (!fs.existsSync(clean)) return { success: false, error: 'File not found.' };

    const { outputPath, outputExt } = buildDerivedVideoPath(clean, 'trimmed');

    const duration = endTime - startTime;
    if (duration <= 0) return { success: false, error: 'Invalid time range.' };

    return new Promise((resolve) => {
      ffmpeg(clean)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(['-c', 'copy', '-avoid_negative_ts', 'make_zero'])
        .output(outputPath)
        .on('end', () => {
          insertGeneratedVideo(outputPath, outputExt, clean);
          resolve({ success: true, outputPath });
        })
        .on('error', (err) => {
          console.error('[trim-video] ffmpeg error:', err.message);
          // Fallback: try re-encoding if stream copy fails
          ffmpeg(clean)
            .setStartTime(startTime)
            .setDuration(duration)
            .outputOptions(['-avoid_negative_ts', 'make_zero'])
            .output(outputPath)
            .on('end', () => {
              insertGeneratedVideo(outputPath, outputExt, clean);
              resolve({ success: true, outputPath });
            })
            .on('error', (err2) => {
              console.error('[trim-video] ffmpeg re-encode error:', err2.message);
              resolve({ success: false, error: err2.message });
            })
            .run();
        })
        .run();
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-video-clip-thumbnail', async (_, { inputPath, timeSec = 0 }) => {
  try {
    const clean = path.normalize(decodeURIComponent(String(inputPath || '').replace(/^pluto:\/\//i, '')));
    const resolved = path.resolve(clean);
    if (!isPathAllowed(resolved)) return { success: false, error: 'Access denied' };
    if (!fs.existsSync(clean)) return { success: false, error: 'File not found.' };
    const thumbnail = await generateVideoThumbnailData(clean, timeSec);
    return { success: true, thumbnail };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('compose-video', async (_, { clips, audioOverlays = [], textOverlays = [], watermarkOverlays = [], exportPreset = 'source', previewMode = false }) => {
  try {
    if (!Array.isArray(clips) || clips.length === 0) return { success: false, error: 'No clips were added to the timeline.' };

    const normalizedClips = [];
    const normalizedAudioOverlays = [];
    const normalizedTextOverlays = [];
    const normalizedWatermarkOverlays = [];
    let referenceStreamInfo = null;

    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      const inputPath = path.normalize(decodeURIComponent(String(clip.inputPath || '').replace(/^pluto:\/\//i, '')));
      const resolved = path.resolve(inputPath);
      const startTime = Number(clip.startTime || 0);
      const endTime = Number(clip.endTime || 0);
      const duration = endTime - startTime;
      if (!inputPath || !fs.existsSync(inputPath)) throw new Error(`Clip ${index + 1} is missing its source video.`);
      if (!isPathAllowed(resolved)) throw new Error(`Clip ${index + 1} is outside the allowed library.`);
      if (!Number.isFinite(duration) || duration <= 0.05) throw new Error(`Clip ${index + 1} has an invalid trim range.`);
      const streamInfo = await probeVideoStreamInfo(inputPath);
      if (!referenceStreamInfo) referenceStreamInfo = streamInfo;
      normalizedClips.push({
        inputPath,
        resolved,
        startTime,
        endTime,
        duration,
        fadeIn: Math.max(0, Number(clip.fadeIn || 0)),
        fadeOut: Math.max(0, Number(clip.fadeOut || 0)),
        transitionDuration: Math.max(0, Number(clip.transitionDuration || 0)),
        transitionType: sanitizeTransitionType(clip.transitionType),
        audioTransitionCurve: sanitizeAudioTransitionCurve(clip.audioTransitionCurve),
        volume: Math.max(0, Number(clip.volume ?? 1)),
        muted: !!clip.muted,
        exposure: sanitizeRange(clip.exposure, -40, 40, 0),
        contrast: sanitizeRange(clip.contrast, 50, 150, 100),
        saturation: sanitizeRange(clip.saturation, 0, 200, 100),
        temperature: sanitizeRange(clip.temperature, -100, 100, 0),
        tint: sanitizeRange(clip.tint, -100, 100, 0),
        stabilize: sanitizePercent(clip.stabilize),
        stabilizeMode: clip.stabilizeMode === 'rolling' ? 'rolling' : 'standard',
        wobbleRepair: sanitizePercent(clip.wobbleRepair),
        wobbleCrop: sanitizeRange(clip.wobbleCrop, 0, 25, 0),
        clarity: sanitizePercent(clip.clarity),
        videoDenoise: sanitizePercent(clip.videoDenoise),
        audioDenoise: sanitizePercent(clip.audioDenoise),
        speechFocus: !!clip.speechFocus,
        loudnessNormalize: !!clip.loudnessNormalize,
        peakLimiter: !!clip.peakLimiter,
        rotation: sanitizeClipRotation(clip.rotation),
        letterbox: sanitizePercent(clip.letterbox),
        vignette: sanitizePercent(clip.vignette),
        grain: sanitizePercent(clip.grain),
        blur: sanitizePercent(clip.blur),
        lutPath: String(clip.lutPath || ''),
        chromakeyColor: String(clip.chromakeyColor || ''),
        chromakeyTolerance: sanitizePercent(clip.chromakeyTolerance || 30),
        streamInfo,
      });
    }

    const transitionDurations = normalizedClips.slice(0, -1).map((clip, index) =>
      clampCrossfadeDuration(clip.transitionDuration, clip.duration, normalizedClips[index + 1].duration)
    );
    const projectDuration = normalizedClips.reduce((total, clip, index) => {
      if (index === 0) return clip.duration;
      return total + clip.duration - (transitionDurations[index - 1] || 0);
    }, 0);

    if (Array.isArray(audioOverlays)) {
      for (let index = 0; index < audioOverlays.length; index++) {
        const overlay = audioOverlays[index];
        const inputPath = path.normalize(decodeURIComponent(String(overlay.inputPath || '').replace(/^pluto:\/\//i, '')));
        const resolved = path.resolve(inputPath);
        if (!inputPath || !fs.existsSync(inputPath)) throw new Error(`Audio overlay ${index + 1} is missing its source file.`);
        if (!isPathAllowed(resolved)) throw new Error(`Audio overlay ${index + 1} is outside the allowed library.`);

        const streamInfo = await probeVideoStreamInfo(inputPath);
        if (!streamInfo.hasAudio) throw new Error(`Audio overlay ${index + 1} does not contain an audio stream.`);

        const trimStart = Math.max(0, Number(overlay.trimStart || 0));
        const sourceDuration = Math.max(0, Number(overlay.sourceDuration || streamInfo.duration || 0));
        const requestedTrimEnd = Math.max(trimStart + 0.05, Number(overlay.trimEnd || sourceDuration || 0));
        const trimEnd = sourceDuration > 0 ? Math.min(requestedTrimEnd, sourceDuration) : requestedTrimEnd;
        const timelineStart = Math.max(0, Number(overlay.timelineStart || 0));
        const duration = trimEnd - trimStart;

        if (!Number.isFinite(duration) || duration <= 0.05) throw new Error(`Audio overlay ${index + 1} has an invalid trim range.`);
        if (timelineStart >= projectDuration) continue;

        normalizedAudioOverlays.push({
          inputPath,
          timelineStart,
          trimStart,
          duration: Math.min(duration, Math.max(0.05, projectDuration - timelineStart)),
          volume: Math.max(0, Number(overlay.volume ?? 1)),
          muted: !!overlay.muted,
        });
      }
    }

    if (Array.isArray(watermarkOverlays)) {
      const allowedPositions = new Set([
        'top-left', 'top-center', 'top-right',
        'center-left', 'center', 'center-right',
        'bottom-left', 'bottom-center', 'bottom-right',
        'custom', 'tile',
      ]);

      for (let index = 0; index < watermarkOverlays.length; index++) {
        const overlay = watermarkOverlays[index] || {};
        const mode = overlay.mode === 'image' ? 'image' : 'text';
        const timelineStart = Math.max(0, Number(overlay.timelineStart || 0));
        const duration = Math.max(0.05, Number(overlay.duration || 0));
        if (!Number.isFinite(duration) || timelineStart >= projectDuration) continue;
        const effectiveDuration = Math.min(duration, Math.max(0.05, projectDuration - timelineStart));
        const position = allowedPositions.has(overlay.position) ? overlay.position : 'bottom-right';

        if (mode === 'text') {
          const text = String(overlay.text || '').trim();
          if (!text) continue;
          normalizedWatermarkOverlays.push({
            mode,
            text,
            timelineStart,
            duration: effectiveDuration,
            fadeIn: Math.max(0, Number(overlay.fadeIn || 0)),
            fadeOut: Math.max(0, Number(overlay.fadeOut || 0)),
            fontFamily: String(overlay.fontFamily || 'sans-serif'),
            fontSize: Math.max(8, Math.min(200, Number(overlay.fontSize || 24))),
            fontWeight: String(overlay.fontWeight || 'bold'),
            color: String(overlay.color || '#ffffff'),
            opacity: Math.max(0.05, Math.min(1, Number(overlay.opacity ?? 0.3))),
            position,
            customX: Math.max(0, Math.min(100, Number(overlay.customX || 90))),
            customY: Math.max(0, Math.min(100, Number(overlay.customY || 90))),
            margin: Math.max(0, Math.min(200, Number(overlay.margin || 20))),
            shadow: !!overlay.shadow,
            shadowColor: String(overlay.shadowColor || '#000000'),
            tileSpacing: Math.max(50, Math.min(600, Number(overlay.tileSpacing || 200))),
            tileAngle: Math.max(-90, Math.min(90, Number(overlay.tileAngle || -30))),
          });
          continue;
        }

        const imagePath = path.normalize(decodeURIComponent(String(overlay.imagePath || '').replace(/^pluto:\/\//i, '')));
        if (!imagePath || !fs.existsSync(imagePath)) {
          throw new Error(`Watermark overlay ${index + 1} image is missing.`);
        }

        normalizedWatermarkOverlays.push({
          mode,
          imagePath,
          timelineStart,
          duration: effectiveDuration,
          fadeIn: Math.max(0, Number(overlay.fadeIn || 0)),
          fadeOut: Math.max(0, Number(overlay.fadeOut || 0)),
          opacity: Math.max(0.05, Math.min(1, Number(overlay.opacity ?? 0.3))),
          position,
          customX: Math.max(0, Math.min(100, Number(overlay.customX || 90))),
          customY: Math.max(0, Math.min(100, Number(overlay.customY || 90))),
          margin: Math.max(0, Math.min(200, Number(overlay.margin || 20))),
          scale: Math.max(5, Math.min(400, Number(overlay.scale || 100))),
          rotation: Math.max(-180, Math.min(180, Number(overlay.rotation || 0))),
        });
      }
    }

    if (Array.isArray(textOverlays)) {
      for (let index = 0; index < textOverlays.length; index++) {
        const overlay = textOverlays[index] || {};
        const text = String(overlay.text || '').trim();
        if (!text) continue;
        const timelineStart = Math.max(0, Number(overlay.timelineStart || 0));
        const duration = Math.max(0.05, Number(overlay.duration || 0));
        if (!Number.isFinite(duration) || timelineStart >= projectDuration) continue;
        const effectiveDuration = Math.min(duration, Math.max(0.05, projectDuration - timelineStart));
        normalizedTextOverlays.push({
          text,
          timelineStart,
          duration: effectiveDuration,
          fadeIn: Math.max(0, Number(overlay.fadeIn || 0)),
          fadeOut: Math.max(0, Number(overlay.fadeOut || 0)),
          fontFamily: String(overlay.fontFamily || 'sans-serif'),
          fontSize: Math.max(8, Math.min(200, Number(overlay.fontSize || 48))),
          fontWeight: String(overlay.fontWeight || 'bold'),
          color: String(overlay.color || '#ffffff'),
          backgroundColor: String(overlay.backgroundColor || ''),
          positionX: Math.max(0, Math.min(100, Number(overlay.positionX || 50))),
          positionY: Math.max(0, Math.min(100, Number(overlay.positionY || 85))),
        });
      }
    }

    const presetConfig = previewMode
      ? buildPreviewPresetConfig(referenceStreamInfo || {})
      : buildExportPresetConfig(exportPreset, referenceStreamInfo || {});
    // Scale factor for font sizes / margins when preview renders at lower resolution
    const sourceWidth = Math.max(2, Number(referenceStreamInfo?.width) || 1280);
    const overlayScale = presetConfig.width / sourceWidth;
    const videoEncodePreset = previewMode ? 'ultrafast' : 'veryfast';
    const videoEncodeCrf = previewMode ? '23' : '20';
    const audioBitrate = previewMode ? '128k' : '192k';

    const previewOutputPath = path.join(os.tmpdir(), `pluto-video-preview-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);
    const outputPath = previewMode
      ? previewOutputPath
      : buildDerivedVideoPath(normalizedClips[0].inputPath, 'edit').outputPath;
    const outputExt = previewMode ? '.mp4' : path.extname(outputPath);

    // Pre-pass: run vidstabdetect on clips that need jello repair.
    // This produces a .trf transforms file per clip that vidstabtransform reads
    // during the main compose pass for real geometric rolling-shutter correction.
    const vidstabTransformsPaths = new Array(normalizedClips.length).fill('');
    for (let index = 0; index < normalizedClips.length; index++) {
      const clip = normalizedClips[index];
      if (clip.wobbleRepair > 0.01) {
        const trfPath = await runVidstabDetect({
          inputPath: clip.inputPath,
          startTime: clip.startTime,
          duration: clip.duration,
          rotation: clip.rotation,
          wobbleRepair: clip.wobbleRepair,
        });
        if (trfPath) vidstabTransformsPaths[index] = trfPath;
      }
    }

    const inputArgs = [];
    const filterGraph = [];
    const preparedVideoLabels = [];
    const preparedAudioLabels = [];
    let inputIndex = 0;

    for (let index = 0; index < normalizedClips.length; index++) {
      const clip = normalizedClips[index];
      const incomingTransition = index > 0 ? transitionDurations[index - 1] : 0;
      const outgoingTransition = transitionDurations[index] || 0;
      const fadeWindow = getEffectiveClipFadeWindow({
        duration: clip.duration,
        fadeIn: Math.min(clip.fadeIn, Math.max(0, clip.duration / 2 - 0.01)),
        fadeOut: Math.min(clip.fadeOut, Math.max(0, clip.duration / 2 - 0.01)),
        incomingTransition,
        outgoingTransition,
      });

      inputArgs.push('-ss', String(clip.startTime), '-t', String(clip.duration), '-i', clip.inputPath);
      const videoInputLabel = `[${inputIndex}:v:0]`;
      let audioInputLabel = `[${inputIndex}:a:0]`;
      inputIndex += 1;

      if (!clip.streamInfo.hasAudio) {
        inputArgs.push('-f', 'lavfi', '-t', String(clip.duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
        audioInputLabel = `[${inputIndex}:a:0]`;
        inputIndex += 1;
      }

      const videoFilter = buildClipVideoFilter({
        width: presetConfig.width,
        height: presetConfig.height,
        duration: clip.duration,
        fadeIn: fadeWindow.fadeInDuration,
        fadeOut: fadeWindow.fadeOutDuration,
        fadeInStart: fadeWindow.fadeInStart,
        fadeOutStart: fadeWindow.fadeOutStart,
        exposure: clip.exposure,
        contrast: clip.contrast,
        saturation: clip.saturation,
        temperature: clip.temperature,
        tint: clip.tint,
        stabilize: clip.stabilize,
        stabilizeMode: clip.stabilizeMode,
        wobbleRepair: clip.wobbleRepair,
        wobbleCrop: clip.wobbleCrop,
        clarity: clip.clarity,
        videoDenoise: clip.videoDenoise,
        rotation: clip.rotation,
        vidstabTransformsPath: vidstabTransformsPaths[index] || '',
        letterbox: clip.letterbox,
        vignette: clip.vignette,
        grain: clip.grain,
        blur: clip.blur,
        lutPath: clip.lutPath,
        chromakeyColor: clip.chromakeyColor,
        chromakeyTolerance: clip.chromakeyTolerance,
      });
      const audioFilter = buildClipAudioFilter({
        duration: clip.duration,
        fadeIn: fadeWindow.fadeInDuration,
        fadeOut: fadeWindow.fadeOutDuration,
        fadeInStart: fadeWindow.fadeInStart,
        fadeOutStart: fadeWindow.fadeOutStart,
        volume: Math.min(2, clip.volume),
        muted: clip.muted,
        audioDenoise: clip.audioDenoise,
        speechFocus: clip.speechFocus,
        loudnessNormalize: clip.loudnessNormalize,
        peakLimiter: clip.peakLimiter,
      });

      const preparedVideoLabel = `[v${index}]`;
      const preparedAudioLabel = `[a${index}]`;
      filterGraph.push(`${videoInputLabel}${videoFilter},settb=AVTB,setpts=PTS-STARTPTS${preparedVideoLabel}`);
      filterGraph.push(`${audioInputLabel}${audioFilter},asetpts=PTS-STARTPTS${preparedAudioLabel}`);
      preparedVideoLabels.push(preparedVideoLabel);
      preparedAudioLabels.push(preparedAudioLabel);
    }

    let finalVideoLabel = preparedVideoLabels[0];
    let finalAudioLabel = preparedAudioLabels[0];

    if (normalizedClips.length > 1) {
      let accumulatedDuration = normalizedClips[0].duration;

      for (let index = 0; index < normalizedClips.length - 1; index++) {
        const transitionDuration = transitionDurations[index];
        const isFinalJoin = index === normalizedClips.length - 2;
        const videoOutput = isFinalJoin ? '[vout]' : `[vjoin${index + 1}]`;
        const audioOutput = isFinalJoin ? '[aout]' : `[ajoin${index + 1}]`;
        const nextVideoLabel = preparedVideoLabels[index + 1];
        const nextAudioLabel = preparedAudioLabels[index + 1];

        if (transitionDuration > 0.01) {
          const offset = Math.max(0, accumulatedDuration - transitionDuration);
          filterGraph.push(`${finalVideoLabel}${nextVideoLabel}xfade=transition=${normalizedClips[index].transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${videoOutput}`);
          filterGraph.push(`${finalAudioLabel}${nextAudioLabel}acrossfade=d=${transitionDuration.toFixed(3)}:c1=${normalizedClips[index].audioTransitionCurve}:c2=${normalizedClips[index].audioTransitionCurve}${audioOutput}`);
          accumulatedDuration += normalizedClips[index + 1].duration - transitionDuration;
        } else {
          filterGraph.push(`${finalVideoLabel}${finalAudioLabel}${nextVideoLabel}${nextAudioLabel}concat=n=2:v=1:a=1${videoOutput}${audioOutput}`);
          accumulatedDuration += normalizedClips[index + 1].duration;
        }

        finalVideoLabel = videoOutput;
        finalAudioLabel = audioOutput;
      }
    }

    let mappedVideoLabel = normalizedClips.length > 1 ? finalVideoLabel : preparedVideoLabels[0];
    let mappedAudioLabel = normalizedClips.length > 1 ? finalAudioLabel : preparedAudioLabels[0];

    if (normalizedAudioOverlays.length) {
      const overlayLabels = [];

      for (let index = 0; index < normalizedAudioOverlays.length; index++) {
        const overlay = normalizedAudioOverlays[index];
        inputArgs.push('-i', overlay.inputPath);
        const overlayInputLabel = `[${inputIndex}:a:0]`;
        inputIndex += 1;

        const delayMs = Math.max(0, Math.round(overlay.timelineStart * 1000));
        const trimmedLabel = `[aotrim${index}]`;
        const overlayOutputLabel = `[ao${index}]`;

        // Trim the source audio to the selected range and normalize format
        filterGraph.push(
          `${overlayInputLabel}atrim=start=${overlay.trimStart.toFixed(3)}:end=${(overlay.trimStart + overlay.duration).toFixed(3)},asetpts=PTS-STARTPTS,${buildClipAudioFilter({ duration: overlay.duration, volume: Math.min(2, overlay.volume), muted: overlay.muted })}${trimmedLabel}`
        );

        if (delayMs > 0) {
          // Generate silence for the delay period, then concatenate with trimmed audio
          const silenceLabel = `[aosilence${index}]`;
          const delaySec = (delayMs / 1000).toFixed(3);
          inputArgs.push('-f', 'lavfi', '-t', delaySec, '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
          const silenceInputLabel = `[${inputIndex}:a:0]`;
          inputIndex += 1;

          filterGraph.push(`${silenceInputLabel}aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${silenceLabel}`);
          filterGraph.push(`${silenceLabel}${trimmedLabel}concat=n=2:v=0:a=1,atrim=end=${projectDuration.toFixed(3)},asetpts=PTS-STARTPTS${overlayOutputLabel}`);
        } else {
          // No delay — just trim to project duration
          filterGraph.push(`${trimmedLabel}atrim=end=${projectDuration.toFixed(3)},asetpts=PTS-STARTPTS${overlayOutputLabel}`);
        }

        overlayLabels.push(overlayOutputLabel);
      }

      const mixedAudioLabel = '[amixout]';
      filterGraph.push(`${[mappedAudioLabel, ...overlayLabels].join('')}amix=inputs=${overlayLabels.length + 1}:normalize=0:dropout_transition=0${mixedAudioLabel}`);
      mappedAudioLabel = mixedAudioLabel;
    }

    if (normalizedWatermarkOverlays.length) {
      const escapeDrawtext = (str) => String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\\\'")
        .replace(/:/g, '\\:')
        .replace(/;/g, '\\;')
        .replace(/%/g, '%%');
      const toFfmpegColor = (color, alpha = 1) => {
        const raw = String(color || '#ffffff').trim();
        const hex = raw.startsWith('#') ? raw.slice(1) : raw;
        const valid = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : 'ffffff';
        return `0x${valid}@${Math.max(0, Math.min(1, Number(alpha) || 1)).toFixed(3)}`;
      };
      const textPos = (wm) => {
        const m = Math.round(wm.margin * overlayScale);
        if (wm.position === 'custom') {
          return {
            x: `(w*${(wm.customX / 100).toFixed(4)}-text_w/2)`,
            y: `(h*${(wm.customY / 100).toFixed(4)}-text_h/2)`,
          };
        }
        const map = {
          'top-left': { x: `${m}`, y: `${m}` },
          'top-center': { x: '(w-text_w)/2', y: `${m}` },
          'top-right': { x: `w-text_w-${m}`, y: `${m}` },
          'center-left': { x: `${m}`, y: '(h-text_h)/2' },
          center: { x: '(w-text_w)/2', y: '(h-text_h)/2' },
          'center-right': { x: `w-text_w-${m}`, y: '(h-text_h)/2' },
          'bottom-left': { x: `${m}`, y: `h-text_h-${m}` },
          'bottom-center': { x: '(w-text_w)/2', y: `h-text_h-${m}` },
          'bottom-right': { x: `w-text_w-${m}`, y: `h-text_h-${m}` },
        };
        return map[wm.position] || map['bottom-right'];
      };
      const imagePos = (wm) => {
        const m = Math.round(wm.margin * overlayScale);
        if (wm.position === 'custom') {
          return {
            x: `(main_w*${(wm.customX / 100).toFixed(4)}-overlay_w/2)`,
            y: `(main_h*${(wm.customY / 100).toFixed(4)}-overlay_h/2)`,
          };
        }
        const map = {
          'top-left': { x: `${m}`, y: `${m}` },
          'top-center': { x: '(main_w-overlay_w)/2', y: `${m}` },
          'top-right': { x: `main_w-overlay_w-${m}`, y: `${m}` },
          'center-left': { x: `${m}`, y: '(main_h-overlay_h)/2' },
          center: { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' },
          'center-right': { x: `main_w-overlay_w-${m}`, y: '(main_h-overlay_h)/2' },
          'bottom-left': { x: `${m}`, y: `main_h-overlay_h-${m}` },
          'bottom-center': { x: '(main_w-overlay_w)/2', y: `main_h-overlay_h-${m}` },
          'bottom-right': { x: `main_w-overlay_w-${m}`, y: `main_h-overlay_h-${m}` },
        };
        return map[wm.position] || map['bottom-right'];
      };
      const fontFileMap = {
        'Inter': { regular: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' },
        'Roboto': { regular: 'Roboto-Regular.ttf', bold: 'Roboto-Bold.ttf' },
        'Montserrat': { regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf' },
        'Poppins': { regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf' },
        'Oswald': { regular: 'Oswald-Regular.ttf', bold: 'Oswald-Bold.ttf' },
        'Playfair Display': { regular: 'Playfair-Display-Regular.ttf', bold: 'Playfair-Display-Bold.ttf' },
        'Bebas Neue': { regular: 'Bebas-Neue-Regular.ttf', bold: 'Bebas-Neue-Regular.ttf' },
        'Raleway': { regular: 'Raleway-Regular.ttf', bold: 'Raleway-Bold.ttf' },
        'Lato': { regular: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf' },
        'Source Code Pro': { regular: 'Source-Code-Pro-Regular.ttf', bold: 'Source-Code-Pro-Bold.ttf' },
      };
      const resolveFontFile = (fontFamily, fontWeight) => {
        const primary = (fontFamily || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
        const entry = fontFileMap[primary];
        if (!entry) return null;
        const isBold = fontWeight === 'bold' || Number(fontWeight) >= 600;
        const fileName = isBold ? entry.bold : entry.regular;
        const fontPath = getAssetPath(path.join('resources', 'fonts', fileName));
        return fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      };
      const textAlphaExpr = (wm) => {
        const start = wm.timelineStart;
        const end = wm.timelineStart + wm.duration;
        const fadeIn = Math.max(0, Math.min(wm.fadeIn || 0, wm.duration / 2));
        const fadeOut = Math.max(0, Math.min(wm.fadeOut || 0, wm.duration / 2));
        const base = Math.max(0.05, Math.min(1, wm.opacity || 1));
        if (fadeIn > 0 && fadeOut > 0) {
          const outStart = end - fadeOut;
          return `${base.toFixed(4)}*if(lt(t-${start.toFixed(3)}\\,${fadeIn.toFixed(3)})\\,(t-${start.toFixed(3)})/${fadeIn.toFixed(3)}\\,if(gt(t\\,${outStart.toFixed(3)})\\,(${end.toFixed(3)}-t)/${fadeOut.toFixed(3)}\\,1))`;
        }
        if (fadeIn > 0) {
          return `${base.toFixed(4)}*if(lt(t-${start.toFixed(3)}\\,${fadeIn.toFixed(3)})\\,(t-${start.toFixed(3)})/${fadeIn.toFixed(3)}\\,1)`;
        }
        if (fadeOut > 0) {
          const outStart = end - fadeOut;
          return `${base.toFixed(4)}*if(gt(t\\,${outStart.toFixed(3)})\\,(${end.toFixed(3)}-t)/${fadeOut.toFixed(3)}\\,1)`;
        }
        return base.toFixed(4);
      };

      for (let index = 0; index < normalizedWatermarkOverlays.length; index++) {
        const wm = normalizedWatermarkOverlays[index];
        const start = wm.timelineStart.toFixed(3);
        const end = (wm.timelineStart + wm.duration).toFixed(3);
        const enableExpr = `between(t\\,${start}\\,${end})`;

        if (wm.mode === 'text') {
          const pos = textPos(wm);
          const scaledFontSize = Math.max(4, Math.round(wm.fontSize * overlayScale));
          const parts = [
            `text='${escapeDrawtext(wm.text)}'`,
            `fontsize=${scaledFontSize}`,
            `fontcolor=${toFfmpegColor(wm.color, 1)}`,
            `alpha='${textAlphaExpr(wm)}'`,
            `x=${pos.x}`,
            `y=${pos.y}`,
            `enable='${enableExpr}'`,
          ];
          if (wm.shadow) {
            parts.push(`shadowcolor=${toFfmpegColor(wm.shadowColor, 0.55)}`);
            parts.push(`shadowx=${Math.max(1, Math.round(2 * overlayScale))}`);
            parts.push(`shadowy=${Math.max(1, Math.round(2 * overlayScale))}`);
          }
          const resolvedFontPath = resolveFontFile(wm.fontFamily, wm.fontWeight);
          if (resolvedFontPath) {
            parts.push(`fontfile='${resolvedFontPath}'`);
          } else {
            const primaryFont = (wm.fontFamily || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
            if (primaryFont && /^[a-zA-Z0-9 _-]+$/.test(primaryFont)) {
              parts.push(`font='${primaryFont}'`);
            }
          }

          if (wm.position === 'tile') {
            const rawSpacing = Math.max(50, Math.min(600, Math.round((wm.tileSpacing || 200) * overlayScale)));
            const maxTiles = previewMode ? 36 : 400;
            let spacing = rawSpacing;
            let cols = Math.max(3, Math.ceil((presetConfig.width * 2) / spacing));
            let rows = Math.max(3, Math.ceil((presetConfig.height * 2) / spacing));
            while (cols * rows > maxTiles && spacing < presetConfig.width) {
              spacing = Math.round(spacing * 1.3);
              cols = Math.max(3, Math.ceil((presetConfig.width * 2) / spacing));
              rows = Math.max(3, Math.ceil((presetConfig.height * 2) / spacing));
            }
            const angle = Math.max(-90, Math.min(90, Number(wm.tileAngle || -30)));
            const angleRad = (Math.PI / 180) * angle;
            const halfW = Math.round(presetConfig.width * 0.5);
            const halfH = Math.round(presetConfig.height * 0.5);
            let tiledLabelIn = mappedVideoLabel;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                const tileOut = `[vwm${index}_t_${r}_${c}]`;
                const baseX = -halfW + (c * spacing);
                const baseY = -halfH + (r * spacing);
                const tileX = Math.round(baseX * Math.cos(angleRad) - baseY * Math.sin(angleRad)) + halfW;
                const tileY = Math.round(baseX * Math.sin(angleRad) + baseY * Math.cos(angleRad)) + halfH;
                const tileParts = [...parts.filter((p) => !p.startsWith('x=') && !p.startsWith('y=')), `x=${tileX}`, `y=${tileY}`];
                filterGraph.push(`${tiledLabelIn}drawtext=${tileParts.join(':')}${tileOut}`);
                tiledLabelIn = tileOut;
              }
            }
            mappedVideoLabel = tiledLabelIn;
          } else {
            const textOut = `[vwm${index}]`;
            filterGraph.push(`${mappedVideoLabel}drawtext=${parts.join(':')}${textOut}`);
            mappedVideoLabel = textOut;
          }
          continue;
        }

        inputArgs.push('-loop', '1', '-i', wm.imagePath);
        const wmInput = `[${inputIndex}:v:0]`;
        inputIndex += 1;
        const rad = ((Math.PI / 180) * wm.rotation).toFixed(6);
        const preOverlayLabel = `[wmimg${index}]`;
        const scalePct = Math.max(5, Math.min(400, Number(wm.scale) || 100));
        const targetWidth = Math.round(presetConfig.width * scalePct / 100);
        const rotateFilter = Math.abs(Number(wm.rotation || 0)) > 0.01
          ? `,rotate=${rad}:ow=rotw(iw):oh=roth(ih):c=none`
          : '';

        // Build fade expression for image watermark opacity
        const imgFadeIn = Math.max(0, Math.min(wm.fadeIn || 0, wm.duration / 2));
        const imgFadeOut = Math.max(0, Math.min(wm.fadeOut || 0, wm.duration / 2));
        const imgBase = Math.max(0.05, Math.min(1, wm.opacity || 0.3));
        const imgStart = wm.timelineStart;
        const imgEnd = wm.timelineStart + wm.duration;
        if (imgFadeIn > 0 || imgFadeOut > 0) {
          // Use a time-based alpha expression via LUT or colorchannelmixer won't work — need overlay with alpha
          // We'll use format=rgba, then apply colorchannelmixer for base opacity
          // Fade is handled via the overlay enable + ffmpeg fade filter on the overlay input
          const fadeInFilter = imgFadeIn > 0 ? `,fade=t=in:st=${imgStart.toFixed(3)}:d=${imgFadeIn.toFixed(3)}:alpha=1` : '';
          const fadeOutFilter = imgFadeOut > 0 ? `,fade=t=out:st=${(imgEnd - imgFadeOut).toFixed(3)}:d=${imgFadeOut.toFixed(3)}:alpha=1` : '';
          filterGraph.push(`${wmInput}format=rgba,scale=${targetWidth}:-1${rotateFilter},colorchannelmixer=aa=${imgBase.toFixed(3)}${fadeInFilter}${fadeOutFilter}${preOverlayLabel}`);
        } else {
          filterGraph.push(`${wmInput}format=rgba,scale=${targetWidth}:-1${rotateFilter},colorchannelmixer=aa=${imgBase.toFixed(3)}${preOverlayLabel}`);
        }

        const pos = imagePos(wm.position === 'tile' ? { ...wm, position: 'center' } : wm);
        const imageOut = `[vwm${index}]`;
        filterGraph.push(`${mappedVideoLabel}${preOverlayLabel}overlay=${pos.x}:${pos.y}:enable='${enableExpr}':shortest=1${imageOut}`);
        mappedVideoLabel = imageOut;
      }
    }

    if (normalizedTextOverlays.length) {
      const escapeDrawtext = (str) => String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\\\'")
        .replace(/:/g, '\\:')
        .replace(/;/g, '\\;')
        .replace(/%/g, '%%');
      const toFfmpegColor = (color, alpha = 1) => {
        const raw = String(color || '#ffffff').trim();
        const hex = raw.startsWith('#') ? raw.slice(1) : raw;
        const valid = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : 'ffffff';
        return `0x${valid}@${Math.max(0, Math.min(1, Number(alpha) || 1)).toFixed(3)}`;
      };

      for (let index = 0; index < normalizedTextOverlays.length; index++) {
        const t = normalizedTextOverlays[index];
        const start = t.timelineStart.toFixed(3);
        const end = (t.timelineStart + t.duration).toFixed(3);
        const enableExpr = `between(t\\,${start}\\,${end})`;

        const base = 1;
        const fadeIn = Math.max(0, Math.min(t.fadeIn || 0, t.duration / 2));
        const fadeOut = Math.max(0, Math.min(t.fadeOut || 0, t.duration / 2));
        let alphaExpr;
        if (fadeIn > 0 && fadeOut > 0) {
          const outStart = (t.timelineStart + t.duration - fadeOut).toFixed(3);
          alphaExpr = `${base}*if(lt(t-${start}\\,${fadeIn.toFixed(3)})\\,(t-${start})/${fadeIn.toFixed(3)}\\,if(gt(t\\,${outStart})\\,(${end}-t)/${fadeOut.toFixed(3)}\\,1))`;
        } else if (fadeIn > 0) {
          alphaExpr = `${base}*if(lt(t-${start}\\,${fadeIn.toFixed(3)})\\,(t-${start})/${fadeIn.toFixed(3)}\\,1)`;
        } else if (fadeOut > 0) {
          const outStart = (t.timelineStart + t.duration - fadeOut).toFixed(3);
          alphaExpr = `${base}*if(gt(t\\,${outStart})\\,(${end}-t)/${fadeOut.toFixed(3)}\\,1)`;
        } else {
          alphaExpr = `${base}`;
        }

        const posX = `(w*${(t.positionX / 100).toFixed(4)}-text_w/2)`;
        const posY = `(h*${(t.positionY / 100).toFixed(4)}-text_h/2)`;

        const scaledFontSize = Math.max(4, Math.round(t.fontSize * overlayScale));
        const parts = [
          `text='${escapeDrawtext(t.text)}'`,
          `fontsize=${scaledFontSize}`,
          `fontcolor=${toFfmpegColor(t.color, 1)}`,
          `alpha='${alphaExpr}'`,
          `x=${posX}`,
          `y=${posY}`,
          `enable='${enableExpr}'`,
        ];

        if (t.backgroundColor) {
          parts.push(`box=1`);
          parts.push(`boxcolor=${toFfmpegColor(t.backgroundColor, 0.7)}`);
          parts.push(`boxborderw=${Math.max(1, Math.round(8 * overlayScale))}`);
        }

        const resolvedFontPath = resolveFontFile(t.fontFamily, t.fontWeight);
        if (resolvedFontPath) {
          parts.push(`fontfile='${resolvedFontPath}'`);
        } else {
          const primaryFont = (t.fontFamily || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
          if (primaryFont && /^[a-zA-Z0-9 _-]+$/.test(primaryFont)) {
            parts.push(`font='${primaryFont}'`);
          }
        }

        const textOut = `[vtxt${index}]`;
        filterGraph.push(`${mappedVideoLabel}drawtext=${parts.join(':')}${textOut}`);
        mappedVideoLabel = textOut;
      }
    }

    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const onProgress = (seconds) => {
      if (win && !win.isDestroyed()) {
        const pct = projectDuration > 0 ? Math.min(100, Math.round((seconds / projectDuration) * 100)) : 0;
        win.webContents.send('video-export-progress', { percent: pct, seconds, total: projectDuration });
      }
    };

    await runFfmpegCommand([
      '-y',
      ...inputArgs,
      '-filter_complex', filterGraph.join(';'),
      '-map', mappedVideoLabel,
      '-map', mappedAudioLabel,
      '-r', previewMode ? '30' : String(Math.min(60, Math.max(24, Math.round(Number(referenceStreamInfo?.r_frame_rate?.split?.('/')[0]) / Number(referenceStreamInfo?.r_frame_rate?.split?.('/')[1] || 1)) || 30))),
      '-c:v', 'libx264', '-preset', videoEncodePreset, '-crf', videoEncodeCrf,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', audioBitrate,
      '-ar', '48000',
      '-movflags', '+faststart',
      outputPath,
    ], { onProgress });

    // Clean up vidstab temporary .trf files
    for (const trfPath of vidstabTransformsPaths) {
      if (trfPath) try { fs.unlinkSync(trfPath); } catch { /* ignore */ }
    }

    if (previewMode) {
      const resolvedPreview = path.resolve(outputPath);
      _ephemeralAllowedPaths.add(process.platform === 'win32' ? resolvedPreview.toLowerCase() : resolvedPreview);
    } else {
      insertGeneratedVideo(outputPath, outputExt, normalizedClips[0].inputPath);
    }
    return { success: true, outputPath };
  } catch (err) {
    console.error('[compose-video] error:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// FEATURE 12: Duplicate Detection
// ============================================================
function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Number.MAX_SAFE_INTEGER
  let diff = 0
  for (let i = 0; i < hashA.length; i++) diff += hashA[i] === hashB[i] ? 0 : 1
  return diff
}

function duplicateKeepScore(item) {
  const resolution = (item.width || 0) * (item.height || 0)
  const fileSize = item.file_size || 0
  const lower = item.full_path.toLowerCase()
  let score = resolution + fileSize / 1024
  if (/(edited|export|copy|duplicate|thumb|preview|small|temp)/.test(lower)) score *= 0.82
  if (/(dcim|camera|img_|dsc_|photo)/.test(lower)) score *= 1.04
  return score
}

async function computeExactFileHash(fullPath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(fullPath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function computeExactQuickHash(fullPath, fileSize) {
  const chunkSize = 64 * 1024
  const handle = await fs.promises.open(fullPath, 'r')
  try {
    const hash = crypto.createHash('sha1')
    hash.update(String(fileSize || 0))

    if (!fileSize || fileSize <= chunkSize * 2) {
      const data = await handle.readFile()
      hash.update(data)
      return hash.digest('hex')
    }

    const head = Buffer.alloc(chunkSize)
    const tail = Buffer.alloc(chunkSize)
    await handle.read(head, 0, chunkSize, 0)
    await handle.read(tail, 0, chunkSize, Math.max(0, fileSize - chunkSize))
    hash.update(head)
    hash.update(tail)
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

async function computePerceptualHash(fullPath) {
  const meta = await sharp(fullPath, { failOn: 'none' }).metadata()
  const { data } = await sharp(fullPath, { failOn: 'none' })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let hash = ''
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      hash += data[row * 9 + col] < data[row * 9 + col + 1] ? '1' : '0'
    }
  }

  return {
    phash: hash,
    width: meta.width || null,
    height: meta.height || null,
  }
}

function isExactDuplicatePair(left, right) {
  return !!left.exact_hash && left.exact_hash === right.exact_hash
}

function isNearDuplicatePair(left, right) {
  if (!left.phash || !right.phash) return false
  const aspectLeft = left.width && left.height ? left.width / Math.max(1, left.height) : null
  const aspectRight = right.width && right.height ? right.width / Math.max(1, right.height) : null
  if (aspectLeft !== null && aspectRight !== null && Math.abs(aspectLeft - aspectRight) > 0.12) return false
  const sizeRatio = Math.max(left.file_size || 1, right.file_size || 1) / Math.max(1, Math.min(left.file_size || 1, right.file_size || 1))
  if (sizeRatio > 3.5) return false
  return hammingDistance(left.phash, right.phash) <= 6
}

ipcMain.handle('find-duplicates', async (_, params = {}) => {
  const scanMode = ['exact', 'near', 'both'].includes(params?.scanMode) ? params.scanMode : 'both'
  const shouldScanExact = scanMode === 'exact' || scanMode === 'both'
  const shouldScanNear = scanMode === 'near' || scanMode === 'both'
  const supportedNearTypes = /^(jpg|jpeg|png|webp|gif|heic|heif|tiff?|bmp)$/
  const progressLabel = scanMode === 'exact' ? 'exact duplicates' : scanMode === 'near' ? 'near duplicates' : 'exact and near duplicates'
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const images = db.prepare('SELECT i.id, i.full_path, i.file_type, i.thumb_path, i.date_taken FROM images i').all();
  let processed = 0;
  const itemsById = new Map()
  const saveImageHashes = db.prepare('INSERT OR REPLACE INTO image_hashes (image_id, phash, exact_hash, exact_quick_hash, file_size, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const sendProgress = (current, total, message) => {
    if (win) win.webContents.send('import-progress', { current, total, message, done: false })
  }
  const persistItemHashes = (item) => {
    saveImageHashes.run(item.id, item.phash, item.exact_hash, item.exact_quick_hash, item.file_size, item.width, item.height)
  }

  // Pre-load existing hashes so duplicate groups include previously-scanned images
  const existingHashes = db.prepare('SELECT ih.image_id, ih.phash, ih.exact_hash, ih.exact_quick_hash, ih.file_size, ih.width, ih.height, i.full_path, i.thumb_path, i.file_type, i.date_taken FROM image_hashes ih JOIN images i ON i.id = ih.image_id').all();
  for (const h of existingHashes) {
    itemsById.set(h.image_id, {
      id: h.image_id,
      full_path: h.full_path,
      thumb_path: h.thumb_path,
      file_type: h.file_type,
      date_taken: h.date_taken,
      phash: h.phash,
      exact_hash: h.exact_hash,
      exact_quick_hash: h.exact_quick_hash,
      file_size: h.file_size,
      width: h.width,
      height: h.height,
    })
  }

  const imagesNeedingMetadata = images.filter((img) => {
    const existing = itemsById.get(img.id)
    const needsNear = shouldScanNear && supportedNearTypes.test(img.file_type) && !existing?.phash
    return needsNear || !existing?.file_size
  })

  // Stage 1: gather cheap metadata and any missing near-match hashes.
  sendProgress(0, imagesNeedingMetadata.length, `Starting ${progressLabel} scan...`)
  
  for (const img of imagesNeedingMetadata) {
    try {
      const current = itemsById.get(img.id) || {
        id: img.id,
        full_path: img.full_path,
        thumb_path: img.thumb_path,
        file_type: img.file_type,
        date_taken: img.date_taken,
        phash: null,
        exact_hash: null,
        exact_quick_hash: null,
        file_size: null,
        width: null,
        height: null,
      }
      const stats = fs.statSync(img.full_path);
      const fileSize = stats.size;
      let pHash = current.phash || null;
      let exactHash = current.exact_hash || null;
      let exactQuickHash = current.exact_quick_hash || null;
      let width = current.width || null;
      let height = current.height || null;

      if (current.file_size !== null && current.file_size !== fileSize) {
        pHash = null
        exactHash = null
        exactQuickHash = null
        width = null
        height = null
      }

      if (shouldScanNear && supportedNearTypes.test(img.file_type) && !pHash) {
        try {
          const perceptual = await computePerceptualHash(img.full_path)
          pHash = perceptual.phash
          width = perceptual.width
          height = perceptual.height
        } catch {}
      }

      const updated = {
        ...current,
        file_size: fileSize,
        phash: pHash,
        exact_hash: exactHash,
        exact_quick_hash: exactQuickHash,
        width,
        height,
      }
      persistItemHashes(updated)
      itemsById.set(img.id, updated)
    } catch {}
    
    processed++;
    if (processed % 10 === 0 && win) {
      sendProgress(processed, imagesNeedingMetadata.length, `Scanning library metadata for ${progressLabel}...`)
    }
  }

  if (shouldScanExact) {
    const items = Array.from(itemsById.values())
    const sizeBuckets = new Map()
    for (const item of items) {
      if (!item.file_size || item.file_size < 1) continue
      if (!sizeBuckets.has(item.file_size)) sizeBuckets.set(item.file_size, [])
      sizeBuckets.get(item.file_size).push(item)
    }

    const exactCandidates = Array.from(sizeBuckets.values()).filter((bucket) => bucket.length > 1)
    const quickHashTargets = exactCandidates.flat().filter((item) => !item.exact_quick_hash)
    let quickProcessed = 0
    sendProgress(0, quickHashTargets.length, 'Scanning exact-match candidates...')
    for (const item of quickHashTargets) {
      try {
        item.exact_quick_hash = await computeExactQuickHash(item.full_path, item.file_size)
        persistItemHashes(item)
      } catch {}
      quickProcessed++
      if (quickProcessed % 25 === 0 && win) {
        sendProgress(quickProcessed, quickHashTargets.length, 'Filtering exact-match candidates by quick fingerprint...')
      }
    }

    const fullHashTargets = []
    for (const sizeBucket of exactCandidates) {
      const quickBuckets = new Map()
      for (const item of sizeBucket) {
        if (!item.exact_quick_hash) continue
        if (!quickBuckets.has(item.exact_quick_hash)) quickBuckets.set(item.exact_quick_hash, [])
        quickBuckets.get(item.exact_quick_hash).push(item)
      }
      for (const quickBucket of quickBuckets.values()) {
        if (quickBucket.length < 2) continue
        for (const item of quickBucket) {
          if (!item.exact_hash) fullHashTargets.push(item)
        }
      }
    }

    let exactProcessed = 0
    sendProgress(0, fullHashTargets.length, 'Confirming exact matches...')
    for (const item of fullHashTargets) {
      try {
        item.exact_hash = await computeExactFileHash(item.full_path)
        persistItemHashes(item)
      } catch {}
      exactProcessed++
      if (exactProcessed % 10 === 0 && win) {
        sendProgress(exactProcessed, fullHashTargets.length, 'Confirming exact-match candidates...')
      }
    }
  }
  
  if (win) win.webContents.send('import-progress', { current: 1, total: 1, message: 'Duplicate scan complete!', done: true });
  
  // Return groups with 2+ items, filtering out dismissed pairs
  const dismissedSet = new Set();
  try {
    const dismissed = db.prepare('SELECT image_id_1, image_id_2 FROM dismissed_duplicates').all();
    for (const d of dismissed) {
      dismissedSet.add(`${Math.min(d.image_id_1, d.image_id_2)}-${Math.max(d.image_id_1, d.image_id_2)}`);
    }
  } catch {}

  const items = Array.from(itemsById.values())
  const parent = new Map(items.map((item) => [item.id, item.id]))
  const groupKinds = new Map()
  const ensureGroupKinds = (id) => {
    if (!groupKinds.has(id)) groupKinds.set(id, { exact: false, similar: false })
    return groupKinds.get(id)
  }
  const find = (id) => {
    let value = id
    while (parent.get(value) !== value) {
      parent.set(value, parent.get(parent.get(value)))
      value = parent.get(value)
    }
    return value
  }
  const union = (leftId, rightId, kind = 'similar') => {
    const leftRoot = find(leftId)
    const rightRoot = find(rightId)
    const leftKinds = ensureGroupKinds(leftRoot)
    if (leftRoot === rightRoot) {
      if (kind === 'exact') leftKinds.exact = true
      if (kind === 'similar') leftKinds.similar = true
      return
    }
    const rightKinds = ensureGroupKinds(rightRoot)
    parent.set(rightRoot, leftRoot)
    leftKinds.exact = leftKinds.exact || rightKinds.exact || kind === 'exact'
    leftKinds.similar = leftKinds.similar || rightKinds.similar || kind === 'similar'
    groupKinds.set(leftRoot, leftKinds)
    groupKinds.delete(rightRoot)
  }

  const getGroupKind = (id) => {
    const kinds = ensureGroupKinds(find(id))
    if (kinds.exact && kinds.similar) return 'mixed'
    if (kinds.exact) return 'exact'
    return 'similar'
  }

  if (shouldScanExact) {
    const exactBuckets = new Map()
    for (const item of items) {
      if (!item.exact_hash) continue
      const key = item.exact_hash
      if (!exactBuckets.has(key)) exactBuckets.set(key, [])
      exactBuckets.get(key).push(item)
    }
    for (const bucket of exactBuckets.values()) {
      if (bucket.length < 2) continue
      for (let i = 1; i < bucket.length; i++) union(bucket[0].id, bucket[i].id, 'exact')
    }
  }

  if (shouldScanNear) {
    const bandBuckets = new Map()
    for (const item of items) {
      if (!item.phash) continue
      for (let offset = 0; offset < item.phash.length; offset += 8) {
        const key = `${offset}:${item.phash.slice(offset, offset + 8)}`
        if (!bandBuckets.has(key)) bandBuckets.set(key, [])
        bandBuckets.get(key).push(item)
      }
    }

    const comparedPairs = new Set()
    for (const bucket of bandBuckets.values()) {
      if (bucket.length < 2) continue
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const pairKey = `${Math.min(bucket[i].id, bucket[j].id)}-${Math.max(bucket[i].id, bucket[j].id)}`
          if (comparedPairs.has(pairKey)) continue
          comparedPairs.add(pairKey)
          if (shouldScanExact && isExactDuplicatePair(bucket[i], bucket[j])) continue
          if (isNearDuplicatePair(bucket[i], bucket[j])) union(bucket[i].id, bucket[j].id, 'similar')
        }
      }
    }
  }

  const grouped = new Map()
  for (const item of items) {
    const root = find(item.id)
    if (!grouped.has(root)) grouped.set(root, [])
    grouped.get(root).push(item)
  }

  const duplicateGroups = Array.from(grouped.entries())
    .map(([rootId, group]) => ({
      rootId,
      kind: getGroupKind(rootId),
      items: group,
    }))
    .filter((group) => group.items.length > 1)
    .map((group) => {
      if (dismissedSet.size === 0) return group
      const filteredItems = group.items.filter((item, index) => group.items.some((other, otherIndex) => {
        if (index === otherIndex) return false
        const key = `${Math.min(item.id, other.id)}-${Math.max(item.id, other.id)}`
        return !dismissedSet.has(key)
      }))
      return { ...group, items: filteredItems }
    })
    .filter((group) => group.items.length > 1)
    .map((group) => {
      const recommended = [...group.items].sort((left, right) => duplicateKeepScore(right) - duplicateKeepScore(left))[0]
      return {
        kind: group.kind,
        recommendedKeepId: recommended?.id || null,
        items: group.items
          .map((item) => ({
            ...item,
            keepScore: duplicateKeepScore(item),
            original: toPlutoUrl(item.full_path),
            thumb: item.thumb_path ? toPlutoUrl(item.thumb_path) : toPlutoUrl(item.full_path),
          }))
          .sort((left, right) => right.keepScore - left.keepScore),
      }
    })
    .sort((left, right) => right.items.length - left.items.length)
  
  return { success: true, groups: duplicateGroups, totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.items.length - 1, 0), totalScanned: items.length };
});

ipcMain.handle('delete-duplicate', async (_, params) => {
  const imagePath = typeof params === 'string' ? params : params?.imagePath;
  const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
  const resolved = path.resolve(clean);
  if (!isPathAllowed(resolved)) return { success: false, error: 'Path is not in a registered library folder' };
  try {
    if (fs.existsSync(clean)) await shell.trashItem(clean);
    // Clean up related records
    const img = db.prepare('SELECT id FROM images WHERE full_path = ? COLLATE NOCASE').get(clean);
    if (img) {
      db.prepare('DELETE FROM image_edits WHERE image_id = ?').run(img.id);
      db.prepare('DELETE FROM image_tags WHERE image_id = ?').run(img.id);
      db.prepare('DELETE FROM album_images WHERE image_id = ?').run(img.id);
      db.prepare('DELETE FROM image_faces WHERE image_id = ?').run(img.id);
    }
    db.prepare('DELETE FROM images WHERE full_path = ? COLLATE NOCASE').run(clean);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dismiss-duplicate-group', (_, { imageIds }) => {
  // Store all pairs in the group as dismissed
  const insert = db.prepare('INSERT OR IGNORE INTO dismissed_duplicates (image_id_1, image_id_2) VALUES (?, ?)');
  const runAll = db.transaction((ids) => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        insert.run(Math.min(ids[i], ids[j]), Math.max(ids[i], ids[j]));
      }
    }
  });
  runAll(imageIds);
  return { success: true };
});

// ============================================================
// FEATURE 13: Import from Cloud Services
// ============================================================
ipcMain.handle('import-google-takeout', async (event, args) => {
  // --- License limit check ---
  const maxImages = licenseManager.checkLimit('maxImages');
  if (maxImages !== Infinity) {
    const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
    if (imageCount >= maxImages) {
      return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxImages} images. Upgrade to import more.` };
    }
  }

  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  let takeoutDir = args?.takeoutPath;
  if (!takeoutDir) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Google Takeout folder' });
    if (result.canceled) return { success: false };
    takeoutDir = result.filePaths[0];
  }
  let imported = 0;
  let matched = 0;
  
  // Recursively find all media files
  const walkDir = (dir, visited) => {
    if (!visited) visited = new Set();
    const entries = [];
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.isSymbolicLink()) continue;
          const resolved = path.resolve(fullPath);
          if (visited.has(resolved)) continue;
          visited.add(resolved);
          entries.push(...walkDir(fullPath, visited));
        } else if (/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i.test(item.name)) {
          entries.push(fullPath);
        }
      }
    } catch {}
    return entries;
  };
  
  const mediaFiles = walkDir(takeoutDir);
  const insert = db.prepare('INSERT OR IGNORE INTO images (name, full_path, file_type, date_taken, gps_lat, gps_lng) VALUES (?, ?, ?, ?, ?, ?)');
  
  for (const filePath of mediaFiles) {
    try {
      const name = path.basename(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      let dateTaken = null;
      let gpsLat = null;
      let gpsLng = null;
      
      // Check for companion .json sidecar (Google Takeout format)
      const jsonSidecar = filePath + '.supplemental-metadata.json';
      const jsonSidecar2 = filePath + '.json';
      const jsonSidecar3 = filePath.replace(/\.[^.]+$/, '.json');
      
      for (const sidecar of [jsonSidecar, jsonSidecar2, jsonSidecar3]) {
        if (!fs.existsSync(sidecar)) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
          if (!dateTaken && meta.photoTakenTime?.timestamp) {
            dateTaken = Number(meta.photoTakenTime.timestamp) * 1000;
            matched++;
          }
          if (!gpsLat) {
            const geo = meta.geoData || meta.geoDataExif;
            if (geo && geo.latitude && geo.latitude !== 0 && geo.longitude && geo.longitude !== 0) {
              gpsLat = geo.latitude;
              gpsLng = geo.longitude;
            }
          }
        } catch {}
        if (dateTaken && gpsLat) break;
      }
      
      if (!dateTaken || !gpsLat) {
        try {
          const exif = await exifr.parse(filePath, { gps: true, pick: ['DateTimeOriginal', 'latitude', 'longitude'] }).catch(() => null);
          if (!dateTaken && exif?.DateTimeOriginal) dateTaken = new Date(exif.DateTimeOriginal).getTime();
          if (!gpsLat && exif?.latitude && exif?.longitude) { gpsLat = exif.latitude; gpsLng = exif.longitude; }
        } catch {}
      }
      
      if (!dateTaken) {
        dateTaken = fs.statSync(filePath).mtimeMs;
      }
      
      insert.run(name, filePath, ext, dateTaken, gpsLat, gpsLng);
      imported++;
      
      if (imported % 50 === 0 && win) {
        win.webContents.send('import-progress', { current: imported, total: mediaFiles.length, message: `Importing Takeout... (${matched} JSON matched)`, done: false });
      }
    } catch {}
  }
  
  if (win) win.webContents.send('import-progress', { current: mediaFiles.length, total: mediaFiles.length, message: 'Takeout import complete!', done: true });
  return { success: true, imported, matched, total: mediaFiles.length };
});

// ---- iCloud Export Import ----
ipcMain.handle('import-icloud', async (event, args) => {
  // --- License limit check ---
  const maxImagesIcloud = licenseManager.checkLimit('maxImages');
  if (maxImagesIcloud !== Infinity) {
    const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
    if (imageCount >= maxImagesIcloud) {
      return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxImagesIcloud} images. Upgrade to import more.` };
    }
  }
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  let icloudDir = args?.icloudPath;
  if (!icloudDir) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select iCloud export folder' });
    if (result.canceled) return { success: false };
    icloudDir = result.filePaths[0];
  }
  let imported = 0;

  // Recursively find all media files (iCloud exports are flat or in subfolders)
  const walkDir = (dir, visited) => {
    if (!visited) visited = new Set();
    const entries = [];
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.isSymbolicLink()) continue;
          const resolved = path.resolve(fullPath);
          if (visited.has(resolved)) continue;
          visited.add(resolved);
          entries.push(...walkDir(fullPath, visited));
        } else if (/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(item.name)) {
          entries.push(fullPath);
        }
      }
    } catch {}
    return entries;
  };

  const mediaFiles = walkDir(icloudDir);

  if (win) win.webContents.send('import-progress', { current: 0, total: mediaFiles.length, message: `Found ${mediaFiles.length} files, importing...`, done: false });

  const insert = db.prepare('INSERT OR IGNORE INTO images (name, full_path, file_type, date_taken, gps_lat, gps_lng) VALUES (?, ?, ?, ?, ?, ?)');

  for (const filePath of mediaFiles) {
    try {
      const name = path.basename(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      let dateTaken = null;
      let gpsLat = null;
      let gpsLng = null;

      // iCloud exports preserve EXIF — extract dates and GPS
      try {
        const gps = await exifr.gps(filePath).catch(() => null);
        if (gps?.latitude && gps?.longitude) {
          gpsLat = gps.latitude;
          gpsLng = gps.longitude;
        }
      } catch {}

      try {
        const exif = await exifr.parse(filePath, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'latitude', 'longitude'] }).catch(() => null);
        if (exif) {
          if (!dateTaken && exif.DateTimeOriginal) dateTaken = new Date(exif.DateTimeOriginal).getTime();
          if (!dateTaken && exif.CreateDate) dateTaken = new Date(exif.CreateDate).getTime();
          if (!gpsLat && exif.latitude && exif.longitude) { gpsLat = exif.latitude; gpsLng = exif.longitude; }
        }
      } catch {}

      // iCloud sometimes has AAE sidecar files — check for companion plist
      // but these don't typically contain date/GPS, so we skip them

      // Fallback: use file modification time
      if (!dateTaken) {
        const stats = fs.statSync(filePath);
        dateTaken = Math.min(stats.mtimeMs, stats.birthtimeMs || stats.mtimeMs);
      }

      insert.run(name, filePath, ext, dateTaken, gpsLat, gpsLng);
      imported++;

      if (imported % 10 === 0 && win) {
        win.webContents.send('import-progress', { current: imported, total: mediaFiles.length, message: `Importing iCloud photos... ${imported}/${mediaFiles.length}`, done: false });
      }
    } catch {}
  }

  if (win) win.webContents.send('import-progress', { current: mediaFiles.length, total: mediaFiles.length, message: 'iCloud import complete!', done: true });
  return { success: true, imported, total: mediaFiles.length };
});

ipcMain.handle('import-from-immich', async (_, { serverUrl, apiKey }) => {
  try {
    // SSRF protection: block private/internal IP ranges
    let parsedUrl;
    try { parsedUrl = new URL(serverUrl); } catch { return { success: false, error: 'Invalid server URL' }; }
    // Only allow http/https schemes
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: 'Only HTTP/HTTPS URLs are allowed.' };
    }
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    // Block private IPs, localhost, link-local, metadata, and CGNAT ranges
    // Also handles decimal/octal/hex IP encoding by resolving via DNS first
    const isPrivateIP = (ip) => /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-2]\d)\.|198\.1[89]\.|fc|fd|fe80|::1|::ffff:|localhost)/i.test(ip);
    if (isPrivateIP(hostname)) {
      return { success: false, error: 'Cannot connect to private/internal network addresses. Use a public URL.' };
    }
    // Resolve hostname to IP and validate the resolved address too
    try {
      const dns = require('dns');
      const { address } = await dns.promises.lookup(hostname);
      if (isPrivateIP(address)) {
        return { success: false, error: 'Server URL resolves to a private/internal IP address. Use a public URL.' };
      }
    } catch (dnsErr) {
      return { success: false, error: 'Could not resolve server hostname: ' + dnsErr.message };
    }

    // --- License limit check ---
    const maxImages = licenseManager.checkLimit('maxImages');
    if (maxImages !== Infinity) {
      const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
      if (imageCount >= maxImages) {
        return { error: 'limit', message: `Your ${licenseManager.getLicenseInfo().tierName} plan allows up to ${maxImages} images. Upgrade to import more.` };
      }
    }

    // Paginate through all assets from Immich
    let allAssets = [];
    let page = 1;
    const MAX_PAGES = 500; // Safety cap to prevent infinite loops from misbehaving servers
    while (page <= MAX_PAGES) {
      const response = await fetch(`${serverUrl}/api/assets?size=1000&page=${page}`, {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Immich API error: ${response.status}`);
      const assets = await response.json();
      if (!assets.length) break;
      allAssets.push(...assets);
      page++;
    }
    
    // Download originals to local folder
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select folder to save Immich imports' });
    if (result.canceled) return { success: false };
    
    const outputDir = result.filePaths[0];
    let downloaded = 0;
    
    for (const asset of allAssets) {
      try {
        // Sanitize filename to prevent path traversal from malicious Immich servers
        const safeName = path.basename(asset.originalFileName || 'unknown');
        const outPath = path.join(outputDir, safeName);
        // Double-check resolved path is within outputDir
        if (!path.resolve(outPath).startsWith(path.resolve(outputDir))) { continue; }
        if (fs.existsSync(outPath)) { downloaded++; continue; }

        const dlResp = await fetch(`${serverUrl}/api/assets/${asset.id}/original`, {
          headers: { 'x-api-key': apiKey }
        });
        if (!dlResp.ok) continue;
        
        const buffer = Buffer.from(await dlResp.arrayBuffer());
        fs.writeFileSync(outPath, buffer);
        
        // Add to DB with GPS if available
        const ext = path.extname(outPath).slice(1).toLowerCase();
        const dateTaken = asset.exifInfo?.dateTimeOriginal ? new Date(asset.exifInfo.dateTimeOriginal).getTime() : Date.now();
        const gpsLat = asset.exifInfo?.latitude || null;
        const gpsLng = asset.exifInfo?.longitude || null;
        db.prepare('INSERT OR IGNORE INTO images (name, full_path, file_type, date_taken, gps_lat, gps_lng) VALUES (?, ?, ?, ?, ?, ?)').run(asset.originalFileName, outPath, ext, dateTaken, gpsLat, gpsLng);
        
        downloaded++;
        if (downloaded % 10 === 0 && win) {
          win.webContents.send('import-progress', { current: downloaded, total: allAssets.length, message: 'Importing from Immich...', done: false });
        }
      } catch {}
    }
    
    if (win) win.webContents.send('import-progress', { current: allAssets.length, total: allAssets.length, message: 'Immich import complete!', done: true });
    return { success: true, downloaded, total: allAssets.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// FEATURE 14: Slideshow Mode (handled client-side, just need settings)
// ============================================================
ipcMain.handle('get-slideshow-settings', () => {
  return {
    interval: getSetting('slideshowInterval', 4),
    transition: getSetting('slideshowTransition', 'fade'),
    shuffle: getSetting('slideshowShuffle', false)
  };
});

ipcMain.handle('set-slideshow-settings', (_, settings) => {
  if (settings.interval !== undefined) setSetting('slideshowInterval', settings.interval);
  if (settings.transition !== undefined) setSetting('slideshowTransition', settings.transition);
  if (settings.shuffle !== undefined) setSetting('slideshowShuffle', settings.shuffle);
  return { success: true };
});

// --- Background Removal via BiRefNet (MIT license) + onnxruntime-node ---
ipcMain.handle('remove-bg-rmbg', async (_event, imageDataUrl) => {
  try {
    const ort = await import('onnxruntime-node');
    const sharp = (await import('sharp')).default;

    if (!global._birefnetSession) {
      const modelPath = path.join(getAssetPath('resources/birefnet'), 'model.onnx');
      global._birefnetSession = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      });
    }

    // Decode the data URL to a buffer
    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const inputBuffer = Buffer.from(base64, 'base64');

    // Get original dimensions
    const meta = await sharp(inputBuffer).metadata();
    const origW = meta.width, origH = meta.height;

    // Preprocess: resize to 1024x1024, get raw RGB
    const S = 1024;
    const rgbBuf = await sharp(inputBuffer)
      .resize(S, S, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Convert to NCHW float32 with ImageNet normalization
    const mean = [0.485, 0.456, 0.406];
    const std  = [0.229, 0.224, 0.225];
    const input = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) {
      input[i]             = (rgbBuf[i * 3]     / 255.0 - mean[0]) / std[0];
      input[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - mean[1]) / std[1];
      input[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, S, S]);
    const inputName = global._birefnetSession.inputNames[0];
    const results = await global._birefnetSession.run({ [inputName]: tensor });
    // BiRefNet may output multiple scales; use the last (finest) output
    const outputNames = global._birefnetSession.outputNames;
    const outputName = outputNames[outputNames.length - 1];
    const rawOutput = results[outputName].data;

    // Sigmoid → 0-255 mask (no min-max stretch to preserve soft alpha transitions)
    const maskBuf = Buffer.alloc(S * S);
    for (let i = 0; i < S * S; i++) {
      const v = 1 / (1 + Math.exp(-rawOutput[i]));
      maskBuf[i] = Math.min(255, Math.max(0, Math.round(v * 255)));
    }

    // Erode mask by 1px (3×3 min filter) to remove contaminated boundary pixels
    const erodedMask = Buffer.alloc(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let minVal = maskBuf[y * S + x];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < S && nx >= 0 && nx < S) {
              minVal = Math.min(minVal, maskBuf[ny * S + nx]);
            } else {
              minVal = 0;
            }
          }
        }
        erodedMask[y * S + x] = minVal;
      }
    }

    // Blur eroded mask to create soft feathered edges, then resize to original
    const scaledMask = await sharp(erodedMask, { raw: { width: S, height: S, channels: 1 } })
      .blur(1.5)
      .resize(origW, origH, { fit: 'fill' })
      .toColourspace('b-w')
      .raw()
      .toBuffer();

    // Combine original RGB with mask as alpha
    const origRgb = await sharp(inputBuffer).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(origW * origH * 4);
    for (let i = 0; i < origW * origH; i++) {
      rgba[i * 4]     = origRgb[i * 3];
      rgba[i * 4 + 1] = origRgb[i * 3 + 1];
      rgba[i * 4 + 2] = origRgb[i * 3 + 2];
      rgba[i * 4 + 3] = scaledMask[i];
    }

    // Defringe: reverse-composite to remove background color bleed
    let sumBgR = 0, sumBgG = 0, sumBgB = 0, bgCount = 0;
    for (let i = 0; i < origW * origH; i++) {
      if (scaledMask[i] < 5) {
        sumBgR += origRgb[i * 3];
        sumBgG += origRgb[i * 3 + 1];
        sumBgB += origRgb[i * 3 + 2];
        bgCount++;
      }
    }
    const bgR = bgCount > 100 ? sumBgR / bgCount : 255;
    const bgG = bgCount > 100 ? sumBgG / bgCount : 255;
    const bgB = bgCount > 100 ? sumBgB / bgCount : 255;

    for (let i = 0; i < origW * origH; i++) {
      const a = rgba[i * 4 + 3];
      if (a < 2) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = rgba[i * 4 + 3] = 0; continue; }
      if (a >= 255) continue;
      const af = a / 255;
      const oneMinusA = 1 - af;
      rgba[i * 4]     = Math.max(0, Math.min(255, Math.round((rgba[i * 4]     - bgR * oneMinusA) / af)));
      rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + 1] - bgG * oneMinusA) / af)));
      rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + 2] - bgB * oneMinusA) / af)));
    }

    const pngBuffer = await sharp(rgba, { raw: { width: origW, height: origH, channels: 4 } })
      .png()
      .toBuffer();

    return 'data:image/png;base64,' + pngBuffer.toString('base64');
  } catch (err) {
    console.error('[BG-Removal] Background removal failed:', err);
    throw err;
  }
});

// ============================================================
// FEATURE 15: Contextual Search — Hybrid Captioning + Semantic Search
// ============================================================
// Uses ViT-GPT2 (ONNX via @huggingface/transformers) for free-form
// caption generation and CLIP ViT-B/32 (ONNX) for search embeddings.
// Captions are displayed to the user, while CLIP embeddings power
// semantic search — fully offline, no data leaves the device.
// ============================================================

let _clipVisionSession = null;
let _clipTextSession = null;
let _clipTokenizer = null;

// --- Auto-scan state ---
let _autoScanActive = false;
let _autoScanCancel = false;
let _autoScanPaused = false;
let _autoScanPending = null; // queued window ref if scan requested while active

// ── Search synonym map (used by synonymLikeCondition from shared.js) ──
const _synonymMap = loadSynonymMap(path.join(getAssetPath('resources'), 'search-synonyms.json'));

/** Lazy-load CLIP ONNX sessions + tokenizer */
async function ensureCLIP() {
  if (_clipVisionSession && _clipTextSession && _clipTokenizer) return;

  const ort = await import('onnxruntime-node');
  const modelDir = getAssetPath('resources/caption-model');

  if (!_clipVisionSession) {
    const p = path.join(modelDir, 'clip_vision.onnx');
    if (!fs.existsSync(p)) throw new Error('CLIP vision model not found: ' + p);
    _clipVisionSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
    await new Promise(r => setTimeout(r, 0));
  }

  if (!_clipTextSession) {
    const p = path.join(modelDir, 'clip_text.onnx');
    if (!fs.existsSync(p)) throw new Error('CLIP text model not found: ' + p);
    _clipTextSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
    await new Promise(r => setTimeout(r, 0));
  }

  if (!_clipTokenizer) {
    const vocabPath = path.join(modelDir, 'vocab.json');
    const mergesPath = path.join(modelDir, 'merges.txt');
    if (!fs.existsSync(vocabPath)) throw new Error('Tokenizer vocab.json not found');
    if (!fs.existsSync(mergesPath)) throw new Error('Tokenizer merges.txt not found');

    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf-8'));
    const mergesRaw = fs.readFileSync(mergesPath, 'utf-8').split('\n');
    // Skip the first line if it's a version comment
    const merges = mergesRaw.filter(l => l.trim() && !l.startsWith('#'));
    _clipTokenizer = new CLIPTokenizer(vocab, merges);
  }
}

/** Compute CLIP image embedding (512-dim, L2-normalised) */
async function getImageEmbedding(imageBuffer) {
  const ort = await import('onnxruntime-node');
  await ensureCLIP();

  // CLIP ViT-B/32 preprocessing: 224×224, normalise with CLIP mean/std
  const S = 224;
  const mean = [0.48145466, 0.4578275, 0.40821073];
  const std  = [0.26862954, 0.26130258, 0.27577711];

  const rgbBuf = await sharp(imageBuffer)
    .resize(S, S, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const input = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) {
    input[i]             = (rgbBuf[i * 3]     / 255.0 - mean[0]) / std[0];
    input[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - mean[1]) / std[1];
    input[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - mean[2]) / std[2];
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, S, S]);
  const inputName = _clipVisionSession.inputNames[0];
  const results = await _clipVisionSession.run({ [inputName]: tensor });
  const outputName = _clipVisionSession.outputNames[0];
  const embedding = Array.from(results[outputName].data);

  return l2Normalise(embedding);
}

/** Compute CLIP text embedding (512-dim, L2-normalised) */
async function getTextEmbedding(text) {
  const ort = await import('onnxruntime-node');
  await ensureCLIP();

  const tokens = _clipTokenizer.encode(text);
  const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)));
  const attentionMask = new BigInt64Array(tokens.map(t => t !== 0 ? 1n : 0n));

  // Build feeds — handle different input name conventions
  const feeds = {};
  for (const name of _clipTextSession.inputNames) {
    if (name.includes('input_ids') || name === 'input_ids') {
      feeds[name] = new ort.Tensor('int64', inputIds, [1, 77]);
    } else if (name.includes('attention_mask') || name === 'attention_mask') {
      feeds[name] = new ort.Tensor('int64', attentionMask, [1, 77]);
    }
  }

  const results = await _clipTextSession.run(feeds);
  const outputName = _clipTextSession.outputNames[0];
  const embedding = Array.from(results[outputName].data);

  return l2Normalise(embedding);
}

// ── Caption Generation (manual ONNX inference via onnxruntime-node) ──
let _captionEncoderSession = null;
let _captionDecoderSession = null;
let _captionId2Token = null;
let _captionKVLayers = 0;

const CAPTION_HEADS = 12;
const CAPTION_HEAD_DIM = 64;
const CAPTION_BOS = 50256;
const CAPTION_EOS = 50256;
const CAPTION_MAX_NEW = 30;

/**
 * Lazy-load ViT encoder + GPT2 decoder + tokenizer.
 * Uses onnxruntime-node directly (same runtime as CLIP).
 */
async function ensureCaptionPipeline() {
  if (_captionEncoderSession && _captionDecoderSession && _captionId2Token) return;

  const ort = await import('onnxruntime-node');
  const modelDir = getAssetPath('resources/blip-model');

  if (!_captionEncoderSession) {
    // Prefer quantized encoder (smaller bundle); fall back to fp32 if present
    const fp32 = path.join(modelDir, 'onnx', 'encoder_model.onnx');
    const quant = path.join(modelDir, 'onnx', 'encoder_model_quantized.onnx');
    const p = fs.existsSync(quant) ? quant : fp32;
    if (!fs.existsSync(p)) throw new Error('ViT encoder model not found: ' + p);
    console.log('[Caption] Loading ViT encoder (' + (p === fp32 ? 'fp32' : 'quantized') + ')...');
    _captionEncoderSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
    // Yield so the event loop can process pending protocol/IPC requests
    await new Promise(r => setTimeout(r, 0));
  }

  if (!_captionDecoderSession) {
    const p = path.join(modelDir, 'onnx', 'decoder_model_merged_quantized.onnx');
    if (!fs.existsSync(p)) throw new Error('GPT2 decoder model not found: ' + p);
    console.log('[Caption] Loading GPT2 decoder...');
    _captionDecoderSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' });
    // Yield so the event loop can process pending protocol/IPC requests
    await new Promise(r => setTimeout(r, 0));
    // Auto-detect number of KV cache layers from the ONNX model
    _captionKVLayers = _captionDecoderSession.inputNames.filter(n => n.startsWith('past_key_values') && n.endsWith('.key')).length;
  }

  if (!_captionId2Token) {
    const tokPath = path.join(modelDir, 'tokenizer.json');
    if (!fs.existsSync(tokPath)) throw new Error('Tokenizer not found: ' + tokPath);
    const tokData = JSON.parse(fs.readFileSync(tokPath, 'utf-8'));
    _captionId2Token = {};
    for (const [tok, id] of Object.entries(tokData.model.vocab)) {
      _captionId2Token[id] = tok;
    }
    console.log('[Caption] Caption model ready.');
  }
}

/**
 * Prepend a color scheme descriptor to a caption.
 * e.g. "a person reading a book" → "A black and white photo of a person reading a book"
 */
function applyColorDescriptor(caption, colorScheme) {
  if (!colorScheme || !caption) return caption;

  // Strip leading articles: "a ", "an ", "the "
  let core = caption.replace(/^(a |an |the )/i, '').trim();

  return `${colorScheme} photo of ${core}`;
}

function normalizeContextQuery(query) {
  return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function tokenizeContextText(value) {
  return normalizeContextQuery(value)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 1)
}

function buildHybridQueryPhrases(rawQuery) {
  const normalized = normalizeContextQuery(rawQuery)
  if (!normalized) return []
  const phrases = [normalized]
  if (!/^a (photo|picture|image) of /i.test(normalized)) {
    phrases.push(`a photo of ${normalized}`)
    phrases.push(`a picture of ${normalized}`)
    phrases.push(`an image of ${normalized}`)
  }
  return Array.from(new Set(phrases))
}

async function getHybridQueryEmbedding(rawQuery) {
  const phrases = buildHybridQueryPhrases(rawQuery)
  if (phrases.length === 0) return []
  const embeddings = await Promise.all(phrases.map((phrase) => getTextEmbedding(phrase)))
  const merged = new Array(embeddings[0].length).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < emb.length; i++) merged[i] += emb[i]
  }
  for (let i = 0; i < merged.length; i++) merged[i] /= embeddings.length
  return l2Normalise(merged)
}

function computeCaptionTextBoost(rawQuery, captionText, filePath = '') {
  const normalizedQuery = normalizeContextQuery(rawQuery)
  const normalizedCaption = normalizeContextQuery(captionText)
  const normalizedPath = normalizeContextQuery(path.basename(filePath || ''))
  const queryTokens = tokenizeContextText(rawQuery)

  let boost = 0
  if (normalizedQuery && normalizedCaption.includes(normalizedQuery)) boost += 0.12

  let matchedTokens = 0
  for (const token of queryTokens) {
    if (normalizedCaption.includes(token)) {
      matchedTokens++
      boost += 0.035
      continue
    }
    if (normalizedPath.includes(token)) {
      matchedTokens++
      boost += 0.015
    }
  }

  if (queryTokens.length > 1 && matchedTokens === queryTokens.length) boost += 0.06
  return Math.min(boost, 0.22)
}

function resolveCaptionScanSource(fullPath, thumbPath = null) {
  if (thumbPath && fs.existsSync(thumbPath)) return thumbPath
  return fullPath
}

/**
 * Generate free-form caption candidates for an image.
 * Runs encoder once, then beam-search GPT2 decoding with KV-cache.
 * Returns an array of { text, score } candidates for CLIP reranking.
 */
async function generateCaptionCandidates(imagePath, { cropVariation = false, beamWidth = 5 } = {}) {
  await ensureCaptionPipeline();
  const ort = await import('onnxruntime-node');

  // 1. Preprocess image: resize to 224×224, normalise with mean/std 0.5
  //    With cropVariation, apply a random crop (80-95% of image) before resizing
  //    to give the model a slightly different perspective
  const S = 224;
  let pipeline = sharp(imagePath);
  if (cropVariation) {
    const meta = await sharp(imagePath).metadata();
    const w = meta.width || 224;
    const h = meta.height || 224;
    const scale = 0.80 + Math.random() * 0.15; // 80-95%
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const left = Math.floor(Math.random() * (w - cw));
    const top = Math.floor(Math.random() * (h - ch));
    pipeline = pipeline.extract({ left, top, width: cw, height: ch });
  }
  const rgbBuf = await pipeline
    .resize(S, S, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const pixels = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) {
    pixels[i]             = (rgbBuf[i * 3]     / 255.0 - 0.5) / 0.5;
    pixels[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - 0.5) / 0.5;
    pixels[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - 0.5) / 0.5;
  }

  // 2. Run ViT encoder
  const encResult = await _captionEncoderSession.run({
    pixel_values: new ort.Tensor('float32', pixels, [1, 3, S, S])
  });
  const encoderHidden = encResult.last_hidden_state;

  // 3. Beam-search decoding with KV-cache
  const BEAM_WIDTH = beamWidth;

  // Helper: create empty KV cache for one beam
  function emptyKV() {
    const kv = {};
    for (let i = 0; i < _captionKVLayers; i++) {
      kv[i] = {
        key: new ort.Tensor('float32', new Float32Array(0), [1, CAPTION_HEADS, 0, CAPTION_HEAD_DIM]),
        value: new ort.Tensor('float32', new Float32Array(0), [1, CAPTION_HEADS, 0, CAPTION_HEAD_DIM])
      };
    }
    return kv;
  }

  let beams = [{ tokens: [CAPTION_BOS], score: 0, kv: emptyKV() }];
  let completed = [];

  for (let step = 0; step < CAPTION_MAX_NEW; step++) {
    const candidates = [];

    for (const beam of beams) {
      const isFirst = step === 0;
      const inputIds = isFirst
        ? new ort.Tensor('int64', BigInt64Array.from(beam.tokens.map(BigInt)), [1, beam.tokens.length])
        : new ort.Tensor('int64', BigInt64Array.from([BigInt(beam.tokens[beam.tokens.length - 1])]), [1, 1]);

      const feeds = {
        input_ids: inputIds,
        encoder_hidden_states: encoderHidden,
        use_cache_branch: new ort.Tensor('bool', [!isFirst], [1])
      };
      for (let i = 0; i < _captionKVLayers; i++) {
        feeds[`past_key_values.${i}.key`] = beam.kv[i].key;
        feeds[`past_key_values.${i}.value`] = beam.kv[i].value;
      }

      const decResult = await _captionDecoderSession.run(feeds);

      // Extract updated KV cache
      const newKV = {};
      for (let i = 0; i < _captionKVLayers; i++) {
        newKV[i] = { key: decResult[`present.${i}.key`], value: decResult[`present.${i}.value`] };
      }

      // Compute log-probabilities via log-softmax
      const logits = decResult.logits;
      const vocabSize = logits.dims[2];
      const offset = (logits.dims[1] - 1) * vocabSize;
      let maxLogit = -Infinity;
      for (let v = 0; v < vocabSize; v++) {
        if (logits.data[offset + v] > maxLogit) maxLogit = logits.data[offset + v];
      }
      let sumExp = 0;
      for (let v = 0; v < vocabSize; v++) sumExp += Math.exp(logits.data[offset + v] - maxLogit);
      const logSumExp = Math.log(sumExp) + maxLogit;

      // Collect top-K candidates from this beam
      const topK = BEAM_WIDTH * 2;
      const picked = new Set();
      for (let k = 0; k < topK; k++) {
        let bestIdx = -1, bestVal = -Infinity;
        for (let v = 0; v < vocabSize; v++) {
          if (!picked.has(v) && logits.data[offset + v] > bestVal) {
            bestVal = logits.data[offset + v];
            bestIdx = v;
          }
        }
        if (bestIdx < 0) break;
        picked.add(bestIdx);
        candidates.push({
          tokens: [...beam.tokens, bestIdx],
          score: beam.score + (logits.data[offset + bestIdx] - logSumExp),
          kv: newKV,
          lastToken: bestIdx
        });
      }
    }

    // Sort by score and keep top beams
    candidates.sort((a, b) => b.score - a.score);
    const nextBeams = [];
    for (const c of candidates) {
      if (c.lastToken === CAPTION_EOS && step > 0) {
        completed.push(c);
      } else {
        nextBeams.push(c);
      }
      if (nextBeams.length >= BEAM_WIDTH) break;
    }

    beams = nextBeams;
    if (beams.length === 0 || completed.length >= BEAM_WIDTH) break;
  }

  // Return all completed candidates for CLIP reranking
  function decodeTokens(tokens) {
    return tokens.slice(1)
      .filter(id => id !== CAPTION_EOS)
      .map(id => _captionId2Token[id] || '')
      .join('')
      .replace(/\u0120/g, ' ')
      .trim();
  }

  if (completed.length > 0) {
    return completed.map(c => ({
      text: decodeTokens(c.tokens),
      score: c.score / c.tokens.length
    })).sort((a, b) => b.score - a.score);
  }
  return [{ text: decodeTokens(beams[0].tokens), score: 0 }];
}

async function rankCaptionCandidates(buf, imageEmbedding, opts = {}, rerankLimit = 3) {
  const candidates = await generateCaptionCandidates(buf, opts)
  const limited = candidates.slice(0, Math.max(1, rerankLimit))
  const scored = []
  for (const cand of limited) {
    const textEmb = await getTextEmbedding(cand.text)
    scored.push({ text: cand.text, sim: cosineSimilarity(imageEmbedding, textEmb) })
  }
  scored.sort((a, b) => b.sim - a.sim)
  return scored
}

function dedupeCaptionCandidates(candidates) {
  const byText = new Map()
  for (const candidate of candidates) {
    const key = normalizeContextQuery(candidate.text)
    if (!key) continue
    const existing = byText.get(key)
    if (!existing || candidate.sim > existing.sim) byText.set(key, candidate)
  }
  return Array.from(byText.values()).sort((a, b) => b.sim - a.sim)
}

async function buildCaptionRecord(buf, { regenerate = false, currentCaption = '', beamWidth = 5, rerankLimit = 3, fastMode = false } = {}) {
  const imageEmbedding = await getImageEmbedding(buf)
  const colorScheme = fastMode ? null : await analyseColorScheme(buf)

  let caption
  if (regenerate) {
    const normalise = (value) => value.toLowerCase().trim()
    const stripColorPrefix = (value) => value.replace(/^(dark |high-key |vibrant )?(black and white|sepia-toned|warm-toned|cool-toned|colorful|dark|bright)( (?:red|orange|yellow|green|teal|blue|purple|pink|brown|maroon))? photo of /i, '')
    const currentNorm = currentCaption ? normalise(stripColorPrefix(currentCaption)) : ''
    const all = []
    for (let i = 0; i < 3; i++) {
      const batch = await rankCaptionCandidates(buf, imageEmbedding, { cropVariation: true, beamWidth }, rerankLimit)
      all.push(...batch)
    }
    const ranked = dedupeCaptionCandidates(all)
    caption = ranked.find((entry) => !currentNorm || normalise(entry.text) !== currentNorm)?.text || ranked[0]?.text || 'photo'
  } else if (fastMode) {
    const ranked = dedupeCaptionCandidates([
      ...(await rankCaptionCandidates(buf, imageEmbedding, { beamWidth: Math.max(2, beamWidth) }, Math.max(2, rerankLimit))),
    ])
    caption = ranked[0]?.text || 'photo'
  } else {
    const ranked = dedupeCaptionCandidates([
      ...(await rankCaptionCandidates(buf, imageEmbedding, { beamWidth }, Math.max(3, rerankLimit))),
      ...(await rankCaptionCandidates(buf, imageEmbedding, { cropVariation: true, beamWidth }, Math.max(3, rerankLimit))),
    ])
    caption = ranked[0]?.text || 'photo'
  }

  return {
    caption: applyColorDescriptor(caption, colorScheme),
    imageEmbedding,
  }
}

// --- Check if caption models are available (both CLIP + caption encoder/decoder) ---
ipcMain.handle('caption-model-available', () => {
  const clipDir = getAssetPath('resources/caption-model');
  const captionDir = getAssetPath('resources/blip-model');
  const clipOk = fs.existsSync(path.join(clipDir, 'clip_vision.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'clip_text.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'vocab.json')) &&
                 fs.existsSync(path.join(clipDir, 'merges.txt'));
  const encoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model.onnx')) ||
                    fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model_quantized.onnx'));
  const decoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'decoder_model_merged_quantized.onnx'));
  return clipOk && encoderOk && decoderOk;
});

// --- Get path to caption model (for renderer info) ---
ipcMain.handle('get-caption-model-path', () => {
  return getAssetPath('resources/caption-model');
});

// --- Get images that haven't been scanned for captions yet ---
ipcMain.handle('get-images-for-caption-scan', () => {
  const rows = db.prepare(`
    SELECT i.id, i.full_path, i.thumb_path, i.file_type
    FROM images i
    WHERE i.file_type IN ('jpg','jpeg','png','webp','bmp','tiff','tif','heic','heif','avif')
      AND i.id NOT IN (SELECT image_id FROM image_captions)
  `).all();
  return rows;
});

// --- Generate caption + embedding for a single image ---
ipcMain.handle('caption-image', async (_, { imageId, imagePath, regenerate = false, currentCaption = '' }) => {
  try {
    const clean = path.normalize(decodeURIComponent(imagePath.replace(/^pluto:\/\//i, '')));
    if (!isPathAllowed(path.resolve(clean))) return { success: false, error: 'Access denied' };
    if (!fs.existsSync(clean)) return { success: false, error: 'File not found' };

    // Read file once and pass buffer to both pipelines
    const buf = fs.readFileSync(clean);
    const { caption, imageEmbedding } = await buildCaptionRecord(buf, {
      regenerate,
      currentCaption,
      beamWidth: regenerate ? 5 : 4,
      rerankLimit: regenerate ? 4 : 3,
      fastMode: false,
    })

    const embeddingStr = JSON.stringify(imageEmbedding);
    db.prepare('INSERT OR REPLACE INTO image_captions (image_id, captions, embedding) VALUES (?, ?, ?)')
      .run(imageId, caption, embeddingStr);
    invalidateContextEmbeddingCache();

    return { success: true, captions: caption };
  } catch (err) {
    console.error('[Caption] Captioning failed:', err.message);
    return { success: false, error: err.message };
  }
});

// --- Auto-scan: wait for thumbnail queue to drain before loading heavy models ---
function waitForThumbnailsThenScan(win) {
  const check = () => {
    if (_appQuitting) return;
    if (thumbBackgroundQueue.length > 0 || activeBgTasks > 0) {
      setTimeout(check, 500);
    } else {
      // Thumbnails are done — start caption scan after a short breather
      setTimeout(() => startAutoScan(win), 300);
    }
  };
  // Initial delay to let the first batch of thumbnails queue up
  setTimeout(check, 1000);
}

// --- Caption scan runner used by the ContextScanPanel ---
async function startAutoScan(win) {
  if (_autoScanActive) { _autoScanPending = win; return { success: false, error: 'Scan already active' }; }
  if (!licenseManager.checkFeature('contextSearch')) return { success: false, error: 'Contextual Search is not available for this license' };

  // Check caption model availability
  const clipDir = getAssetPath('resources/caption-model');
  const captionDir = getAssetPath('resources/blip-model');
  const clipOk = fs.existsSync(path.join(clipDir, 'clip_vision.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'clip_text.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'vocab.json')) &&
                 fs.existsSync(path.join(clipDir, 'merges.txt'));
  const encoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model.onnx')) ||
                    fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model_quantized.onnx'));
  const decoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'decoder_model_merged_quantized.onnx'));
  if (!clipOk || !encoderOk || !decoderOk) return { success: false, error: 'Caption model is not available' };

  const images = db.prepare(`
    SELECT i.id, i.full_path, i.thumb_path, i.file_type
    FROM images i
    WHERE i.file_type IN ('jpg','jpeg','png','webp','bmp','tiff','tif','heic','heif','avif')
      AND i.id NOT IN (SELECT image_id FROM image_captions)
  `).all();
  if (!images.length) return { success: true, processed: 0, failed: 0, cancelled: false };

  const startingScanned = db.prepare('SELECT COUNT(*) as c FROM image_captions').get().c;

  _autoScanActive = true;
  _autoScanCancel = false;
  _autoScanPaused = false;

  // Pre-warm CLIP once before the loop.
  // Bulk indexing is embedding-only; caption generation is deferred to search hits.
  await ensureCLIP();
  await new Promise(r => setTimeout(r, 0));

  try {
    const scanStartTime = Date.now();
    let processedCount = 0;
    let failedCount = 0;

    win?.webContents.send('auto-scan-progress', {
      current: 0,
      total: images.length,
      done: false,
      paused: false,
      successfulCount: 0,
      failedCount: 0,
      scannedTotal: startingScanned,
    });

    // Prefetch: start reading the next file asynchronously while inference runs
    let nextFilePromise = null;

    for (let i = 0; i < images.length; i++) {
      if (_autoScanCancel) break;

      // Pause support: spin-wait with a short sleep until unpaused or cancelled
      while (_autoScanPaused && !_autoScanCancel) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (_autoScanCancel) break;

      const img = images[i];
      try {
        const sourcePath = resolveCaptionScanSource(img.full_path, img.thumb_path)
        const clean = path.normalize(sourcePath);

        // Use prefetched buffer when available, otherwise read synchronously
        let buf = null;
        if (nextFilePromise) {
          buf = await nextFilePromise;
          nextFilePromise = null;
        }
        if (!buf) {
          if (!fs.existsSync(clean)) {
            // Kick off prefetch for the next file before skipping
            if (i + 1 < images.length) {
              nextFilePromise = fs.promises.readFile(path.normalize(resolveCaptionScanSource(images[i + 1].full_path, images[i + 1].thumb_path))).catch(() => null);
            }
            continue;
          }
          buf = fs.readFileSync(clean);
        }

        // Start async prefetch of next file — overlaps I/O with inference below
        if (i + 1 < images.length) {
          nextFilePromise = fs.promises.readFile(path.normalize(resolveCaptionScanSource(images[i + 1].full_path, images[i + 1].thumb_path))).catch(() => null);
        }

        const imageEmbedding = await getImageEmbedding(buf)
        const caption = ''

        const embeddingStr = JSON.stringify(imageEmbedding);
        db.prepare('INSERT OR REPLACE INTO image_captions (image_id, captions, embedding) VALUES (?, ?, ?)')
          .run(img.id, caption, embeddingStr);
        invalidateContextEmbeddingCache();
        processedCount++;
      } catch (err) {
        console.error('[AutoScan] Error captioning image:', img.full_path, err.message);
        failedCount++;
      }

      // Compute ETA based on average time per successfully processed image
      const elapsed = Date.now() - scanStartTime;
      const avgMs = processedCount > 0 ? elapsed / processedCount : 0;
      const remaining = images.length - (i + 1);
      const etaSeconds = processedCount > 0 ? Math.round((avgMs * remaining) / 1000) : null;

      win?.webContents.send('auto-scan-progress', {
        current: i + 1,
        total: images.length,
        done: false,
        paused: _autoScanPaused,
        etaSeconds,
        successfulCount: processedCount,
        failedCount,
        scannedTotal: startingScanned + processedCount,
      });
    }

    win?.webContents.send('auto-scan-progress', {
      current: images.length,
      total: images.length,
      done: true,
      cancelled: _autoScanCancel,
      paused: false,
      etaSeconds: 0,
      successfulCount: processedCount,
      failedCount,
      scannedTotal: startingScanned + processedCount,
    });
    return { success: true, processed: processedCount, failed: failedCount, cancelled: _autoScanCancel };
  } finally {
    _autoScanActive = false;
    _autoScanCancel = false;
    _autoScanPaused = false;
    // If another scan was requested while we were busy, run it now
    if (_autoScanPending) {
      const pendingWin = _autoScanPending;
      _autoScanPending = null;
      setTimeout(() => startAutoScan(pendingWin), 500);
    }
  }
}

ipcMain.handle('start-caption-scan', async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  return await startAutoScan(win);
});

ipcMain.handle('cancel-auto-scan', () => {
  _autoScanCancel = true;
  _autoScanPaused = false; // unpause so the loop can exit
  return { success: true };
});

ipcMain.handle('pause-auto-scan', () => {
  if (!_autoScanActive) return { success: false, error: 'No scan active' };
  _autoScanPaused = true;
  return { success: true };
});

ipcMain.handle('resume-auto-scan', () => {
  if (!_autoScanActive) return { success: false, error: 'No scan active' };
  _autoScanPaused = false;
  return { success: true };
});

ipcMain.handle('get-auto-scan-status', () => {
  return { active: _autoScanActive, paused: _autoScanPaused };
});

// --- Get captions for a specific image ---
ipcMain.handle('get-image-captions', (_, imageId) => {
  const row = db.prepare('SELECT captions FROM image_captions WHERE image_id = ?').get(imageId);
  return row ? row.captions : null;
});

// --- Contextual search: embed query text → find similar images ---
// Cache parsed embeddings to avoid re-parsing JSON on every search
let _embeddingCache = null;
let _embeddingCacheMaxRowId = -1;
let _embeddingCacheCount = -1;
let _contextCaptionRefineRunning = false;
const _contextCaptionRefineQueue = [];
const _contextCaptionRefinePending = new Set();

function invalidateContextEmbeddingCache() {
  _embeddingCache = null;
  _embeddingCacheMaxRowId = -1;
  _embeddingCacheCount = -1;
}

function emitContextCaptionUpdated(imageId, captions) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send('context-caption-updated', { imageId, captions });
    } catch {}
  }
}

function queueContextCaptionRefinement(rows) {
  for (const row of rows) {
    if (!row?.image_id || !row?.full_path) continue;
    if (row.captions && row.captions.trim()) continue;
    if (_contextCaptionRefinePending.has(row.image_id)) continue;
    _contextCaptionRefinePending.add(row.image_id);
    _contextCaptionRefineQueue.push({ imageId: row.image_id, fullPath: row.full_path });
  }

  if (!_contextCaptionRefineRunning) processContextCaptionRefinementQueue();
}

async function processContextCaptionRefinementQueue() {
  if (_contextCaptionRefineRunning) return;
  _contextCaptionRefineRunning = true;

  try {
    while (_contextCaptionRefineQueue.length > 0) {
      const task = _contextCaptionRefineQueue.shift();
      try {
        const clean = path.normalize(task.fullPath);
        if (!fs.existsSync(clean)) continue;

        const buf = fs.readFileSync(clean);
        const { caption } = await buildCaptionRecord(buf, {
          beamWidth: 4,
          rerankLimit: 3,
          fastMode: false,
        });

        db.prepare("UPDATE image_captions SET captions = ?, scanned_at = strftime('%s','now') WHERE image_id = ?")
          .run(caption, task.imageId);
        invalidateContextEmbeddingCache();
        emitContextCaptionUpdated(task.imageId, caption);
      } catch (err) {
        console.error('[ContextRefine] Failed:', task?.fullPath, err.message);
      } finally {
        _contextCaptionRefinePending.delete(task.imageId);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    _contextCaptionRefineRunning = false;
  }
}

function getEmbeddingCache() {
  // Use both count AND max rowid to detect changes — count alone misses delete+insert (same count)
  const stats = db.prepare('SELECT COUNT(*) as c, COALESCE(MAX(rowid), 0) as maxId FROM image_captions WHERE embedding IS NOT NULL').get();
  if (_embeddingCache && _embeddingCacheCount === stats.c && _embeddingCacheMaxRowId === stats.maxId) return _embeddingCache;
  
  const rows = db.prepare(`
    SELECT i.id, i.full_path, i.thumb_path, ic.captions, ic.embedding
    FROM images i
    JOIN image_captions ic ON i.id = ic.image_id
    WHERE ic.embedding IS NOT NULL
  `).all();

  _embeddingCache = [];
  for (const row of rows) {
    let emb;
    try { emb = JSON.parse(row.embedding); } catch { continue; }
    _embeddingCache.push({ image_id: row.id, full_path: row.full_path, thumb_path: row.thumb_path, captions: row.captions, embedding: emb });
  }
  _embeddingCacheCount = stats.c;
  _embeddingCacheMaxRowId = stats.maxId;
  return _embeddingCache;
}

ipcMain.handle('dismiss-context-result', (_, { query, imageId }) => {
  const normalizedQuery = normalizeContextQuery(query)
  if (!normalizedQuery || !imageId) return { success: false }
  db.prepare('INSERT OR IGNORE INTO dismissed_context_results (query_text, image_id) VALUES (?, ?)').run(normalizedQuery, imageId)
  return { success: true }
})

ipcMain.handle('context-search', async (_, { query, minSimilarity }) => {
  if (!query || !query.trim()) return [];
  const normalizedQuery = normalizeContextQuery(query)
  const fallbackThreshold = typeof minSimilarity === 'number' ? minSimilarity : 0.2
  const effectiveThreshold = typeof minSimilarity === 'number' ? Math.max(0.08, minSimilarity - 0.08) : 0.12
  const dismissedIds = new Set(
    db.prepare('SELECT image_id FROM dismissed_context_results WHERE query_text = ?').all(normalizedQuery).map((row) => row.image_id)
  )

  try {
    // 1. Compute CLIP text embedding for the search query
    const rawQuery = query.trim();
    const queryEmbedding = await getHybridQueryEmbedding(rawQuery);

    // 2. Load cached image embeddings (auto-refreshes when count changes)
    const cachedRows = getEmbeddingCache();

    // 3. Compute hybrid score from semantic similarity plus caption/path text evidence.
    const rowSims = [];
    for (const row of cachedRows) {
      if (dismissedIds.has(row.image_id)) continue
      const semanticSim = cosineSimilarity(queryEmbedding, row.embedding);
      const textBoost = computeCaptionTextBoost(rawQuery, row.captions, row.full_path);
      const score = semanticSim + textBoost;
      if (semanticSim >= effectiveThreshold || textBoost >= 0.08) {
        rowSims.push({ ...row, similarity: semanticSim, rankingScore: score, textBoost });
      }
    }

    rowSims.sort((a, b) => b.rankingScore - a.rankingScore || b.similarity - a.similarity);
    const topN = rowSims.slice(0, 60);
    queueContextCaptionRefinement(topN.slice(0, 12));

    console.log(`[Search] context-search: "${rawQuery}" → returning top ${topN.length}/${rowSims.length}`);

    return topN.map(row => ({
      imageId: row.image_id,
      rawPath: row.full_path,
      original: toPlutoUrl(row.full_path),
      thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path),
      captions: row.captions,
      similarity: row.similarity
    }));
  } catch (err) {
    console.error('[CLIP] Search failed:', err.message);
    // Fallback to text-based caption search (stem + synonym aware)
    const keywords = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const conditions = [];
    const params = [];
    for (const k of keywords) {
      const { sql, params: p } = synonymLikeCondition(_synonymMap, k, 'ic.captions');
      conditions.push(sql);
      params.push(...p);
    }
    if (!conditions.length) return [];
    if (dismissedIds.size > 0) {
      conditions.push(`i.id NOT IN (${Array.from(dismissedIds).map(() => '?').join(',')})`)
      params.push(...Array.from(dismissedIds))
    }
    const rows = db.prepare(`
      SELECT i.id, i.full_path, i.thumb_path, ic.captions
      FROM images i JOIN image_captions ic ON i.id = ic.image_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.date_taken DESC
    `).all(...params);
    return rows.map(row => ({
      imageId: row.id,
      rawPath: row.full_path,
      original: toPlutoUrl(row.full_path),
      thumb: row.thumb_path && fs.existsSync(row.thumb_path) ? toPlutoUrl(row.thumb_path) : toPlutoUrl(row.full_path),
      captions: row.captions,
      similarity: fallbackThreshold,
    }));
  }
});

// --- Get scan progress stats ---
ipcMain.handle('get-caption-scan-stats', () => {
  const total = db.prepare("SELECT COUNT(*) as c FROM images WHERE file_type IN ('jpg','jpeg','png','webp','bmp','tiff','tif','heic','heif','avif')").get().c;
  const scanned = db.prepare('SELECT COUNT(*) as c FROM image_captions').get().c;
  return { total, scanned, remaining: total - scanned };
});

// --- Reset all caption data ---
ipcMain.handle('reset-caption-data', () => {
  db.prepare('DELETE FROM image_captions').run();
  invalidateContextEmbeddingCache();
  return { success: true };
});

protocol.registerSchemesAsPrivileged([{ scheme: 'pluto', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }]);

// --- SETTINGS HELPERS ---
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

// Initialize default settings if not present
const DEFAULT_SETTINGS = {
  theme: 'futuristic',
  thumbnailSize: 200,
  startupView: 'library',  // 'library' or 'last-view'
  thumbnailQuality: 75,
  onboardingComplete: false,
  language: 'en',
  autoUpdate: true
};

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  if (getSetting(key) === null) setSetting(key, value);
}

// --- Track first launch after update ---
{
  const currentVersion = app.getVersion();
  const lastVersion = getSetting('lastVersion');
  if (lastVersion && lastVersion !== currentVersion) {
    // App was updated — track it on the license server
    const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const serverUrl = 'https://license.plutophotos.com';
    fetch(`${serverUrl}/api/track-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, version: currentVersion })
    }).catch((err) => console.error('[TrackUpdate] Failed:', err.message));
  }
  setSetting('lastVersion', currentVersion);
}

// --- SETTINGS IPC HANDLERS ---
ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }
  return settings;
});

ipcMain.handle('get-setting', (_, key) => getSetting(key));

ipcMain.handle('set-setting', (_, { key, value }) => {
  setSetting(key, value);
  return { success: true };
});

ipcMain.handle('set-settings', (_, settingsObj) => {
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction((entries) => {
    for (const [key, value] of entries) {
      update.run(key, JSON.stringify(value));
    }
  })(Object.entries(settingsObj));
  return { success: true };
});

ipcMain.handle('get-cache-info', () => {
  let totalSize = 0;
  let fileCount = 0;
  try {
    const files = fs.readdirSync(cachePath);
    fileCount = files.length;
    for (const f of files) {
      totalSize += fs.statSync(join(cachePath, f)).size;
    }
  } catch {}
  return { path: cachePath, fileCount, totalSizeMB: (totalSize / (1024 * 1024)).toFixed(1) };
});

ipcMain.handle('clear-thumbnail-cache', () => {
  try {
    const files = fs.readdirSync(cachePath);
    for (const f of files) {
      fs.unlinkSync(join(cachePath, f));
    }
    // Also clear thumb_path from all images in DB
    db.prepare('UPDATE images SET thumb_path = NULL').run();
    return { success: true, cleared: files.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

// --- LICENSE IPC HANDLERS ---
ipcMain.handle('get-license-info', () => {
  return licenseManager.getLicenseInfo();
});

ipcMain.handle('activate-license', async (_, { email, licenseKey }) => {
  return licenseManager.activateLicense(email, licenseKey);
});

ipcMain.handle('deactivate-license', async () => {
  return licenseManager.deactivateLicense();
});

ipcMain.handle('validate-license', async () => {
  return licenseManager.validateLicense();
});

ipcMain.handle('start-free-trial', async (_, { email }) => {
  return licenseManager.startFreeTrial(email);
});

ipcMain.handle('check-feature', (_, featureName) => {
  return licenseManager.checkFeature(featureName);
});

ipcMain.handle('check-limit', (_, limitType) => {
  return licenseManager.checkLimit(limitType);
});

ipcMain.handle('get-usage-stats', () => {
  const imageCount = db.prepare('SELECT COUNT(*) as cnt FROM images').get().cnt;
  const albumCount = db.prepare('SELECT COUNT(*) as cnt FROM albums').get().cnt;
  const projectCount = db.prepare('SELECT COUNT(*) as cnt FROM projects').get().cnt;
  const folderCount = db.prepare('SELECT COUNT(*) as cnt FROM folders').get().cnt;
  return { imageCount, albumCount, projectCount, folderCount };
});

ipcMain.handle('check-for-updates', async () => {
  try {
    // Quick connectivity check — abort silently if offline
    const net = await import('net');
    const online = await new Promise((resolve) => {
      const socket = new net.default.Socket();
      socket.setTimeout(3000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.connect(443, 'plutophotos.com');
    });
    if (!online) return { available: false, offline: true };

    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version;
    const currentVersion = app.getVersion();
    return {
      available: latestVersion && latestVersion !== currentVersion,
      version: latestVersion,
      currentVersion,
      releaseNotes: result?.updateInfo?.releaseNotes || null,
    };
  } catch (err) {
    console.error('[AutoUpdater] check-for-updates error:', err.message);
    return { available: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    console.error('[AutoUpdater] download error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  console.log('[AutoUpdater] install-update IPC received, scheduling quitAndInstall...');
  // Clear any skipped version so the user doesn't skip the version they just installed
  setSetting('skippedUpdateVersion', null);
  // Defer quitAndInstall so the IPC response is sent before the app starts quitting.
  // On macOS, we must also remove the window-all-closed listener (which is a no-op on
  // darwin and can prevent the app from fully exiting) and force-close all windows so
  // the auto-updater can replace the bundle and relaunch.
  setImmediate(() => {
    console.log('[AutoUpdater] Removing window-all-closed listeners and destroying windows...');
    app.removeAllListeners('window-all-closed');
    const allWindows = BrowserWindow.getAllWindows();
    console.log(`[AutoUpdater] Destroying ${allWindows.length} window(s)...`);
    allWindows.forEach(w => {
      w.removeAllListeners('close');
      w.destroy();
    });
    console.log('[AutoUpdater] Calling autoUpdater.quitAndInstall(false, true)...');
    autoUpdater.quitAndInstall(false, true);
  });
});

ipcMain.handle('skip-update-version', (_, version) => {
  setSetting('skippedUpdateVersion', version);
  console.log(`[AutoUpdater] User skipped version ${version}`);
  return { success: true };
});

// --- AUTO-UPDATER SETUP ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

async function isOnline() {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = new net.default.Socket();
    socket.setTimeout(3000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(443, 'plutophotos.com');
  });
}

function setupAutoUpdater(win) {
  autoUpdater.on('update-available', (info) => {
    // Skip this version if the user previously dismissed it
    const skippedVersion = getSetting('skippedUpdateVersion', null);
    if (skippedVersion === info.version) {
      console.log(`[AutoUpdater] Skipping dismissed version ${info.version}`);
      return;
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || null,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', { version: info.version });
    }
    // Track this in-app update on the license server so it appears in the admin dashboard
    const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const serverUrl = process.env.PLUTO_LICENSE_SERVER || 'https://license.plutophotos.com';
    fetch(`${serverUrl}/api/track-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, version: info.version })
    }).catch(() => {});
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available.');
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });

  // Check for updates after a short delay — only if online
  setTimeout(async () => {
    if (getSetting('autoUpdate', true)) {
      try {
        const online = await isOnline();
        if (online) {
          autoUpdater.checkForUpdates().catch(() => {});
        } else {
          console.log('[AutoUpdater] Offline — skipping update check.');
        }
      } catch {
        // Silently ignore connectivity check errors
      }
    }
  }, 5000);
}

// --- Crash / error handlers ---
process.on('uncaughtException', (err) => {
  console.error('[Pluto] Uncaught exception:', err);
  try {
    const { dialog: dlg } = require('electron');
    dlg.showErrorBox('Pluto Photos — Unexpected Error',
      `An unexpected error occurred. The app will try to continue, but you may want to restart.\n\n${err?.message || err}`);
  } catch { /* dialog may not be available during early startup */ }
});
process.on('unhandledRejection', (reason) => {
  console.error('[Pluto] Unhandled rejection:', reason);
});

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080, height: 965, minWidth: 1080, minHeight: 965,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 10 } : undefined,
    backgroundColor: '#141414',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true }
  });

  // Notify renderer when maximize state changes
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-changed', false));

  // Security: prevent navigation to external URLs and block window.open
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  // Start auto-updater (skip in dev)
  if (!isDev) setupAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  restoreAllScopedFolderAccess();

  // --- Spin up worker thread pool for thumbnail generation ---
  initThumbWorkerPool();

  // --- Custom protocol handler (cross-platform) ---
  // Uses modern protocol.handle API (registerFileProtocol is deprecated and
  // broken on macOS in Electron 25+).
  // Track first few protocol requests so Mac users can verify the handler is working
  let protocolLogCount = 0;
  // Cache folder list and resolved paths to avoid DB queries on every protocol request
  // (variables and invalidation function are at module scope so IPC handlers can access them)
  const _getFolderPaths = () => {
    if (!_cachedFolderPaths) {
      _cachedFolders = db.prepare('SELECT path FROM folders').all();
      _cachedFolderPaths = _cachedFolders.map(f => {
        const r = path.resolve(f.path);
        return process.platform === 'win32' ? r.toLowerCase() : r;
      });
    }
    return _cachedFolderPaths;
  };
  protocol.handle('pluto', async (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (protocolLogCount < 5) {
      protocolLogCount++;
      console.log(`[pluto://] Request #${protocolLogCount}: url=${request.url} hostname=${url.hostname} pathname=${url.pathname}`);
    }
    if (process.platform === 'win32') {
      // Windows: pluto://E/Users/... → E:/Users/...
      p = p.replace(/^\//, '');
      // Standard-scheme URLs put the drive letter in the hostname
      // (pluto://E/path → hostname "e", pathname "/path"). Restore it first.
      if (url.hostname && /^[a-zA-Z]$/.test(url.hostname)) {
        p = url.hostname.toUpperCase() + ':' + (p.startsWith('/') ? '' : '/') + p;
      } else if (p.length > 1 && p[1] !== ':' && /^[a-zA-Z]/.test(p)) {
        // Fallback for non-standard URL forms where drive letter is in the path
        p = p[0] + ':' + p.substring(1);
      }
    } else if (url.hostname) {
      // Linux/macOS: standard-scheme URL parsing treats the first path segment
      // as the hostname (pluto:///home/user/... → hostname="home", pathname="/user/...").
      // Reconstruct the full path by prepending /<hostname>.
      p = '/' + url.hostname + p;
    }
    // On macOS/Linux the leading / is preserved: pluto:///home/... → /home/...
    const resolved = path.resolve(path.normalize(p));
    if (protocolLogCount <= 5) {
      console.log(`[pluto://] Resolved path: ${resolved}`);
    }
    // Only allow files within registered library folders, the thumbnail cache,
    // or bundled app assets (e.g. RMBG ONNX models)
    // Windows paths are case-insensitive, so compare lowercase on win32
    const ci = (s) => process.platform === 'win32' ? s.toLowerCase() : s;
    const folderPaths = _getFolderPaths();
    const faceModelDir = path.resolve(getAssetPath('resources/face-models'));
    const birefnetDir = path.resolve(getAssetPath('resources/birefnet'));
    const resolvedCI = ci(resolved);
    const sep = path.sep;
    const allowed = folderPaths.some(fp => resolvedCI.startsWith(fp + sep) || resolvedCI === fp)
      || _ephemeralAllowedPaths.has(resolvedCI)
      || !!db.prepare('SELECT 1 FROM images WHERE full_path = ? COLLATE NOCASE').get(resolved)
      || resolvedCI.startsWith(ci(path.resolve(cachePath)) + sep)
      || resolvedCI.startsWith(ci(faceModelDir) + sep)
      || resolvedCI.startsWith(ci(birefnetDir) + sep);
    if (!allowed) {
      console.error('[pluto://] Blocked access to:', resolved);
      return new Response('Access denied', { status: 403 });
    }
    try {
      // Video files: handle Range requests manually for reliable streaming.
      // Large MP4s often request suffix ranges (for metadata near EOF), so
      // support the full bytes=start-end / bytes=start- / bytes=-suffix forms.
      const videoRe = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
      if (videoRe.test(resolved)) {
        let stat;
        try { stat = fs.statSync(resolved); } catch {
          return new Response('Not found', { status: 404 });
        }
        const total = stat.size;
        const ext = path.extname(resolved).toLowerCase();
        const mimeMap = { '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.mkv':'video/x-matroska', '.avi':'video/x-msvideo', '.m4v':'video/x-m4v', '.3gp':'video/3gpp', '.wmv':'video/x-ms-wmv', '.flv':'video/x-flv', '.mpg':'video/mpeg', '.mpeg':'video/mpeg' };
        const mime = mimeMap[ext] || 'application/octet-stream';

        const rangeHeader = request.headers.get('Range');
        let status = 200;
        let start = 0;
        let end = total - 1;

        if (rangeHeader) {
          const spec = rangeHeader.match(/bytes=([^,]+)/i)?.[1]?.trim();
          const [startPart = '', endPart = ''] = spec ? spec.split('-') : [];

          if (startPart === '' && endPart === '') {
            return new Response('Invalid Range', {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}` },
            });
          }

          if (startPart === '') {
            const suffixLength = parseInt(endPart, 10);
            if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
              return new Response('Invalid Range', {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` },
              });
            }
            start = Math.max(total - suffixLength, 0);
          } else {
            start = parseInt(startPart, 10);
            if (!Number.isFinite(start) || start < 0 || start >= total) {
              return new Response('Range Not Satisfiable', {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` },
              });
            }
            if (endPart !== '') {
              end = parseInt(endPart, 10);
            }
          }

          if (!Number.isFinite(end)) end = total - 1;
          end = Math.min(end, total - 1);

          if (end < start) {
            return new Response('Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}` },
            });
          }

          status = 206;
        }

        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(resolved, { start, end });
        return new Response(Readable.toWeb(stream), {
          status,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes',
            ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {}),
          },
        });
      }
      // Serve all other files directly from disk (images, thumbnails, etc.)
      // Using net.fetch(file://) is unreliable in newer Electron versions —
      // read the file buffer ourselves for guaranteed delivery.
      if (!fs.existsSync(resolved)) {
        return new Response('Not found', { status: 404 });
      }
      const data = fs.readFileSync(resolved);
      const ext2 = path.extname(resolved).toLowerCase();
      const imgMimeMap = { '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.svg':'image/svg+xml', '.bmp':'image/bmp', '.ico':'image/x-icon', '.tiff':'image/tiff', '.tif':'image/tiff', '.avif':'image/avif', '.pdf':'application/pdf', '.onnx':'application/octet-stream' };
      const contentType = imgMimeMap[ext2] || 'application/octet-stream';
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Content-Length': String(data.length) },
      });
    } catch (err) {
      console.error('[pluto://] Fetch error:', resolved, err.message);
      const folderPath = getContainingLibraryFolder(resolved);
      if (folderPath && (err?.code === 'EACCES' || err?.code === 'EPERM' || err?.code === 'ENOENT')) {
        setMacFolderAccessIssue(folderPath, 'pluto-protocol-read', err, {
          guidance: supportsSecurityScopedBookmarks
            ? 'This folder could not be read through the app protocol. Remove and re-add it, then retry the thumbnail or file open.'
            : 'macOS likely revoked access to this folder. Remove and re-add it, then retry.',
        });
      }
      return new Response('Not found', { status: 404 });
    }
  });

  // --- macOS application menu (enables Cmd+C/V/X/Q/Z/A) ---
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
          { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' }, { role: 'zoom' }, { role: 'close' },
          { type: 'separator' }, { role: 'front' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  // Window control IPC handlers
  ipcMain.handle('window-minimize', () => mainWindow.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window-close', () => {
    if (process.platform === 'darwin') mainWindow.hide();
    else mainWindow.close();
  });
  ipcMain.handle('window-is-maximized', () => mainWindow.isMaximized());

  if (isPackagedSmokeTest) {
    runPackagedStartupSmokeTest()
      .then((code) => {
        apiServer.stop().catch(() => {}).finally(() => app.exit(code));
      })
      .catch((err) => {
        console.error('[PackagedSmoke] Fatal error:', err);
        apiServer.stop().catch(() => {}).finally(() => app.exit(1));
      });
    return;
  }

  createMainWindow();

  apiServer.start(3456).catch(err => console.error('[Pluto API] Failed to start:', err));
});

// --- App lifecycle ---
let _appQuitting = false;
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    apiServer.stop().catch(() => {});
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: re-create or show window when dock icon is clicked
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  _appQuitting = true;
  for (const stop of _scopedFolderAccessStops.values()) {
    try { stop(); } catch {}
  }
  _scopedFolderAccessStops.clear();
  // Clear thumbnail batch timer to prevent post-quit IPC sends
  if (_thumbReadyTimer) { clearTimeout(_thumbReadyTimer); _thumbReadyTimer = null; }
  // Terminate worker threads before closing DB
  for (const w of _thumbWorkers) { try { w.terminate(); } catch {} }
  _thumbWorkers.length = 0;
  _thumbWorkerReady.length = 0;
  apiServer.stop().catch(() => {});
  try { db.close(); } catch {}
});

ipcMain.handle('get-individual-files', async () => {
  // Return files not in any folder or album
  const rows = db.prepare(`SELECT * FROM images WHERE folder_id IS NULL AND id NOT IN (SELECT image_id FROM album_images)`).all();
  return rows;
});

ipcMain.handle('delete-edited-file', async (_, editId) => {
  const edit = db.prepare('SELECT output_path FROM image_edits WHERE id = ?').get(editId);
  db.prepare('DELETE FROM image_edits WHERE id = ?').run(editId);
  // Also remove the edited file from the images table and from disk
  if (edit && edit.output_path) {
    db.prepare('DELETE FROM images WHERE full_path = ?').run(edit.output_path);
    // Clean up the physical file to prevent orphaned disk usage
    try {
      if (fs.existsSync(edit.output_path)) fs.unlinkSync(edit.output_path);
    } catch (e) {
      console.warn('[delete-edited-file] Could not remove file from disk:', e.message);
    }
  }
  return { success: true };
});

ipcMain.handle('get-edited-files', async () => {
  const rows = db.prepare(`
    SELECT ie.id as edit_id, ie.output_path, ie.created_at, ie.edit_data,
           i.full_path as original_path, i.name as original_name
    FROM image_edits ie
    LEFT JOIN images i ON ie.image_id = i.id
    WHERE ie.output_path IS NOT NULL
    ORDER BY ie.created_at DESC
  `).all();
  return rows;
});

ipcMain.handle('delete-file', (_, filePath) => {
  // Remove file from database (not from disk)
  const clean = path.normalize(decodeURIComponent(filePath.replace(/^pluto:\/\//i, '')));
  db.prepare('DELETE FROM images WHERE full_path = ?').run(clean);
  return { success: true };
});
