<template>
  <header class="custom-titlebar">
    <div class="drag-region">
      <div class="app-identity">
        <img src="/logo.png" alt="Pluto Photos" class="title-logo" />
        <span class="title-text">Pluto Photos</span>
      </div>
    </div>

    <div v-if="!isMac" class="window-controls">
      <button class="win-btn" title="Minimize" @click="minimize">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button class="win-btn" title="Maximize" @click="maximize">
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12">
          <rect x="2.5" y="0.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="0.5" y="2.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="win-btn win-close" title="Close" @click="close">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ipcOn } from '../ipcListen'

const isMac = computed(() => window.electron?.platform === 'darwin')
const isMaximized = ref(false)

const minimize = () => window.electron.ipcRenderer.invoke('window-minimize')
const maximize = () => window.electron.ipcRenderer.invoke('window-maximize')
const close = () => window.electron.ipcRenderer.invoke('window-close')

let cleanup = null

onMounted(async () => {
  try {
    isMaximized.value = await window.electron.ipcRenderer.invoke('window-is-maximized')
  } catch {}
  cleanup = ipcOn('window-maximized-changed', (val) => {
    isMaximized.value = val
  })
})

onUnmounted(() => { if (cleanup) cleanup() })
</script>

<style scoped>
.custom-titlebar {
  display: flex;
  align-items: center;
  height: 36px;
  background: #0a0a0a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  user-select: none;
  flex-shrink: 0;
  position: relative;
  z-index: 100000;
}

.drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 14px;
  padding-left: var(--titlebar-left-pad, 14px);
  -webkit-app-region: drag;
  height: 100%;
}

.app-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.title-text {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.3px;
}

/* Window control buttons */
.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  padding: 0;
}

.win-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.win-close:hover {
  background: #e81123;
  color: #fff;
}

/* Double-click on drag region to maximize */
.drag-region {
  -webkit-app-region: drag;
}

/* Light theme */
[data-theme="light"] .custom-titlebar {
  background: #e8e8ed;
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .title-text {
  color: rgba(0, 0, 0, 0.45);
}

[data-theme="light"] .win-btn {
  color: rgba(0, 0, 0, 0.55);
}

[data-theme="light"] .win-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

[data-theme="light"] .win-close:hover {
  background: #e81123;
  color: #fff;
}

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .custom-titlebar {
  background: #050510;
  border-bottom: 1px solid rgba(0, 240, 255, 0.08);
}
[data-theme="futuristic"] .title-text {
  color: rgba(0, 240, 255, 0.4);
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.1);
}
[data-theme="futuristic"] .win-btn {
  color: rgba(0, 240, 255, 0.45);
}
[data-theme="futuristic"] .win-btn:hover {
  background: rgba(0, 240, 255, 0.08);
  color: #00f0ff;
}
[data-theme="futuristic"] .win-close:hover {
  background: #ff4d6a;
  color: #fff;
  box-shadow: 0 0 12px rgba(255, 77, 106, 0.3);
}
</style>