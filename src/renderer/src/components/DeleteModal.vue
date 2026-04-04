<template>
  <Transition name="fade">
    <div v-if="show" class="modal-backdrop" @click.self="$emit('cancel')">
      <div class="modal-content">
        <div class="modal-icon">⚠️</div>
        <h2 class="modal-title">{{ title }}</h2>
        <p class="modal-message">{{ message }}</p>
        <p v-if="footnote" class="modal-footnote">{{ footnote }}</p>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="$emit('cancel')">Cancel</button>
          <button class="btn-confirm" @click="$emit('confirm')">Remove</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  show: Boolean,
  title: String,
  message: String,
  footnote: { type: String, default: '' }
})
defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(12px); display: flex; align-items: center;
  justify-content: center; z-index: 50000;
}
.modal-content {
  background: rgba(20, 20, 22, 0.95); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
  padding: 30px; width: 400px; text-align: center; box-shadow: 0 40px 100px rgba(0,0,0,0.6);
}
.modal-icon { font-size: 40px; margin-bottom: 15px; }
.modal-title { color: #fff; font-size: 18px; margin-bottom: 10px; }
.modal-message { color: #aaa; font-size: 14px; line-height: 1.5; margin-bottom: 10px; }
.modal-footnote { color: #777; font-size: 12px; font-style: italic; margin-bottom: 20px; }

.modal-actions { display: flex; gap: 12px; justify-content: center; }
button { padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; border: none; transition: all 0.2s; }

.btn-secondary { background: rgba(255,255,255,0.06); color: #eee; }
.btn-secondary:hover { background: rgba(255,255,255,0.1); }

.btn-confirm { background: #ff4d4d; color: white; }
.btn-confirm:hover { background: #ff3333; transform: scale(1.02); }

/* Transition animations */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Light theme */
:deep([data-theme="light"]) .modal-backdrop,
:global([data-theme="light"]) .modal-backdrop { background: rgba(0,0,0,0.3); }
:deep([data-theme="light"]) .modal-content,
:global([data-theme="light"]) .modal-content { background: rgba(255,255,255,0.95); border-color: rgba(0,0,0,0.1); }
:deep([data-theme="light"]) .modal-title,
:global([data-theme="light"]) .modal-title { color: #1d1d1f; }
:deep([data-theme="light"]) .modal-message,
:global([data-theme="light"]) .modal-message { color: #666; }
:deep([data-theme="light"]) .modal-footnote,
:global([data-theme="light"]) .modal-footnote { color: #999; }
:deep([data-theme="light"]) .btn-secondary,
:global([data-theme="light"]) .btn-secondary { background: #f0f0f0; color: #333; }
:deep([data-theme="light"]) .btn-secondary:hover,
:global([data-theme="light"]) .btn-secondary:hover { background: #e0e0e0; }
</style>