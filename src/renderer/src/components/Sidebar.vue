<template>
  <aside class="sidebar" :class="{ 'sidebar-collapsed': collapsed }" role="navigation" aria-label="Library sidebar">
    <button class="sidebar-collapse-btn" @click="$emit('toggle-collapse')" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="collapsed" points="9 18 15 12 9 6"/>
        <polyline v-else points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- Collapsed icon rail -->
    <div v-if="collapsed" class="collapsed-rail">
      <div class="rail-logo" title="Pluto Photos">
        <img src="/logo.png" alt="Pluto" class="rail-logo-img" />
      </div>
      <div class="rail-divider"></div>
      <button class="rail-btn" :class="{ active: activeFilter === 'all' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }" @click="$emit('select-filter', 'all')" title="All Photos">
        <Images :size="18" />
      </button>
      <button class="rail-btn" :class="{ active: activeFilter === 'not-in-albums' && !selectedFolderId && !selectedAlbumId }" @click="$emit('select-filter', 'not-in-albums')" title="Not In Albums">
        <FolderX :size="18" />
      </button>
      <button class="rail-btn" :class="{ active: activeFilter === 'not-rated' && !selectedFolderId && !selectedAlbumId }" @click="$emit('select-filter', 'not-rated')" title="Unrated">
        <StarOff :size="18" />
      </button>
      <div class="rail-divider"></div>
      <button class="rail-btn" @click="$emit('import')" :disabled="importProgress.inProgress" title="Import Folder">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="rail-btn" @click="$emit('import-files')" :disabled="importProgress.inProgress" title="Import Files">
        <FileText :size="18" />
      </button>
      <div class="rail-divider"></div>
      <button class="rail-btn" @click="$emit('refresh-library')" title="Refresh Library">
        <RefreshCw :size="18" />
      </button>
    </div>

    <div v-if="!collapsed" class="sidebar-header">
      <div class="brand-container">
        <div class="logo-wrapper">
          <img src="/logo.png" alt="Pluto Photos" class="sidebar-logo" />
        </div>
        <div class="brand-text">
          <h1 class="brand">Pluto</h1>
          <span class="brand-sub">Photos</span>
        </div>
      </div>

      <button 
        class="btn-import" 
        :disabled="importProgress.inProgress" 
        @click="$emit('import')"
      >
        <span class="icon-plus-thick"></span>
        <span class="btn-text">{{ t('importFolder') }}</span>
      </button>
      <button 
        class="btn-import" 
        :disabled="importProgress.inProgress" 
        @click="$emit('import-files')"
        style="margin-top:8px;"
      >
        <span class="icon-plus-thick"></span>
        <span class="btn-text">{{ t('importFiles') }}</span>
      </button>
      
      <div v-if="importProgress.inProgress" class="import-progress">
        <div class="progress-bar">
          <div 
            class="progress-bar-inner"
            :class="{ indeterminate: importProgress.indeterminate }"
            :style="{ width: importProgress.indeterminate ? '35%' : (100 * importProgress.current / Math.max(importProgress.total || 1, 1)) + '%' }"
          ></div>
        </div>
        <div class="progress-label">{{ importProgress.message }}</div>
      </div>
    </div>
    
    <div 
      v-if="!collapsed"
      class="sidebar-scroll-wrapper"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleScrollerDragOver"
      @dragleave="handleWrapperDragLeave"
      @drop="handleDragEnd"
      @dragend="handleDragEnd"
      @wheel="handleWheelDuringDrag"
    >
      <DynamicScroller
        ref="scrollerRef"
        class="sidebar-scroll"
        :items="flattenedList"
        :min-item-size="110"  key-field="virtualId"
        :buffer="200"
      >
        <template v-slot="{ item, index, active }">
          <DynamicScrollerItem
            :item="item"
            :active="active"
            :size-dependencies="[item.type, item.is_collapsed]" 
            :data-index="index"
          >
            <div v-if="item.type === 'project'" class="project-header" :class="{ 'is-locked': item.locked }">
              <div class="project-title" @click="$emit('toggle-project', item)">
                <span class="chevron" :class="{ 'is-collapsed': item.is_collapsed }">▼</span>
                {{ item.name }}
                <span v-if="item.locked" class="lock-badge" style="margin-left:auto">🔒 PRO</span>
              </div>
              <div v-if="!item.locked" class="project-actions">
              <button class="icon-btn" title="Add Album" @click.stop="$emit('create-album', Number(item.id))">
                <span class="icon-plus"></span>
              </button>
              <button class="icon-btn delete" title="Remove Project" @click.stop="$emit('delete-project', Number(item.id))">
                <span class="icon-close"></span>
              </button>
            </div>
          </div>

            <div 
              v-else-if="item.type === 'album'"
              class="nav-item album-item"
              :class="{ 
                'active': selectedAlbumId === item.id && !item.locked,
                'dragging': draggingAlbumId === item.id,
                'drop-after': dragTargetId === item.id && dropPosition === 'after',
                'drop-before': dragTargetId === item.id && dropPosition === 'before',
                'is-locked': item.locked
              }"
              :draggable="!item.locked"
              role="treeitem"
              tabindex="0"
              :aria-label="item.name + ' album'"
              :aria-selected="selectedAlbumId === item.id && !item.locked"
              @click="item.locked ? null : $emit('select-album', { id: Number(item.id), name: String(item.name) })"
              @keydown.enter.prevent="item.locked ? null : $emit('select-album', { id: Number(item.id), name: String(item.name) })"
              @keydown.space.prevent="item.locked ? null : $emit('select-album', { id: Number(item.id), name: String(item.name) })"
              @dragstart="!item.locked && handleAlbumDragStart($event, item)"
              @dragover="!item.locked && handleDragOver($event, item)"
              @dragleave="!item.locked && handleDragLeave($event)"
              @drop="!item.locked && handleDrop($event, item.id)"
              @dragend="draggingAlbumId = null; dropPosition = null; dragTargetId = null"
            >
            <div class="album-thumb">
              <img v-if="item.cover_path && !item.locked" :src="'pluto://' + item.cover_path" class="cover-img" />
              <div v-else-if="item.locked" class="empty-thumb locked-thumb"><Lock :size="16" /></div>
              <div v-else class="empty-thumb"><ImageIcon :size="20" /></div>
            </div>
            <span class="nav-label">{{ item.name }}</span>
            <span v-if="item.locked" class="lock-badge">🔒 PRO</span>
            <button v-if="!item.locked" class="btn-delete" title="Remove Album" @click.stop="$emit('delete-album', Number(item.id))">
              <span class="icon-close-small"></span>
            </button>
          </div>
          <div 
            v-else-if="item.type === 'file'"
            class="nav-item file-item"
            :class="{ 'active': false }"
            @click="$emit('select-file', { path: item.full_path })"
          >
            <span class="nav-icon"><FileText :size="18" /></span>
            <span class="nav-label">{{ item.name || item.full_path.split(/[\\/]/).pop() }}</span>
            <button class="btn-delete" title="Remove File" @click.stop="$emit('delete-file', item.full_path)">
              <span class="icon-close-small"></span>
            </button>
          </div>
          <div 
            v-else-if="item.type === 'edited-file'"
            class="nav-item edited-file-item"
            @click="$emit('select-edited-file', { path: item.output_path })"
          >
            <span class="nav-icon edited-icon">✏️</span>
            <span class="nav-label">{{ item.output_path.split(/[\\/]/).pop() }}</span>
            <button class="btn-delete" title="Remove Edited File" @click.stop="$emit('delete-edited-file', item.edit_id)">
              <span class="icon-close-small"></span>
            </button>
          </div>
          <div 
            v-else-if="item.type === 'folder'" 
            class="nav-item folder-item"
            :class="{ 'active': selectedFolderId === item.id }"
            role="treeitem"
            tabindex="0"
            :aria-label="item.path.split(/[\\/\\\\]/).pop() + ' folder'"
            :aria-selected="selectedFolderId === item.id"
            @click="$emit('select-folder', { id: Number(item.id), path: String(item.path) })"
            @keydown.enter.prevent="$emit('select-folder', { id: Number(item.id), path: String(item.path) })"
            @keydown.space.prevent="$emit('select-folder', { id: Number(item.id), path: String(item.path) })"
          >
            <span class="nav-icon"><Folder :size="18" /></span>
            <span class="nav-label">{{ item.path.split(/[\\/]/).pop() }}</span>
            <span 
              class="folder-count" 
              :title="`${item.inAlbumsCount || 0} of ${item.totalCount || 0} files are in albums`"
            >{{ item.inAlbumsCount || 0 }}/{{ item.totalCount || 0 }}</span>
                  
            <button class="btn-sync" title="Sync Folder" @click.stop="$emit('sync-folder', Number(item.id))">
              <RefreshCw :size="14" />
            </button>
          
            <button class="btn-delete" title="Remove Folder" @click.stop="$emit('delete-folder', Number(item.id))">
              <span class="icon-close-small"></span>
            </button>
          </div>

          <div 
            v-else-if="item.type === 'root'" 
            class="filter-section"
          >
            <div
              class="nav-item filter-item"
              :class="{ 'active': activeFilter === 'all' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }"
              role="treeitem"
              tabindex="0"
              aria-label="All photos"
              @click="$emit('select-filter', 'all')"
              @keydown.enter.prevent="$emit('select-filter', 'all')"
              @keydown.space.prevent="$emit('select-filter', 'all')"
            >
              <span class="nav-icon"><Images :size="16" /></span>
              <span class="nav-label">All</span>
              <span class="filter-count">{{ filterCounts.total ?? '—' }}</span>
            </div>
            <div
              class="nav-item filter-item"
              :class="{ 'active': activeFilter === 'not-in-albums' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }"
              role="treeitem"
              tabindex="0"
              aria-label="Not in albums"
              @click="$emit('select-filter', 'not-in-albums')"
              @keydown.enter.prevent="$emit('select-filter', 'not-in-albums')"
              @keydown.space.prevent="$emit('select-filter', 'not-in-albums')"
            >
              <span class="nav-icon"><FolderX :size="16" /></span>
              <span class="nav-label">Not In Albums</span>
              <span class="filter-count">{{ filterCounts.notInAlbums ?? '—' }}</span>
            </div>
            <div
              class="nav-item filter-item"
              :class="{ 'active': activeFilter === 'not-rated' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }"
              role="treeitem"
              tabindex="0"
              aria-label="Unrated photos"
              @click="$emit('select-filter', 'not-rated')"
              @keydown.enter.prevent="$emit('select-filter', 'not-rated')"
              @keydown.space.prevent="$emit('select-filter', 'not-rated')"
            >
              <span class="nav-icon"><StarOff :size="16" /></span>
              <span class="nav-label">Unrated</span>
              <span class="filter-count">{{ filterCounts.notRated ?? '—' }}</span>
            </div>
            <div
              class="nav-item filter-item"
              :class="{ 'active': activeFilter === 'not-tagged' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }"
              role="treeitem"
              tabindex="0"
              aria-label="Untagged photos"
              @click="$emit('select-filter', 'not-tagged')"
              @keydown.enter.prevent="$emit('select-filter', 'not-tagged')"
              @keydown.space.prevent="$emit('select-filter', 'not-tagged')"
            >
              <span class="nav-icon"><TagsIcon :size="16" /></span>
              <span class="nav-label">Untagged</span>
              <span class="filter-count">{{ filterCounts.notTagged ?? '—' }}</span>
            </div>
            <div
              class="nav-item filter-item"
              :class="{ 'active': activeFilter === 'no-label' && !selectedFolderId && !selectedAlbumId && !selectedSmartAlbumId && !selectedPersonId }"
              role="treeitem"
              tabindex="0"
              aria-label="No label photos"
              @click="$emit('select-filter', 'no-label')"
              @keydown.enter.prevent="$emit('select-filter', 'no-label')"
              @keydown.space.prevent="$emit('select-filter', 'no-label')"
            >
              <span class="nav-icon"><Palette :size="16" /></span>
              <span class="nav-label">No Label</span>
              <span class="filter-count">{{ filterCounts.noLabel ?? '—' }}</span>
            </div>
          </div>

          <div v-else-if="item.type === 'section'" class="section-title">
            {{ item.name }}
            <button v-if="item.name === 'PROJECTS'" class="add-btn" @click="$emit('create-project')">
              <span class="icon-plus" style="width: 10px; height: 10px;"></span>
            </button>
          </div>


        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
    </div>

    <div v-if="!collapsed" class="sidebar-lower">
    <!-- Smart Albums Section -->
    <div class="smart-albums-section" :class="{ 'feature-locked': licenseTier !== 'pro' }">
      <div class="section-title section-toggle" @click="smartAlbumsCollapsed = !smartAlbumsCollapsed">
        <div class="section-toggle-left">
          <span class="section-toggle-arrow" :class="{ collapsed: smartAlbumsCollapsed }">▾</span>
          SMART ALBUMS
        </div>
        <span v-if="licenseTier !== 'pro'" class="lock-badge">PRO</span>
        <button v-else class="add-btn" @click.stop="$emit('create-smart-album')">
          <span class="icon-plus" style="width: 10px; height: 10px;"></span>
        </button>
      </div>
      <div class="section-collapsible" :class="{ collapsed: smartAlbumsCollapsed }">
      <div v-if="licenseTier !== 'pro'" class="feature-locked-overlay">
        <span class="lock-icon">🔒</span>
        <span class="lock-text">Upgrade to Pro</span>
      </div>
      <template v-else>
      <div v-if="!smartAlbums || smartAlbums.length === 0" class="smart-albums-empty">
        <span class="smart-albums-empty-icon"><Search :size="24" /></span>
        <span class="smart-albums-empty-text">No smart albums yet</span>
        <button class="btn-create-smart-album" @click="$emit('create-smart-album')">Create Smart Album</button>
      </div>
      <div 
        v-for="sa in smartAlbums" :key="sa.id" 
        class="nav-item smart-album-item"
        :class="{ active: selectedSmartAlbumId === sa.id }"
        :title="formatSmartAlbumRules(sa.rules)"
        @click="$emit('select-smart-album', sa)"
      >
        <span class="nav-icon">
          <component v-if="smartAlbumIconMap[sa.icon]" :is="smartAlbumIconMap[sa.icon]" :size="18" />
          <template v-else>{{ sa.icon || '?' }}</template>
        </span>
        <span class="nav-label">{{ sa.name }}</span>
        <button class="btn-delete" title="Remove Smart Album" @click.stop="$emit('delete-smart-album', sa.id)">
          <span class="icon-close-small"></span>
        </button>
      </div>
      </template>
      </div>
    </div>

    <!-- Persons Section -->
    <div class="persons-section" :class="{ 'feature-locked': licenseTier !== 'pro' }">
      <div class="section-title section-toggle" @click="personsCollapsed = !personsCollapsed">
        <div class="section-toggle-left">
          <span class="section-toggle-arrow" :class="{ collapsed: personsCollapsed }">▾</span>
          PERSONS
        </div>
        <span v-if="licenseTier !== 'pro'" class="lock-badge">PRO</span>
        <button v-else class="add-btn" @click.stop="$emit('open-people')" title="Manage People">
          <span class="icon-plus" style="width: 10px; height: 10px;"></span>
        </button>
      </div>
      <div class="section-collapsible" :class="{ collapsed: personsCollapsed }">
      <div v-if="licenseTier !== 'pro'" class="feature-locked-overlay">
        <span class="lock-icon">🔒</span>
        <span class="lock-text">Upgrade to Pro</span>
      </div>
      <template v-else>
      <div v-if="!people || people.length === 0" class="persons-empty">
        <span class="persons-empty-icon"><User :size="24" /></span>
        <span class="persons-empty-text">No people discovered yet</span>
        <button class="btn-scan-people" @click="$emit('open-people')">Scan for Faces</button>
      </div>
      <div 
        v-for="person in people" :key="person.id" 
        class="nav-item person-item"
        :class="{ active: selectedPersonId === person.id }"
        @click="$emit('select-person', person)"
      >
        <div class="person-avatar-sm">
          <img v-if="person.sample_face_path" :src="'pluto://' + person.sample_face_path" class="person-avatar-img" />
          <span v-else class="person-avatar-placeholder"><User :size="18" /></span>
        </div>
        <span class="nav-label">{{ person.name || 'Unknown' }}</span>
        <span class="person-face-count">{{ person.face_count || 0 }}</span>
      </div>
      </template>
      </div>
    </div>
    </div>

    <div v-if="!collapsed" class="sidebar-footer">
      <div class="footer-toggle" @click="footerCollapsed = !footerCollapsed">
        <span class="footer-toggle-arrow" :class="{ collapsed: footerCollapsed }">▾</span>
        <span class="footer-toggle-label">{{ footerCollapsed ? t('showAdmin') : t('hideAdmin') }}</span>
      </div>
      <div class="footer-content" :class="{ collapsed: footerCollapsed }">
      <div v-if="serverInfo && serverInfo.running" class="mobile-access">
        <div class="mobile-label"><Smartphone :size="14" style="vertical-align: middle; margin-right: 4px;" /> {{ t('mobileAccess') }}</div>
        <div v-for="addr in serverInfo.addresses" :key="addr.address" class="mobile-url">
          {{ serverInfo.https ? 'https' : 'http' }}://{{ addr.address }}:{{ serverInfo.port }}
        </div>

        <!-- Web Password Section -->
        <div class="web-auth-section">
          <div v-if="serverInfo.hasPassword" class="auth-status">
            <span class="auth-badge enabled"><Lock :size="12" style="vertical-align: middle; margin-right: 2px;" /> {{ t('protected') }}</span>
            <span class="auth-user">{{ serverInfo.username }}</span>
            <button class="btn-auth-remove" @click="showRemoveForm = !showRemoveForm; showPasswordForm = false" title="Remove password">✕</button>
          </div>
          <div v-else class="auth-status">
            <span class="auth-badge disabled"><LockOpen :size="12" style="vertical-align: middle; margin-right: 2px;" /> {{ t('noPassword') }}</span>
          </div>

          <div v-if="showRemoveForm" class="auth-form remove-form">
            <div class="auth-form-hint">Enter current password to remove protection</div>
            <input v-model="removePassword" type="password" placeholder="Current password" class="auth-input" @keydown.enter="handleClearCredentials" />
            <div v-if="removeError" class="auth-error">{{ removeError }}</div>
            <div class="auth-form-actions">
              <button class="btn-auth-remove-confirm" @click="handleClearCredentials" :disabled="!removePassword">Remove</button>
              <button class="btn-auth-cancel" @click="showRemoveForm = false; removePassword = ''; removeError = ''">{{ t('cancel') }}</button>
            </div>
          </div>

          <div v-if="!showPasswordForm && !showRemoveForm && !serverInfo.hasPassword" style="margin-top:6px;">
            <button class="btn-auth-setup" @click="showPasswordForm = true">{{ t('setPassword') }}</button>
          </div>
          <div v-if="!showPasswordForm && !showRemoveForm && serverInfo.hasPassword" style="margin-top:6px;">
            <button class="btn-auth-setup" @click="showPasswordForm = true; isChangingPassword = true; showRemoveForm = false">{{ t('changePassword') }}</button>
          </div>

          <div v-if="showPasswordForm" class="auth-form">
            <input v-if="isChangingPassword" v-model="authCurrentPassword" type="password" placeholder="Current password" class="auth-input" />
            <input v-model="authUsername" type="text" :placeholder="t('username')" class="auth-input" />
            <input v-model="authPassword" type="password" :placeholder="isChangingPassword ? 'New password' : t('password')" class="auth-input" />
            <div v-if="authError" class="auth-error">{{ authError }}</div>
            <div class="auth-form-actions">
              <button class="btn-auth-save" @click="handleSetCredentials" :disabled="!authUsername || !authPassword || (isChangingPassword && !authCurrentPassword)">{{ t('save') }}</button>
              <button class="btn-auth-cancel" @click="resetAuthForm()">{{ t('cancel') }}</button>
            </div>
          </div>
        </div>
      </div>
      <button class="btn-danger" @click="$emit('wipe-database')">{{ t('wipeDatabase') }}</button>
      <button class="btn-refresh" @click="$emit('refresh-library')"><RefreshCw :size="12" style="vertical-align: middle; margin-right: 4px;" /> {{ t('syncFiles') }}</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, toRaw, onUnmounted } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useI18n } from '../useI18n'
import { Camera, Folder, FileText, Images, User, Smartphone, Lock, LockOpen, Search, Star, Image as ImageIcon, Film, Heart, MapPin, Calendar, Globe, RefreshCw, FolderX, StarOff, TagsIcon, Palette } from 'lucide-vue-next'

const { t } = useI18n()

const smartAlbumIconMap = {
  search: Search, star: Star, image: ImageIcon, film: Film,
  camera: Camera, heart: Heart, 'map-pin': MapPin, calendar: Calendar,
  globe: Globe, user: User
}

const formatSmartAlbumRules = (rules) => {
  if (!rules || !rules.length) return ''
  const labels = {
    file_type: 'File Type',
    rating_gte: 'Rating ≥',
    rating_eq: 'Rating =',
    color_label: 'Color Label',
    tag: 'Has Tag',
    date_after: 'Date After',
    date_before: 'Date Before',
    has_gps: 'Has Location',
    has_faces: 'Has Faces',
    name_contains: 'Name Contains'
  }
  const fmtValue = (rule) => {
    const v = rule.value
    if (rule.type === 'file_type') {
      if (v === 'custom') return rule.customExt || 'custom'
      return v ? v.charAt(0).toUpperCase() + v.slice(1) : v
    }
    if (rule.type === 'color_label') return v ? v.charAt(0).toUpperCase() + v.slice(1) : v
    if (rule.type === 'has_gps' || rule.type === 'has_faces') {
      return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Any'
    }
    if (rule.type === 'rating_gte' || rule.type === 'rating_eq') return '★'.repeat(v || 0)
    return String(v || '')
  }
  return rules.map(r => `${labels[r.type] || r.type}: ${fmtValue(r)}`).join('\n')
}

const props = defineProps({
  globalFolders: Array,
  projects: Array,
  importProgress: Object,
  selectedFolderId: Number,
  selectedAlbumId: Number,
  globalFiles: Array,
  serverInfo: Object,
  smartAlbums: { type: Array, default: () => [] },
  selectedSmartAlbumId: Number,
  people: { type: Array, default: () => [] },
  selectedPersonId: Number,
  filterCounts: { type: Object, default: () => ({}) },
  activeFilter: { type: String, default: 'all' },
  editedFiles: { type: Array, default: () => [] },
  licenseTier: { type: String, default: 'free' },
  collapsed: { type: Boolean, default: false }
})

const emit = defineEmits([
  'import', 'import-files', 'select-folder', 'select-album', 'select-file', 'reset-view', 
  'create-project', 'create-album', 'toggle-project', 'delete-folder', 'delete-file',
  'delete-album', 'wipe-database', 'drop-images', 'delete-project',
  'refresh-library', 'sync-folder', 'reorder-albums', 'refresh-server-info',
  'create-smart-album', 'select-smart-album', 'delete-smart-album',
  'select-person', 'open-people', 'select-filter',
  'select-edited-file', 'delete-edited-file',
  'toggle-collapse'
])

// --- State ---
const dragTargetId = ref(null)
const draggingAlbumId = ref(null)
const dropPosition = ref(null) // 'before' or 'after'
const scrollerRef = ref(null)
let autoScrollInterval = null
let scrollDirection = 0
let isDraggingOver = false

// --- Web Auth State ---
const footerCollapsed = ref(true)
const smartAlbumsCollapsed = ref(false)
const personsCollapsed = ref(false)
const showPasswordForm = ref(false)
const authUsername = ref('')
const authPassword = ref('')
const authCurrentPassword = ref('')
const authError = ref('')
const isChangingPassword = ref(false)
const showRemoveForm = ref(false)
const removePassword = ref('')
const removeError = ref('')

const resetAuthForm = () => {
  showPasswordForm.value = false
  authUsername.value = ''
  authPassword.value = ''
  authCurrentPassword.value = ''
  authError.value = ''
  isChangingPassword.value = false
  showRemoveForm.value = false
  removePassword.value = ''
  removeError.value = ''
}

const handleSetCredentials = async () => {
  if (!authUsername.value || !authPassword.value) return
  authError.value = ''

  // If changing an existing password, verify the current one first
  if (isChangingPassword.value) {
    if (!authCurrentPassword.value) {
      authError.value = 'Current password is required'
      return
    }
    try {
      const verify = await window.electron.ipcRenderer.invoke('verify-web-password', {
        password: authCurrentPassword.value
      })
      if (!verify.valid) {
        authError.value = 'Current password is incorrect'
        return
      }
    } catch (e) {
      authError.value = 'Failed to verify password'
      return
    }
  }

  try {
    const result = await window.electron.ipcRenderer.invoke('set-web-credentials', {
      username: authUsername.value,
      password: authPassword.value,
    })
    if (result.success) {
      resetAuthForm()
      emit('refresh-server-info')
    }
  } catch (e) {
    console.error('Failed to set credentials:', e)
  }
}

const handleClearCredentials = async () => {
  removeError.value = ''
  if (!removePassword.value) {
    removeError.value = 'Password is required'
    return
  }
  try {
    const verify = await window.electron.ipcRenderer.invoke('verify-web-password', {
      password: removePassword.value
    })
    if (!verify.valid) {
      removeError.value = 'Password is incorrect'
      return
    }
    const result = await window.electron.ipcRenderer.invoke('clear-web-credentials')
    if (result.success) {
      resetAuthForm()
      emit('refresh-server-info')
    }
  } catch (e) {
    console.error('Failed to clear credentials:', e)
    removeError.value = 'Failed to remove password'
  }
}

// --- Auto-scroll when dragging near edges ---
const handleScrollerDragOver = (event) => {
  isDraggingOver = true;
  
  // Get the scroller's scrollable element
  const scrollerEl = scrollerRef.value?.$el;
  if (!scrollerEl) return;
  
  const rect = scrollerEl.getBoundingClientRect();
  const mouseY = event.clientY;
  const edgeSize = 80; // pixels from edge to trigger scroll
  const scrollSpeed = 12; // pixels per frame
  
  let newDirection = 0;
  
  // Near top edge - scroll up
  if (mouseY < rect.top + edgeSize && mouseY >= rect.top) {
    newDirection = -1;
  }
  // Near bottom edge - scroll down  
  else if (mouseY > rect.bottom - edgeSize && mouseY <= rect.bottom) {
    newDirection = 1;
  }
  
  // Start or update scrolling
  if (newDirection !== 0 && newDirection !== scrollDirection) {
    stopAutoScroll();
    scrollDirection = newDirection;
    autoScrollInterval = setInterval(() => {
      scrollerEl.scrollTop += scrollSpeed * scrollDirection;
    }, 16);
  } else if (newDirection === 0) {
    stopAutoScroll();
  }
}

const stopAutoScroll = () => {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  scrollDirection = 0;
}

const handleDragEnter = (event) => {
  isDraggingOver = true;
}

const handleWrapperDragLeave = (event) => {
  // Only reset if we're actually leaving the wrapper (not entering a child)
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;
  
  // Check if mouse is outside the wrapper bounds
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    stopAutoScroll();
    isDraggingOver = false;
  }
}

const handleDragEnd = () => {
  stopAutoScroll();
  isDraggingOver = false;
}

// --- Wheel scroll during drag ---
const handleWheelDuringDrag = (event) => {
  // Always proxy wheel events to the scroller - this enables scrolling during drag operations
  // since the wrapper has overflow:hidden and doesn't scroll naturally
  const scrollerEl = scrollerRef.value?.$el;
  if (!scrollerEl) return;
  
  // Only prevent default and manually scroll if we're in a drag operation
  // This allows normal wheel scrolling to work via the scroller's native handling
  if (isDraggingOver) {
    event.preventDefault();
    event.stopPropagation();
    scrollerEl.scrollTop += event.deltaY;
  }
}

// --- Drag & Drop Handlers ---
const handleAlbumDragStart = (event, album) => {
  draggingAlbumId.value = album.id;
  // Set a specific type so we don't confuse this with moving images
  event.dataTransfer.setData('application/album-id', album.id.toString());
  event.dataTransfer.effectAllowed = 'move';
}

const handleDragOver = (event, item) => {
  event.preventDefault();
  
  // Only show drop target if we are dragging a DIFFERENT album
  if (draggingAlbumId.value && draggingAlbumId.value !== item.id) {
    dragTargetId.value = item.id;
    
    // Determine position based on mouse position within the element
    // Top half = before, bottom half = after
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const midpoint = rect.height / 2;
    
    dropPosition.value = relativeY < midpoint ? 'before' : 'after';
  } else if (!draggingAlbumId.value) {
    // Dropping images into album
    dragTargetId.value = item.id;
  }
}

const handleDragLeave = (event) => {
  // Only clear if we're actually leaving the element (not entering a child)
  const relatedTarget = event.relatedTarget;
  const currentTarget = event.currentTarget;
  
  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    dragTargetId.value = null;
    dropPosition.value = null;
  }
}

const handleDrop = (event, targetAlbumId) => {
  const currentPosition = dropPosition.value;
  dragTargetId.value = null
  dropPosition.value = null
  
  const albumIdData = event.dataTransfer.getData('application/album-id');
  
  // CASE 1: Reordering Albums
  if (albumIdData) {
    const draggedId = Number(albumIdData);
    const targetId = Number(targetAlbumId);
    
    if (draggedId !== targetId) {
      emit('reorder-albums', { draggedId, targetId, position: currentPosition });
    }
    draggingAlbumId.value = null;
    return;
  }

  // CASE 2: Dropping Images into Album
  try {
    const rawData = event.dataTransfer.getData('application/json')
    if (!rawData) return
    const paths = JSON.parse(rawData)
    emit('drop-images', { 
      albumId: Number(targetAlbumId), 
      paths: Array.from(paths) 
    })
  } catch (e) {
    console.error("Drop failed", e)
  }
}

// --- Computed List Logic ---
const flattenedList = computed(() => {
  const list = []
  list.push({ virtualId: 'root-all', type: 'root' })

  list.push({ virtualId: 'sec-files', type: 'section', name: 'IMPORTED FILES' })
  // Add individually imported files
  if (props.globalFiles && props.globalFiles.length) {
    props.globalFiles.forEach(f => {
      list.push({ ...toRaw(f), virtualId: `file-${f.id || f.full_path}`, type: 'file' })
    })
  }

  // Edited Files section
  if (props.editedFiles && props.editedFiles.length) {
    list.push({ virtualId: 'sec-edited', type: 'section', name: 'EDITED FILES' })
    props.editedFiles.forEach(f => {
      list.push({ ...toRaw(f), virtualId: `edited-${f.edit_id}`, type: 'edited-file' })
    })
  }

  list.push({ virtualId: 'sec-folders', type: 'section', name: 'IMPORTED FOLDERS' })
  
  if (props.globalFolders && props.globalFolders.length) {
    props.globalFolders.forEach(f => {
      list.push({ ...toRaw(f), virtualId: `folder-${f.id}`, type: 'folder' })
    })
  }

  list.push({ virtualId: 'sec-projects', type: 'section', name: 'PROJECTS' })
  
  props.projects.forEach(p => {
    const project = toRaw(p)
    const projectStateId = `proj-${project.id}-${project.is_collapsed ? 'collapsed' : 'expanded'}`;
    list.push({ ...project, virtualId: projectStateId, type: 'project' })
    
    if (!project.is_collapsed && project.albums) {
      project.albums.forEach(a => {
        const album = toRaw(a);
        list.push({ 
          ...album, 
          virtualId: `alb-${album.id}`, 
          type: 'album', 
          projectId: project.id,
          cover_path: album.cover_path || null 
        })
      })
    }
  })
  return list
})

// Cleanup on unmount
onUnmounted(() => {
  stopAutoScroll();
})
</script>

<style scoped>
/* --- IMPORT BUTTON REDESIGN --- */
.btn-import { 
  width: 100%; 
  background: transparent; 
  color: #58a6ff; 
  border: 1px solid rgba(88, 166, 255, 0.3); 
  padding: 10px; 
  border-radius: 6px; 
  cursor: pointer; 
  font-weight: 600; 
  font-size: 11px; 
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex; 
  align-items: center; 
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.btn-import:hover:not(:disabled) {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
  color: #fff;
}

.btn-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: #333;
  color: #555;
}

.icon-plus-thick {
  position: relative;
  width: 12px;
  height: 12px;
}
.icon-plus-thick::before, .icon-plus-thick::after {
  content: '';
  position: absolute;
  background: currentColor;
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  border-radius: 2px;
}
.icon-plus-thick::after { transform: rotate(90deg); }

/* --- EXISTING STYLES --- */
.btn-sync {
  opacity: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #555;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: all 0.2s;
}
.nav-item:hover .btn-sync { opacity: 1; }
.btn-sync:hover { color: #58a6ff; }
.icon-refresh-small { transform: translateY(-1px); }

.sidebar { 
  width: 350px; 
  height: 100%; 
  background: #0a0a0a; 
  border-right: 1px solid #1a1a1a; 
  display: flex; 
  flex-direction: column; 
  user-select: none;
  overflow: hidden;
  font-family: var(--font-sans, 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
  transition: width 0.2s ease;
  position: relative;
}

.sidebar-collapsed {
  width: 56px;
  min-width: 56px;
}

.sidebar-collapse-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: #555;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.sidebar-collapse-btn:hover { background: rgba(255,255,255,0.08); color: #aaa; }
.sidebar-collapsed .sidebar-collapse-btn {
  position: relative;
  top: auto; right: auto;
  margin: 0 auto 4px;
}

/* Collapsed icon rail */
.collapsed-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.collapsed-rail::-webkit-scrollbar { width: 0; }
.rail-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.rail-logo-img { width: 100%; height: 100%; object-fit: cover; }
.rail-divider {
  width: 24px;
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 6px 0;
  flex-shrink: 0;
}
.rail-btn {
  width: 38px;
  height: 38px;
  border: none;
  background: transparent;
  color: #666;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  position: relative;
}
.rail-btn:hover { background: rgba(255,255,255,0.06); color: #ccc; }
.rail-btn.active {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
}
.rail-btn.active::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  background: #58a6ff;
  border-radius: 0 3px 3px 0;
}
.rail-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.sidebar-header { padding: 24px 20px; border-bottom: 1px solid #1a1a1a; flex-shrink: 0; }
.brand-container { 
  display: flex; 
  align-items: center; 
  gap: 14px; 
  margin-bottom: 24px;
  padding: 4px 0;
}
.logo-wrapper {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.12), rgba(88, 166, 255, 0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(88, 166, 255, 0.1);
}
.sidebar-logo { 
  width: 28px; 
  height: 28px; 
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.3));
}
.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.brand { 
  font-size: 16px; 
  font-weight: 700; 
  color: #fff; 
  letter-spacing: 0.3px; 
  margin: 0;
  line-height: 1.1;
}
.brand-sub {
  font-size: 10px;
  font-weight: 500;
  color: #666;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  line-height: 1.2;
}

.sidebar-scroll-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.sidebar-scroll { 
  height: 100%;
  width: 100%; 
  transform: translateZ(0);
}
:deep(.vue-recycle-scroller) { width: 100%; height: 100%; }

.section-title { 
  padding: 24px 20px 8px; 
  font-size: 12px; 
  font-weight: 700; 
  color: #555; 
  letter-spacing: 1.2px; 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
}
.section-toggle { cursor: pointer; user-select: none; transition: background 0.15s; border-radius: 4px; }
.section-toggle:hover { background: rgba(255,255,255,0.03); }
.section-toggle-left { display: flex; align-items: center; gap: 6px; }
.section-toggle-arrow { font-size: 10px; color: #666; transition: transform 0.25s ease; display: inline-block; }
.section-toggle-arrow.collapsed { transform: rotate(-90deg); }
.section-collapsible { max-height: 500px; overflow: hidden; transition: max-height 0.3s ease, opacity 0.25s ease; opacity: 1; }
.section-collapsible.collapsed { max-height: 0; opacity: 0; pointer-events: none; }

.project-header { 
  padding: 0 16px 0 20px; 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  height: 38px;
  margin: 2px 0;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.project-header:hover { background: rgba(255, 255, 255, 0.03); }

.project-title { 
  font-size: 11px; 
  font-weight: 700; 
  color: #777; 
  cursor: pointer; 
  display: flex; 
  align-items: center; 
  gap: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-header:hover .project-title { color: #bbb; }

.project-actions { 
  display: flex; 
  flex-direction: row; 
  align-items: center;
  gap: 6px; 
  opacity: 0; 
  transition: opacity 0.2s;
  padding-left: 8px;
}

.project-header:hover .project-actions { opacity: 1; }

.icon-btn {
  width: 26px; 
  height: 26px;
  border-radius: 4px;
  background: transparent;
  color: #555;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  border: none;
  cursor: pointer;
}

.icon-btn:hover { background: #2a2a2a; color: #fff; }
.icon-btn.delete:hover { background: #3d1a1a; color: #ff6b6b; }
.chevron { font-size: 9px; transition: transform 0.2s; color: #444; }
.chevron.is-collapsed { transform: rotate(-90deg); }

.nav-item { 
  padding: 0 20px; 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  cursor: pointer; 
  transition: all 0.15s ease; 
  position: relative; 
  color: #999; 
  height: 40px;
}
.nav-item:hover { background: #141414; color: #fff; }
.nav-item.active { background: #161b22; color: #58a6ff; }
.nav-item.active::before { 
  content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; 
  background: #58a6ff; border-radius: 0 4px 4px 0;
}

.album-item { 
  padding-left: 20px; /* Reduced padding to make room for larger thumb */
  height: 110px;      /* Increased height to fit 100px thumb + margins */
}

/* Locked project/album state */
.project-header.is-locked { opacity: 0.5; }
.project-header.is-locked .project-title { cursor: default; }
.album-item.is-locked { opacity: 0.45; cursor: default; pointer-events: none; }
.album-item.is-locked .lock-badge { pointer-events: auto; }
.locked-thumb { background: rgba(191, 90, 242, 0.08); }
.nav-label { font-size: 13px; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.folder-count {
  font-size: 11px;
  color: #666;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  flex-shrink: 0;
  margin-right: 4px;
}
.nav-item:hover .folder-count { color: #888; }
.nav-item.active .folder-count { color: #58a6ff; background: rgba(88, 166, 255, 0.15); }

.edited-file-item { height: 36px; }
.edited-file-item .nav-label { font-size: 12px; color: #aaa; }
.edited-file-item:hover .nav-label { color: #fff; }
.edited-icon { font-size: 14px; }

.album-thumb { 
  width: 100px;       /* Set to 100px */
  height: 100px;      /* Set to 100px */
  border-radius: 8px; /* Slightly larger radius looks better at this scale */
  background: #1a1a1a; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  overflow: hidden; 
  border: 1px solid #333; 
  flex-shrink: 0; 
}
.cover-img { width: 100%; height: 100%; object-fit: cover; }

.empty-thumb {
  font-size: 24px;    /* Increased icon size for the larger box */
  opacity: 0.3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #111;
}

.album-item .nav-label {
  font-size: 14px;
  font-weight: 600;
}
.btn-delete, .add-btn {
  background: transparent; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 4px; transition: all 0.2s;
  padding: 0; color: #555;
}
.btn-delete { opacity: 0; }
.nav-item:hover .btn-delete { opacity: 1; }

.icon-close, .icon-close-small { position: relative; width: 10px; height: 10px; }
.icon-close::before, .icon-close::after, 
.icon-close-small::before, .icon-close-small::after {
  content: ''; position: absolute; height: 1.5px; width: 100%; top: 50%; left: 0; background: currentColor;
}
.icon-close::before, .icon-close-small::before { transform: rotate(45deg); }
.icon-close::after, .icon-close-small::after { transform: rotate(-45deg); }

.icon-plus { position: relative; width: 10px; height: 10px; }
.icon-plus::before, .icon-plus::after {
  content: ''; position: absolute; background: currentColor; top: 50%; left: 0; width: 100%; height: 1.5px;
}
.icon-plus::after { transform: rotate(90deg); }

.import-progress { margin-top: 15px; }
.progress-bar { height: 4px; background: #222; border-radius: 2px; overflow: hidden; }
.progress-bar-inner { height: 100%; background: #58a6ff; transition: width 0.3s; position: relative; overflow: hidden; }
.progress-bar-inner.indeterminate { animation: progress-indeterminate 1.2s ease-in-out infinite; }
.progress-bar-inner.indeterminate::after { animation: none; }
.progress-bar-inner::after { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent); animation: progress-shimmer 1.5s ease-in-out infinite; }
@keyframes progress-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes progress-indeterminate { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
.progress-label { font-size: 10px; color: #555; margin-top: 6px; text-align: center; }

.sidebar-footer { border-top: 1px solid #1a1a1a; flex-shrink: 0; }
.footer-toggle { display: flex; align-items: center; gap: 6px; padding: 8px 20px; cursor: pointer; user-select: none; transition: background 0.15s; }
.footer-toggle:hover { background: rgba(255,255,255,0.03); }
.footer-toggle-arrow { font-size: 10px; color: #666; transition: transform 0.25s ease; display: inline-block; }
.footer-toggle-arrow.collapsed { transform: rotate(-90deg); }
.footer-toggle-label { font-size: 10px; font-weight: 600; color: #555; letter-spacing: 0.5px; text-transform: uppercase; }
.footer-content { padding: 0 20px 20px; overflow: hidden; max-height: 500px; transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.25s ease; opacity: 1; }
.footer-content.collapsed { max-height: 0; padding: 0 20px; opacity: 0; pointer-events: none; }
.btn-danger { 
  width: 100%; background: transparent; color: #f85149; border: 1px solid rgba(248, 81, 73, 0.2); 
  padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; margin-bottom: 8px;
  transition: all 0.2s ease;
}
.btn-danger:hover { background: rgba(248, 81, 73, 0.08); border-color: rgba(248, 81, 73, 0.4); }
.btn-refresh { width: 100%; background: #1a1a1a; color: #666; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s ease; }
.btn-refresh:hover { background: #252525; color: #999; }

.mobile-access { margin-bottom: 12px; padding: 12px; background: rgba(88, 166, 255, 0.05); border: 1px solid rgba(88, 166, 255, 0.15); border-radius: 8px; }
.mobile-label { font-size: 9px; font-weight: 700; color: #58a6ff; letter-spacing: 1.2px; margin-bottom: 6px; }
.mobile-url { font-size: 12px; font-family: 'SF Mono', 'Consolas', monospace; color: #58a6ff; padding: 2px 0; user-select: text; }

.web-auth-section { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(88, 166, 255, 0.1); }
.auth-status { display: flex; align-items: center; gap: 8px; }
.auth-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
.auth-badge.enabled { color: #4ade80; }
.auth-badge.disabled { color: #f59e0b; }
.auth-user { font-size: 11px; color: #888; flex: 1; overflow: hidden; text-overflow: ellipsis; }
.btn-auth-remove { background: none; border: none; color: #666; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; transition: all 0.15s; }
.btn-auth-remove:hover { color: #f85149; background: rgba(248, 81, 73, 0.1); }
.btn-auth-setup { width: 100%; background: transparent; color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.2); padding: 6px; border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s; }
.btn-auth-setup:hover { background: rgba(88, 166, 255, 0.1); border-color: #58a6ff; }
.auth-form { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.auth-input { width: 93%; background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 8px 10px; color: #ddd; font-size: 12px; outline: none; transition: border-color 0.2s; }
.auth-input:focus { border-color: #58a6ff; }
.auth-form-actions { display: flex; gap: 6px; }
.btn-auth-save { flex: 1; background: #58a6ff; color: #000; border: none; border-radius: 6px; padding: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-auth-save:hover { background: #79b8ff; }
.btn-auth-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-auth-cancel { flex: 1; background: transparent; color: #888; border: 1px solid #333; border-radius: 6px; padding: 6px; font-size: 11px; cursor: pointer; transition: all 0.2s; }
.btn-auth-cancel:hover { color: #fff; border-color: #555; }
.auth-error { font-size: 11px; color: #ff453a; padding: 2px 0; font-weight: 500; }
.auth-form-hint { font-size: 10px; color: #888; margin-bottom: 2px; }
.btn-auth-remove-confirm { flex: 1; background: #ff453a; color: #fff; border: none; border-radius: 6px; padding: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-auth-remove-confirm:hover { background: #ff6b6b; }
.btn-auth-remove-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.drag-target {
  background: rgba(88, 166, 255, 0.1) !important;
  box-shadow: inset 0 0 0 1px #58a6ff;
  transform: scale(1.01);
  z-index: 10;
}
</style>

<style>
.vue-recycle-scroller::-webkit-scrollbar { width: 4px !important; }
.vue-recycle-scroller::-webkit-scrollbar-track { background: transparent !important; }
.vue-recycle-scroller::-webkit-scrollbar-thumb { background: #222 !important; border-radius: 10px !important; }
.vue-recycle-scroller::-webkit-scrollbar-thumb:hover { background: #333 !important; }
.album-item.dragging {
  opacity: 0.4;
  border: 1px dashed #58a6ff;
}

/* Drop target styling */
.album-item.drop-before,
.album-item.drop-after {
  position: relative;
}

/* Add margin to make space for the drop indicator */
.album-item.drop-before {
  margin-top: 60px;
  transition: margin 0.15s ease;
}

.album-item.drop-after {
  margin-bottom: 60px;
  transition: margin 0.15s ease;
}

/* Drop placeholder indicator - the line */
.album-item.drop-before::before,
.album-item.drop-after::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  height: 3px;
  background: linear-gradient(90deg, #58a6ff 0%, #a855f7 50%, #58a6ff 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 2px;
  z-index: 100;
}

.album-item.drop-before::before {
  top: -32px;
}

.album-item.drop-after::after {
  bottom: -32px;
}

/* Placeholder box showing where album will land */
.album-item.drop-before::after,
.album-item.drop-after::before {
  content: 'Drop here';
  position: absolute;
  left: 20px;
  right: 20px;
  height: 50px;
  background: rgba(88, 166, 255, 0.06);
  border: 2px dashed rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(88, 166, 255, 0.6);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  z-index: 99;
}

.album-item.drop-before::after {
  top: -58px;
}

.album-item.drop-after::before {
  bottom: -58px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Sidebar Lower (scrollable container for Smart Albums + Persons) */
.sidebar-lower {
  flex: 0 1 auto;
  overflow-y: auto;
  min-height: 60px;
  max-height: 40vh;
  border-top: 1px solid #1a1a1a;
}
.sidebar-lower::-webkit-scrollbar { width: 4px; }
.sidebar-lower::-webkit-scrollbar-track { background: transparent; }
.sidebar-lower::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
.sidebar-lower::-webkit-scrollbar-thumb:hover { background: #333; }

/* Smart Albums Section */
.smart-albums-section {
  padding: 8px 12px;
}
.smart-albums-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
}
.smart-albums-empty-icon { font-size: 24px; opacity: 0.3; }
.smart-albums-empty-text { font-size: 11px; color: #555; }
.btn-create-smart-album {
  background: transparent;
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.25);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
  transition: all 0.2s ease;
}
.btn-create-smart-album:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
}
.smart-album-item {
  padding: 6px 10px;
}
.smart-album-item .nav-icon {
  font-size: 16px;
}
.smart-album-item .nav-label {
  flex: 1;
  font-size: 12px;
}
.smart-album-item.active {
  background: linear-gradient(135deg, rgba(0, 113, 227, 0.15), rgba(0, 113, 227, 0.08));
  color: #58a6ff;
}

/* Persons Section */
.persons-section {
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.persons-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
}
.persons-empty-icon { font-size: 24px; opacity: 0.3; }
.persons-empty-text { font-size: 11px; color: #555; }
.btn-scan-people {
  background: transparent;
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.25);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
  transition: all 0.2s ease;
}
.btn-scan-people:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: #58a6ff;
}

.person-item {
  padding: 6px 10px;
  gap: 10px;
  height: 44px;
}
.person-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: #1a1a1a;
  border: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.person-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.person-avatar-placeholder {
  font-size: 16px;
  opacity: 0.4;
}
.person-item .nav-label {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
}
.person-face-count {
  font-size: 10px;
  color: #666;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  flex-shrink: 0;
}
.person-item:hover .person-face-count { color: #888; }
.person-item.active .person-face-count { color: #58a6ff; background: rgba(88, 166, 255, 0.15); }
.person-item.active {
  background: linear-gradient(135deg, rgba(0, 113, 227, 0.15), rgba(0, 113, 227, 0.08));
  color: #58a6ff;
}
.person-item.active .person-avatar-sm {
  border-color: #58a6ff;
}

/* --- LIGHT THEME OVERRIDES --- */
/* --- Filter Section --- */
.filter-section {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 4px;
}

.filter-item {
  height: 32px !important;
  padding: 0 16px !important;
  gap: 8px !important;
  font-size: 12px;
}

.filter-item .nav-icon {
  opacity: 0.7;
}

.filter-item:hover .nav-icon,
.filter-item.active .nav-icon {
  opacity: 1;
}

.filter-count {
  font-size: 10px;
  color: #555;
  font-weight: 600;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  min-width: 22px;
  text-align: center;
  flex-shrink: 0;
  margin-left: auto;
}

.filter-item:hover .filter-count { color: #888; }
.filter-item.active .filter-count { color: #58a6ff; background: rgba(88, 166, 255, 0.12); }

[data-theme="light"] .filter-section {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
[data-theme="light"] .filter-count { color: #86868b; background: rgba(0, 0, 0, 0.04); }
[data-theme="light"] .filter-item.active .filter-count { color: #0071e3; background: rgba(0, 113, 227, 0.1); }

[data-theme="light"] .sidebar {
  background: #f5f5f7;
  border-right-color: rgba(0, 0, 0, 0.08);
}
[data-theme="light"] .rail-divider { background: rgba(0, 0, 0, 0.08); }
[data-theme="light"] .rail-btn { color: #86868b; }
[data-theme="light"] .rail-btn:hover { background: rgba(0, 0, 0, 0.04); color: #1d1d1f; }
[data-theme="light"] .rail-btn.active { background: rgba(0, 113, 227, 0.08); color: #0071e3; }
[data-theme="light"] .rail-btn.active::after { background: #0071e3; }
[data-theme="light"] .sidebar-collapse-btn { color: #86868b; }
[data-theme="light"] .sidebar-collapse-btn:hover { background: rgba(0, 0, 0, 0.04); color: #1d1d1f; }
[data-theme="light"] .sidebar-header { border-bottom-color: rgba(0, 0, 0, 0.08); }
[data-theme="light"] .brand { color: #1d1d1f; }
[data-theme="light"] .brand-sub { color: #86868b; }
[data-theme="light"] .logo-wrapper { background: linear-gradient(135deg, rgba(0, 113, 227, 0.08), rgba(0, 113, 227, 0.03)); border-color: rgba(0, 113, 227, 0.1); }
[data-theme="light"] .section-title { color: #86868b; }
[data-theme="light"] .project-header:hover { background: rgba(0, 0, 0, 0.03); }
[data-theme="light"] .project-title { color: #6e6e73; }
[data-theme="light"] .project-header:hover .project-title { color: #1d1d1f; }
[data-theme="light"] .nav-item { color: #48484a; }
[data-theme="light"] .nav-item:hover { background: #e8e8ed; color: #1d1d1f; }
[data-theme="light"] .nav-item.active { background: rgba(0, 113, 227, 0.08); color: #0071e3; }
[data-theme="light"] .nav-item.active::before { background: #0071e3; }
[data-theme="light"] .album-thumb { background: #e8e8ed; border-color: #d1d1d6; }
[data-theme="light"] .empty-thumb { background: #e0e0e2; }
[data-theme="light"] .card-wireframe,
[data-theme="light"] .media-card { background: #e0e0e2; }
[data-theme="light"] .folder-count { color: #86868b; background: rgba(0, 0, 0, 0.04); }
[data-theme="light"] .nav-item.active .folder-count { color: #0071e3; background: rgba(0, 113, 227, 0.1); }
[data-theme="light"] .icon-btn:hover { background: #e0e0e2; color: #1d1d1f; }
[data-theme="light"] .chevron { color: #8e8e93; }
[data-theme="light"] .btn-import { color: #0071e3; border-color: rgba(0, 113, 227, 0.3); }
[data-theme="light"] .btn-import:hover:not(:disabled) { background: rgba(0, 113, 227, 0.06); border-color: #0071e3; color: #0071e3; }
[data-theme="light"] .sidebar-footer { border-top-color: rgba(0, 0, 0, 0.08); }
[data-theme="light"] .footer-toggle-label { color: #86868b; }
[data-theme="light"] .footer-toggle:hover { background: rgba(0, 0, 0, 0.03); }
[data-theme="light"] .btn-danger { color: #ff3b30; border-color: rgba(255, 59, 48, 0.2); }
[data-theme="light"] .btn-refresh { background: #e8e8ed; color: #6e6e73; }
[data-theme="light"] .mobile-access { background: rgba(0, 113, 227, 0.04); border-color: rgba(0, 113, 227, 0.12); }
[data-theme="light"] .auth-input { background: #fff; border-color: #d1d1d6; color: #1d1d1f; }
[data-theme="light"] .auth-input:focus { border-color: #0071e3; }
[data-theme="light"] .btn-auth-cancel { color: #6e6e73; border-color: #d1d1d6; }
[data-theme="light"] .btn-auth-cancel:hover { color: #1d1d1f; border-color: #8e8e93; }
[data-theme="light"] .vue-recycle-scroller::-webkit-scrollbar-thumb { background: #d1d1d6 !important; }
[data-theme="light"] .vue-recycle-scroller::-webkit-scrollbar-thumb:hover { background: #8e8e93 !important; }

/* Light theme - Persons */
[data-theme="light"] .smart-albums-empty-text { color: #86868b; }
[data-theme="light"] .btn-create-smart-album { color: #0071e3; border-color: rgba(0, 113, 227, 0.25); }
[data-theme="light"] .btn-create-smart-album:hover { background: rgba(0, 113, 227, 0.06); border-color: #0071e3; }
[data-theme="light"] .sidebar-lower { border-top-color: rgba(0, 0, 0, 0.08); }
[data-theme="light"] .sidebar-lower::-webkit-scrollbar-thumb { background: #d1d1d6; }
[data-theme="light"] .sidebar-lower::-webkit-scrollbar-thumb:hover { background: #8e8e93; }
[data-theme="light"] .persons-section { border-top-color: rgba(0, 0, 0, 0.06); }
[data-theme="light"] .persons-empty-text { color: #86868b; }
[data-theme="light"] .btn-scan-people { color: #0071e3; border-color: rgba(0, 113, 227, 0.25); }
[data-theme="light"] .btn-scan-people:hover { background: rgba(0, 113, 227, 0.06); border-color: #0071e3; }
[data-theme="light"] .person-avatar-sm { background: #e8e8ed; border-color: #d1d1d6; }
[data-theme="light"] .person-face-count { color: #86868b; background: rgba(0, 0, 0, 0.04); }
[data-theme="light"] .person-item.active .person-face-count { color: #0071e3; background: rgba(0, 113, 227, 0.1); }
[data-theme="light"] .person-item.active { background: rgba(0, 113, 227, 0.08); color: #0071e3; }
[data-theme="light"] .person-item.active .person-avatar-sm { border-color: #0071e3; }

/* Futuristic / Cyber theme */
[data-theme="futuristic"] .filter-section { border-bottom-color: rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .filter-count { color: #a0a8c8; background: rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .filter-item.active .filter-count { color: #00f0ff; background: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .sidebar { background: #050510; border-right: 1px solid rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .rail-divider { background: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .rail-btn { color: #a0a8c8; }
[data-theme="futuristic"] .rail-btn:hover { background: rgba(0, 240, 255, 0.06); color: #e0e6ff; }
[data-theme="futuristic"] .rail-btn.active { background: rgba(0, 240, 255, 0.08); color: #00f0ff; }
[data-theme="futuristic"] .rail-btn.active::after { background: linear-gradient(180deg, #00f0ff, #a855f7); box-shadow: 0 0 8px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .sidebar-collapse-btn { color: #a0a8c8; }
[data-theme="futuristic"] .sidebar-collapse-btn:hover { background: rgba(0, 240, 255, 0.06); color: #00f0ff; }
[data-theme="futuristic"] .sidebar-header { border-bottom-color: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .brand { color: #e0e6ff; text-shadow: 0 0 12px rgba(0, 240, 255, 0.15); }
[data-theme="futuristic"] .brand-sub { color: rgba(0, 240, 255, 0.45); letter-spacing: 2px; }
[data-theme="futuristic"] .logo-wrapper { background: linear-gradient(135deg, rgba(0, 240, 255, 0.1), rgba(168, 85, 247, 0.06)); border-color: rgba(0, 240, 255, 0.15); box-shadow: 0 0 16px rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .section-title { color: #a855f7; text-transform: uppercase; letter-spacing: 1.5px; }
[data-theme="futuristic"] .project-header:hover { background: rgba(0, 240, 255, 0.04); }
[data-theme="futuristic"] .project-title { color: #a0a8c8; }
[data-theme="futuristic"] .project-header:hover .project-title { color: #e0e6ff; }
[data-theme="futuristic"] .nav-item { color: #a0a8c8; }
[data-theme="futuristic"] .nav-item:hover { background: rgba(0, 240, 255, 0.06); color: #e0e6ff; }
[data-theme="futuristic"] .nav-item.active { background: rgba(0, 240, 255, 0.08); color: #00f0ff; }
[data-theme="futuristic"] .nav-item.active::before { background: linear-gradient(180deg, #00f0ff, #a855f7); box-shadow: 0 0 8px rgba(0, 240, 255, 0.4); }
[data-theme="futuristic"] .album-thumb { background: #111827; border-color: rgba(0, 240, 255, 0.1); }
[data-theme="futuristic"] .empty-thumb { background: #0a0f1e; }
[data-theme="futuristic"] .card-wireframe,
[data-theme="futuristic"] .media-card { background: #111827; }
[data-theme="futuristic"] .folder-count { color: #a0a8c8; background: rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .nav-item.active .folder-count { color: #00f0ff; background: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .icon-btn:hover { background: rgba(0, 240, 255, 0.08); color: #00f0ff; }
[data-theme="futuristic"] .chevron { color: rgba(0, 240, 255, 0.3); }
[data-theme="futuristic"] .btn-import { color: #00f0ff; border-color: rgba(0, 240, 255, 0.2); }
[data-theme="futuristic"] .btn-import:hover:not(:disabled) { background: rgba(0, 240, 255, 0.06); border-color: #00f0ff; color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.1); }
[data-theme="futuristic"] .sidebar-footer { border-top-color: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .footer-toggle-label { color: #a0a8c8; }
[data-theme="futuristic"] .footer-toggle:hover { background: rgba(0, 240, 255, 0.04); }
[data-theme="futuristic"] .btn-danger { color: #ff4d6a; border-color: rgba(255, 77, 106, 0.2); }
[data-theme="futuristic"] .btn-danger:hover { box-shadow: 0 0 12px rgba(255, 77, 106, 0.15); }
[data-theme="futuristic"] .btn-refresh { background: rgba(0, 240, 255, 0.06); color: #a0a8c8; }
[data-theme="futuristic"] .btn-refresh:hover { color: #00f0ff; }
[data-theme="futuristic"] .mobile-access { background: rgba(0, 240, 255, 0.03); border-color: rgba(0, 240, 255, 0.1); }
[data-theme="futuristic"] .auth-input { background: #111827; border-color: rgba(0, 240, 255, 0.12); color: #e0e6ff; }
[data-theme="futuristic"] .auth-input:focus { border-color: #00f0ff; box-shadow: 0 0 8px rgba(0, 240, 255, 0.15); }
[data-theme="futuristic"] .btn-auth-cancel { color: #a0a8c8; border-color: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .btn-auth-cancel:hover { color: #00f0ff; border-color: rgba(0, 240, 255, 0.25); }
[data-theme="futuristic"] .vue-recycle-scroller::-webkit-scrollbar-thumb { background: rgba(0, 240, 255, 0.12) !important; }
[data-theme="futuristic"] .vue-recycle-scroller::-webkit-scrollbar-thumb:hover { background: rgba(0, 240, 255, 0.22) !important; }

/* Futuristic - Persons & Smart Albums */
[data-theme="futuristic"] .smart-albums-empty-text { color: #a0a8c8; }
[data-theme="futuristic"] .btn-create-smart-album { color: #00f0ff; border-color: rgba(0, 240, 255, 0.2); }
[data-theme="futuristic"] .btn-create-smart-album:hover { background: rgba(0, 240, 255, 0.06); border-color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.1); }
[data-theme="futuristic"] .sidebar-lower { border-top-color: rgba(0, 240, 255, 0.08); }
[data-theme="futuristic"] .sidebar-lower::-webkit-scrollbar-thumb { background: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .sidebar-lower::-webkit-scrollbar-thumb:hover { background: rgba(0, 240, 255, 0.22); }
[data-theme="futuristic"] .persons-section { border-top-color: rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .persons-empty-text { color: #a0a8c8; }
[data-theme="futuristic"] .btn-scan-people { color: #00f0ff; border-color: rgba(0, 240, 255, 0.2); }
[data-theme="futuristic"] .btn-scan-people:hover { background: rgba(0, 240, 255, 0.06); border-color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.1); }
[data-theme="futuristic"] .person-avatar-sm { background: #111827; border-color: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .person-face-count { color: #a0a8c8; background: rgba(0, 240, 255, 0.06); }
[data-theme="futuristic"] .person-item.active .person-face-count { color: #00f0ff; background: rgba(0, 240, 255, 0.12); }
[data-theme="futuristic"] .person-item.active { background: rgba(0, 240, 255, 0.08); color: #00f0ff; }

/* License feature lock styles */
.feature-locked { opacity: 0.7; }
.feature-locked-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  color: #636366;
  font-size: 12px;
}
.lock-icon { font-size: 14px; }
.lock-text { opacity: 0.7; }
.lock-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(191, 90, 242, 0.15);
  color: #bf5af2;
  margin-left: 6px;
}
[data-theme="futuristic"] .person-item.active .person-avatar-sm { border-color: #00f0ff; box-shadow: 0 0 8px rgba(0, 240, 255, 0.2); }
</style>