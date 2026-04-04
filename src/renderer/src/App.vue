<template>
  <div class="app-root">
    <TitleBar />
    <div class="app-container" @click="deselectAll">
    <Sidebar 
      :globalFolders="globalFolders"
      :projects="projects"
      :importProgress="importProgress"
      :selectedAlbumId="selectedAlbumId"
      :selectedFolderId="selectedFolderId"
      :globalFiles="globalFiles"
      :editedFiles="editedFiles"
      :serverInfo="serverInfo"
      :smartAlbums="smartAlbums"
      :selectedSmartAlbumId="selectedSmartAlbumId"
      :people="people"
      :selectedPersonId="selectedPersonId"
      :filterCounts="filterCounts"
      :activeFilter="activeFilter"
      :licenseTier="licenseInfo.tier"
      :collapsed="sidebarCollapsed"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      @delete-folder="openDeleteModal('folder', $event)"
      @delete-album="openDeleteModal('album', $event)"
      @import="importFolder"
      @import-files="importFiles"
      @select-folder="selectFolder"
      @select-album="selectAlbum"
      @reset-view="resetView"
      @create-project="openModal('project')"
      @create-album="(id) => openModal('album', id)"
      @toggle-project="handleToggleProject"
      @wipe-database="openDeleteModal('wipe', null)"
      @drop-images="handleSidebarDrop"
      @delete-project="handleDeleteProject" 
      @refresh-library="refreshLibraryData"
      @sync-folder="handleSyncFolder"
      @reorder-albums="handleReorderAlbums"
      @select-file="selectFile"
      @select-edited-file="selectEditedFile"
      @delete-edited-file="(id) => openDeleteModal('edited-file', id)"
      @delete-file="(path) => openDeleteModal('file', path)"
      @refresh-server-info="refreshServerInfo"
      @create-smart-album="licenseInfo.features?.smartAlbums ? (showSmartAlbumEditor = true, editingSmartAlbum = null) : showLicenseToast('Smart Albums')"
      @select-smart-album="selectSmartAlbum"
      @delete-smart-album="(id) => openDeleteModal('smart-album', id)"
      @select-person="handleBrowsePerson"
      @open-people="licenseInfo.features?.faceDetection ? (showPeople = true) : showLicenseToast('Face Detection')"
      @select-filter="handleSelectFilter"
    />

    <div class="main-area">
      <GalleryHeader
        :title="currentViewName"
        :total-count="totalCount"
        :selected-count="selectedPaths.size"
        :current-scale="currentCardSize"
        :licenseTier="licenseInfo.tier"
        @search="handleSearch"
        @update-scale="handleScaleUpdate"
        @sort-change="handleSortChange"
        @open-settings="showSettings = true"
        @open-smart-album="licenseInfo.features?.smartAlbums ? (showSmartAlbumEditor = true, editingSmartAlbum = null) : showLicenseToast('Smart Albums')"
        @open-people="licenseInfo.features?.faceDetection ? (showPeople = true) : showLicenseToast('Face Detection')"
        @open-map="licenseInfo.features?.mapView ? (showMap = true) : showLicenseToast('Map View')"
        @open-duplicates="licenseInfo.features?.duplicateFinder ? (showDuplicateFinder = true) : showLicenseToast('Duplicate Finder')"
        @open-cloud-import="licenseInfo.features?.cloudImport ? (showCloudImport = true) : showLicenseToast('Cloud Import')"
        @open-context-search="licenseInfo.features?.contextSearch ? (showContextSearch = true) : showLicenseToast('Contextual Search')"
        @open-video-editor="exceedsFreeLimits ? showToast('error', 'Feature Locked', 'Your trial has expired and your library exceeds free limits. Upgrade to edit videos.') : licenseInfo.features?.editPhoto ? openVideoTrimmer(Array.from(selectedPaths)[0]) : showLicenseToast('Video Editing')"
        @start-slideshow="startSlideshow(0)"
      />

    <main ref="scrollContainer" class="main-content" @scroll="handleScroll">
      <section class="gallery-section">
        <div class="virtual-spacer" :style="{ height: totalGridHeight + 'px', position: 'relative' }">
          <div class="grid" role="grid" aria-label="Photo gallery" :style="gridStyle">
            <template v-for="(visibleImage, index) in visibleImages" :key="visibleImage?.original || ('slot-' + index)">
              <MediaCard 
                v-if="visibleImage"
                :src="visibleImage.src" 
                :original-path="visibleImage.original"
                :is-selected="selectedPaths.has(visibleImage.original)"
                :in-album="visibleImage.inAlbum"
                :locked="visibleImage.locked"
                @click.stop="visibleImage.locked ? null : handleItemClick(visibleImage.original, startIndex + index, $event)"
                @dblclick.stop="visibleImage.locked ? null : openLightbox(startIndex + index)"
                @dragstart="visibleImage.locked ? null : handleDragStart($event, visibleImage)"
                @contextmenu.prevent="visibleImage.locked ? null : handleRightClick(visibleImage.original, $event)"
                @thumb-error="visibleImage.src = ''"
              />
            </template>
          </div>
        </div>
      </section>

      <div v-if="isLoading" class="loader"><div class="spinner"></div></div>
    </main>
    </div>

    <aside class="info-sidebar" @click.stop>
      <GallerySidebar
        :selected-count="selectedPaths.size"
        :total-count="totalCount"
        :details="selectedItemDetails" 
        :show-remove-button="!!(selectedAlbumId && selectedPaths.size > 0)"
        :selected-path="selectedPaths.size === 1 ? Array.from(selectedPaths)[0] : ''"
        :licenseTier="licenseInfo.tier"
        :licenseInfo="licenseInfo"
        :licenseLoaded="licenseLoaded"
        @remove-from-album="removeSelectedFromAlbum"
        @delete-selected="openDeleteModal('permanent', null)"
        @open-batch-ops="exceedsFreeLimits ? showToast('error', 'Feature Locked', 'Your trial has expired and your library exceeds free limits. Upgrade to use Batch Operations.') : licenseInfo.features?.batchOps ? (showBatchOps = true) : showLicenseToast('Batch Operations')"
        @open-editor="exceedsFreeLimits ? showToast('error', 'Feature Locked', 'Your trial has expired and your library exceeds free limits. Upgrade to edit photos.') : licenseInfo.features?.editPhoto ? openEditor(Array.from(selectedPaths)[0]) : showLicenseToast('Photo Editing')"
        @open-video-editor="exceedsFreeLimits ? showToast('error', 'Feature Locked', 'Your trial has expired and your library exceeds free limits. Upgrade to edit videos.') : licenseInfo.features?.editPhoto ? openVideoTrimmer(Array.from(selectedPaths)[0]) : showLicenseToast('Video Editing')"
        @export-file="exportSingleFile(Array.from(selectedPaths)[0])"
        @metadata-updated="refreshFilterCounts"
        @license-updated="refreshLicenseInfo"
      />
    </aside>

    <Lightbox 
      :show="lightbox.show"
      :index="lightbox.index"
      :mediaFiles="lightboxFiles"
      @close="closeLightbox"
      @prev="lightbox.index = Math.max(0, lightbox.index - 1)"
      @next="lightbox.index = Math.min(lightboxFiles.length - 1, lightbox.index + 1)"
      @jump="(i) => lightbox.index = i"
      @start-slideshow="closeLightbox(); startSlideshow(lightbox.index)"
    />

    <div 
      v-if="contextMenu.visible" 
      class="custom-context-menu" 
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
  <!-- File operations -->
  <button @click="openContextFile"><span class="ctx-icon">↗</span>{{ t('openFile') || 'Open File' }}</button>
  <button @click="showInExplorer"><span class="ctx-icon">📁</span>{{ isMac ? 'Reveal in Finder' : 'Show in Explorer' }}</button>
  <button @click="copyPathToClipboard"><span class="ctx-icon">📋</span>{{ t('copyPath') || 'Copy Path' }}</button>
  <div class="menu-divider"></div>

  <!-- Edit & Export -->
  <button v-if="contextMenuIsImage" @click="contextEditPhoto"><span class="ctx-icon">✏️</span>Edit Photo</button>
  <button v-if="contextMenuIsVideo" @click="contextEditVideo"><span class="ctx-icon">🎬</span>Edit Video</button>
  <button @click="contextExport"><span class="ctx-icon">💾</span>Export</button>
  <div class="menu-divider"></div>

  <!-- Rating -->
  <div class="ctx-rating-row">
    <span class="ctx-rating-label">Rating</span>
    <span v-for="star in 5" :key="star" class="ctx-star" :class="{ filled: star <= contextMenuRating }" @click="setContextRating(star)">★</span>
    <span class="ctx-star clear" @click="setContextRating(0)" title="Clear">✕</span>
  </div>

  <!-- Color Label -->
  <div class="ctx-color-row">
    <span class="ctx-rating-label">Label</span>
    <span class="ctx-color-dot" :class="{ active: contextMenuColorLabel === '' }" @click="setContextColorLabel('')" title="None">✕</span>
    <span v-for="c in colorLabelOptions" :key="c.value" class="ctx-color-dot" :class="{ active: contextMenuColorLabel === c.value }" :style="{ background: c.color }" :title="c.label" @click="setContextColorLabel(c.value)"></span>
  </div>
  <div class="menu-divider"></div>

  <!-- Albums -->
  <div class="menu-item-with-submenu">
    <button class="submenu-trigger"><span class="ctx-icon">📂</span>Add to Album <span class="ctx-arrow">▸</span></button>
    <div class="submenu">
      <template v-for="project in projects" :key="project.id">
        <div class="submenu-section-title">{{ project.name }}</div>
        <button 
          v-for="album in project.albums" 
          :key="album.id"
          @click="copyToAlbum(album.id)"
        >
          {{ album.name }}
        </button>
      </template>
      <div v-if="!projects.length" class="submenu-empty">No albums yet</div>
    </div>
  </div>
  <button v-if="selectedAlbumId" @click="setAsCover"><span class="ctx-icon">🖼️</span>Set as Album Cover</button>
  <button v-if="selectedAlbumId" @click="contextRemoveFromAlbum" style="color: #ff9f0a;"><span class="ctx-icon">↩</span>Remove from Album</button>
  <div class="menu-divider"></div>

  <!-- Danger zone -->
  <button @click="contextGetInfo"><span class="ctx-icon">ℹ️</span>Get Info</button>
  <button @click="contextDelete" class="ctx-danger"><span class="ctx-icon">🗑️</span>Delete</button>
</div>
    <CreateAlbumModal 
      v-if="modalConfig.show" 
      :mode="modalConfig.mode" 
      @close="modalConfig.show = false" 
      @confirm="handleModalConfirm" 
    />
    
    <DeleteModal 
      :show="modalState.visible" 
      :title="modalState.title" 
      :message="modalState.message"
      :footnote="modalState.footnote" 
      @confirm="executeDeletion" 
      @cancel="modalState.visible = false" 
    />
    
    <Toast
      :show="toast.show"
      :type="toast.type"
      :title="toast.title"
      :message="toast.message"
      :action-label="toast.actionLabel"
      :duration="toast.actionLabel ? 8000 : 5000"
      @close="toast.show = false"
      @action="toast.actionFn?.()"
    />

    <ScanProgressToast
      :show="autoScan.show"
      :current="autoScan.current"
      :total="autoScan.total"
      :done="autoScan.done"
      @close="autoScan.show = false"
      @cancel="cancelAutoScan"
    />

    <!-- Auto-update banner -->
    <Teleport to="body">
      <Transition name="update-banner">
        <div v-if="updateBanner.show" class="update-banner" :class="updateBanner.state">
          <div class="update-icon-wrap" :class="updateBanner.state">
            <svg v-if="updateBanner.state === 'available'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <svg v-else-if="updateBanner.state === 'downloading'" class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div class="update-body">
            <div class="update-title" v-if="updateBanner.state === 'available'">Update Available</div>
            <div class="update-title" v-else-if="updateBanner.state === 'downloading'">Downloading…</div>
            <div class="update-title" v-else>Ready to Install</div>
            <div class="update-detail" v-if="updateBanner.state === 'available'">
              Version <strong>{{ updateBanner.version }}</strong> is available for download.
            </div>
            <div class="update-detail" v-else-if="updateBanner.state === 'downloading'">
              {{ updateBanner.percent }}% complete
            </div>
            <div class="update-detail" v-else>
              <strong>v{{ updateBanner.version }}</strong> — restart the app to apply.
            </div>
            <div v-if="updateBanner.state === 'downloading'" class="update-progress">
              <div class="update-progress-fill" :style="{ width: updateBanner.percent + '%' }"></div>
            </div>
          </div>
          <div class="update-actions">
            <button v-if="updateBanner.state === 'available'" class="update-action-btn" @click="downloadUpdate">Download</button>
            <button v-if="updateBanner.state === 'ready'" class="update-action-btn ready" @click="installUpdate">Restart & Update</button>
            <button class="update-dismiss-btn" @click="dismissUpdateBanner" aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Upgrade banner for expired trial with excess data -->
    <Teleport to="body">
      <Transition name="update-banner">
        <div v-if="exceedsFreeLimits && !upgradeDismissed" class="upgrade-banner">
          <div class="upgrade-icon-wrap">⚠️</div>
          <div class="upgrade-body">
            <div class="upgrade-title">Trial Expired</div>
            <div class="upgrade-detail">
              Your library ({{ usageStats.imageCount }} photos, {{ usageStats.albumCount }} albums) exceeds Free plan limits.
              Content is read-only — upgrade to continue editing.
            </div>
          </div>
          <div class="upgrade-actions">
            <button class="update-action-btn upgrade" @click="showSettings = true">Upgrade</button>
            <button class="update-dismiss-btn" @click="upgradeDismissed = true" aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
    
    <OnboardingWizard 
      v-if="showOnboarding"
      @complete="handleOnboardingComplete"
      @import-folder="importFolder"
    />

    <SettingsPanel 
      v-if="showSettings"
      @close="showSettings = false"
      @settings-changed="handleSettingsChanged"
    />

    <SmartAlbumPanel
      v-if="showSmartAlbumEditor"
      :album="editingSmartAlbum"
      @close="showSmartAlbumEditor = false"
      @saved="refreshSmartAlbums"
    />

    <PeoplePanel
      v-if="showPeople"
      @close="showPeople = false; refreshPeople()"
      @browse-person="handleBrowsePerson"
    />

    <ContextScanPanel
      v-if="showContextSearch"
      @close="showContextSearch = false"
    />

    <MapView
      v-if="showMap"
      @close="showMap = false"
      @open-photo="openMapPhoto"
    />

    <BatchOpsPanel
      v-if="showBatchOps"
      :paths="Array.from(selectedPaths)"
      :projects="projects"
      @close="showBatchOps = false"
      @done="handleBatchDone"
    />

    <ImageEditor
      v-if="showImageEditor"
      :imagePath="editImagePath"
      :tier="licenseInfo.tier"
      @close="showImageEditor = false"
      @saved="handleEditorSaved"
    />

    <VideoTrimmer
      v-if="showVideoTrimmer"
      :videoPath="trimVideoPath"
      @close="showVideoTrimmer = false"
      @saved="handleVideoTrimSaved"
    />

    <DuplicateFinder
      v-if="showDuplicateFinder"
      @close="showDuplicateFinder = false"
      @refresh="loadImages(false); refreshLibraryData(); refreshFilterCounts()"
      @compare="openDuplicateCompare"
    />

    <CloudImportPanel
      v-if="showCloudImport"
      @close="showCloudImport = false"
      @imported="handleCloudImported"
    />

    <Slideshow
      :show="showSlideshow"
      :mediaFiles="mediaFiles"
      :startIndex="slideshowStartIdx"
      @close="showSlideshow = false"
    />
    
  </div>
  </div>
</template>

<script setup lang="ts">
// @ts-nocheck
import Lightbox from './components/Lightbox.vue'
import { ref, computed, onMounted, watch, onUnmounted, reactive, toRaw } from 'vue'
import MediaCard from './components/MediaCard.vue'
import Sidebar from './components/Sidebar.vue'
import TitleBar from './components/TitleBar.vue'
import GalleryHeader from './components/GalleryHeader.vue'
import GallerySidebar from './components/GallerySidebar.vue'
import CreateAlbumModal from './components/CreateAlbumModal.vue'
import DeleteModal from './components/DeleteModal.vue'
import Toast from './components/Toast.vue'
import OnboardingWizard from './components/OnboardingWizard.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TagRatingPanel from './components/TagRatingPanel.vue'
import SmartAlbumPanel from './components/SmartAlbumPanel.vue'
import PeoplePanel from './components/PeoplePanel.vue'
import ContextScanPanel from './components/ContextScanPanel.vue'
import ScanProgressToast from './components/ScanProgressToast.vue'
import MapView from './components/MapView.vue'
import BatchOpsPanel from './components/BatchOpsPanel.vue'
import ImageEditor from './components/ImageEditor.vue'
import VideoTrimmer from './components/VideoTrimmer.vue'
import DuplicateFinder from './components/DuplicateFinder.vue'
import CloudImportPanel from './components/CloudImportPanel.vue'
import Slideshow from './components/Slideshow.vue'

import { useGallery } from './useGallery'
import { useGrid } from './useGrid'
import { ipcOn } from './ipcListen'
import { useSelection } from './useSelection'
import { initLanguage, useI18n } from './useI18n'

const { t, setLanguage } = useI18n()

const lightbox = reactive({
  show: false,
  index: 0
})

const handleReorderAlbums = async ({ draggedId, targetId, position }) => {
  try {
    const result = await window.electron.ipcRenderer.invoke('reorder-albums', { 
      draggedId, 
      targetId,
      position
    });
    if (result.success) {
      await refreshLibraryData(); // This re-fetches albums in their new order
    }
  } catch (err) {
    console.error("Failed to reorder albums:", err);
  }
}

// 3. Add Method to trigger it
const openLightbox = (index) => {
  lightbox.index = index;
  lightbox.show = true;
};

const closeLightbox = () => {
  lightbox.show = false;
  lightboxOverride.value = null;
};

// Computed: use override array if set (e.g. map photos), otherwise gallery mediaFiles
const lightboxOverride = ref(null);
const lightboxFiles = computed(() => lightboxOverride.value || mediaFiles.value);

const openMapPhoto = (photo) => {
  // Build a lightbox-compatible entry for just this photo
  const entry = {
    original: photo.original || `pluto://${photo.full_path}`,
    src: photo.thumb || photo.original || `pluto://${photo.full_path}`,
    rawPath: photo.full_path || photo.original?.replace(/^pluto:\/\//, ''),
    name: photo.name || photo.full_path?.split(/[\\/]/).pop() || 'Photo'
  };
  lightboxOverride.value = [entry];
  lightbox.index = 0;
  lightbox.show = true;
};

const openDuplicateCompare = (group) => {
  const entries = group.map(item => ({
    original: item.original,
    src: item.thumb || item.original,
    rawPath: item.original?.replace(/^pluto:\/\//, '') || item.full_path,
    name: (item.full_path || item.original)?.split(/[\\/]/).pop() || 'Photo'
  }));
  lightboxOverride.value = entries;
  lightbox.index = 0;
  lightbox.show = true;
};
const { 
  mediaFiles, totalCount, isLoading, searchQuery, currentSort, 
  loadImages: fetchImages
} = useGallery();

const scrollContainer = ref(null);

const { 
  cardSize: currentCardSize, gridStyle, totalGridHeight, startIndex, visibleImages, 
  handleScroll: onGridScroll, handleScaleUpdate: updateScale 
} = useGrid(mediaFiles, scrollContainer);

const { selectedPaths, handleClick: handleItemClick, deselectAll } = useSelection(mediaFiles);

const selectedAlbumId = ref(null);
const selectedFolderId = ref(null);
const selectedFilePath = ref(null);
const selectedAlbumName = ref('');
const selectedFolderName = ref('');
const projects = ref([]);
const globalFolders = ref([]);
const globalFiles = ref([]);
const editedFiles = ref([]);
const importProgress = reactive({ inProgress: false, current: 0, total: 0, message: '' });
const selectedItemDetails = ref(null);
const modalConfig = reactive({ show: false, mode: 'album', targetProjectId: null });
const contextMenu = reactive({ visible: false, x: 0, y: 0, targetPath: null });
const modalState = reactive({ visible: false, type: '', id: null, title: '', message: '', footnote: '' });
const toast = reactive({ show: false, type: 'error', title: '', message: '', actionLabel: '', actionFn: null });
const autoScan = reactive({ show: false, current: 0, total: 0, done: false });
const updateBanner = reactive({ show: false, state: 'available', version: '', percent: 0 }); // state: available | downloading | ready
const serverInfo = ref(null);
const showOnboarding = ref(false);
const showSettings = ref(false);
const sidebarCollapsed = ref(false);
const showSmartAlbumEditor = ref(false);
const editingSmartAlbum = ref(null);
const showPeople = ref(false);
const showContextSearch = ref(false);
const showMap = ref(false);
const showBatchOps = ref(false);
const showImageEditor = ref(false);
const editImagePath = ref('');
const showVideoTrimmer = ref(false);
const trimVideoPath = ref('');
const showDuplicateFinder = ref(false);
const showCloudImport = ref(false);
const showSlideshow = ref(false);
const slideshowStartIdx = ref(0);
const smartAlbums = ref([]);
const selectedSmartAlbumId = ref(null);
const people = ref([]);
const selectedPersonId = ref(null);
const activeFilter = ref('all');
const filterCounts = ref({});
const appTheme = ref('futuristic');
const licenseLoaded = ref(false);
const licenseInfo = ref({
  activated: false,
  tier: 'free',
  tierName: 'Free',
  features: {},
  limits: {}
});

const usageStats = ref({ imageCount: 0, albumCount: 0, projectCount: 0, folderCount: 0 });
const upgradeDismissed = ref(false);

const exceedsFreeLimits = computed(() => {
  const li = licenseInfo.value;
  const stats = usageStats.value;
  // Only show when trial has expired (reverted to free) and user has data beyond free limits
  if (!li.trialExpired) return false;
  return stats.imageCount > (li.limits.maxImages || 500) || stats.albumCount > (li.limits.maxAlbums || 1);
});

const refreshUsageStats = async () => {
  try {
    const stats = await window.electron.ipcRenderer.invoke('get-usage-stats');
    if (stats) usageStats.value = stats;
  } catch {}
};

const refreshLicenseInfo = async () => {
  try {
    const info = await window.electron.ipcRenderer.invoke('get-license-info');
    if (info) licenseInfo.value = info;
    licenseLoaded.value = true;
    await refreshUsageStats();
    // Re-fetch images and projects so locked flags update for the new tier
    await Promise.all([loadImages(), refreshLibraryData()]);
  } catch {}
};

const showLicenseToast = (featureName) => {
  toast.type = 'error';
  toast.title = `${featureName} — Pro Feature`;
  toast.message = 'Upgrade your license to unlock this feature.';
  toast.actionLabel = 'Open Settings';
  toast.actionFn = () => { showSettings.value = true; };
  toast.show = true;
};

const refreshServerInfo = async () => {
  try { serverInfo.value = await window.electron.ipcRenderer.invoke('get-server-info') } catch {}
};

const refreshSmartAlbums = async () => {
  try { smartAlbums.value = await window.electron.ipcRenderer.invoke('get-smart-albums') } catch {}
};

const refreshPeople = async () => {
  try { people.value = await window.electron.ipcRenderer.invoke('get-people') } catch {}
};

const refreshFilterCounts = async () => {
  try {
    const counts = await window.electron.ipcRenderer.invoke('get-filter-counts');
    if (counts) filterCounts.value = counts;
  } catch (err) {
    console.error('[refreshFilterCounts] Error:', err);
  }
};

const handleSelectFilter = (filter) => {
  activeFilter.value = filter;
  selectedAlbumId.value = null;
  selectedFolderId.value = null;
  selectedFilePath.value = null;
  selectedSmartAlbumId.value = null;
  selectedPersonId.value = null;
  searchQuery.value = '';
  loadImages(true);
};

const selectSmartAlbum = async (album) => {
  selectedAlbumId.value = null;
  selectedFolderId.value = null;
  selectedFilePath.value = null;
  selectedPersonId.value = null;
  activeFilter.value = null;
  selectedSmartAlbumId.value = album.id;
  selectedAlbumName.value = album.name;
  try {
    // Deep-clone rules to strip Vue reactive proxies before IPC serialization
    const plainRules = JSON.parse(JSON.stringify(toRaw(album.rules)));
    const results = await window.electron.ipcRenderer.invoke('query-smart-album', {
      rules: plainRules, matchAll: album.matchAll !== false, sort: currentSort.value
    });
    // Convert results to gallery format — IPC returns { rawPath, original (with pluto://), thumb }
    mediaFiles.value = results.map(r => ({
      original: r.original,
      src: r.thumb || r.original,
      thumbnail: r.thumb || r.original,
      rawPath: r.rawPath,
      ext: r.original.split('.').pop().toLowerCase()
    }));
    totalCount.value = results.length;
  } catch (err) {
    console.error('[selectSmartAlbum] Error:', err);
  }
};

const handleBrowsePerson = async (person) => {
  showPeople.value = false;
  selectedAlbumId.value = null;
  selectedFolderId.value = null;
  selectedFilePath.value = null;
  selectedSmartAlbumId.value = null;
  activeFilter.value = null;
  selectedPersonId.value = person.id;
  selectedAlbumName.value = `People: ${person.name || 'Unknown'}`;
  try {
    const results = await window.electron.ipcRenderer.invoke('get-person-images', { personId: person.id });
    mediaFiles.value = results.map(r => ({
      original: r.original,
      src: r.thumb || r.original,
      thumbnail: r.thumb || r.original,
      rawPath: r.rawPath,
      ext: r.original.split('.').pop().toLowerCase()
    }));
    totalCount.value = results.length;
  } catch {}
};

const handleBatchDone = (msg) => {
  showToast('success', msg);
  loadImages(false);
  refreshFilterCounts();
};

const openEditor = (path) => {
  const rawPath = typeof path === 'string' ? path.replace(/^pluto:\/\//i, '') : '';
  if (!rawPath) return;
  editImagePath.value = rawPath;
  showImageEditor.value = true;
};

const openVideoTrimmer = (path) => {
  const rawPath = typeof path === 'string' ? path.replace(/^pluto:\/\//i, '') : '';
  trimVideoPath.value = rawPath;
  showVideoTrimmer.value = true;
};

const handleVideoTrimSaved = (outputPath) => {
  showToast('success', 'Video trimmed successfully');
  loadImages(false);
};

const exportSingleFile = async (filePath) => {
  if (!filePath) return;
  if (exceedsFreeLimits.value) {
    showToast('error', 'Export Locked', 'Your trial has expired and your library exceeds free limits. Upgrade to export files.');
    return;
  }
  try {
    const result = await window.electron.ipcRenderer.invoke('batch-export', {
      paths: [filePath],
      options: {}
    });
    if (result?.success) {
      showToast('success', `File exported to ${result.outputDir}`);
    }
  } catch (err) {
    showToast('error', 'Export failed');
  }
};

const handleEditorSaved = async (outputPath) => {
  showImageEditor.value = false;
  showToast('success', 'Edit saved as copy');
  loadImages(false);
  await loadEditedFiles();
  // If DB-based loading returned nothing, add the file client-side as fallback
  if (outputPath && editedFiles.value.length === 0) {
    console.warn('[handleEditorSaved] DB returned no edited files, adding client-side entry for:', outputPath);
    editedFiles.value = [{ edit_id: Date.now(), output_path: outputPath, created_at: Math.floor(Date.now()/1000), original_path: editImagePath.value, original_name: editImagePath.value.split(/[\\/]/).pop() }];
  }
};

const handleCloudImported = () => {
  showCloudImport.value = false;
  refreshLibraryData();
  refreshFilterCounts();
  loadImages(true);
};

const startSlideshow = (idx = 0) => {
  slideshowStartIdx.value = idx;
  showSlideshow.value = true;
};

const handleDeleteSmartAlbum = async (id) => {
  await window.electron.ipcRenderer.invoke('delete-smart-album', { id });
  if (selectedSmartAlbumId.value === id) resetView();
  await refreshSmartAlbums();
};

const handleOnboardingComplete = () => {
  showOnboarding.value = false;
};

const handleSettingsChanged = ({ key, value }) => {
  if (key === 'theme') {
    applyTheme(value);
  }
  if (key === 'thumbnailSize') {
    if (updateScale) updateScale(value);
  }
  if (key === 'language') {
    setLanguage(value);
  }
  if (key === 'license') {
    refreshLicenseInfo();
  }
};

const applyTheme = (theme) => {
  appTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
};

const saveLastView = async () => {
  try {
    await window.electron.ipcRenderer.invoke('set-setting', {
      key: 'lastView',
      value: {
        albumId: selectedAlbumId.value,
        albumName: selectedAlbumName.value,
        folderId: selectedFolderId.value,
        folderName: selectedFolderName.value,
        filePath: selectedFilePath.value
      }
    });
  } catch {}
};

const restoreLastView = async (settings) => {
  if (settings.startupView !== 'last-view') return;
  const last = settings.lastView;
  if (!last) return;
  if (last.albumId) {
    selectedAlbumId.value = last.albumId;
    selectedAlbumName.value = last.albumName || '';
  } else if (last.folderId) {
    selectedFolderId.value = last.folderId;
    selectedFolderName.value = last.folderName || '';
  } else if (last.filePath) {
    selectedFilePath.value = last.filePath;
  }
};

const showToast = (type, title, message = '', actionLabel = '', actionFn = null) => {
  toast.type = type;
  toast.title = title;
  toast.message = message;
  toast.actionLabel = actionLabel;
  toast.actionFn = actionFn;
  toast.show = true;
};

const cancelAutoScan = async () => {
  await window.electron.ipcRenderer.invoke('cancel-auto-scan');
  autoScan.show = false;
};

const downloadUpdate = async () => {
  updateBanner.state = 'downloading';
  updateBanner.percent = 0;
  try {
    await window.electron.ipcRenderer.invoke('download-update');
  } catch (err) {
    showToast('error', 'Update Failed', err.message || 'Could not download update.');
    updateBanner.show = false;
  }
};

const installUpdate = () => {
  window.electron.ipcRenderer.invoke('install-update');
};

const dismissUpdateBanner = () => {
  updateBanner.show = false;
};

const copyToAlbum = async (albumId) => {
  if (!contextMenu.targetPath) return;
  
  try {
    await window.electron.ipcRenderer.invoke('copy-to-album', {
      albumId: albumId,
      imagePath: contextMenu.targetPath
    });
    
    contextMenu.visible = false;
    // Refresh gallery so the in-album styling updates immediately
    await loadImages(false);
    // Refresh the sidebar to update album counts/covers
    await refreshLibraryData(); 
  } catch (err) {
    console.error("Failed to copy image:", err);
  }
};

const handleSyncFolder = async (folderId) => {
  beginImportProgress('Preparing folder sync...');
  try {
    const result = await window.electron.ipcRenderer.invoke('sync-folder', folderId);
    if (result.error === 'permission') {
      showToast('error', 'Access Denied', result.message);
    } else if (result.error) {
      showToast('error', 'Sync Failed', result.message || 'The folder could not be synced.');
    } else if (result.success) {
      await refreshLibraryData();
      refreshFilterCounts();
      loadImages(true);
    }
  } catch (err) { console.error("Sync failed", err); }
  finally { endImportProgress(); }
};

const loadImages = async (reset = false) => {
  if (reset) {
    deselectAll();
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  }
  await fetchImages({ albumId: selectedAlbumId.value, folderId: selectedFolderId.value, filePath: selectedFilePath.value, filter: activeFilter.value });
};

const refreshLibraryData = async () => {
  projects.value = await window.electron.ipcRenderer.invoke('get-projects');
  globalFolders.value = await window.electron.ipcRenderer.invoke('get-all-folders');
  globalFiles.value = await window.electron.ipcRenderer.invoke('get-individual-files');
  loadEditedFiles();
  refreshUsageStats();
};

const deleteEditedFile = async (editId) => {
  try {
    await window.electron.ipcRenderer.invoke('delete-edited-file', editId);
    editedFiles.value = editedFiles.value.filter(f => f.edit_id !== editId);
  } catch (err) {
    console.error('[deleteEditedFile] failed:', err);
  }
};

const loadEditedFiles = async () => {
  try {
    const result = await window.electron.ipcRenderer.invoke('get-edited-files');
    console.log('[loadEditedFiles] got', result?.length, 'edited files', result);
    editedFiles.value = result || [];
  } catch (err) {
    console.error('[loadEditedFiles] failed:', err);
  }
};

const handleSearch = (query) => { searchQuery.value = query; loadImages(true); };
const handleScaleUpdate = (newVal) => { if (updateScale) updateScale(newVal); };
const handleSortChange = (sortVal) => { currentSort.value = sortVal; loadImages(true); };
const handleScroll = (e) => onGridScroll(e);

// --- Scroll-driven thumbnail requests (debounced) ---
// Only request thumbnails AFTER the user stops scrolling (150ms idle).
// During active scrolling, no IPC traffic hits main process at all.
let _thumbDebounce = null;

function sendVisiblePaths() {
  const items = visibleImages.value;
  const paths = [];
  for (const item of items) {
    if (!item || item.locked) continue;
    if (item.src) continue; // Already has a thumbnail (cached file or EXIF preview)
    paths.push(item.rawPath);
  }
  if (paths.length > 0) {
    window.electron.ipcRenderer.invoke('process-thumbnails-for-paths', paths);
  }
}

watch(visibleImages, () => {
  if (_thumbDebounce) clearTimeout(_thumbDebounce);
  _thumbDebounce = setTimeout(sendVisiblePaths, 150);
});

const selectAlbum = (album) => { 
  if (!album) return;
  selectedFolderId.value = null; 
  selectedFilePath.value = null;
  selectedSmartAlbumId.value = null;
  selectedPersonId.value = null;
  activeFilter.value = null;
  selectedAlbumId.value = album.id; 
  selectedAlbumName.value = album.name; 
  saveLastView();
  loadImages(true); 
};

const selectFolder = (folder) => { 
  if (!folder || !folder.path) return;
  selectedAlbumId.value = null;   selectedFilePath.value = null;  selectedSmartAlbumId.value = null;  selectedPersonId.value = null;  activeFilter.value = null;  selectedFolderId.value = folder.id; 
  selectedFolderName.value = folder.path.split(/[\\/]/).pop(); 
  saveLastView();
  loadImages(true); 
};
const selectFile = (file) => {
  if (!file || !file.path) return;
  selectedAlbumId.value = null;
  selectedFolderId.value = null;
  selectedSmartAlbumId.value = null;
  selectedPersonId.value = null;
  activeFilter.value = null;
  selectedFilePath.value = file.path;
  saveLastView();
  loadImages(true);
};
const selectEditedFile = (file) => {
  if (!file || !file.path) return;
  selectedAlbumId.value = null;
  selectedFolderId.value = null;
  selectedSmartAlbumId.value = null;
  selectedPersonId.value = null;
  activeFilter.value = null;
  selectedFilePath.value = file.path;
  // Edited files aren't in the images table, so populate the gallery directly
  const p = file.path;
  const src = p.startsWith('pluto://') ? p : `pluto://${p}`;
  mediaFiles.value = [{ src, original: src, rawPath: p, ext: p.split('.').pop().toLowerCase() }];
  totalCount.value = 1;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  deselectAll();
};

const resetView = () => { 
  selectedAlbumId.value = null; 
  selectedFolderId.value = null; 
  selectedFilePath.value = null;
  selectedSmartAlbumId.value = null;
  selectedPersonId.value = null;
  activeFilter.value = 'all';
  searchQuery.value = ''; 
  saveLastView();
  loadImages(true); 
};

const handleToggleProject = async (projectToToggle) => {
  projects.value = projects.value.map(p => p.id === projectToToggle.id ? { ...p, is_collapsed: !p.is_collapsed } : p);
  const newState = projects.value.find(p => p.id === projectToToggle.id).is_collapsed;
  await window.electron.ipcRenderer.invoke('toggle-project-collapse', { projectId: projectToToggle.id, isCollapsed: newState });
};

const beginImportProgress = (message) => {
  importProgress.inProgress = true;
  importProgress.current = 0;
  importProgress.total = 0;
  importProgress.message = message;
  importProgress.done = false;
  importProgress.indeterminate = true;
};

const endImportProgress = () => {
  importProgress.inProgress = false;
  importProgress.indeterminate = false;
};

const importFolder = async () => {
  beginImportProgress('Waiting for folder selection...');
  try {
    const result = await window.electron.ipcRenderer.invoke('import-folder');
    if (result && result.error === 'limit') { showToast('error', 'Limit Reached', result.message); return; }
    if (result && result.error === 'permission') { showToast('error', 'Access Denied', result.message); return; }
    if (result && result.error) { showToast('error', 'Import Failed', result.message || 'The folder could not be imported.'); return; }
    if (result && result.path) {
      await Promise.all([refreshLibraryData(), refreshFilterCounts(), loadImages(true)]);
      if (result.fileCount === 0) {
        showToast('warning', 'No Supported Files', 'No photos or videos were found in the selected folder. Check that the folder contains supported file types (JPG, PNG, HEIC, MP4, etc.).');
      }
    }
  } finally {
    endImportProgress();
  }
};

const importFiles = async () => {
  beginImportProgress('Waiting for file selection...');
  try {
    const result = await window.electron.ipcRenderer.invoke('import-files');
    if (result && result.error === 'limit') { showToast('error', 'Limit Reached', result.message); return; }
    if (result && result.paths && result.paths.length) {
      await Promise.all([refreshLibraryData(), refreshFilterCounts(), loadImages(true)]);
    }
  } finally {
    endImportProgress();
  }
};

const openModal = (mode, projectId = null) => {
  modalConfig.mode = mode;
  modalConfig.targetProjectId = projectId;
  modalConfig.show = true;
};


// App.vue
const handleModalConfirm = async (formData) => {
  try {
    // Explicitly convert values to primitives to break any Proxy/Event links
    const cleanName = String(formData.name);
    const mode = modalConfig.mode;
    let result;
    
    if (mode === 'project') {
      result = await window.electron.ipcRenderer.invoke('create-project', cleanName);
    } 
    else if (mode === 'album') {
      // FIX: Ensure targetProjectId is stripped of any reactive proxy wrappers
      const projectId = modalConfig.targetProjectId;
      
      result = await window.electron.ipcRenderer.invoke('create-album', {
        name: cleanName,
        projectId: typeof projectId === 'object' ? null : projectId 
      });
    }

    // Check for limit error (album creation blocked)
    if (result && result.error === 'limit') {
      showToast('error', 'Limit Reached', result.message);
      modalConfig.show = false;
      modalConfig.targetProjectId = null;
      return;
    }

    // Check for duplicate name error
    if (result && result.success === false) {
      showToast('error', 'Name Already Exists', result.message);
      return; // Keep modal open so user can try a different name
    }

    modalConfig.show = false;
    modalConfig.targetProjectId = null;
    await refreshLibraryData(); 
  } catch (error) {
    console.error("IPC Error:", error);
    showToast('error', 'Something went wrong', 'Failed to create. Please try again.');
  }
};

const openDeleteModal = (type, id) => {
  modalState.type = type;
  modalState.id = id;
  modalState.visible = true;
  modalState.footnote = '';
  const diskNote = 'This will only remove it from the application, not from your local disk.';
  if (type === 'permanent') {
    modalState.title = "Delete from Disk?";
    modalState.message = `This will permanently delete ${selectedPaths.value.size} file(s).`;
  } else if (type === 'wipe') {
    modalState.title = "Wipe Database?";
    modalState.message = "This clears your library but won't delete actual files.";
  } else if (type === 'file') {
    modalState.title = 'Remove File?';
    modalState.message = 'Are you sure you want to remove this file from your library?';
    modalState.footnote = diskNote;
  } else if (type === 'edited-file') {
    modalState.title = 'Remove Edited File?';
    modalState.message = 'Are you sure you want to remove this edited file from your library?';
    modalState.footnote = diskNote;
  } else if (type === 'smart-album') {
    modalState.title = 'Remove Smart Album?';
    modalState.message = 'Are you sure you want to remove this smart album?';
    modalState.footnote = diskNote;
  } else {
    modalState.title = `Remove ${type}?`;
    modalState.message = `Are you sure you want to remove this ${type}?`;
    modalState.footnote = diskNote;
  }
};

const handleDeleteProject = (id) => openDeleteModal('project', id);

const handleDeleteFile = async (filePath) => {
  // Store current view state before deletion
  const wasViewingThisFile = selectedFilePath.value === filePath;
  
  await window.electron.ipcRenderer.invoke('delete-file', filePath);
  
  // Only reset view if this specific file was being viewed in the gallery
  if (wasViewingThisFile) {
    selectedFilePath.value = null;
    loadImages(true);
  }
  
  // Refresh sidebar to remove the file from the list
  await refreshLibraryData();
  refreshFilterCounts();
  refreshPeople();
};

const executeDeletion = async () => {
  const { type, id } = modalState;
  try {
    if (type === 'folder') {
      await window.electron.ipcRenderer.invoke('delete-folder', id);
      if (selectedFolderId.value === id) resetView();
      else await loadImages(false);
    } else if (type === 'album') {
      await window.electron.ipcRenderer.invoke('delete-album', id);
      if (selectedAlbumId.value === id) resetView();
    } else if (type === 'project') {
      await window.electron.ipcRenderer.invoke('delete-project', id);
      await loadImages(false);
    } else if (type === 'permanent') {
      await window.electron.ipcRenderer.invoke('delete-selected', Array.from(selectedPaths.value));
      selectedPaths.value.clear();
      await loadImages(false);
    } else if (type === 'file') {
      const filePath = id;
      const wasViewing = selectedFilePath.value === filePath;
      await window.electron.ipcRenderer.invoke('delete-file', filePath);
      if (wasViewing) { selectedFilePath.value = null; loadImages(true); }
    } else if (type === 'edited-file') {
      const editedFile = editedFiles.value.find(f => f.edit_id === id);
      await window.electron.ipcRenderer.invoke('delete-edited-file', id);
      editedFiles.value = editedFiles.value.filter(f => f.edit_id !== id);
      // Refresh gallery if we were viewing this file
      if (editedFile && selectedFilePath.value === editedFile.output_path) {
        selectedFilePath.value = null;
        loadImages(true);
      }
    } else if (type === 'smart-album') {
      await window.electron.ipcRenderer.invoke('delete-smart-album', { id });
      if (selectedSmartAlbumId.value === id) resetView();
      await refreshSmartAlbums();
    } else if (type === 'wipe') {
      await window.electron.ipcRenderer.invoke('clear-catalog');
      resetView();
    }
    await refreshLibraryData();
    refreshFilterCounts();
    refreshPeople();
  } finally { modalState.visible = false; }
};

const handleRightClick = (filePath, event) => {
  contextMenu.targetPath = filePath;
  // Load current rating and color label for the target file
  const rawPath = decodeURIComponent(filePath.replace(/^pluto:\/\//i, ''));
  window.electron.ipcRenderer.invoke('get-image-details', rawPath).then(details => {
    contextMenuRating.value = details?.rating || 0;
    contextMenuColorLabel.value = details?.color_label || '';
  }).catch(() => {});
  // Clamp to viewport so menu never renders off-screen
  const menuW = 260, menuH = 520;
  contextMenu.x = Math.min(event.clientX, window.innerWidth - menuW);
  contextMenu.y = Math.min(event.clientY, window.innerHeight - menuH);
  contextMenu.visible = true;
};

const setAsCover = async () => {
  if (selectedAlbumId.value && contextMenu.targetPath) {
    // 1. Clean the path for the database (Remove pluto://)
    const rawPath = decodeURIComponent(contextMenu.targetPath.replace(/^pluto:\/\//i, ''));
    
    // 2. Save to DB
    await window.electron.ipcRenderer.invoke('set-album-cover', { 
      albumId: selectedAlbumId.value, 
      coverPath: rawPath 
    });
    
    // 3. IMPORTANT: Refresh the sidebar data so the new cover shows up
    await refreshLibraryData();
  }
  contextMenu.visible = false;
};

const removeSelectedFromAlbum = async () => {
  if (!selectedAlbumId.value) return;
  await window.electron.ipcRenderer.invoke('remove-from-album', { albumId: selectedAlbumId.value, paths: Array.from(selectedPaths.value) });
  selectedPaths.value.clear();
  loadImages(true);
  refreshLibraryData();
};

const handleDragStart = (event, item) => {
  const paths = selectedPaths.value.has(item.original) ? Array.from(selectedPaths.value) : [item.original];
  event.dataTransfer.setData('application/json', JSON.stringify(paths));
};

const handleSidebarDrop = async ({ albumId, paths }) => {
  await window.electron.ipcRenderer.invoke('add-to-album', { albumId, paths });

  // Remove any dropped edited files from the EDITED FILES section
  for (const p of paths) {
    const clean = p.replace(/^pluto:\/\//i, '');
    const normalizedClean = clean.replace(/\\/g, '/');
    const match = editedFiles.value.find(f => {
      const ep = (f.output_path || f.path || '').replace(/\\/g, '/');
      // Case-insensitive on Windows, exact match on macOS/Linux
      return window.electron?.platform === 'win32'
        ? ep.toLowerCase() === normalizedClean.toLowerCase()
        : ep === normalizedClean;
    });
    if (match) {
      await window.electron.ipcRenderer.invoke('delete-edited-file', match.edit_id);
    }
  }
  
  // Refresh gallery so in-album styling updates immediately
  await loadImages(false); 
  
  // Refresh sidebar to update album counts/covers and filter counts
  refreshLibraryData();
  refreshFilterCounts();
};

const openFile = (path) => window.electron.ipcRenderer.invoke('open-external-file', path);

// --- Context menu helpers ---
const isMac = window.electron?.platform === 'darwin';
const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v|3gp|wmv|flv|mpg|mpeg)$/i;
const contextMenuRating = ref(0);
const contextMenuColorLabel = ref('');
const colorLabelOptions = [
  { value: 'red', color: '#ff453a', label: 'Red' },
  { value: 'orange', color: '#ff9f0a', label: 'Orange' },
  { value: 'yellow', color: '#ffd60a', label: 'Yellow' },
  { value: 'green', color: '#30d158', label: 'Green' },
  { value: 'blue', color: '#0a84ff', label: 'Blue' },
  { value: 'purple', color: '#bf5af2', label: 'Purple' },
];
const contextMenuIsVideo = computed(() => {
  if (!contextMenu.targetPath) return false;
  return VIDEO_EXT_RE.test(contextMenu.targetPath);
});
const contextMenuIsImage = computed(() => {
  return contextMenu.targetPath && !contextMenuIsVideo.value;
});

const contextMenuPaths = () => {
  return selectedPaths.value.size > 0 ? Array.from(selectedPaths.value) : (contextMenu.targetPath ? [contextMenu.targetPath] : []);
};

const openContextFile = () => {
  if (contextMenu.targetPath) openFile(contextMenu.targetPath);
  contextMenu.visible = false;
};
const showInExplorer = () => {
  if (contextMenu.targetPath) {
    window.electron.ipcRenderer.invoke('show-in-folder', contextMenu.targetPath);
  }
  contextMenu.visible = false;
};
const copyPathToClipboard = () => {
  if (contextMenu.targetPath) {
    const cleanPath = decodeURIComponent(contextMenu.targetPath.replace(/^pluto:\/\//i, ''));
    navigator.clipboard.writeText(cleanPath).catch(() => {});
    showToast('success', 'Path copied');
  }
  contextMenu.visible = false;
};
const setContextRating = async (rating) => {
  const paths = contextMenuPaths();
  for (const p of paths) {
    await window.electron.ipcRenderer.invoke('set-image-rating', { imagePath: p, rating });
  }
  contextMenuRating.value = rating;
  contextMenu.visible = false;
  loadImages(false);
};
const setContextColorLabel = async (label) => {
  const paths = contextMenuPaths();
  if (paths.length > 1) {
    await window.electron.ipcRenderer.invoke('batch-set-color-label', { paths, color: label });
  } else {
    for (const p of paths) {
      await window.electron.ipcRenderer.invoke('set-image-color-label', { imagePath: p, color: label });
    }
  }
  contextMenuColorLabel.value = label;
  contextMenu.visible = false;
  loadImages(false);
  refreshFilterCounts();
};
const contextEditPhoto = () => {
  if (!contextMenu.targetPath) return;
  contextMenu.visible = false;
  if (exceedsFreeLimits.value) { showToast('error', 'Feature Locked', 'Upgrade to edit photos.'); return; }
  if (!licenseInfo.value?.features?.editPhoto) { showLicenseToast('Photo Editing'); return; }
  openEditor(contextMenu.targetPath);
};
const contextEditVideo = () => {
  if (!contextMenu.targetPath) return;
  contextMenu.visible = false;
  if (exceedsFreeLimits.value) { showToast('error', 'Feature Locked', 'Upgrade to edit videos.'); return; }
  if (!licenseInfo.value?.features?.editPhoto) { showLicenseToast('Video Editing'); return; }
  openVideoTrimmer(contextMenu.targetPath);
};
const contextExport = async () => {
  const paths = contextMenuPaths();
  contextMenu.visible = false;
  if (exceedsFreeLimits.value) { showToast('error', 'Export Locked', 'Upgrade to export files.'); return; }
  try {
    const result = await window.electron.ipcRenderer.invoke('batch-export', { paths, options: {} });
    if (result?.success) showToast('success', `Exported ${result.exported || paths.length} file(s) to ${result.outputDir}`);
  } catch { showToast('error', 'Export failed'); }
};
const contextRemoveFromAlbum = async () => {
  if (!selectedAlbumId.value || !contextMenu.targetPath) return;
  const paths = contextMenuPaths();
  await window.electron.ipcRenderer.invoke('remove-from-album', { albumId: selectedAlbumId.value, paths });
  contextMenu.visible = false;
  loadImages(true);
  refreshLibraryData();
};
const contextGetInfo = async () => {
  if (!contextMenu.targetPath) return;
  // Select the file so the info sidebar shows its details
  const path = contextMenu.targetPath;
  selectedPaths.value.clear();
  selectedPaths.value.add(path);
  contextMenu.visible = false;
};
const contextDelete = () => {
  contextMenu.visible = false;
  openDeleteModal('permanent', null);
};

watch(() => Array.from(selectedPaths.value), async (newSelection) => {
  if (newSelection.length === 1) {
    const rawPath = decodeURIComponent(newSelection[0].replace(/^pluto:\/\//i, ''));
    selectedItemDetails.value = await window.electron.ipcRenderer.invoke('get-file-metadata', rawPath);
  } else { selectedItemDetails.value = null; }
}, { deep: true });

const filterLabels = { all: 'All Photos', 'not-in-albums': 'Not In Albums', 'not-rated': 'Not Rated', 'not-tagged': 'Not Tagged', 'no-label': 'No Label' };

const currentViewName = computed(() => {
  if (selectedSmartAlbumId.value) return `Smart Album: ${selectedAlbumName.value}`;
  if (selectedAlbumId.value) return `Album: ${selectedAlbumName.value}`;
  if (selectedFolderId.value) return `Folder: ${selectedFolderName.value}`;
  if (selectedFilePath.value) return `File: ${selectedFilePath.value.split(/[\\/]/).pop()}`;
  if (selectedPersonId.value) return selectedAlbumName.value;
  return filterLabels[activeFilter.value] || 'Global Library';
});

const closeContextMenu = () => { contextMenu.visible = false; };

onMounted(async () => {
  // Set macOS-specific CSS variable for traffic light padding
  if (window.electron?.platform === 'darwin') {
    document.documentElement.style.setProperty('--titlebar-left-pad', '78px');
  }

  // Load settings and check onboarding
  try {
    const settings = await window.electron.ipcRenderer.invoke('get-settings');
    if (!settings.onboardingComplete) showOnboarding.value = true;
    if (settings.theme) applyTheme(settings.theme);
    else applyTheme('futuristic');
    if (settings.thumbnailSize && updateScale) updateScale(settings.thumbnailSize);
    // Init language from saved setting
    await initLanguage();
    // Restore last view if startup preference is 'last-view'
    await restoreLastView(settings);
  } catch {}

  refreshLibraryData();
  refreshSmartAlbums();
  refreshPeople();
  refreshFilterCounts();
  refreshLicenseInfo();
  refreshUsageStats();
  loadImages();
  refreshServerInfo();
  
  // Use the named function
  window.addEventListener('click', closeContextMenu);
  
  const cleanupImportProgress = ipcOn('import-progress', (data) => Object.assign(importProgress, data));
  const cleanupImportComplete = ipcOn('import-complete', () => {
    endImportProgress();
    refreshLibraryData();
    refreshFilterCounts();
    refreshUsageStats();
    loadImages(true);
  });

  // Listen for auto-scan progress from main process
  const cleanupAutoScan = ipcOn('auto-scan-progress', (data) => {
    autoScan.current = data.current;
    autoScan.total = data.total;
    autoScan.done = data.done;
    autoScan.show = true;
  });

  // Listen for auto-update events
  const cleanupUpdateAvailable = ipcOn('update-available', (data) => {
    updateBanner.version = data?.version || '';
    updateBanner.state = 'available';
    updateBanner.show = true;
  });
  const cleanupDownloadProgress = ipcOn('update-download-progress', (data) => {
    updateBanner.state = 'downloading';
    updateBanner.percent = data?.percent || 0;
    updateBanner.show = true;
  });
  const cleanupUpdateDownloaded = ipcOn('update-downloaded', (data) => {
    updateBanner.version = data?.version || '';
    updateBanner.state = 'ready';
    updateBanner.show = true;
  });

  onUnmounted(() => {
    window.removeEventListener('click', closeContextMenu);
    cleanupImportProgress?.();
    cleanupImportComplete?.();
    cleanupAutoScan?.();
    cleanupUpdateAvailable?.();
    cleanupDownloadProgress?.();
    cleanupUpdateDownloaded?.();
  });
});
</script>

<style scoped>
/* App root wraps title bar + main content */
.app-root { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #000; }
.app-container { display: flex; flex: 1; background: #000; color: #fff; overflow: hidden; min-width: 800px; }
.main-area { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; }
.main-content { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; background: #141414; position: relative; scroll-behavior: smooth; }
.info-sidebar { width: 320px; background: #0a0a0a; border-left: 1px solid rgba(255, 255, 255, 0.1); flex-shrink: 0; overflow: hidden; }
.gallery-section { width: 100%; display: flex; justify-content: center; }
.virtual-spacer { width: 100%; max-width: 100%; position: relative; }
.grid { display: grid; padding: 24px; position: absolute; left: 0; right: 0; margin: 0 auto; justify-content: center; will-change: transform; box-sizing: border-box; }
.custom-context-menu { position: fixed; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 5px 0; min-width: 240px; z-index: 10000; box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.1); animation: ctx-in 0.15s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top left; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
@keyframes ctx-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.custom-context-menu button { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 7px 14px; background: none; border: none; color: #e0e0e0; font-size: 13px; cursor: pointer; transition: background 0.1s; border-radius: 0; }
.custom-context-menu button:hover { background: #0078d4; color: #fff; }
.custom-context-menu button:hover .ctx-icon { filter: brightness(2); }
.custom-context-menu button:focus-visible { background: #0078d4; color: #fff; outline: none; }
.custom-context-menu button.ctx-danger { color: #ff453a; }
.custom-context-menu button.ctx-danger:hover { background: #ff453a; color: #fff; }
.ctx-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; filter: brightness(0.9); }
.ctx-arrow { margin-left: auto; font-size: 10px; opacity: 0.5; }
.menu-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 8px; }
.ctx-rating-row { display: flex; align-items: center; gap: 3px; padding: 6px 14px; }
.ctx-rating-label { font-size: 12px; color: #777; margin-right: auto; }
.ctx-star { cursor: pointer; font-size: 15px; color: #444; transition: color 0.1s, transform 0.1s; }
.ctx-star:hover { transform: scale(1.2); }
.ctx-star:hover, .ctx-star.filled { color: #f5a623; }
.ctx-star.clear { font-size: 11px; color: #555; margin-left: 6px; }
.ctx-star.clear:hover { color: #ff453a; transform: scale(1.2); }
.ctx-color-row { display: flex; align-items: center; gap: 6px; padding: 6px 14px; }
.ctx-color-dot { width: 16px; height: 16px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.1s, border-color 0.15s; flex-shrink: 0; }
.ctx-color-dot:hover { transform: scale(1.2); }
.ctx-color-dot.active { border-color: #fff; box-shadow: 0 0 6px rgba(255,255,255,0.3); }
.ctx-color-dot:first-of-type { width: 16px; height: 16px; background: none !important; font-size: 11px; color: #555; border: none; display: flex; align-items: center; justify-content: center; }
.ctx-color-dot:first-of-type:hover { color: #ff453a; }
.ctx-color-dot:first-of-type.active { color: #ff453a; border-color: transparent; box-shadow: none; }
.submenu-empty { padding: 8px 16px; font-size: 12px; color: #555; font-style: italic; }
.loader { position: fixed; bottom: 20px; right: 300px; }
.spinner { width: 20px; height: 20px; border: 2px solid #222; border-top-color: #0078d4; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
/* App.vue - CSS additions */
.menu-item-with-submenu {
  position: relative;
}

.submenu-trigger { justify-content: flex-start; }

.submenu {
  position: absolute;
  left: 100%;
  top: 0;
  background: #1c1c1e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  min-width: 180px;
  max-height: 320px;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0,0,0,0.55);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.menu-item-with-submenu:hover .submenu,
.menu-item-with-submenu:focus-within .submenu {
  display: block;
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.submenu-section-title {
  padding: 8px 14px 4px;
  font-size: 9px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: bold;
}
@media (max-width: 1280px) { .info-sidebar { width: 260px; min-width: 220px; } }
@media (max-width: 768px) { .info-sidebar { display: none; } }

/* Light theme overrides */
[data-theme="light"] .app-root { background: #e8e8ed; }
[data-theme="light"] .app-container { background: #e8e8ed; color: #1d1d1f; }
[data-theme="light"] .main-content { background: #f5f5f7; }
[data-theme="light"] .info-sidebar { background: #ffffff; border-left-color: rgba(0,0,0,0.08); }
[data-theme="light"] .custom-context-menu { background: rgba(255,255,255,0.95); border-color: rgba(0,0,0,0.08); box-shadow: 0 12px 40px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1); backdrop-filter: blur(20px); }
[data-theme="light"] .custom-context-menu button { color: #1d1d1f; }
[data-theme="light"] .custom-context-menu button:hover { background: #0078d4; color: #fff; }
[data-theme="light"] .custom-context-menu button.ctx-danger { color: #ff3b30; }
[data-theme="light"] .custom-context-menu button.ctx-danger:hover { background: #ff3b30; color: #fff; }
[data-theme="light"] .menu-divider { background: rgba(0,0,0,0.08); }
[data-theme="light"] .submenu { background: rgba(255,255,255,0.95); border-color: rgba(0,0,0,0.08); box-shadow: 0 12px 40px rgba(0,0,0,0.15); }
[data-theme="light"] .submenu-section-title { color: #86868b; }
[data-theme="light"] .ctx-star { color: #ccc; }
[data-theme="light"] .ctx-color-dot { border-color: transparent; }
[data-theme="light"] .ctx-color-dot.active { border-color: #333; }
[data-theme="light"] .ctx-color-dot:first-of-type { color: #999; }
[data-theme="light"] .submenu-empty { color: #999; }
[data-theme="light"] ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.02); }
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); }
[data-theme="light"] .spinner { border-color: #d1d1d6; border-top-color: #0078d4; }

/* Futuristic / Cyber theme overrides */
[data-theme="futuristic"] .app-root { background: #050510; }
[data-theme="futuristic"] .app-container { background: #050510; color: #e0e6ff; }
[data-theme="futuristic"] .main-content { background: #0a0f1e; }
[data-theme="futuristic"] .info-sidebar { background: rgba(10, 15, 30, 0.95); border-left: 1px solid rgba(0, 240, 255, 0.12); backdrop-filter: blur(20px); }
[data-theme="futuristic"] .custom-context-menu { background: rgba(10, 15, 30, 0.96); border: 1px solid rgba(0, 240, 255, 0.15); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.06); backdrop-filter: blur(20px); }
[data-theme="futuristic"] .custom-context-menu button { color: #c0c8e0; }
[data-theme="futuristic"] .custom-context-menu button:hover { background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(168, 85, 247, 0.1)); color: #00f0ff; }
[data-theme="futuristic"] .custom-context-menu button.ctx-danger { color: #ff453a; }
[data-theme="futuristic"] .custom-context-menu button.ctx-danger:hover { background: rgba(255, 69, 58, 0.15); color: #ff453a; }
[data-theme="futuristic"] .menu-divider { background: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .submenu { background: rgba(10, 15, 30, 0.96); border: 1px solid rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .submenu-section-title { color: #a855f7; }
[data-theme="futuristic"] .ctx-star { color: rgba(0, 240, 255, 0.2); }
[data-theme="futuristic"] .ctx-star:hover, [data-theme="futuristic"] .ctx-star.filled { color: #00f0ff; }
[data-theme="futuristic"] .ctx-color-dot.active { border-color: #00f0ff; box-shadow: 0 0 6px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .submenu-empty { color: rgba(0, 240, 255, 0.3); }
[data-theme="futuristic"] ::-webkit-scrollbar-thumb { background: rgba(0, 240, 255, 0.15); }
[data-theme="futuristic"] ::-webkit-scrollbar-thumb:hover { background: rgba(0, 240, 255, 0.25); }
[data-theme="futuristic"] .spinner { border-color: rgba(0, 240, 255, 0.15); border-top-color: #00f0ff; }

/* ---- Update banner ---- */
.update-banner {
  position: fixed; bottom: 24px; right: 24px; z-index: 99999;
  display: flex; align-items: flex-start; gap: 14px;
  padding: 16px 18px 16px 14px;
  background: rgba(24, 24, 32, 0.9);
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 16px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.5),
    0 8px 24px rgba(0, 0, 0, 0.3),
    0 0 40px -10px rgba(88, 166, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  color: #e0e0f0; font-size: 13px;
  min-width: 320px; max-width: 420px;
}
.update-banner.ready {
  border-color: rgba(48, 209, 88, 0.25);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 40px -10px rgba(48, 209, 88, 0.12);
}
.update-icon-wrap {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(88, 166, 255, 0.12); color: #58a6ff;
}
.update-icon-wrap.ready { background: rgba(48, 209, 88, 0.12); color: #30d158; }
.update-icon-wrap.downloading { background: rgba(88, 166, 255, 0.12); color: #58a6ff; }
.update-body { flex: 1; min-width: 0; }
.update-title { font-size: 13.5px; font-weight: 600; color: #f0f0f5; letter-spacing: -0.01em; }
.update-detail { font-size: 12.5px; color: rgba(255, 255, 255, 0.5); margin-top: 2px; line-height: 1.4; }
.update-detail strong { color: #58a6ff; font-weight: 600; }
.update-banner.ready .update-detail strong { color: #30d158; }
.update-progress {
  height: 4px; background: rgba(255, 255, 255, 0.06); border-radius: 2px;
  margin-top: 10px; overflow: hidden;
}
.update-progress-fill {
  height: 100%; border-radius: 2px; transition: width 0.3s ease;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}
.update-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-top: 2px; }
.update-action-btn {
  border: none; border-radius: 9px; cursor: pointer;
  font-size: 12px; font-weight: 600; padding: 7px 16px; letter-spacing: 0.02em;
  background: rgba(88, 166, 255, 0.15); color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.2);
  transition: all 0.2s ease;
}
.update-action-btn:hover { background: rgba(88, 166, 255, 0.25); border-color: rgba(88, 166, 255, 0.35); }
.update-action-btn.ready { background: rgba(48, 209, 88, 0.15); color: #30d158; border-color: rgba(48, 209, 88, 0.2); }
.update-action-btn.ready:hover { background: rgba(48, 209, 88, 0.25); border-color: rgba(48, 209, 88, 0.35); }
.update-action-btn.upgrade { background: rgba(255, 160, 10, 0.15); color: #ffa00a; border-color: rgba(255, 160, 10, 0.2); }
.update-action-btn.upgrade:hover { background: rgba(255, 160, 10, 0.25); border-color: rgba(255, 160, 10, 0.35); }
.update-dismiss-btn {
  background: rgba(255, 255, 255, 0.06); border: none; border-radius: 6px;
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  color: rgba(255, 255, 255, 0.3); cursor: pointer; transition: all 0.15s ease;
}
.update-dismiss-btn:hover { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.12); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Banner transition */
.update-banner-enter-active, .update-banner-leave-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.update-banner-enter-from { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(4px); }
.update-banner-leave-to { opacity: 0; transform: translateY(12px) scale(0.95); filter: blur(4px); }

/* Light theme */
[data-theme="light"] .update-banner { background: rgba(255, 255, 255, 0.92); border-color: rgba(0, 0, 0, 0.08); color: #1d1d1f; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08); }
[data-theme="light"] .update-title { color: #1d1d1f; }
[data-theme="light"] .update-detail { color: rgba(0, 0, 0, 0.5); }
[data-theme="light"] .update-detail strong { color: #0078d4; }
[data-theme="light"] .update-icon-wrap { background: rgba(0, 120, 212, 0.1); color: #0078d4; }
[data-theme="light"] .update-action-btn { background: #0078d4; color: #fff; border-color: transparent; }
[data-theme="light"] .update-action-btn:hover { background: #1a8ae6; }
[data-theme="light"] .update-action-btn.ready { background: #28a745; color: #fff; border-color: transparent; }
[data-theme="light"] .update-dismiss-btn { background: rgba(0, 0, 0, 0.04); color: rgba(0, 0, 0, 0.3); }
[data-theme="light"] .update-dismiss-btn:hover { background: rgba(0, 0, 0, 0.08); color: rgba(0, 0, 0, 0.6); }

/* ---- Upgrade banner (expired trial) ---- */
.upgrade-banner {
  position: fixed; top: 38px; left: 0; right: 0; z-index: 99998;
  display: flex; align-items: center; gap: 14px;
  padding: 12px 20px;
  background: rgba(45, 27, 0, 0.92);
  border-bottom: 1px solid rgba(255, 160, 0, 0.2);
  color: #ffe0a0; font-size: 12.5px; line-height: 1.5;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
}
.upgrade-icon-wrap { font-size: 18px; flex-shrink: 0; }
.upgrade-body { flex: 1; min-width: 0; }
.upgrade-title { font-size: 13px; font-weight: 600; color: #ffc64d; }
.upgrade-detail { font-size: 12px; color: rgba(255, 224, 160, 0.7); margin-top: 1px; }
.upgrade-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
[data-theme="light"] .upgrade-banner { background: rgba(255, 243, 224, 0.95); border-bottom-color: #e0a040; color: #5d4200; }
[data-theme="light"] .upgrade-title { color: #5d4200; }
[data-theme="light"] .upgrade-detail { color: rgba(93, 66, 0, 0.7); }
[data-theme="light"] .update-action-btn.upgrade { background: #e68900; color: #fff; border-color: transparent; }
[data-theme="futuristic"] .upgrade-banner { background: linear-gradient(135deg, rgba(255, 160, 0, 0.08), rgba(168, 85, 247, 0.06)); border-bottom: 1px solid rgba(255, 160, 0, 0.2); }
</style>