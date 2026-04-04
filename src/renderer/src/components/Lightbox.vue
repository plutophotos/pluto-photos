<template>
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div 
        v-if="show" 
        class="lightbox-mask" 
        @click.self="$emit('close')"
        @keydown.esc="$emit('close')"
        tabindex="0"
        ref="el"
      >
        <header class="lightbox-toolbar">
          <div class="file-info">
            <span class="filename">{{ fileName }}</span>
            <span class="counter" v-if="mediaFiles.length">
              ASSET {{ index + 1 }} OF {{ mediaFiles.length }}
            </span>
          </div>
          <div class="actions">
            <button class="icon-btn slideshow-btn" @click="$emit('start-slideshow')" title="Slideshow">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
            <button class="icon-btn close-btn" @click="$emit('close')" title="Close (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </header>

        <div class="nav-layer" v-if="mediaFiles.length > 1">
          <button class="nav-arrow left" @click="prev" title="Previous">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button class="nav-arrow right" @click="next" title="Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>

        <main class="stage">
          <div v-if="loading" class="loader"></div>
          
          <Transition :name="transitionName" mode="out-in">
            <div 
              v-if="currentFile.original" 
              :key="currentFile.original" 
              class="media-container"
            >
              <img 
                v-if="!isCurrentVideo && !isCurrentPdf && !isCurrentIco && !isCurrentPsd" 
                :src="currentFile.original" 
                @load="handleMediaLoaded" 
                @error="handleMediaLoaded"
                class="main-media" 
                :class="{ 'is-loading': loading }"
              />
              <img 
                v-else-if="isCurrentIco" 
                :src="currentFile.original" 
                @load="handleMediaLoaded" 
                @error="handleMediaLoaded"
                class="main-media" 
                :class="{ 'is-loading': loading }"
              />
              <video 
                v-else-if="isCurrentVideo" 
                :src="currentFile.original" 
                controls 
                autoplay
                preload="metadata"
                @loadedmetadata="handleMediaLoaded" 
                @error="handleMediaLoaded"
                class="main-media video-media"
                :class="{ 'is-loading': loading }"
              ></video>
              <div v-else-if="isCurrentPdf" class="pdf-container main-media" :class="{ 'is-loading': loading }">
                <div class="pdf-preview">
                  <svg width="120" height="120" viewBox="0 0 48 48" fill="none">
                    <rect width="48" height="48" rx="8" fill="#E53935"/>
                    <text x="24" y="32" text-anchor="middle" font-size="18" fill="white" font-family="Arial">PDF</text>
                  </svg>
                  <p class="pdf-filename">{{ fileName }}</p>
                  <button class="open-pdf-btn" @click="openPdfExternal">Open PDF</button>
                </div>
              </div>
              <div v-else-if="isCurrentPsd" class="psd-container main-media" :class="{ 'is-loading': loading }">
                <div class="psd-preview">
                  <img 
                    :src="getPsdPreviewSrc()" 
                    @load="handleMediaLoaded" 
                    @error="handleMediaLoaded"
                    class="psd-image"
                  />
                  <div class="psd-bar">
                    <span class="psd-badge">PSD</span>
                    <span class="psd-name">{{ fileName }}</span>
                    <button class="open-psd-btn" @click="openPsdExternal">Open in Editor</button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </main>

        <footer class="lightbox-footer" v-if="mediaFiles.length > 1">
          <div class="thumb-strip-container">
            <div class="thumb-strip" ref="thumbStrip">
              <button 
                v-for="(file, i) in visibleThumbs" 
                :key="file.original || (startIndex + i)" 
                class="thumb-item"
                :class="{ active: (startIndex + i) === index }"
                @click="handleJump(startIndex + i)"
              >
<img 
  :src="getThumbSrc(file)" 
  @error="(e) => e.target.src = currentFile.original"
  loading="lazy"
  draggable="false" 
/>
              </button>
            </div>
          </div>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  show: Boolean,
  index: { type: Number, default: 0 },
  mediaFiles: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'prev', 'next', 'jump', 'start-slideshow'])

const loading = ref(true)
const el = ref(null)
const thumbStrip = ref(null)
const transitionName = ref('media-next')
let loadTimeout = null

// Virtualization Config: Only keep 20 thumb nodes in the DOM at once
const THUMB_WINDOW = 20 

const currentFile = computed(() => {
  if (!props.mediaFiles.length || !props.mediaFiles[props.index]) {
    return { original: '', thumbnail: '', src: '' }
  }
  
  const file = props.mediaFiles[props.index];
  
  // Logic to ensure pluto:// is present for the full-size view
  const original = file.original.startsWith('pluto://') 
    ? file.original 
    : `pluto://${file.original}`;

  return { ...file, original };
});
const fileName = computed(() => {
  const path = currentFile.value?.original
  if (!path) return 'Loading...'
  return path.split(/[\\/]/).pop() || 'Untitled'
})

const isCurrentVideo = computed(() => {
  const path = currentFile.value?.original || ''
  // Remove protocol to check extension accurately
  const cleanPath = path.replace('pluto://', '')
  return /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(cleanPath)
})

const isCurrentPdf = computed(() => {
  const path = currentFile.value?.original || ''
  const cleanPath = path.replace('pluto://', '')
  return /\.pdf$/i.test(cleanPath)
})

const isCurrentPsd = computed(() => {
  const path = currentFile.value?.original || ''
  const cleanPath = path.replace('pluto://', '')
  return /\.psd$/i.test(cleanPath)
})

const isCurrentIco = computed(() => {
  const path = currentFile.value?.original || ''
  const cleanPath = path.replace('pluto://', '')
  return /\.ico$/i.test(cleanPath)
})

const getThumbSrc = (file) => {
  const src = file.thumbnail || file.src || file.original;
  return src.startsWith('pluto://') ? src : `pluto://${src}`;
};
/**
 * THUMBNAIL VIRTUALIZATION LOGIC
 * Calculates which subset of the 5000+ images to actually render
 */
const startIndex = computed(() => {
  const start = props.index - Math.floor(THUMB_WINDOW / 2)
  return Math.max(0, Math.min(start, props.mediaFiles.length - THUMB_WINDOW))
})

const visibleThumbs = computed(() => {
  return props.mediaFiles.slice(startIndex.value, startIndex.value + THUMB_WINDOW)
})

const handleMediaLoaded = () => {
  loading.value = false
  if (loadTimeout) clearTimeout(loadTimeout)
}

const handleJump = (i) => {
  if (i === props.index) return
  transitionName.value = i > props.index ? 'media-next' : 'media-prev'
  loading.value = true
  emit('jump', i)
}

const prev = () => {
  if (props.mediaFiles.length === 0) return
  transitionName.value = 'media-prev'
  loading.value = true
  emit('prev')
}

const next = () => {
  if (props.mediaFiles.length === 0) return
  transitionName.value = 'media-next'
  loading.value = true
  emit('next')
}

watch(() => props.index, async (newVal, oldVal) => {
  loading.value = true
  
  if (newVal !== oldVal) {
    transitionName.value = newVal > oldVal ? 'media-next' : 'media-prev'
  }

  // BUG FIX: PDFs and PSDs don't need to load - show immediately
  if (isCurrentPdf.value || isCurrentPsd.value) {
    loading.value = false
    return
  }

  // BUG FIX: Check if image is already cached to prevent endless spinner
  await nextTick()
  const mediaEl = el.value?.querySelector('.main-media')
  if (mediaEl && (mediaEl.complete || mediaEl.readyState >= 1)) {
    handleMediaLoaded()
  }

  if (loadTimeout) clearTimeout(loadTimeout)
  loadTimeout = setTimeout(() => {
    loading.value = false
  }, 3500)

  // Auto-scroll the thumbnail strip
  await nextTick()
  const activeThumb = thumbStrip.value?.querySelector('.thumb-item.active')
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
})

watch(() => props.show, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
    // PDFs and PSDs don't need loading state
    loading.value = !isCurrentPdf.value && !isCurrentPsd.value
    nextTick(() => el.value?.focus())
  } else {
    document.body.style.overflow = ''
    if (loadTimeout) clearTimeout(loadTimeout)
  }
}, { immediate: true })

const handleKeydown = (e) => {
  if (!props.show) return
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (loadTimeout) clearTimeout(loadTimeout)
})

const openPdfExternal = () => {
  if (currentFile.value?.original) {
    window.electron.ipcRenderer.invoke('open-external-file', currentFile.value.original)
  }
}

const openPsdExternal = () => {
  if (currentFile.value?.original) {
    window.electron.ipcRenderer.invoke('open-external-file', currentFile.value.original)
  }
}

const getPsdPreviewSrc = () => {
  // Use the thumbnail (webp composite) since browsers can't render PSD
  const file = props.mediaFiles[props.index]
  if (!file) return ''
  const thumb = file.thumbnail || file.thumb || file.src
  if (thumb) return thumb.startsWith('pluto://') ? thumb : `pluto://${thumb}`
  return currentFile.value.original
}
</script>

<style scoped>
/* Styles remain identical to your original for consistency */
.lightbox-mask {
  position: fixed; inset: 0; background: rgba(8, 8, 8, 0.98);
  backdrop-filter: blur(15px); z-index: 100001;
  display: flex; flex-direction: column; outline: none; color: white;
}
.lightbox-toolbar { 
  display: flex; justify-content: space-between; padding: 1.25rem 2rem; z-index: 300;
  background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
}
.file-info { display: flex; flex-direction: column; gap: 4px; }
.filename { font-size: 14px; font-weight: 600; color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }
.counter { font-size: 10px; font-weight: 800; color: #666; letter-spacing: 1px; }

.stage { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; z-index: 10; }
.media-container { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

.main-media { 
  max-width: 90vw; 
  max-height: 75vh; 
  object-fit: contain; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  transition: opacity 0.2s ease;
}
/* Videos need a sensible initial size before intrinsic dimensions load */
.video-media { width: 90vw; height: 75vh; }
.main-media.is-loading { opacity: 0; }

.nav-layer { position: absolute; inset: 0; pointer-events: none; display: flex; justify-content: space-between; align-items: center; padding: 0 2rem; z-index: 200; }
.nav-arrow { pointer-events: auto; width: 56px; height: 56px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(20, 20, 20, 0.6); color: white; cursor: pointer; display: grid; place-items: center; transition: all 0.2s ease; }
.nav-arrow:hover { background: white; color: black; transform: scale(1.1); }

.lightbox-footer { padding: 20px 0 40px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); z-index: 300; }
.thumb-strip-container { max-width: 90vw; margin: 0 auto; overflow: hidden; mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent); }
.thumb-strip { display: flex; gap: 12px; overflow-x: auto; padding: 10px 60px; scrollbar-width: none; flex-wrap: nowrap; align-items: center; }
.thumb-strip::-webkit-scrollbar { display: none; }

.thumb-item { flex: 0 0 80px; height: 50px; border-radius: 6px; overflow: hidden; border: 2px solid rgba(255,255,255,0.1); background: #111; padding: 0; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.thumb-item img { width: 100%; height: 100%; object-fit: cover; opacity: 0.4; transition: opacity 0.2s; }
.thumb-item.active { border-color: #3b82f6; transform: scale(1.15) translateY(-5px); z-index: 2; box-shadow: 0 10px 20px rgba(0,0,0,0.4); }
.thumb-item.active img, .thumb-item:hover img { opacity: 1; }

.icon-btn { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.1); color: white; width: 40px; height: 40px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
.icon-btn:hover { background: #ff453a; border-color: #ff453a; }
.slideshow-btn { margin-right: 8px; }
.slideshow-btn:hover { background: #0071e3; border-color: #0071e3; }

.loader { 
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 40px; height: 40px; 
  border: 3px solid rgba(255,255,255,0.1); 
  border-top-color: #3b82f6; 
  border-radius: 50%; 
  animation: spin 1s linear infinite; 
  z-index: 100;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Animations */
.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.3s ease; }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0; }

.media-next-enter-from { opacity: 0; transform: scale(0.95) translateX(30px); }
.media-next-leave-to { opacity: 0; transform: scale(1.05) translateX(-30px); }
.media-prev-enter-from { opacity: 0; transform: scale(0.95) translateX(-30px); }
.media-prev-leave-to { opacity: 0; transform: scale(1.05) translateX(30px); }
.media-next-enter-active, .media-next-leave-active, .media-prev-enter-active, .media-prev-leave-active { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }

/* PDF Preview */
.pdf-container {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  border-radius: 12px;
  padding: 60px;
}
.pdf-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.pdf-filename {
  font-size: 16px;
  color: #ccc;
  max-width: 400px;
  text-align: center;
  word-break: break-all;
}
.open-pdf-btn {
  background: #E53935;
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.open-pdf-btn:hover {
  background: #c62828;
  transform: scale(1.05);
}

/* PSD Preview */
.psd-container {
  display: flex;
  align-items: center;
  justify-content: center;
}
.psd-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  max-width: 90vw;
}
.psd-image {
  max-width: 90vw;
  max-height: 65vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
}
.psd-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 10px 20px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
}
.psd-badge {
  background: #2d5a9e;
  color: white;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  padding: 3px 8px;
  border-radius: 4px;
}
.psd-name {
  font-size: 13px;
  color: #999;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.open-psd-btn {
  background: rgba(255,255,255,0.08);
  color: #ccc;
  border: 1px solid rgba(255,255,255,0.12);
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.open-psd-btn:hover {
  background: #2d5a9e;
  border-color: #2d5a9e;
  color: white;
}
</style>