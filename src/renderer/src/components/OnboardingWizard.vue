<template>
  <Teleport to="body">
    <div class="onboarding-overlay" @click.self="skipIfAllowed">
      <div class="onboarding-card">
        <!-- Progress dots -->
        <div class="progress-dots">
          <span 
            v-for="(_, i) in steps" 
            :key="i" 
            class="dot" 
            :class="{ active: i === currentStep, completed: i < currentStep }"
          ></span>
        </div>

        <!-- Step content -->
        <Transition name="step" mode="out-in">
          <div :key="currentStep" class="step-content">
            <!-- Step 0: Welcome -->
            <div v-if="currentStep === 0" class="step-welcome">
              <div class="welcome-icon">🪐</div>
              <h1>{{ t('welcomeTo') }}</h1>
              <p class="subtitle">{{ t('welcomeSubtitle') }}</p>
              <p class="description">
                {{ t('welcomeDesc') }}
              </p>
            </div>

            <!-- Step 1: Import -->
            <div v-if="currentStep === 1" class="step-import">
              <div class="step-icon">📁</div>
              <h2>{{ t('importYourPhotos') }}</h2>
              <p class="description">
                {{ t('importDesc') }}
              </p>
              <div class="feature-list">
                <div class="feature-item">
                  <span class="feature-icon">🖼️</span>
                  <span>{{ t('ob_importFormats') }}</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">🎬</span>
                  <span>{{ t('ob_importVideos') }}</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">☁️</span>
                  <span>{{ t('ob_importCloud') }}</span>
                </div>
              </div>
              <button class="btn-import-now" @click="$emit('import-folder')">
                <span class="icon">+</span> {{ t('importFolderNow') }}
              </button>
              <button class="btn-skip-import" @click="nextStep">{{ t('doLater') }}</button>
            </div>

            <!-- Step 2: Key Features Overview (consolidated) -->
            <div v-if="currentStep === 2" class="step-organize">
              <div class="step-icon">✨</div>
              <h2>{{ t('ob_featuresOverview') || 'Key Features' }}</h2>
              <p class="description">
                {{ t('ob_featuresOverviewDesc') || 'Everything you need to manage your photo library.' }}
              </p>
              <div class="concept-grid three-col">
                <div class="concept-card">
                  <div class="concept-icon">🗂️</div>
                  <h3>{{ t('ob_albums') }}</h3>
                  <p>{{ t('albumsExplain') }}</p>
                </div>
                <div class="concept-card">
                  <div class="concept-icon">⭐</div>
                  <h3>{{ t('ob_tagsTitle') }}</h3>
                  <p>{{ t('ob_quickTagsDesc') || 'Rate, tag, and label photos for fast filtering.' }}</p>
                </div>
                <div class="concept-card">
                  <div class="concept-icon">👤</div>
                  <h3>{{ t('ob_peopleTitle') }}</h3>
                  <p>{{ t('ob_peopleScanDesc') }}</p>
                </div>
                <div class="concept-card">
                  <div class="concept-icon">🗺️</div>
                  <h3>{{ t('ob_mapTitle') }}</h3>
                  <p>{{ t('ob_mapDesc') }}</p>
                </div>
                <div class="concept-card">
                  <div class="concept-icon">🛠️</div>
                  <h3>{{ t('ob_toolsTitle') }}</h3>
                  <p>{{ t('ob_toolsDesc') }}</p>
                </div>
                <div class="concept-card">
                  <div class="concept-icon">📱</div>
                  <h3>{{ t('mobileTitle') }}</h3>
                  <p>{{ t('ob_mobileTip') }}</p>
                </div>
              </div>
            </div>

            <!-- Step 3: Ready -->
            <div v-if="currentStep === 3" class="step-ready">
              <div class="welcome-icon">🚀</div>
              <h1>{{ t('readyTitle') }}</h1>
              <p class="description">
                {{ t('readyDesc') }}
              </p>
              <div class="shortcut-grid" style="margin-top: 16px;">
                <div class="shortcut-row">
                  <kbd>Double-click</kbd>
                  <span>{{ t('ob_shortcutLightbox') }}</span>
                </div>
                <div class="shortcut-row">
                  <kbd>← →</kbd>
                  <span>{{ t('ob_shortcutNav') }}</span>
                </div>
                <div class="shortcut-row">
                  <kbd>Right-click</kbd>
                  <span>{{ t('ob_shortcutContext') }}</span>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Navigation -->
        <div class="nav-buttons">
          <button v-if="currentStep > 0" class="btn-back" @click="prevStep">{{ t('back') }}</button>
          <div class="nav-spacer"></div>
          <button v-if="currentStep < steps.length - 1" class="btn-next" @click="nextStep">
            {{ currentStep === 0 ? t('letsGo') : t('next') }}
          </button>
          <button v-else class="btn-finish" @click="finish">{{ t('startUsing') }}</button>
        </div>

        <!-- Skip link -->
        <button v-if="currentStep < steps.length - 1" class="btn-skip" @click="finish">
          {{ t('skipSetup') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '../useI18n'

const { t } = useI18n()
const isMac = computed(() => window.electron?.platform === 'darwin')

const steps = ref([0, 1, 2, 3])
const currentStep = ref(0)

const emit = defineEmits(['complete', 'import-folder'])

const nextStep = () => {
  if (currentStep.value < steps.value.length - 1) currentStep.value++
}

const prevStep = () => {
  if (currentStep.value > 0) currentStep.value--
}

const finish = async () => {
  try {
    await window.electron.ipcRenderer.invoke('set-setting', { key: 'onboardingComplete', value: true })
  } catch {}
  emit('complete')
}

const skipIfAllowed = () => {
  // Don't close on outside click
}
</script>

<style scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.onboarding-card {
  background: #0a0a0a;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 40px 36px 32px;
  max-width: 520px;
  width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.onboarding-card::-webkit-scrollbar { width: 4px; }
.onboarding-card::-webkit-scrollbar-track { background: transparent; }
.onboarding-card::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }

.progress-dots {
  display: flex;
  gap: 6px;
  margin-bottom: 28px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  transition: all 0.3s ease;
}

.dot.active {
  background: #58a6ff;
  width: 20px;
  border-radius: 3px;
}

.dot.completed {
  background: #58a6ff;
  opacity: 0.5;
}

.step-content {
  width: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.welcome-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.step-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f5f5f7;
  margin: 0 0 6px 0;
}

h2 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #f5f5f7;
  margin: 0 0 6px 0;
}

.subtitle {
  font-size: 15px;
  color: #86868b;
  margin: 0 0 12px 0;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-weight: 600;
}

.description {
  font-size: 14px;
  color: #a1a1a6;
  line-height: 1.7;
  margin: 0 0 20px 0;
  max-width: 420px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 400px;
  margin: 0 auto 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font-size: 13px;
  color: #a1a1a6;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  padding: 11px 16px;
  border-radius: 8px;
  transition: background 0.15s;
}

.feature-item:hover {
  background: rgba(255,255,255,0.05);
}

.feature-icon { font-size: 16px; flex-shrink: 0; }

.concept-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  width: 100%;
  max-width: 420px;
  margin: 0 auto 14px;
}

.concept-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 18px 14px;
  text-align: center;
  transition: border-color 0.2s;
}

.concept-card:hover {
  border-color: rgba(88, 166, 255, 0.2);
}

.concept-icon { font-size: 24px; margin-bottom: 8px; }
.concept-card h3 { font-size: 13px; font-weight: 600; color: #f5f5f7; margin: 0 0 4px 0; }
.concept-card p { font-size: 12px; color: #86868b; line-height: 1.5; margin: 0; }

.concept-grid.three-col {
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.concept-grid.three-col .concept-card {
  padding: 14px 10px;
}
.concept-grid.three-col .concept-icon { font-size: 22px; }
.concept-grid.three-col h3 { font-size: 12px; }
.concept-grid.three-col p { font-size: 11px; }

.shortcut-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.shortcut-row:last-child { border-bottom: none; }
.shortcut-row span { font-size: 13px; color: #a1a1a6; }

kbd {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 4px 10px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  color: #a1a1a6;
  min-width: 100px;
  text-align: center;
}

.tip {
  font-size: 12px;
  color: #86868b;
  font-style: normal;
  margin-top: 6px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

/* Buttons */
.btn-import-now {
  background: transparent;
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.btn-import-now:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
}

.btn-import-now .icon { font-size: 16px; font-weight: 700; }

.btn-skip-import {
  background: none;
  border: none;
  color: #86868b;
  font-size: 13px;
  cursor: pointer;
  margin-top: 10px;
  padding: 4px;
  transition: color 0.15s;
}

.btn-skip-import:hover { color: #a1a1a6; }

.nav-buttons {
  display: flex;
  align-items: center;
  width: 100%;
  margin-top: 24px;
  gap: 10px;
}

.nav-spacer { flex: 1; }

.btn-back {
  background: transparent;
  color: #636366;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-back:hover {
  background: rgba(255,255,255,0.04);
  color: #999;
  border-color: rgba(255,255,255,0.12);
}

.btn-next, .btn-finish {
  background: transparent;
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  padding: 8px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-next:hover, .btn-finish:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
}

.btn-finish {
  color: #4ade80;
  border-color: rgba(74, 222, 128, 0.3);
}

.btn-finish:hover {
  background: rgba(74, 222, 128, 0.1);
  border-color: #4ade80;
}

.btn-skip {
  background: none;
  border: none;
  color: #636366;
  font-size: 12px;
  cursor: pointer;
  margin-top: 12px;
  padding: 4px;
  transition: color 0.15s;
}

.btn-skip:hover { color: #86868b; }

/* Step transition */
.step-enter-active, .step-leave-active {
  transition: all 0.2s ease;
}

.step-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.step-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
