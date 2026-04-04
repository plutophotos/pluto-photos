<template>
  <Teleport to="body">
    <div class="context-overlay" @click.self="$emit('close')">
      <div class="context-panel">
        <div class="panel-header">
          <h2>
            <Sparkles :size="20" class="header-icon" />
            Contextual Search
          </h2>
          <div class="header-actions">
            <button v-if="scanning" class="action-btn cancel-btn" @click="cancelScan">
              Cancel
            </button>
            <button class="action-btn" @click="startScan" :disabled="scanning || !modelAvailable">
              {{ scanning ? scanProgress : (stats.scanned > 0 ? 'Scan New Photos' : 'Scan Library') }}
            </button>
            <button v-if="stats.scanned > 0 && !scanning" class="action-btn rescan-btn" @click="rescanAll" title="Clear all context data and rescan">
              Rescan All
            </button>
            <button class="btn-close" @click="$emit('close')">✕</button>
          </div>
        </div>

        <div class="panel-body">
          <!-- Model not available warning -->
          <div v-if="!modelAvailable" class="warning-box">
            <AlertTriangle :size="18" />
            <div>
              <p><strong>Caption model not found.</strong></p>
              <p class="hint">Run <code>node scripts/download-caption-model.mjs</code> to download the AI models (~575 MB). These models run entirely offline.</p>
            </div>
          </div>

          <!-- Stats -->
          <div v-if="modelAvailable" class="stats-row">
            <div class="stat-card">
              <span class="stat-value">{{ stats.scanned }}</span>
              <span class="stat-label">Scanned</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ stats.remaining }}</span>
              <span class="stat-label">Remaining</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ stats.total }}</span>
              <span class="stat-label">Total Images</span>
            </div>
          </div>

          <!-- Progress bar during scan -->
          <div v-if="scanning" class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: scanPercent + '%' }"></div>
            </div>
            <p class="progress-text">{{ scanProgress }}</p>
          </div>

          <!-- Contextual Search Test -->
          <div v-if="stats.scanned > 0 && !scanning" class="search-section">
            <label>Try a contextual search</label>
            <div class="search-row">
              <div class="input-wrapper">
                <Search :size="14" class="search-icon" />
                <input 
                  v-model="testQuery" 
                  class="modern-input"
                  placeholder="e.g. cat, sunset, mountain, car..."
                  @keydown.enter="runSearch"
                />
              </div>
              <button class="action-btn primary" @click="runSearch" :disabled="!testQuery.trim()">Search</button>
            </div>
            <div class="threshold-row">
              <span class="threshold-label">Minimum similarity</span>
              <input v-model.number="searchThreshold" type="range" min="0.1" max="0.5" step="0.01" class="threshold-slider" />
              <span class="threshold-value">{{ searchThreshold.toFixed(2) }}</span>
            </div>
            <p v-if="searchResults !== null" class="search-result-count">
              {{ searchResults.length }} matching photo{{ searchResults.length !== 1 ? 's' : '' }}
            </p>
            <div v-if="searchResults?.length" class="results-grid">
              <article v-for="result in searchResults" :key="result.imageId + '-' + result.rawPath" class="result-card">
                <img :src="result.thumb || result.original" class="result-thumb" />
                <div class="result-body">
                  <div class="result-topline">
                    <span class="result-score">{{ formatSimilarity(result.similarity) }}</span>
                    <button class="dismiss-result-btn" @click="dismissResult(result)">Not relevant</button>
                  </div>
                  <p class="result-caption">{{ result.captions || 'Generating caption...' }}</p>
                  <span class="result-path">{{ result.rawPath?.split(/[\\/]/).pop() }}</span>
                </div>
              </article>
            </div>
          </div>

          <!-- Info about the feature -->
          <div class="info-section">
            <h3><Cpu :size="16" /> How it works</h3>
            <ul>
              <li>Library scans index images quickly with local <strong>CLIP</strong> embeddings first, then generate captions later for search hits that need more context.</li>
              <li>Your query is embedded the same way, then ranked against your library by similarity instead of rigid keyword matching.</li>
              <li>Results are stored locally — <strong>no data leaves your computer</strong>.</li>
              <li>You can dismiss irrelevant matches per query to keep recurring searches cleaner over time.</li>
              <li>Use Smart Albums with a <strong>"Context Contains"</strong> rule to auto-populate albums.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, onUnmounted } from 'vue'
import { Sparkles, Search, Cpu, AlertTriangle } from 'lucide-vue-next'
import { ipcOn } from '../ipcListen'

defineEmits(['close'])

const modelAvailable = ref(false)
const scanning = ref(false)
const scanProgress = ref('')
const scanPercent = ref(0)
const stats = ref({ total: 0, scanned: 0, remaining: 0 })
const testQuery = ref('')
const searchResults = ref(null)
const searchThreshold = ref(0.2)

let cleanupScanProgress = null

const loadStats = async () => {
  try {
    stats.value = await window.electron.ipcRenderer.invoke('get-caption-scan-stats')
  } catch { /* ignore */ }
}

const checkModel = async () => {
  try {
    modelAvailable.value = await window.electron.ipcRenderer.invoke('caption-model-available')
  } catch {
    modelAvailable.value = false
  }
}

onMounted(async () => {
  const cleanupAutoScan = ipcOn('auto-scan-progress', (data) => {
    if (!data || typeof data.current !== 'number') return
    scanPercent.value = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0
    if (typeof data.scannedTotal === 'number') {
      stats.value = {
        ...stats.value,
        scanned: data.scannedTotal,
        remaining: Math.max(0, stats.value.total - data.scannedTotal),
      }
    }
    if (data.done) {
      scanning.value = false
      scanProgress.value = data.cancelled
        ? `Cancelled after indexing ${data.successfulCount || 0} images`
        : `Done! Indexed ${data.successfulCount || 0} images${data.failedCount > 0 ? ` (${data.failedCount} failed)` : ''}`
      return
    }
    scanning.value = true
    const etaText = typeof data.etaSeconds === 'number' && data.etaSeconds > 0
      ? ` • ETA ${Math.ceil(data.etaSeconds / 60)}m`
      : ''
    scanProgress.value = `Indexing image embeddings... ${scanPercent.value}% (${data.current}/${data.total})${etaText}`
  })
  const cleanupCaptionUpdates = ipcOn('context-caption-updated', (data) => {
    if (!data?.imageId || !Array.isArray(searchResults.value)) return
    searchResults.value = searchResults.value.map((entry) =>
      entry.imageId === data.imageId ? { ...entry, captions: data.captions || '' } : entry
    )
  })
  cleanupScanProgress = () => {
    cleanupAutoScan?.()
    cleanupCaptionUpdates?.()
  }
  await Promise.all([checkModel(), loadStats()])
})

onUnmounted(() => {
  cleanupScanProgress?.()
})

const cancelScan = async () => {
  scanProgress.value = 'Cancelling...'
  try {
    await window.electron.ipcRenderer.invoke('cancel-auto-scan')
  } catch {}
}

const rescanAll = async () => {
  try {
    await window.electron.ipcRenderer.invoke('reset-caption-data')
    await loadStats()
    scanProgress.value = ''
    await startScan()
  } catch (err) {
    scanProgress.value = 'Rescan failed: ' + err.message
  }
}

const startScan = async () => {
  if (scanning.value) return
  scanning.value = true
  scanPercent.value = 0

  try {
    scanProgress.value = 'Loading search models...'

    const result = await window.electron.ipcRenderer.invoke('start-caption-scan')

    if (result?.success === false && result?.error) {
      scanProgress.value = 'Error: ' + result.error
      scanning.value = false
      return
    }

    if (result?.processed === 0 && !result?.cancelled) {
      scanProgress.value = 'All images already scanned!'
      scanning.value = false
      await loadStats()
      return
    }
  } catch (err) {
    scanProgress.value = 'Error: ' + err.message
  } finally {
    scanning.value = false
    await loadStats()
  }
}

const runSearch = async () => {
  if (!testQuery.value.trim()) return
  try {
    searchResults.value = await window.electron.ipcRenderer.invoke('context-search', {
      query: testQuery.value.trim(),
      minSimilarity: searchThreshold.value,
    })
  } catch {
    searchResults.value = []
  }
}

const dismissResult = async (result) => {
  try {
    await window.electron.ipcRenderer.invoke('dismiss-context-result', {
      query: testQuery.value.trim(),
      imageId: result.imageId,
    })
    searchResults.value = searchResults.value.filter((entry) => entry.imageId !== result.imageId)
  } catch {}
}

const formatSimilarity = (value) => {
  if (typeof value !== 'number') return 'Text match'
  return `${Math.round(value * 100)}% match`
}
</script>

<style scoped>
.context-overlay *,
.context-overlay *::before,
.context-overlay *::after { box-sizing: border-box; }

.context-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.context-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 680px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; display: flex; align-items: center; gap: 8px; }
.header-icon { color: #f5f5f7; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.panel-body { padding: 20px 24px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 20px; }

/* Warning box */
.warning-box { display: flex; gap: 12px; align-items: flex-start; padding: 16px; background: rgba(255,159,10,0.1); border: 1px solid rgba(255,159,10,0.3); border-radius: 10px; color: #ff9f0a; }
.warning-box p { margin: 0; color: #ccc; font-size: 13px; }
.warning-box p:first-child { color: #ff9f0a; }
.warning-box .hint { margin-top: 6px; color: #999; }
.warning-box code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #ddd; }

/* Stats */
.stats-row { display: flex; gap: 12px; }
.stat-card { flex: 1; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 14px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
.stat-value { display: block; font-size: 24px; font-weight: 700; color: #f5f5f7; }
.stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; margin-top: 4px; display: block; }

/* Progress */
.progress-section { display: flex; flex-direction: column; gap: 8px; }
.progress-bar { height: 6px; background: #2a2a2c; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #0071e3, #34c759); border-radius: 3px; transition: width 0.3s ease; }
.progress-text { font-size: 13px; color: #86868b; text-align: center; }

/* Search section */
.search-section { display: flex; flex-direction: column; gap: 10px; }
.search-section label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; }
.search-row { display: flex; gap: 10px; align-items: center; }
.threshold-row { display: flex; align-items: center; gap: 10px; }
.threshold-label { font-size: 11px; color: #86868b; min-width: 108px; }
.threshold-slider { flex: 1; }
.threshold-value { font-size: 11px; color: #f5f5f7; min-width: 54px; text-align: right; }
.input-wrapper { flex: 1; position: relative; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #666; }
.modern-input { width: 100%; background: #1a1a1c; border: 1px solid #333; border-radius: 8px; padding: 10px 12px 10px 32px; color: #f5f5f7; font-size: 13px; transition: border-color 0.2s ease; }
.modern-input:focus { border-color: #0071e3; outline: none; }
.search-result-count { font-size: 13px; color: #0071e3; font-weight: 500; text-align: center; padding: 8px; background: rgba(0,113,227,0.08); border-radius: 8px; margin: 0; }
.results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.result-card { background: #222; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: border-color 0.15s; }
.result-card:hover { border-color: rgba(255,255,255,0.12); }
.result-thumb { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #1a1a1c; }
.result-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.result-topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.result-score { font-size: 10px; color: #93c5fd; }
.dismiss-result-btn { background: none; border: none; color: #ff453a; font-size: 11px; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
.dismiss-result-btn:hover { background: rgba(255,69,58,0.1); }
.result-caption { margin: 0; color: #f5f5f7; font-size: 12px; line-height: 1.45; min-height: 34px; }
.result-path { font-size: 10px; color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Info */
.info-section { background: rgba(255,255,255,0.03); border-radius: 10px; padding: 16px 20px; border: 1px solid rgba(255,255,255,0.05); font-family: var(--font-sans, 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif); }
.info-section h3 { font-size: 15px; font-weight: 650; letter-spacing: -0.02em; color: #f5f5f7; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; font-family: inherit; }
.info-section ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
.info-section li { font-size: 13px; color: #aaa; line-height: 1.6; letter-spacing: 0.01em; font-family: inherit; font-weight: 450; }

/* Buttons */
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; }
.action-btn:hover { background: #333; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.primary { background: #0071e3; border-color: #0071e3; }
.action-btn.primary:hover { background: #333; }
.action-btn.cancel-btn { border-color: #ff453a; color: #ff453a; }
.action-btn.cancel-btn:hover { background: rgba(255,69,58,0.1); }
.rescan-btn { border-color: #ff9f0a; color: #ff9f0a; }
.rescan-btn:hover { background: rgba(255,159,10,0.1); }

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }

@media (max-width: 760px) {
  .context-panel { width: 95vw; }
  .panel-header { align-items: flex-start; }
  .header-actions { flex-wrap: wrap; justify-content: flex-end; }
  .stats-row { flex-direction: column; }
  .search-row,
  .threshold-row { flex-direction: column; align-items: stretch; }
  .threshold-label,
  .threshold-value { min-width: 0; text-align: left; }
  .results-grid { grid-template-columns: 1fr; }
}
</style>
