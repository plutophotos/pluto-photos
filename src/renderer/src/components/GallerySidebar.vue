<template>
  <aside class="gallery-sidebar" @click.stop>
    <div class="sidebar-section header-area">
      <!-- Default state: nothing selected -->
      <div v-if="selectedCount === 0" class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <h2 class="empty-title">No Selection</h2>
        <p class="empty-hint">Click a photo to see its details</p>
        <div class="empty-stats" v-if="totalCount > 0">
          <div class="stat-row">
            <span class="stat-val">{{ totalCount.toLocaleString() }}</span>
            <span class="stat-label">{{ totalCount === 1 ? 'item' : 'items' }} in view</span>
          </div>
        </div>
        <div class="empty-tips">
          <p class="tip">💡 Hold <kbd>Ctrl</kbd> to select individually</p>
          <p class="tip">💡 Hold <kbd>Shift</kbd> to batch select a range</p>
          <p class="tip">💡 Double-click to open in viewer</p>
        </div>

        <!-- Free Trial CTA -->
        <div v-if="showTrialOffer" class="trial-cta-card">
          <div class="trial-cta-glow"></div>
          <div class="trial-cta-content">
            <div class="trial-cta-icon">🚀</div>
            <h3 class="trial-cta-title">Try Pro Free for 30 Days</h3>
            <p class="trial-cta-sub">Unlock all features — no credit card required.</p>
            <div class="trial-cta-features">
              <span v-for="feat in trialFeatures" :key="feat" class="trial-cta-feat">✓ {{ feat }}</span>
            </div>
            <form class="trial-cta-form" @submit.prevent="handleStartTrial" v-if="!trialSuccess">
              <input
                type="email"
                v-model="trialEmail"
                placeholder="Enter your email"
                required
                class="trial-cta-input"
                :disabled="trialLoading"
              />
              <button type="submit" class="trial-cta-btn" :disabled="trialLoading || !trialEmail">
                <span v-if="trialLoading" class="trial-cta-spinner"></span>
                <span v-else>Start Free Trial</span>
              </button>
            </form>
            <p v-if="trialError" class="trial-cta-error">{{ trialError }}</p>
            <div v-if="trialSuccess" class="trial-cta-success">
              <div class="trial-cta-success-icon">🎉</div>
              <p class="trial-cta-success-msg">Pro trial activated! All features are now unlocked for 30 days.</p>
            </div>
            <p v-if="!trialSuccess" class="trial-cta-fine-print">One free trial per device. We'll email your key too.</p>
          </div>
        </div>

        <div class="license-info-card">
          <div class="license-badge" :class="licenseBadgeClass">
            License: {{ licenseDisplayName }}
          </div>
          <div class="license-details">
            <span v-if="licenseInfo?.trialDaysLeft > 0" class="license-sub">{{ licenseInfo.trialDaysLeft }} days remaining</span>
            <span v-else-if="licenseInfo?.trialExpired" class="license-sub license-expired">Trial expired</span>
          </div>
        </div>
      </div>

      <!-- Single selection -->
      <div v-else-if="selectedCount === 1 && details" class="metadata-container">
        <h2 class="sidebar-label">{{ t('fileDetails') }}</h2>
        <h1 class="selected-name">{{ details.fileName }}</h1>
        
        <div class="metadata-list">
          <div v-for="(val, key) in displayDetails" :key="key" class="meta-row">
            <span class="meta-key">{{ key }}</span> 
            <span class="meta-val">{{ val }}</span>
          </div>
        </div>

        <TagRatingPanel
          :imagePath="selectedRawPath"
          @updated="$emit('metadata-updated')"
        />
      </div>

      <div v-else class="multi-select-info">
        <div class="multi-icon">🖼️</div>
        <h1 class="multi-title">{{ selectedCount }} {{ t('selected') }}</h1>
      </div>
    </div>

    <div class="sidebar-section actions-footer">
      <button 
        v-if="showRemoveButton" 
        class="btn-action btn-outline"
        @click.stop="$emit('remove-from-album')"
      >
        {{ t('removeFromAlbum') }}
      </button>

      <button 
        v-if="selectedCount > 1" 
        class="btn-action btn-batch"
        :class="{ 'btn-locked': licenseTier === 'free' }"
        @click.stop="$emit('open-batch-ops')"
      >
        ⚡ Batch Operations ({{ selectedCount }})
        <span v-if="licenseTier === 'free'" class="lock-label">🔒</span>
      </button>

      <button 
        v-if="selectedCount === 1 && isEditable" 
        class="btn-action btn-edit"
        :class="{ 'btn-locked': licenseTier === 'free' }"
        @click.stop="$emit('open-editor')"
      >
        ✏️ Edit Photo
        <span v-if="licenseTier === 'free'" class="lock-label">🔒</span>
      </button>

      <button 
        v-if="selectedCount === 1 && isTrimmableVideo" 
        class="btn-action btn-edit"
        :class="{ 'btn-locked': licenseTier === 'free' }"
        @click.stop="$emit('open-video-editor')"
      >
        🎬 Edit Video
        <span v-if="licenseTier === 'free'" class="lock-label">🔒</span>
      </button>

      <button 
        v-if="selectedCount === 1" 
        class="btn-action btn-export"
        @click.stop="$emit('export-file')"
      >
        📤 Export File
      </button>
      
      <button 
        v-if="selectedCount > 0" 
        class="btn-action btn-danger" 
        @click.stop="$emit('delete-selected')"
      >
        {{ t('deleteFromDisk') }}
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '../useI18n'
import TagRatingPanel from './TagRatingPanel.vue'

const { t } = useI18n()

const props = defineProps({
  selectedCount: Number,
  totalCount: { type: Number, default: 0 },
  showRemoveButton: Boolean,
  details: Object,
  selectedPath: { type: String, default: '' },
  licenseTier: { type: String, default: 'free' },
  licenseInfo: { type: Object, default: () => ({}) },
  licenseLoaded: { type: Boolean, default: false }
})

const selectedRawPath = computed(() => {
  if (!props.selectedPath) return ''
  return decodeURIComponent(props.selectedPath.replace(/^pluto:\/\//i, ''))
})

const emit = defineEmits(['remove-from-album', 'delete-selected', 'open-batch-ops', 'open-editor', 'open-video-editor', 'export-file', 'metadata-updated', 'license-updated'])

// ── Free Trial ──
const trialEmail = ref('')
const trialLoading = ref(false)
const trialError = ref('')
const trialSuccess = ref(false)

const trialFeatures = ['Smart Albums', 'Face Detection', 'Map View', 'Duplicate Finder', 'Photo Editor', 'Batch Ops']

const showTrialOffer = computed(() => {
  const info = props.licenseInfo
  // Don't show until real license data has loaded (prevents flash)
  if (!props.licenseLoaded) return false
  if (!info) return false
  if (info.trialUsed) return false
  if (info.trialExpired) return false
  if (info.isTrial && info.trialDaysLeft > 0) return false
  if (info.activated && !info.trialExpired) return false
  // Free tier, never used trial → show offer
  return info.tier === 'free'
})

async function handleStartTrial() {
  trialLoading.value = true
  trialError.value = ''
  try {
    const result = await window.electron.ipcRenderer.invoke('start-free-trial', { email: trialEmail.value.trim() })
    if (result.success) {
      trialSuccess.value = true
      emit('license-updated')
    } else {
      trialError.value = result.error || 'Something went wrong. Please try again.'
    }
  } catch (err) {
    trialError.value = 'Unable to reach server. Please try again later.'
  }
  trialLoading.value = false
}

const licenseDisplayName = computed(() => {
  const tier = props.licenseTier
  if (tier === 'pro_trial') return 'Pro Trial'
  if (tier === 'pro') return 'Pro'
  if (tier === 'pro_plus') return 'Pro+'
  return 'Free'
})

const licenseBadgeClass = computed(() => {
  const tier = props.licenseTier
  if (tier === 'free') return 'badge-free'
  if (tier === 'pro_trial') return 'badge-trial'
  return 'badge-pro'
})

const isEditable = computed(() => {
  if (!props.details) return false
  const ext = (props.details.fileName || '').split('.').pop().toLowerCase()
  return /^(jpe?g|png|webp|gif|ico)$/.test(ext)
})

const isTrimmableVideo = computed(() => {
  if (!props.details) return false
  const ext = (props.details.fileName || '').split('.').pop().toLowerCase()
  return /^(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/.test(ext)
})

const displayDetails = computed(() => {
  if (!props.details) return {}
  return {
    [t('type')]: props.details.type,
    [t('size')]: props.details.size,
    [t('dimensions')]: props.details.dimensions,
    [t('date')]: props.details.dateTaken,
    [t('camera')]: props.details.camera,
    [t('fStop')]: props.details.fStop,
    [t('iso')]: props.details.iso,
    [t('exposure')]: props.details.exposure
  }
})
</script>

<style scoped>
.gallery-sidebar {
  --bg-main: #121212;
  --bg-surface: #1e1e1f;
  --text-primary: #f5f5f7;
  --text-secondary: #86868b;
  --accent-blue: #0071e3;
  --accent-orange: #ff9f0a;
  --danger-red: #ff453a;
  --border-subtle: rgba(255, 255, 255, 0.08);

  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 32px 20px;
  background: var(--bg-main);
  color: var(--text-primary);
  font-family: var(--font-sans, 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  overflow-y: auto;
  border-left: 1px solid var(--border-subtle);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 40px;
}

.sidebar-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin: 0;
}

.selected-name {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  margin: 8px 0 16px 0;
  word-break: break-all;
}

.metadata-list {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.meta-key { color: var(--text-secondary); }
.meta-val { color: var(--text-primary); font-weight: 500; text-align: right; }

.multi-select-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
}
.multi-icon { font-size: 32px; opacity: 0.6; }
.multi-title { font-size: 18px; font-weight: 600; margin: 0; }

.actions-footer {
  margin-top: auto;
  gap: 8px;
}

.btn-action {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  transition: all 0.15s ease;
  letter-spacing: 0.01em;
}
.btn-action:hover {
  color: var(--text-primary);
  background: var(--btn-hover-bg, rgba(255, 255, 255, 0.06));
  border-color: var(--btn-hover-border, rgba(255, 255, 255, 0.14));
}
.btn-action:active {
  transform: scale(0.98);
}

.btn-outline {
  background: transparent;
  color: var(--accent-orange);
  border-color: rgba(255, 159, 10, 0.25);
}
.btn-outline:hover {
  background: rgba(255, 159, 10, 0.08);
  border-color: rgba(255, 159, 10, 0.4);
  color: var(--accent-orange);
}

.btn-danger {
  background: transparent;
  color: var(--danger-red);
  border-color: rgba(255, 69, 58, 0.2);
}
.btn-danger:hover {
  background: rgba(255, 69, 58, 0.1);
  border-color: rgba(255, 69, 58, 0.4);
  color: var(--danger-red);
}

.btn-batch {
  background: rgba(0, 113, 227, 0.06);
  color: var(--accent-blue);
  border-color: rgba(0, 113, 227, 0.15);
}
.btn-batch:hover {
  background: rgba(0, 113, 227, 0.12);
  border-color: rgba(0, 113, 227, 0.3);
  color: var(--accent-blue);
}

.btn-edit {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.btn-edit:hover { color: var(--text-primary); }

.btn-export {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.btn-export:hover { color: var(--text-primary); }

.btn-locked { opacity: 0.45; position: relative; }
.btn-locked:hover { opacity: 0.6; }
.lock-label { margin-left: 6px; font-size: 12px; }

.empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px 8px; gap: 4px; }
.empty-icon { color: var(--text-secondary); opacity: 0.3; margin-bottom: 8px; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.empty-hint { font-size: 12px; color: var(--text-secondary); margin: 4px 0 0; }
.empty-stats { background: var(--bg-surface); border-radius: 10px; padding: 14px 20px; margin-top: 20px; width: 100%; }
.stat-row { display: flex; align-items: baseline; gap: 6px; justify-content: center; }
.stat-val { font-size: 22px; font-weight: 700; color: var(--accent-blue); }
.stat-label { font-size: 12px; color: var(--text-secondary); }
.empty-tips { margin-top: 24px; text-align: left; width: 100%; }
.empty-tips .tip { font-size: 11px; color: var(--text-secondary); margin: 8px 0; line-height: 1.5; }
.empty-tips .tip strong { color: var(--text-primary); font-weight: 600; }
.empty-tips kbd { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 1px 5px; font-size: 10px; font-family: inherit; }
.license-info-card { background: var(--bg-surface); border-radius: 10px; padding: 14px 16px; margin-top: 20px; width: 100%; display: flex; align-items: center; gap: 10px; }
.license-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 6px; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; }
.badge-free { background: rgba(255,255,255,0.08); color: var(--text-secondary); }
.badge-trial { background: linear-gradient(135deg, rgba(0,113,227,0.2), rgba(88,86,214,0.2)); color: #6cb4ff; }
.badge-pro { background: linear-gradient(135deg, rgba(0,113,227,0.25), rgba(88,86,214,0.25)); color: #a78bfa; }
.license-details { display: flex; flex-direction: column; }
.license-sub { font-size: 11px; color: var(--text-secondary); }
.license-expired { color: var(--danger-red); }

/* ── Free Trial CTA ── */
.trial-cta-card {
  position: relative;
  width: 100%;
  margin-top: 24px;
  border-radius: 14px;
  border: 1px solid rgba(168, 85, 247, 0.25);
  background: var(--bg-surface);
  overflow: hidden;
}
.trial-cta-glow {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 100px;
  background: radial-gradient(ellipse, rgba(168, 85, 247, 0.2), transparent 70%);
  pointer-events: none;
}
.trial-cta-content {
  position: relative;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}
.trial-cta-icon { font-size: 28px; }
.trial-cta-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  background: linear-gradient(135deg, #a78bfa, #60a5fa);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.trial-cta-sub {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0 0 4px;
}
.trial-cta-features {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  justify-content: center;
  margin: 6px 0 10px;
}
.trial-cta-feat {
  font-size: 10px;
  color: rgba(167, 139, 250, 0.8);
  font-weight: 500;
}
.trial-cta-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trial-cta-input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.trial-cta-input:focus {
  border-color: rgba(168, 85, 247, 0.5);
}
.trial-cta-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}
.trial-cta-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #a855f7, #6366f1);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.trial-cta-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.trial-cta-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.trial-cta-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: trial-spin 0.6s linear infinite;
}
@keyframes trial-spin {
  to { transform: rotate(360deg); }
}
.trial-cta-error {
  font-size: 11px;
  color: var(--danger-red);
  margin: 4px 0 0;
}
.trial-cta-fine-print {
  font-size: 10px;
  color: var(--text-secondary);
  opacity: 0.6;
  margin: 6px 0 0;
}
.trial-cta-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
}
.trial-cta-success-icon { font-size: 28px; }
.trial-cta-success-msg {
  font-size: 12px;
  color: #4ade80;
  font-weight: 500;
  margin: 0;
}
</style>

<style>
[data-theme="light"] .gallery-sidebar {
  --bg-main: #ffffff;
  --bg-surface: #f0f0f2;
  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --border-subtle: rgba(0, 0, 0, 0.08);
  --btn-hover-bg: rgba(0, 0, 0, 0.04);
  --btn-hover-border: rgba(0, 0, 0, 0.15);
}
[data-theme="light"] .gallery-sidebar .btn-outline {
  border-color: rgba(255, 149, 0, 0.3);
}
[data-theme="light"] .gallery-sidebar .btn-outline:hover {
  background: rgba(255, 149, 0, 0.08);
  border-color: rgba(255, 149, 0, 0.5);
}
[data-theme="light"] .gallery-sidebar .btn-danger {
  border-color: rgba(255, 59, 48, 0.2);
}
[data-theme="light"] .gallery-sidebar .btn-danger:hover {
  background: rgba(255, 59, 48, 0.06);
  border-color: rgba(255, 59, 48, 0.35);
}
[data-theme="light"] .gallery-sidebar .btn-batch {
  background: rgba(0, 113, 227, 0.05);
  border-color: rgba(0, 113, 227, 0.15);
}
[data-theme="light"] .gallery-sidebar .btn-batch:hover {
  background: rgba(0, 113, 227, 0.1);
  border-color: rgba(0, 113, 227, 0.3);
}

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .gallery-sidebar {
  --bg-main: rgba(10, 15, 30, 0.95);
  --bg-surface: #111827;
  --text-primary: #e0e6ff;
  --text-secondary: #a0a8c8;
  --border-subtle: rgba(0, 240, 255, 0.1);
  --accent-blue: #00f0ff;
  --btn-hover-bg: rgba(0, 240, 255, 0.06);
  --btn-hover-border: rgba(0, 240, 255, 0.2);
}
[data-theme="futuristic"] .gallery-sidebar .btn-action {
  border-color: rgba(0, 240, 255, 0.1);
}
[data-theme="futuristic"] .gallery-sidebar .btn-action:hover {
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.08);
}
[data-theme="futuristic"] .gallery-sidebar .btn-outline {
  color: #00f0ff;
  border-color: rgba(0, 240, 255, 0.2);
}
[data-theme="futuristic"] .gallery-sidebar .btn-outline:hover {
  background: rgba(0, 240, 255, 0.06);
  border-color: rgba(0, 240, 255, 0.35);
  color: #00f0ff;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.1);
}
[data-theme="futuristic"] .gallery-sidebar .btn-danger {
  color: #ff4a6a;
  border-color: rgba(255, 74, 106, 0.15);
}
[data-theme="futuristic"] .gallery-sidebar .btn-danger:hover {
  background: rgba(255, 74, 106, 0.08);
  border-color: rgba(255, 74, 106, 0.3);
  box-shadow: 0 0 10px rgba(255, 74, 106, 0.1);
}
[data-theme="futuristic"] .gallery-sidebar .btn-batch {
  color: #00f0ff;
  background: rgba(0, 240, 255, 0.04);
  border-color: rgba(0, 240, 255, 0.12);
}
[data-theme="futuristic"] .gallery-sidebar .btn-batch:hover {
  background: rgba(0, 240, 255, 0.08);
  border-color: rgba(0, 240, 255, 0.25);
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.1);
}
</style>
