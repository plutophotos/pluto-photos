<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" class="toast-container" :class="type">
        <div class="toast-icon-wrap" :class="type">
          <svg v-if="type === 'error'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <svg v-else-if="type === 'success'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        </div>
        <div class="toast-body">
          <div class="toast-title">{{ title }}</div>
          <div v-if="message" class="toast-message">{{ message }}</div>
          <button v-if="actionLabel" class="toast-action" @click="$emit('action'); close()">{{ actionLabel }}</button>
        </div>
        <button class="toast-close" @click="close" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  show: Boolean,
  type: {
    type: String,
    default: 'info' // 'error', 'success', 'info'
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  actionLabel: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 5000 // 0 = no auto-close
  }
})

const emit = defineEmits(['close', 'action'])

const visible = ref(false)
let timeoutId = null

const close = () => {
  visible.value = false
  emit('close')
}

watch(() => props.show, (newVal) => {
  visible.value = newVal
  
  if (newVal && props.duration > 0) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(close, props.duration)
  }
}, { immediate: true })

onUnmounted(() => {
  clearTimeout(timeoutId)
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px 16px 16px;
  background: rgba(28, 28, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.45),
    0 8px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  min-width: 340px;
  max-width: 460px;
}

.toast-container.error {
  border-color: rgba(255, 69, 58, 0.25);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.45),
    0 8px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 69, 58, 0.1),
    0 0 40px -10px rgba(255, 69, 58, 0.15);
}

.toast-container.success {
  border-color: rgba(48, 209, 88, 0.25);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.45),
    0 8px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(48, 209, 88, 0.1),
    0 0 40px -10px rgba(48, 209, 88, 0.15);
}

.toast-container.info {
  border-color: rgba(88, 166, 255, 0.25);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.45),
    0 8px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(88, 166, 255, 0.1),
    0 0 40px -10px rgba(88, 166, 255, 0.15);
}

/* Icon bubble */
.toast-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-icon-wrap svg {
  width: 20px;
  height: 20px;
}

.toast-icon-wrap.error {
  background: rgba(255, 69, 58, 0.15);
  color: #ff453a;
}

.toast-icon-wrap.success {
  background: rgba(48, 209, 88, 0.15);
  color: #30d158;
}

.toast-icon-wrap.info {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #f0f0f5;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.toast-message {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 3px;
  line-height: 1.45;
}

.toast-action {
  display: inline-flex;
  align-items: center;
  margin-top: 10px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toast-action:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.2);
}

.toast-container.error .toast-action {
  background: rgba(255, 69, 58, 0.12);
  border-color: rgba(255, 69, 58, 0.2);
  color: #ff8a84;
}

.toast-container.error .toast-action:hover {
  background: rgba(255, 69, 58, 0.22);
  border-color: rgba(255, 69, 58, 0.35);
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-close:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.12);
}

.toast-close svg {
  width: 14px;
  height: 14px;
}

/* Transitions */
.toast-enter-active {
  animation: toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-leave-active {
  animation: toast-out 0.25s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes toast-in {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-24px) scale(0.92);
    filter: blur(4px);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes toast-out {
  0% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-12px) scale(0.95);
    filter: blur(4px);
  }
}

/* Light theme */
:global([data-theme="light"]) .toast-container {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

:global([data-theme="light"]) .toast-title {
  color: #1d1d1f;
}

:global([data-theme="light"]) .toast-message {
  color: rgba(0, 0, 0, 0.5);
}

:global([data-theme="light"]) .toast-close {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.3);
}

:global([data-theme="light"]) .toast-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.6);
}

:global([data-theme="light"]) .toast-action {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1d1d1f;
}

:global([data-theme="light"]) .toast-action:hover {
  background: rgba(0, 0, 0, 0.1);
}
</style>
