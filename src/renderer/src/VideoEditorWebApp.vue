<template>
  <div class="video-editor-web-shell">
    <div v-if="loading" class="video-editor-web-state">
      <strong>Loading Video Editor…</strong>
      <span>Preparing the desktop editor for web playback.</span>
    </div>

    <div v-else-if="error" class="video-editor-web-state error">
      <strong>Video Editor Unavailable</strong>
      <span>{{ error }}</span>
      <button type="button" @click="goBack">Back to Gallery</button>
    </div>

    <VideoTrimmer
      v-else-if="initialVideoPaths.length"
      :video-path="initialVideoPaths[0]"
      :initial-video-paths="initialVideoPaths"
      @close="goBack"
      @saved="handleSaved"
    />

    <div v-else class="video-editor-web-state">
      <strong>No Videos Selected</strong>
      <span>Open the editor from a video selection in the gallery.</span>
      <button type="button" @click="goBack">Back to Gallery</button>
    </div>

    <div v-if="picker.open" class="picker-overlay" @click.self="cancelPicker">
      <div class="picker-panel">
        <div class="picker-header">
          <div>
            <h2>{{ picker.type === 'video' ? 'Add Videos' : 'Add Audio' }}</h2>
            <p>{{ picker.type === 'video' ? 'Select more library videos for the shared timeline.' : 'Browse mounted folders for audio overlays or additional audio-capable media.' }}</p>
          </div>
          <button type="button" class="picker-close" @click="cancelPicker">✕</button>
        </div>

        <div v-if="picker.type === 'video'" class="picker-body">
          <div class="picker-toolbar">
            <input v-model="videoSearch" type="search" placeholder="Search videos" @input="loadVideoLibrary" />
            <button type="button" @click="loadVideoLibrary">Refresh</button>
          </div>
          <div class="picker-list video-list">
            <label v-for="item in picker.items" :key="item.path" class="picker-item">
              <input v-model="picker.selected" type="checkbox" :value="item.path" />
              <img :src="item.thumbUrl" alt="" />
              <span>
                <strong>{{ item.name }}</strong>
                <small>{{ item.path }}</small>
              </span>
            </label>
            <div v-if="!picker.items.length" class="picker-empty">No matching videos found.</div>
          </div>
        </div>

        <div v-else class="picker-body">
          <div class="picker-breadcrumbs">
            <button v-for="crumb in picker.breadcrumbs" :key="crumb.path || crumb.label" type="button" @click="openBrowserPath(crumb.path)">{{ crumb.label }}</button>
          </div>
          <div class="picker-list browser-list">
            <button v-for="dir in picker.directories" :key="dir.path" type="button" class="picker-browser-row" @click="openBrowserPath(dir.path)">
              <span>📁 {{ dir.name }}</span>
              <small>{{ dir.path }}</small>
            </button>
            <label v-for="file in picker.files" :key="file.path" class="picker-item browser-file-row">
              <input v-model="picker.selected" type="checkbox" :value="file.path" />
              <span>
                <strong>{{ file.name }}</strong>
                <small>{{ file.path }}</small>
              </span>
            </label>
            <div v-if="!picker.directories.length && !picker.files.length" class="picker-empty">No matching files in this folder.</div>
          </div>
        </div>

        <div class="picker-footer">
          <span>{{ picker.selected.length }} selected</span>
          <div>
            <button type="button" @click="cancelPicker">Cancel</button>
            <button type="button" class="primary" :disabled="!picker.selected.length" @click="confirmPicker">Add Selected</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import VideoTrimmer from './components/VideoTrimmer.vue'

const loading = ref(true)
const error = ref('')
const initialVideoPaths = ref([])
const videoSearch = ref('')

const picker = reactive({
  open: false,
  type: 'video',
  items: [],
  directories: [],
  files: [],
  breadcrumbs: [],
  selected: [],
  resolver: null,
  rejecter: null,
})

const api = async (path) => {
  const response = await fetch(path, { credentials: 'same-origin' })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || 'Request failed.')
  return data
}

const postApi = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || 'Request failed.')
  return data
}

function mediaUrlForPath(filePath) {
  if (!filePath) return ''
  if (/^(https?:)?\//.test(filePath) || filePath.startsWith('blob:')) return filePath
  return `/api/file?path=${encodeURIComponent(filePath)}`
}

function goBack() {
  if (window.history.length > 1) window.history.back()
  else window.location.href = '/'
}

async function loadBootstrap() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams(window.location.search)
    const ids = params.get('ids') || ''
    const result = await api(`/api/video-editor-bootstrap?ids=${encodeURIComponent(ids)}`)
    initialVideoPaths.value = Array.isArray(result?.videoPaths) ? result.videoPaths : []
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

async function loadVideoLibrary() {
  const result = await api(`/api/video-editor-library?search=${encodeURIComponent(videoSearch.value || '')}`)
  picker.items = Array.isArray(result?.items) ? result.items : []
}

function buildBreadcrumbs(currentPath) {
  if (!currentPath) return [{ label: 'Roots', path: '' }]
  const normalized = currentPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const breadcrumbs = [{ label: 'Roots', path: '' }]
  let cursor = normalized.startsWith('/') ? '' : segments.shift() || ''

  if (cursor) breadcrumbs.push({ label: cursor, path: cursor })
  for (const segment of segments) {
    cursor = `${cursor}/${segment}`.replace(/\/+/g, '/')
    breadcrumbs.push({ label: segment, path: normalized.startsWith('/') ? `/${cursor.replace(/^\//, '')}` : cursor })
  }
  return breadcrumbs
}

async function openBrowserPath(nextPath = '') {
  const result = await api(`/api/video-editor-browse?kind=audio&path=${encodeURIComponent(nextPath)}`)
  picker.directories = Array.isArray(result?.directories) ? result.directories : []
  picker.files = Array.isArray(result?.files) ? result.files : []
  picker.breadcrumbs = buildBreadcrumbs(result?.currentPath || '')
}

function openPicker(type) {
  return new Promise(async (resolve, reject) => {
    picker.open = true
    picker.type = type
    picker.selected = []
    picker.resolver = resolve
    picker.rejecter = reject
    picker.items = []
    picker.directories = []
    picker.files = []
    picker.breadcrumbs = [{ label: 'Roots', path: '' }]

    try {
      if (type === 'video') await loadVideoLibrary()
      else await openBrowserPath('')
    } catch (err) {
      cancelPicker(err)
    }
  })
}

function cleanupPicker() {
  picker.open = false
  picker.selected = []
  picker.items = []
  picker.directories = []
  picker.files = []
  picker.breadcrumbs = [{ label: 'Roots', path: '' }]
  picker.resolver = null
  picker.rejecter = null
}

function cancelPicker(reason) {
  if (picker.rejecter) picker.rejecter(reason || new Error('Selection cancelled.'))
  cleanupPicker()
}

function confirmPicker() {
  if (picker.resolver) picker.resolver({ paths: [...picker.selected] })
  cleanupPicker()
}

function handleSaved() {
  // Keep the editor open after save, matching desktop behavior.
}

onMounted(async () => {
  window.plutoVideoEditorBridge = {
    composeVideo(payload) {
      return postApi('/api/compose-video', payload)
    },
    getVideoClipThumbnail(payload) {
      return postApi('/api/video-editor-thumbnail', payload)
    },
    selectVideoFiles() {
      return openPicker('video')
    },
    selectAudioFiles() {
      return openPicker('audio')
    },
    selectWatermarkImage() {
      return { path: null }
    },
    selectLutFile() {
      return { path: null }
    },
    getBuiltinLuts() {
      return []
    },
    toMediaUrl(filePath) {
      return mediaUrlForPath(filePath)
    },
  }

  await loadBootstrap()
})

onBeforeUnmount(() => {
  delete window.plutoVideoEditorBridge
})
</script>

<style scoped>
.video-editor-web-shell {
  min-height: 100vh;
  background: #050510;
}

.video-editor-web-state {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #c0c8e0;
}

.video-editor-web-state strong {
  font-size: 22px;
  color: #fff;
}

.video-editor-web-state.error strong {
  color: #ff7b8c;
}

.video-editor-web-state button,
.picker-footer button,
.picker-toolbar button,
.picker-breadcrumbs button,
.picker-browser-row {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border-radius: 10px;
  cursor: pointer;
}

.video-editor-web-state button,
.picker-footer button,
.picker-toolbar button,
.picker-breadcrumbs button {
  padding: 10px 14px;
}

.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.76);
  backdrop-filter: blur(5px);
}

.picker-panel {
  width: min(960px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #0a0f1e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  overflow: hidden;
  color: #c0c8e0;
}

.picker-header,
.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.03);
}

.picker-header h2 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.picker-header p {
  margin: 4px 0 0;
  font-size: 12px;
}

.picker-close {
  padding: 6px 10px;
  font-size: 20px;
}

.picker-body {
  padding: 18px 20px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.picker-toolbar {
  display: flex;
  gap: 10px;
}

.picker-toolbar input {
  flex: 1;
  padding: 11px 13px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-item,
.picker-browser-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.picker-item img {
  width: 112px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}

.picker-item span,
.picker-browser-row span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.picker-item strong,
.picker-browser-row strong {
  color: #fff;
  word-break: break-word;
}

.picker-item small,
.picker-browser-row small {
  color: #8ea0c4;
  word-break: break-word;
}

.browser-file-row {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.picker-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.picker-empty {
  padding: 24px;
  text-align: center;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
}

.picker-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.picker-footer > div {
  display: flex;
  gap: 10px;
}

.picker-footer .primary {
  background: #00f0ff;
  color: #000;
  border-color: #00f0ff;
}

@media (max-width: 640px) {
  .picker-panel {
    width: 100vw;
    height: 100vh;
    max-height: none;
    border-radius: 0;
  }

  .picker-toolbar,
  .picker-footer,
  .picker-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>