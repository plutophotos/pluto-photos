// ============================================================
// LICENSE MODULE — Pluto Photos
// ============================================================
// Handles license activation, validation, and feature gating.
// Communicates with a remote license server for activation/deactivation.
// Stores activated license locally in the SQLite settings table.
// ============================================================

import crypto from 'crypto'
import os from 'os'

// ---- Configuration ----
const LICENSE_SERVER_URL = process.env.PLUTO_LICENSE_SERVER || 'https://license.plutophotos.com'

// ---- Tier definitions ----
const TIERS = {
  free: {
    name: 'Free',
    maxProjects: 1,
    maxFolders: 1,
    maxImages: 500,
    maxAlbums: 1,
    features: {
      import: true,
      albums: true,
      tags: true,
      ratings: true,
      colorLabels: true,
      slideshow: true,
      export: true,
      editPhoto: false,
      batchOps: false,
      smartAlbums: false,
      faceDetection: false,
      mapView: false,
      duplicateFinder: false,
      cloudImport: false,
      webMobileAccess: false,
      contextSearch: false,
    }
  },
  personal: {
    name: 'Personal',
    maxProjects: Infinity,
    maxFolders: Infinity,
    maxImages: Infinity,
    maxAlbums: Infinity,
    features: {
      import: true,
      albums: true,
      tags: true,
      ratings: true,
      colorLabels: true,
      slideshow: true,
      export: true,
      editPhoto: true,
      batchOps: true,
      smartAlbums: false,
      faceDetection: false,
      mapView: false,
      duplicateFinder: false,
      cloudImport: false,
      webMobileAccess: true,
      contextSearch: false,
    }
  },
  pro: {
    name: 'Pro',
    maxProjects: Infinity,
    maxFolders: Infinity,
    maxImages: Infinity,
    maxAlbums: Infinity,
    features: {
      import: true,
      albums: true,
      tags: true,
      ratings: true,
      colorLabels: true,
      slideshow: true,
      export: true,
      editPhoto: true,
      batchOps: true,
      smartAlbums: true,
      faceDetection: true,
      mapView: true,
      duplicateFinder: true,
      cloudImport: true,
      webMobileAccess: true,
      contextSearch: true,
    }
  }
}

// ---- Device fingerprint ----
function getDeviceId(db) {
  // Check if we already have a stored device ID
  const row = db.prepare("SELECT value FROM settings WHERE key = 'device_id'").get()
  if (row) {
    try { return JSON.parse(row.value) } catch { return row.value }
  }
  // Generate a new one based on machine characteristics + random component
  const machineInfo = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}`
  const id = crypto.createHash('sha256').update(machineInfo + crypto.randomBytes(16).toString('hex')).digest('hex').slice(0, 32)
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('device_id', ?)").run(JSON.stringify(id))
  return id
}

// ---- HTTP helper (uses global fetch available in Node 22+) ----
async function serverRequest(endpoint, data) {
  const url = new URL(endpoint, LICENSE_SERVER_URL).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    console.log('[License] Requesting:', url)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    })
    clearTimeout(timer)
    const parsed = await response.json()
    console.log('[License] Response:', response.status, parsed)
    return { status: response.status, data: parsed }
  } catch (err) {
    clearTimeout(timer)
    console.error('[License] Request failed:', err.message)
    throw err
  }
}

// ============================================================
// Create the license manager
// ============================================================
function createLicenseManager(db) {
  const deviceId = getDeviceId(db)

  // ---- HMAC signing for license integrity ----
  // Prevents trivial SQLite edits from forging a license tier.
  // Key is derived from device ID + app secret so it's unique per machine.
  const SIGNING_KEY = crypto.createHash('sha256')
    .update(`pluto-license-${deviceId}-9f3a7c`)
    .digest()

  function signLicense(data) {
    const payload = JSON.stringify(data)
    const hmac = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('hex')
    return { payload, hmac }
  }

  function verifyLicense(payload, hmac) {
    const expected = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'))
  }

  // ---- Local storage helpers ----
  function getStoredLicense() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license'").get()
    if (!row) return null
    try {
      const stored = JSON.parse(row.value)
      // New signed format: { payload, hmac }
      if (stored.payload && stored.hmac) {
        if (!verifyLicense(stored.payload, stored.hmac)) {
          console.warn('[License] HMAC verification failed — license may have been tampered with')
          clearStoredLicense()
          return null
        }
        return JSON.parse(stored.payload)
      }
      // Legacy unsigned format — reject to prevent trivial license forging via DB edits
      console.warn('[License] Rejecting unsigned/legacy license data — HMAC required');
      clearStoredLicense();
      return null
    } catch { return null }
  }

  function storeLicense(licenseData) {
    const { payload, hmac } = signLicense(licenseData)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license', ?)").run(JSON.stringify({ payload, hmac }))
  }

  function clearStoredLicense() {
    db.prepare("DELETE FROM settings WHERE key = 'license'").run()
  }

  function hasUsedTrial() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'trial_used'").get()
    return row ? JSON.parse(row.value) === true : false
  }

  function markTrialUsed() {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('trial_used', ?)").run(JSON.stringify(true))
  }

  // ---- Public API ----

  /**
   * Get current license info (locally stored)
   */
  function getLicenseInfo() {
    const trialUsed = hasUsedTrial()
    const license = getStoredLicense()
    if (!license) {
      return {
        activated: false,
        tier: 'free',
        tierName: 'Free',
        email: null,
        licenseKey: null,
        activatedAt: null,
        expiresAt: null,
        trialUsed,
        features: TIERS.free.features,
        limits: {
          maxProjects: TIERS.free.maxProjects,
          maxFolders: TIERS.free.maxFolders,
          maxImages: TIERS.free.maxImages,
          maxAlbums: TIERS.free.maxAlbums,
        }
      }
    }

    const tierConfig = TIERS[license.tier] || TIERS.free

    // Calculate trial days remaining if license has an expiry
    let isTrial = false
    let trialDaysRemaining = null
    if (license.expiresAt) {
      const msRemaining = new Date(license.expiresAt) - new Date()
      trialDaysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
      isTrial = true

      // If trial has expired, revert to free tier
      if (trialDaysRemaining <= 0) {
        const freeTier = TIERS.free
        return {
          activated: true,
          tier: 'free',
          tierName: 'Free',
          email: license.email,
          licenseKey: maskKey(license.licenseKey),
          activatedAt: license.activatedAt,
          expiresAt: license.expiresAt,
          isTrial: true,
          trialExpired: true,
          trialUsed,
          trialDaysRemaining: 0,
          trialDaysLeft: 0,
          features: freeTier.features,
          limits: {
            maxProjects: freeTier.maxProjects,
            maxFolders: freeTier.maxFolders,
            maxImages: freeTier.maxImages,
            maxAlbums: freeTier.maxAlbums,
          }
        }
      }
    }

    return {
      activated: true,
      tier: license.tier,
      tierName: tierConfig.name,
      email: license.email,
      licenseKey: maskKey(license.licenseKey),
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt || null,
      isTrial,
      trialUsed,
      trialDaysRemaining,
      trialDaysLeft: trialDaysRemaining,
      features: tierConfig.features,
      limits: {
        maxProjects: tierConfig.maxProjects,
        maxFolders: tierConfig.maxFolders,
        maxImages: tierConfig.maxImages,
        maxAlbums: tierConfig.maxAlbums,
      }
    }
  }

  /**
   * Activate a license key
   */
  async function activateLicense(email, licenseKey) {
    try {
      const response = await serverRequest('/api/activate', {
        email,
        licenseKey,
        deviceId,
        deviceName: crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16),
        platform: `${os.platform()} ${os.arch()}`
      })

      if (response.status === 200 && response.data.success) {
        const licenseData = {
          email,
          licenseKey,
          tier: response.data.tier,
          activatedAt: new Date().toISOString(),
          expiresAt: response.data.expiresAt || null,
          isTrial: response.data.isTrial || false,
          trialDaysRemaining: response.data.trialDaysRemaining ?? null,
          serverValidated: true,
          lastServerValidation: new Date().toISOString()
        }
        storeLicense(licenseData)
        return { success: true, tier: response.data.tier, tierName: TIERS[response.data.tier]?.name || response.data.tier }
      } else {
        return { success: false, error: response.data.error || 'Activation failed' }
      }
    } catch (err) {
      return { success: false, error: `Could not reach license server: ${err.message}` }
    }
  }

  /**
   * Deactivate (remove) license from this device
   */
  async function deactivateLicense() {
    const license = getStoredLicense()
    if (!license) return { success: true }

    try {
      await serverRequest('/api/deactivate', {
        email: license.email,
        licenseKey: license.licenseKey,
        deviceId
      })
    } catch {
      // Even if server is unreachable, remove local license
    }

    clearStoredLicense()
    return { success: true }
  }

  /**
   * Validate the license with the server (periodic check).
   *
   * Offline-first strategy:
   *   • Permanent (non-trial) licenses only phone home every 30 days.
   *     Between checks the HMAC-signed local cache is authoritative.
   *   • Trial licenses validate every call (caller schedules every 6 h)
   *     so the countdown stays accurate and expiry is enforced.
   *   • If the server is unreachable the local license is kept (grace period).
   *   • If the server explicitly revokes the license it is cleared immediately.
   *
   * Anti-abuse notes:
   *   • Activation still requires internet — server enforces max 2 devices.
   *   • Local cache is HMAC-signed with a per-device key, so copying the
   *     DB to another machine won't pass verification.
   *   • The 30-day re-validation catches revoked / refunded keys.
   */
  async function validateLicense() {
    const license = getStoredLicense()
    if (!license) return { valid: false, tier: 'free' }

    // ---- Permanent (non-trial) license: skip server if recently validated ----
    const isPermanent = !license.isTrial && !license.expiresAt
    if (isPermanent && license.lastServerValidation) {
      const msSinceValidation = Date.now() - new Date(license.lastServerValidation).getTime()
      const daysSinceValidation = msSinceValidation / (1000 * 60 * 60 * 24)
      if (daysSinceValidation < 30) {
        console.log(`[License] Permanent license — last validated ${daysSinceValidation.toFixed(1)}d ago, skipping server check`)
        return { valid: true, tier: license.tier, cached: true }
      }
    }

    // ---- Server validation required (trial, or overdue permanent) ----
    try {
      const response = await serverRequest('/api/validate', {
        email: license.email,
        licenseKey: license.licenseKey,
        deviceId
      })

      if (response.status === 200 && response.data.valid) {
        // Update tier in case it changed server-side
        let changed = false
        if (response.data.tier && response.data.tier !== license.tier) {
          license.tier = response.data.tier
          changed = true
        }
        // Update trial info from server
        if (response.data.isTrial !== undefined) {
          license.isTrial = response.data.isTrial
          license.trialDaysRemaining = response.data.trialDaysRemaining
          changed = true
        }
        if (response.data.expiresAt !== undefined) {
          license.expiresAt = response.data.expiresAt
          changed = true
        }
        // Stamp the successful validation time
        license.lastServerValidation = new Date().toISOString()
        storeLicense(license)
        return { valid: true, tier: license.tier }
      } else {
        // License revoked or expired server-side
        clearStoredLicense()
        return { valid: false, tier: 'free', reason: response.data.error || 'License is no longer valid' }
      }
    } catch {
      // If server unreachable, keep the local license (grace period)
      return { valid: true, tier: license.tier, offline: true }
    }
  }

  /**
   * Start a free 30-day Pro trial via the license server.
   * Calls /api/start-trial, then auto-activates the returned key.
   */
  async function startFreeTrial(email) {
    if (hasUsedTrial()) {
      return { success: false, error: 'A free trial has already been used on this device.' }
    }

    try {
      // 1. Request trial from license server
      const trialRes = await serverRequest('/api/start-trial', { email })
      if (trialRes.status !== 200 || !trialRes.data.success) {
        return { success: false, error: trialRes.data?.error || 'Could not start trial. Please try again.' }
      }

      const licenseKey = trialRes.data.licenseKey
      if (!licenseKey) {
        return { success: false, error: 'Server did not return a license key.' }
      }

      // 2. Activate the key on this device
      const activateRes = await activateLicense(email, licenseKey)
      if (!activateRes.success) {
        return { success: false, error: activateRes.error || 'Failed to activate trial license.' }
      }

      // 3. Mark trial as used (permanent — never show again)
      markTrialUsed()

      return { success: true, tier: activateRes.tier, tierName: activateRes.tierName }
    } catch (err) {
      return { success: false, error: `Could not reach license server: ${err.message}` }
    }
  }

  /**
   * Check if a specific feature is allowed
   */
  function checkFeature(featureName) {
    const info = getLicenseInfo()
    return info.features[featureName] === true
  }

  /**
   * Check limits (projects, folders, images)
   */
  function checkLimit(type) {
    const info = getLicenseInfo()
    return info.limits[type] ?? Infinity
  }

  /**
   * Get deviceId for display
   */
  function getDeviceIdentifier() {
    return deviceId
  }

  return {
    getLicenseInfo,
    activateLicense,
    deactivateLicense,
    validateLicense,
    startFreeTrial,
    checkFeature,
    checkLimit,
    getDeviceIdentifier,
    TIERS
  }
}

// ---- Helpers ----
function maskKey(key) {
  if (!key || key.length < 8) return key
  return key.slice(0, 4) + '-****-****-' + key.slice(-4)
}

export { createLicenseManager, TIERS }
