<template>
  <Teleport to="body">
    <div class="smart-album-overlay" @click.self="$emit('close')">
      <div class="smart-album-panel">
        <div class="panel-header">
          <h2>{{ editing ? 'Edit Smart Album' : 'Create Smart Album' }}</h2>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>

        <div class="panel-body">
          <div class="field">
            <label>Album Name</label>
            <input v-model="albumName" class="modern-input" placeholder="My Smart Album" />
          </div>

          <div class="field">
            <label>Icon</label>
            <div class="icon-picker">
              <button v-for="ic in iconOptions" :key="ic.id" class="icon-btn" :class="{ active: albumIcon === ic.id }" @click="albumIcon = ic.id">
                <component :is="ic.component" :size="18" />
              </button>
            </div>
          </div>

          <div class="rules-section">
            <div class="rules-header">
              <label>Rules</label>
              <span class="match-label">Match <strong>{{ matchAll ? 'ALL' : 'ANY' }}</strong> of the following</span>
              <button class="toggle-btn" @click="matchAll = !matchAll">Toggle</button>
            </div>

            <div v-for="(rule, idx) in rules" :key="idx" class="rule-row">
              <select v-model="rule.type" class="modern-select rule-type" @change="resetRuleValue(rule)">
                <option value="file_type">File Type</option>
                <option value="rating_gte">Rating ≥</option>
                <option value="rating_eq">Rating =</option>
                <option value="color_label">Color Label</option>
                <option value="tag">Has Tag</option>
                <option value="date_after">Date After</option>
                <option value="date_before">Date Before</option>
                <option value="has_gps">Has Location</option>
                <option value="has_faces">Has Faces</option>
                <option value="name_contains">Name Contains</option>
                <option value="context_contains">Context Contains</option>
              </select>

              <template v-if="rule.type === 'file_type'">
                <select v-model="rule.value" class="modern-select" @change="onFileTypeChange(rule)">
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                  <option value="gif">GIFs</option>
                  <option value="pdf">PDFs</option>
                  <option value="psd">PSDs</option>
                  <option value="custom">Custom Extension</option>
                </select>
                <input
                  v-if="rule.value === 'custom'"
                  v-model="rule.customExt"
                  class="modern-input custom-ext-input"
                  placeholder="e.g. tiff, heic, svg"
                />
              </template>

              <template v-else-if="rule.type === 'rating_gte' || rule.type === 'rating_eq'">
                <select v-model.number="rule.value" class="modern-select">
                  <option v-for="r in 5" :key="r" :value="r">{{ r }} Star{{ r > 1 ? 's' : '' }}</option>
                </select>
              </template>

              <template v-else-if="rule.type === 'color_label'">
                <select v-model="rule.value" class="modern-select">
                  <option value="red">Red</option>
                  <option value="yellow">Yellow</option>
                  <option value="green">Green</option>
                  <option value="blue">Blue</option>
                  <option value="purple">Purple</option>
                </select>
              </template>

              <template v-else-if="rule.type === 'tag'">
                <input v-model="rule.value" class="modern-input" placeholder="Tag name" />
              </template>

              <template v-else-if="rule.type === 'date_after' || rule.type === 'date_before'">
                <input v-model="rule.value" type="date" class="modern-input" />
              </template>

              <template v-else-if="rule.type === 'has_faces'">
                <select v-model="rule.value" class="modern-select">
                  <option value="any">Any Person</option>
                  <option v-for="p in peopleList" :key="p.id" :value="p.id">{{ p.name || `Person #${p.id}` }}</option>
                </select>
              </template>

              <template v-else-if="rule.type === 'has_gps'">
                <select v-model="rule.value" class="modern-select">
                  <option value="any">Any Location</option>
                  <option v-for="loc in locationList" :key="loc" :value="loc">{{ loc }}</option>
                </select>
              </template>

              <template v-else-if="rule.type === 'name_contains'">
                <input v-model="rule.value" class="modern-input" placeholder="Search text..." />
              </template>

              <template v-else-if="rule.type === 'context_contains'">
                <input v-model="rule.value" class="modern-input" placeholder="e.g. cat, sunset, mountain..." />
              </template>

              <button class="btn-remove-rule" @click="rules.splice(idx, 1)">✕</button>
            </div>

            <button class="btn-add-rule" @click="addRule">+ Add Rule</button>
          </div>

          <div v-if="previewCount !== null" class="preview-count">
            {{ previewCount }} matching photos
          </div>
        </div>

        <div class="panel-footer">
          <button class="action-btn" @click="previewAlbum">Preview</button>
          <button class="action-btn primary" :disabled="!albumName.trim() || rules.length === 0" @click="saveAlbum">
            {{ editing ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// @ts-nocheck
import { ref, reactive, onMounted } from 'vue'
import { Search, Star, Image as ImageIcon, Film, Camera, Heart, MapPin, Calendar, Globe, User } from 'lucide-vue-next'

const props = defineProps({
  album: { type: Object, default: null },
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'saved'])

const editing = !!props.album
const albumName = ref(props.album?.name || '')
const albumIcon = ref(props.album?.icon || 'search')
const matchAll = ref(props.album?.matchAll !== false)
const rules = reactive(props.album?.rules ? JSON.parse(JSON.stringify(props.album.rules)) : [])
const previewCount = ref(null)

const iconOptions = [
  { id: 'search', component: Search },
  { id: 'star', component: Star },
  { id: 'image', component: ImageIcon },
  { id: 'film', component: Film },
  { id: 'camera', component: Camera },
  { id: 'heart', component: Heart },
  { id: 'map-pin', component: MapPin },
  { id: 'calendar', component: Calendar },
  { id: 'globe', component: Globe },
  { id: 'user', component: User }
]

const peopleList = ref([])
const locationList = ref([])

const loadPeopleAndLocations = async () => {
  try { peopleList.value = await window.electron.ipcRenderer.invoke('get-people') } catch {}
  try { locationList.value = await window.electron.ipcRenderer.invoke('get-distinct-locations') } catch { locationList.value = [] }
}

onMounted(() => {
  loadPeopleAndLocations()
})

const addRule = () => {
  rules.push({ type: 'rating_gte', value: 3 })
}

const resetRuleValue = (rule) => {
  if (rule.type === 'has_gps') rule.value = 'any'
  else if (rule.type === 'has_faces') rule.value = 'any'
  else if (rule.type === 'rating_gte' || rule.type === 'rating_eq') rule.value = 3
  else if (rule.type === 'color_label') rule.value = 'red'
  else if (rule.type === 'file_type') { rule.value = 'image'; rule.customExt = '' }
  else rule.value = ''
}

const onFileTypeChange = (rule) => {
  if (rule.value !== 'custom') rule.customExt = ''
}

const previewAlbum = async () => {
  try {
    const result = await window.electron.ipcRenderer.invoke('query-smart-album', {
      rules: JSON.parse(JSON.stringify(rules)),
      matchAll: matchAll.value
    })
    previewCount.value = result.length
  } catch { previewCount.value = 0 }
}

const saveAlbum = async () => {
  const data = {
    name: albumName.value.trim(),
    rules: JSON.parse(JSON.stringify(rules)),
    matchAll: matchAll.value,
    icon: albumIcon.value
  }
  if (editing && props.album?.id) {
    await window.electron.ipcRenderer.invoke('update-smart-album', { id: props.album.id, ...data })
  } else {
    await window.electron.ipcRenderer.invoke('create-smart-album', data)
  }
  emit('saved')
  emit('close')
}
</script>

<style scoped>
.smart-album-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.smart-album-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 540px; max-height: 85vh; overflow-y: auto; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.panel-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
.field label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; display: block; margin-bottom: 8px; }
.modern-input { width: 100%; background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 10px 12px; color: #f5f5f7; font-size: 13px; box-sizing: border-box; transition: border-color 0.2s ease; }
.modern-input:focus { border-color: #0071e3; outline: none; }
.modern-select { background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 8px 12px; color: #f5f5f7; font-size: 13px; transition: border-color 0.2s ease; }
.modern-select:focus { border-color: #0071e3; outline: none; }
.icon-picker { display: flex; gap: 6px; flex-wrap: wrap; }
.icon-btn { width: 40px; height: 40px; border-radius: 8px; border: 2px solid transparent; background: #2a2a2c; font-size: 18px; cursor: pointer; display: grid; place-items: center; color: #ccc; transition: all 0.15s ease; }
.icon-btn:hover { background: #333; color: #f5f5f7; }
.icon-btn.active { border-color: #0071e3; background: rgba(0,113,227,0.15); color: #4da3ff; }
.rules-section { display: flex; flex-direction: column; gap: 10px; }
.rules-header { display: flex; align-items: center; gap: 8px; }
.rules-header label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #86868b; margin: 0; }
.match-label { font-size: 11px; color: #86868b; flex: 1; }
.toggle-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 6px; padding: 3px 10px; color: #aaa; font-size: 11px; cursor: pointer; transition: all 0.15s ease; }
.toggle-btn:hover { background: #333; color: #ddd; border-color: #555; }
.rule-row { display: flex; align-items: center; gap: 8px; }
.rule-type { min-width: 130px; }
.rule-auto { font-size: 12px; color: #555; font-style: italic; }
.custom-ext-input { max-width: 160px; flex-shrink: 0; }
.btn-remove-rule { background: none; border: none; color: #ff453a; font-size: 16px; cursor: pointer; padding: 4px; }
.btn-add-rule { background: #2a2a2c; border: 1px dashed #444; border-radius: 8px; padding: 10px; color: #86868b; font-size: 13px; cursor: pointer; text-align: center; }
.btn-add-rule:hover { border-color: #0071e3; color: #0071e3; }
.preview-count { font-size: 13px; color: #0071e3; font-weight: 500; text-align: center; padding: 8px; background: rgba(0,113,227,0.08); border-radius: 8px; }
.panel-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06); }
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 10px 20px; color: #f5f5f7; font-size: 13px; cursor: pointer; }
.action-btn:hover { background: #333; }
.action-btn.primary { background: #0071e3; border-color: #0071e3; }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
