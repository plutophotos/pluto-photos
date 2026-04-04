<template>
  <div class="tag-rating-panel" v-if="imagePath">
    <!-- Star Rating -->
    <div class="panel-section">
      <label class="section-label">Rating</label>
      <div class="star-row">
        <button 
          v-for="s in 5" :key="s"
          class="star-btn" 
          :class="{ active: s <= rating, 'pro-locked': isLocked('rating') }"
          @click="setRating(s)"
          :title="isLocked('rating') ? 'Pro feature' : `${s} star${s > 1 ? 's' : ''}`"
        >★</button>
        <button class="clear-btn" @click="setRating(0)" v-if="rating > 0" title="Clear rating">✕</button>
      </div>
    </div>

    <!-- Color Labels -->
    <div class="panel-section">
      <label class="section-label">Label</label>
      <div class="color-row">
        <button 
          v-for="c in colors" :key="c.value"
          class="color-dot" 
          :class="{ active: colorLabel === c.value }"
          :style="{ background: c.hex }"
          @click="setColor(c.value)"
          :title="c.name"
        ></button>
        <button class="clear-btn" @click="setColor('')" v-if="colorLabel" title="Clear label">✕</button>
      </div>
    </div>

    <!-- AI Context Description -->
    <div class="panel-section" v-if="captions || captionLoading">
      <div class="section-label-row">
        <label class="section-label">AI Context</label>
        <button class="refresh-btn" @click="regenerateCaption" :disabled="captionLoading" title="Regenerate AI context">
          <svg :class="{ spinning: captionLoading }" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2 11.5a10 10 0 0 1 18.8-4.3"/><path d="M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        </button>
      </div>
      <p class="caption-text" v-if="captionLoading">Regenerating...</p>
      <p class="caption-text" v-else>{{ captions }}</p>
    </div>

    <!-- Tags -->
    <div class="panel-section">
      <label class="section-label">Tags</label>
      <div class="tags-list">
        <span v-for="tag in tags" :key="tag" class="tag-chip">
          {{ tag }}
          <button class="tag-remove" @click="removeTag(tag)">✕</button>
        </span>
      </div>
      <div class="tag-input-row">
        <input 
          v-model="newTag" 
          class="tag-input" 
          placeholder="Add tag..." 
          @keydown.enter="addTag"
          list="tag-suggestions"
        />
        <button class="tag-add-btn" @click="addTag" :disabled="!newTag.trim()" title="Add tag">+</button>
        <datalist id="tag-suggestions">
          <option v-for="t in allTags" :key="t.tag" :value="t.tag">{{ t.tag }} ({{ t.count }})</option>
        </datalist>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  imagePath: String,
  tier: { type: String, default: 'free' } // 'free', 'beginner', 'pro'
})

const emit = defineEmits(['updated'])

const rating = ref(0)
const colorLabel = ref('')
const tags = ref([])
const captions = ref(null)
const imageId = ref(null)
const captionLoading = ref(false)
const newTag = ref('')
const allTags = ref([])

const colors = [
  { value: 'red', hex: '#ff453a', name: 'Red' },
  { value: 'yellow', hex: '#ffd60a', name: 'Yellow' },
  { value: 'green', hex: '#30d158', name: 'Green' },
  { value: 'blue', hex: '#0a84ff', name: 'Blue' },
  { value: 'purple', hex: '#bf5af2', name: 'Purple' }
]

const isLocked = (feature) => {
  // Dynamic licensing check — currently everything is unlocked
  // When licensing is implemented, check props.tier here:
  // if (feature === 'rating' && props.tier === 'free') return true;
  return false
}

const loadDetails = async () => {
  if (!props.imagePath) return
  try {
    const details = await window.electron.ipcRenderer.invoke('get-image-details', props.imagePath)
    if (details) {
      rating.value = details.rating || 0
      colorLabel.value = details.color_label || ''
      tags.value = details.tags || []
      captions.value = details.captions || null
      imageId.value = details.id || null
    }
  } catch {}
}

const loadAllTags = async () => {
  try { allTags.value = await window.electron.ipcRenderer.invoke('get-all-tags') } catch {}
}

const setRating = async (val) => {
  if (isLocked('rating')) return
  rating.value = val
  await window.electron.ipcRenderer.invoke('set-image-rating', { imagePath: props.imagePath, rating: val })
  emit('updated')
}

const setColor = async (val) => {
  colorLabel.value = val
  await window.electron.ipcRenderer.invoke('set-image-color-label', { imagePath: props.imagePath, color: val })
  emit('updated')
}

const addTag = async () => {
  const tag = newTag.value.trim()
  if (!tag || tags.value.includes(tag)) { newTag.value = ''; return }
  await window.electron.ipcRenderer.invoke('add-image-tag', { imagePath: props.imagePath, tag })
  tags.value.push(tag)
  newTag.value = ''
  loadAllTags()
  emit('updated')
}

const regenerateCaption = async () => {
  if (!imageId.value || !props.imagePath || captionLoading.value) return
  captionLoading.value = true
  try {
    const result = await window.electron.ipcRenderer.invoke('caption-image', {
      imageId: imageId.value,
      imagePath: props.imagePath,
      regenerate: true,
      currentCaption: captions.value || ''
    })
    if (result?.captions) {
      captions.value = result.captions
    } else {
      // Reload details to pick up the new caption
      await loadDetails()
    }
  } catch (err) {
    console.error('Failed to regenerate caption:', err)
  } finally {
    captionLoading.value = false
  }
  emit('updated')
}

const removeTag = async (tag) => {
  await window.electron.ipcRenderer.invoke('remove-image-tag', { imagePath: props.imagePath, tag })
  tags.value = tags.value.filter(t => t !== tag)
  emit('updated')
}

watch(() => props.imagePath, loadDetails)
onMounted(() => { loadDetails(); loadAllTags() })
</script>

<style scoped>
.tag-rating-panel { display: flex; flex-direction: column; gap: 16px; padding: 0; }
.panel-section { display: flex; flex-direction: column; gap: 6px; }
.section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #86868b; }
.section-label-row { display: flex; align-items: center; justify-content: space-between; }
.refresh-btn { background: none; border: none; color: #86868b; cursor: pointer; padding: 2px; border-radius: 4px; display: grid; place-items: center; transition: color 0.2s, background 0.2s; }
.refresh-btn:hover:not(:disabled) { color: #f5a623; background: rgba(245, 166, 35, 0.1); }
.refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.refresh-btn .spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.star-row { display: flex; align-items: center; gap: 4px; }
.star-btn { background: none; border: none; font-size: 20px; color: #333; cursor: pointer; padding: 2px; transition: color 0.15s; }
.star-btn.active { color: #ffd60a; }
.star-btn:hover { color: #ffd60a; }
.star-btn.pro-locked { opacity: 0.3; cursor: not-allowed; }
.clear-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 11px; padding: 2px 6px; }
.color-row { display: flex; align-items: center; gap: 8px; }
.color-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform 0.15s; }
.color-dot:hover { transform: scale(1.3); box-shadow: 0 0 0 2px rgba(255,255,255,0.15); }
.color-dot.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.3); }
.tags-list { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-chip { display: inline-flex; align-items: center; gap: 4px; background: #2a2a2c; padding: 4px 10px; border-radius: 12px; font-size: 12px; color: #ddd; }
.tag-remove { background: none; border: none; color: #888; cursor: pointer; font-size: 10px; padding: 0; }
.captions-list { display: flex; flex-wrap: wrap; gap: 5px; }
.caption-chip { display: inline-flex; align-items: center; background: rgba(245, 166, 35, 0.12); padding: 3px 9px; border-radius: 10px; font-size: 11px; color: #f5a623; border: 1px solid rgba(245, 166, 35, 0.2); }
.caption-text { margin: 0; font-size: 12px; color: #f5a623; background: rgba(245, 166, 35, 0.08); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(245, 166, 35, 0.15); line-height: 1.4; text-transform: capitalize; }
.tag-input-row { display: flex; gap: 6px; }
.tag-input { flex: 1; background: #1e1e1f; border: 1px solid #333; border-radius: 8px; padding: 6px 10px; color: #f5f5f7; font-size: 12px; outline: none; }
.tag-input:focus { border-color: #0071e3; }
.tag-add-btn { background: #0071e3; border: none; color: #fff; width: 28px; height: 28px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; display: grid; place-items: center; flex-shrink: 0; }
.tag-add-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tag-add-btn:hover:not(:disabled) { background: #0077ed; }

[data-theme="light"] .star-btn { color: #d1d1d6; }
[data-theme="light"] .star-btn.active { color: #ffd60a; }
[data-theme="light"] .star-btn:hover { color: #ffd60a; }
[data-theme="light"] .color-dot.active { border-color: #1d1d1f; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.2); }
[data-theme="light"] .tag-chip { background: #e8e8ed; color: #1d1d1f; }
[data-theme="light"] .caption-chip { background: rgba(245, 166, 35, 0.1); color: #b87d1a; border-color: rgba(245, 166, 35, 0.25); }
[data-theme="light"] .caption-text { color: #b87d1a; background: rgba(245, 166, 35, 0.06); border-color: rgba(245, 166, 35, 0.2); }
[data-theme="light"] .tag-input { background: #f5f5f7; border-color: #d1d1d6; color: #1d1d1f; }
[data-theme="light"] .section-label { color: #86868b; }
[data-theme="light"] .refresh-btn { color: #86868b; }
[data-theme="light"] .refresh-btn:hover:not(:disabled) { color: #b87d1a; background: rgba(245, 166, 35, 0.08); }

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .star-btn { color: rgba(0, 240, 255, 0.25); }
[data-theme="futuristic"] .star-btn.active { color: #00f0ff; text-shadow: 0 0 6px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .star-btn:hover { color: #00f0ff; text-shadow: 0 0 6px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .color-dot.active { border-color: #00f0ff; box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.3), 0 0 8px rgba(0, 240, 255, 0.2); }
[data-theme="futuristic"] .tag-chip { background: rgba(0, 240, 255, 0.08); color: #c0c8e0; border: 1px solid rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .caption-chip { background: rgba(168, 85, 247, 0.1); color: #c78dfa; border-color: rgba(168, 85, 247, 0.2); }
[data-theme="futuristic"] .caption-text { color: #c78dfa; background: rgba(168, 85, 247, 0.06); border-color: rgba(168, 85, 247, 0.15); }
[data-theme="futuristic"] .tag-input { background: #111827; border-color: rgba(0, 240, 255, 0.12); color: #e0e6ff; }
[data-theme="futuristic"] .tag-input:focus { border-color: #00f0ff; box-shadow: 0 0 8px rgba(0, 240, 255, 0.15); }
[data-theme="futuristic"] .tag-add-btn { background: linear-gradient(135deg, #00f0ff, #a855f7); }
[data-theme="futuristic"] .tag-add-btn:hover:not(:disabled) { background: linear-gradient(135deg, #33f3ff, #b86cf8); box-shadow: 0 0 12px rgba(0, 240, 255, 0.3); }
[data-theme="futuristic"] .section-label { color: #a855f7; }
[data-theme="futuristic"] .refresh-btn { color: #a855f7; }
[data-theme="futuristic"] .refresh-btn:hover:not(:disabled) { color: #00f0ff; background: rgba(0, 240, 255, 0.08); }
</style>
