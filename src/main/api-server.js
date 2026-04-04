import http from 'http'
import https from 'https'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawn } from 'child_process'
import exifr from 'exifr'
import selfsigned from 'selfsigned'
import { getWebAppHtml, getLoginHtml } from './web-ui.js'
import { recomputePersonCentroid, cleanupOrphanedPeople, euclidean, cosineSimilarity, l2Normalise, ensureArcFace, computeArcFaceDescriptor } from './shared.js'

// Conditionally load Electron shell (not available in Docker/server mode).
// electron-vite bundles main process to CJS where require() exists and 'electron'
// is externalised. In Docker ESM mode, electron isn't installed so this will be null.
let _shell = null
try {
  // eslint-disable-next-line no-undef
  _shell = require('electron').shell
} catch {
  // Running without Electron (Docker/headless) — shell.trashItem unavailable
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.pdf': 'application/pdf',
}

export function getLocalIPs() {
  const interfaces = os.networkInterfaces()
  const addresses = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address })
      }
    }
  }
  return addresses
}

// --- Authentication helpers ---
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return { salt, hash }
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt)
  // Constant-time comparison to prevent timing attacks on password hashes
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    return false
  }
}

// In-memory session store (tokens expire after 7 days)
const sessions = new Map()
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

function createSession() {
  // Cap sessions to prevent memory growth (e.g., automated logins)
  if (sessions.size > 1000) {
    // Evict oldest sessions first
    const entries = [...sessions.entries()].sort((a, b) => a[1].created - b[1].created)
    for (let i = 0; i < entries.length - 500; i++) sessions.delete(entries[i][0])
  }
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { created: Date.now() })
  return token
}

function isValidSession(token) {
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() - session.created > SESSION_MAX_AGE) {
    sessions.delete(token)
    return false
  }
  return true
}

function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  cookieHeader.split(';').forEach(c => {
    const [key, ...rest] = c.trim().split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  })
  return cookies
}

// --- Rate limiting (per-IP login brute-force protection) ---
const loginAttempts = new Map() // ip -> { count, firstAttempt, lockedUntil }
const RATE_LIMIT_MAX = 5        // max failed attempts
const RATE_LIMIT_WINDOW = 15 * 60 * 1000  // 15 minute window
const LOCKOUT_DURATION = 15 * 60 * 1000   // 15 minute lockout

function getClientIP(req) {
  // Never trust X-Forwarded-For — it's client-controlled and trivially spoofable.
  // Only use the actual TCP socket address for auth decisions.
  return req.socket.remoteAddress || 'unknown'
}

function isRateLimited(ip) {
  const record = loginAttempts.get(ip)
  if (!record) return false
  // If locked out, check if lockout has expired
  if (record.lockedUntil) {
    if (Date.now() < record.lockedUntil) return true
    // Lockout expired, reset
    loginAttempts.delete(ip)
    return false
  }
  return false
}

function recordFailedLogin(ip) {
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now(), lockedUntil: null }
  // Reset counter if window expired
  if (Date.now() - record.firstAttempt > RATE_LIMIT_WINDOW) {
    record.count = 0
    record.firstAttempt = Date.now()
  }
  record.count++
  if (record.count >= RATE_LIMIT_MAX) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION
    console.log(`[Pluto Security] IP ${ip} locked out for ${LOCKOUT_DURATION / 60000} minutes after ${record.count} failed login attempts`)
  }
  loginAttempts.set(ip, record)
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip)
}

// Clean up stale rate-limit entries every 30 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of loginAttempts) {
    if (record.lockedUntil && now > record.lockedUntil) loginAttempts.delete(ip)
    else if (now - record.firstAttempt > RATE_LIMIT_WINDOW) loginAttempts.delete(ip)
  }
}, 30 * 60 * 1000)

// --- General request rate limiting (per-IP, all endpoints) ---
const requestCounts = new Map() // ip -> { count, windowStart }
const REQ_RATE_LIMIT = 1500     // max requests per window (galleries load many thumbnails at once)
const REQ_RATE_WINDOW = 60000   // 1 minute window

function isRequestRateLimited(ip) {
  const now = Date.now()
  const record = requestCounts.get(ip) || { count: 0, windowStart: now }
  if (now - record.windowStart > REQ_RATE_WINDOW) {
    record.count = 1
    record.windowStart = now
    requestCounts.set(ip, record)
    return false
  }
  record.count++
  requestCounts.set(ip, record)
  return record.count > REQ_RATE_LIMIT
}

// Clean up request rate entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of requestCounts) {
    if (now - record.windowStart > REQ_RATE_WINDOW * 2) requestCounts.delete(ip)
  }
}, 5 * 60 * 1000)

// --- Self-signed TLS certificate generation (pure JS, no openssl needed) ---
async function ensureTlsCerts(certDir) {
  const keyPath = path.join(certDir, 'server.key')
  const certPath = path.join(certDir, 'server.crt')

  // Reuse existing cert if less than 350 days old
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const stat = fs.statSync(certPath)
      const ageMs = Date.now() - stat.mtimeMs
      if (ageMs < 350 * 24 * 60 * 60 * 1000) {
        console.log('[Pluto Security] Reusing existing TLS certificate')
        return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
      }
    } catch { /* regenerate */ }
  }

  console.log('[Pluto Security] Generating self-signed TLS certificate...')
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true })

  try {
    // Build Subject Alternative Names (SANs) for all local IPs
    const altNames = [
      { type: 2, value: 'localhost' },   // DNS
      { type: 7, ip: '127.0.0.1' },      // IP
    ]
    for (const addr of getLocalIPs()) {
      altNames.push({ type: 7, ip: addr.address })
    }

    const attrs = [{ name: 'commonName', value: 'Pluto Photos' }]
    const pems = await selfsigned.generate(attrs, {
      keySize: 2048,
      days: 365,
      algorithm: 'sha256',
      extensions: [
        { name: 'subjectAltName', altNames },
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
      ],
    })

    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 })
    fs.writeFileSync(certPath, pems.cert)
    console.log('[Pluto Security] TLS certificate generated successfully')
    return { key: Buffer.from(pems.private), cert: Buffer.from(pems.cert) }
  } catch (err) {
    console.error('[Pluto Security] Failed to generate TLS certificate:', err.message)
    return null
  }
}

export function createApiServer(db, electronApp, getOrCreateThumbnail, licenseManager = null) {
  const PORT = 3456

  // --- Concurrency limit for on-the-fly thumbnail generation via API ---
  let apiThumbActive = 0
  const API_THUMB_MAX_CONCURRENT = 6

  // --- Auth DB helpers ---
  const getCredentials = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'web_credentials'").get()
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return null }
  }

  const setCredentials = (username, password) => {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    const { salt, hash } = hashPassword(password)
    const value = JSON.stringify({ username, hash, salt })
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('web_credentials', ?)").run(value)
    // Clear all sessions when password changes
    sessions.clear()
    return true
  }

  const clearCredentials = () => {
    db.prepare("DELETE FROM settings WHERE key = 'web_credentials'").run()
    sessions.clear()
    return true
  }

  // --- Auth check: returns true if request is authenticated ---
  const isAuthenticated = (req) => {
    const creds = getCredentials()
    // If no credentials are set, check if request is from localhost
    // Remote access ALWAYS requires a password — never expose photos without auth
    if (!creds) {
      const clientIP = getClientIP(req)
      const isLocal = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1'
      return isLocal  // Only allow access without password from localhost
    }
    // Check session cookie
    const cookies = parseCookies(req.headers.cookie)
    const token = cookies['pluto_session']
    return isValidSession(token)
  }

  // --- Path safety: ensure a file path is within a registered library folder or thumbnails cache ---
  const thumbCacheDir = path.resolve(path.join(electronApp.getPath('userData'), 'thumbnails'))
  const ephemeralPreviewPaths = new Set()
  // Case-insensitive comparison on Windows (NTFS is case-insensitive)
  const ci = (s) => process.platform === 'win32' ? s.toLowerCase() : s
  const normalizeAllowedPath = (filePath) => ci(path.resolve(filePath))
  const videoFileTypes = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp', 'wmv', 'flv', 'mpg', 'mpeg'])
  const audioFileTypes = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff'])
  const isPathAllowed = (filePath) => {
    const resolved = normalizeAllowedPath(filePath)
    // Allow files from the thumbnails cache directory (album covers for videos, etc.)
    if (resolved.startsWith(ci(thumbCacheDir) + path.sep) || resolved === ci(thumbCacheDir)) return true
    // Allow files within registered library folders
    const folders = db.prepare('SELECT path FROM folders').all()
    return folders.some(f => {
      const fp = ci(path.resolve(f.path))
      return resolved.startsWith(fp + path.sep) || resolved === fp
    })
  }
  const isEphemeralPreviewPath = (filePath) => ephemeralPreviewPaths.has(normalizeAllowedPath(filePath))
  const getMountedBrowseRoots = () => {
    const discovered = new Map()
    const addRoot = (rootPath) => {
      if (!rootPath) return
      try {
        const resolved = path.resolve(rootPath)
        if (!fs.existsSync(resolved)) return
        if (!fs.statSync(resolved).isDirectory()) return
        discovered.set(ci(resolved), resolved)
      } catch {}
    }

    addRoot('/photos')
    addRoot('/imports')
    addRoot('/data')

    try {
      const folders = db.prepare('SELECT path FROM folders').all()
      folders.forEach((folder) => addRoot(folder.path))
    } catch {}

    return Array.from(discovered.values())
  }
  const isMountedBrowsePathAllowed = (filePath) => {
    const resolved = normalizeAllowedPath(filePath)
    return getMountedBrowseRoots().some((rootPath) => {
      const allowedRoot = normalizeAllowedPath(rootPath)
      return resolved === allowedRoot || resolved.startsWith(allowedRoot + path.sep)
    })
  }
  const isMediaSourcePathAllowed = (filePath) => isPathAllowed(filePath) || isMountedBrowsePathAllowed(filePath)

  // --- Helpers ---
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    // NOTE: 'unsafe-inline' for style-src is required by Vue runtime styles.
    // script-src 'unsafe-inline' is needed for the inline <script> bootstrap in getWebAppHtml().
    // Since this is a local-network companion UI (not public-facing), the risk is acceptable.
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'none'",
  }

  const json = (res, data, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
    })
    res.end(JSON.stringify(data))
  }

  const serveFile = (res, req, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return json(res, { error: 'File not found' }, 404)
      }

      const ext = path.extname(filePath).toLowerCase()
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
      const stat = fs.statSync(filePath)

      const headers = {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400',
        'Accept-Ranges': 'bytes',
        ...SECURITY_HEADERS,
      }

      // Range request support (essential for video streaming on mobile)
      const range = req.headers.range
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunksize = end - start + 1

        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize,
        })
        fs.createReadStream(filePath, { start, end }).pipe(res)
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': stat.size })
        fs.createReadStream(filePath).pipe(res)
      }
    } catch (err) {
      json(res, { error: err.message }, 500)
    }
  }

  const getVideoEditorAssetDir = () => {
    const candidates = [
      path.join(process.cwd(), 'resources', 'video-editor-web'),
      path.join(process.cwd(), 'build', 'video-editor-web'),
      path.join(electronApp?.getAppPath?.() || process.cwd(), 'resources', 'video-editor-web'),
      path.join(electronApp?.getAppPath?.() || process.cwd(), 'build', 'video-editor-web'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || ''
  }

  const getVideoEditorEntryPath = (rootDir) => {
    if (!rootDir) return ''
    const candidates = [
      'video-editor.html',
      path.join('src', 'renderer', 'video-editor.html'),
    ]
    return candidates.find((relativePath) => fs.existsSync(path.join(rootDir, relativePath))) || ''
  }

  const serveStaticFromDir = (res, req, rootDir, relativePath) => {
    if (!rootDir) return json(res, { error: 'Asset bundle unavailable' }, 404)
    const assetPath = path.resolve(rootDir, relativePath)
    if (!assetPath.startsWith(path.resolve(rootDir))) return json(res, { error: 'Forbidden' }, 403)
    return serveFile(res, req, assetPath)
  }

  const generateVideoThumbnailData = (inputPath, timeSec) => new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(Math.max(0, Number(timeSec) || 0)),
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', 'scale=320:-1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ]

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let stderr = ''
    proc.stdout.on('data', (chunk) => chunks.push(chunk))
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`)
    })
  })

  // --- License helper ---
  const checkLicense = (feature) => {
    if (!licenseManager) return true // No license manager = no restrictions (Electron mode)
    return licenseManager.checkFeature(feature)
  }
  const getLimits = () => {
    if (!licenseManager) return { maxProjects: Infinity, maxFolders: Infinity, maxImages: Infinity, maxAlbums: Infinity }
    const info = licenseManager.getLicenseInfo()
    return info.limits
  }

  const runFfmpegCommand = (args) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
    })
  })

  const probeMediaStreamInfo = async (inputPath) => {
    try {
      await runFfmpegCommand(['-hide_banner', '-i', inputPath])
      return { hasAudio: false, width: 1280, height: 720, duration: 0 }
    } catch (err) {
      const message = err?.message || ''
      const videoMatch = message.match(/Video:.*?(\d{2,5})x(\d{2,5})/i)
      const durationMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i)
      return {
        hasAudio: /Audio:/i.test(message),
        width: videoMatch ? Number(videoMatch[1]) : 1280,
        height: videoMatch ? Number(videoMatch[2]) : 720,
        duration: durationMatch
          ? (Number(durationMatch[1]) * 3600) + (Number(durationMatch[2]) * 60) + Number(durationMatch[3])
          : 0,
      }
    }
  }

  const buildExportPresetConfig = (exportPreset, referenceInfo = {}) => {
    const even = (value, fallback) => {
      const numeric = Number(value) || fallback
      const rounded = Math.max(2, Math.round(numeric))
      return rounded % 2 === 0 ? rounded : rounded + 1
    }

    if (exportPreset === '480p') return { width: 854, height: 480 }
    if (exportPreset === '720p') return { width: 1280, height: 720 }
    if (exportPreset === '1080p') return { width: 1920, height: 1080 }

    return {
      width: even(referenceInfo.width, 1280),
      height: even(referenceInfo.height, 720),
    }
  }

  const buildDerivedVideoPath = (inputPath, suffix = 'edited') => {
    const ext = path.extname(inputPath)
    const baseName = path.basename(inputPath, ext)
    const dir = path.dirname(inputPath)
    const outputExt = /^\.(mkv|avi)$/i.test(ext) ? '.mp4' : (ext || '.mp4')
    let outputPath = path.join(dir, `${baseName}_${suffix}${outputExt}`)
    let counter = 1
    while (fs.existsSync(outputPath)) {
      outputPath = path.join(dir, `${baseName}_${suffix}_${counter}${outputExt}`)
      counter += 1
    }
    return { outputPath, outputExt }
  }

  const getEffectiveClipFadeWindow = ({ duration, fadeIn = 0, fadeOut = 0, incomingTransition = 0, outgoingTransition = 0 }) => {
    const safeDuration = Math.max(0, Number(duration) || 0)
    const safeIncomingTransition = Math.max(0, Number(incomingTransition) || 0)
    const safeOutgoingTransition = Math.max(0, Number(outgoingTransition) || 0)
    const fadeInStart = Math.max(0, Math.min(safeDuration, safeIncomingTransition))
    const fadeOutEnd = Math.max(0, safeDuration - safeOutgoingTransition)
    const fadeInDuration = Math.min(Math.max(0, Number(fadeIn) || 0), Math.max(0, safeDuration - fadeInStart - 0.01))
    const fadeOutDuration = Math.min(Math.max(0, Number(fadeOut) || 0), Math.max(0, fadeOutEnd - 0.01))
    const fadeOutStart = Math.max(0, fadeOutEnd - fadeOutDuration)

    return { fadeInStart, fadeInDuration, fadeOutStart, fadeOutDuration }
  }

  const sanitizeTransitionType = (value) => new Set(['fade', 'fadeblack', 'wipeleft', 'wiperight', 'slideleft', 'slideright']).has(value) ? value : 'fade'
  const sanitizeAudioTransitionCurve = (value) => new Set(['tri', 'qsin', 'hsin', 'exp']).has(value) ? value : 'tri'
  const sanitizeClipRotation = (value) => {
    const numeric = Number(value) || 0
    const snapped = Math.round(numeric / 90) * 90
    const normalized = ((snapped % 360) + 360) % 360
    return [0, 90, 180, 270].includes(normalized) ? normalized : 0
  }
  const sanitizePercent = (value) => Math.min(100, Math.max(0, Number(value) || 0))
  const sanitizeRange = (value, min, max, fallback) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.min(max, Math.max(min, numeric))
  }
  const clampCrossfadeDuration = (value, leftDuration, rightDuration) => {
    const cap = Math.max(0, Math.min(Number(leftDuration) || 0, Number(rightDuration) || 0) - 0.05)
    return Math.min(Math.max(0, Number(value) || 0), cap)
  }

  const buildClipVideoFilter = ({ width, height, duration, fadeIn = 0, fadeOut = 0, fadeInStart = 0, fadeOutStart = 0, rotation = 0, exposure = 0, contrast = 100, saturation = 100, temperature = 0, tint = 0, stabilize = 0, stabilizeMode = 'standard', wobbleRepair = 0, wobbleCrop = 0, clarity = 0, videoDenoise = 0, speed = 1, scale = 100, posX = 0, posY = 0 }) => {
    const filters = []
    const wobbleAmount = Math.max(0, Number(wobbleRepair) || 0)
    const baseWobbleCropAmount = Math.min(25, Math.max(0, Number(wobbleCrop) || 0))
    const rollingShutterSafe = stabilizeMode === 'rolling'
    const effectiveStabilize = rollingShutterSafe
      ? Math.max(0, Number(stabilize) * 0.72 - (wobbleAmount * 0.5))
      : Math.max(0, Number(stabilize) - (wobbleAmount * 0.6))
    if (rotation === 90) filters.push('transpose=1')
    else if (rotation === 180) filters.push('transpose=1', 'transpose=1')
    else if (rotation === 270) filters.push('transpose=2')
    if (effectiveStabilize > 0.01) {
      const radius = rollingShutterSafe
        ? Math.max(16, Math.round((16 + (effectiveStabilize / 100) * 28) / 16) * 16)
        : Math.max(16, Math.round((16 + (effectiveStabilize / 100) * 48) / 16) * 16)
      const wobbleBias = wobbleAmount / 100
      const blocksize = rollingShutterSafe
        ? Math.max(4, Math.min(8, Math.round(4 + (effectiveStabilize / 100) * (3.5 - wobbleBias))))
        : Math.max(4, Math.min(12, Math.round(4 + (effectiveStabilize / 100) * (6 - wobbleBias * 2))))
      filters.push(`deshake=rx=${radius}:ry=${radius}:edge=${rollingShutterSafe ? 'blank' : 'mirror'}:blocksize=${blocksize}`)
    }
    const wobbleCropAmount = Math.min(25, Math.max(baseWobbleCropAmount, rollingShutterSafe && effectiveStabilize > 0.01 ? 3 + (wobbleAmount * 0.08) : 0))
    const combinedVideoDenoise = Math.min(100, Math.max(0, Number(videoDenoise) || 0) + wobbleAmount * 0.35)
    if (combinedVideoDenoise > 0.01) {
      const denoiseStrength = combinedVideoDenoise / 100
      const lumaSpatial = (1.2 + denoiseStrength * 5).toFixed(2)
      const chromaSpatial = (0.8 + denoiseStrength * 3.5).toFixed(2)
      const lumaTemporal = (1.8 + denoiseStrength * (7 + wobbleAmount / 25)).toFixed(2)
      const chromaTemporal = (1.1 + denoiseStrength * (5 + wobbleAmount / 40)).toFixed(2)
      filters.push(`hqdn3d=${lumaSpatial}:${chromaSpatial}:${lumaTemporal}:${chromaTemporal}`)
    }
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, 'setsar=1')
    if (wobbleCropAmount > 0.01) {
      const cropRatio = Math.max(0.72, 1 - (wobbleCropAmount / 100))
      const cropWidth = Math.max(2, Math.round((width * cropRatio) / 2) * 2)
      const cropHeight = Math.max(2, Math.round((height * cropRatio) / 2) * 2)
      filters.push(`crop=${cropWidth}:${cropHeight}:(iw-${cropWidth})/2:(ih-${cropHeight})/2`)
      filters.push(`scale=${width}:${height}:flags=lanczos`)
      filters.push('setsar=1')
    }
    filters.push('fps=30', 'format=yuv420p', 'setsar=1')
    if (Math.abs(exposure) > 0.01 || Math.abs(contrast - 100) > 0.01 || Math.abs(saturation - 100) > 0.01) {
      filters.push(`eq=brightness=${(exposure / 100 * 0.35).toFixed(3)}:contrast=${(contrast / 100).toFixed(3)}:saturation=${(saturation / 100).toFixed(3)}`)
    }
    if (Math.abs(temperature) > 0.01 || Math.abs(tint) > 0.01) {
      const warmth = Math.max(-0.4, Math.min(0.4, temperature / 100 * 0.35)).toFixed(3)
      const greenShift = Math.max(-0.3, Math.min(0.3, tint / 100 * -0.25)).toFixed(3)
      filters.push(`colorbalance=rs=${warmth}:rm=${warmth}:rh=${warmth}:bs=${(-Number(warmth)).toFixed(3)}:bm=${(-Number(warmth)).toFixed(3)}:bh=${(-Number(warmth)).toFixed(3)}:gs=${greenShift}:gm=${greenShift}:gh=${greenShift}`)
    }
    if (clarity > 0.01) filters.push(`unsharp=5:5:${(clarity / 100 * 2.2).toFixed(2)}:5:5:0.0`)
    if (scale !== 100 || posX !== 0 || posY !== 0) {
      const scaleFactor = Math.max(0.25, Math.min(2, scale / 100))
      const scaledW = Math.max(2, Math.round((width * scaleFactor) / 2) * 2)
      const scaledH = Math.max(2, Math.round((height * scaleFactor) / 2) * 2)
      const offsetX = Math.round((width - scaledW) / 2 + (posX / 100) * (width / 2))
      const offsetY = Math.round((height - scaledH) / 2 + (posY / 100) * (height / 2))
      filters.push(`scale=${scaledW}:${scaledH}:flags=lanczos`)
      filters.push(`pad=${width}:${height}:${Math.max(0, offsetX)}:${Math.max(0, offsetY)}:color=black`)
      filters.push('setsar=1')
    }
    if (fadeIn > 0.01) filters.push(`fade=t=in:st=${Math.max(0, fadeInStart).toFixed(3)}:d=${fadeIn.toFixed(3)}`)
    if (fadeOut > 0.01 && duration > fadeOutStart) filters.push(`fade=t=out:st=${Math.max(0, fadeOutStart).toFixed(3)}:d=${fadeOut.toFixed(3)}`)
    return filters.join(',')
  }

  const buildClipAudioFilter = ({ duration, fadeIn = 0, fadeOut = 0, fadeInStart = 0, fadeOutStart = 0, volume = 1, muted = false, audioDenoise = 0, speechFocus = false, loudnessNormalize = false, peakLimiter = false, speed = 1 }) => {
    const filters = ['aresample=48000', 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo', `volume=${muted ? 0 : Math.max(0, Number(volume) || 1).toFixed(3)}`]
    if (!muted && audioDenoise > 0.01) filters.push(`afftdn=nr=${(6 + (audioDenoise / 100) * 24).toFixed(1)}:nf=-28:tn=1`)
    if (!muted && speechFocus) {
      filters.push('highpass=f=110')
      filters.push('lowpass=f=7800')
      filters.push('acompressor=threshold=-18dB:ratio=2.2:attack=5:release=80:makeup=1.6')
    }
    if (!muted && loudnessNormalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11')
    if (!muted && peakLimiter) filters.push('alimiter=limit=0.95:level=disabled')
    if (speed !== 1) {
      if (speed >= 0.5 && speed <= 2) {
        filters.push(`atempo=${speed.toFixed(4)}`)
      } else if (speed < 0.5) {
        filters.push(`atempo=${(speed * 2).toFixed(4)}`, 'atempo=0.5')
      } else {
        filters.push(`atempo=${(speed / 2).toFixed(4)}`, 'atempo=2.0')
      }
    }
    if (fadeIn > 0.01) filters.push(`afade=t=in:st=${Math.max(0, fadeInStart).toFixed(3)}:d=${fadeIn.toFixed(3)}`)
    if (fadeOut > 0.01 && duration > fadeOutStart) filters.push(`afade=t=out:st=${Math.max(0, fadeOutStart).toFixed(3)}:d=${fadeOut.toFixed(3)}`)
    return filters.join(',')
  }

  const insertGeneratedVideo = (outputPath, outputExt, sourcePath) => {
    const name = path.basename(outputPath)
    const fileType = outputExt.replace('.', '')
    const srcRow = db.prepare('SELECT folder_id FROM images WHERE full_path = ?').get(sourcePath)
    const folderId = srcRow ? srcRow.folder_id : null
    db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type, folder_id) VALUES (?, ?, ?, ?)').run(outputPath, name, fileType, folderId)
  }

  // --- Read POST body (with size limit) ---
  const MAX_BODY_SIZE = 1048576 // 1MB — needed for smart album rules, batch ops
  const readBody = (req) => new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        resolve({})
        return
      }
      body += chunk
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })

  // --- Request handler (shared between HTTP and HTTPS) ---
  const requestHandler = async (req, res) => {
    const clientIP = getClientIP(req)
    const url = new URL(req.url, `https://${req.headers.host}`)
    const pathname = url.pathname

    // Global request rate limiting (skip for thumbnail/media — they burst during gallery loads
    // and are already behind the auth gate)
    const isAssetReq = pathname.startsWith('/api/thumbnail/') || pathname.startsWith('/api/media/')
    if (!isAssetReq && isRequestRateLimited(clientIP)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60', ...SECURITY_HEADERS })
      res.end(JSON.stringify({ error: 'Too many requests. Try again later.' }))
      return
    }

    // Request timeout — kill slow/hanging requests
    res.setTimeout(30000, () => {
      res.writeHead(408, SECURITY_HEADERS)
      res.end()
    })

    // Block non-GET/POST/OPTIONS methods
    if (!['GET', 'POST', 'OPTIONS', 'HEAD'].includes(req.method)) {
      res.writeHead(405, SECURITY_HEADERS)
      res.end()
      return
    }

    // CORS preflight — only allow same-origin, no wildcard
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        ...SECURITY_HEADERS,
      })
      res.end()
      return
    }

    try {
      // ===== LOGIN PAGE (always accessible) =====
      if (pathname === '/login') {
        const creds = getCredentials()
        if (!creds) {
          res.writeHead(302, { Location: '/', ...SECURITY_HEADERS })
          res.end()
          return
        }
        // Show lockout message if rate limited
        const locked = isRateLimited(clientIP)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS })
        res.end(getLoginHtml(locked))
        return
      }

      // ===== LOGIN API (always accessible but rate-limited) =====
      if (pathname === '/api/login' && req.method === 'POST') {
        // Check rate limit BEFORE processing
        if (isRateLimited(clientIP)) {
          const record = loginAttempts.get(clientIP)
          const remainSec = record ? Math.ceil((record.lockedUntil - Date.now()) / 1000) : 0
          return json(res, { error: `Too many failed attempts. Try again in ${Math.ceil(remainSec / 60)} minutes.` }, 429)
        }

        const { username, password } = await readBody(req)
        const creds = getCredentials()
        if (!creds) {
          return json(res, { error: 'No credentials configured' }, 400)
        }

        // Constant-time comparison for username to prevent timing attacks
        const userMatch = username && username.length === creds.username.length &&
          crypto.timingSafeEqual(Buffer.from(username), Buffer.from(creds.username))
        const passMatch = password && verifyPassword(password, creds.hash, creds.salt)

        if (userMatch && passMatch) {
          clearFailedLogins(clientIP)
          const token = createSession()
          // Only set Secure flag when using HTTPS — HTTP fallback can't send Secure cookies
          const securePart = usingHttps ? ' Secure;' : ''
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `pluto_session=${token}; Path=/; HttpOnly; SameSite=Strict;${securePart} Max-Age=${SESSION_MAX_AGE / 1000}`,
            ...SECURITY_HEADERS,
          })
          res.end(JSON.stringify({ success: true }))
        } else {
          recordFailedLogin(clientIP)
          // Add a small delay to slow down brute force
          await new Promise(r => setTimeout(r, 1000))
          return json(res, { error: 'Invalid username or password' }, 401)
        }
        return
      }

      // ===== LOGOUT (always accessible) =====
      if (pathname === '/api/logout') {
        const cookies = parseCookies(req.headers.cookie)
        if (cookies.pluto_session) sessions.delete(cookies.pluto_session)
        res.writeHead(302, {
          Location: '/login',
          'Set-Cookie': 'pluto_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0',
          ...SECURITY_HEADERS,
        })
        res.end()
        return
      }

      // ===== SERVE APP LOGO (no auth required) =====
      if (pathname === '/api/logo') {
        // Try multiple possible locations for icon.png
        const candidates = [
          path.join(electronApp.getAppPath(), 'resources', 'icon.png'),
          path.join(electronApp.getAppPath(), '..', 'resources', 'icon.png'),
          path.join(path.dirname(electronApp.getAppPath()), 'resources', 'icon.png'),
          // Dev mode: project root/resources
          path.join(process.cwd(), 'resources', 'icon.png'),
        ]
        const resolvedPath = candidates.find(p => fs.existsSync(p))
        if (resolvedPath) {
          return serveFile(res, req, resolvedPath)
        }
        res.writeHead(404, SECURITY_HEADERS)
        res.end()
        return
      }

      // ===== AUTH GATE — everything below requires login =====
      if (!isAuthenticated(req)) {
        const creds = getCredentials()
        if (!creds) {
          // No password set and accessing remotely — tell them to set one
          if (pathname.startsWith('/api/')) {
            return json(res, { error: 'Remote access requires a password. Set one in the desktop app.' }, 403)
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS })
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pluto — Setup Required</title>
            <style>body{background:#0a0a0a;color:#e0e0e0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
            .box{max-width:400px;padding:40px;background:#111;border-radius:12px;border:1px solid #222}
            h2{color:#58a6ff;margin-bottom:16px}p{color:#999;line-height:1.6}</style></head>
            <body><div class="box"><h2>🔒 Setup Required</h2><p>Remote access is disabled until a password is set.<br>Open the Pluto desktop app and configure a web password in the sidebar.</p></div></body></html>`)
          return
        }
        if (pathname.startsWith('/api/')) {
          return json(res, { error: 'Unauthorized' }, 401)
        }
        res.writeHead(302, { Location: '/login', ...SECURITY_HEADERS })
        res.end()
        return
      }

      // ===== ROOT / WEB GALLERY =====
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          ...SECURITY_HEADERS,
        })
        res.end(getWebAppHtml())
        return
      }

      if (pathname === '/video-editor' || pathname === '/video-editor/index.html') {
        const assetDir = getVideoEditorAssetDir()
        const entryPath = getVideoEditorEntryPath(assetDir)
        if (!entryPath) return json(res, { error: 'Video editor entry unavailable' }, 404)
        return serveStaticFromDir(res, req, assetDir, entryPath)
      }

      if (pathname.startsWith('/video-editor-assets/')) {
        const assetDir = getVideoEditorAssetDir()
        const relativePath = decodeURIComponent(pathname.replace('/video-editor-assets/', ''))
        return serveStaticFromDir(res, req, assetDir, relativePath)
      }

      // ===== SERVE FACE-API MODELS (local/offline) =====
      if (pathname.startsWith('/face-models/')) {
        const modelFile = pathname.replace('/face-models/', '')
        // Resolve face-models dir: packaged Electron → resources, Docker → cwd/face-models, dev → resources/face-models
        let faceModelsDir
        if (electronApp && electronApp.isPackaged) {
          faceModelsDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'face-models')
        } else {
          // Docker puts models in <cwd>/face-models; Electron dev has them in resources/face-models
          const cwdBased = path.join(process.cwd(), 'face-models')
          const appBased = path.join(electronApp ? electronApp.getAppPath() : process.cwd(), 'resources', 'face-models')
          faceModelsDir = fs.existsSync(cwdBased) ? cwdBased : appBased
        }
        const modelPath = path.resolve(faceModelsDir, modelFile)
        // Prevent path traversal — resolved path must stay inside faceModelsDir
        if (!modelPath.startsWith(path.resolve(faceModelsDir))) return json(res, { error: 'Forbidden' }, 403)
        if (!fs.existsSync(modelPath)) return json(res, { error: 'Model file not found' }, 404)
        const stat = fs.statSync(modelPath)
        const ext = path.extname(modelPath).toLowerCase()
        const mimeMap = { '.js': 'application/javascript', '.json': 'application/json', '.bin': 'application/octet-stream' }
        const mime = mimeMap[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=604800',
          ...SECURITY_HEADERS,
        })
        fs.createReadStream(modelPath).pipe(res)
        return
      }

      // ===== HEALTH CHECK (sanitized — no internal IPs or version leaked) =====
      if (pathname === '/api/ping') {
        return json(res, {
          status: 'ok',
        })
      }

      // ===== LIST FOLDERS =====
      if (pathname === '/api/folders') {
        const folders = db.prepare('SELECT * FROM folders').all()
        const result = folders.map(folder => {
          const totalCount = db.prepare('SELECT COUNT(*) as count FROM images WHERE folder_id = ?').get(folder.id).count
          const inAlbumsCount = db.prepare(`
            SELECT COUNT(DISTINCT i.id) as count 
            FROM images i 
            INNER JOIN album_images ai ON i.id = ai.image_id 
            WHERE i.folder_id = ?
          `).get(folder.id).count
          return {
            ...folder,
            totalCount,
            inAlbumsCount,
            displayName: folder.path.split(/[\\/]/).pop(),
          }
        })
        return json(res, result)
      }

      // ===== LIST PROJECTS WITH ALBUMS =====
      if (pathname === '/api/projects') {
        const projects = db.prepare('SELECT * FROM projects').all()
        const albums = db.prepare('SELECT * FROM albums ORDER BY sort_order ASC, id ASC').all()
        const result = projects.map(p => ({
          ...p,
          is_collapsed: !!p.is_collapsed,
          albums: albums.filter(a => a.project_id === p.id).map(a => ({
            ...a,
            coverUrl: a.cover_path ? `/api/file?path=${encodeURIComponent(a.cover_path)}` : null,
            imageCount: db.prepare('SELECT COUNT(*) as count FROM album_images WHERE album_id = ?').get(a.id).count,
          })),
        }))
        return json(res, result)
      }

      // ===== GET IMAGES (paginated) =====
      if (pathname === '/api/images') {
        const albumId = url.searchParams.get('albumId')
        const folderId = url.searchParams.get('folderId')
        const search = url.searchParams.get('search') || ''
        const sort = url.searchParams.get('sort') || 'date_taken-DESC'
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)

        let query = ''
        let countQuery = ''
        let queryParams = []
        let conditions = []

        if (albumId) {
          query = `SELECT i.id, i.name, i.full_path, i.thumb_path, i.file_type, i.date_taken FROM images i JOIN album_images ai ON i.id = ai.image_id`
          countQuery = `SELECT COUNT(*) as total FROM images i JOIN album_images ai ON i.id = ai.image_id`
          conditions.push('ai.album_id = ?')
          queryParams.push(albumId)
        } else if (folderId) {
          // Folder view: show ALL images in the folder, including those in albums
          query = `SELECT id, name, full_path, thumb_path, file_type, date_taken FROM images`
          countQuery = `SELECT COUNT(*) as total FROM images`
          conditions.push('folder_id = ?')
          queryParams.push(folderId)
        } else {
          query = `SELECT id, name, full_path, thumb_path, file_type, date_taken FROM images`
          countQuery = `SELECT COUNT(*) as total FROM images`
          conditions.push('id NOT IN (SELECT image_id FROM album_images)')
        }

        if (search) {
          const colName = albumId ? 'i.name' : 'name'
          const escaped = search.replace(/[%_\\]/g, '\\$&')
          conditions.push(`${colName} LIKE ? ESCAPE '\\'`)
          queryParams.push(`%${escaped}%`)
        }

        if (conditions.length > 0) {
          const where = ' WHERE ' + conditions.join(' AND ')
          query += where
          countQuery += where
        }

        const sortMap = {
          'date_taken-ASC': 'date_taken ASC',
          'date_taken-DESC': 'date_taken DESC',
          'name-ASC': 'name ASC',
          'name-DESC': 'name DESC',
        }
        // Edited copies always float to top
        const editedFirst = albumId ? "CASE WHEN i.name LIKE '%_edited%' THEN 0 ELSE 1 END" : "CASE WHEN name LIKE '%_edited%' THEN 0 ELSE 1 END"
        query += ` ORDER BY ${editedFirst}, ${sortMap[sort] || 'date_taken DESC'}`
        query += ` LIMIT ? OFFSET ?`

        const total = db.prepare(countQuery).get(...queryParams).total
        const rows = db.prepare(query).all(...queryParams, limit, offset)

        // Build set of image IDs that are in at least one album (for badge display)
        const albumImageIds = new Set()
        if (!albumId) {
          const ids = rows.map(r => r.id)
          if (ids.length) {
            const placeholders = ids.map(() => '?').join(',')
            const albumRows = db.prepare(`SELECT DISTINCT image_id FROM album_images WHERE image_id IN (${placeholders})`).all(...ids)
            albumRows.forEach(r => albumImageIds.add(r.image_id))
          }
        }

        const images = rows.map(row => ({
          id: row.id,
          name: row.name,
          fileType: row.file_type,
          dateTaken: row.date_taken,
          thumbUrl: `/api/thumbnail/${row.id}`,
          mediaUrl: `/api/media/${row.id}`,
          isVideo: /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(row.file_type),
          isPdf: row.file_type === 'pdf',
          inAlbum: albumImageIds.has(row.id),
        }))

        return json(res, { total, offset, limit, images })
      }

      // ===== SERVE THUMBNAIL BY IMAGE ID =====
      if (pathname.startsWith('/api/thumbnail/')) {
        const id = pathname.split('/').pop()
        const row = db.prepare('SELECT thumb_path, full_path, file_type FROM images WHERE id = ?').get(id)
        if (!row) return json(res, { error: 'Image not found' }, 404)

        // If thumbnail exists on disk, serve it
        if (row.thumb_path && fs.existsSync(row.thumb_path)) {
          return serveFile(res, req, row.thumb_path)
        }

        // Generate thumbnail on the fly for ANY file type (not just video/PDF)
        // This prevents serving full-res 20MB images as "thumbnails" for freshly imported photos
        if (getOrCreateThumbnail) {
          // Concurrency gate: don't overwhelm the system with simultaneous Sharp/FFmpeg ops
          if (apiThumbActive < API_THUMB_MAX_CONCURRENT) {
            apiThumbActive++
            try {
              const thumbPath = await getOrCreateThumbnail(row.full_path)
              if (thumbPath && fs.existsSync(thumbPath)) {
                db.prepare('UPDATE images SET thumb_path = ? WHERE id = ?').run(thumbPath, id)
                return serveFile(res, req, thumbPath)
              }
            } catch (err) {
              console.error('[Pluto API] Thumbnail generation failed:', err)
            } finally {
              apiThumbActive--
            }
          }
        }

        // Fallback: for images, serve full path (better than nothing)
        // For videos with no generated thumb, return a tiny placeholder
        const isVideo = /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(row.file_type)
        if (isVideo) {
          const placeholder = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==', 'base64')
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': placeholder.length, ...SECURITY_HEADERS })
          res.end(placeholder)
          return
        }

        return serveFile(res, req, row.full_path)
      }

      // ===== SERVE FULL MEDIA BY IMAGE ID =====
      if (pathname.startsWith('/api/media/')) {
        const id = pathname.split('/').pop()
        const row = db.prepare('SELECT full_path FROM images WHERE id = ?').get(id)
        if (!row) return json(res, { error: 'Image not found' }, 404)
        return serveFile(res, req, row.full_path)
      }

      // ===== SERVE FILE BY PATH (for album covers, etc — restricted to library folders) =====
      if (pathname === '/api/file') {
        const filePath = url.searchParams.get('path')
        if (!filePath) return json(res, { error: 'Missing path parameter' }, 400)
        // Path traversal protection: only serve files within registered library folders or thumbnails cache
        const resolved = path.resolve(filePath)
        if (!isMediaSourcePathAllowed(resolved) && !isEphemeralPreviewPath(resolved)) {
          console.warn(`[Pluto Security] Blocked path traversal attempt: ${filePath} from ${getClientIP(req)}`)
          return json(res, { error: 'Access denied' }, 403)
        }
        return serveFile(res, req, resolved)
      }

      // ===== SMART ALBUMS =====
      if (pathname === '/api/smart-albums') {
        const albums = db.prepare('SELECT * FROM smart_albums ORDER BY created_at DESC').all()
        const result = albums.map(a => ({
          ...a,
          rules: JSON.parse(a.rules || '[]'),
        }))
        return json(res, result)
      }

      // ===== QUERY SMART ALBUM =====
      if (pathname === '/api/smart-album-images') {
        const smartAlbumId = url.searchParams.get('id')
        const sort = url.searchParams.get('sort') || 'date_taken-DESC'
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)

        if (!smartAlbumId) return json(res, { error: 'Missing id' }, 400)
        const album = db.prepare('SELECT * FROM smart_albums WHERE id = ?').get(smartAlbumId)
        if (!album) return json(res, { error: 'Smart album not found' }, 404)

        let rules = JSON.parse(album.rules || '[]')
        if (!Array.isArray(rules)) rules = []
        let conditions = []
        let params = []

        const FILE_TYPE_MAP = {
          image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif', 'svg'],
          video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', '3gp'],
          gif: ['gif'],
          pdf: ['pdf'],
          psd: ['psd', 'psb']
        }

        for (const rule of rules) {
          const val = rule.value
          // Support both { type: 'rating_gte' } and { field: 'rating', operator: 'gte' } formats
          const ruleType = rule.type || (rule.field && rule.operator ? rule.field + '_' + rule.operator : rule.field || '')
          switch (ruleType) {
            case 'file_type':
            case 'file_type_eq': {
              let exts
              if (val === 'custom' && rule.customExt) {
                exts = rule.customExt.split(',').map(e => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)
              } else {
                exts = FILE_TYPE_MAP[val] || [val]
              }
              if (exts.length === 1) {
                conditions.push('i.file_type = ?')
                params.push(exts[0])
              } else if (exts.length > 1) {
                conditions.push(`i.file_type IN (${exts.map(() => '?').join(',')})`)
                params.push(...exts)
              }
              break
            }
            case 'rating_gte':
              conditions.push('i.rating >= ?')
              params.push(Number(val))
              break
            case 'rating_gt':
              conditions.push('i.rating > ?')
              params.push(Number(val))
              break
            case 'rating_eq':
              conditions.push('i.rating = ?')
              params.push(Number(val))
              break
            case 'rating_lt':
              conditions.push('i.rating < ?')
              params.push(Number(val))
              break
            case 'rating_lte':
              conditions.push('i.rating <= ?')
              params.push(Number(val))
              break
            case 'rating_neq':
              conditions.push('i.rating != ?')
              params.push(Number(val))
              break
            case 'color_label':
            case 'color_label_eq':
              conditions.push('i.color_label = ?')
              params.push(val)
              break
            case 'color_label_neq':
              conditions.push('i.color_label != ?')
              params.push(val)
              break
            case 'tag':
            case 'tag_eq':
            case 'tag_contains':
              conditions.push('i.id IN (SELECT image_id FROM image_tags WHERE tag = ?)')
              params.push(val)
              break
            case 'date_after':
              conditions.push('i.date_taken >= ?')
              params.push(Number(val))
              break
            case 'date_before':
              conditions.push('i.date_taken <= ?')
              params.push(Number(val))
              break
            case 'has_gps':
              if (val && val !== 'any' && val !== true) {
                const parts = String(val).split(',').map(s => parseFloat(s.trim()))
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                  conditions.push('ROUND(i.gps_lat, 2) = ? AND ROUND(i.gps_lng, 2) = ?')
                  params.push(parts[0], parts[1])
                } else {
                  conditions.push('i.gps_lat IS NOT NULL AND i.gps_lng IS NOT NULL')
                }
              } else {
                conditions.push('i.gps_lat IS NOT NULL AND i.gps_lng IS NOT NULL')
              }
              break
            case 'has_faces':
              if (val && val !== 'any' && val !== true) {
                conditions.push('i.id IN (SELECT image_id FROM image_faces WHERE person_id = ?)')
                params.push(Number(val))
              } else {
                conditions.push('i.id IN (SELECT image_id FROM image_faces)')
              }
              break
            case 'name_contains':
            case 'name_eq': {
              const esc = val.replace(/[%_\\]/g, '\\$&')
              conditions.push("(i.name LIKE ? ESCAPE '\\' OR i.full_path LIKE ? ESCAPE '\\')")
              params.push(`%${esc}%`, `%${esc}%`)
              break
            }
          }
        }

        const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
        const sortMap = { 'date_taken-ASC': 'i.date_taken ASC', 'date_taken-DESC': 'i.date_taken DESC', 'name-ASC': 'i.name ASC', 'name-DESC': 'i.name DESC' }
        const orderBy = sortMap[sort] || 'i.date_taken DESC'

        const total = db.prepare(`SELECT COUNT(*) as total FROM images i${where}`).get(...params).total
        const rows = db.prepare(`SELECT i.id, i.name, i.full_path, i.thumb_path, i.file_type, i.date_taken FROM images i${where} ORDER BY CASE WHEN i.name LIKE '%_edited%' THEN 0 ELSE 1 END, ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset)

        const images = rows.map(row => ({
          id: row.id,
          name: row.name,
          fileType: row.file_type,
          dateTaken: row.date_taken,
          thumbUrl: `/api/thumbnail/${row.id}`,
          mediaUrl: `/api/media/${row.id}`,
          isVideo: /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(row.file_type),
          isPdf: row.file_type === 'pdf',
        }))

        return json(res, { total, offset, limit, images })
      }

      // ===== PEOPLE / FACES =====
      if (pathname === '/api/people') {
        const rows = db.prepare(`
          SELECT p.id, p.name, p.sample_face_path, COUNT(DISTINCT f.image_id) as face_count
          FROM people p LEFT JOIN image_faces f ON p.id = f.person_id AND f.person_id IS NOT NULL
          GROUP BY p.id HAVING face_count > 0 ORDER BY face_count DESC
        `).all()
        // Attach first image ID for avatar
        for (const p of rows) {
          const first = db.prepare('SELECT image_id FROM image_faces WHERE person_id = ? LIMIT 1').get(p.id)
          p.firstImageId = first ? first.image_id : null
        }
        return json(res, rows)
      }

      // ===== PERSON IMAGES =====
      if (pathname === '/api/person-images') {
        const personId = url.searchParams.get('id')
        const sort = url.searchParams.get('sort') || 'date_taken-DESC'
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)

        if (!personId) return json(res, { error: 'Missing id' }, 400)
        const sortMap = { 'date_taken-ASC': 'i.date_taken ASC', 'date_taken-DESC': 'i.date_taken DESC', 'name-ASC': 'i.name ASC', 'name-DESC': 'i.name DESC' }
        const orderBy = sortMap[sort] || 'i.date_taken DESC'

        const total = db.prepare(`SELECT COUNT(DISTINCT i.id) as total FROM images i JOIN image_faces f ON i.id = f.image_id WHERE f.person_id = ?`).get(personId).total
        const rows = db.prepare(`SELECT DISTINCT i.id, i.name, i.full_path, i.thumb_path, i.file_type, i.date_taken FROM images i JOIN image_faces f ON i.id = f.image_id WHERE f.person_id = ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(personId, limit, offset)

        const images = rows.map(row => ({
          id: row.id,
          name: row.name,
          fileType: row.file_type,
          dateTaken: row.date_taken,
          thumbUrl: `/api/thumbnail/${row.id}`,
          mediaUrl: `/api/media/${row.id}`,
          isVideo: /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(row.file_type),
          isPdf: row.file_type === 'pdf',
        }))

        return json(res, { total, offset, limit, images })
      }

      // ===== DOWNLOAD FILE BY IMAGE ID =====
      if (pathname.startsWith('/api/download/')) {
        const id = pathname.split('/').pop()
        const row = db.prepare('SELECT full_path, name FROM images WHERE id = ?').get(id)
        if (!row) return json(res, { error: 'Image not found' }, 404)
        if (!fs.existsSync(row.full_path)) return json(res, { error: 'File not found on disk' }, 404)
        const stat = fs.statSync(row.full_path)
        const ext = path.extname(row.full_path).toLowerCase()
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(row.name)}"`,
          'Content-Length': stat.size,
          ...SECURITY_HEADERS,
        })
        fs.createReadStream(row.full_path).pipe(res)
        return
      }

      // ===== GET METADATA BY IMAGE ID =====
      if (pathname.startsWith('/api/metadata/')) {
        const id = pathname.split('/').pop()
        const row = db.prepare('SELECT full_path FROM images WHERE id = ?').get(id)
        if (!row) return json(res, { error: 'Image not found' }, 404)

        try {
          const stats = fs.statSync(row.full_path)
          let exif = await exifr.parse(row.full_path, true).catch(() => null)
          const width = exif?.ExifImageWidth || exif?.PixelXDimension || 'Unknown'
          const height = exif?.ExifImageHeight || exif?.PixelYDimension || 'Unknown'
          return json(res, {
            fileName: path.basename(row.full_path),
            type: path.extname(row.full_path).slice(1).toUpperCase() + ' File',
            size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            dimensions: width !== 'Unknown' ? `${width} x ${height}` : 'Unknown',
            dateTaken: exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toLocaleString() : 'N/A',
            camera: exif?.Make ? `${exif.Make} ${exif.Model || ''}` : 'N/A',
            fStop: exif?.FNumber ? `f/${exif.FNumber}` : 'N/A',
            iso: exif?.ISO || 'N/A',
            exposure: exif?.ExposureTime ? `1/${Math.round(1 / exif.ExposureTime)}s` : 'N/A',
          })
        } catch (err) {
          return json(res, { error: 'Could not read metadata' }, 500)
        }
      }

      // ===== IMAGE DETAILS (rating, tags, color label, GPS, metadata) =====
      if (pathname.startsWith('/api/image-details/')) {
        const id = pathname.split('/').pop()
        const row = db.prepare('SELECT id, name, full_path, file_type, date_taken, rating, color_label, gps_lat, gps_lng, folder_id FROM images WHERE id = ?').get(id)
        if (!row) return json(res, { error: 'Image not found' }, 404)
        const tags = db.prepare('SELECT tag FROM image_tags WHERE image_id = ?').all(id).map(t => t.tag)
        const albums = db.prepare('SELECT a.id, a.name FROM albums a JOIN album_images ai ON a.id = ai.album_id WHERE ai.image_id = ?').all(id)
        // Also fetch file metadata
        let type = '', size = '', dimensions = '', camera = '', fStop = '', iso = '', exposure = ''
        try {
          const stats = fs.statSync(row.full_path)
          size = (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
          type = path.extname(row.full_path).slice(1).toUpperCase() + ' File'
          let exif = await exifr.parse(row.full_path, true).catch(() => null)
          if (exif) {
            const w = exif.ExifImageWidth || exif.PixelXDimension
            const h = exif.ExifImageHeight || exif.PixelYDimension
            if (w && h) dimensions = `${w} x ${h}`
            if (exif.Make) camera = `${exif.Make} ${exif.Model || ''}`.trim()
            if (exif.FNumber) fStop = `f/${exif.FNumber}`
            if (exif.ISO) iso = String(exif.ISO)
            if (exif.ExposureTime) exposure = `1/${Math.round(1 / exif.ExposureTime)}s`
          }
        } catch (e) {}
        return json(res, {
          id: row.id, name: row.name, fileType: row.file_type, dateTaken: row.date_taken,
          rating: row.rating || 0, colorLabel: row.color_label || '', tags, albums,
          gpsLat: row.gps_lat, gpsLng: row.gps_lng,
          type, size, dimensions, camera, fStop, iso, exposure,
        })
      }

      if (pathname === '/api/video-editor-bootstrap') {
        const ids = String(url.searchParams.get('ids') || '')
          .split(',')
          .map((entry) => Number(entry.trim()))
          .filter((entry) => Number.isInteger(entry) && entry > 0)

        if (!ids.length) return json(res, { videoPaths: [] })

        const placeholders = ids.map(() => '?').join(',')
        const rows = db.prepare(`SELECT id, full_path, file_type FROM images WHERE id IN (${placeholders})`).all(...ids)
        const byId = new Map(rows.map((row) => [row.id, row]))
        const videoPaths = ids
          .map((id) => byId.get(id))
          .filter((row) => row && videoFileTypes.has(String(row.file_type || '').toLowerCase()))
          .map((row) => row.full_path)

        return json(res, { videoPaths })
      }

      if (pathname === '/api/video-editor-library') {
        const search = String(url.searchParams.get('search') || '').trim()
        const videoTypes = Array.from(videoFileTypes)
        const typePlaceholders = videoTypes.map(() => '?').join(',')
        const where = search ? 'AND instr(lower(name), lower(?)) > 0' : ''
        const params = [...videoTypes]
        if (search) params.push(search)
        const rows = db.prepare(`
          SELECT id, name, full_path, file_type
          FROM images
          WHERE lower(file_type) IN (${typePlaceholders}) ${where}
          ORDER BY date_taken DESC, id DESC
          LIMIT 250
        `).all(...params)

        return json(res, {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            path: row.full_path,
            thumbUrl: `/api/thumbnail/${row.id}`,
          })),
        })
      }

      if (pathname === '/api/video-editor-browse') {
        const kind = url.searchParams.get('kind') === 'video' ? 'video' : 'audio'
        const requestedPath = String(url.searchParams.get('path') || '')
        if (!requestedPath) {
          return json(res, {
            currentPath: '',
            directories: getMountedBrowseRoots().map((rootPath) => ({
              name: path.basename(rootPath) || rootPath,
              path: rootPath,
            })),
            files: [],
          })
        }

        const resolved = path.resolve(requestedPath)
        if (!isMountedBrowsePathAllowed(resolved)) return json(res, { error: 'Access denied.' }, 403)
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return json(res, { error: 'Folder not found.' }, 404)

        const allowedExts = kind === 'video'
          ? videoFileTypes
          : new Set([...audioFileTypes, ...videoFileTypes])

        const entries = fs.readdirSync(resolved, { withFileTypes: true })
          .filter((entry) => !entry.name.startsWith('.'))
          .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))

        const directories = []
        const files = []
        for (const entry of entries) {
          const entryPath = path.join(resolved, entry.name)
          if (!isMountedBrowsePathAllowed(entryPath)) continue
          if (entry.isDirectory()) {
            directories.push({ name: entry.name, path: entryPath })
            continue
          }
          if (!entry.isFile()) continue
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          if (!allowedExts.has(ext)) continue
          files.push({ name: entry.name, path: entryPath })
        }

        return json(res, { currentPath: resolved, directories, files })
      }

      if (pathname === '/api/video-editor-thumbnail' && req.method === 'POST') {
        try {
          const body = await readBody(req)
          const { inputPath, timeSec } = body || {}
          const clean = path.normalize(String(inputPath || ''))
          if (!clean || !fs.existsSync(clean)) return json(res, { success: false, error: 'Source file not found.' }, 404)
          if (!isMediaSourcePathAllowed(clean)) return json(res, { success: false, error: 'Access denied.' }, 403)
          const thumbnail = await generateVideoThumbnailData(clean, timeSec)
          return json(res, { success: true, thumbnail })
        } catch (err) {
          return json(res, { success: false, error: err.message }, 500)
        }
      }

      // ===== ALL TAGS =====
      if (pathname === '/api/tags') {
        const tags = db.prepare('SELECT DISTINCT tag FROM image_tags ORDER BY tag ASC').all().map(t => t.tag)
        return json(res, tags)
      }

      // ===== LICENSE INFO =====
      if (pathname === '/api/license-info') {
        if (!licenseManager) return json(res, { activated: false, tier: 'free', features: {}, limits: {} })
        return json(res, licenseManager.getLicenseInfo())
      }

      // ===== USAGE STATS =====
      if (pathname === '/api/usage-stats') {
        const imageCount = db.prepare('SELECT COUNT(*) as c FROM images').get().c
        const albumCount = db.prepare('SELECT COUNT(*) as c FROM albums').get().c
        const projectCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c
        const folderCount = db.prepare('SELECT COUNT(*) as c FROM folders').get().c
        return json(res, { imageCount, albumCount, projectCount, folderCount })
      }

      // ===== IMAGES WITH GPS (for map view) =====
      if (pathname === '/api/images-with-gps') {
        if (!checkLicense('mapView')) return json(res, { error: 'Map view requires a Pro license.' }, 403)
        const rows = db.prepare('SELECT id, name, full_path, gps_lat, gps_lng, date_taken FROM images WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL').all()
        const images = rows.map(r => ({
          id: r.id, name: r.name, gpsLat: r.gps_lat, gpsLng: r.gps_lng,
          dateTaken: r.date_taken, thumbUrl: `/api/thumbnail/${r.id}`,
        }))
        return json(res, images)
      }

      // ===== GPS UNSCANNED COUNT =====
      if (pathname === '/api/gps-unscanned-count') {
        const row = db.prepare("SELECT COUNT(*) as count FROM images WHERE gps_scanned = 0 AND file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif')").get()
        return json(res, { count: row.count })
      }

      // ===== CONTEXTUAL SEARCH (GET) =====
      if (pathname === '/api/context-search') {
        if (!checkLicense('contextSearch')) return json(res, { error: 'Contextual Search requires a Pro license.' }, 403)
        if (!contextSearchHandler) return json(res, { error: 'Contextual search not available in this environment' }, 501)
        const query = url.searchParams.get('q') || ''
        if (!query.trim()) return json(res, [])
        try {
          const results = await contextSearchHandler(query)
          return json(res, results.map(r => ({
            id: r.id,
            full_path: r.full_path,
            thumb_path: r.thumb_path,
            captions: r.captions,
            similarity: r.similarity
          })))
        } catch (err) {
          console.error('[API] context-search error:', err.message)
          return json(res, { error: 'Search failed' }, 500)
        }
      }

      // ===== CAPTION SCAN STATS (GET) =====
      if (pathname === '/api/caption-scan-stats') {
        const total = db.prepare("SELECT COUNT(*) as c FROM images WHERE file_type IN ('jpg','jpeg','png','webp','bmp','tiff','tif','heic','heif','avif')").get().c
        const scanned = db.prepare('SELECT COUNT(*) as c FROM image_captions').get().c
        return json(res, { total, scanned, remaining: total - scanned })
      }

      // ===== CAPTION MODEL AVAILABLE (GET) =====
      if (pathname === '/api/caption-model-available') {
        const available = captionModelCheckHandler ? captionModelCheckHandler() : false
        return json(res, { available })
      }

      // ===== WRITE ENDPOINTS (POST) =====
      if (req.method === 'POST') {

        // --- Upload edited image (multipart, handled before readBody) ---
        if (pathname === '/api/upload-edited') {
          if (!checkLicense('editPhoto')) return json(res, { error: 'Editing requires a Personal or Pro license.' }, 403)
          const contentType = req.headers['content-type'] || ''
          const boundaryMatch = contentType.match(/boundary=(.+)/)
          if (!boundaryMatch) return json(res, { error: 'Invalid multipart request' }, 400)
          const boundary = boundaryMatch[1]
          // Read raw body (up to 50MB)
          const chunks = []
          let totalSize = 0
          const MAX_UPLOAD = 50 * 1024 * 1024
          await new Promise((resolve, reject) => {
            req.on('data', chunk => {
              totalSize += chunk.length
              if (totalSize > MAX_UPLOAD) { req.destroy(); resolve(); return }
              chunks.push(chunk)
            })
            req.on('end', resolve)
          })
          const rawBody = Buffer.concat(chunks)
          const sep = Buffer.from('--' + boundary)
          // Find file part
          let fileBuffer = null, fileName = 'edited.jpg'
          let start = 0
          while (true) {
            const idx = rawBody.indexOf(sep, start)
            if (idx === -1) break
            const nextIdx = rawBody.indexOf(sep, idx + sep.length)
            if (nextIdx === -1) break
            const part = rawBody.slice(idx + sep.length, nextIdx)
            const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
            if (headerEnd === -1) { start = nextIdx; continue }
            const header = part.slice(0, headerEnd).toString()
            const fnMatch = header.match(/filename="([^"]+)"/)
            if (fnMatch) {
              fileName = fnMatch[1]
              fileBuffer = part.slice(headerEnd + 4)
              // Trim trailing \r\n
              if (fileBuffer.length > 2 && fileBuffer[fileBuffer.length - 2] === 13 && fileBuffer[fileBuffer.length - 1] === 10) {
                fileBuffer = fileBuffer.slice(0, fileBuffer.length - 2)
              }
              break
            }
            start = nextIdx
          }
          if (!fileBuffer) return json(res, { error: 'No file found in upload' }, 400)
          // Sanitize filename to prevent path traversal
          fileName = path.basename(fileName)
          // Whitelist allowed upload extensions to prevent stored XSS via .html/.js files
          const allowedUploadExts = /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp|cr2|nef|arw|dng|orf|rw2|raf|mp4|webm|mov|mkv|avi|m4v|3gp|pdf|ico|psd)$/i
          if (!allowedUploadExts.test(fileName)) return json(res, { error: 'File type not allowed' }, 400)
          // Determine save folder: prefer the folder of the original image (by matching the base name)
          // Fall back to first registered library folder
          const baseName = path.basename(fileName, path.extname(fileName)).replace(/_edited$/, '')
          const originalImage = db.prepare('SELECT full_path, folder_id FROM images WHERE name LIKE ? LIMIT 1').get(`${baseName}%`)
          let folder
          if (originalImage && originalImage.folder_id) {
            folder = db.prepare('SELECT id, path FROM folders WHERE id = ?').get(originalImage.folder_id)
          }
          if (!folder) {
            folder = db.prepare('SELECT id, path FROM folders LIMIT 1').get()
          }
          if (!folder) return json(res, { error: 'No library folder configured' }, 400)
          const savePath = path.join(folder.path, fileName)
          fs.writeFileSync(savePath, fileBuffer)
          // Register in database so it appears in library immediately
          const ext = path.extname(fileName).replace('.', '').toLowerCase()
          const existing = db.prepare('SELECT id FROM images WHERE full_path = ?').get(savePath)
          if (!existing) {
            db.prepare(`INSERT INTO images (name, full_path, file_type, folder_id)
              VALUES (?, ?, ?, ?)`).run(fileName, savePath, ext, folder.id)
          }
          return json(res, { success: true, path: savePath, name: fileName })
        }

        const body = await readBody(req)

        // --- Background Removal via BiRefNet (MIT license) + onnxruntime-node ---
        if (pathname === '/api/remove-background') {
          if (!checkLicense('editPhoto')) return json(res, { error: 'Background removal requires a Pro license.' }, 403)
          const { imageId } = body
          if (!imageId) return json(res, { error: 'Missing imageId' }, 400)
          const row = db.prepare('SELECT full_path, file_type FROM images WHERE id = ?').get(imageId)
          if (!row) return json(res, { error: 'Image not found' }, 404)
          const ext = (row.file_type || '').toLowerCase()
          if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return json(res, { error: 'Unsupported format for background removal' }, 400)
          try {
            const sharp = (await import('sharp')).default
            const ort = await import('onnxruntime-node')

            if (!global._birefnetSession) {
              const birefnetBase = electronApp && electronApp.isPackaged
                ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'birefnet')
                : path.join(electronApp ? electronApp.getAppPath() : path.resolve(import.meta.dirname, '../..'), 'resources', 'birefnet')
              const modelPath = path.join(birefnetBase, 'model.onnx')
              global._birefnetSession = await ort.InferenceSession.create(modelPath, {
                executionProviders: ['cpu'],
              })
            }

            const meta = await sharp(row.full_path).metadata()
            const origW = meta.width, origH = meta.height

            const S = 1024
            const rgbBuf = await sharp(row.full_path)
              .resize(S, S, { fit: 'fill' })
              .removeAlpha()
              .raw()
              .toBuffer()

            const mean = [0.485, 0.456, 0.406]
            const std  = [0.229, 0.224, 0.225]
            const input = new Float32Array(3 * S * S)
            for (let i = 0; i < S * S; i++) {
              input[i]             = (rgbBuf[i * 3]     / 255.0 - mean[0]) / std[0]
              input[S * S + i]     = (rgbBuf[i * 3 + 1] / 255.0 - mean[1]) / std[1]
              input[2 * S * S + i] = (rgbBuf[i * 3 + 2] / 255.0 - mean[2]) / std[2]
            }

            const tensor = new ort.Tensor('float32', input, [1, 3, S, S])
            const inputName = global._birefnetSession.inputNames[0]
            const results = await global._birefnetSession.run({ [inputName]: tensor })
            const outputNames = global._birefnetSession.outputNames
            const outputName = outputNames[outputNames.length - 1]
            const rawOutput = results[outputName].data

            const mask = Buffer.alloc(S * S)
            for (let i = 0; i < S * S; i++) {
              const v = 1 / (1 + Math.exp(-rawOutput[i]))
              mask[i] = Math.min(255, Math.max(0, Math.round(v * 255)))
            }

            // Erode mask by 1px (3×3 min filter) to remove contaminated boundary pixels
            const erodedMask = Buffer.alloc(S * S)
            for (let y = 0; y < S; y++) {
              for (let x = 0; x < S; x++) {
                let minVal = mask[y * S + x]
                for (let dy = -1; dy <= 1; dy++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy, nx = x + dx
                    if (ny >= 0 && ny < S && nx >= 0 && nx < S) {
                      minVal = Math.min(minVal, mask[ny * S + nx])
                    } else {
                      minVal = 0
                    }
                  }
                }
                erodedMask[y * S + x] = minVal
              }
            }

            // Blur eroded mask to create soft feathered edges, then resize to original
            const scaledMask = await sharp(erodedMask, { raw: { width: S, height: S, channels: 1 } })
              .blur(1.5)
              .resize(origW, origH, { fit: 'fill' })
              .toColourspace('b-w')
              .raw()
              .toBuffer()

            const origRgb = await sharp(row.full_path).removeAlpha().raw().toBuffer()
            const rgba = Buffer.alloc(origW * origH * 4)
            for (let i = 0; i < origW * origH; i++) {
              rgba[i * 4]     = origRgb[i * 3]
              rgba[i * 4 + 1] = origRgb[i * 3 + 1]
              rgba[i * 4 + 2] = origRgb[i * 3 + 2]
              rgba[i * 4 + 3] = scaledMask[i]
            }

            // Defringe: reverse-composite
            let sumBgR = 0, sumBgG = 0, sumBgB = 0, bgCount = 0
            for (let i = 0; i < origW * origH; i++) {
              if (scaledMask[i] < 5) {
                sumBgR += origRgb[i * 3]; sumBgG += origRgb[i * 3 + 1]; sumBgB += origRgb[i * 3 + 2]
                bgCount++
              }
            }
            const bgR = bgCount > 100 ? sumBgR / bgCount : 255
            const bgG = bgCount > 100 ? sumBgG / bgCount : 255
            const bgB = bgCount > 100 ? sumBgB / bgCount : 255
            for (let i = 0; i < origW * origH; i++) {
              const a = rgba[i * 4 + 3]
              if (a < 2) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = rgba[i * 4 + 3] = 0; continue }
              if (a >= 255) continue
              const af = a / 255, oneMinusA = 1 - af
              rgba[i * 4]     = Math.max(0, Math.min(255, Math.round((rgba[i * 4]     - bgR * oneMinusA) / af)))
              rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + 1] - bgG * oneMinusA) / af)))
              rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((rgba[i * 4 + 2] - bgB * oneMinusA) / af)))
            }

            const finalBuffer = await sharp(rgba, { raw: { width: origW, height: origH, channels: 4 } })
              .png()
              .toBuffer()

            res.writeHead(200, {
              'Content-Type': 'image/png',
              'Content-Length': finalBuffer.length,
              'Cache-Control': 'no-cache',
            })
            res.end(finalBuffer)
            return
          } catch (err) {
            console.error('[Pluto API] Background removal failed:', err.message)
            return json(res, { error: 'Background removal failed: ' + err.message }, 500)
          }
        }

        // --- Scan GPS locations from EXIF data ---
        if (pathname === '/api/scan-gps') {
          if (!checkLicense('mapView')) return json(res, { error: 'Map view requires a Pro license.' }, 403)
          try {
            const images = db.prepare("SELECT id, full_path FROM images WHERE gps_scanned = 0 AND file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif')").all()
            let found = 0
            for (const img of images) {
              try {
                let gpsFound = false
                let gps = await exifr.gps(img.full_path).catch(() => null)
                if (gps && gps.latitude && gps.longitude) {
                  db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(gps.latitude, gps.longitude, img.id)
                  found++
                  continue
                }
                const exifData = await exifr.parse(img.full_path, { gps: true }).catch(() => null)
                if (exifData && exifData.latitude && exifData.longitude) {
                  db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(exifData.latitude, exifData.longitude, img.id)
                  found++
                  continue
                }
                // Google Takeout sidecar
                const dir = path.dirname(img.full_path)
                const name = path.basename(img.full_path)
                for (const sidecar of [name + '.supplemental-metadata.json', name + '.json']) {
                  const sidecarPath = path.join(dir, sidecar)
                  try {
                    if (fs.existsSync(sidecarPath)) {
                      const meta = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
                      const geo = meta.geoData || meta.geoDataExif
                      if (geo && geo.latitude && geo.latitude !== 0 && geo.longitude && geo.longitude !== 0) {
                        db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(geo.latitude, geo.longitude, img.id)
                        found++
                        gpsFound = true
                        break
                      }
                    }
                  } catch {}
                }
                if (!gpsFound) db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
              } catch {
                db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
              }
            }
            return json(res, { success: true, scanned: images.length, found })
          } catch (err) {
            return json(res, { error: 'GPS scan failed: ' + err.message }, 500)
          }
        }

        // --- Batch GPS scan (for progress bar) ---
        if (pathname === '/api/scan-gps-batch') {
          if (!checkLicense('mapView')) return json(res, { error: 'Map view requires a Pro license.' }, 403)
          const batchSize = Math.min(body.batchSize || 50, 200)
          try {
            const images = db.prepare("SELECT id, full_path FROM images WHERE gps_scanned = 0 AND file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif') LIMIT ?").all(batchSize)
            let found = 0
            for (const img of images) {
              try {
                let gpsFound = false
                let gps = await exifr.gps(img.full_path).catch(() => null)
                if (gps && gps.latitude && gps.longitude) {
                  db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(gps.latitude, gps.longitude, img.id)
                  found++; continue
                }
                const exifData = await exifr.parse(img.full_path, { gps: true }).catch(() => null)
                if (exifData && exifData.latitude && exifData.longitude) {
                  db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(exifData.latitude, exifData.longitude, img.id)
                  found++; continue
                }
                const dir = path.dirname(img.full_path)
                const name = path.basename(img.full_path)
                for (const sidecar of [name + '.supplemental-metadata.json', name + '.json']) {
                  const sidecarPath = path.join(dir, sidecar)
                  try {
                    if (fs.existsSync(sidecarPath)) {
                      const meta = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
                      const geo = meta.geoData || meta.geoDataExif
                      if (geo && geo.latitude && geo.latitude !== 0 && geo.longitude && geo.longitude !== 0) {
                        db.prepare('UPDATE images SET gps_lat = ?, gps_lng = ?, gps_scanned = 1 WHERE id = ?').run(geo.latitude, geo.longitude, img.id)
                        found++; gpsFound = true; break
                      }
                    }
                  } catch {}
                }
                // Mark as scanned even if no GPS found
                if (!gpsFound) db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
              } catch {
                db.prepare('UPDATE images SET gps_scanned = 1 WHERE id = ?').run(img.id)
              }
            }
            const remaining = db.prepare("SELECT COUNT(*) as c FROM images WHERE gps_scanned = 0 AND file_type IN ('jpg', 'jpeg', 'png', 'webp', 'gif')").get().c
            return json(res, { success: true, scanned: images.length, found, remaining })
          } catch (err) {
            return json(res, { error: 'GPS batch scan failed: ' + err.message }, 500)
          }
        }

        // --- Reverse geocode (batch, using nominatim) ---
        if (pathname === '/api/reverse-geocode') {
          const locations = body.locations || []
          const names = []
          for (const loc of locations.slice(0, 50)) {
            try {
              const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&zoom=10&addressdetails=1`
              const result = await new Promise((resolve, reject) => {
                https.get(url, { headers: { 'User-Agent': 'PlutoPhotos/1.0' } }, (resp) => {
                  let data = ''
                  resp.on('data', chunk => { data += chunk })
                  resp.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
                }).on('error', () => resolve(null))
              })
              if (result && result.address) {
                const a = result.address
                const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || ''
                const state = a.state || a.county || ''
                const country = a.country || ''
                names.push([city, state, country].filter(Boolean).join(', '))
              } else {
                names.push(null)
              }
              // Nominatim rate limit: 1 request per second
              await new Promise(r => setTimeout(r, 1100))
            } catch {
              names.push(null)
            }
          }
          return json(res, names)
        }

        // --- Set image rating ---
        if (pathname === '/api/set-rating') {
          const { imageId, rating } = body
          if (!imageId) return json(res, { error: 'Missing imageId' }, 400)
          db.prepare('UPDATE images SET rating = ? WHERE id = ?').run(Math.max(0, Math.min(5, rating || 0)), imageId)
          return json(res, { success: true })
        }

        // --- Set image color label ---
        if (pathname === '/api/set-color-label') {
          const { imageId, colorLabel } = body
          if (!imageId) return json(res, { error: 'Missing imageId' }, 400)
          db.prepare('UPDATE images SET color_label = ? WHERE id = ?').run(colorLabel || '', imageId)
          return json(res, { success: true })
        }

        // --- Add tag ---
        if (pathname === '/api/add-tag') {
          const { imageId, tag } = body
          if (!imageId || !tag) return json(res, { error: 'Missing imageId or tag' }, 400)
          const cleanTag = String(tag).trim().replace(/[\x00-\x1f]/g, '').slice(0, 100)
          if (!cleanTag) return json(res, { error: 'Invalid tag' }, 400)
          db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)').run(imageId, cleanTag)
          return json(res, { success: true })
        }

        // --- Remove tag ---
        if (pathname === '/api/remove-tag') {
          const { imageId, tag } = body
          if (!imageId || !tag) return json(res, { error: 'Missing imageId or tag' }, 400)
          db.prepare('DELETE FROM image_tags WHERE image_id = ? AND tag = ?').run(imageId, tag)
          return json(res, { success: true })
        }

        // --- Create project ---
        if (pathname === '/api/create-project') {
          const { name } = body
          if (!name) return json(res, { error: 'Missing name' }, 400)
          const limits = getLimits()
          const count = db.prepare('SELECT COUNT(*) as c FROM projects').get().c
          if (count >= limits.maxProjects) return json(res, { error: `Project limit reached (${limits.maxProjects}). Upgrade to add more.` }, 403)
          try {
            const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name.trim())
            return json(res, { success: true, id: result.lastInsertRowid })
          } catch (e) {
            return json(res, { error: 'Project name already exists' }, 409)
          }
        }

        // --- Delete project ---
        if (pathname === '/api/delete-project') {
          const { id } = body
          if (!id) return json(res, { error: 'Missing id' }, 400)
          db.transaction(() => {
            const albums = db.prepare('SELECT id FROM albums WHERE project_id = ?').all(id)
            albums.forEach(a => db.prepare('DELETE FROM album_images WHERE album_id = ?').run(a.id))
            db.prepare('DELETE FROM albums WHERE project_id = ?').run(id)
            db.prepare('DELETE FROM projects WHERE id = ?').run(id)
          })()
          return json(res, { success: true })
        }

        // --- Create album ---
        if (pathname === '/api/create-album') {
          const { name, projectId } = body
          if (!name || !projectId) return json(res, { error: 'Missing name or projectId' }, 400)
          const limits = getLimits()
          const count = db.prepare('SELECT COUNT(*) as c FROM albums').get().c
          if (count >= limits.maxAlbums) return json(res, { error: `Album limit reached (${limits.maxAlbums}). Upgrade to add more.` }, 403)
          try {
            const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM albums WHERE project_id = ?').get(projectId)
            const result = db.prepare('INSERT INTO albums (name, project_id, sort_order) VALUES (?, ?, ?)').run(name.trim(), projectId, (maxSort?.m || 0) + 1)
            return json(res, { success: true, id: result.lastInsertRowid })
          } catch (e) {
            return json(res, { error: 'Album name already exists in this project' }, 409)
          }
        }

        // --- Delete album ---
        if (pathname === '/api/delete-album') {
          const { id } = body
          if (!id) return json(res, { error: 'Missing id' }, 400)
          db.transaction(() => {
            db.prepare('DELETE FROM album_images WHERE album_id = ?').run(id)
            db.prepare('DELETE FROM albums WHERE id = ?').run(id)
          })()
          return json(res, { success: true })
        }

        // --- Import folder (Docker / headless) ---
        if (pathname === '/api/import-folder') {
          const { folderPath } = body
          if (!folderPath || typeof folderPath !== 'string') return json(res, { error: 'Missing folderPath' }, 400)
          const cleaned = folderPath.trim()
          if (!cleaned) return json(res, { error: 'Empty path' }, 400)
          // Security: restrict to safe directories to prevent scanning /etc, /proc, etc.
          const resolvedImport = path.resolve(cleaned)
          if (!resolvedImport.startsWith('/photos') && !resolvedImport.startsWith('/imports') && !resolvedImport.startsWith('/data')) {
            return json(res, { error: 'Access denied: path must be under /photos, /imports, or /data' }, 403)
          }
          if (!importFolderHandler) return json(res, { error: 'Import not available in this environment' }, 501)
          try {
            const result = await importFolderHandler(cleaned)
            return json(res, { success: true, ...result })
          } catch (e) {
            return json(res, { error: e.message || 'Import failed' }, 500)
          }
        }

        // --- Add images to album ---
        if (pathname === '/api/add-to-album') {
          const { albumId, imageIds } = body
          if (!albumId || !imageIds?.length) return json(res, { error: 'Missing albumId or imageIds' }, 400)
          const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)')
          db.transaction(() => { imageIds.forEach(id => insert.run(albumId, id)) })()
          // Auto-set cover if none
          const album = db.prepare('SELECT cover_path FROM albums WHERE id = ?').get(albumId)
          if (!album?.cover_path) {
            const first = db.prepare('SELECT full_path, thumb_path FROM images WHERE id = ?').get(imageIds[0])
            if (first) db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(first.thumb_path || first.full_path, albumId)
          }
          return json(res, { success: true, added: imageIds.length })
        }

        // --- Remove images from album ---
        if (pathname === '/api/remove-from-album') {
          const { albumId, imageIds } = body
          if (!albumId || !imageIds?.length) return json(res, { error: 'Missing albumId or imageIds' }, 400)
          const del = db.prepare('DELETE FROM album_images WHERE album_id = ? AND image_id = ?')
          db.transaction(() => { imageIds.forEach(id => del.run(albumId, id)) })()
          return json(res, { success: true, removed: imageIds.length })
        }

        // --- Delete images from disk ---
        if (pathname === '/api/delete-images') {
          const { imageIds } = body
          if (!imageIds?.length) return json(res, { error: 'Missing imageIds' }, 400)
          let deleted = 0
          for (const id of imageIds) {
            const row = db.prepare('SELECT full_path FROM images WHERE id = ?').get(id)
            if (row) {
              try {
                if (_shell) {
                  await _shell.trashItem(row.full_path);
                } else {
                  fs.unlinkSync(row.full_path);
                }
              } catch (e) { /* file may already be gone */ }
              db.prepare('DELETE FROM image_tags WHERE image_id = ?').run(id)
              db.prepare('DELETE FROM album_images WHERE image_id = ?').run(id)
              db.prepare('DELETE FROM image_edits WHERE image_id = ?').run(id)
              db.prepare('DELETE FROM image_faces WHERE image_id = ?').run(id)
              db.prepare('DELETE FROM images WHERE id = ?').run(id)
              deleted++
            }
          }
          return json(res, { success: true, deleted })
        }

        // --- Set album cover ---
        if (pathname === '/api/set-album-cover') {
          const { albumId, imagePath } = body
          if (!albumId) return json(res, { error: 'Missing albumId' }, 400)
          db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(imagePath || null, albumId)
          return json(res, { success: true })
        }

        // --- Reorder albums ---
        if (pathname === '/api/reorder-albums') {
          const { albumIds } = body
          if (!albumIds?.length) return json(res, { error: 'Missing albumIds' }, 400)
          const update = db.prepare('UPDATE albums SET sort_order = ? WHERE id = ?')
          db.transaction(() => { albumIds.forEach((id, i) => update.run(i, id)) })()
          return json(res, { success: true })
        }

        // --- Batch set rating (requires batchOps) ---
        if (pathname === '/api/batch-set-rating') {
          if (!checkLicense('batchOps')) return json(res, { error: 'Batch operations require a Personal or Pro license.' }, 403)
          const { imageIds, rating } = body
          if (!imageIds?.length) return json(res, { error: 'Missing imageIds' }, 400)
          const update = db.prepare('UPDATE images SET rating = ? WHERE id = ?')
          db.transaction(() => { imageIds.forEach(id => update.run(Math.max(0, Math.min(5, rating || 0)), id)) })()
          return json(res, { success: true, updated: imageIds.length })
        }

        // --- Batch set color label (requires batchOps) ---
        if (pathname === '/api/batch-set-color-label') {
          if (!checkLicense('batchOps')) return json(res, { error: 'Batch operations require a Personal or Pro license.' }, 403)
          const { imageIds, colorLabel } = body
          if (!imageIds?.length) return json(res, { error: 'Missing imageIds' }, 400)
          const update = db.prepare('UPDATE images SET color_label = ? WHERE id = ?')
          db.transaction(() => { imageIds.forEach(id => update.run(colorLabel || '', id)) })()
          return json(res, { success: true, updated: imageIds.length })
        }

        // --- Batch add tag (requires batchOps) ---
        if (pathname === '/api/batch-add-tag') {
          if (!checkLicense('batchOps')) return json(res, { error: 'Batch operations require a Personal or Pro license.' }, 403)
          const { imageIds, tag } = body
          if (!imageIds?.length || !tag) return json(res, { error: 'Missing imageIds or tag' }, 400)
          const cleanTag = String(tag).trim().replace(/[\x00-\x1f]/g, '').slice(0, 100)
          if (!cleanTag) return json(res, { error: 'Invalid tag' }, 400)
          const insert = db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag) VALUES (?, ?)')
          db.transaction(() => { imageIds.forEach(id => insert.run(id, cleanTag)) })()
          return json(res, { success: true, updated: imageIds.length })
        }

        // --- Batch move to album (requires batchOps) ---
        if (pathname === '/api/batch-move-to-album') {
          if (!checkLicense('batchOps')) return json(res, { error: 'Batch operations require a Personal or Pro license.' }, 403)
          const { imageIds, albumId } = body
          if (!imageIds?.length || !albumId) return json(res, { error: 'Missing imageIds or albumId' }, 400)
          const insert = db.prepare('INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)')
          db.transaction(() => { imageIds.forEach(id => insert.run(albumId, id)) })()
          return json(res, { success: true, added: imageIds.length })
        }

        // --- Create smart album (requires smartAlbums) ---
        if (pathname === '/api/create-smart-album') {
          if (!checkLicense('smartAlbums')) return json(res, { error: 'Smart albums require a Pro license.' }, 403)
          const { name, rules, icon } = body
          if (!name || !rules) return json(res, { error: 'Missing name or rules' }, 400)
          const result = db.prepare('INSERT INTO smart_albums (name, rules, icon) VALUES (?, ?, ?)').run(name.trim(), JSON.stringify(rules), icon || '🔍')
          return json(res, { success: true, id: result.lastInsertRowid })
        }

        // --- Update smart album (requires smartAlbums) ---
        if (pathname === '/api/update-smart-album') {
          if (!checkLicense('smartAlbums')) return json(res, { error: 'Smart albums require a Pro license.' }, 403)
          const { id, name, rules, icon } = body
          if (!id) return json(res, { error: 'Missing id' }, 400)
          const sets = []
          const params = []
          if (name) { sets.push('name = ?'); params.push(name.trim()) }
          if (rules) { sets.push('rules = ?'); params.push(JSON.stringify(rules)) }
          if (icon) { sets.push('icon = ?'); params.push(icon) }
          if (sets.length) {
            params.push(id)
            db.prepare(`UPDATE smart_albums SET ${sets.join(', ')} WHERE id = ?`).run(...params)
          }
          return json(res, { success: true })
        }

        // --- Delete smart album ---
        if (pathname === '/api/delete-smart-album') {
          const { id } = body
          if (!id) return json(res, { error: 'Missing id' }, 400)
          db.prepare('DELETE FROM smart_albums WHERE id = ?').run(id)
          return json(res, { success: true })
        }

        // --- Rename person ---
        if (pathname === '/api/rename-person') {
          const { id, name } = body
          if (!id || !name) return json(res, { error: 'Missing id or name' }, 400)
          db.prepare('UPDATE people SET name = ? WHERE id = ?').run(name.trim(), id)
          return json(res, { success: true })
        }

        // --- Merge people ---
        if (pathname === '/api/merge-people') {
          const { keepId, mergeId } = body
          if (!keepId || !mergeId) return json(res, { error: 'Missing keepId or mergeId' }, 400)
          db.prepare('UPDATE image_faces SET person_id = ? WHERE person_id = ?').run(keepId, mergeId)
          db.prepare('DELETE FROM people WHERE id = ?').run(mergeId)
          recomputePersonCentroid(db, keepId)
          return json(res, { success: true })
        }

        // --- Create person ---
        if (pathname === '/api/create-person') {
          const { name } = body
          const result = db.prepare('INSERT INTO people (name) VALUES (?)').run((name || 'Unknown').trim())
          return json(res, { success: true, id: result.lastInsertRowid })
        }

        // --- Get person faces ---
        if (pathname === '/api/get-person-faces') {
          const { personId } = body
          if (!personId) return json(res, { error: 'Missing personId' }, 400)
          const faces = db.prepare(`
            SELECT f.id as faceId, f.image_id, f.person_id, f.x, f.y, f.width, f.height,
                   i.name as imageName, i.full_path, i.thumb_path
            FROM image_faces f JOIN images i ON f.image_id = i.id
            WHERE f.person_id = ? AND f.width > 0
            ORDER BY f.id DESC
          `).all(personId)
          const result = faces.map(f => ({
            faceId: f.faceId, imageId: f.image_id, personId: f.person_id,
            x: f.x, y: f.y, width: f.width, height: f.height,
            imageName: f.imageName,
            thumb: `/api/thumbnail/${f.image_id}`
          }))
          return json(res, result)
        }

        // --- Reassign face ---
        if (pathname === '/api/reassign-face') {
          const { faceId, newPersonId } = body
          if (!faceId || !newPersonId) return json(res, { error: 'Missing faceId or newPersonId' }, 400)
          // Get old person ID before reassigning
          const oldFace = db.prepare('SELECT person_id FROM image_faces WHERE id = ?').get(faceId)
          const oldPersonId = oldFace ? oldFace.person_id : null

          db.prepare('UPDATE image_faces SET person_id = ? WHERE id = ?').run(newPersonId, faceId)

          // Recalculate centroids for both old and new person
          if (oldPersonId && oldPersonId !== newPersonId) {
            recomputePersonCentroid(db, oldPersonId)
            cleanupOrphanedPeople(db)
          }
          recomputePersonCentroid(db, newPersonId)

          // Generate thumbnail for the target person if they don't have one
          try {
            const person = db.prepare('SELECT sample_face_path FROM people WHERE id = ?').get(newPersonId)
            if (person && !person.sample_face_path) {
              const face = db.prepare(`
                SELECT f.image_id, i.thumb_path FROM image_faces f
                JOIN images i ON f.image_id = i.id WHERE f.id = ?
              `).get(faceId)
              if (face && face.thumb_path) {
                db.prepare('UPDATE people SET sample_face_path = ? WHERE id = ?').run(face.thumb_path, newPersonId)
              }
            }
          } catch (err) {
            console.error('Failed to set person thumbnail on reassign:', err)
          }

          return json(res, { success: true })
        }

        // --- Delete face ---
        if (pathname === '/api/delete-face') {
          const { faceId } = body
          if (!faceId) return json(res, { error: 'Missing faceId' }, 400)
          const face = db.prepare('SELECT person_id FROM image_faces WHERE id = ?').get(faceId)
          db.prepare('DELETE FROM image_faces WHERE id = ?').run(faceId)
          if (face && face.person_id) {
            recomputePersonCentroid(db, face.person_id)
            cleanupOrphanedPeople(db)
          }
          return json(res, { success: true })
        }

        // --- Save detected faces (from browser face scanning) ---
        if (pathname === '/api/save-detected-faces') {
          const { imageId, faces } = body
          if (!imageId) return json(res, { error: 'Missing imageId' }, 400)
          // Clear existing face data for this image to prevent duplicates on rescan
          db.prepare('DELETE FROM image_faces WHERE image_id = ?').run(imageId)
          // Mark as scanned even if no faces
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            `face_scanned_${imageId}`, JSON.stringify(true)
          )
          if (!faces || faces.length === 0) return json(res, { success: true, saved: 0 })

          // Look up the image's full path so we can crop faces server-side
          const imgRow = db.prepare('SELECT full_path, thumb_path FROM images WHERE id = ?').get(imageId)
          if (!imgRow || !imgRow.full_path) return json(res, { error: 'Image not found' }, 404)
          const clean = path.normalize(imgRow.full_path)

          // Ensure ArcFace ONNX model is loaded
          let faceModelsDir
          if (electronApp && electronApp.isPackaged) {
            faceModelsDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'face-models')
          } else {
            const cwdBased = path.join(process.cwd(), 'face-models')
            const appBased = path.join(electronApp ? electronApp.getAppPath() : process.cwd(), 'resources', 'face-models')
            faceModelsDir = fs.existsSync(cwdBased) ? cwdBased : appBased
          }
          const arcfaceModelPath = path.join(faceModelsDir, 'arcface', 'w600k_r50.onnx')
          await ensureArcFace(arcfaceModelPath)

          const insertFace = db.prepare('INSERT INTO image_faces (image_id, person_id, x, y, width, height, descriptor, landmarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

          // Load per-person centroids + descriptors for matching (ArcFace 512-dim)
          const allPeople = db.prepare('SELECT id, centroid FROM people WHERE centroid IS NOT NULL').all()
          const centroids = []
          for (const p of allPeople) {
            try {
              const c = JSON.parse(p.centroid)
              const allFaces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(p.id)
              const descs = []
              for (const f of allFaces) { try { descs.push(JSON.parse(f.descriptor)) } catch {} }
              centroids.push({ id: p.id, centroid: c, descriptors: descs })
            } catch {}
          }

          const CENTROID_THRESHOLD = 0.40
          const INDIVIDUAL_THRESHOLD = 0.35
          let saved = 0
          for (const face of faces) {
            // Compute 512-dim ArcFace descriptor server-side
            let desc = null
            const lm = face.landmarks
            if (lm && lm.length === 5) {
              try {
                desc = await computeArcFaceDescriptor(clean, face, lm)
              } catch (e) {
                console.warn(`[FaceSave] ArcFace descriptor failed: ${e.message}`)
              }
            }
            // Fallback: legacy descriptor from client
            if (!desc && face.descriptor && face.descriptor.length > 0) {
              desc = l2Normalise(Array.from(face.descriptor))
            }

            let matchedPersonId = null
            if (desc) {
              const centroidBest = centroids.reduce((best, p) => {
                if (p.centroid.length !== desc.length) return best
                const s = cosineSimilarity(desc, p.centroid)
                return s > best.sim ? { sim: s, id: p.id } : best
              }, { sim: -1, id: null })
              const individualBest = { sim: -1, id: null }
              for (const p of centroids) {
                for (const d of p.descriptors) {
                  if (d.length !== desc.length) continue
                  const s = cosineSimilarity(desc, d)
                  if (s > individualBest.sim) { individualBest.sim = s; individualBest.id = p.id }
                }
              }
              if (centroidBest.sim >= CENTROID_THRESHOLD) {
                matchedPersonId = centroidBest.id
              } else if (individualBest.sim >= INDIVIDUAL_THRESHOLD) {
                matchedPersonId = individualBest.id
              } else if (centroids.length > 0) {
                console.log(`[FaceSave] No match — centroid-best=${centroidBest.sim.toFixed(4)} individual-best=${individualBest.sim.toFixed(4)}`)
              }
            }

            if (!matchedPersonId) {
              const centroidJson = desc ? JSON.stringify(desc) : null
              const newPerson = db.prepare('INSERT INTO people (name, centroid) VALUES (?, ?)').run('Unknown', centroidJson)
              matchedPersonId = newPerson.lastInsertRowid
              if (desc) centroids.push({ id: matchedPersonId, centroid: desc, descriptors: [desc] })
            }

            const landmarksJson = lm ? JSON.stringify(lm) : null
            insertFace.run(imageId, matchedPersonId, face.x, face.y, face.width, face.height, desc ? JSON.stringify(desc) : null, landmarksJson)

            // Update sample_face_path if not set
            const person = db.prepare('SELECT sample_face_path FROM people WHERE id = ?').get(matchedPersonId)
            if (person && !person.sample_face_path && imgRow.thumb_path) {
              db.prepare('UPDATE people SET sample_face_path = ? WHERE id = ?').run(imgRow.thumb_path, matchedPersonId)
            }

            // Update centroid (running average, L2-normalized)
            if (desc) {
              const allFaces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(matchedPersonId)
              const dim = desc.length
              const avg = new Array(dim).fill(0)
              let count = 0
              for (const f of allFaces) {
                try { const d = JSON.parse(f.descriptor); if (d.length !== dim) continue; for (let i = 0; i < dim; i++) avg[i] += d[i]; count++ } catch {}
              }
              if (count > 0) {
                for (let i = 0; i < dim; i++) avg[i] /= count
                l2Normalise(avg)
                db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(avg), matchedPersonId)
                const idx = centroids.findIndex(c => c.id === matchedPersonId)
                if (idx >= 0) centroids[idx].centroid = avg
              }
            }
            saved++
          }
          return json(res, { success: true, saved })
        }

        // --- Get unscanned image IDs for face detection ---
        if (pathname === '/api/unscanned-images') {
          const rows = db.prepare(`
            SELECT i.id, i.name, i.folder_id FROM images i
            WHERE i.file_type IN ('jpg','jpeg','png','webp')
            AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key = 'face_scanned_' || i.id)
            ORDER BY RANDOM()
            LIMIT 5000
          `).all()
          return json(res, rows)
        }

        // --- Reset all face scan data ---
        if (pathname === '/api/reset-face-data') {
          db.prepare("DELETE FROM settings WHERE key LIKE 'face_scanned_%'").run()
          db.prepare('DELETE FROM image_faces').run()
          db.prepare('DELETE FROM people').run()
          return json(res, { success: true })
        }

        // --- Auto-merge similar people using single-linkage with avg-linkage floor (multi-pass) ---
        if (pathname === '/api/auto-merge-people') {
          const MERGE_BEST_THRESHOLD = 0.50
          const MERGE_AVG_FLOOR = 0.35
          let totalMerged = 0
          for (let pass = 0; pass < 10; pass++) {
            const allPeople = db.prepare('SELECT id, name FROM people').all()
            const clusters = []
            for (const p of allPeople) {
              const rows = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(p.id)
              const descs = []
              for (const r of rows) { try { descs.push(JSON.parse(r.descriptor)) } catch {} }
              if (descs.length > 0) clusters.push({ id: p.id, name: p.name, descs })
            }
            const parent = new Map()
            const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
            const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra) }
            for (const c of clusters) parent.set(c.id, c.id)
            for (let i = 0; i < clusters.length; i++) {
              for (let j = i + 1; j < clusters.length; j++) {
                let totalSim = 0, pairs = 0, bestPair = -1
                for (const di of clusters[i].descs) {
                  for (const dj of clusters[j].descs) {
                    const s = cosineSimilarity(di, dj)
                    totalSim += s
                    pairs++
                    if (s > bestPair) bestPair = s
                  }
                }
                if (pairs > 0 && bestPair >= MERGE_BEST_THRESHOLD && totalSim / pairs >= MERGE_AVG_FLOOR) union(clusters[i].id, clusters[j].id)
              }
            }
            const groups = new Map()
            for (const c of clusters) {
              const root = find(c.id)
              if (!groups.has(root)) groups.set(root, [])
              groups.get(root).push(c.id)
            }
            let passMerged = 0
            for (const [keepId, members] of groups) {
              if (members.length <= 1) continue
              for (const memberId of members) {
                if (memberId === keepId) continue
                db.prepare('UPDATE image_faces SET person_id = ? WHERE person_id = ?').run(keepId, memberId)
                db.prepare('DELETE FROM people WHERE id = ?').run(memberId)
                passMerged++
              }
              const faces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(keepId)
              if (faces.length > 0) {
                const dim = JSON.parse(faces[0].descriptor).length
                const avg = new Array(dim).fill(0)
                let count = 0
                for (const f of faces) {
                  try { const d = JSON.parse(f.descriptor); for (let i = 0; i < dim; i++) avg[i] += d[i]; count++ } catch {}
                }
                if (count > 0) {
                  for (let i = 0; i < dim; i++) avg[i] /= count
                  l2Normalise(avg)
                  db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(avg), keepId)
                }
              }
            }
            totalMerged += passMerged
            if (passMerged === 0) break
          }
          return json(res, { success: true, merged: totalMerged, remainingPeople: db.prepare('SELECT COUNT(*) as c FROM people').get().c })
        }

        // --- Trim video ---
        if (pathname === '/api/trim-video') {
          if (!checkLicense('editPhoto')) return json(res, { error: 'Video trimming requires a Pro license.' }, 403)
          try {
            const { inputPath, startTime, endTime } = body
            if (!inputPath) return json(res, { error: 'inputPath required.' }, 400)
            const clean = path.normalize(inputPath)
            const resolved = path.resolve(clean)
            if (!isPathAllowed(resolved)) return json(res, { error: 'Access denied — file is outside the library.' }, 403)
            if (!fs.existsSync(clean)) return json(res, { error: 'File not found.' }, 404)

            const ext = path.extname(clean)
            const baseName = path.basename(clean, ext)
            const dir = path.dirname(clean)
            const outputExt = /^\.(mkv|avi)$/i.test(ext) ? '.mp4' : ext
            let outputPath = path.join(dir, `${baseName}_trimmed${outputExt}`)
            let counter = 1
            while (fs.existsSync(outputPath)) {
              outputPath = path.join(dir, `${baseName}_trimmed_${counter}${outputExt}`)
              counter++
            }
            const duration = endTime - startTime
            if (duration <= 0) return json(res, { error: 'Invalid time range.' }, 400)

            const ffmpeg = (await import('fluent-ffmpeg')).default
            await new Promise((resolve, reject) => {
              ffmpeg(clean)
                .setStartTime(startTime)
                .setDuration(duration)
                .outputOptions(['-c', 'copy', '-avoid_negative_ts', 'make_zero'])
                .output(outputPath)
                .on('end', resolve)
                .on('error', (err) => {
                  // Fallback: re-encode if stream copy fails
                  ffmpeg(clean)
                    .setStartTime(startTime)
                    .setDuration(duration)
                    .outputOptions(['-avoid_negative_ts', 'make_zero'])
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run()
                })
                .run()
            })

            const name = path.basename(outputPath)
            const fileType = outputExt.replace('.', '')
            // Inherit folder_id from the source video so the trimmed file appears in the same folder view
            const srcRow = db.prepare('SELECT folder_id FROM images WHERE full_path = ?').get(clean)
            const folderId = srcRow ? srcRow.folder_id : null
            db.prepare('INSERT OR IGNORE INTO images (full_path, name, file_type, folder_id) VALUES (?, ?, ?, ?)').run(outputPath, name, fileType, folderId)
            return json(res, { success: true, outputPath })
          } catch (err) {
            console.error('[Pluto API] Trim video error:', err.message)
            return json(res, { error: 'Failed to trim video: ' + err.message }, 500)
          }
        }

        if (pathname === '/api/compose-video') {
          if (!checkLicense('editPhoto')) return json(res, { success: false, error: 'Video editing requires a Pro license.' }, 403)
          try {
            const { clips, audioOverlays = [], textOverlays = [], watermark = null, exportPreset = 'source', previewMode = false } = body || {}
            if (!Array.isArray(clips) || clips.length === 0) {
              return json(res, { success: false, error: 'No clips were added to the timeline.' }, 400)
            }

            const normalizedClips = []
            const normalizedAudioOverlays = []
            let referenceStreamInfo = null

            for (let index = 0; index < clips.length; index += 1) {
              const clip = clips[index]
              const clipRow = clip.imageId ? db.prepare('SELECT full_path FROM images WHERE id = ?').get(clip.imageId) : null
              const rawClipPath = clipRow?.full_path || clip.inputPath || ''
              const inputPath = path.normalize(decodeURIComponent(String(rawClipPath).replace(/^pluto:\/\//i, '')))
              const resolved = path.resolve(inputPath)
              const startTime = Number(clip.startTime || 0)
              const endTime = Number(clip.endTime || 0)
              const duration = endTime - startTime
              if (!inputPath || !fs.existsSync(inputPath)) {
                return json(res, { success: false, error: `Clip ${index + 1} is missing its source video.` }, 400)
              }
              if (!isMediaSourcePathAllowed(resolved)) {
                return json(res, { success: false, error: `Clip ${index + 1} is outside the allowed library.` }, 403)
              }
              if (!Number.isFinite(duration) || duration <= 0.05) {
                return json(res, { success: false, error: `Clip ${index + 1} has an invalid trim range.` }, 400)
              }

              const streamInfo = await probeMediaStreamInfo(inputPath)
              if (!referenceStreamInfo) referenceStreamInfo = streamInfo

              normalizedClips.push({
                inputPath,
                duration,
                startTime,
                endTime,
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
                speed: Math.max(0.25, Math.min(4, Number(clip.speed) || 1)),
                scale: Math.max(25, Math.min(200, Number(clip.scale) || 100)),
                posX: Math.max(-100, Math.min(100, Number(clip.posX) || 0)),
                posY: Math.max(-100, Math.min(100, Number(clip.posY) || 0)),
                streamInfo,
              })
            }

            const transitionDurations = normalizedClips.slice(0, -1).map((clip, index) => {
              const effDur = clip.duration / clip.speed
              const nextEffDur = normalizedClips[index + 1].duration / normalizedClips[index + 1].speed
              return clampCrossfadeDuration(clip.transitionDuration, effDur, nextEffDur)
            })
            const projectDuration = normalizedClips.reduce((total, clip, index) => {
              const effDur = clip.duration / clip.speed
              if (index === 0) return effDur
              return total + effDur - (transitionDurations[index - 1] || 0)
            }, 0)

            if (Array.isArray(audioOverlays)) {
              for (let index = 0; index < audioOverlays.length; index += 1) {
                const overlay = audioOverlays[index]
                const overlayRow = overlay.imageId ? db.prepare('SELECT full_path FROM images WHERE id = ?').get(overlay.imageId) : null
                const rawOverlayPath = overlayRow?.full_path || overlay.inputPath || ''
                const inputPath = path.normalize(decodeURIComponent(String(rawOverlayPath).replace(/^pluto:\/\//i, '')))
                const resolved = path.resolve(inputPath)
                if (!inputPath || !fs.existsSync(inputPath)) {
                  return json(res, { success: false, error: `Audio overlay ${index + 1} is missing its source file.` }, 400)
                }
                if (!isMediaSourcePathAllowed(resolved)) {
                  return json(res, { success: false, error: `Audio overlay ${index + 1} is outside the allowed library.` }, 403)
                }

                const streamInfo = await probeMediaStreamInfo(inputPath)
                if (!streamInfo.hasAudio) {
                  return json(res, { success: false, error: `Audio overlay ${index + 1} does not contain an audio stream.` }, 400)
                }

                const trimStart = Math.max(0, Number(overlay.trimStart || 0))
                const sourceDuration = Math.max(0, Number(overlay.sourceDuration || streamInfo.duration || 0))
                const requestedTrimEnd = Math.max(trimStart + 0.05, Number(overlay.trimEnd || sourceDuration || 0))
                const trimEnd = sourceDuration > 0 ? Math.min(requestedTrimEnd, sourceDuration) : requestedTrimEnd
                const timelineStart = Math.max(0, Number(overlay.timelineStart || 0))
                const duration = trimEnd - trimStart

                if (!Number.isFinite(duration) || duration <= 0.05) {
                  return json(res, { success: false, error: `Audio overlay ${index + 1} has an invalid trim range.` }, 400)
                }
                if (timelineStart >= projectDuration) continue

                normalizedAudioOverlays.push({
                  inputPath,
                  timelineStart,
                  trimStart,
                  duration: Math.min(duration, Math.max(0.05, projectDuration - timelineStart)),
                  volume: Math.max(0, Number(overlay.volume ?? 1)),
                  muted: !!overlay.muted,
                })
              }
            }

            const presetConfig = buildExportPresetConfig(exportPreset, referenceStreamInfo || {})
            const output = previewMode
              ? { outputPath: path.join(os.tmpdir(), `pluto-video-preview-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`), outputExt: '.mp4' }
              : buildDerivedVideoPath(normalizedClips[0].inputPath, 'edit')
            const inputArgs = []
            const filterGraph = []
            const preparedVideoLabels = []
            const preparedAudioLabels = []
            let inputIndex = 0

            for (let index = 0; index < normalizedClips.length; index += 1) {
              const clip = normalizedClips[index]
              const incomingTransition = index > 0 ? transitionDurations[index - 1] : 0
              const outgoingTransition = transitionDurations[index] || 0
              const fadeWindow = getEffectiveClipFadeWindow({
                duration: clip.duration,
                fadeIn: Math.min(clip.fadeIn, Math.max(0, clip.duration / 2 - 0.01)),
                fadeOut: Math.min(clip.fadeOut, Math.max(0, clip.duration / 2 - 0.01)),
                incomingTransition,
                outgoingTransition,
              })

              inputArgs.push('-ss', String(clip.startTime), '-t', String(clip.duration), '-i', clip.inputPath)
              const videoInputLabel = `[${inputIndex}:v:0]`
              let audioInputLabel = `[${inputIndex}:a:0]`
              inputIndex += 1

              if (!clip.streamInfo.hasAudio) {
                inputArgs.push('-f', 'lavfi', '-t', String(clip.duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
                audioInputLabel = `[${inputIndex}:a:0]`
                inputIndex += 1
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
                speed: clip.speed,
                scale: clip.scale,
                posX: clip.posX,
                posY: clip.posY,
              })
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
                speed: clip.speed,
              })

              const preparedVideoLabel = `[v${index}]`
              const preparedAudioLabel = `[a${index}]`
              const speedPts = clip.speed !== 1 ? `,setpts=PTS/${clip.speed.toFixed(4)}` : ''
              filterGraph.push(`${videoInputLabel}${videoFilter},settb=AVTB,setpts=PTS-STARTPTS${speedPts}${preparedVideoLabel}`)
              filterGraph.push(`${audioInputLabel}${audioFilter},asetpts=PTS-STARTPTS${preparedAudioLabel}`)
              preparedVideoLabels.push(preparedVideoLabel)
              preparedAudioLabels.push(preparedAudioLabel)
            }

            let finalVideoLabel = preparedVideoLabels[0]
            let finalAudioLabel = preparedAudioLabels[0]

            if (normalizedClips.length > 1) {
              let accumulatedDuration = normalizedClips[0].duration / normalizedClips[0].speed

              for (let index = 0; index < normalizedClips.length - 1; index += 1) {
                const transitionDuration = transitionDurations[index]
                const isFinalJoin = index === normalizedClips.length - 2
                const videoOutput = isFinalJoin ? '[vout]' : `[vjoin${index + 1}]`
                const audioOutput = isFinalJoin ? '[aout]' : `[ajoin${index + 1}]`
                const nextVideoLabel = preparedVideoLabels[index + 1]
                const nextAudioLabel = preparedAudioLabels[index + 1]
                const nextEffDur = normalizedClips[index + 1].duration / normalizedClips[index + 1].speed

                if (transitionDuration > 0.01) {
                  const offset = Math.max(0, accumulatedDuration - transitionDuration)
                  filterGraph.push(`${finalVideoLabel}${nextVideoLabel}xfade=transition=${normalizedClips[index].transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${videoOutput}`)
                  filterGraph.push(`${finalAudioLabel}${nextAudioLabel}acrossfade=d=${transitionDuration.toFixed(3)}:c1=${normalizedClips[index].audioTransitionCurve}:c2=${normalizedClips[index].audioTransitionCurve}${audioOutput}`)
                  accumulatedDuration += nextEffDur - transitionDuration
                } else {
                  filterGraph.push(`${finalVideoLabel}${finalAudioLabel}${nextVideoLabel}${nextAudioLabel}concat=n=2:v=1:a=1${videoOutput}${audioOutput}`)
                  accumulatedDuration += nextEffDur
                }

                finalVideoLabel = videoOutput
                finalAudioLabel = audioOutput
              }
            }

            let mappedVideoLabel = normalizedClips.length > 1 ? finalVideoLabel : preparedVideoLabels[0]
            let mappedAudioLabel = normalizedClips.length > 1 ? finalAudioLabel : preparedAudioLabels[0]

            if (normalizedAudioOverlays.length) {
              const overlayLabels = []

              for (let index = 0; index < normalizedAudioOverlays.length; index += 1) {
                const overlay = normalizedAudioOverlays[index]
                inputArgs.push('-i', overlay.inputPath)
                const overlayInputLabel = `[${inputIndex}:a:0]`
                const overlayOutputLabel = `[ao${index}]`
                inputIndex += 1

                const delayMs = Math.max(0, Math.round(overlay.timelineStart * 1000))
                const overlayFilter = [
                  `atrim=start=${overlay.trimStart.toFixed(3)}:end=${(overlay.trimStart + overlay.duration).toFixed(3)}`,
                  'asetpts=PTS-STARTPTS',
                  buildClipAudioFilter({ duration: overlay.duration, volume: Math.min(2, overlay.volume), muted: overlay.muted }),
                  `adelay=${delayMs}|${delayMs}`,
                  `atrim=end=${projectDuration.toFixed(3)}`,
                ].join(',')

                filterGraph.push(`${overlayInputLabel}${overlayFilter}${overlayOutputLabel}`)
                overlayLabels.push(overlayOutputLabel)
              }

              const mixedAudioLabel = '[amixout]'
              filterGraph.push(`${[mappedAudioLabel, ...overlayLabels].join('')}amix=inputs=${overlayLabels.length + 1}:normalize=0:dropout_transition=0${mixedAudioLabel}`)
              mappedAudioLabel = mixedAudioLabel
            }

            // --- Text overlays (drawtext) ---
            if (Array.isArray(textOverlays) && textOverlays.length > 0) {
              const safeTextOverlays = textOverlays.filter((t) => t && typeof t.text === 'string' && t.text.trim().length > 0)
              if (safeTextOverlays.length > 0) {
                const escapeDrawtext = (str) => String(str).replace(/\\/g, '\\\\').replace(/'/g, "'\\\\'").replace(/:/g, '\\:').replace(/;/g, '\\;').replace(/%/g, '%%')
                const drawtextFilters = safeTextOverlays.map((t) => {
                  const escapedText = escapeDrawtext(t.text)
                  const fontSize = Math.max(8, Math.min(200, Number(t.fontSize) || 48))
                  const fontColor = String(t.color || '#ffffff').replace('#', '0x')
                  const bgColor = t.backgroundColor ? String(t.backgroundColor).replace('#', '0x') + '@0.6' : ''
                  const fontFamily = String(t.fontFamily || 'sans-serif')
                  const posX = Math.max(0, Math.min(100, Number(t.positionX) || 50))
                  const posY = Math.max(0, Math.min(100, Number(t.positionY) || 85))
                  const timelineStart = Math.max(0, Number(t.timelineStart) || 0)
                  const duration = Math.max(0.5, Number(t.duration) || 3)
                  const fadeIn = Math.max(0, Number(t.fadeIn) || 0)
                  const fadeOut = Math.max(0, Number(t.fadeOut) || 0)

                  const x = `(w*${(posX / 100).toFixed(4)}-text_w/2)`
                  const y = `(h*${(posY / 100).toFixed(4)}-text_h/2)`

                  const enableExpr = `between(t\\,${timelineStart.toFixed(3)}\\,${(timelineStart + duration).toFixed(3)})`

                  // Build alpha expression for fade in/out
                  let alphaExpr = '1'
                  if (fadeIn > 0 && fadeOut > 0) {
                    const fadeOutStart = (timelineStart + duration - fadeOut).toFixed(3)
                    alphaExpr = `if(lt(t-${timelineStart.toFixed(3)}\\,${fadeIn.toFixed(3)})\\,(t-${timelineStart.toFixed(3)})/${fadeIn.toFixed(3)}\\,if(gt(t\\,${fadeOutStart})\\,(${(timelineStart + duration).toFixed(3)}-t)/${fadeOut.toFixed(3)}\\,1))`
                  } else if (fadeIn > 0) {
                    alphaExpr = `if(lt(t-${timelineStart.toFixed(3)}\\,${fadeIn.toFixed(3)})\\,(t-${timelineStart.toFixed(3)})/${fadeIn.toFixed(3)}\\,1)`
                  } else if (fadeOut > 0) {
                    const fadeOutStart = (timelineStart + duration - fadeOut).toFixed(3)
                    alphaExpr = `if(gt(t\\,${fadeOutStart})\\,(${(timelineStart + duration).toFixed(3)}-t)/${fadeOut.toFixed(3)}\\,1)`
                  }

                  const parts = [
                    `text='${escapedText}'`,
                    `fontsize=${fontSize}`,
                    `fontcolor=${fontColor}`,
                    `alpha='${alphaExpr}'`,
                    `x=${x}`,
                    `y=${y}`,
                    `enable='${enableExpr}'`,
                  ]
                  if (fontFamily !== 'sans-serif') parts.push(`font='${fontFamily}'`)
                  if (bgColor) parts.push(`box=1:boxcolor=${bgColor}:boxborderw=8`)

                  return `drawtext=${parts.join(':')}`
                })

                const dtInputLabel = mappedVideoLabel
                const dtOutputLabel = '[vtxt]'
                filterGraph.push(`${dtInputLabel}${drawtextFilters.join(',')}${dtOutputLabel}`)
                mappedVideoLabel = dtOutputLabel
              }
            }

            // --- Watermark (drawtext for text mode, overlay for image mode) ---
            if (watermark && watermark.enabled) {
              const wmOpacity = Math.max(0.01, Math.min(1, Number(watermark.opacity) || 0.3))
              const wmMargin = Math.max(0, Math.min(200, Number(watermark.margin) || 20))
              const wmRotation = Number(watermark.rotation) || 0

              const positionToXY = (pos) => {
                const positions = {
                  'top-left': { x: `${wmMargin}`, y: `${wmMargin}` },
                  'top-center': { x: '(w-text_w)/2', y: `${wmMargin}` },
                  'top-right': { x: `w-text_w-${wmMargin}`, y: `${wmMargin}` },
                  'center-left': { x: `${wmMargin}`, y: '(h-text_h)/2' },
                  'center': { x: '(w-text_w)/2', y: '(h-text_h)/2' },
                  'center-right': { x: `w-text_w-${wmMargin}`, y: '(h-text_h)/2' },
                  'bottom-left': { x: `${wmMargin}`, y: `h-text_h-${wmMargin}` },
                  'bottom-center': { x: '(w-text_w)/2', y: `h-text_h-${wmMargin}` },
                  'bottom-right': { x: `w-text_w-${wmMargin}`, y: `h-text_h-${wmMargin}` },
                }
                if (pos === 'custom') {
                  const cx = Math.max(0, Math.min(100, Number(watermark.customX) || 90))
                  const cy = Math.max(0, Math.min(100, Number(watermark.customY) || 90))
                  return { x: `(w*${(cx/100).toFixed(4)}-text_w/2)`, y: `(h*${(cy/100).toFixed(4)}-text_h/2)` }
                }
                return positions[pos] || positions['bottom-right']
              }

              const positionToOverlayXY = (pos, overlayW, overlayH) => {
                const positions = {
                  'top-left': { x: `${wmMargin}`, y: `${wmMargin}` },
                  'top-center': { x: `(main_w-${overlayW})/2`, y: `${wmMargin}` },
                  'top-right': { x: `main_w-${overlayW}-${wmMargin}`, y: `${wmMargin}` },
                  'center-left': { x: `${wmMargin}`, y: `(main_h-${overlayH})/2` },
                  'center': { x: `(main_w-${overlayW})/2`, y: `(main_h-${overlayH})/2` },
                  'center-right': { x: `main_w-${overlayW}-${wmMargin}`, y: `(main_h-${overlayH})/2` },
                  'bottom-left': { x: `${wmMargin}`, y: `main_h-${overlayH}-${wmMargin}` },
                  'bottom-center': { x: `(main_w-${overlayW})/2`, y: `main_h-${overlayH}-${wmMargin}` },
                  'bottom-right': { x: `main_w-${overlayW}-${wmMargin}`, y: `main_h-${overlayH}-${wmMargin}` },
                }
                if (pos === 'custom') {
                  const cx = Math.max(0, Math.min(100, Number(watermark.customX) || 90))
                  const cy = Math.max(0, Math.min(100, Number(watermark.customY) || 90))
                  return { x: `(main_w*${(cx/100).toFixed(4)}-${overlayW}/2)`, y: `(main_h*${(cy/100).toFixed(4)}-${overlayH}/2)` }
                }
                return positions[pos] || positions['bottom-right']
              }

              if (watermark.mode === 'text' && watermark.text && watermark.text.trim()) {
                const escapeDrawtext = (str) => String(str).replace(/\\/g, '\\\\').replace(/'/g, "'\\\\'").replace(/:/g, '\\:').replace(/;/g, '\\;').replace(/%/g, '%%')
                const escapedText = escapeDrawtext(watermark.text.trim())
                const fontSize = Math.max(8, Math.min(200, Number(watermark.fontSize) || 24))
                const fontColor = String(watermark.color || '#ffffff').replace('#', '0x')
                const fontFamily = String(watermark.fontFamily || 'sans-serif')
                const fontWeight = watermark.fontWeight === 'bold' || watermark.fontWeight === '600' || watermark.fontWeight === '900' ? 'bold' : ''
                const wmPosition = String(watermark.position || 'bottom-right')

                if (wmPosition === 'tile') {
                  const tileSpacing = Math.max(50, Math.min(600, Number(watermark.tileSpacing) || 200))
                  const drawtextTiles = []
                  for (let row = 0; row < 5; row++) {
                    for (let col = 0; col < 8; col++) {
                      const tileX = col * tileSpacing
                      const tileY = row * tileSpacing
                      const parts = [
                        `text='${escapedText}'`,
                        `fontsize=${fontSize}`,
                        `fontcolor=${fontColor}@${wmOpacity.toFixed(2)}`,
                        `x=${tileX}`,
                        `y=${tileY}`,
                      ]
                      if (fontFamily !== 'sans-serif') parts.push(`font='${fontFamily}'`)
                      if (watermark.shadow) {
                        const shadowColor = String(watermark.shadowColor || '#000000').replace('#', '0x')
                        parts.push(`shadowcolor=${shadowColor}@0.5:shadowx=2:shadowy=2`)
                      }
                      drawtextTiles.push(`drawtext=${parts.join(':')}`)
                    }
                  }
                  const wmInputLabel = mappedVideoLabel
                  const wmOutputLabel = '[vwm]'
                  filterGraph.push(`${wmInputLabel}${drawtextTiles.join(',')}${wmOutputLabel}`)
                  mappedVideoLabel = wmOutputLabel
                } else {
                  const { x, y } = positionToXY(wmPosition)
                  const parts = [
                    `text='${escapedText}'`,
                    `fontsize=${fontSize}`,
                    `fontcolor=${fontColor}@${wmOpacity.toFixed(2)}`,
                    `x=${x}`,
                    `y=${y}`,
                  ]
                  if (fontFamily !== 'sans-serif') parts.push(`font='${fontFamily}'`)
                  if (watermark.shadow) {
                    const shadowColor = String(watermark.shadowColor || '#000000').replace('#', '0x')
                    parts.push(`shadowcolor=${shadowColor}@0.5:shadowx=2:shadowy=2`)
                  }
                  const wmInputLabel = mappedVideoLabel
                  const wmOutputLabel = '[vwm]'
                  filterGraph.push(`${wmInputLabel}drawtext=${parts.join(':')}${wmOutputLabel}`)
                  mappedVideoLabel = wmOutputLabel
                }
              } else if (watermark.mode === 'image' && watermark.imagePath) {
                const wmImagePath = path.normalize(String(watermark.imagePath))
                if (fs.existsSync(wmImagePath)) {
                  const wmScale = Math.max(5, Math.min(500, Number(watermark.scale) || 100))
                  const wmPosition = String(watermark.position || 'bottom-right')
                  inputArgs.push('-i', wmImagePath)
                  const wmInputIndex = inputIndex
                  inputIndex += 1

                  const scaledW = `iw*${(wmScale/100).toFixed(4)}`
                  const scaledH = `ih*${(wmScale/100).toFixed(4)}`
                  const wmScaleLabel = `[wmscaled]`
                  const rotateFilter = wmRotation !== 0 ? `,rotate=${(wmRotation * Math.PI / 180).toFixed(4)}:c=none` : ''

                  filterGraph.push(`[${wmInputIndex}:v:0]scale=${scaledW}:${scaledH},format=rgba,colorchannelmixer=aa=${wmOpacity.toFixed(2)}${rotateFilter}${wmScaleLabel}`)

                  if (wmPosition === 'tile') {
                    const tileSpacing = Math.max(50, Math.min(600, Number(watermark.tileSpacing) || 200))
                    const tiledLabel = '[wmtiled]'
                    filterGraph.push(`${wmScaleLabel}tile=layout=8x5:init_padding=0:overlap=0:padding=${tileSpacing}${tiledLabel}`)
                    const wmOutLabel = '[vwm]'
                    filterGraph.push(`${mappedVideoLabel}${tiledLabel}overlay=0:0:shortest=1${wmOutLabel}`)
                    mappedVideoLabel = wmOutLabel
                  } else {
                    const { x, y } = positionToOverlayXY(wmPosition, 'overlay_w', 'overlay_h')
                    const wmOutLabel = '[vwm]'
                    filterGraph.push(`${mappedVideoLabel}${wmScaleLabel}overlay=${x}:${y}:shortest=1${wmOutLabel}`)
                    mappedVideoLabel = wmOutLabel
                  }
                }
              }
            }

            await runFfmpegCommand([
              '-y',
              ...inputArgs,
              '-filter_complex', filterGraph.join(';'),
              '-map', mappedVideoLabel,
              '-map', mappedAudioLabel,
              '-r', '30',
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', previewMode ? '22' : '20',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac', '-b:a', previewMode ? '160k' : '192k',
              '-ar', '48000',
              '-movflags', '+faststart',
              output.outputPath,
            ])

            if (previewMode) ephemeralPreviewPaths.add(normalizeAllowedPath(output.outputPath))
            if (!previewMode) insertGeneratedVideo(output.outputPath, output.outputExt, normalizedClips[0].inputPath)
            return json(res, { success: true, outputPath: output.outputPath })
          } catch (err) {
            console.error('[Pluto API] Compose video error:', err.message)
            return json(res, { success: false, error: err.message }, 500)
          }
        }

        // --- Find duplicates (server-side perceptual hash) ---
        if (pathname === '/api/find-duplicates') {
          if (!checkLicense('duplicateFinder')) return json(res, { error: 'Duplicate finder requires a Pro license.' }, 403)
          try {
            const sharp = (await import('sharp')).default
            const scanMode = ['exact', 'near', 'both'].includes(body?.scanMode) ? body.scanMode : 'both'
            const shouldScanExact = scanMode === 'exact' || scanMode === 'both'
            const shouldScanNear = scanMode === 'near' || scanMode === 'both'
            const supportedNearTypes = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp'])

            const computeExactFileHash = async (fullPath) => await new Promise((resolve, reject) => {
              const hash = crypto.createHash('sha256')
              const stream = fs.createReadStream(fullPath)
              stream.on('data', (chunk) => hash.update(chunk))
              stream.on('end', () => resolve(hash.digest('hex')))
              stream.on('error', reject)
            })

            const computeExactQuickHash = async (fullPath, fileSize) => {
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

            const computePerceptualHash = async (fullPath) => {
              const meta = await sharp(fullPath, { failOn: 'none' }).metadata()
              const raw = await sharp(fullPath, { failOn: 'none' }).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer()
              let hash = ''
              for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                  hash += raw[row * 9 + col] < raw[row * 9 + col + 1] ? '1' : '0'
                }
              }
              return {
                phash: hash,
                width: meta.width || null,
                height: meta.height || null,
              }
            }

            const hamming = (a, b) => {
              if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER
              let d = 0
              for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
              return d
            }

            const isExactDuplicatePair = (left, right) => !!left.exact_hash && left.exact_hash === right.exact_hash
            const isNearDuplicatePair = (left, right) => {
              if (!left.phash || !right.phash) return false
              const aspectLeft = left.width && left.height ? left.width / Math.max(1, left.height) : null
              const aspectRight = right.width && right.height ? right.width / Math.max(1, right.height) : null
              if (aspectLeft !== null && aspectRight !== null && Math.abs(aspectLeft - aspectRight) > 0.12) return false
              const sizeRatio = Math.max(left.file_size || 1, right.file_size || 1) / Math.max(1, Math.min(left.file_size || 1, right.file_size || 1))
              if (sizeRatio > 3.5) return false
              return hamming(left.phash, right.phash) <= 6
            }

            const allImages = db.prepare(`
              SELECT i.id, i.name, i.full_path, i.file_type
              FROM images i
            `).all()

            const itemsById = new Map()
            const existingHashes = db.prepare(`
              SELECT h.image_id, h.phash, h.exact_hash, h.exact_quick_hash, h.file_size, h.width, h.height, i.name, i.full_path, i.file_type
              FROM image_hashes h JOIN images i ON h.image_id = i.id
            `).all()

            for (const row of existingHashes) {
              itemsById.set(row.image_id, {
                id: row.image_id,
                name: row.name,
                full_path: row.full_path,
                file_type: row.file_type,
                phash: row.phash,
                exact_hash: row.exact_hash,
                exact_quick_hash: row.exact_quick_hash,
                file_size: row.file_size,
                width: row.width,
                height: row.height,
              })
            }

            const imagesNeedingMetadata = allImages.filter((img) => {
              const existing = itemsById.get(img.id)
              const needsNear = shouldScanNear && supportedNearTypes.has((img.file_type || '').toLowerCase()) && !existing?.phash
              return needsNear || !existing?.file_size
            })

            const insertHash = db.prepare('INSERT OR REPLACE INTO image_hashes (image_id, phash, exact_hash, exact_quick_hash, file_size, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
            const persistItemHashes = (item) => {
              insertHash.run(item.id, item.phash, item.exact_hash, item.exact_quick_hash, item.file_size, item.width, item.height)
            }

            for (const img of imagesNeedingMetadata) {
              try {
                const current = itemsById.get(img.id) || {
                  id: img.id,
                  name: img.name,
                  full_path: img.full_path,
                  file_type: img.file_type,
                  phash: null,
                  exact_hash: null,
                  exact_quick_hash: null,
                  file_size: null,
                  width: null,
                  height: null,
                }
                const stats = fs.statSync(img.full_path)
                const fileType = (img.file_type || '').toLowerCase()
                let phash = current.phash || null
                let exactHash = current.exact_hash || null
                let exactQuickHash = current.exact_quick_hash || null
                let width = current.width || null
                let height = current.height || null

                if (current.file_size !== null && current.file_size !== stats.size) {
                  phash = null
                  exactHash = null
                  exactQuickHash = null
                  width = null
                  height = null
                }

                if (shouldScanNear && supportedNearTypes.has(fileType) && !phash) {
                  try {
                    const perceptual = await computePerceptualHash(img.full_path)
                    phash = perceptual.phash
                    width = perceptual.width
                    height = perceptual.height
                  } catch {}
                }

                const updated = {
                  ...current,
                  phash,
                  exact_hash: exactHash,
                  exact_quick_hash: exactQuickHash,
                  file_size: stats.size,
                  width,
                  height,
                }
                persistItemHashes(updated)
                itemsById.set(img.id, updated)
              } catch {}
            }

            if (shouldScanExact) {
              const sizeBuckets = new Map()
              for (const item of itemsById.values()) {
                if (!item.file_size || item.file_size < 1) continue
                if (!sizeBuckets.has(item.file_size)) sizeBuckets.set(item.file_size, [])
                sizeBuckets.get(item.file_size).push(item)
              }

              const exactCandidates = Array.from(sizeBuckets.values()).filter((bucket) => bucket.length > 1)
              const quickHashTargets = exactCandidates.flat().filter((item) => !item.exact_quick_hash)
              for (const item of quickHashTargets) {
                try {
                  item.exact_quick_hash = await computeExactQuickHash(item.full_path, item.file_size)
                  persistItemHashes(item)
                } catch {}
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

              for (const item of fullHashTargets) {
                try {
                  item.exact_hash = await computeExactFileHash(item.full_path)
                  persistItemHashes(item)
                } catch {}
              }
            }

            const allHashes = Array.from(itemsById.values())

            // Get dismissed pairs
            const dismissed = new Set()
            db.prepare('SELECT image_id_1, image_id_2 FROM dismissed_duplicates').all().forEach(r => {
              dismissed.add(`${r.image_id_1}-${r.image_id_2}`)
            })

            const parent = new Map(allHashes.map((item) => [item.id, item.id]))
            const find = (id) => {
              let value = id
              while (parent.get(value) !== value) {
                parent.set(value, parent.get(parent.get(value)))
                value = parent.get(value)
              }
              return value
            }
            const union = (leftId, rightId) => {
              const leftRoot = find(leftId)
              const rightRoot = find(rightId)
              if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
            }

            if (shouldScanExact) {
              const exactBuckets = new Map()
              for (const item of allHashes) {
                if (!item.exact_hash) continue
                if (!exactBuckets.has(item.exact_hash)) exactBuckets.set(item.exact_hash, [])
                exactBuckets.get(item.exact_hash).push(item)
              }
              for (const bucket of exactBuckets.values()) {
                if (bucket.length < 2) continue
                for (let i = 1; i < bucket.length; i++) {
                  const pairKey = `${Math.min(bucket[0].id, bucket[i].id)}-${Math.max(bucket[0].id, bucket[i].id)}`
                  if (!dismissed.has(pairKey)) union(bucket[0].id, bucket[i].id)
                }
              }
            }

            if (shouldScanNear) {
              const bandBuckets = new Map()
              for (const item of allHashes) {
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
                    const left = bucket[i]
                    const right = bucket[j]
                    const pairKey = `${Math.min(left.id, right.id)}-${Math.max(left.id, right.id)}`
                    if (dismissed.has(pairKey) || comparedPairs.has(pairKey)) continue
                    comparedPairs.add(pairKey)
                    if (shouldScanExact && isExactDuplicatePair(left, right)) continue
                    if (isNearDuplicatePair(left, right)) union(left.id, right.id)
                  }
                }
              }
            }

            const grouped = new Map()
            for (const item of allHashes) {
              const root = find(item.id)
              if (!grouped.has(root)) grouped.set(root, [])
              grouped.get(root).push(item)
            }

            const groups = Array.from(grouped.values())
              .filter(group => group.length > 1)
              .map(group => group.map(g => ({
                id: g.id,
                name: g.name,
                original: g.full_path,
                thumb: `/api/thumbnail/${g.id}`,
                file_size: g.file_size
              })))
              .sort((left, right) => right.length - left.length)

            return json(res, { groups })
          } catch (err) {
            console.error('[Pluto API] Duplicate scan error:', err.message)
            return json(res, { error: 'Duplicate scan failed: ' + err.message }, 500)
          }
        }

        // --- Dismiss duplicate group ---
        if (pathname === '/api/dismiss-duplicate-group') {
          const { imageIds } = body
          if (!imageIds || imageIds.length < 2) return json(res, { error: 'Need at least 2 image IDs' }, 400)
          const insert = db.prepare('INSERT OR IGNORE INTO dismissed_duplicates (image_id_1, image_id_2) VALUES (?, ?)')
          db.transaction(() => {
            for (let i = 0; i < imageIds.length; i++) {
              for (let j = i + 1; j < imageIds.length; j++) {
                insert.run(Math.min(imageIds[i], imageIds[j]), Math.max(imageIds[i], imageIds[j]))
              }
            }
          })()
          return json(res, { success: true })
        }

        // --- Delete duplicate (move to trash / remove from DB) ---
        if (pathname === '/api/delete-duplicate') {
          const { imageId } = body
          if (!imageId) return json(res, { error: 'Missing imageId' }, 400)
          // Get file path before deleting from DB so we can remove from disk
          const img = db.prepare('SELECT full_path FROM images WHERE id = ?').get(imageId)
          db.prepare('DELETE FROM image_hashes WHERE image_id = ?').run(imageId)
          db.prepare('DELETE FROM image_faces WHERE image_id = ?').run(imageId)
          db.prepare('DELETE FROM album_images WHERE image_id = ?').run(imageId)
          db.prepare('DELETE FROM image_tags WHERE image_id = ?').run(imageId)
          db.prepare('DELETE FROM image_captions WHERE image_id = ?').run(imageId)
          db.prepare('DELETE FROM images WHERE id = ?').run(imageId)
          // Also delete from disk
          if (img && img.full_path) {
            try {
              if (_shell) await _shell.trashItem(img.full_path)
              else if (fs.existsSync(img.full_path)) fs.unlinkSync(img.full_path)
            } catch (e) {
              console.warn('[delete-duplicate] Could not remove file:', e.message)
            }
          }
          return json(res, { success: true })
        }

        // --- Import from Immich server ---
        if (pathname === '/api/import-from-immich') {
          const { serverUrl, apiKey } = body
          if (!serverUrl || !apiKey) return json(res, { error: 'Missing serverUrl or apiKey' }, 400)

          // SSRF protection: block requests to private/internal networks
          try {
            const parsed = new URL(serverUrl)
            const hostname = parsed.hostname.toLowerCase()
            const blockedPatterns = [
              /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
              /^0\./, /^\[::1?\]$/, /^169\.254\./, /^fc00:/i, /^fe80:/i, /^fd/i
            ]
            if (blockedPatterns.some(p => p.test(hostname))) {
              return json(res, { error: 'Cannot connect to private/internal network addresses.' }, 400)
            }
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              return json(res, { error: 'Only HTTP and HTTPS URLs are allowed.' }, 400)
            }
          } catch {
            return json(res, { error: 'Invalid server URL.' }, 400)
          }

          try {
            // Paginate through all assets
            let allAssets = []
            let page = 1
            const MAX_PAGES = 500 // Safety cap to prevent infinite loops
            while (page <= MAX_PAGES) {
              const resp = await fetch(`${serverUrl}/api/assets?size=1000&page=${page}`, {
                headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
              })
              if (!resp.ok) return json(res, { error: `Immich API error: ${resp.status}` }, 502)
              const assets = await resp.json()
              if (!assets.length) break
              allAssets.push(...assets)
              page++
            }
            // Download to /imports/immich
            const outputDir = path.join('/imports', 'immich')
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
            let downloaded = 0
            const folder = db.prepare('SELECT id FROM folders LIMIT 1').get()
            const folderId = folder ? folder.id : null
            for (const asset of allAssets) {
              try {
                // Sanitize filename to prevent path traversal
                const safeName = path.basename(asset.originalFileName || 'unknown')
                const outPath = path.join(outputDir, safeName)
                if (!path.resolve(outPath).startsWith(path.resolve(outputDir))) continue
                if (fs.existsSync(outPath)) { downloaded++; continue }
                const dlResp = await fetch(`${serverUrl}/api/assets/${asset.id}/original`, {
                  headers: { 'x-api-key': apiKey }
                })
                if (!dlResp.ok) continue
                const buffer = Buffer.from(await dlResp.arrayBuffer())
                fs.writeFileSync(outPath, buffer)
                // Insert into DB
                const name = safeName
                const ext = path.extname(name).slice(1).toLowerCase()
                let dateTaken = asset.exifInfo?.dateTimeOriginal ? new Date(asset.exifInfo.dateTimeOriginal).getTime() : null
                let gpsLat = asset.exifInfo?.latitude || null
                let gpsLng = asset.exifInfo?.longitude || null
                if (!dateTaken) {
                  try {
                    const exifr = (await import('exifr')).default
                    const exif = await exifr.parse(outPath, { pick: ['DateTimeOriginal', 'CreateDate'] }).catch(() => null)
                    if (exif?.DateTimeOriginal) dateTaken = new Date(exif.DateTimeOriginal).getTime()
                    else if (exif?.CreateDate) dateTaken = new Date(exif.CreateDate).getTime()
                  } catch {}
                }
                if (!dateTaken) {
                  const stats = fs.statSync(outPath)
                  dateTaken = Math.min(stats.mtimeMs, stats.birthtimeMs || stats.mtimeMs)
                }
                const existing = db.prepare('SELECT id FROM images WHERE full_path = ?').get(outPath)
                if (!existing) {
                  db.prepare('INSERT INTO images (name, full_path, file_type, date_taken, gps_lat, gps_lng, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                    name, outPath, ext, dateTaken, gpsLat, gpsLng, folderId
                  )
                }
                downloaded++
              } catch {}
            }
            // Trigger thumbnail generation in the background
            if (importFolderHandler) {
              setImmediate(async () => { try { await importFolderHandler(outputDir) } catch {} })
            }
            return json(res, { success: true, downloaded, total: allAssets.length })
          } catch (err) {
            return json(res, { error: err.message || 'Immich import failed' }, 500)
          }
        }

        // --- Import from path (Cloud / Takeout) ---
        if (pathname === '/api/import-from-path') {
          const { importPath } = body
          if (!importPath) return json(res, { error: 'Missing importPath' }, 400)
          // Security: only allow paths under /photos or /imports
          const resolved = path.resolve(importPath)
          if (!resolved.startsWith('/photos') && !resolved.startsWith('/imports') && !resolved.startsWith('/data')) {
            return json(res, { error: 'Access denied: path must be under /photos, /imports, or /data' }, 403)
          }
          if (!fs.existsSync(resolved)) return json(res, { error: 'Path not found: ' + importPath }, 404)

          // Recursively find media files
          const walkDir = (dir) => {
            const entries = []
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true })
              for (const item of items) {
                const fullPath = path.join(dir, item.name)
                if (item.isDirectory()) entries.push(...walkDir(fullPath))
                else if (/\.(jpe?g|png|webp|gif|mp4|webm|mov|mkv|avi|pdf|ico|psd)$/i.test(item.name)) entries.push(fullPath)
              }
            } catch {}
            return entries
          }

          const mediaFiles = walkDir(resolved)
          let imported = 0
          let matched = 0
          const folder = db.prepare('SELECT id FROM folders LIMIT 1').get()
          const folderId = folder ? folder.id : null

          for (const filePath of mediaFiles) {
            try {
              const name = path.basename(filePath)
              const ext = path.extname(filePath).slice(1).toLowerCase()
              let dateTaken = null
              let gpsLat = null
              let gpsLng = null

              // Check for JSON sidecar (Google Takeout format)
              for (const sidecar of [filePath + '.json', filePath + '.supplemental-metadata.json', filePath.replace(/\.[^.]+$/, '.json')]) {
                if (!fs.existsSync(sidecar)) continue
                try {
                  const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8'))
                  if (!dateTaken && meta.photoTakenTime?.timestamp) { dateTaken = Number(meta.photoTakenTime.timestamp) * 1000; matched++ }
                  if (!gpsLat) {
                    const geo = meta.geoData || meta.geoDataExif
                    if (geo && geo.latitude && geo.latitude !== 0) { gpsLat = geo.latitude; gpsLng = geo.longitude }
                  }
                } catch {}
                if (dateTaken && gpsLat) break
              }

              // Try EXIF
              if (!dateTaken || !gpsLat) {
                try {
                  const exifr = (await import('exifr')).default
                  if (!gpsLat) {
                    const gps = await exifr.gps(filePath).catch(() => null)
                    if (gps?.latitude && gps?.longitude) { gpsLat = gps.latitude; gpsLng = gps.longitude }
                  }
                  if (!dateTaken) {
                    const exif = await exifr.parse(filePath, { pick: ['DateTimeOriginal', 'CreateDate'] }).catch(() => null)
                    if (exif?.DateTimeOriginal) dateTaken = new Date(exif.DateTimeOriginal).getTime()
                    else if (exif?.CreateDate) dateTaken = new Date(exif.CreateDate).getTime()
                  }
                } catch {}
              }

              // Fallback to file modification time
              if (!dateTaken) {
                const stats = fs.statSync(filePath)
                dateTaken = Math.min(stats.mtimeMs, stats.birthtimeMs || stats.mtimeMs)
              }

              const existing = db.prepare('SELECT id FROM images WHERE full_path = ?').get(filePath)
              if (!existing) {
                db.prepare('INSERT INTO images (name, full_path, file_type, date_taken, gps_lat, gps_lng, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                  name, filePath, ext, dateTaken, gpsLat, gpsLng, folderId
                )
                imported++
              }
            } catch {}
          }
          return json(res, { success: true, imported, matched, total: mediaFiles.length })
        }

        // --- Activate license ---
        if (pathname === '/api/activate-license') {
          if (!licenseManager) return json(res, { error: 'License management not available' }, 400)
          const { email, licenseKey } = body
          if (!email || !licenseKey) return json(res, { error: 'Missing email or licenseKey' }, 400)
          const result = await licenseManager.activateLicense(email, licenseKey)
          return json(res, result, result.success ? 200 : 400)
        }

        // --- Deactivate license ---
        if (pathname === '/api/deactivate-license') {
          if (!licenseManager) return json(res, { error: 'License management not available' }, 400)
          const result = await licenseManager.deactivateLicense()
          return json(res, result)
        }

        // --- Start free trial ---
        if (pathname === '/api/start-trial') {
          if (!licenseManager) return json(res, { error: 'License management not available' }, 400)
          const { email } = body
          if (!email) return json(res, { error: 'Missing email' }, 400)
          const result = await licenseManager.startFreeTrial(email)
          return json(res, result, result.success ? 200 : 400)
        }

        // --- Toggle project collapse ---
        if (pathname === '/api/toggle-project-collapse') {
          const { id } = body
          if (!id) return json(res, { error: 'Missing id' }, 400)
          const current = db.prepare('SELECT is_collapsed FROM projects WHERE id = ?').get(id)
          if (!current) return json(res, { error: 'Project not found' }, 404)
          db.prepare('UPDATE projects SET is_collapsed = ? WHERE id = ?').run(current.is_collapsed ? 0 : 1, id)
          return json(res, { success: true })
        }

        // --- Caption a single image ---
        if (pathname === '/api/caption-image') {
          if (!checkLicense('contextSearch')) return json(res, { error: 'Contextual Search requires a Pro license.' }, 403)
          if (!captionImageHandler) return json(res, { error: 'Captioning not available in this environment' }, 501)
          const { imageId, imagePath } = body
          if (!imageId || !imagePath) return json(res, { error: 'Missing imageId or imagePath' }, 400)
          try {
            const result = await captionImageHandler(imageId, imagePath)
            return json(res, result)
          } catch (err) {
            return json(res, { success: false, error: err.message }, 500)
          }
        }

        // --- Reset caption data ---
        if (pathname === '/api/reset-caption-data') {
          db.prepare('DELETE FROM image_captions').run()
          return json(res, { success: true })
        }
      }

      // 404
      json(res, { error: 'Not Found' }, 404)
    } catch (err) {
      console.error('[Pluto API] Error:', err)
      json(res, { error: 'Internal Server Error' }, 500)
    }
  }

  // --- HTTPS + HTTP redirect server ---
  let httpsServer = null
  let httpRedirectServer = null
  let isRunning = false
  let usingHttps = false
  let importFolderHandler = null
  let contextSearchHandler = null
  let captionModelCheckHandler = null
  let captionImageHandler = null

  return {
    start: (port = PORT) =>
      new Promise(async (resolve, reject) => {
        const certDir = path.join(electronApp.getPath('userData'), 'tls')
        const tlsCerts = await ensureTlsCerts(certDir)

        if (tlsCerts) {
          // === HTTPS server (main) ===
          usingHttps = true
          httpsServer = https.createServer({
            key: tlsCerts.key,
            cert: tlsCerts.cert,
            // TLS hardening
            minVersion: 'TLSv1.2',
            ciphers: [
              'TLS_AES_256_GCM_SHA384',
              'TLS_AES_128_GCM_SHA256',
              'TLS_CHACHA20_POLY1305_SHA256',
              'ECDHE-RSA-AES256-GCM-SHA384',
              'ECDHE-RSA-AES128-GCM-SHA256',
            ].join(':'),
            honorCipherOrder: true,
          }, requestHandler)

          httpsServer.listen(port, '0.0.0.0', () => {
            isRunning = true
            const addresses = getLocalIPs()
            console.log(`[Pluto API] HTTPS server running on port ${port}`)
            addresses.forEach(a => console.log(`  → https://${a.address}:${port}`))

            // === HTTP redirect server (port+1 → HTTPS) ===
            const httpPort = port + 1
            httpRedirectServer = http.createServer((req, res) => {
              const host = req.headers.host?.replace(`:${httpPort}`, `:${port}`) || `localhost:${port}`
              res.writeHead(301, { Location: `https://${host}${req.url}` })
              res.end()
            })
            httpRedirectServer.listen(httpPort, '0.0.0.0', () => {
              console.log(`[Pluto API] HTTP redirect server on port ${httpPort} → HTTPS ${port}`)
            })
            httpRedirectServer.on('error', (err) => {
              console.warn(`[Pluto API] HTTP redirect server failed (non-critical): ${err.message}`)
            })

            resolve({ port, addresses, https: true })
          })
          httpsServer.on('error', reject)
        } else {
          // === Fallback: HTTP only (no openssl available) ===
          usingHttps = false
          console.warn('[Pluto API] Running in HTTP-only mode — credentials are NOT encrypted in transit!')
          httpsServer = http.createServer(requestHandler)
          httpsServer.listen(port, '0.0.0.0', () => {
            isRunning = true
            const addresses = getLocalIPs()
            console.log(`[Pluto API] HTTP server running on port ${port} (no TLS)`)
            addresses.forEach(a => console.log(`  → http://${a.address}:${port}`))
            resolve({ port, addresses, https: false })
          })
          httpsServer.on('error', reject)
        }
      }),
    stop: () =>
      new Promise(resolve => {
        if (!isRunning) return resolve()
        const closeMain = () => {
          httpsServer?.close(() => {
            isRunning = false
            resolve()
          })
        }
        if (httpRedirectServer) {
          httpRedirectServer.close(closeMain)
        } else {
          closeMain()
        }
      }),
    isRunning: () => isRunning,
    getInfo: () => {
      const creds = getCredentials()
      return {
        port: PORT,
        addresses: getLocalIPs(),
        running: isRunning,
        https: usingHttps,
        hasPassword: !!creds,
        username: creds?.username || null,
      }
    },
    setCredentials,
    clearCredentials,
    getCredentials,
    onImportFolder: (handler) => { importFolderHandler = handler },
    onContextSearch: (handler) => { contextSearchHandler = handler },
    onCaptionModelCheck: (handler) => { captionModelCheckHandler = handler },
    onCaptionImage: (handler) => { captionImageHandler = handler },
    verifyCurrentPassword: (password) => {
      const creds = getCredentials()
      if (!creds) return false
      return verifyPassword(password, creds.hash, creds.salt)
    },
  }
}
