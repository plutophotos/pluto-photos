<template>
  <Teleport to="body">
    <div class="map-overlay" @click.self="$emit('close')">
      <div class="map-panel">
        <div class="panel-header">
          <h2>📍 Map View</h2>
          <div class="header-actions">
            <button class="action-btn" @click="extractGpsBulk" :disabled="extracting">
              {{ extracting ? 'Extracting GPS...' : 'Extract GPS Data' }}
            </button>
            <span class="photo-count">{{ markers.length }} geotagged photos</span>
            <button class="btn-close" @click="$emit('close')">✕</button>
          </div>
        </div>

        <div v-if="extracting" class="gps-progress">
          <div class="gps-progress-track">
            <div class="gps-progress-fill" :style="{ width: gpsPercent + '%' }"></div>
          </div>
          <div class="gps-progress-details">
            <span>{{ gpsMessage }}</span>
            <span>{{ gpsCurrent }} / {{ gpsTotal }} images ({{ gpsPercent }}%)</span>
          </div>
        </div>

        <div class="map-container" ref="mapContainer">
          <div v-if="!mapReady" class="map-loading">
            <div class="spinner"></div>
            <p>Loading map...</p>
          </div>
        </div>

        <div v-if="selectedPhotos.length > 0" class="photo-strip">
          <div class="strip-header">
            <span>{{ selectedPhotos.length }} photos at this location</span>
            <button class="btn-close-strip" @click="selectedPhotos = []">✕</button>
          </div>
          <div class="strip-scroll">
            <div v-for="photo in selectedPhotos" :key="photo.original" class="strip-thumb" @dblclick="$emit('open-photo', photo)">
              <img :src="photo.thumb" @error="(e) => e.target.src = photo.original" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// Fix Leaflet default icon paths when bundled
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { ipcOn } from '../ipcListen'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow
})

const props = defineProps({
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'open-photo'])

const mapContainer = ref(null)
const mapReady = ref(false)
const markers = ref([])
const selectedPhotos = ref([])
const extracting = ref(false)
const gpsCurrent = ref(0)
const gpsTotal = ref(0)
const gpsMessage = ref('')
const gpsPercent = computed(() => gpsTotal.value > 0 ? Math.round((gpsCurrent.value / gpsTotal.value) * 100) : 0)

let map = null
let markerClusterGroup = null
let cleanupProgressListener = null

const onGpsProgress = (data) => {
  gpsCurrent.value = data.current || 0
  gpsTotal.value = data.total || 0
  gpsMessage.value = data.message || 'Extracting GPS...'
}

const initMap = async () => {
  await nextTick()
  
  if (!mapContainer.value) return
  
  map = L.map(mapContainer.value).setView([20, 0], 2)
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)

  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  })
  map.addLayer(markerClusterGroup)
  
  mapReady.value = true
  await loadGeoPhotos()
}

const loadGeoPhotos = async () => {
  try {
    const photos = await window.electron.ipcRenderer.invoke('get-images-with-gps')
    markers.value = photos
    
    if (!map) return
    
    markerClusterGroup.clearLayers()
    
    const bounds = []
    for (const photo of photos) {
      const lat = photo.gps_lat
      const lng = photo.gps_lng
      if (!lat || !lng) continue
      
      const marker = L.marker([lat, lng])
      marker.on('click', () => {
        selectedPhotos.value = photos.filter(p => 
          Math.abs(p.gps_lat - lat) < 0.001 && Math.abs(p.gps_lng - lng) < 0.001
        )
      })
      
      // Tooltip with image name
      const name = photo.original.split(/[\\/]/).pop()
      marker.bindTooltip(name, { direction: 'top', offset: [0, -10] })
      
      markerClusterGroup.addLayer(marker)
      bounds.push([lat, lng])
    }
    
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
    }
  } catch (err) {
    console.error('Failed to load geotagged photos:', err)
  }
}

const extractGpsBulk = async () => {
  extracting.value = true
  gpsCurrent.value = 0
  gpsTotal.value = 0
  gpsMessage.value = 'Starting GPS extraction...'
  cleanupProgressListener = ipcOn('import-progress', onGpsProgress)
  try {
    const result = await window.electron.ipcRenderer.invoke('extract-gps-bulk')
    gpsMessage.value = `Done! Found ${result?.found || 0} geotagged photos`
    await loadGeoPhotos()
  } catch (err) {
    console.error('GPS extraction failed:', err)
    gpsMessage.value = 'Extraction failed: ' + err.message
  } finally {
    if (cleanupProgressListener) { cleanupProgressListener(); cleanupProgressListener = null }
    setTimeout(() => { extracting.value = false }, 2000)
  }
}

onMounted(initMap)
onUnmounted(() => {
  if (cleanupProgressListener) { cleanupProgressListener(); cleanupProgressListener = null }
  if (map) { map.remove(); map = null }
})
</script>

<style scoped>
.map-overlay { position: fixed; inset: 0; z-index: 50000; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; animation: overlay-in 0.2s ease; }
.map-panel { background: #1a1a1c; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; width: 90vw; height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.6); animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.panel-header { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.panel-header h2 { font-size: 18px; font-weight: 600; color: #f5f5f7; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.photo-count { font-size: 12px; color: #86868b; }
.btn-close { background: none; border: none; color: #86868b; font-size: 18px; cursor: pointer; transition: color 0.15s ease; }
.btn-close:hover { color: #f5f5f7; }
.map-container { flex: 1; position: relative; min-height: 0; }
.map-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #86868b; gap: 12px; }
.spinner { width: 30px; height: 30px; border: 3px solid #333; border-top-color: #0071e3; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.photo-strip { border-top: 1px solid rgba(255,255,255,0.06); padding: 12px 24px; flex-shrink: 0; }
.strip-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #86868b; }
.btn-close-strip { background: none; border: none; color: #86868b; cursor: pointer; }
.strip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.strip-thumb { width: 80px; height: 60px; border-radius: 6px; overflow: hidden; cursor: pointer; flex-shrink: 0; border: 2px solid transparent; transition: border-color 0.2s; }
.strip-thumb:hover { border-color: #0071e3; }
.strip-thumb img { width: 100%; height: 100%; object-fit: cover; }
.action-btn { background: #2a2a2c; border: 1px solid #444; border-radius: 8px; padding: 8px 16px; color: #f5f5f7; font-size: 13px; cursor: pointer; }
.action-btn:hover { background: #333; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* GPS Progress */
.gps-progress { padding: 8px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.gps-progress-track { width: 100%; height: 6px; background: #2a2a2c; border-radius: 3px; overflow: hidden; }
.gps-progress-fill { height: 100%; background: linear-gradient(90deg, #0071e3, #34c759); border-radius: 3px; transition: width 0.3s ease; }
.gps-progress-details { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #86868b; }
</style>
