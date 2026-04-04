<template>
  <Teleport to="body">
    <Transition name="slideshow-fade">
      <div v-if="show" class="slideshow-overlay" @click.self="togglePlayPause" @keydown="handleKey" tabindex="0" ref="el">
        <!-- Controls bar (auto-hide) -->
        <Transition name="controls-fade">
          <div v-show="showControls" class="slideshow-controls">
            <div class="controls-left">
              <button class="ctrl-btn" @click.stop="prev" title="Previous">⏮</button>
              <button class="ctrl-btn" @click.stop="togglePlayPause" :title="playing ? 'Pause' : 'Play'">
                {{ playing ? '⏸' : '▶️' }}
              </button>
              <button class="ctrl-btn" @click.stop="next" title="Next">⏭</button>
            </div>
            <div class="controls-center">
              <span class="slide-counter">{{ currentIndex + 1 }} / {{ mediaFiles.length }}</span>
              <span class="slide-name">{{ currentName }}</span>
            </div>
            <div class="controls-right">
              <div class="speed-control">
                <label>Speed</label>
                <select v-model.number="interval" class="speed-select" @change="restartTimer">
                  <option :value="2000">2s</option>
                  <option :value="3000">3s</option>
                  <option :value="5000">5s</option>
                  <option :value="8000">8s</option>
                  <option :value="10000">10s</option>
                </select>
              </div>
              <div class="transition-control">
                <label>Effect</label>
                <select v-model="transition" class="speed-select">
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option>
                </select>
              </div>
              <button class="ctrl-btn" @click.stop="shuffled = !shuffled; reshuffleIfNeeded()" :class="{ active: shuffled }" title="Shuffle">🔀</button>
              <button class="ctrl-btn close-btn" @click.stop="$emit('close')" title="Exit">✕</button>
            </div>
          </div>
        </Transition>

        <!-- Progress bar -->
        <div class="progress-track" v-show="showControls">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>

        <!-- Image display -->
        <Transition :name="'slide-' + transition" mode="out-in">
          <div class="slide-container" :key="currentIndex">
            <img 
              v-if="currentSrc && !isVideo" 
              :src="currentSrc" 
              class="slide-img"
              @load="onMediaLoaded"
              @error="onMediaLoaded"
            />
            <video
              v-else-if="currentSrc && isVideo"
              :src="currentSrc"
              class="slide-img"
              autoplay
              muted
              preload="metadata"
              @ended="next"
              @loadedmetadata="onMediaLoaded"
            ></video>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  mediaFiles: { type: Array, default: () => [] },
  startIndex: { type: Number, default: 0 }
})
const emit = defineEmits(['close'])

const el = ref(null)
const currentIndex = ref(0)
const playing = ref(true)
const interval = ref(5000)
const transition = ref('fade')
const shuffled = ref(false)
const showControls = ref(true)
const progressPct = ref(0)

let timer = null
let controlsTimer = null
let progressTimer = null
let order = []

const currentFile = computed(() => {
  if (!props.mediaFiles.length) return null
  const idx = shuffled.value ? (order[currentIndex.value] ?? currentIndex.value) : currentIndex.value
  return props.mediaFiles[idx] || null
})

const currentSrc = computed(() => {
  if (!currentFile.value) return ''
  const path = currentFile.value.original || ''
  return path.startsWith('pluto://') ? path : `pluto://${path}`
})

const currentName = computed(() => {
  if (!currentFile.value) return ''
  return (currentFile.value.original || '').split(/[\\/]/).pop()
})

const isVideo = computed(() => /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i.test(currentFile.value?.original || ''))

const onMediaLoaded = () => {
  // Start progress animation
  startProgress()
}

const next = () => {
  if (!props.mediaFiles.length) return
  currentIndex.value = (currentIndex.value + 1) % props.mediaFiles.length
}

const prev = () => {
  if (!props.mediaFiles.length) return
  currentIndex.value = (currentIndex.value - 1 + props.mediaFiles.length) % props.mediaFiles.length
}

const togglePlayPause = () => {
  playing.value = !playing.value
  if (playing.value) startTimer()
  else stopTimer()
}

const startTimer = () => {
  stopTimer()
  timer = setInterval(() => {
    next()
  }, interval.value)
}

const stopTimer = () => {
  if (timer) { clearInterval(timer); timer = null }
}

const restartTimer = () => {
  if (playing.value) startTimer()
}

const startProgress = () => {
  if (progressTimer) clearInterval(progressTimer)
  progressPct.value = 0
  const step = 50 // ms
  const totalSteps = interval.value / step
  let current = 0
  progressTimer = setInterval(() => {
    current++
    progressPct.value = (current / totalSteps) * 100
    if (current >= totalSteps) clearInterval(progressTimer)
  }, step)
}

const reshuffleIfNeeded = () => {
  if (shuffled.value) {
    order = Array.from({ length: props.mediaFiles.length }, (_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
}

const showControlsBriefly = () => {
  showControls.value = true
  if (controlsTimer) clearTimeout(controlsTimer)
  controlsTimer = setTimeout(() => {
    if (playing.value) showControls.value = false
  }, 3000)
}

const handleKey = (e) => {
  showControlsBriefly()
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowRight' || e.key === ' ') next()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'p') togglePlayPause()
}

const handleMouseMove = () => showControlsBriefly()

watch(() => props.show, (val) => {
  if (val) {
    currentIndex.value = props.startIndex || 0
    playing.value = true
    reshuffleIfNeeded()
    startTimer()
    showControlsBriefly()
    nextTick(() => el.value?.focus())
    document.addEventListener('mousemove', handleMouseMove)
  } else {
    stopTimer()
    if (progressTimer) clearInterval(progressTimer)
    document.removeEventListener('mousemove', handleMouseMove)
  }
})

watch(currentIndex, () => {
  startProgress()
})

onUnmounted(() => {
  stopTimer()
  if (progressTimer) clearInterval(progressTimer)
  if (controlsTimer) clearTimeout(controlsTimer)
  document.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
.slideshow-overlay { position: fixed; inset: 0; z-index: 100001; background: #000; display: flex; align-items: center; justify-content: center; outline: none; cursor: none; }
.slideshow-overlay:hover { cursor: default; }

.slideshow-controls { position: absolute; top: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; padding: 16px 24px; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); cursor: default; }
.controls-left, .controls-right { display: flex; align-items: center; gap: 8px; }
.controls-center { flex: 1; text-align: center; }
.slide-counter { font-size: 12px; color: #86868b; font-weight: 600; letter-spacing: 1px; }
.slide-name { display: block; font-size: 11px; color: #555; margin-top: 2px; }
.ctrl-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; font-size: 16px; transition: all 0.2s; }
.ctrl-btn:hover { background: rgba(255,255,255,0.15); }
.ctrl-btn.active { background: rgba(0,113,227,0.3); border-color: #0071e3; }
.ctrl-btn.close-btn { background: rgba(255,69,58,0.15); border-color: rgba(255,69,58,0.3); }
.ctrl-btn.close-btn:hover { background: rgba(255,69,58,0.3); }
.speed-control, .transition-control { display: flex; align-items: center; gap: 6px; }
.speed-control label, .transition-control label { font-size: 10px; color: #555; text-transform: uppercase; }
.speed-select { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 8px; color: #ccc; font-size: 12px; }

.progress-track { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255,255,255,0.1); z-index: 10; }
.progress-fill { height: 100%; background: #0071e3; transition: width 0.05s linear; }

.slide-container { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.slide-img { max-width: 100vw; max-height: 100vh; object-fit: contain; }

/* Fade transition */
.slide-fade-enter-active, .slide-fade-leave-active { transition: opacity 0.6s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; }

/* Slide transition */
.slide-slide-enter-active, .slide-slide-leave-active { transition: all 0.5s ease; }
.slide-slide-enter-from { opacity: 0; transform: translateX(80px); }
.slide-slide-leave-to { opacity: 0; transform: translateX(-80px); }

/* Zoom transition */
.slide-zoom-enter-active, .slide-zoom-leave-active { transition: all 0.5s ease; }
.slide-zoom-enter-from { opacity: 0; transform: scale(0.9); }
.slide-zoom-leave-to { opacity: 0; transform: scale(1.1); }

/* Overlay transitions */
.slideshow-fade-enter-active, .slideshow-fade-leave-active { transition: opacity 0.3s; }
.slideshow-fade-enter-from, .slideshow-fade-leave-to { opacity: 0; }
.controls-fade-enter-active, .controls-fade-leave-active { transition: opacity 0.3s; }
.controls-fade-enter-from, .controls-fade-leave-to { opacity: 0; }
</style>
