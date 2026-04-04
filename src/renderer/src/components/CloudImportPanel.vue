<template>
  <Teleport to="body">
    <div class="import-overlay" @click.self="$emit('close')">
      <div class="import-panel">
        <div class="panel-header">
          <h2>Import Photos</h2>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>

        <div class="panel-body">
          <!-- Tab Selector -->
          <div class="tab-bar">
            <button class="tab" :class="{ active: activeTab === 'takeout' }" @click="activeTab = 'takeout'">
              📦 Google Takeout
            </button>
            <button class="tab" :class="{ active: activeTab === 'icloud' }" @click="activeTab = 'icloud'">
              ☁️ iCloud Export
            </button>
            <button class="tab" :class="{ active: activeTab === 'immich' }" @click="activeTab = 'immich'">
              🖥️ Immich Server
            </button>
          </div>

          <!-- Google Takeout -->
          <div v-if="activeTab === 'takeout'" class="tab-content">
            <div class="info-box">
              <p>Import photos from a Google Takeout export folder. The importer will:</p>
              <ul>
                <li>Recursively scan for images and videos</li>
                <li>Parse JSON sidecar files for metadata (dates, descriptions)</li>
                <li>Import everything into your Pluto Photos library</li>
              </ul>
            </div>

            <div class="field">
              <label>Takeout Folder</label>
              <div class="path-row">
                <input v-model="takeoutPath" class="modern-input" placeholder="Select your Takeout folder..." readonly />
                <button class="action-btn" @click="browseTakeoutFolder">Browse</button>
              </div>
            </div>

            <div v-if="takeoutImporting" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: takeoutProgress + '%' }"></div>
              </div>
              <span class="progress-label">{{ takeoutStatus }}</span>
            </div>

            <button 
              class="action-btn primary full" 
              @click="importTakeout" 
              :disabled="!takeoutPath || takeoutImporting"
            >
              {{ takeoutImporting ? 'Importing...' : 'Import Google Takeout' }}
            </button>

            <div v-if="takeoutResult" class="result-box" :class="takeoutResult.success ? 'success' : 'error'">
              <template v-if="takeoutResult.success">
                ✅ Imported {{ takeoutResult.imported }} photos from Takeout
              </template>
              <template v-else>
                ❌ {{ takeoutResult.error }}
              </template>
            </div>
          </div>

          <!-- iCloud Export -->
          <div v-if="activeTab === 'icloud'" class="tab-content">
            <div class="info-box">
              <p>Import photos from an iCloud Photos export. Supports:</p>
              <ul>
                <li>Folders exported from iCloud.com ("Download" option)</li>
                <li>Photos app exports (File → Export → Export Originals)</li>
                <li>iCloud Drive photo folders</li>
                <li>Reads EXIF metadata for dates, GPS, and camera info</li>
              </ul>
            </div>

            <div class="field">
              <label>iCloud Export Folder</label>
              <div class="path-row">
                <input v-model="icloudPath" class="modern-input" placeholder="Select your iCloud export folder..." readonly />
                <button class="action-btn" @click="browseIcloudFolder">Browse</button>
              </div>
            </div>

            <div v-if="icloudImporting" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: icloudProgress + '%' }"></div>
              </div>
              <span class="progress-label">{{ icloudStatus }}</span>
            </div>

            <button 
              class="action-btn primary full" 
              @click="importIcloud" 
              :disabled="!icloudPath || icloudImporting"
            >
              {{ icloudImporting ? 'Importing...' : 'Import iCloud Export' }}
            </button>

            <div v-if="icloudResult" class="result-box" :class="icloudResult.success ? 'success' : 'error'">
              <template v-if="icloudResult.success">
                ✅ Imported {{ icloudResult.imported }} photos from iCloud
              </template>
              <template v-else>
                ❌ {{ icloudResult.error }}
              </template>
            </div>
          </div>

          <!-- Immich Server -->
          <div v-if="activeTab === 'immich'" class="tab-content">
            <div class="info-box">
              <p>Import photos directly from an Immich server. You'll need:</p>
              <ul>
                <li>Your Immich server URL (e.g. http://192.168.1.100:2283)</li>
                <li>An API key (generated in Immich → User Settings → API Keys)</li>
                <li>All original files will be downloaded to a local folder</li>
              </ul>
            </div>

            <div class="field">
              <label>Immich Server URL</label>
              <input v-model="immichUrl" class="modern-input" placeholder="http://192.168.1.100:2283" />
            </div>

            <div class="field">
              <label>API Key</label>
              <input v-model="immichApiKey" class="modern-input" type="password" placeholder="Your Immich API key" />
            </div>

            <div v-if="immichImporting" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: immichProgress + '%' }"></div>
              </div>
              <span class="progress-label">{{ immichStatus }}</span>
            </div>

            <button 
              class="action-btn primary full" 
              @click="importImmich" 
              :disabled="!immichUrl || !immichApiKey || immichImporting"
            >
              {{ immichImporting ? 'Importing...' : 'Import from Immich' }}
            </button>

            <div v-if="immichResult" class="result-box" :class="immichResult.success ? 'success' : 'error'">
              <template v-if="immichResult.success">
                ✅ Downloaded {{ immichResult.downloaded }} of {{ immichResult.total }} photos from Immich
              </template>
              <template v-else>
                ❌ {{ immichResult.error }}
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'imported'])

// Google Takeout
const takeoutPath = ref('')
const takeoutImporting = ref(false)
const takeoutProgress = ref(0)
const takeoutStatus = ref('')
const takeoutResult = ref(null)

// iCloud Export
const activeTab = ref('takeout')
const icloudPath = ref('')
const icloudImporting = ref(false)
const icloudProgress = ref(0)
const icloudStatus = ref('')
const icloudResult = ref(null)

// Immich Server
const immichUrl = ref('')
const immichApiKey = ref('')
const immichImporting = ref(false)
const immichProgress = ref(0)
const immichStatus = ref('')
const immichResult = ref(null)

const browseTakeoutFolder = async () => {
  try {
    const result = await window.electron.ipcRenderer.invoke('import-folder')
    if (result && result.path) {
      takeoutPath.value = result.path
    }
  } catch {}
}

const importTakeout = async () => {
  takeoutImporting.value = true
  takeoutResult.value = null
  takeoutProgress.value = 0
  takeoutStatus.value = 'Starting import...'

  // Listen for progress events from the backend
  const onProgress = (evt) => {
    if (evt.data?.__electronIpc === 'import-progress') {
      const d = evt.data.payload
      if (d && typeof d.current === 'number') {
        takeoutProgress.value = d.total ? Math.round((d.current / d.total) * 100) : 0
        takeoutStatus.value = d.message || `${d.current} / ${d.total}`
      }
    }
  }
  window.addEventListener('message', onProgress)

  try {
    const result = await window.electron.ipcRenderer.invoke('import-google-takeout', {
      takeoutPath: takeoutPath.value
    })
    takeoutResult.value = result
    takeoutProgress.value = 100
    if (result.success) emit('imported')
  } catch (err) {
    takeoutResult.value = { success: false, error: err.message }
  } finally {
    window.removeEventListener('message', onProgress)
    takeoutImporting.value = false
  }
}

const browseIcloudFolder = async () => {
  try {
    const result = await window.electron.ipcRenderer.invoke('import-folder')
    if (result && result.path) {
      icloudPath.value = result.path
    }
  } catch {}
}

const importIcloud = async () => {
  icloudImporting.value = true
  icloudResult.value = null
  icloudProgress.value = 0
  icloudStatus.value = 'Starting iCloud import...'

  // Listen for progress events
  const onProgress = (evt) => {
    if (evt.data?.__electronIpc === 'import-progress') {
      const d = evt.data.payload
      if (d && typeof d.current === 'number') {
        icloudProgress.value = d.total ? Math.round((d.current / d.total) * 100) : 0
        icloudStatus.value = d.message || `${d.current} / ${d.total}`
      }
    }
  }
  window.addEventListener('message', onProgress)

  try {
    const result = await window.electron.ipcRenderer.invoke('import-icloud', {
      icloudPath: icloudPath.value
    })
    icloudResult.value = result
    icloudProgress.value = 100
    if (result.success) emit('imported')
  } catch (err) {
    icloudResult.value = { success: false, error: err.message }
  } finally {
    window.removeEventListener('message', onProgress)
    icloudImporting.value = false
  }
}

const importImmich = async () => {
  immichImporting.value = true
  immichResult.value = null
  immichProgress.value = 0
  immichStatus.value = 'Connecting to Immich server...'

  const onProgress = (evt) => {
    if (evt.data?.__electronIpc === 'import-progress') {
      const d = evt.data.payload
      if (d && typeof d.current === 'number') {
        immichProgress.value = d.total ? Math.round((d.current / d.total) * 100) : 0
        immichStatus.value = d.message || `${d.current} / ${d.total}`
      }
    }
  }
  window.addEventListener('message', onProgress)

  try {
    const result = await window.electron.ipcRenderer.invoke('import-from-immich', {
      serverUrl: immichUrl.value.replace(/\/+$/, ''),
      apiKey: immichApiKey.value
    })
    immichResult.value = result
    immichProgress.value = 100
    if (result.success) emit('imported')
  } catch (err) {
    immichResult.value = { success: false, error: err.message }
  } finally {
    window.removeEventListener('message', onProgress)
    immichImporting.value = false
  }
}

</script>

<style scoped>
.import-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.import-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 540px; max-height: 85vh; overflow-y: auto; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.panel-body { padding: 20px 24px; }
.tab-content { display: flex; flex-direction: column; gap: 16px; }
.tab-bar { display: flex; gap: 4px; background: #111; border-radius: 10px; padding: 3px; margin-bottom: 20px; }
.tab { flex: 1; padding: 10px; border: none; border-radius: 8px; background: transparent; color: #86868b; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.tab.active { background: #2a2a2c; color: #f5f5f7; }
.tab:hover { color: #f5f5f7; }
.info-box { background: rgba(0,113,227,0.06); border: 1px solid rgba(0,113,227,0.15); border-radius: 10px; padding: 14px 16px; }
.info-box p { font-size: 13px; color: #aaa; margin: 0 0 8px; }
.info-box ul { margin: 0; padding-left: 18px; font-size: 12px; color: #86868b; }
.info-box li { margin-bottom: 4px; }
.field label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; display: block; margin-bottom: 6px; }
.modern-input { width: 100%; background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 10px 12px; color: #f5f5f7; font-size: 13px; box-sizing: border-box; transition: border-color 0.2s ease; }
.modern-input:focus { border-color: #0071e3; outline: none; }
.path-row { display: flex; gap: 8px; }
.path-row .modern-input { flex: 1; }
.progress-section { display: flex; align-items: center; gap: 10px; }
.progress-bar { flex: 1; height: 6px; background: #222; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: #0071e3; transition: width 0.3s; border-radius: 3px; }
.progress-label { font-size: 11px; color: #86868b; white-space: nowrap; }
.result-box { padding: 12px 14px; border-radius: 8px; font-size: 13px; }
.result-box.success { background: rgba(48,209,88,0.08); border: 1px solid rgba(48,209,88,0.2); color: #30d158; }
.result-box.error { background: rgba(255,69,58,0.08); border: 1px solid rgba(255,69,58,0.2); color: #ff453a; }
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 10px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; }
.action-btn:hover { background: #333; }
.action-btn.primary { background: #0071e3; border-color: #0071e3; }
.action-btn.full { width: 100%; text-align: center; }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
