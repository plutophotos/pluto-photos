<template>
  <header class="gallery-header" @click.stop>
    <!-- Row 1: Title, search, sort, scale -->
    <div class="header-row top-row">
      <div class="header-left">
        <h1 class="view-title">{{ title }}</h1>
        <p class="item-count">
          {{ totalCount }} {{ t('itemsTotal') }}
          <span v-if="selectedCount > 0" class="selection-tag">{{ selectedCount }} {{ t('selected') }}</span>
        </p>
      </div>

      <div class="header-controls">
        <div class="input-wrapper">
          <Search class="search-icon" :size="14" />
          <input 
            type="text" 
            class="modern-input"
            :placeholder="t('searchFiles')" 
            @input="$emit('search', $event.target.value)"
          />
        </div>

        <select class="modern-select" @change="$emit('sort-change', $event.target.value)">
          <option value="date_taken-DESC">{{ t('dateNewest') }}</option>
          <option value="date_taken-ASC">{{ t('dateOldest') }}</option>
          <option value="name-ASC">{{ t('nameAZ') }}</option>
          <option value="name-DESC">{{ t('nameZA') }}</option>
        </select>

      </div>

      <div class="slider-wrapper">
        <span class="slider-label">Thumbnail Size</span>
        <input 
          type="range" 
          min="120" 
          max="400" 
          step="10"
          :value="currentScale"
          class="modern-slider"
          @input="$emit('update-scale', $event.target.value)"
        />
      </div>
    </div>

    <hr class="header-hr" />

    <!-- Row 2: Feature toolbar -->
    <div class="header-row toolbar-row">
      <div class="toolbar">
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-smart-album')" title="Smart Albums">
          <Sparkles :size="15" />
          <span class="tool-label">Smart Albums</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-people')" title="People">
          <Users :size="15" />
          <span class="tool-label">Faces</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-map')" title="Map View">
          <MapPin :size="15" />
          <span class="tool-label">Map</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-duplicates')" title="Find Duplicates">
          <Copy :size="15" />
          <span class="tool-label">Duplicates</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-cloud-import')" title="Cloud Import">
          <CloudDownload :size="15" />
          <span class="tool-label">Cloud</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-context-search')" title="Contextual Search — find photos by what's in them">
          <Sparkles :size="15" />
          <span class="tool-label">Context</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <button class="tool-btn" :class="{ locked: licenseTier !== 'pro' }" @click.stop="$emit('open-video-editor')" title="Video Editor">
          <Film :size="15" />
          <span class="tool-label">Video Editor</span>
          <span v-if="licenseTier !== 'pro'" class="pro-pip">PRO</span>
        </button>
        <span class="toolbar-sep"></span>
        <button class="tool-btn" @click.stop="$emit('start-slideshow')" title="Slideshow">
          <Play :size="15" />
          <span class="tool-label">Slideshow</span>
        </button>
        <button class="tool-btn" @click.stop="$emit('open-settings')" title="Settings">
          <Settings :size="15" />
          <span class="tool-label">Settings</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useI18n } from '../useI18n'
import { Search, Sparkles, Users, MapPin, Copy, CloudDownload, Play, Settings, Film } from 'lucide-vue-next'

const { t } = useI18n()

defineProps({
  title: String,
  totalCount: Number,
  selectedCount: Number,
  currentScale: { type: Number, default: 200 },
  licenseTier: { type: String, default: 'free' }
})

defineEmits(['sort-change', 'search', 'update-scale', 'open-settings', 'open-smart-album', 'open-people', 'open-map', 'open-duplicates', 'open-cloud-import', 'open-context-search', 'start-slideshow', 'open-video-editor'])
</script>

<style scoped>
.gallery-header {
  --bg-main: #0d0d0d;
  --bg-surface: #1e1e1f;
  --text-primary: #f5f5f7;
  --text-secondary: #86868b;
  --accent-blue: #0071e3;
  --border-subtle: rgba(255, 255, 255, 0.08);

  display: flex;
  flex-direction: column;
  background: var(--bg-main);
  color: var(--text-primary);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  z-index: 10;
}

/* Shared row */
.header-row {
  display: flex;
  align-items: center;
  padding: 0 16px;
}

/* ── Row 1: Title + Controls ── */
.top-row {
  gap: 8px 12px;
  padding-top: 10px;
  padding-bottom: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-grow: 1;
  overflow: hidden;
}

.view-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-count {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
}

.selection-tag {
  display: inline-block;
  background: var(--accent-blue);
  color: white;
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  margin-left: 6px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: center;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 180px;
  flex-shrink: 1;
  min-width: 100px;
}

.search-icon {
  position: absolute;
  left: 10px;
  pointer-events: none;
  opacity: 0.4;
  color: var(--text-secondary);
}

.modern-input {
  background: var(--bg-surface);
  color: #fff;
  border: 1px solid var(--border-subtle);
  padding: 6px 10px 6px 30px;
  border-radius: 8px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}
.modern-input:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.2);
}

.modern-select {
  background: var(--bg-surface);
  color: #ccc;
  border: 1px solid var(--border-subtle);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.modern-select:hover { border-color: rgba(255, 255, 255, 0.15); }
.modern-select:focus { border-color: var(--accent-blue, #0071e3); box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.2); outline: none; }

.slider-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 0 100%;
}

.slider-label {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.modern-slider {
  width: 80px;
  height: 4px;
  appearance: none;
  background: var(--bg-surface);
  border-radius: 2px;
  accent-color: var(--accent-blue);
}

.header-hr {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 6px 16px;
}

/* ── Row 2: Toolbar ── */
.toolbar-row {
  padding-top: 2px;
  padding-bottom: 6px;
  justify-content: center;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 1px;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border-subtle);
  margin: 0 6px;
  flex-shrink: 0;
}

.tool-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.tool-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}
.tool-btn:active {
  background: rgba(255, 255, 255, 0.1);
  transform: scale(0.96);
}

.tool-btn.locked {
  opacity: 0.4;
}
.tool-btn.locked:hover {
  opacity: 0.6;
}

.tool-label {
  font-weight: 500;
  letter-spacing: 0.01em;
}

.pro-pip {
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(191, 90, 242, 0.2);
  color: #bf5af2;
  line-height: 1.3;
  position: absolute;
  top: -1px;
  right: -1px;
}

/* ── Responsive ── */
@media (max-width: 800px) {
  .tool-label { display: none; }
  .tool-btn { padding: 6px 8px; }
  .input-wrapper { width: 140px; }
  .slider-label { display: none; }
}

@media (max-width: 600px) {
  .header-controls { flex-wrap: wrap; justify-content: center; }
  .input-wrapper { flex: 1; width: auto; min-width: 100px; }
  .slider-wrapper { flex-basis: 100%; justify-content: center; }
  .item-count { font-size: 11px; }
}
</style>

<!-- Light theme overrides (unscoped so data-theme on <html> works) -->
<style>
[data-theme="light"] .gallery-header {
  --bg-main: #f9f9fb;
  --bg-surface: #e8e8ed;
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --border-subtle: rgba(0, 0, 0, 0.08);
}
[data-theme="light"] .gallery-header .modern-input,
[data-theme="light"] .gallery-header .modern-select {
  background: #e8e8ed;
  color: #1d1d1f;
  border-color: rgba(0, 0, 0, 0.1);
}
[data-theme="light"] .gallery-header .modern-slider {
  background: #d1d1d6;
}
[data-theme="light"] .gallery-header .tool-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .gallery-header {
  --bg-main: #0a0f1e;
  --bg-surface: #111827;
  --text-primary: #e0e6ff;
  --text-secondary: #a0a8c8;
  --border-subtle: rgba(0, 240, 255, 0.1);
}
[data-theme="futuristic"] .gallery-header .modern-input,
[data-theme="futuristic"] .gallery-header .modern-select {
  background: #111827;
  color: #e0e6ff;
  border-color: rgba(0, 240, 255, 0.12);
}
[data-theme="futuristic"] .gallery-header .modern-input:focus,
[data-theme="futuristic"] .gallery-header .modern-select:focus {
  border-color: #00f0ff;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.15);
}
[data-theme="futuristic"] .gallery-header .modern-slider {
  background: rgba(0, 240, 255, 0.12);
}
[data-theme="futuristic"] .gallery-header .tool-btn:hover {
  background: rgba(0, 240, 255, 0.08);
  color: #00f0ff;
}
</style>