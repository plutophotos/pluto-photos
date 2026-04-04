<template>
  <Teleport to="body">
    <div class="dup-overlay" @click.self="$emit('close')">
      <div class="dup-panel">
        <div class="panel-header">
          <h2>Duplicate Finder</h2>
          <div class="header-actions">
            <button class="action-btn" @click="scan" :disabled="scanning">
              {{ scanning ? 'Scanning...' : 'Scan for Duplicates' }}
            </button>
            <button v-if="hasMarkedDeletes" class="action-btn danger" @click="applyDeletes">
              Delete {{ markedCount }} Marked
            </button>
            <button class="btn-close" @click="$emit('close')">✕</button>
          </div>
        </div>

        <div ref="panelBodyRef" class="panel-body" @scroll="handlePanelScroll">
          <div class="scan-controls" :class="{ disabled: scanning }">
            <span class="scan-controls-label">Scan mode</span>
            <div class="scan-mode-group" role="radiogroup" aria-label="Duplicate scan mode">
              <button
                v-for="option in scanModeOptions"
                :key="option.value"
                type="button"
                class="scan-mode-btn"
                :class="{ active: scanMode === option.value }"
                :disabled="scanning"
                @click="scanMode = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <p class="scan-controls-hint">{{ scanModeHint }}</p>
          </div>

          <div v-if="!scanned && !scanning" class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>Click "Scan for Duplicates" to find duplicate photos in your library.</p>
            <p class="hint">{{ scanModeHint }}</p>
          </div>

          <div v-if="scanning" class="scanning-state">
            <div class="spinner"></div>
            <p>Analyzing images... {{ progressCurrent }} / {{ progressTotal }}</p>
            <div v-if="progressTotal" class="progress-bar-wrap">
              <div class="progress-bar-fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <p v-if="progressMsg" class="progress-msg">{{ progressMsg }}</p>
          </div>

          <div v-if="scanned && groups.length === 0" class="empty-state">
            <div class="empty-icon">✅</div>
            <p>No duplicates found! Your library is clean.</p>
          </div>

            <div v-if="groups.length > 0" class="dup-groups">
            <div class="dup-summary">
              Found {{ groups.length }} groups of duplicates ({{ totalDuplicates }} files)
              <span v-if="groupBreakdownText"> • {{ groupBreakdownText }}</span>
              <span v-if="renderedGroupCount < groups.length"> • Showing {{ renderedGroupCount }} / {{ groups.length }}</span>
            </div>

            <div v-for="(group, gIdx) in visibleGroups" :key="group.groupId" class="dup-group" :class="{ 'resolved': group.items.length <= 1 }">
              <div class="group-header">
                <span class="group-label">
                  Group {{ gIdx + 1 }} — {{ group.items.length }} file{{ group.items.length !== 1 ? 's' : '' }}
                  <span class="group-kind" :class="group.kind">{{ groupKindLabel(group.kind) }}</span>
                  <span v-if="group.items.length <= 1" class="resolved-badge">✓ Resolved</span>
                </span>
                <div v-if="group.items.length > 1" class="group-actions">
                  <button class="action-btn sm dismiss-btn" @click="dismissGroup(group)">✗ Not Duplicates</button>
                  <button class="action-btn sm compare-btn" @click="$emit('compare', group.items)">🔎 Compare</button>
                  <button class="action-btn sm" @click="keepRecommended(group)">Keep Recommended</button>
                  <button class="action-btn sm" @click="keepFirst(group)">Keep First, Delete Rest</button>
                </div>
              </div>
              <div class="group-items">
                <div v-for="(item, iIdx) in group.items" :key="item.original" 
                  class="dup-item" :class="{ 'marked-delete': item._delete }">
                  <div class="dup-thumb">
                    <img :src="item.thumb || item.original" loading="lazy" decoding="async" />
                  </div>
                  <div class="dup-info">
                    <span class="dup-name">{{ item.original.split(/[\\/]/).pop() }}</span>
                    <span class="dup-path">{{ item.original }}</span>
                    <span class="dup-meta" v-if="item.file_size">{{ formatSize(item.file_size) }}<span v-if="item.width && item.height"> • {{ item.width }}×{{ item.height }}</span></span>
                    <span v-if="item.id === group.recommendedKeepId" class="recommended-pill">Recommended keep</span>
                  </div>
                  <div class="dup-actions">
                    <button v-if="!item._delete && group.items.length > 1" class="btn-delete-dup" @click="markDelete(group, iIdx)">🗑️ Delete</button>
                    <button v-else-if="item._delete" class="btn-undo-dup" @click="item._delete = false">↩️ Undo</button>
                    <span v-else class="kept-label">✓ Kept</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="renderedGroupCount < groups.length" class="load-more-wrap">
              <button class="action-btn sm" @click="loadMoreGroups">Load More</button>
            </div>

            <div v-if="hasMarkedDeletes" class="apply-bar">
              <span class="apply-hint">{{ markedCount }} file{{ markedCount !== 1 ? 's' : '' }} marked for deletion</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { ipcOn } from '../ipcListen'

const props = defineProps({
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'refresh', 'compare'])

const groups = ref([])
const scanning = ref(false)
const scanned = ref(false)
const progressCurrent = ref(0)
const progressTotal = ref(0)
const progressMsg = ref('')
const scanMode = ref('both')
const panelBodyRef = ref(null)
const renderedGroupCount = ref(40)

const GROUP_BATCH_SIZE = 40
const LOAD_MORE_THRESHOLD_PX = 1200

const scanModeOptions = [
  { value: 'both', label: 'Both' },
  { value: 'exact', label: 'Exact only' },
  { value: 'near', label: 'Near only' },
]

const progressPct = computed(() => progressTotal.value ? Math.round((progressCurrent.value / progressTotal.value) * 100) : 0)

const totalDuplicates = computed(() => groups.value.reduce((sum, group) => sum + Math.max(0, group.items.length - 1), 0))
const exactGroupCount = computed(() => groups.value.filter((group) => group.kind === 'exact').length)
const nearGroupCount = computed(() => groups.value.filter((group) => group.kind === 'similar').length)
const mixedGroupCount = computed(() => groups.value.filter((group) => group.kind === 'mixed').length)
const groupBreakdownText = computed(() => {
  const parts = []
  if (exactGroupCount.value) parts.push(`${exactGroupCount.value} exact`)
  if (nearGroupCount.value) parts.push(`${nearGroupCount.value} near`)
  if (mixedGroupCount.value) parts.push(`${mixedGroupCount.value} mixed`)
  return parts.join(' • ')
})
const visibleGroups = computed(() => groups.value.slice(0, renderedGroupCount.value))
const scanModeHint = computed(() => {
  if (scanMode.value === 'exact') return 'Exact mode uses a full file-content hash to find byte-for-byte duplicates.'
  if (scanMode.value === 'near') return 'Near mode uses perceptual hashing to find visually similar photos, even if they are not identical files.'
  return 'Both mode finds exact file duplicates first, then visually similar photos as a separate signal.'
})

const hasMarkedDeletes = computed(() => groups.value.some(group => group.items.some(item => item._delete)))
const markedCount = computed(() => groups.value.reduce((sum, group) => sum + group.items.filter(item => item._delete).length, 0))

const formatSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

let cleanupProgress = null
let nextGroupId = 1

const groupKindLabel = (kind) => {
  if (kind === 'exact') return 'Exact'
  if (kind === 'mixed') return 'Mixed'
  return 'Near'
}

const resetRenderedGroups = async () => {
  renderedGroupCount.value = Math.min(GROUP_BATCH_SIZE, groups.value.length)
  await nextTick()
  if (panelBodyRef.value) panelBodyRef.value.scrollTop = 0
}

const loadMoreGroups = () => {
  renderedGroupCount.value = Math.min(groups.value.length, renderedGroupCount.value + GROUP_BATCH_SIZE)
}

const handlePanelScroll = () => {
  const body = panelBodyRef.value
  if (!body || renderedGroupCount.value >= groups.value.length) return
  const remaining = body.scrollHeight - body.scrollTop - body.clientHeight
  if (remaining < LOAD_MORE_THRESHOLD_PX) loadMoreGroups()
}

const scan = async () => {
  scanning.value = true
  scanned.value = false
  groups.value = []
  renderedGroupCount.value = GROUP_BATCH_SIZE
  progressCurrent.value = 0
  progressTotal.value = 0
  progressMsg.value = ''

  // Listen for progress events from the backend
  cleanupProgress = ipcOn('import-progress', (data) => {
    if (data && typeof data.current === 'number') {
      progressCurrent.value = data.current
      progressTotal.value = data.total || 0
      progressMsg.value = data.message || ''
    }
  })

  try {
    const result = await window.electron.ipcRenderer.invoke('find-duplicates', { scanMode: scanMode.value })

    groups.value = (result.groups || []).map(group => ({
      ...group,
      groupId: nextGroupId++,
      items: (group.items || []).map(item => ({ ...item, _delete: false })),
    }))
    await resetRenderedGroups()
  } catch (err) {
    console.error('Duplicate scan failed:', err)
  } finally {
    if (cleanupProgress) { cleanupProgress(); cleanupProgress = null }
    scanning.value = false
    scanned.value = true
  }
}

onUnmounted(() => {
  if (cleanupProgress) cleanupProgress()
})

const markDelete = (gIdx, iIdx) => {
  gIdx.items[iIdx]._delete = true
}

const keepFirst = (group) => {
  group.items.forEach((item, i) => { item._delete = i > 0 })
}

const keepRecommended = (group) => {
  group.items.forEach((item) => { item._delete = item.id !== group.recommendedKeepId })
}

const dismissGroup = async (group) => {
  const imageIds = group.items.map(item => item.id).filter(Boolean)
  if (imageIds.length < 2) return
  try {
    await window.electron.ipcRenderer.invoke('dismiss-duplicate-group', { imageIds })
  } catch {}
  // Remove the group from the UI
  groups.value = groups.value.filter(candidate => candidate.groupId !== group.groupId)
}

const applyDeletes = async () => {
  const toDelete = []
  for (const group of groups.value) {
    for (const item of group.items) {
      if (item._delete) toDelete.push(item.original)
    }
  }
  
  if (toDelete.length === 0) return
  
  for (const path of toDelete) {
    try {
      await window.electron.ipcRenderer.invoke('delete-duplicate', { imagePath: path })
    } catch {}
  }
  
  // Remove deleted items from groups, remove fully empty groups
  groups.value = groups.value
    .map(group => ({ ...group, items: group.items.filter(item => !item._delete) }))
    .filter(group => group.items.length > 0)
  
  emit('refresh')
}
</script>

<style scoped>
.dup-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.dup-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 720px; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; gap: 12px; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; flex: 1; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.panel-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
.scan-controls { margin-bottom: 18px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; background: rgba(255,255,255,0.02); }
.scan-controls.disabled { opacity: 0.7; }
.scan-controls-label { display: block; margin-bottom: 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #86868b; text-transform: uppercase; }
.scan-mode-group { display: flex; gap: 8px; flex-wrap: wrap; }
.scan-mode-btn { background: rgba(255,255,255,0.02); border: 1px solid #444; border-radius: 999px; padding: 8px 12px; color: #c7c7cc; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
.scan-mode-btn:hover:not(:disabled) { border-color: #666; color: #f5f5f7; }
.scan-mode-btn.active { background: rgba(0,113,227,0.16); border-color: #0071e3; color: #dbeafe; }
.scan-controls-hint { margin: 10px 0 0; font-size: 12px; color: #86868b; }
.empty-state { text-align: center; padding: 40px; color: #86868b; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.hint { font-size: 12px; color: #555; }
.scanning-state { text-align: center; padding: 40px; color: #86868b; }
.spinner { width: 30px; height: 30px; border: 3px solid #333; border-top-color: #0071e3; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.progress-bar-wrap { width: 70%; margin: 12px auto; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: #0071e3; border-radius: 3px; transition: width 0.3s; }
.progress-msg { font-size: 12px; color: #555; margin-top: 4px; }
.dup-summary { font-size: 14px; color: #f5f5f7; font-weight: 500; margin-bottom: 16px; padding: 12px; background: rgba(255,69,58,0.08); border: 1px solid rgba(255,69,58,0.2); border-radius: 8px; }
.dup-group { margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
.dup-group { content-visibility: auto; contain-intrinsic-size: 220px; }
.group-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #222; }
.group-actions { display: flex; gap: 6px; align-items: center; }
.compare-btn { background: rgba(0,113,227,0.12); border-color: #0071e3; color: #0071e3; }
.compare-btn:hover { background: rgba(0,113,227,0.25); }
.dismiss-btn { background: rgba(255,255,255,0.04); border-color: #555; color: #86868b; }
.dismiss-btn:hover { background: rgba(255,255,255,0.08); color: #f5f5f7; }
.group-label { font-size: 12px; font-weight: 600; color: #86868b; }
.group-kind { display: inline-block; margin-left: 8px; padding: 2px 7px; border-radius: 999px; font-size: 10px; letter-spacing: 0.04em; }
.group-kind.exact { color: #fca5a5; background: rgba(239, 68, 68, 0.14); }
.group-kind.similar { color: #93c5fd; background: rgba(59, 130, 246, 0.14); }
.group-kind.mixed { color: #fde68a; background: rgba(245, 158, 11, 0.16); }
.group-items { display: flex; flex-direction: column; }
.dup-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.04); transition: all 0.2s; }
.dup-item.marked-delete { background: rgba(255,69,58,0.06); opacity: 0.6; }
.dup-thumb { width: 60px; height: 45px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #111; }
.dup-thumb img { width: 100%; height: 100%; object-fit: cover; }
.dup-info { flex: 1; min-width: 0; }
.dup-name { font-size: 13px; color: #f5f5f7; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dup-path { font-size: 10px; color: #555; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dup-meta { font-size: 11px; color: #86868b; }
.recommended-pill { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700; color: #dbeafe; background: rgba(59, 130, 246, 0.16); border-radius: 999px; padding: 2px 8px; }
.dup-actions { flex-shrink: 0; }
.btn-delete-dup, .btn-undo-dup { background: none; border: 1px solid #444; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; color: #f5f5f7; }
.btn-delete-dup:hover { border-color: #ff453a; color: #ff453a; }
.btn-undo-dup { border-color: #0071e3; color: #0071e3; }
.apply-bar { padding: 12px 0; text-align: center; }
.load-more-wrap { display: flex; justify-content: center; padding: 4px 0 12px; }
.apply-hint { font-size: 12px; color: #ff453a; font-weight: 500; }
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; }
.action-btn:hover { background: #333; }
.action-btn.sm { padding: 4px 10px; font-size: 11px; }
.action-btn.danger { background: rgba(255,69,58,0.15); border-color: #ff453a; color: #ff453a; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.dup-group.resolved { border-color: rgba(48, 209, 88, 0.15); }
.dup-group.resolved .group-header { background: rgba(48, 209, 88, 0.06); }
.resolved-badge { display: inline-block; margin-left: 8px; padding: 2px 8px; font-size: 10px; font-weight: 600; color: #30d158; background: rgba(48, 209, 88, 0.12); border-radius: 4px; letter-spacing: 0.3px; }
.kept-label { font-size: 11px; color: #30d158; font-weight: 600; }
</style>
