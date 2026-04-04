<template>
  <div 
    ref="cardRef" 
    class="media-card" 
    :class="{ 'is-selected': isSelected && !locked, 'in-album': inAlbum && !locked, 'is-locked': locked }" 
    :draggable="!locked"
    role="gridcell"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-selected="isSelected && !locked"
    @dragstart="!locked && $emit('dragstart', $event)" 
    @mouseenter="!locked && playVideo()" 
    @mouseleave="!locked && pauseVideo()" 
    @click="$emit('click', $event)"
    @dblclick="$emit('dblclick', $event)"
    @keydown.enter.prevent="$emit('click', $event)"
    @keydown.space.prevent="$emit('click', $event)"
  >
    <div class="selection-indicator">
      <div class="check-circle">
        <svg viewBox="0 0 24 24" class="check-icon">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      </div>
    </div>

    <div v-if="!isLoaded" class="card-wireframe">
      <div class="wireframe-pulse"></div>
    </div>

    <div class="image-wrapper">
      <!-- Video overlay — always in layout (opacity-hidden) so decoder stays warm.
           Becomes visible only when the 'playing' event fires (first frame rendered). -->
      <video
        v-if="isVideo"
        ref="videoPlayer"
        :src="videoSrc"
        muted loop playsinline
        preload="none"
        class="media-content hover-video"
        :class="{ 'is-playing': videoReady }"
        @playing="onVideoPlaying"
      />
      <img
        v-if="isPdf"
        style="display:none"
      />
      <div v-if="isPdf" class="media-content content-ready" style="display:flex;align-items:center;justify-content:center;background:#fff;">
        <span v-html="pdfIcon" style="width:48px;height:48px;display:block;margin:auto;"></span>
      </div>
      <!-- Thumbnail image for ALL non-PDF items (photos AND videos) -->
      <img 
        v-if="!isPdf"
        :src="currentSrc" 
        class="media-content"
        :class="{ 'content-ready': isLoaded }"
        @load="isLoaded = true"
        @error="onImgError"
      />
      <div v-if="isVideo && !videoReady" class="video-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
      <div v-if="isPdf" class="video-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <rect x="2" y="2" width="20" height="20" rx="3" fill="#E53935"/>
          <text x="12" y="16" text-anchor="middle" font-size="10" fill="white">PDF</text>
        </svg>
      </div>
      <div class="scrim"></div>
    </div>

    <!-- Locked overlay -->
    <div v-if="locked" class="locked-overlay">
      <svg class="lock-icon" viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
      </svg>
      <span class="lock-label">Upgrade to Pro</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  src: String,
  originalPath: String,
  isSelected: Boolean,
  inAlbum: Boolean,
  locked: { type: Boolean, default: false }
})

const emit = defineEmits(['click', 'dblclick', 'dragstart', 'thumb-error'])

const cardRef = ref(null)
const videoPlayer = ref(null)
const isLoaded = ref(false)
const hoverPlaying = ref(false)
const videoReady = ref(false)
let _playPollTimer = null

// Reset loaded state and stop any hover video when the card is recycled
watch(() => props.src, () => {
  isLoaded.value = false
})
watch(() => props.originalPath, () => {
  hoverPlaying.value = false
  videoReady.value = false
  _clearPlayPoll()
  // Reset preload so recycled cards don't auto-buffer the new video
  const el = videoPlayer.value
  if (el) { el.pause(); el.preload = 'none' }
})
// PDF icon SVG (simple placeholder)
const pdfIcon = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="8" fill="#E53935"/><text x="24" y="32" text-anchor="middle" font-size="18" fill="white" font-family="Arial">PDF</text></svg>`

const isVideo = computed(() => {
  const p = props.originalPath?.toLowerCase() || "";
  return /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/.test(p);
});

const ariaLabel = computed(() => {
  const name = props.originalPath?.split(/[\\/]/).pop() || 'media';
  const type = isVideo.value ? 'video' : isPdf.value ? 'PDF' : 'photo';
  const selected = props.isSelected ? ', selected' : '';
  return `${name} (${type}${selected})`;
});

const isIco = computed(() => {
  const p = props.originalPath?.toLowerCase() || "";
  return p.endsWith('.ico');
});

const isPdf = computed(() => {
  const p = props.originalPath?.toLowerCase() || "";
  return p.endsWith('.pdf');
});

// currentSrc is the thumbnail. videoSrc is the actual file for hover-play.
const videoSrc = computed(() => {
  if (!props.originalPath) return ''
  return props.originalPath.startsWith('pluto://') ? props.originalPath : `pluto://${props.originalPath}`
})

const currentSrc = computed(() => {
  if (!props.src) return ''
  if (props.src.startsWith('pluto://') || props.src.startsWith('data:')) return props.src
  return `pluto://${props.src}`
})

function _clearPlayPoll() {
  if (_playPollTimer) { clearTimeout(_playPollTimer); _playPollTimer = null }
}

const onVideoPlaying = () => {
  if (hoverPlaying.value) videoReady.value = true
}

// Hover-play: video element is always in DOM (opacity-hidden) with preload="none".
// On hover we load metadata (fast, ~50KB) then play() — the browser streams via
// Range requests, so even multi-GB files start playing quickly without full download.
const playVideo = () => {
  if (!isVideo.value) return
  hoverPlaying.value = true
  const el = videoPlayer.value
  if (!el) return
  // Load metadata only (not the entire file like preload="auto" would)
  if (el.preload === 'none') el.preload = 'metadata'
  const doPlay = (v) => {
    v.currentTime = 0
    v.play().catch(() => {})
  }
  if (el.readyState >= 1) {
    doPlay(el)
  } else {
    const tryPlay = () => {
      if (!hoverPlaying.value) return
      const v = videoPlayer.value
      if (!v) return
      if (v.readyState >= 1) {
        doPlay(v)
      } else {
        _playPollTimer = setTimeout(tryPlay, 50)
      }
    }
    _playPollTimer = setTimeout(tryPlay, 50)
  }
}

const pauseVideo = () => {
  _clearPlayPoll()
  hoverPlaying.value = false
  videoReady.value = false
  const el = videoPlayer.value
  if (el) {
    el.pause()
    el.currentTime = 0
  }
}

onBeforeUnmount(() => _clearPlayPoll())

// Handle broken thumbnail loads — signal parent so stale src can be cleared
// and the item gets re-queued for thumbnail generation.
const onImgError = () => {
  isLoaded.value = false
  // Only emit for pluto:// URLs (actual file loads, not data: previews)
  if (props.src && props.src.startsWith('pluto://')) {
    emit('thumb-error')
  }
}
</script>

<style scoped>
.media-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  cursor: pointer;
  user-select: none;
  aspect-ratio: 1/1;
  contain: layout style paint;
}
.media-card:hover { z-index: 10; }
.media-card.is-selected { box-shadow: 0 0 0 3px #0078d4; }

/* Locked state */
.media-card.is-locked { cursor: default; }
.media-card.is-locked:hover { transform: none; }
.media-card.is-locked .image-wrapper { filter: blur(10px) brightness(0.6); pointer-events: none; }
.locked-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
}
.lock-icon { width: 28px; height: 28px; color: rgba(255,255,255,0.85); filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5)); }
.lock-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  letter-spacing: 0.3px;
}

/* In-album indicator — grayed out */
.media-card.in-album { opacity: 0.4; position: relative; }
.media-card.in-album:hover { opacity: 0.7; }
.media-card.in-album::after {
  content: '✓ In Album';
  position: absolute;
  bottom: 6px;
  right: 6px;
  z-index: 10;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 120, 212, 0.7);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
  pointer-events: none;
}
[data-theme="futuristic"] .media-card.in-album::after {
  background: rgba(0, 240, 255, 0.3);
  color: #00f0ff;
}
.card-wireframe { position: absolute; inset: 0; background: #252525; z-index: 1; }
.wireframe-pulse {
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
  animation: pulse 1.5s infinite;
}
@keyframes pulse { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.image-wrapper { 
  position: relative; 
  width: 100%; 
  height: 100%; 
  z-index: 2;
  display: flex; /* Ensures center alignment */
  align-items: center;
  justify-content: center;
}
/* Update this specific class */
.media-content {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
}
.media-content.content-ready { opacity: 1; }
.selection-indicator { position: absolute; top: 8px; right: 8px; z-index: 10; opacity: 0; }
.media-card:hover .selection-indicator, .media-card.is-selected .selection-indicator { opacity: 1; }
.check-circle { 
  width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.3); 
  backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3); 
}
.check-icon { width: 18px; height: 18px; fill: white; }
.media-card.is-selected .check-circle { background: #0078d4; border-color: transparent; }
.media-card.is-locked .selection-indicator { display: none; }
.hover-video {
  position: absolute; inset: 0; z-index: 3;
  object-fit: cover; width: 100%; height: 100%;
  opacity: 0; pointer-events: none;
}
.hover-video.is-playing { opacity: 1; }
.video-icon { position: absolute; bottom: 8px; left: 8px; z-index: 5; }
.scrim { 
  position: absolute; bottom: 0; left: 0; right: 0; height: 40%;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.4)); pointer-events: none;
}
</style>

<!-- Light theme overrides -->
<style>
[data-theme="light"] .media-card {
  background: #e8e8ed;
}
[data-theme="light"] .media-card .card-wireframe {
  background: #d8d8dc;
}
[data-theme="light"] .media-card .wireframe-pulse {
  background: linear-gradient(90deg, transparent, rgba(0,0,0,0.04), transparent);
}
[data-theme="light"] .media-card.is-selected {
  box-shadow: 0 0 0 3px #0071e3;
}

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .media-card {
  background: #111827;
}
[data-theme="futuristic"] .media-card .card-wireframe {
  background: #0a0f1e;
}
[data-theme="futuristic"] .media-card .wireframe-pulse {
  background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.06), transparent);
}
[data-theme="futuristic"] .media-card.is-selected {
  box-shadow: 0 0 0 2px #00f0ff, 0 0 12px rgba(0, 240, 255, 0.25);
}
[data-theme="futuristic"] .media-card:hover {
  box-shadow: 0 0 16px rgba(0, 240, 255, 0.08);
}
</style>