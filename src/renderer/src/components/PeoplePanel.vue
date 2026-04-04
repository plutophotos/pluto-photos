<template>
  <Teleport to="body">
    <div class="people-overlay" @click.self="$emit('close')">
      <div class="people-panel">
        <div class="panel-header">
          <h2>People</h2>
          <div class="header-actions">
            <button v-if="scanning" class="action-btn cancel-btn" @click="cancelScan">
              Cancel
            </button>
            <button v-if="reviewSummary.count > 0 && !scanning" class="action-btn review-btn" @click="reviewUncertainFaces">
              Review {{ reviewSummary.count }} Uncertain
            </button>
            <button class="action-btn" @click="scanForFaces" :disabled="scanning">
              {{ scanning ? scanProgress : (people.length > 0 ? 'Scan New Photos' : 'Scan Library') }}
            </button>
            <button v-if="people.length > 0 && !scanning" class="action-btn rescan-btn" @click="rescanAll" title="Clear all face data and rescan with improved accuracy">
              Rescan All
            </button>
            <button class="btn-close" @click="$emit('close')">✕</button>
          </div>
        </div>

        <div class="panel-body">
          <!-- Merge Mode -->
          <div v-if="mergeMode" class="merge-bar">
            <span>Select a person to merge "{{ mergeSource?.name }}" into:</span>
            <button class="action-btn sm" @click="mergeMode = false; mergeSource = null">Cancel</button>
          </div>

          <div v-if="people.length === 0 && !scanning" class="empty-state">
            <div class="empty-icon"><User :size="48" /></div>
            <p>No people detected yet.</p>
            <p class="hint">Click "Scan Library" to detect faces in your photos.</p>
            <br>
            <br>
            <p class="hint sub">Face detection runs entirely offline using locally bundled models.</p>
          </div>

          <div class="people-grid" v-else>
            <div 
              v-for="person in people" :key="person.id" 
              class="person-card"
              :class="{ 'merge-target': mergeMode && mergeSource?.id !== person.id }"
              @click="handlePersonClick(person)"
            >
              <div class="person-avatar">
                <img v-if="person.sample_face_path" :src="personAvatarSrc(person)" class="face-img" />
                <div v-else class="face-placeholder"><User :size="24" /></div>
              </div>
              <div class="person-info">
                <div v-if="editingId === person.id" class="name-edit">
                  <input 
                    v-model="editName" 
                    class="name-input" 
                    @keydown.enter="saveName(person)" 
                    @keydown.esc="editingId = null"
                    ref="nameInput"
                  />
                  <button class="save-btn" @click.stop="saveName(person)">✓</button>
                </div>
                <span v-else class="person-name" @dblclick.stop="startEdit(person)">
                  {{ person.name || 'Unknown' }}
                </span>
                <span class="photo-count">{{ person.face_count || 0 }} photos</span>
              </div>
              <div class="person-actions">
                <button class="icon-btn-sm" @click.stop="startEdit(person)" title="Rename"><Pencil :size="16" /></button>
                <button class="icon-btn-sm" @click.stop="reviewFaces(person)" title="Review Faces"><Search :size="16" /></button>
                <button class="icon-btn-sm" @click.stop="startMerge(person)" title="Merge"><Merge :size="16" /></button>
                <button class="icon-btn-sm" @click.stop="browsePerson(person)" title="Browse"><Camera :size="16" /></button>
              </div>
            </div>
          </div>

          <!-- Face Review Mode -->
          <div v-if="reviewPerson" class="face-review">
            <div class="review-header">
              <button class="action-btn sm" @click="reviewPerson = null; reviewFacesList = []">← Back</button>
              <h3>{{ reviewPerson.reviewMode ? 'Review uncertain faces' : `Reviewing faces for "${reviewPerson.name || 'Unknown'}"` }}</h3>
              <span class="face-count-label">{{ reviewFacesList.length }} faces</span>
            </div>
            <p class="review-hint">{{ reviewPerson.reviewMode ? 'These matches were close enough to suggest, but not strong enough to auto-assign. Confirm them here.' : 'Click a face to preview the full photo. Remove incorrect detections or reassign faces to a different person.' }}</p>
            <div v-if="reviewLoading" class="review-loading">
              <div class="review-spinner"></div>
              <span>Generating face crops...</span>
            </div>
            <div v-else class="faces-virtual-scroll" ref="facesScrollRef" @scroll="onFacesScroll">
              <div :style="{ height: topSpacerHeight + 'px' }" class="faces-spacer"></div>
              <div class="faces-grid">
                <div v-for="face in windowFaces" :key="face.faceId" class="face-card">
                  <div class="face-crop-container" @click="openPreview(face)">
                    <img :src="face.faceCrop || face.thumb" class="face-crop-img" loading="lazy" decoding="async" />
                    <div class="face-hover-overlay">
                      <span class="hover-label">Preview</span>
                    </div>
                  </div>
                  <div class="face-card-bottom">
                    <span class="face-filename" :title="face.imageName">{{ face.imageName }}</span>
                    <span v-if="face.matchScore" class="face-match-hint">{{ face.suggestedPersonName ? `Suggested: ${face.suggestedPersonName}` : 'Needs review' }} • {{ Math.round(face.matchScore * 100) }}%</span>
                    <div class="face-card-actions">
                      <select class="reassign-select" @change="reassignFace(face, $event)" :value="face.personId || face.suggestedPersonId || '__none__'">
                        <option v-if="!face.personId && !face.suggestedPersonId" value="__none__" disabled>Select person...</option>
                        <option v-if="!face.personId && face.suggestedPersonId" :value="face.suggestedPersonId">Suggested: {{ face.suggestedPersonName || `Person #${face.suggestedPersonId}` }}</option>
                        <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name || 'Unknown' }}</option>
                        <option value="__new__">＋ New Person...</option>
                      </select>
                      <button class="btn-set-avatar" @click="setAsAvatar(face)" :disabled="!avatarTargetPersonId(face)" title="Use as person photo">
                        <User :size="14" />
                      </button>
                      <button class="btn-remove-face" @click="deleteFace(face)" title="Remove incorrect detection">✕</button>
                    </div>
                    <div v-if="newPersonFaceId === face.faceId" class="new-person-inline">
                      <input
                        v-model="newPersonName"
                        class="new-person-input"
                        placeholder="Enter name..."
                        @keydown.enter="confirmNewPerson(face)"
                        @keydown.esc="newPersonFaceId = null; newPersonName = ''"
                        ref="newPersonInput"
                        autofocus
                      />
                      <button class="save-btn" @click="confirmNewPerson(face)">✓</button>
                      <button class="btn-remove-face" @click="newPersonFaceId = null; newPersonName = ''">✕</button>
                    </div>
                  </div>
                </div>
              </div>
              <div :style="{ height: bottomSpacerHeight + 'px' }" class="faces-spacer"></div>
            </div>
          </div>

          <!-- Face Preview Lightbox -->
          <Teleport to="body">
            <div v-if="previewFace" class="face-preview-overlay" @click.self="previewFace = null">
              <div class="face-preview-panel">
                <div class="preview-header">
                  <span class="preview-filename">{{ previewFace.imageName }}</span>
                  <div class="preview-actions">
                    <button class="action-btn sm" @click="setAsAvatar(previewFace); previewFace = null" :disabled="!avatarTargetPersonId(previewFace)" title="Use this face as the person's photo">
                      <User :size="14" style="margin-right:4px" /> Set as Avatar
                    </button>
                    <button class="btn-close" @click="previewFace = null">✕</button>
                  </div>
                </div>
                <div class="preview-body">
                  <div class="preview-img-wrapper">
                    <img :src="previewFace.original || previewFace.thumb" class="preview-full-img" />
                    <div
                      v-if="previewImgSize.width > 0"
                      class="face-box-overlay"
                      :style="faceBoxStyle"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </Teleport>

          <!-- Scanning progress bar -->
          <div v-if="scanning && scanTotal > 0" class="scan-progress-bar">
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: scanPercent + '%' }"></div>
            </div>
            <div class="progress-details">
              <span>{{ scanProcessed }}/{{ scanTotal }} images</span>
              <span>{{ facesFound }} faces found</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, computed, nextTick, onBeforeUnmount } from 'vue'
import { User, Pencil, Search, Merge, Camera } from 'lucide-vue-next'

const GRID_COLS = 3
const ROW_HEIGHT = 260
const BUFFER_ROWS = 3

const props = defineProps({
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'browse-person'])

const people = ref([])
const scanning = ref(false)
const scanProgress = ref('')
const scanProcessed = ref(0)
const scanTotal = ref(0)
const facesFound = ref(0)
const scanCancelled = ref(false)
const reviewSummary = ref({ count: 0 })
const editingId = ref(null)
const editName = ref('')
const mergeMode = ref(false)
const mergeSource = ref(null)
const reviewPerson = ref(null)
const reviewFacesList = ref([])
const facesScrollTop = ref(0)
const facesViewHeight = ref(400)
const facesScrollRef = ref(null)
const newPersonFaceId = ref(null)
const newPersonName = ref('')
const previewFace = ref(null)
const previewImgSize = ref({ width: 0, height: 0 })
const reviewLoading = ref(false)
const avatarRefreshTokens = ref({})

const totalGridRows = computed(() => Math.ceil(reviewFacesList.value.length / GRID_COLS))
const totalGridHeight = computed(() => totalGridRows.value * ROW_HEIGHT)

const visibleRowRange = computed(() => {
  const startRow = Math.max(0, Math.floor(facesScrollTop.value / ROW_HEIGHT) - BUFFER_ROWS)
  const endRow = Math.min(totalGridRows.value, Math.ceil((facesScrollTop.value + facesViewHeight.value) / ROW_HEIGHT) + BUFFER_ROWS)
  return { startRow, endRow }
})

const topSpacerHeight = computed(() => visibleRowRange.value.startRow * ROW_HEIGHT)
const bottomSpacerHeight = computed(() => Math.max(0, (totalGridRows.value - visibleRowRange.value.endRow) * ROW_HEIGHT))

const windowFaces = computed(() => {
  const { startRow, endRow } = visibleRowRange.value
  return reviewFacesList.value.slice(startRow * GRID_COLS, endRow * GRID_COLS)
})

const onFacesScroll = (e) => {
  facesScrollTop.value = e.target.scrollTop
}

const scanPercent = computed(() => scanTotal.value > 0 ? Math.round((scanProcessed.value / scanTotal.value) * 100) : 0)

let faceModelPath = null
let faceapi = null

const avatarTargetPersonId = (face) => face?.personId || face?.suggestedPersonId || null

const personAvatarSrc = (person) => {
  if (!person?.sample_face_path) return ''
  const token = avatarRefreshTokens.value[person.id] || 0
  return `pluto://${person.sample_face_path}?v=${token}`
}

const loadFaceApi = async () => {
  if (faceapi) return faceapi
  faceapi = await import('@vladmandic/face-api')
  return faceapi
}

const MAX_DETECT_DIM = 1600

const getDetectMaxDim = (img) => {
  const longest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)
  if (longest >= 6000) return 1152
  if (longest >= 4200) return 1280
  if (longest >= 2800) return 1440
  return MAX_DETECT_DIM
}

const yieldToUi = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

const loadImage = (filePath) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = `pluto://${filePath}`
  })
}

/**
 * Create a scaled canvas from an image element.
 */
const makeCanvas = (img, maxDim) => {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const longest = Math.max(w, h)
  const scale = longest > maxDim ? maxDim / longest : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx, scale }
}

/**
 * Compute IoU (intersection over union) between two boxes.
 */
const boxIoU = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = a.width * a.height, areaB = b.width * b.height
  return inter / (areaA + areaB - inter)
}

/**
 * Apply gamma correction to a canvas — gamma < 1 brightens dark areas
 * while barely touching bright areas. Useful for recovering partially-shadowed faces.
 */
const gammaCorrect = (srcCanvas, gamma) => {
  const w = srcCanvas.width, h = srcCanvas.height
  const dst = document.createElement('canvas')
  dst.width = w; dst.height = h
  const srcCtx = srcCanvas.getContext('2d')
  const dstCtx = dst.getContext('2d')
  const imgData = srcCtx.getImageData(0, 0, w, h)
  const data = imgData.data
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]; data[i+1] = lut[data[i+1]]; data[i+2] = lut[data[i+2]]
  }
  dstCtx.putImageData(imgData, 0, 0)
  return dst
}

/**
 * Validate that detected face landmarks form a plausible forward-facing face.
 * Backs of heads will fail because the landmark model places features in
 * nonsensical positions when there are no real facial features to anchor to.
 */
const isValidFaceLandmarks = (det) => {
  try {
    const lm = det.landmarks
    const box = det.detection.box
    const avg = (pts) => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length
    })
    const leC = avg(lm.getLeftEye())
    const reC = avg(lm.getRightEye())
    const nC = avg(lm.getNose())
    const mC = avg(lm.getMouth())
    const eyeY = (leC.y + reC.y) / 2
    // Eyes must be above mouth (y increases downward)
    if (eyeY >= mC.y) return false
    // Nose must be between eyes and mouth vertically
    if (nC.y <= eyeY || nC.y >= mC.y) return false
    // Inter-eye distance must be >= 20% of face width (rejects pareidolia / dolls)
    const interEye = Math.abs(leC.x - reC.x)
    if (interEye < box.width * 0.20) return false
    // Vertical eyes-to-mouth distance must be >= 20% of face height
    const eyeToMouth = mC.y - eyeY
    if (eyeToMouth < box.height * 0.20) return false
    // Nose should be roughly centred horizontally between the eyes
    const eyeMidX = (leC.x + reC.x) / 2
    if (Math.abs(nC.x - eyeMidX) > interEye * 0.8) return false
    // Landmark spread: the jaw outline must span a reasonable fraction of the box
    const jaw = lm.getJawOutline()
    const jawXs = jaw.map(p => p.x)
    const jawSpan = Math.max(...jawXs) - Math.min(...jawXs)
    if (jawSpan < box.width * 0.40) return false
    return true
  } catch { return false }
}

/**
 * Face detection: SSD MobileNet v1 with landmark validation.
 * Only forward-facing faces pass the landmark geometry check.
 */
const detectFacesMultiPass = async (img, faceapi) => {
  const { canvas: normalCanvas, scale: baseScale } = makeCanvas(img, getDetectMaxDim(img))

  const ssdOpts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.50 })

  let allDets
  try {
    allDets = await faceapi.detectAllFaces(normalCanvas, ssdOpts).withFaceLandmarks()
    console.log(`[FaceDetect] SSD: ${allDets.length} face(s)`)
  } catch (e) {
    console.warn(`[FaceDetect] SSD failed:`, e.message)
    allDets = []
  }

  // If no faces found, retry with gamma-corrected (brightened) image
  if (allDets.length === 0) {
    try {
      const brightCanvas = gammaCorrect(normalCanvas, 0.6)
      const brightDets = await faceapi.detectAllFaces(brightCanvas, ssdOpts).withFaceLandmarks()
      if (brightDets.length > 0) {
        console.log(`[FaceDetect] Gamma pass found ${brightDets.length} face(s)`)
        allDets = brightDets
      }
    } catch {}
  }

  // Filter: min face size
  allDets = allDets.filter(d => d.detection.box.width >= 40 && d.detection.box.height >= 40)

  // Filter: landmark validation — reject backs of heads / non-faces
  const before = allDets.length
  allDets = allDets.filter(isValidFaceLandmarks)
  if (allDets.length < before) {
    console.log(`[FaceDetect] Landmark validation rejected ${before - allDets.length} non-face(s)`)
  }

  console.log(`[FaceDetect] Final: ${allDets.length} face(s)`)
  return { detections: allDets, scale: baseScale }
}

const loadPeople = async () => {
  try {
    people.value = await window.electron.ipcRenderer.invoke('get-people')
  } catch {}
}

const loadReviewSummary = async () => {
  try {
    reviewSummary.value = await window.electron.ipcRenderer.invoke('get-face-review-summary')
  } catch {
    reviewSummary.value = { count: 0 }
  }
}

const startEdit = (person) => {
  editingId.value = person.id
  editName.value = person.name || ''
}

const saveName = async (person) => {
  const name = editName.value.trim()
  if (name) {
    await window.electron.ipcRenderer.invoke('rename-person', { id: person.id, name })
    await loadPeople()
  }
  editingId.value = null
}

const startMerge = (person) => {
  mergeSource.value = person
  mergeMode.value = true
}

const handlePersonClick = async (person) => {
  if (mergeMode.value && mergeSource.value) {
    if (person.id === mergeSource.value.id) return
    await window.electron.ipcRenderer.invoke('merge-people', {
      keepId: person.id,
      mergeId: mergeSource.value.id
    })
    mergeMode.value = false
    mergeSource.value = null
    await loadPeople()
  }
}

const browsePerson = (person) => {
  emit('browse-person', person)
}

const cancelScan = () => {
  scanCancelled.value = true
}

const rescanAll = async () => {
  if (!confirm('This will clear all existing face data and rescan every photo. Continue?')) return
  try {
    await window.electron.ipcRenderer.invoke('reset-face-data')
    people.value = []
    scanProgress.value = ''
    await scanForFaces()
  } catch (err) {
    console.error('Rescan failed:', err)
    scanProgress.value = 'Rescan failed: ' + err.message
  }
}

const reviewFaces = async (person) => {
  reviewPerson.value = person
  reviewLoading.value = true
  facesScrollTop.value = 0
  reviewFacesList.value = []
  try {
    reviewFacesList.value = await window.electron.ipcRenderer.invoke('get-person-faces', { personId: person.id })
  } catch (err) {
    console.error('Failed to load faces:', err)
    reviewFacesList.value = []
  }
  reviewLoading.value = false
  await nextTick()
  if (facesScrollRef.value) {
    facesScrollRef.value.scrollTop = 0
    facesViewHeight.value = facesScrollRef.value.clientHeight || 400
  }
}

const reviewUncertainFaces = async () => {
  reviewPerson.value = { id: '__review__', name: 'Needs Review', reviewMode: true }
  reviewLoading.value = true
  facesScrollTop.value = 0
  reviewFacesList.value = []
  try {
    reviewFacesList.value = await window.electron.ipcRenderer.invoke('get-face-review-queue')
  } catch (err) {
    console.error('Failed to load review queue:', err)
    reviewFacesList.value = []
  }
  reviewLoading.value = false
  await nextTick()
  if (facesScrollRef.value) {
    facesScrollRef.value.scrollTop = 0
    facesViewHeight.value = facesScrollRef.value.clientHeight || 400
  }
}

const faceCropStyle = (face) => {
  // Use object-fit cover and position to center on the face region
  if (!face.width || !face.height) return { objectFit: 'cover' }
  // Calculate center of face as percentage of original image dimensions
  // We approximate: shift the image so the face center is in view
  const cx = face.x + face.width / 2
  const cy = face.y + face.height / 2
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${cx}px ${cy}px`
  }
}

const reassignFace = async (face, event) => {
  const val = event.target.value

  if (val === '__new__') {
    // Show inline input for new person name
    newPersonFaceId.value = face.faceId
    newPersonName.value = ''
    event.target.value = face.personId // reset dropdown while input shows
    return
  }

  const newPersonId = Number(val)
  if (!newPersonId) return
  if (newPersonId === face.personId) return
  await doReassign(face, newPersonId)
}

const confirmNewPerson = async (face) => {
  const name = newPersonName.value.trim()
  if (!name) return
  try {
    const created = await window.electron.ipcRenderer.invoke('create-person', { name })
    newPersonFaceId.value = null
    newPersonName.value = ''
    await doReassign(face, created.id)
  } catch (err) {
    console.error('Create person failed:', err)
  }
}

const doReassign = async (face, newPersonId) => {
  try {
    await window.electron.ipcRenderer.invoke('reassign-face', { faceId: face.faceId, newPersonId })
    face.personId = newPersonId
    face.suggestedPersonId = null
    await loadPeople()
    await loadReviewSummary()
    if (reviewPerson.value) {
      reviewFacesList.value = reviewFacesList.value.filter(f => f.faceId !== face.faceId)
    }
  } catch (err) {
    console.error('Reassign failed:', err)
  }
}

const deleteFace = async (face) => {
  try {
    await window.electron.ipcRenderer.invoke('delete-face', { faceId: face.faceId })
    reviewFacesList.value = reviewFacesList.value.filter(f => f.faceId !== face.faceId)
    await loadPeople()
    await loadReviewSummary()
  } catch (err) {
    console.error('Delete face failed:', err)
  }
}

const openPreview = (face) => {
  previewFace.value = face
  previewImgSize.value = { width: 0, height: 0 }
  // Load the full image to get natural dimensions for box overlay
  const img = new Image()
  img.onload = () => { previewImgSize.value = { width: img.naturalWidth, height: img.naturalHeight } }
  img.src = face.original || face.thumb
}

const faceBoxStyle = computed(() => {
  const face = previewFace.value
  const sz = previewImgSize.value
  if (!face || !sz.width || !sz.height) return { display: 'none' }
  const pad = Math.max(face.width, face.height) * 0.1
  return {
    left: ((face.x - pad) / sz.width * 100) + '%',
    top: ((face.y - pad) / sz.height * 100) + '%',
    width: ((face.width + pad * 2) / sz.width * 100) + '%',
    height: ((face.height + pad * 2) / sz.height * 100) + '%'
  }
})

const setAsAvatar = async (face) => {
  const personId = avatarTargetPersonId(face)
  if (!personId) return
  try {
    const result = await window.electron.ipcRenderer.invoke('set-person-avatar', { personId, faceId: face.faceId })
    if (result?.success === false) return
    avatarRefreshTokens.value = {
      ...avatarRefreshTokens.value,
      [personId]: Date.now(),
    }
    await loadPeople()
  } catch (err) {
    console.error('Set avatar failed:', err)
  }
}

const scanForFaces = async () => {
  scanning.value = true
  scanCancelled.value = false
  scanProcessed.value = 0
  scanTotal.value = 0
  facesFound.value = 0
  scanProgress.value = 'Loading face detection engine...'
  
  try {
    // 1. Load face-api.js
    const faceapi = await loadFaceApi()
    
    // 2. Load detection models from local bundled models
    scanProgress.value = 'Loading detection models...'
    if (!faceModelPath) {
      faceModelPath = await window.electron.ipcRenderer.invoke('get-face-model-path')
    }
    const modelUri = 'pluto://' + faceModelPath.replace(/\\/g, '/')
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelUri),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUri),
    ])
    
    // 3. Get all unscanned image paths from main process
    scanProgress.value = 'Preparing images...'
    const imagePaths = await window.electron.ipcRenderer.invoke('get-all-image-paths-for-scan', {})
    scanTotal.value = imagePaths.length
    
    if (imagePaths.length === 0) {
      scanProgress.value = 'All images already scanned!'
      setTimeout(() => { scanning.value = false }, 1500)
      return
    }
    
    // 4. Process each image — multi-pass detection (SSD + equalized + TinyFaceDetector)
    
    for (const filePath of imagePaths) {
      if (scanCancelled.value) {
        scanProgress.value = 'Cancelled'
        break
      }
      
      try {
        if (scanProcessed.value % 4 === 0) await yieldToUi()
        const img = await loadImage(filePath)
        const fname = filePath.split(/[\\/]/).pop()
        console.log(`[FaceDetect] === Scanning: ${fname} (${img.naturalWidth}x${img.naturalHeight}) ===`)
        const { detections, scale } = await detectFacesMultiPass(img, faceapi)
        
        if (detections.length > 0) {
          const faces = detections
            .filter(d => d.detection.box.width >= 20 && d.detection.box.height >= 20)
            .map(d => {
              const pts = d.landmarks.positions
              // Average 6-point eye regions to find centre
              const avgPt = (indices) => {
                let sx = 0, sy = 0
                for (const i of indices) { sx += pts[i].x; sy += pts[i].y }
                return [sx / indices.length / scale, sy / indices.length / scale]
              }
              return {
                x: Math.round(d.detection.box.x / scale),
                y: Math.round(d.detection.box.y / scale),
                width: Math.round(d.detection.box.width / scale),
                height: Math.round(d.detection.box.height / scale),
                landmarks: [
                  avgPt([36, 37, 38, 39, 40, 41]),  // left eye centre
                  avgPt([42, 43, 44, 45, 46, 47]),  // right eye centre
                  [pts[30].x / scale, pts[30].y / scale],  // nose tip
                  [pts[48].x / scale, pts[48].y / scale],  // left mouth corner
                  [pts[54].x / scale, pts[54].y / scale],  // right mouth corner
                ]
              }
            })
          
          await window.electron.ipcRenderer.invoke('save-detected-faces', {
            imagePath: filePath,
            faces
          })
          facesFound.value += faces.length
        } else {
          // Mark image as scanned even if no faces found (save empty entry to prevent re-scan)
          await window.electron.ipcRenderer.invoke('save-detected-faces', {
            imagePath: filePath,
            faces: []
          })
        }
      } catch (scanErr) {
        // Log images that fail to load or process
        const fname = filePath.split(/[\\/]/).pop()
        console.warn(`[FaceDetect] SKIPPED ${fname}:`, scanErr.message || scanErr)
      }
      
      scanProcessed.value++
      scanProgress.value = `Scanning... ${scanPercent.value}% • ${facesFound.value} faces`
      
      // Periodically merge similar people and refresh the list during scanning
      if (scanProcessed.value % 100 === 0) {
        try { await window.electron.ipcRenderer.invoke('auto-merge-people') } catch {}
        await loadPeople()
        await loadReviewSummary()
      }
    }
    
    if (!scanCancelled.value) {
      scanProgress.value = 'Merging similar people...'
      try {
        const mergeResult = await window.electron.ipcRenderer.invoke('auto-merge-people')
        if (mergeResult.merged > 0) {
          scanProgress.value = `Done! Found ${facesFound.value} faces, merged ${mergeResult.merged} duplicates`
        } else {
          scanProgress.value = `Done! Found ${facesFound.value} faces`
        }
      } catch {
        scanProgress.value = `Done! Found ${facesFound.value} faces`
      }
    }
  } catch (err) {
    console.error('Face scan failed:', err)
    scanProgress.value = 'Error: ' + err.message
  } finally {
    scanning.value = false
    await loadPeople()
    await loadReviewSummary()
  }
}

onMounted(async () => {
  await Promise.all([loadPeople(), loadReviewSummary()])
})
</script>

<style scoped>
/* Base box-sizing for all elements in this component */
.people-overlay *,
.people-overlay *::before,
.people-overlay *::after { box-sizing: border-box; }

/* Overlay & Panel */
.people-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.people-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 680px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.panel-body { padding: 20px 24px; overflow-y: auto; flex: 1; min-height: 0; }

/* Merge bar */
.merge-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(0,113,227,0.1); border: 1px solid rgba(0,113,227,0.3); border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: #8ab4f8; flex-wrap: wrap; }

/* Empty state */
.empty-state { text-align: center; padding: 40px 20px; color: #86868b; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.hint { font-size: 16px; color: #b8b8b8; }
.hint.sub { margin-top: 12px; font-size: 12px; color: #b8b8b8; }

/* People grid */
.people-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
.person-card { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); cursor: default; transition: all 0.2s; overflow: hidden; }
.person-card:hover { background: rgba(255,255,255,0.06); }
.person-card.merge-target { cursor: pointer; border-color: rgba(0,113,227,0.3); }
.person-card.merge-target:hover { background: rgba(0,113,227,0.1); }

/* Person avatar */
.person-avatar { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #2a2a2c; border: 2px solid rgba(255,255,255,0.06); }
.face-img { width: 100%; height: 100%; object-fit: cover; }
.face-placeholder { width: 100%; height: 100%; display: grid; place-items: center; font-size: 24px; color: #555; }

/* Person info */
.person-info { flex: 1; min-width: 0; overflow: hidden; }
.person-name { font-size: 14px; font-weight: 500; color: #f5f5f7; display: block; cursor: text; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.photo-count { font-size: 11px; color: #86868b; }

/* Name editing */
.name-edit { display: flex; gap: 6px; align-items: center; min-width: 0; }
.name-input { background: #1a1a1c; border: 1px solid #0071e3; border-radius: 6px; padding: 4px 8px; color: #f5f5f7; font-size: 13px; flex: 1; min-width: 0; outline: none; }
.save-btn { background: #0071e3; border: none; border-radius: 6px; color: white; padding: 4px 8px; cursor: pointer; flex-shrink: 0; font-size: 13px; line-height: 1; }

/* Person action buttons */
.person-actions { display: flex; gap: 2px; flex-shrink: 0; }
.icon-btn-sm { background: none; border: none; font-size: 14px; cursor: pointer; padding: 6px; border-radius: 6px; opacity: 0; transition: all 0.2s; flex-shrink: 0; color: #ccc; }
.person-card:hover .icon-btn-sm { opacity: 1; }
.icon-btn-sm:hover { background: rgba(255,255,255,0.08); color: #fff; }

/* Action buttons */
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; }
.action-btn:hover { background: #333; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.sm { padding: 4px 10px; font-size: 11px; }
.cancel-btn { border-color: #ff453a; color: #ff453a; }
.cancel-btn:hover { background: rgba(255,69,58,0.1); }
.review-btn { border-color: #60a5fa; color: #93c5fd; }
.review-btn:hover { background: rgba(59,130,246,0.12); }
.rescan-btn { border-color: #ff9f0a; color: #ff9f0a; }
.rescan-btn:hover { background: rgba(255,159,10,0.1); }

/* Progress Bar */
.scan-progress-bar { margin-top: 20px; }
.progress-track { width: 100%; height: 6px; background: #2a2a2c; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #0071e3, #34c759); border-radius: 3px; transition: width 0.3s ease; }
.progress-details { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: #86868b; }

/* Face Review */
.face-review { margin-top: 16px; display: flex; flex-direction: column; min-height: 0; flex: 1; }
.review-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; flex-shrink: 0; }
.review-header h3 { font-size: 15px; font-weight: 600; color: #f5f5f7; margin: 0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.face-count-label { font-size: 11px; color: #86868b; flex-shrink: 0; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 10px; }
.review-hint { font-size: 12px; color: #86868b; margin: 0 0 12px 0; flex-shrink: 0; }

/* Review loading */
.review-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px; color: #86868b; font-size: 13px; }
.review-spinner { width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #0071e3; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Virtual scroll container */
.faces-virtual-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 200px; max-height: calc(85vh - 220px); border-radius: 8px; }
.faces-spacer { width: 100%; flex-shrink: 0; }

/* Faces grid */
.faces-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.face-card { background: #222; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; min-width: 0; transition: border-color 0.15s; }
.face-card:hover { border-color: rgba(255,255,255,0.12); }

/* Face crop with hover overlay */
.face-crop-container { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: #1a1a1c; flex-shrink: 0; cursor: pointer; }
.face-crop-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s ease; }
.face-crop-container:hover .face-crop-img { transform: scale(1.05); }
.face-hover-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s ease; }
.face-crop-container:hover .face-hover-overlay { opacity: 1; }
.hover-label { color: white; font-size: 12px; font-weight: 500; padding: 4px 12px; background: rgba(0,113,227,0.8); border-radius: 12px; }

/* Face card bottom section */
.face-card-bottom { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.face-filename { font-size: 10px; color: #86868b; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.face-match-hint { font-size: 10px; color: #93c5fd; }
.face-card-actions { display: flex; align-items: center; gap: 4px; min-width: 0; }
.reassign-select { flex: 1; min-width: 0; background: #1a1a1c; border: 1px solid #333; border-radius: 6px; padding: 4px 6px; color: #f5f5f7; font-size: 11px; }
.btn-set-avatar { background: none; border: 1px solid #333; color: #8ab4f8; padding: 3px 5px; border-radius: 5px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; transition: all 0.15s; }
.btn-set-avatar:hover { background: rgba(0,113,227,0.15); border-color: #0071e3; color: #0071e3; }
.btn-set-avatar:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-remove-face { background: none; border: none; color: #ff453a; font-size: 14px; cursor: pointer; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
.btn-remove-face:hover { background: rgba(255,69,58,0.1); }

/* New person inline input */
.new-person-inline { display: flex; align-items: center; gap: 4px; min-width: 0; }
.new-person-input { flex: 1; min-width: 0; background: #1a1a1c; border: 1px solid #0071e3; border-radius: 6px; padding: 5px 8px; color: #f5f5f7; font-size: 12px; outline: none; }
.new-person-input::placeholder { color: #666; }

/* ── Face Preview Lightbox ── */
.face-preview-overlay { position: fixed; inset: 0; z-index: 60000; background: rgba(0,0,0,0.85); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.15s ease; }
.face-preview-panel { background: #1e1e20; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; width: 90vw; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 40px 80px rgba(0,0,0,0.6); overflow: hidden; animation: panel-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.preview-filename { font-size: 13px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.preview-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.preview-body { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 0; background: #101012; }
.preview-img-wrapper { position: relative; display: inline-block; max-width: 100%; max-height: calc(90vh - 80px); }
.preview-full-img { max-width: 100%; max-height: calc(90vh - 80px); object-fit: contain; border-radius: 4px; display: block; }
.face-box-overlay { position: absolute; border: 2px solid #0071e3; border-radius: 4px; box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 0 12px rgba(0,113,227,0.3); pointer-events: none; transition: all 0.3s ease; }

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
</style>
