<template>
  <Teleport to="body">
    <Transition name="scan-toast">
      <div v-if="visible" class="scan-toast" :class="{ 'scan-toast--done': done }">
        <div class="scan-toast-icon">
          <svg v-if="done" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <svg v-else class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        </div>
        <div class="scan-toast-body">
          <div class="scan-toast-title">{{ done ? 'Analysis Complete' : 'Analyzing Import' }}</div>
          <div class="scan-toast-detail">
            <template v-if="done">
              {{ total }} images processed — AI context ready
            </template>
            <template v-else>
              {{ current }} of {{ total }} — generating AI context for photos
            </template>
          </div>
          <div v-if="!done" class="scan-toast-bar">
            <div class="scan-toast-bar-fill" :style="{ width: percent + '%' }"></div>
          </div>
          <div v-if="!done" class="scan-toast-actions">
            <button class="scan-toast-cancel-btn" @click="$emit('cancel')">Cancel</button>
            <span class="scan-toast-percent">{{ percent }}%</span>
          </div>
        </div>
        <button class="scan-toast-close" @click="$emit(done ? 'close' : 'cancel')" :title="done ? 'Dismiss' : 'Cancel'">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  current: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  done: Boolean
})

defineEmits(['close', 'cancel'])

const visible = ref(false)
let dismissTimer = null

const percent = computed(() => {
  if (!props.total) return 0
  return Math.round((props.current / props.total) * 100)
})

watch(() => props.show, (val) => {
  visible.value = val
  clearTimeout(dismissTimer)
}, { immediate: true })

watch(() => props.done, (val) => {
  if (val) {
    // Auto-dismiss after 4 seconds when done
    dismissTimer = setTimeout(() => {
      visible.value = false
    }, 4000)
  }
})
</script>

<style scoped>
.scan-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  background: linear-gradient(135deg, #1a1a2e, #1c1c2e);
  border: 1px solid rgba(88, 166, 255, 0.4);
  border-radius: 14px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(88, 166, 255, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px);
  min-width: 320px;
  max-width: 400px;
  animation: scan-toast-pulse 3s ease-in-out infinite;
}

.scan-toast--done {
  border-color: rgba(52, 211, 153, 0.4);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(52, 211, 153, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05);
  animation: none;
}

@keyframes scan-toast-pulse {
  0%, 100% { box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(88, 166, 255, 0.15); }
  50% { box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(88, 166, 255, 0.25); }
}

.scan-toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: #58a6ff;
  margin-top: 1px;
}

.scan-toast--done .scan-toast-icon {
  color: #34d399;
}

.scan-toast-icon svg {
  width: 100%;
  height: 100%;
}

.scan-toast-icon .spin {
  animation: scan-spin 1s linear infinite;
}

@keyframes scan-spin {
  to { transform: rotate(360deg); }
}

.scan-toast-body {
  flex: 1;
  min-width: 0;
}

.scan-toast-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  line-height: 1.4;
}

.scan-toast-detail {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}

.scan-toast-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.scan-toast-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.scan-toast--done .scan-toast-bar-fill {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.scan-toast-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.scan-toast-cancel-btn {
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.scan-toast-cancel-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

.scan-toast-percent {
  font-size: 12px;
  font-weight: 700;
  color: #58a6ff;
  font-variant-numeric: tabular-nums;
}

.scan-toast-close {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: #555;
  cursor: pointer;
  transition: color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-toast-close:hover {
  color: #fff;
}

.scan-toast-close svg {
  width: 14px;
  height: 14px;
}

/* Transitions */
.scan-toast-enter-active {
  animation: scan-toast-in 0.3s ease-out;
}

.scan-toast-leave-active {
  animation: scan-toast-out 0.25s ease-in;
}

@keyframes scan-toast-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes scan-toast-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
}

/* Light theme */
:deep([data-theme="light"]) .scan-toast,
:global([data-theme="light"]) .scan-toast {
  background: linear-gradient(135deg, #f8f8fa, #f0f0f5);
  border-color: rgba(0, 113, 227, 0.3);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.1), 0 0 20px rgba(0, 113, 227, 0.08);
}
:deep([data-theme="light"]) .scan-toast--done,
:global([data-theme="light"]) .scan-toast--done {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.1), 0 0 20px rgba(16, 185, 129, 0.08);
}
:deep([data-theme="light"]) .scan-toast-title,
:global([data-theme="light"]) .scan-toast-title { color: #1d1d1f; }
:deep([data-theme="light"]) .scan-toast-detail,
:global([data-theme="light"]) .scan-toast-detail { color: #86868b; }
:deep([data-theme="light"]) .scan-toast-bar,
:global([data-theme="light"]) .scan-toast-bar { background: rgba(0, 0, 0, 0.06); }
:deep([data-theme="light"]) .scan-toast-close,
:global([data-theme="light"]) .scan-toast-close { color: #aaa; }
:deep([data-theme="light"]) .scan-toast-close:hover,
:global([data-theme="light"]) .scan-toast-close:hover { color: #333; }
</style>
