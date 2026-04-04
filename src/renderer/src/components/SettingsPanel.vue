<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="$emit('close')">
      <div class="settings-panel">
        <div class="settings-header">
          <h1>{{ t('settingsTitle') }}</h1>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>

        <div class="settings-body">
          <!-- Appearance -->
          <section class="settings-section">
            <h2 class="section-title">{{ t('appearance') }}</h2>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('theme') }}</label>
                <p class="setting-desc">{{ t('themeDesc') }}</p>
              </div>
              <div class="setting-control">
                <div class="theme-toggle">
                  <button 
                    class="theme-btn" 
                    :class="{ active: localSettings.theme === 'dark' }"
                    @click="update('theme', 'dark')"
                  >
                    <span class="theme-icon">🌙</span>
                    <span>{{ t('dark') }}</span>
                  </button>
                  <button 
                    class="theme-btn" 
                    :class="{ active: localSettings.theme === 'light' }"
                    @click="update('theme', 'light')"
                  >
                    <span class="theme-icon">☀️</span>
                    <span>{{ t('light') }}</span>
                  </button>
                  <button 
                    class="theme-btn" 
                    :class="{ active: localSettings.theme === 'futuristic' }"
                    @click="update('theme', 'futuristic')"
                  >
                    <span class="theme-icon">🔮</span>
                    <span>Cyber</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('defaultThumbnailSize') }}</label>
                <p class="setting-desc">{{ t('defaultThumbnailSizeDesc') }} ({{ localSettings.thumbnailSize }}px)</p>
              </div>
              <div class="setting-control">
                <input 
                  type="range" 
                  min="120" max="400" step="10"
                  :value="localSettings.thumbnailSize"
                  class="modern-slider"
                  @input="update('thumbnailSize', parseInt($event.target.value))"
                />
              </div>
            </div>
          </section>

          <!-- Behavior -->
          <section class="settings-section">
            <h2 class="section-title">{{ t('behavior') }}</h2>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('startupView') }}</label>
                <p class="setting-desc">{{ t('startupViewDesc') }}</p>
              </div>
              <div class="setting-control">
                <select 
                  class="modern-select" 
                  :value="localSettings.startupView"
                  @change="update('startupView', $event.target.value)"
                >
                  <option value="library">{{ t('globalLibraryOption') }}</option>
                  <option value="last-view">{{ t('lastViewedOption') }}</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('autoUpdate') }}</label>
                <p class="setting-desc">{{ t('autoUpdateDesc') }}</p>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input 
                    type="checkbox" 
                    :checked="localSettings.autoUpdate"
                    @change="update('autoUpdate', $event.target.checked)"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('language') }}</label>
                <p class="setting-desc">{{ t('languageDesc') }}</p>
              </div>
              <div class="setting-control">
                <select 
                  class="modern-select" 
                  :value="localSettings.language"
                  @change="update('language', $event.target.value)"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>
          </section>

          <!-- Cache & Storage -->
          <section class="settings-section">
            <h2 class="section-title">{{ t('cacheStorage') }}</h2>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('thumbnailCache') }}</label>
                <p class="setting-desc" v-if="cacheInfo">
                  {{ cacheInfo.fileCount }} files — {{ cacheInfo.totalSizeMB }} MB
                </p>
                <p class="setting-desc" v-else>Loading...</p>
              </div>
              <div class="setting-control">
                <button class="btn-secondary" @click="clearCache" :disabled="clearingCache">
                  {{ clearingCache ? t('clearing') : t('clearCache') }}
                </button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('cacheLocation') }}</label>
                <p class="setting-desc mono">{{ cacheInfo?.path || '...' }}</p>
              </div>
            </div>
          </section>

          <!-- Keyboard Shortcuts -->
          <section class="settings-section">
            <h2 class="section-title">{{ t('keyboardShortcuts') }}</h2>
            <div class="shortcuts-table">
              <div class="shortcut-row" v-for="shortcut in shortcuts" :key="shortcut.keys">
                <div class="shortcut-keys">
                  <kbd v-for="key in shortcut.keys.split('+')" :key="key">{{ key.trim() }}</kbd>
                </div>
                <span class="shortcut-action">{{ shortcut.action }}</span>
              </div>
            </div>
          </section>

          <!-- About -->
          <section class="settings-section">
            <h2 class="section-title">{{ t('about') }}</h2>
            <div class="about-info">
              <div class="about-row">
                <span class="about-label">{{ t('version') }}</span>
                <span class="about-value">{{ appVersion || '...' }}</span>
              </div>
              <div class="about-row">
                <span class="about-label">Electron</span>
                <span class="about-value">{{ electronVersion }}</span>
              </div>
              <div class="about-row">
                <span class="about-label">{{ t('platform') }}</span>
                <span class="about-value">{{ platform }}</span>
              </div>
            </div>
            <button class="btn-secondary" style="margin-top: 12px;" @click="checkForUpdates" :disabled="checkingUpdate">
              {{ checkingUpdate ? t('checking') : t('checkForUpdates') }}
            </button>
            <p v-if="updateMessage" class="update-msg" :class="updateMessage.type">
              {{ updateMessage.text }}
            </p>
          </section>

          <section v-if="isMacPlatform" class="settings-section">
            <h2 class="section-title">macOS Folder Access</h2>
            <div class="about-info diagnostics-summary-card">
              <div class="about-row">
                <span class="about-label">Security-Scoped Bookmarks</span>
                <span class="about-value">{{ macDiagnostics?.isMasBuild ? 'Enabled (MAS)' : 'Unavailable in non-MAS build' }}</span>
              </div>
              <div class="about-row">
                <span class="about-label">Tracked Folders</span>
                <span class="about-value">{{ macDiagnostics?.summary?.total ?? 0 }}</span>
              </div>
              <div class="about-row">
                <span class="about-label">Warnings / Errors</span>
                <span class="about-value">{{ (macDiagnostics?.summary?.warning ?? 0) + (macDiagnostics?.summary?.error ?? 0) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <label>Diagnostics</label>
                <p class="setting-desc">Use this when a Mac customer reports broken thumbnails, failed syncs, or folders that stop loading after relaunch.</p>
              </div>
              <div class="setting-control diagnostics-actions-row">
                <button class="btn-secondary" @click="loadMacFolderDiagnostics" :disabled="loadingMacDiagnostics">
                  {{ loadingMacDiagnostics ? 'Refreshing...' : 'Refresh' }}
                </button>
                <button class="btn-secondary" @click="copyMacDiagnostics" :disabled="!macDiagnostics?.folders?.length">
                  Copy Report
                </button>
              </div>
            </div>

            <div v-if="macDiagnostics?.folders?.length" class="mac-diagnostics-list">
              <div v-for="folder in macDiagnostics.folders" :key="folder.id" class="mac-diagnostic-card" :class="folder.severity">
                <div class="mac-diagnostic-topline">
                  <div>
                    <strong>{{ folder.path.split(/[\\/]/).pop() || folder.path }}</strong>
                    <p class="setting-desc mono">{{ folder.path }}</p>
                  </div>
                  <span class="diagnostic-badge" :class="folder.severity">{{ folder.severity }}</span>
                </div>
                <div class="mac-diagnostic-grid">
                  <span>Readable: {{ folder.readable ? 'Yes' : 'No' }}</span>
                  <span>Exists: {{ folder.exists ? 'Yes' : 'No' }}</span>
                  <span>Bookmark Stored: {{ folder.bookmarkStored ? 'Yes' : 'No' }}</span>
                  <span>Bookmark Active: {{ folder.bookmarkActive ? 'Yes' : 'No' }}</span>
                </div>
                <p class="diagnostic-guidance">{{ folder.guidance }}</p>
                <p v-if="folder.lastIssue" class="diagnostic-last-issue">
                  Last issue: {{ folder.lastIssue.operation }}{{ folder.lastIssue.code ? ` (${folder.lastIssue.code})` : '' }} — {{ folder.lastIssue.message }}
                </p>
              </div>
            </div>

            <p v-else class="setting-desc">No macOS folder access issues detected.</p>
          </section>

          <!-- License Management -->
          <section class="settings-section license-section">
            <h2 class="section-title">License</h2>

            <!-- Current License Status -->
            <div class="license-status-card" :class="'tier-' + licenseInfo.tier">
              <div class="license-tier-badge">{{ licenseInfo.tierName || 'Free' }}</div>

              <!-- Trial Banner -->
              <div class="trial-banner" v-if="licenseInfo.isTrial && !licenseInfo.trialExpired">
                <div class="trial-banner-icon">⏱️</div>
                <div class="trial-banner-info">
                  <span class="trial-banner-label">Pro Trial</span>
                  <span class="trial-banner-days" :class="{ 'trial-urgent': licenseInfo.trialDaysRemaining <= 5 }">
                    {{ licenseInfo.trialDaysRemaining }} day{{ licenseInfo.trialDaysRemaining === 1 ? '' : 's' }} remaining
                  </span>
                </div>
                <div class="trial-banner-bar">
                  <div class="trial-banner-bar-fill" :style="{ width: Math.max(3, (licenseInfo.trialDaysRemaining / 30) * 100) + '%' }"></div>
                </div>
              </div>

              <!-- Trial Expired Banner -->
              <div class="trial-expired-banner" v-if="licenseInfo.trialExpired">
                <div class="trial-expired-icon">⚠️</div>
                <div class="trial-expired-info">
                  <span class="trial-expired-label">Trial Expired</span>
                  <span class="trial-expired-text">Your Pro trial has ended. Purchase a license to keep all features.</span>
                </div>
              </div>

              <div class="license-status-details" v-if="licenseInfo.activated">
                <div class="license-detail-row">
                  <span class="license-label">Email</span>
                  <span class="license-value">{{ licenseInfo.email }}</span>
                </div>
                <div class="license-detail-row">
                  <span class="license-label">Key</span>
                  <span class="license-value mono">{{ licenseInfo.licenseKey }}</span>
                </div>
                <div class="license-detail-row" v-if="licenseInfo.expiresAt">
                  <span class="license-label">Expires</span>
                  <span class="license-value">{{ new Date(licenseInfo.expiresAt).toLocaleDateString() }}</span>
                </div>
              </div>
              <p class="license-free-note" v-else>
                Activate a license key to unlock more features.
              </p>
            </div>

            <!-- Feature Overview -->
            <div class="license-features-grid">
              <div class="license-feature-item" v-for="feat in featureDisplayList" :key="feat.key"
                   :class="{ 'feat-locked': !feat.unlocked }">
                <span class="feat-icon">{{ feat.unlocked ? '✓' : '🔒' }}</span>
                <span class="feat-name">{{ feat.name }}</span>
              </div>
            </div>

            <!-- Limits -->
            <div class="license-limits" v-if="licenseInfo.tier === 'free'">
              <div class="limit-item">
                <span class="limit-label">Projects</span>
                <span class="limit-value">{{ licenseInfo.limits?.maxProjects ?? 1 }}</span>
              </div>
              <div class="limit-item">
                <span class="limit-label">Folders</span>
                <span class="limit-value">{{ licenseInfo.limits?.maxFolders ?? 1 }}</span>
              </div>
              <div class="limit-item">
                <span class="limit-label">Images</span>
                <span class="limit-value">{{ licenseInfo.limits?.maxImages ?? 500 }}</span>
              </div>
            </div>

            <!-- Activation Form -->
            <div class="license-activate-form" v-if="!licenseInfo.activated">
              <div class="license-input-group">
                <label>Email Address</label>
                <input type="email" v-model="licenseEmail" placeholder="you@example.com" class="license-input" />
              </div>
              <div class="license-input-group">
                <label>License Key</label>
                <input type="text" v-model="licenseKey" placeholder="PLUTO-XXXX-XXXX-XXXX" class="license-input" />
              </div>
              <button class="btn-license-activate" @click="activateLicense" :disabled="activatingLicense || !licenseEmail || !licenseKey">
                {{ activatingLicense ? 'Activating...' : 'Activate License' }}
              </button>
              <p v-if="licenseError" class="license-error">{{ licenseError }}</p>
            </div>

            <!-- Deactivate -->
            <div class="license-deactivate" v-if="licenseInfo.activated">
              <button class="btn-danger-sm" @click="deactivateLicense" :disabled="deactivatingLicense">
                {{ deactivatingLicense ? 'Deactivating...' : 'Deactivate License' }}
              </button>
              <p class="license-deactivate-note">This will free up a device slot for use on another computer.</p>
            </div>
          </section>

          <!-- Reset -->
          <section class="settings-section danger-zone">
            <h2 class="section-title">{{ t('dangerZone') }}</h2>
            <div class="setting-row">
              <div class="setting-info">
                <label>{{ t('resetOnboarding') }}</label>
                <p class="setting-desc">{{ t('resetOnboardingDesc') }}</p>
              </div>
              <div class="setting-control">
                <button class="btn-danger-sm" @click="resetOnboarding">{{ t('reset') }}</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from '../useI18n'

const { t } = useI18n()

const emit = defineEmits(['close', 'settings-changed'])

const localSettings = reactive({
  theme: 'cyber',
  thumbnailSize: 200,
  startupView: 'library',
  autoUpdate: true,
  language: 'en'
})

const cacheInfo = ref(null)
const clearingCache = ref(false)
const appVersion = ref('')
const checkingUpdate = ref(false)
const updateMessage = ref(null)
const electronVersion = navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || 'Unknown'
const platform = navigator.platform
const isMacPlatform = ref(window.electron?.platform === 'darwin')
const macDiagnostics = ref(null)
const loadingMacDiagnostics = ref(false)

// --- License state ---
const licenseInfo = ref({
  activated: false,
  tier: 'free',
  tierName: 'Free',
  email: null,
  licenseKey: null,
  features: {},
  limits: { maxProjects: 1, maxFolders: 1, maxImages: 500 }
})
const licenseEmail = ref('')
const licenseKey = ref('')
const licenseError = ref('')
const activatingLicense = ref(false)
const deactivatingLicense = ref(false)

const featureDisplayList = computed(() => {
  const features = licenseInfo.value.features || {}
  const featureNames = {
    editPhoto: 'Photo Editing',
    batchOps: 'Batch Operations',
    smartAlbums: 'Smart Albums',
    faceDetection: 'Face Detection',
    mapView: 'Map View',
    duplicateFinder: 'Duplicate Finder',
    cloudImport: 'Cloud Import',
    webMobileAccess: 'Web / Mobile Access',
    slideshow: 'Slideshow',
    export: 'Export'
  }
  return Object.entries(featureNames).map(([key, name]) => ({
    key,
    name,
    unlocked: features[key] === true
  }))
})

const shortcuts = [
  { keys: 'Double-click', action: 'Open image in lightbox' },
  { keys: '← / →', action: 'Previous / next in lightbox' },
  { keys: 'Esc', action: 'Close lightbox or deselect all' },
  { keys: window.electron?.platform === 'darwin' ? '⌘ Cmd + Click' : 'Ctrl + Click', action: 'Toggle select individual items' },
  { keys: 'Shift + Click', action: 'Select range of items' },
  { keys: 'Right-click', action: 'Context menu (copy, set cover, delete)' },
  { keys: 'Drag → Sidebar', action: 'Add selected images to album' }
]

const update = async (key, value) => {
  localSettings[key] = value
  try {
    await window.electron.ipcRenderer.invoke('set-setting', { key, value })
    emit('settings-changed', { key, value })
  } catch (err) {
    console.error('Failed to save setting:', err)
  }
}

const clearCache = async () => {
  clearingCache.value = true
  try {
    await window.electron.ipcRenderer.invoke('clear-thumbnail-cache')
    cacheInfo.value = await window.electron.ipcRenderer.invoke('get-cache-info')
  } catch {}
  clearingCache.value = false
}

const checkForUpdates = async () => {
  checkingUpdate.value = true
  updateMessage.value = null
  try {
    const result = await window.electron.ipcRenderer.invoke('check-for-updates')
    if (result.offline) {
      updateMessage.value = { type: 'info', text: 'You appear to be offline. Connect to the internet to check for updates.' }
    } else if (result.available) {
      updateMessage.value = { type: 'success', text: `Update available: v${result.version}. It will begin downloading shortly.` }
      // Trigger download automatically when manually checking
      window.electron.ipcRenderer.invoke('download-update').catch(() => {})
    } else if (result.error) {
      updateMessage.value = { type: 'info', text: 'Could not check for updates. You may be on the latest version.' }
    } else {
      updateMessage.value = { type: 'info', text: 'You are on the latest version!' }
    }
  } catch {
    updateMessage.value = { type: 'info', text: 'Could not reach update server.' }
  }
  checkingUpdate.value = false
}

const loadMacFolderDiagnostics = async () => {
  if (!isMacPlatform.value) return
  loadingMacDiagnostics.value = true
  try {
    macDiagnostics.value = await window.electron.ipcRenderer.invoke('get-mac-folder-access-diagnostics')
  } catch (err) {
    console.error('Failed to load mac diagnostics:', err)
  }
  loadingMacDiagnostics.value = false
}

const copyMacDiagnostics = async () => {
  if (!macDiagnostics.value) return
  const payload = JSON.stringify(macDiagnostics.value, null, 2)
  try {
    await navigator.clipboard.writeText(payload)
    updateMessage.value = { type: 'success', text: 'macOS diagnostics copied to clipboard.' }
  } catch (err) {
    updateMessage.value = { type: 'info', text: 'Could not copy diagnostics to clipboard.' }
  }
}

const resetOnboarding = async () => {
  await window.electron.ipcRenderer.invoke('set-setting', { key: 'onboardingComplete', value: false })
  updateMessage.value = { type: 'info', text: 'Onboarding will show on next launch.' }
}

// --- License methods ---
const loadLicenseInfo = async () => {
  try {
    const info = await window.electron.ipcRenderer.invoke('get-license-info')
    if (info) licenseInfo.value = info
  } catch (err) {
    console.error('Failed to load license info:', err)
  }
}

const activateLicense = async () => {
  activatingLicense.value = true
  licenseError.value = ''
  try {
    const result = await window.electron.ipcRenderer.invoke('activate-license', {
      email: licenseEmail.value.trim(),
      licenseKey: licenseKey.value.trim()
    })
    if (result.success) {
      licenseEmail.value = ''
      licenseKey.value = ''
      await loadLicenseInfo()
      emit('settings-changed', { key: 'license', value: licenseInfo.value })
    } else {
      licenseError.value = result.error || 'Activation failed.'
    }
  } catch (err) {
    licenseError.value = 'Could not reach license server.'
  }
  activatingLicense.value = false
}

const deactivateLicense = async () => {
  deactivatingLicense.value = true
  try {
    await window.electron.ipcRenderer.invoke('deactivate-license')
    await loadLicenseInfo()
    emit('settings-changed', { key: 'license', value: licenseInfo.value })
  } catch (err) {
    console.error('Failed to deactivate:', err)
  }
  deactivatingLicense.value = false
}

const loadSettings = async () => {
  try {
    const settings = await window.electron.ipcRenderer.invoke('get-settings')
    if (settings.theme !== undefined) localSettings.theme = settings.theme
    if (settings.thumbnailSize !== undefined) localSettings.thumbnailSize = settings.thumbnailSize
    if (settings.startupView !== undefined) localSettings.startupView = settings.startupView
    if (settings.autoUpdate !== undefined) localSettings.autoUpdate = settings.autoUpdate
    if (settings.language !== undefined) localSettings.language = settings.language
  } catch {}
}

onMounted(async () => {
  await loadSettings()
  await loadLicenseInfo()
  try { cacheInfo.value = await window.electron.ipcRenderer.invoke('get-cache-info') } catch {}
  try { appVersion.value = await window.electron.ipcRenderer.invoke('get-app-version') } catch {}
  await loadMacFolderDiagnostics()
})
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 50000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.settings-panel {
  background: #1a1a1c;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  width: 600px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 40px 100px rgba(0,0,0,0.5);
  animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.settings-header h1 {
  font-size: 20px;
  font-weight: 700;
  color: #f5f5f7;
  margin: 0;
}

.btn-close {
  background: rgba(255,255,255,0.06);
  border: none;
  color: #86868b;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-close:hover { background: rgba(255,255,255,0.12); color: #f5f5f7; }

.settings-body {
  overflow-y: auto;
  padding: 8px 28px 28px;
  flex: 1;
}

.settings-section {
  padding: 20px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.settings-section:last-child { border-bottom: none; }

.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #86868b;
  margin: 0 0 16px 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  gap: 16px;
}

.setting-info { flex: 1; min-width: 0; }

.setting-info label {
  font-size: 14px;
  font-weight: 500;
  color: #f5f5f7;
  display: block;
}

.setting-desc {
  font-size: 12px;
  color: #636366;
  margin: 2px 0 0 0;
}

.setting-desc.mono {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  word-break: break-all;
}

.setting-control {
  flex-shrink: 0;
}

/* Theme toggle */
.theme-toggle {
  display: flex;
  gap: 4px;
  background: rgba(255,255,255,0.04);
  border-radius: 10px;
  padding: 3px;
}

.theme-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #86868b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-btn.active {
  background: rgba(255,255,255,0.1);
  color: #f5f5f7;
}

.theme-icon { font-size: 14px; }

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: #39393d;
  border-radius: 12px;
  transition: all 0.25s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 20px;
  height: 20px;
  background: #f5f5f7;
  border-radius: 50%;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #30d158;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* Select & slider */
.modern-select {
  background: #2c2c2e;
  color: #f5f5f7;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  cursor: pointer;
  min-width: 140px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.modern-select:hover { border-color: rgba(255,255,255,0.15); }
.modern-select:focus { border-color: #0071e3; box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.2); outline: none; }

.modern-slider {
  width: 140px;
  height: 4px;
  appearance: none;
  background: #2c2c2e;
  border-radius: 2px;
  accent-color: #0071e3;
}

/* Buttons */
.btn-secondary {
  background: rgba(255,255,255,0.06);
  color: #f5f5f7;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-secondary:hover { background: rgba(255,255,255,0.1); }
.btn-secondary:disabled { opacity: 0.4; cursor: default; }

.btn-danger-sm {
  background: rgba(255, 69, 58, 0.1);
  color: #ff453a;
  border: 1px solid rgba(255, 69, 58, 0.2);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-danger-sm:hover { background: rgba(255, 69, 58, 0.2); }

/* Shortcuts table */
.shortcuts-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
}

.shortcut-keys {
  display: flex;
  gap: 4px;
}

kbd {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 5px;
  padding: 3px 8px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  color: #d1d1d6;
}

.shortcut-action {
  font-size: 13px;
  color: #86868b;
}

/* About */
.about-info {
  background: rgba(255,255,255,0.03);
  border-radius: 10px;
  padding: 12px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.about-label { color: #636366; }
.about-value { color: #f5f5f7; font-weight: 500; font-family: 'SF Mono', 'Consolas', monospace; font-size: 12px; }

.update-msg {
  font-size: 12px;
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 8px;
}

.update-msg.success { background: rgba(48, 209, 88, 0.1); color: #30d158; }
.update-msg.info { background: rgba(0, 113, 227, 0.1); color: #64b5f6; }

.diagnostics-summary-card {
  margin-bottom: 14px;
}

.diagnostics-actions-row {
  display: flex;
  gap: 8px;
}

.mac-diagnostics-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mac-diagnostic-card {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
  background: rgba(255,255,255,0.03);
}

.mac-diagnostic-card.warning {
  border-color: rgba(255, 159, 10, 0.28);
}

.mac-diagnostic-card.error {
  border-color: rgba(255, 69, 58, 0.32);
}

.mac-diagnostic-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mac-diagnostic-topline strong {
  color: #f5f5f7;
  font-size: 14px;
}

.diagnostic-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.diagnostic-badge.healthy { background: rgba(48, 209, 88, 0.12); color: #30d158; }
.diagnostic-badge.warning { background: rgba(255, 159, 10, 0.12); color: #ff9f0a; }
.diagnostic-badge.error { background: rgba(255, 69, 58, 0.12); color: #ff453a; }

.mac-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #d1d1d6;
}

.diagnostic-guidance {
  margin: 10px 0 0;
  font-size: 12px;
  color: #f5f5f7;
}

.diagnostic-last-issue {
  margin: 8px 0 0;
  font-size: 12px;
  color: #ffb4ae;
}

/* Danger zone */
.danger-zone .section-title { color: #ff453a; }

/* License Section */
.license-status-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.license-status-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.license-status-card.tier-free::before { background: linear-gradient(90deg, #636366, #86868b); }
.license-status-card.tier-personal::before { background: linear-gradient(90deg, #0071e3, #64b5f6); }
.license-status-card.tier-pro::before { background: linear-gradient(90deg, #bf5af2, #ff375f); }

.license-tier-badge {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
}

.tier-free .license-tier-badge { background: rgba(99,99,102,0.2); color: #aeaeb2; }
.tier-personal .license-tier-badge { background: rgba(0,113,227,0.15); color: #64b5f6; }
.tier-pro .license-tier-badge { background: rgba(191,90,242,0.15); color: #bf5af2; }

.license-status-details { display: flex; flex-direction: column; gap: 6px; }

.license-detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.license-label { color: #636366; }
.license-value { color: #f5f5f7; font-weight: 500; }

.license-free-note {
  font-size: 13px;
  color: #86868b;
  margin: 0;
}

/* Feature grid */
.license-features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}

.license-feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #f5f5f7;
  background: rgba(255,255,255,0.02);
}

.license-feature-item.feat-locked {
  opacity: 0.45;
}

.feat-icon { font-size: 13px; }
.feat-name { font-size: 12px; }

/* Limits */
.license-limits {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.limit-item {
  flex: 1;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
}

.limit-label { display: block; font-size: 11px; color: #636366; margin-bottom: 4px; }
.limit-value { display: block; font-size: 18px; font-weight: 700; color: #f5f5f7; }

/* Activation form */
.license-activate-form {
  margin-top: 8px;
}

.license-input-group {
  margin-bottom: 10px;
}

.license-input-group label {
  display: block;
  font-size: 12px;
  color: #86868b;
  margin-bottom: 4px;
}

.license-input {
  width: 100%;
  background: #2c2c2e;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 9px 12px;
  color: #f5f5f7;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.license-input:focus {
  border-color: rgba(0,113,227,0.5);
}

.btn-license-activate {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #0071e3, #0077ed);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-license-activate:hover { opacity: 0.9; }
.btn-license-activate:disabled { opacity: 0.4; cursor: default; }

.license-error {
  color: #ff453a;
  font-size: 12px;
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(255,69,58,0.08);
  border-radius: 6px;
}

/* Deactivate */
.license-deactivate {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.license-deactivate-note {
  font-size: 11px;
  color: #636366;
  margin-top: 6px;
}

/* Trial Banner */
.trial-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(191, 90, 242, 0.08);
  border: 1px solid rgba(191, 90, 242, 0.2);
  border-radius: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.trial-banner-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.trial-banner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 120px;
}

.trial-banner-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #bf5af2;
}

.trial-banner-days {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;
}

.trial-banner-days.trial-urgent {
  color: #ff9f0a;
}

.trial-banner-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.trial-banner-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #bf5af2, #ff375f);
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* Trial Expired Banner */
.trial-expired-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 69, 58, 0.08);
  border: 1px solid rgba(255, 69, 58, 0.2);
  border-radius: 10px;
  margin-bottom: 12px;
}

.trial-expired-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.trial-expired-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trial-expired-label {
  font-size: 13px;
  font-weight: 700;
  color: #ff453a;
}

.trial-expired-text {
  font-size: 12px;
  color: #86868b;
  line-height: 1.5;
}

/* Scrollbar */
.settings-body::-webkit-scrollbar { width: 6px; }
.settings-body::-webkit-scrollbar-track { background: transparent; }
.settings-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
</style>
