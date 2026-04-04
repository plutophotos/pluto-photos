<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3>{{ title }}</h3>
      <p class="modal-subtitle" v-if="mode === 'album'">Adding to project...</p>
      
      <input 
        ref="nameInput"
        v-model="name" 
        class="modal-input" 
        :placeholder="placeholder" 
        @keyup.enter="confirm"
      />

      <div class="modal-actions">
        <button class="btn-secondary" @click="$emit('close')">Cancel</button>
        <button 
          class="btn-primary" 
          :disabled="!name.trim()" 
          @click="confirm"
        >
          Create
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  // 'project' or 'album'
  mode: {
    type: String,
    default: 'album'
  }
})

const emit = defineEmits(['close', 'confirm'])
const name = ref('')
const nameInput = ref(null)

const title = computed(() => {
  return props.mode === 'project' ? 'Create New Project' : 'Create New Album'
})

const placeholder = computed(() => {
  return props.mode === 'project' ? 'Project name (e.g. Landscapes)' : 'Album name (e.g. Summer 2024)'
})

const confirm = () => {
  const cleanName = name.value.trim();
  if (cleanName) {
    // Emit only the string, avoiding any reactivity proxies
    emit('confirm', { name: String(cleanName) });
  }
}

onMounted(() => {
  nameInput.value?.focus()
})
</script>

<style scoped>
.modal-overlay { 
  position: fixed; 
  inset: 0; 
  background: rgba(0,0,0,0.85); 
  backdrop-filter: blur(12px);
  display: flex; 
  align-items: center; 
  justify-content: center; 
  z-index: 50000; 
  animation: overlay-in 0.2s ease;
}

.modal { 
  background: rgba(20, 20, 22, 0.95); 
  padding: 24px; 
  border-radius: 16px; 
  border: 1px solid rgba(255,255,255,0.08); 
  width: 320px; 
  color: #e0e0e0; 
  box-shadow: 0 40px 100px rgba(0,0,0,0.6);
  animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.modal h3 { 
  margin: 0; 
  font-size: 18px;
  font-weight: 600;
}

.modal-subtitle {
  font-size: 12px;
  color: #666;
  margin: 4px 0 0 0;
}

.modal-input { 
  width: 100%; 
  background: #0a0a0a; 
  border: 1px solid #333; 
  color: white; 
  padding: 12px; 
  border-radius: 8px; 
  margin-top: 20px; 
  outline: none; 
  box-sizing: border-box; 
  font-size: 14px;
  transition: border-color 0.2s;
}

.modal-input:focus { 
  border-color: #0078d4; 
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #333;
  color: #aaa;
}

.btn-secondary:hover {
  background: #2c2c2e;
  color: #fff;
}

.btn-primary {
  background: #0078d4;
  border: 1px solid #0078d4;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0086ed;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep([data-theme="light"]) .modal-overlay,
:global([data-theme="light"]) .modal-overlay { background: rgba(0,0,0,0.3); }
:deep([data-theme="light"]) .modal,
:global([data-theme="light"]) .modal { background: rgba(255,255,255,0.95); border-color: rgba(0,0,0,0.1); color: #1d1d1f; }
:deep([data-theme="light"]) .modal-input,
:global([data-theme="light"]) .modal-input { background: #f5f5f7; border-color: #d2d2d7; color: #1d1d1f; }
:deep([data-theme="light"]) .modal-subtitle,
:global([data-theme="light"]) .modal-subtitle { color: #86868b; }
:deep([data-theme="light"]) .btn-secondary,
:global([data-theme="light"]) .btn-secondary { border-color: #d2d2d7; color: #666; }
:deep([data-theme="light"]) .btn-secondary:hover,
:global([data-theme="light"]) .btn-secondary:hover { background: #f0f0f0; color: #1d1d1f; }
</style>