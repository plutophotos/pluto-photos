<template>
  <Teleport to="body">
    <div class="batch-overlay" @click.self="$emit('close')">
      <div class="batch-panel">
        <div class="batch-header">
          <h2>Batch Operations</h2>
          <span class="batch-count">{{ paths.length }} items selected</span>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>

        <div class="batch-body">
          <!-- Bulk Rating -->
          <div class="batch-section">
            <h3>Set Rating <span v-if="appliedRating !== null" class="applied-check">✓ Applied</span></h3>
            <div class="star-row">
              <button v-for="s in 5" :key="s" class="star-btn" :class="{ active: appliedRating >= s }" @click="batchRate(s)">★</button>
              <button class="action-btn sm" @click="batchRate(0)">Clear</button>
            </div>
          </div>

          <!-- Bulk Color Label -->
          <div class="batch-section">
            <h3>Set Color Label <span v-if="appliedColor !== null" class="applied-check">✓ Applied</span></h3>
            <div class="color-row">
              <button v-for="c in colors" :key="c.value" class="color-dot" :class="{ active: appliedColor === c.value }" :style="{ background: c.hex }" @click="batchColor(c.value)" :title="c.name"></button>
              <button class="action-btn sm" @click="batchColor('')">Clear</button>
            </div>
          </div>

          <!-- Bulk Tag -->
          <div class="batch-section">
            <h3>Add Tag to All <span v-if="appliedTags.length" class="applied-check">✓ {{ appliedTags.length }} applied</span></h3>
            <div class="tag-input-row">
              <input v-model="bulkTag" class="modern-input" placeholder="Tag name..." @keydown.enter="batchTag" />
              <button class="action-btn" @click="batchTag" :disabled="!bulkTag.trim()">Apply</button>
            </div>
            <div v-if="appliedTags.length" class="applied-tags">
              <span v-for="t in appliedTags" :key="t" class="applied-tag">{{ t }}</span>
            </div>
          </div>

          <!-- Move to Album -->
          <div class="batch-section">
            <h3>Copy to Album</h3>
            <select class="modern-select" v-model="selectedAlbum">
              <option :value="null">Select album...</option>
              <template v-for="p in projects" :key="p.id">
                <option v-for="a in p.albums" :key="a.id" :value="a.id">{{ p.name }} / {{ a.name }}</option>
              </template>
            </select>
            <button class="action-btn" @click="batchMoveAlbum" :disabled="!selectedAlbum" style="margin-top: 8px;">Move</button>
          </div>

          <!-- Export -->
          <div class="batch-section">
            <h3>Export</h3>
            <div class="export-options">
              <div class="option-row">
                <label>Format</label>
                <select class="modern-select" v-model="exportOpts.format">
                  <option value="">Original</option>
                  <option value="jpg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              <div class="option-row">
                <label>Max Width</label>
                <input type="number" class="modern-input" v-model.number="exportOpts.maxWidth" placeholder="None" />
              </div>
              <div class="option-row">
                <label>Quality</label>
                <input type="range" min="10" max="100" v-model.number="exportOpts.quality" class="modern-slider" />
                <span class="val">{{ exportOpts.quality }}%</span>
              </div>
              <div class="option-row">
                <label>Rename</label>
                <input class="modern-input" v-model="exportOpts.renamePattern" placeholder="{name}" />
              </div>
            </div>
            <button class="action-btn primary" @click="batchExport" style="margin-top: 10px;">Export {{ paths.length }} Files</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive } from 'vue'

const props = defineProps({
  paths: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  tier: { type: String, default: 'free' }
})

const emit = defineEmits(['close', 'done'])

const bulkTag = ref('')
const selectedAlbum = ref(null)
const appliedRating = ref(null)
const appliedColor = ref(null)
const appliedTags = ref([])
const exportOpts = reactive({ format: '', maxWidth: null, maxHeight: null, quality: 90, renamePattern: '' })

const colors = [
  { value: 'red', hex: '#ff453a', name: 'Red' },
  { value: 'yellow', hex: '#ffd60a', name: 'Yellow' },
  { value: 'green', hex: '#30d158', name: 'Green' },
  { value: 'blue', hex: '#0a84ff', name: 'Blue' },
  { value: 'purple', hex: '#bf5af2', name: 'Purple' }
]

const batchRate = async (rating) => {
  await window.electron.ipcRenderer.invoke('batch-set-rating', { paths: props.paths, rating })
  appliedRating.value = rating
  emit('done', `Rating ${rating > 0 ? '★'.repeat(rating) : 'cleared'} applied to ${props.paths.length} items`)
}

const batchColor = async (color) => {
  await window.electron.ipcRenderer.invoke('batch-set-color-label', { paths: props.paths, color })
  appliedColor.value = color || null
  emit('done', `Color label ${color || 'cleared'} applied to ${props.paths.length} items`)
}

const batchTag = async () => {
  const tag = bulkTag.value.trim()
  if (!tag) return
  await window.electron.ipcRenderer.invoke('batch-add-tag', { paths: props.paths, tag })
  if (!appliedTags.value.includes(tag)) appliedTags.value.push(tag)
  bulkTag.value = ''
  emit('done', `Tag "${tag}" added to ${props.paths.length} items`)
}

const batchMoveAlbum = async () => {
  if (!selectedAlbum.value) return
  await window.electron.ipcRenderer.invoke('batch-move-to-album', { paths: props.paths, albumId: selectedAlbum.value })
  emit('done', 'Moved to album')
}

const batchExport = async () => {
  const result = await window.electron.ipcRenderer.invoke('batch-export', { paths: props.paths, options: { ...exportOpts } })
  if (result.success) emit('done', `Exported ${result.exported} files`)
}
</script>

<style>
/* Base (Dark theme) — all scoped under .batch-overlay to prevent leaking */
.batch-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.batch-overlay .batch-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 480px; max-height: 85vh; overflow-y: auto; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.batch-overlay .batch-header { display: flex; align-items: center; gap: 12px; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.batch-overlay .batch-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; flex: 1; }
.batch-overlay .batch-count { font-size: 12px; color: #86868b; background: #2a2a2c; padding: 4px 10px; border-radius: 12px; }
.batch-overlay .btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; }
.batch-overlay .batch-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 24px; }
.batch-overlay .batch-section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; margin: 0 0 10px 0; }
.batch-overlay .star-row { display: flex; align-items: center; gap: 6px; }
.batch-overlay .star-btn { background: none; border: none; font-size: 22px; color: #444; cursor: pointer; padding: 2px; transition: color 0.15s, transform 0.15s, text-shadow 0.15s; }
.batch-overlay .star-btn:hover { transform: scale(1.2); color: #ffd60a; }
.batch-overlay .star-btn.active { color: #ffd60a; }
.batch-overlay .color-row { display: flex; align-items: center; gap: 8px; }
.batch-overlay .color-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
.batch-overlay .color-dot:hover { transform: scale(1.15); }
.batch-overlay .color-dot.active { border-color: #fff; transform: scale(1.2); box-shadow: 0 0 10px rgba(255,255,255,0.3); }
.batch-overlay .tag-input-row { display: flex; gap: 8px; }
.batch-overlay .modern-input { flex: 1; background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 8px 12px; color: #f5f5f7; font-size: 13px; }
.batch-overlay .modern-input:focus { border-color: #0071e3; outline: none; }
.batch-overlay .modern-select { background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 8px 12px; color: #f5f5f7; font-size: 13px; width: 100%; }
.batch-overlay .modern-slider { flex: 1; accent-color: #0071e3; }
.batch-overlay .action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; }
.batch-overlay .action-btn:hover { background: #333; }
.batch-overlay .action-btn.primary { background: #0071e3; border-color: #0071e3; }
.batch-overlay .action-btn.sm { padding: 4px 10px; font-size: 11px; }
.batch-overlay .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.batch-overlay .export-options { display: flex; flex-direction: column; gap: 10px; }
.batch-overlay .option-row { display: flex; align-items: center; gap: 10px; }
.batch-overlay .option-row label { font-size: 12px; color: #aaa; min-width: 70px; }
.batch-overlay .option-row .val { font-size: 12px; color: #86868b; min-width: 40px; }
.batch-overlay .applied-check { color: #30d158; font-size: 11px; font-weight: 500; margin-left: 6px; letter-spacing: 0; text-transform: none; }
.batch-overlay .applied-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.batch-overlay .applied-tag { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(48, 209, 88, 0.12); color: #30d158; border: 1px solid rgba(48, 209, 88, 0.2); }

/* Light theme */
[data-theme="light"] .batch-overlay { background: rgba(0,0,0,0.35); }
[data-theme="light"] .batch-overlay .batch-panel { background: #ffffff; border-color: #d1d1d6; box-shadow: 0 40px 100px rgba(0,0,0,0.2); }
[data-theme="light"] .batch-overlay .batch-header { border-bottom-color: #e5e5ea; }
[data-theme="light"] .batch-overlay .batch-header h2 { color: #1d1d1f; }
[data-theme="light"] .batch-overlay .batch-count { color: #86868b; background: #f2f2f7; }
[data-theme="light"] .batch-overlay .btn-close { color: #86868b; }
[data-theme="light"] .batch-overlay .batch-section h3 { color: #86868b; }
[data-theme="light"] .batch-overlay .star-btn { color: #d1d1d6; }
[data-theme="light"] .batch-overlay .star-btn:hover { color: #ff9f0a; }
[data-theme="light"] .batch-overlay .star-btn.active { color: #ff9f0a; text-shadow: none; }
[data-theme="light"] .batch-overlay .color-dot.active { border-color: #1d1d1f; box-shadow: 0 0 8px rgba(0,0,0,0.15); }
[data-theme="light"] .batch-overlay .modern-input { background: #f2f2f7; border-color: #d1d1d6; color: #1d1d1f; }
[data-theme="light"] .batch-overlay .modern-input:focus { border-color: #0071e3; }
[data-theme="light"] .batch-overlay .modern-select { background: #f2f2f7; border-color: #d1d1d6; color: #1d1d1f; }
[data-theme="light"] .batch-overlay .action-btn { background: #f2f2f7; border-color: #d1d1d6; color: #1d1d1f; }
[data-theme="light"] .batch-overlay .action-btn:hover { background: #e5e5ea; }
[data-theme="light"] .batch-overlay .action-btn.primary { background: #0071e3; border-color: #0071e3; color: #fff; }
[data-theme="light"] .batch-overlay .option-row label { color: #6e6e73; }
[data-theme="light"] .batch-overlay .option-row .val { color: #6e6e73; }
[data-theme="light"] .batch-overlay .applied-tag { background: rgba(0, 113, 227, 0.08); color: #0071e3; border-color: rgba(0, 113, 227, 0.2); }

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .batch-overlay { background: rgba(0,0,0,0.8); }
[data-theme="futuristic"] .batch-overlay .batch-panel { background: rgba(10, 15, 30, 0.96); border: 1px solid rgba(0, 240, 255, 0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.7), 0 0 40px rgba(0, 240, 255, 0.06); backdrop-filter: blur(20px); }
[data-theme="futuristic"] .batch-overlay .batch-header { border-bottom-color: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .batch-overlay .batch-header h2 { color: #e0e6ff; }
[data-theme="futuristic"] .batch-overlay .batch-count { color: #00f0ff; background: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .batch-overlay .btn-close { color: #607090; }
[data-theme="futuristic"] .batch-overlay .batch-section h3 { color: #607090; }
[data-theme="futuristic"] .batch-overlay .star-btn { color: rgba(0, 240, 255, 0.25); }
[data-theme="futuristic"] .batch-overlay .star-btn:hover { color: #00f0ff; text-shadow: 0 0 6px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .batch-overlay .star-btn.active { color: #00f0ff; text-shadow: 0 0 6px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .batch-overlay .color-dot.active { border-color: #00f0ff; box-shadow: 0 0 10px rgba(0, 240, 255, 0.3); }
[data-theme="futuristic"] .batch-overlay .modern-input { background: rgba(0, 240, 255, 0.04); border-color: rgba(0, 240, 255, 0.12); color: #e0e6ff; }
[data-theme="futuristic"] .batch-overlay .modern-input:focus { border-color: #00f0ff; }
[data-theme="futuristic"] .batch-overlay .modern-select { background: rgba(0, 240, 255, 0.04); border-color: rgba(0, 240, 255, 0.12); color: #e0e6ff; }
[data-theme="futuristic"] .batch-overlay .modern-slider { accent-color: #a855f7; }
[data-theme="futuristic"] .batch-overlay .action-btn { background: rgba(0, 240, 255, 0.06); border-color: rgba(0, 240, 255, 0.15); color: #c0c8e0; }
[data-theme="futuristic"] .batch-overlay .action-btn:hover { background: rgba(0, 240, 255, 0.12); color: #00f0ff; }
[data-theme="futuristic"] .batch-overlay .action-btn.primary { background: rgba(168, 85, 247, 0.2); border-color: rgba(168, 85, 247, 0.4); color: #a855f7; }
[data-theme="futuristic"] .batch-overlay .action-btn.primary:hover { background: rgba(168, 85, 247, 0.3); }
[data-theme="futuristic"] .batch-overlay .option-row label { color: #607090; }
[data-theme="futuristic"] .batch-overlay .option-row .val { color: #607090; }
[data-theme="futuristic"] .batch-overlay .applied-check { color: #00f0ff; }
[data-theme="futuristic"] .batch-overlay .applied-tag { background: rgba(0, 240, 255, 0.08); color: #00f0ff; border-color: rgba(0, 240, 255, 0.2); }
</style>
