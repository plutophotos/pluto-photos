#!/usr/bin/env node

/**
 * Pluto Photos — Headless Server
 * ============================================================
 * Runs the Pluto Photos API server + web gallery without Electron.
 * Designed for Docker / NAS / self-hosted deployments.
 *
 * Environment variables:
 *   PLUTO_DATA_DIR     — Where to store DB + thumbnails + TLS certs (default: /data)
 *   PLUTO_MEDIA_DIRS   — Comma-separated list of media directories to auto-import (default: /photos)
 *   PLUTO_PORT         — API server port (default: 3456)
 *   PLUTO_WEB_PASSWORD — Initial web password (optional, can be set later via API)
 *   PLUTO_WEB_USERNAME — Initial web username (default: admin)
 *   PLUTO_LICENSE_SERVER — License server URL (default: https://license.plutophotos.com)
 *   PLUTO_SCAN_INTERVAL — Auto-scan interval in minutes (default: 60, 0 to disable)
 *   PLUTO_LOG_LEVEL    — Log level: debug, info, warn, error (default: info)
 *
 * Usage:
 *   node src/server/index.js
 *   docker run -v /mnt/photos:/photos -v pluto-data:/data -p 3456:3456 plutophotos/server
 */

import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import crypto from 'crypto'
import exifr from 'exifr'
import ffmpeg from 'fluent-ffmpeg'
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readPsd, initializeCanvas as initPsdCanvas } from 'ag-psd'
import { createApiServer } from '../main/api-server.js'
import { createLicenseManager } from '../main/license.js'
import { CLIPTokenizer } from '../main/clip-tokenizer.js'

// ============================================================
// Configuration
// ============================================================

const DATA_DIR = process.env.PLUTO_DATA_DIR || '/data'
const MEDIA_DIRS = (process.env.PLUTO_MEDIA_DIRS || '/photos').split(',').map(d => d.trim()).filter(Boolean)
const PORT = parseInt(process.env.PLUTO_PORT || '3456', 10)
const SCAN_INTERVAL = parseInt(process.env.PLUTO_SCAN_INTERVAL || '60', 10)
const LOG_LEVEL = process.env.PLUTO_LOG_LEVEL || 'info'

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] ?? 1

function log(level, ...args) {
  if ((LOG_LEVELS[level] ?? 1) >= currentLogLevel) {
    const prefix = `[Pluto ${level.toUpperCase()}]`
    if (level === 'error') console.error(prefix, ...args)
    else if (level === 'warn') console.warn(prefix, ...args)
    else console.log(prefix, ...args)
  }
}

// ============================================================
// Initialize dependencies
// ============================================================

// Disable pdf.js worker (we're in Node)
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

// Initialize ag-psd canvas
initPsdCanvas(createCanvas)

// In Docker/headless mode, ffmpeg is expected to be installed system-wide.
// No need for ffmpeg-static — just verify ffmpeg is available.
try {
  execSync('ffmpeg -version', { stdio: 'ignore' })
  log('info', 'Using system ffmpeg')
} catch {
  log('warn', 'ffmpeg not found — video thumbnails will not be generated')
}

// Disable sharp cache (reduces memory in long-running server)
sharp.cache(false)

// ============================================================
// Paths
// ============================================================

const dbPath = path.join(DATA_DIR, 'image_catalog.db')
const cachePath = path.join(DATA_DIR, 'thumbnails')
const appVersion = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8'))
    return pkg.version || '0.0.0'
  } catch { return '0.0.0' }
})()

// Ensure directories exist
for (const dir of [DATA_DIR, cachePath]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

log('info', `Pluto Photos Server v${appVersion}`)
log('info', `Data directory: ${DATA_DIR}`)
log('info', `Media directories: ${MEDIA_DIRS.join(', ')}`)

// ============================================================
// Database
// ============================================================

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    path TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    is_collapsed INTEGER DEFAULT 0
  );
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
  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    name TEXT,
    cover_path TEXT,
    sort_order INTEGER DEFAULT 0,
    project_id INTEGER,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(name, project_id)
  );
  CREATE TABLE IF NOT EXISTS album_images (
    album_id INTEGER, image_id INTEGER,
    PRIMARY KEY (album_id, image_id),
    FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS image_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
    UNIQUE(image_id, tag)
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
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS smart_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rules TEXT NOT NULL,
    icon TEXT DEFAULT '🔍',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS image_hashes (
    image_id INTEGER PRIMARY KEY,
    phash TEXT,
    file_size INTEGER,
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS dismissed_duplicates (
    image_id_1 INTEGER NOT NULL,
    image_id_2 INTEGER NOT NULL,
    PRIMARY KEY (image_id_1, image_id_2),
    FOREIGN KEY(image_id_1) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY(image_id_2) REFERENCES images(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS image_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER,
    edit_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    output_path TEXT
  );

  -- Feature 15: Contextual Search (CLIP embedding-based)
  CREATE TABLE IF NOT EXISTS image_captions (
    image_id INTEGER PRIMARY KEY,
    captions TEXT NOT NULL,
    embedding TEXT,
    scanned_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
  );
`)

// --- Migrations ---
try {
  const cols = db.prepare("PRAGMA table_info(images)").all().map(c => c.name)
  if (!cols.includes('rating')) db.exec("ALTER TABLE images ADD COLUMN rating INTEGER DEFAULT 0")
  if (!cols.includes('color_label')) db.exec("ALTER TABLE images ADD COLUMN color_label TEXT DEFAULT ''")
  if (!cols.includes('gps_lat')) db.exec("ALTER TABLE images ADD COLUMN gps_lat REAL")
  if (!cols.includes('gps_lng')) db.exec("ALTER TABLE images ADD COLUMN gps_lng REAL")
  if (!cols.includes('gps_scanned')) db.exec("ALTER TABLE images ADD COLUMN gps_scanned INTEGER DEFAULT 0")
} catch (e) { /* columns already exist */ }

try {
  const peopleCols = db.prepare("PRAGMA table_info(people)").all().map(c => c.name)
  if (!peopleCols.includes('centroid')) db.exec("ALTER TABLE people ADD COLUMN centroid TEXT")
} catch (e) { /* column already exists */ }

// --- License manager ---
const licenseManager = createLicenseManager(db)

// ============================================================
// Settings helpers
// ============================================================

function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? JSON.parse(row.value) : defaultValue
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
}

// Initialize default settings
const DEFAULT_SETTINGS = {
  theme: 'futuristic',
  thumbnailSize: 200,
  startupView: 'library',
  thumbnailQuality: 75,
  onboardingComplete: false,
  language: 'en',
  autoUpdate: false, // Not applicable in Docker
}
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  if (getSetting(key) === null) setSetting(key, value)
}

// ============================================================
// Thumbnail generation (same logic as Electron version)
// ============================================================

async function getOrCreateThumbnail(fullPath) {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex')
  const thumbFilePath = path.join(cachePath, `${hash}.webp`)
  try { await fs.promises.access(thumbFilePath); return thumbFilePath } catch { /* not cached */ }

  const ext = path.extname(fullPath).toLowerCase()
  const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(fullPath)
  const isPdf = ext === '.pdf'

  try {
    // PDFs
    if (isPdf) {
      try {
        const data = new Uint8Array(fs.readFileSync(fullPath))
        const canvasFactory = {
          create: (width, height) => {
            const canvas = createCanvas(width, height)
            return { canvas, context: canvas.getContext('2d') }
          },
          reset: (canvasAndContext, width, height) => {
            canvasAndContext.canvas.width = width
            canvasAndContext.canvas.height = height
          },
          destroy: (canvasAndContext) => {
            canvasAndContext.canvas.width = 0
            canvasAndContext.canvas.height = 0
          },
        }
        const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, canvasFactory, disableFontFace: true, isEvalSupported: false }).promise
        const page = await doc.getPage(1)
        const viewport = page.getViewport({ scale: 1.0 })
        const scale = Math.min(600 / viewport.width, 600 / viewport.height)
        const scaledViewport = page.getViewport({ scale })
        const canvasAndContext = canvasFactory.create(Math.floor(scaledViewport.width), Math.floor(scaledViewport.height))
        await page.render({ canvasContext: canvasAndContext.context, viewport: scaledViewport }).promise
        const pngBuffer = canvasAndContext.canvas.toBuffer('image/png')
        await sharp(pngBuffer).resize(600, 600, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } }).webp({ quality: 80 }).toFile(thumbFilePath)
        return thumbFilePath
      } catch (pdfErr) {
        log('warn', 'PDF thumbnail error:', pdfErr.message)
        const svgBuffer = Buffer.from(`<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="600" fill="#1a1a1a"/><rect x="150" y="100" width="300" height="400" rx="20" fill="#E53935"/><text x="300" y="340" text-anchor="middle" font-size="100" fill="white" font-family="Arial, sans-serif" font-weight="bold">PDF</text></svg>`)
        await sharp(svgBuffer).webp({ quality: 80 }).toFile(thumbFilePath)
        return thumbFilePath
      }
    }

    // Videos
    if (isVideo) {
      return new Promise((resolve) => {
        let settled = false
        const finish = (value) => {
          if (settled) return
          settled = true
          resolve(value)
        }

        ffmpeg(fullPath)
          .screenshots({ count: 1, timemarks: ['00:00:01'], filename: `${hash}-temp.jpg`, folder: cachePath })
          .on('end', async () => {
            const tempPath = path.join(cachePath, `${hash}-temp.jpg`)
            if (!fs.existsSync(tempPath)) {
              log('warn', 'Video thumbnail temp file missing:', tempPath)
              finish(null)
              return
            }

            try {
              await sharp(tempPath).resize(600, 600, { fit: 'cover' }).webp().toFile(thumbFilePath)
              finish(thumbFilePath)
            } catch (err) {
              log('warn', 'Video thumbnail post-process error:', err.message)
              finish(null)
            } finally {
              try { fs.unlinkSync(tempPath) } catch { setTimeout(() => { try { fs.unlinkSync(tempPath) } catch {} }, 1000) }
            }
          })
          .on('error', (err) => {
            log('warn', 'Video thumbnail error:', err.message)
            finish(null)
          })
      })
    }

    // PSD files
    if (ext === '.psd') {
      try {
        const buffer = fs.readFileSync(fullPath)
        const psd = readPsd(buffer, { skipLayerImageData: true, skipThumbnail: false })
        if (psd.canvas) {
          const pngBuffer = Buffer.from(psd.canvas.toBuffer('image/png'))
          await sharp(pngBuffer).resize(600, 600, { fit: 'cover' }).webp({ quality: 75 }).toFile(thumbFilePath)
          return thumbFilePath
        }
      } catch (psdErr) {
        log('warn', 'PSD thumbnail error:', psdErr.message)
        const svgBuffer = Buffer.from(`<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="600" fill="#1a1a1a"/><rect x="150" y="120" width="300" height="360" rx="20" fill="#2d5a9e"/><text x="300" y="330" text-anchor="middle" font-size="80" fill="white" font-family="Arial, sans-serif" font-weight="bold">PSD</text></svg>`)
        await sharp(svgBuffer).webp({ quality: 80 }).toFile(thumbFilePath)
        return thumbFilePath
      }
    }

    // Images
    await sharp(fullPath, { failOn: 'none' }).rotate().resize(600, 600, { fit: 'cover' }).webp({ quality: 75 }).toFile(thumbFilePath)
    return thumbFilePath
  } catch (err) {
    log('error', 'Thumbnail error:', err.message)
    return null
  }
}

// ============================================================
// Media scanning
// ============================================================

const SUPPORTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg|pdf|ico|psd)$/i

function walkDir(dir) {
  const entries = []
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        entries.push(...walkDir(fullPath))
      } else if (SUPPORTED_EXTENSIONS.test(item.name)) {
        entries.push(fullPath)
      }
    }
  } catch (err) {
    log('warn', `Cannot read directory ${dir}:`, err.message)
  }
  return entries
}

async function scanMediaDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    log('warn', `Media directory not found: ${dirPath}`)
    return { added: 0, removed: 0 }
  }

  log('info', `Scanning: ${dirPath}`)

  // Ensure root folder is registered
  let folder = db.prepare('SELECT id FROM folders WHERE path = ?').get(dirPath)
  if (!folder) {
    db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').run(dirPath)
    folder = db.prepare('SELECT id FROM folders WHERE path = ?').get(dirPath)
  }

  const filesOnDisk = walkDir(dirPath)
  const filesOnDiskSet = new Set(filesOnDisk)

  // Build a cache of parent-dir → folder_id, creating subfolders as needed
  const folderCache = new Map()
  folderCache.set(dirPath, folder.id)
  const ensureFolder = (parentDir) => {
    if (folderCache.has(parentDir)) return folderCache.get(parentDir)
    let f = db.prepare('SELECT id FROM folders WHERE path = ?').get(parentDir)
    if (!f) {
      db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').run(parentDir)
      f = db.prepare('SELECT id FROM folders WHERE path = ?').get(parentDir)
    }
    folderCache.set(parentDir, f.id)
    return f.id
  }

  // Get ALL existing DB entries whose full_path starts with this dirPath
  const dbRows = db.prepare('SELECT id, full_path, folder_id FROM images WHERE full_path LIKE ?').all(dirPath + '/%')
  const existingPaths = new Map(dbRows.map(row => [row.full_path, row]))

  // Remove stale entries
  const staleIds = dbRows.filter(row => !filesOnDiskSet.has(row.full_path)).map(row => row.id)
  if (staleIds.length) {
    const del = db.prepare('DELETE FROM images WHERE id = ?')
    db.transaction((ids) => { ids.forEach(id => del.run(id)) })(staleIds)
    log('info', `Removed ${staleIds.length} stale entries from ${dirPath}`)
  }

  // Add new files (assigning correct subfolder) and fix misassigned existing files
  const newFiles = filesOnDisk.filter(f => !existingPaths.has(f))
  if (newFiles.length) {
    const insert = db.prepare('INSERT OR IGNORE INTO images (folder_id, name, full_path, file_type, date_taken) VALUES (?, ?, ?, ?, ?)')
    db.transaction((list) => {
      for (const fullPath of list) {
        try {
          const stats = fs.statSync(fullPath)
          const parentDir = path.dirname(fullPath)
          const fid = ensureFolder(parentDir)
          insert.run(fid, path.basename(fullPath), fullPath, path.extname(fullPath).slice(1).toLowerCase(), stats.mtimeMs)
        } catch (err) {
          log('warn', `Cannot stat ${fullPath}:`, err.message)
        }
      }
    })(newFiles)
    log('info', `Added ${newFiles.length} new files from ${dirPath}`)
  }

  // Fix existing images that have wrong folder_id
  const updateFolder = db.prepare('UPDATE images SET folder_id = ? WHERE id = ?')
  let fixed = 0
  db.transaction(() => {
    for (const fullPath of filesOnDisk) {
      const existing = existingPaths.get(fullPath)
      if (!existing) continue
      const parentDir = path.dirname(fullPath)
      const correctFolderId = ensureFolder(parentDir)
      if (existing.folder_id !== correctFolderId) {
        updateFolder.run(correctFolderId, existing.id)
        fixed++
      }
    }
  })()
  if (fixed > 0) log('info', `Fixed folder assignment for ${fixed} images`)

  return { added: newFiles.length, removed: staleIds.length }
}

// Background thumbnail generation
async function generateMissingThumbnails() {
  const images = db.prepare('SELECT id, full_path FROM images WHERE thumb_path IS NULL LIMIT 100').all()
  if (images.length === 0) return 0

  log('info', `Generating thumbnails for ${images.length} images...`)
  let generated = 0
  for (const img of images) {
    try {
      const thumbPath = await getOrCreateThumbnail(img.full_path)
      if (thumbPath) {
        db.prepare('UPDATE images SET thumb_path = ? WHERE id = ?').run(thumbPath, img.id)
        generated++
      }
    } catch (err) {
      log('warn', `Thumbnail failed for ${img.full_path}:`, err.message)
    }
  }
  log('info', `Generated ${generated} thumbnails`)
  return generated
}

// Background GPS extraction
async function extractMissingGps() {
  const images = db.prepare("SELECT id, full_path FROM images WHERE gps_scanned = 0 AND file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif') LIMIT 200").all()
  if (images.length === 0) return 0

  log('info', `Extracting GPS from ${images.length} images...`)
  let found = 0
  for (const img of images) {
    try {
      let gpsFound = false
      // Method 1: exifr.gps()
      let gps = await exifr.gps(img.full_path).catch(() => null)
      if (gps?.latitude && gps?.longitude) {
        db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(gps.latitude, gps.longitude, img.id)
        found++
        continue
      }

      // Method 2: exifr.parse with gps flag
      const exif = await exifr.parse(img.full_path, { gps: true }).catch(() => null)
      if (exif?.latitude && exif?.longitude) {
        db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(exif.latitude, exif.longitude, img.id)
        found++
        continue
      }

      // Method 3: Google Takeout sidecar
      const dir = path.dirname(img.full_path)
      const name = path.basename(img.full_path)
      for (const sidecar of [name + '.supplemental-metadata.json', name + '.json']) {
        const sidecarPath = path.join(dir, sidecar)
        try {
          if (fs.existsSync(sidecarPath)) {
            const meta = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
            const geo = meta.geoData || meta.geoDataExif
            if (geo?.latitude && geo.latitude !== 0 && geo?.longitude && geo.longitude !== 0) {
              db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(geo.latitude, geo.longitude, img.id)
              found++
              gpsFound = true
              break
            }
          }
        } catch {}
      }
      // Mark as scanned even if no GPS found
      if (!gpsFound) db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
    } catch {
      // Mark as scanned on error too so we don't retry forever
      db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
    }
  }
  if (found > 0) log('info', `Extracted GPS for ${found} images`)
  return found
}

// ============================================================
// FEATURE: Contextual Search — Captioning + Semantic Search
// ============================================================
// Uses ViT-GPT2 (ONNX) for caption generation and CLIP ViT-B/32
// (ONNX) for search embeddings. Fully offline.
// ============================================================

function getAssetPath(relPath) {
  return path.join(path.resolve(import.meta.dirname, '../..'), relPath)
}

let _clipVisionSession = null
let _clipTextSession = null
let _clipTokenizer = null

let _captionEncoderSession = null
let _captionDecoderSession = null
let _captionId2Token = null
let _captionKVLayers = 0

const CAPTION_HEADS = 12
const CAPTION_HEAD_DIM = 64
const CAPTION_BOS = 50256
const CAPTION_EOS = 50256
const CAPTION_MAX_NEW = 30

/**
 * Reduce a search keyword to a SQL LIKE pattern that matches common
 * morphological variants.
 */
function stemToPattern(word) {
  let w = word.toLowerCase()
  const suffixes = [
    'iness',
    'ness', 'ment', 'able', 'ible', 'tion', 'sion',
    'ical', 'ally', 'ized', 'ised',
    'ful', 'ous', 'ive', 'ing', 'ely',
    'ies', 'ied', 'ers', 'est', 'ess',
    'ed', 'ly', 'er', 'es', 'en',
    'e', 's'
  ]
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length)
      break
    }
  }
  return `%${w}%`
}

/** Search synonym map loaded from resources/search-synonyms.json */
const _synonymMap = {}
try {
  const synPath = getAssetPath('resources/search-synonyms.json')
  if (fs.existsSync(synPath)) {
    const synData = JSON.parse(fs.readFileSync(synPath, 'utf-8'))
    for (const group of synData.groups || []) {
      for (const w of group) _synonymMap[w.toLowerCase()] = group.map(g => g.toLowerCase())
    }
    log('info', `Loaded ${(synData.groups || []).length} synonym groups from search-synonyms.json`)
  }
} catch (e) {
  log('warn', 'Failed to load search-synonyms.json: ' + e.message)
}

/** Build SQL LIKE condition(s) with synonym + stem expansion */
function synonymLikeCondition(keyword, column = 'captions') {
  const w = keyword.toLowerCase()
  const group = _synonymMap[w]
  const seen = new Set()
  const patterns = []
  const words = group || [w]
  for (const syn of words) {
    const pat = stemToPattern(syn)
    if (!seen.has(pat)) { seen.add(pat); patterns.push(pat) }
  }
  if (patterns.length === 1) return { sql: `${column} LIKE ?`, params: patterns }
  return {
    sql: `(${patterns.map(() => `${column} LIKE ?`).join(' OR ')})`,
    params: patterns
  }
}

function cosineSimilarity(a, b) {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

function l2Normalise(vec) {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

/** Lazy-load CLIP ONNX sessions + tokenizer */
async function ensureCLIP() {
  if (_clipVisionSession && _clipTextSession && _clipTokenizer) return

  const ort = await import('onnxruntime-node')
  const modelDir = getAssetPath('resources/caption-model')

  if (!_clipVisionSession) {
    const p = path.join(modelDir, 'clip_vision.onnx')
    if (!fs.existsSync(p)) throw new Error('CLIP vision model not found: ' + p)
    _clipVisionSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' })
    await new Promise(r => setTimeout(r, 0))
  }

  if (!_clipTextSession) {
    const p = path.join(modelDir, 'clip_text.onnx')
    if (!fs.existsSync(p)) throw new Error('CLIP text model not found: ' + p)
    _clipTextSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' })
    await new Promise(r => setTimeout(r, 0))
  }

  if (!_clipTokenizer) {
    const vocabPath = path.join(modelDir, 'vocab.json')
    const mergesPath = path.join(modelDir, 'merges.txt')
    if (!fs.existsSync(vocabPath)) throw new Error('Tokenizer vocab.json not found')
    if (!fs.existsSync(mergesPath)) throw new Error('Tokenizer merges.txt not found')
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf-8'))
    const mergesRaw = fs.readFileSync(mergesPath, 'utf-8').split('\n')
    const merges = mergesRaw.filter(l => l.trim() && !l.startsWith('#'))
    _clipTokenizer = new CLIPTokenizer(vocab, merges)
  }
}

/** Compute CLIP image embedding (512-dim, L2-normalised) */
async function getImageEmbedding(imageBuffer) {
  const ort = await import('onnxruntime-node')
  await ensureCLIP()

  const S = 224
  const mean = [0.48145466, 0.4578275, 0.40821073]
  const std  = [0.26862954, 0.26130258, 0.27577711]

  const rgbBuf = await sharp(imageBuffer)
    .resize(S, S, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer()

  const input = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) {
    input[i]             = (rgbBuf[i * 3]     / 255.0 - mean[0]) / std[0]
    input[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - mean[1]) / std[1]
    input[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - mean[2]) / std[2]
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, S, S])
  const inputName = _clipVisionSession.inputNames[0]
  const results = await _clipVisionSession.run({ [inputName]: tensor })
  const outputName = _clipVisionSession.outputNames[0]
  const embedding = Array.from(results[outputName].data)

  return l2Normalise(embedding)
}

/** Compute CLIP text embedding (512-dim, L2-normalised) */
async function getTextEmbedding(text) {
  const ort = await import('onnxruntime-node')
  await ensureCLIP()

  const tokens = _clipTokenizer.encode(text)
  const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)))
  const attentionMask = new BigInt64Array(tokens.map(t => t !== 0 ? 1n : 0n))

  const feeds = {}
  for (const name of _clipTextSession.inputNames) {
    if (name.includes('input_ids') || name === 'input_ids') {
      feeds[name] = new ort.Tensor('int64', inputIds, [1, 77])
    } else if (name.includes('attention_mask') || name === 'attention_mask') {
      feeds[name] = new ort.Tensor('int64', attentionMask, [1, 77])
    }
  }

  const results = await _clipTextSession.run(feeds)
  const outputName = _clipTextSession.outputNames[0]
  const embedding = Array.from(results[outputName].data)

  return l2Normalise(embedding)
}

/** Lazy-load ViT encoder + GPT2 decoder + tokenizer */
async function ensureCaptionPipeline() {
  if (_captionEncoderSession && _captionDecoderSession && _captionId2Token) return

  const ort = await import('onnxruntime-node')
  const modelDir = getAssetPath('resources/blip-model')

  if (!_captionEncoderSession) {
    const fp32 = path.join(modelDir, 'onnx', 'encoder_model.onnx')
    const quant = path.join(modelDir, 'onnx', 'encoder_model_quantized.onnx')
    const p = fs.existsSync(quant) ? quant : fp32
    if (!fs.existsSync(p)) throw new Error('ViT encoder model not found: ' + p)
    log('info', 'Loading ViT encoder (' + (p === fp32 ? 'fp32' : 'quantized') + ')...')
    _captionEncoderSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' })
    await new Promise(r => setTimeout(r, 0))
  }

  if (!_captionDecoderSession) {
    const p = path.join(modelDir, 'onnx', 'decoder_model_merged_quantized.onnx')
    if (!fs.existsSync(p)) throw new Error('GPT2 decoder model not found: ' + p)
    log('info', 'Loading GPT2 decoder...')
    _captionDecoderSession = await ort.InferenceSession.create(p, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' })
    await new Promise(r => setTimeout(r, 0))
    _captionKVLayers = _captionDecoderSession.inputNames.filter(n => n.startsWith('past_key_values') && n.endsWith('.key')).length
  }

  if (!_captionId2Token) {
    const tokPath = path.join(modelDir, 'tokenizer.json')
    if (!fs.existsSync(tokPath)) throw new Error('Tokenizer not found: ' + tokPath)
    const tokData = JSON.parse(fs.readFileSync(tokPath, 'utf-8'))
    _captionId2Token = {}
    for (const [tok, id] of Object.entries(tokData.model.vocab)) {
      _captionId2Token[id] = tok
    }
    log('info', 'Caption model ready.')
  }
}

/** Generate free-form caption candidates via beam-search GPT2 decoding */
async function generateCaptionCandidates(imageInput) {
  await ensureCaptionPipeline()
  const ort = await import('onnxruntime-node')

  const S = 224
  const rgbBuf = await sharp(imageInput)
    .resize(S, S, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()

  const pixels = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) {
    pixels[i]             = (rgbBuf[i * 3]     / 255.0 - 0.5) / 0.5
    pixels[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - 0.5) / 0.5
    pixels[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - 0.5) / 0.5
  }

  const encResult = await _captionEncoderSession.run({
    pixel_values: new ort.Tensor('float32', pixels, [1, 3, S, S])
  })
  const encoderHidden = encResult.last_hidden_state

  const BEAM_WIDTH = 5

  function emptyKV() {
    const kv = {}
    for (let i = 0; i < _captionKVLayers; i++) {
      kv[i] = {
        key: new ort.Tensor('float32', new Float32Array(0), [1, CAPTION_HEADS, 0, CAPTION_HEAD_DIM]),
        value: new ort.Tensor('float32', new Float32Array(0), [1, CAPTION_HEADS, 0, CAPTION_HEAD_DIM])
      }
    }
    return kv
  }

  let beams = [{ tokens: [CAPTION_BOS], score: 0, kv: emptyKV() }]
  let completed = []

  for (let step = 0; step < CAPTION_MAX_NEW; step++) {
    const candidates = []

    for (const beam of beams) {
      const isFirst = step === 0
      const inputIds = isFirst
        ? new ort.Tensor('int64', BigInt64Array.from(beam.tokens.map(BigInt)), [1, beam.tokens.length])
        : new ort.Tensor('int64', BigInt64Array.from([BigInt(beam.tokens[beam.tokens.length - 1])]), [1, 1])

      const feeds = {
        input_ids: inputIds,
        encoder_hidden_states: encoderHidden,
        use_cache_branch: new ort.Tensor('bool', [!isFirst], [1])
      }
      for (let i = 0; i < _captionKVLayers; i++) {
        feeds[`past_key_values.${i}.key`] = beam.kv[i].key
        feeds[`past_key_values.${i}.value`] = beam.kv[i].value
      }

      const decResult = await _captionDecoderSession.run(feeds)
      const newKV = {}
      for (let i = 0; i < _captionKVLayers; i++) {
        newKV[i] = { key: decResult[`present.${i}.key`], value: decResult[`present.${i}.value`] }
      }

      const logits = decResult.logits
      const vocabSize = logits.dims[2]
      const offset = (logits.dims[1] - 1) * vocabSize
      let maxLogit = -Infinity
      for (let v = 0; v < vocabSize; v++) {
        if (logits.data[offset + v] > maxLogit) maxLogit = logits.data[offset + v]
      }
      let sumExp = 0
      for (let v = 0; v < vocabSize; v++) sumExp += Math.exp(logits.data[offset + v] - maxLogit)
      const logSumExp = Math.log(sumExp) + maxLogit

      const topK = BEAM_WIDTH * 2
      const picked = new Set()
      for (let k = 0; k < topK; k++) {
        let bestIdx = -1, bestVal = -Infinity
        for (let v = 0; v < vocabSize; v++) {
          if (!picked.has(v) && logits.data[offset + v] > bestVal) {
            bestVal = logits.data[offset + v]
            bestIdx = v
          }
        }
        if (bestIdx < 0) break
        picked.add(bestIdx)
        candidates.push({
          tokens: [...beam.tokens, bestIdx],
          score: beam.score + (logits.data[offset + bestIdx] - logSumExp),
          kv: newKV,
          lastToken: bestIdx
        })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const nextBeams = []
    for (const c of candidates) {
      if (c.lastToken === CAPTION_EOS && step > 0) {
        completed.push(c)
      } else {
        nextBeams.push(c)
      }
      if (nextBeams.length >= BEAM_WIDTH) break
    }

    beams = nextBeams
    if (beams.length === 0 || completed.length >= BEAM_WIDTH) break
  }

  function decodeTokens(tokens) {
    return tokens.slice(1)
      .filter(id => id !== CAPTION_EOS)
      .map(id => _captionId2Token[id] || '')
      .join('')
      .replace(/\u0120/g, ' ')
      .trim()
  }

  if (completed.length > 0) {
    return completed.map(c => ({ text: decodeTokens(c.tokens), score: c.score / c.tokens.length }))
  }
  return [{ text: decodeTokens(beams[0].tokens), score: 0 }]
}

/** Check if caption models are available */
function captionModelsAvailable() {
  const clipDir = getAssetPath('resources/caption-model')
  const captionDir = getAssetPath('resources/blip-model')
  const clipOk = fs.existsSync(path.join(clipDir, 'clip_vision.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'clip_text.onnx')) &&
                 fs.existsSync(path.join(clipDir, 'vocab.json')) &&
                 fs.existsSync(path.join(clipDir, 'merges.txt'))
  const encoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model.onnx')) ||
                    fs.existsSync(path.join(captionDir, 'onnx', 'encoder_model_quantized.onnx'))
  const decoderOk = fs.existsSync(path.join(captionDir, 'onnx', 'decoder_model_merged_quantized.onnx'))
  return clipOk && encoderOk && decoderOk
}

/** Caption a single image: generate caption + CLIP embedding, store in DB */
async function captionImage(imageId, imagePath) {
  const clean = path.normalize(imagePath)
  if (!fs.existsSync(clean)) return { success: false, error: 'File not found' }

  const buf = fs.readFileSync(clean)
  const [candidates, imageEmbedding] = await Promise.all([
    generateCaptionCandidates(buf),
    getImageEmbedding(buf)
  ])

  let caption
  if (candidates.length > 1) {
    let bestScore = -Infinity
    for (const cand of candidates) {
      const textEmb = await getTextEmbedding(cand.text)
      const sim = cosineSimilarity(imageEmbedding, textEmb)
      if (sim > bestScore) { bestScore = sim; caption = cand.text }
    }
  } else {
    caption = candidates[0].text
  }

  const embeddingStr = JSON.stringify(imageEmbedding)
  db.prepare('INSERT OR REPLACE INTO image_captions (image_id, captions, embedding) VALUES (?, ?, ?)')
    .run(imageId, caption, embeddingStr)

  return { success: true, captions: caption }
}

/** Run contextual search: CLIP embedding similarity + text fallback */
async function contextSearch(query) {
  if (!query || !query.trim()) return []

  try {
    const rawQuery = query.trim()
    const prompted = rawQuery.match(/^a photo of /i) ? rawQuery : 'a photo of ' + rawQuery
    const queryEmbedding = await getTextEmbedding(prompted)

    const rows = db.prepare(`
      SELECT i.id, i.full_path, i.thumb_path, ic.captions, ic.embedding
      FROM images i
      JOIN image_captions ic ON i.id = ic.image_id
      WHERE ic.embedding IS NOT NULL
    `).all()

    const rowSims = []
    for (const row of rows) {
      let emb
      try { emb = JSON.parse(row.embedding) } catch { continue }
      const sim = cosineSimilarity(queryEmbedding, emb)
      rowSims.push({ ...row, similarity: sim })
    }

    rowSims.sort((a, b) => b.similarity - a.similarity)
    const topN = rowSims.slice(0, Math.max(20, Math.floor(rowSims.length * 0.5)))

    log('info', `context-search: "${rawQuery}" → returning top ${topN.length}/${rowSims.length}`)
    return topN
  } catch (err) {
    log('error', 'CLIP search failed: ' + err.message)
    // Fallback to text-based caption search
    const keywords = query.toLowerCase().split(/[\s,]+/).filter(Boolean)
    const conditions = []
    const params = []
    for (const k of keywords) {
      const { sql, params: p } = synonymLikeCondition(k, 'ic.captions')
      conditions.push(sql)
      params.push(...p)
    }
    if (!conditions.length) return []
    const rows = db.prepare(`
      SELECT i.id, i.full_path, i.thumb_path, ic.captions
      FROM images i JOIN image_captions ic ON i.id = ic.image_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.date_taken DESC
    `).all(...params)
    return rows
  }
}

/** Background caption scan — processes all un-captioned images */
async function runBackgroundCaptionScan() {
  if (!licenseManager.checkFeature('contextSearch')) {
    log('debug', 'Contextual search not available (license)')
    return
  }
  if (!captionModelsAvailable()) {
    log('debug', 'Caption models not found — skipping caption scan')
    return
  }

  const images = db.prepare(`
    SELECT i.id, i.full_path, i.file_type
    FROM images i
    WHERE i.file_type IN ('jpg','jpeg','png','webp','bmp','tiff','tif','heic','heif','avif')
      AND i.id NOT IN (SELECT image_id FROM image_captions)
  `).all()
  if (!images.length) return

  log('info', `Caption scan: ${images.length} images to process...`)

  // Pre-warm model sessions (yield between loads so HTTP requests aren't blocked)
  await ensureCaptionPipeline()
  await new Promise(r => setTimeout(r, 0))
  await ensureCLIP()
  await new Promise(r => setTimeout(r, 0))

  let processed = 0
  for (const img of images) {
    try {
      await captionImage(img.id, img.full_path)
      processed++
      if (processed % 50 === 0) log('info', `Caption scan progress: ${processed}/${images.length}`)
    } catch (err) {
      log('warn', `Caption failed for ${img.full_path}: ${err.message}`)
    }
  }
  log('info', `Caption scan complete: ${processed}/${images.length} images processed`)
}

// ============================================================
// API Server setup
// ============================================================

// Create a config object that replaces the Electron app object
const appConfig = {
  getPath: (name) => {
    if (name === 'userData') return DATA_DIR
    return DATA_DIR
  },
  getAppPath: () => {
    // Point to the project root so api-server can find resources/icon.png
    return path.resolve(import.meta.dirname, '../..')
  },
}

const apiServer = createApiServer(db, appConfig, getOrCreateThumbnail, licenseManager)

// Register import-folder handler for the web UI
apiServer.onImportFolder(async (folderPath) => {
  if (!fs.existsSync(folderPath)) throw new Error('Directory not found: ' + folderPath)
  const stat = fs.statSync(folderPath)
  if (!stat.isDirectory()) throw new Error('Path is not a directory: ' + folderPath)
  // Add to runtime MEDIA_DIRS if not already tracked
  if (!MEDIA_DIRS.includes(folderPath)) MEDIA_DIRS.push(folderPath)
  // Scan the directory
  const result = await scanMediaDirectory(folderPath)
  // Generate thumbnails + captions for new files in the background
  setImmediate(async () => {
    try { let g = 1; while (g > 0) { g = await generateMissingThumbnails() } } catch (e) { log('warn', 'Thumb gen error after import:', e.message) }
    try { await runBackgroundCaptionScan() } catch (e) { log('warn', 'Caption scan error after import:', e.message) }
  })
  return result
})

// Register contextual search handler
apiServer.onContextSearch(async (query) => {
  return await contextSearch(query)
})

// Register caption model check handler
apiServer.onCaptionModelCheck(() => {
  return captionModelsAvailable()
})

// Register caption image handler
apiServer.onCaptionImage(async (imageId, imagePath) => {
  return await captionImage(imageId, imagePath)
})

// ============================================================
// Initial web credentials
// ============================================================

if (process.env.PLUTO_WEB_PASSWORD) {
  const username = process.env.PLUTO_WEB_USERNAME || 'admin'
  const existingCreds = db.prepare("SELECT value FROM settings WHERE key = 'web_credentials'").get()
  if (!existingCreds) {
    // First run — set credentials from env
    apiServer.setCredentials(username, process.env.PLUTO_WEB_PASSWORD)
    log('info', `Web credentials set for user: ${username}`)
  } else {
    // Subsequent run — re-apply env password if it changed (so editing .env always works)
    try {
      const stored = JSON.parse(existingCreds.value)
      const envHash = crypto.pbkdf2Sync(process.env.PLUTO_WEB_PASSWORD, stored.salt, 100000, 64, 'sha512').toString('hex')
      if (envHash !== stored.hash || stored.username !== username) {
        apiServer.setCredentials(username, process.env.PLUTO_WEB_PASSWORD)
        log('info', `Web credentials updated for user: ${username}`)
      }
    } catch {
      // Corrupted credentials — reset them
      apiServer.setCredentials(username, process.env.PLUTO_WEB_PASSWORD)
      log('info', `Web credentials reset for user: ${username}`)
    }
  }
}

// ============================================================
// Startup
// ============================================================

async function start() {
  log('info', '──────────────────────────────────────')
  log('info', '  Pluto Photos — Headless Server')
  log('info', '──────────────────────────────────────')

  // Initial scan of all media directories (fast — just reads filesystem + inserts into DB)
  for (const dir of MEDIA_DIRS) {
    try {
      await scanMediaDirectory(dir)
    } catch (err) {
      log('error', `Failed to scan ${dir}:`, err.message)
    }
  }

  // Start the API server FIRST so it's immediately accessible
  try {
    const info = await apiServer.start(PORT)
    log('info', `API server started on port ${PORT}`)
    if (info.https) {
      log('info', `HTTPS enabled`)
    } else {
      log('warn', `Running in HTTP-only mode — set up a reverse proxy for TLS in production`)
    }
    const proto = info.https ? 'https' : 'http'
    log('info', `  → ${proto}://localhost:${PORT}`)
  } catch (err) {
    log('error', 'Failed to start API server:', err.message)
    process.exit(1)
  }

  const imageCount = db.prepare('SELECT COUNT(*) as c FROM images').get().c
  const folderCount = db.prepare('SELECT COUNT(*) as c FROM folders').get().c
  log('info', `Library: ${imageCount} images in ${folderCount} folders`)
  log('info', 'Server ready! Generating thumbnails in the background...')

  // Generate thumbnails, extract GPS, and run caption scan in the background
  setImmediate(async () => {
    try {
      let generated = 1
      while (generated > 0) {
        generated = await generateMissingThumbnails()
      }
      await extractMissingGps()
      log('info', 'Background processing complete (thumbnails + GPS)')
      // Run caption scan after thumbnails/GPS are done
      await runBackgroundCaptionScan()
    } catch (err) {
      log('error', 'Background processing error:', err.message)
    }
  })

  // Periodic re-scan
  if (SCAN_INTERVAL > 0) {
    log('info', `Auto-scan enabled: every ${SCAN_INTERVAL} minutes`)
    setInterval(async () => {
      log('debug', 'Running periodic scan...')
      for (const dir of MEDIA_DIRS) {
        try {
          await scanMediaDirectory(dir)
        } catch (err) {
          log('error', `Periodic scan failed for ${dir}:`, err.message)
        }
      }
      // Generate thumbnails for any new files
      let gen = 1
      while (gen > 0) {
        gen = await generateMissingThumbnails()
      }
      // Extract GPS
      await extractMissingGps()
      // Caption new images
      try { await runBackgroundCaptionScan() } catch (e) { log('warn', 'Periodic caption scan error:', e.message) }
    }, SCAN_INTERVAL * 60 * 1000)
  }
}

// ============================================================
// Graceful shutdown
// ============================================================

function shutdown(signal) {
  log('info', `${signal} received, shutting down...`)
  apiServer.stop().catch(() => {})
  try { db.close() } catch {}
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection:', reason)
})

// Start the server
start()
