<template>
  <div class="video-trimmer-overlay">
    <div ref="trimmerPanelEl" class="video-trimmer-panel" role="dialog" aria-modal="true" aria-labelledby="video-trimmer-title" tabindex="0">
      <div class="trimmer-header">
        <div class="header-title-row">
          <h2 id="video-trimmer-title">Video Editor</h2>
          <div class="header-menubar">
            <div ref="fileMenuEl" class="menu-dropdown">
              <button class="menu-dropdown-trigger" type="button" :aria-expanded="activeHeaderMenu === 'file'" @click="toggleHeaderMenu('file')">File</button>
              <div v-if="activeHeaderMenu === 'file'" class="menu-dropdown-list">
                <button class="menu-item" type="button" @click="closeHeaderMenu(); confirmClose()">Close</button>
                <button class="menu-item" type="button" @click="closeHeaderMenu(); downloadProjectFile()">Save Project</button>
                <button class="menu-item" type="button" @click="closeHeaderMenu(); loadProjectFromFile()">Load Project</button>
                <button class="menu-item" type="button" :disabled="saving || !canExport" @click="closeHeaderMenu(); saveTrim()">Save Video Edit</button>
                <button class="menu-item" type="button" @click="closeHeaderMenu(); showShortcutPanel = !showShortcutPanel">Shortcuts</button>
              </div>
            </div>
            <div ref="editMenuEl" class="menu-dropdown">
              <button class="menu-dropdown-trigger" type="button" :aria-expanded="activeHeaderMenu === 'edit'" @click="toggleHeaderMenu('edit')">Edit</button>
              <div v-if="activeHeaderMenu === 'edit'" class="menu-dropdown-list">
                <button class="menu-item" type="button" :disabled="!canUndo" @click="closeHeaderMenu(); undo()">Undo</button>
                <button class="menu-item" type="button" :disabled="!canRedo" @click="closeHeaderMenu(); redo()">Redo</button>
              </div>
            </div>
          </div>
          <div class="header-right-actions">
            <button class="header-action-btn" type="button" :disabled="saving || !canExport" @click="saveTrim()" title="Save Video Edit">Save Video Edit</button>
            <button class="header-action-btn header-close-btn" type="button" @click="confirmClose()" title="Close">&times;</button>
          </div>
        </div>
        <div v-if="saving && exportProgress >= 0" class="header-export-progress-bar">
          <div class="header-export-progress-fill" :style="{ width: exportProgress + '%' }"></div>
        </div>
      </div>

      <div class="trimmer-body">
        <div class="editor-layout-v2">
          <div class="source-monitor" :class="{ collapsed: sourceCollapsed }">
            <div class="monitor-toolbar">
              <button class="monitor-toggle-btn" @click="sourceCollapsed = !sourceCollapsed" :title="sourceCollapsed ? 'Show source editor' : 'Collapse source'">{{ sourceCollapsed ? '▸ Source' : '▾ Source' }}</button>
              <span class="monitor-meta">{{ selectedSource?.name || '' }}</span>
            </div>
            <div v-show="!sourceCollapsed" class="source-monitor-body">
            <div class="source-strip">
              <button
                v-for="source in sourceVideos"
                :key="source.id"
                class="source-chip"
                :class="{ active: source.id === selectedSourceId }"
                @click="selectSource(source.id)"
              >
                <span class="source-chip-name">{{ source.name }}</span>
                <span class="source-chip-meta">{{ source.duration ? formatTime(source.duration) : 'Loading...' }}</span>
                <span v-if="sourceVideos.length > 1" class="source-chip-remove" title="Remove source" @click.stop="removeSourceVideo(source.id)">✕</span>
              </button>
              <button class="add-video-btn" title="Import video files" @click="addVideos">+ Add Videos</button>
              <button class="add-video-btn" :disabled="!hasTimelineClips" title="Import audio overlay files" @click="addAudioOverlays">+ Add Audio</button>
            </div>

            <div class="preview-card source-preview-card">
              <div class="video-container source-video-container" :class="{ 'rotated-quarter-turn': isQuarterTurnRotation }">
                <video
                  ref="sourceVideoEl"
                  :src="sourceVideoSrc"
                  :style="sourceVideoStyle"
                  preload="metadata"
                  @loadedmetadata="onSourceMetadataLoaded"
                  @timeupdate="onSourceTimeUpdate"
                  @ended="sourcePlaying = false"
                ></video>
              </div>

              <div class="controls-row">
                <button class="ctrl-btn" title="Play/Pause source (Space)" @click="toggleSourcePlay">{{ sourcePlaying ? 'Pause' : 'Play Source' }}</button>
                <span class="time-display">{{ formatTimePrecise(currentTime) }} / {{ formatTimePrecise(duration) }} · {{ sourceRotationLabel }}</span>
                <button class="ctrl-btn secondary" title="Rotate 90° counter-clockwise" @click="rotateSourceSelection(-90)">Rotate Left</button>
                <button class="ctrl-btn secondary" title="Rotate 90° clockwise" @click="rotateSourceSelection(90)">Rotate Right</button>
              </div>

              <div ref="timelineEl" class="trim-timeline">
                <div class="timeline-track" @click="seekTo">
                  <div class="trim-region" :style="{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }"></div>
                  <div class="playhead" :style="{ left: `${playheadPct}%` }"></div>
                </div>
                <div
                  class="trim-handle trim-handle-start"
                  :style="{ left: `${startPct}%` }"
                  @mousedown.prevent="startTrimDrag('start')"
                >
                  <div class="handle-bar"></div>
                </div>
                <div
                  class="trim-handle trim-handle-end"
                  :style="{ left: `${endPct}%` }"
                  @mousedown.prevent="startTrimDrag('end')"
                >
                  <div class="handle-bar"></div>
                </div>
              </div>

              <div class="trim-info">
                <div class="trim-time">
                  <label>In</label>
                  <span>{{ formatTimePrecise(trimStart) }}</span>
                </div>
                <div class="trim-time">
                  <label>Selection</label>
                  <span>{{ formatTimePrecise(activeSelectionDuration) }}</span>
                </div>
                <div class="trim-time">
                  <label>Out</label>
                  <span>{{ formatTimePrecise(trimEnd) }}</span>
                </div>
              </div>

              <div class="selection-actions">
                <button class="action-btn" :disabled="!canAddClip" title="Add trimmed selection as new clip" @click="addCurrentSelectionAsClip">Add to Timeline</button>
                <button class="action-btn secondary" :disabled="!selectedClip" title="Replace selected clip with current selection" @click="updateSelectedClip">Update Clip</button>
                <button class="action-btn secondary" :disabled="!duration" title="Reset in/out to full source" @click="resetSelection">Reset</button>
              </div>
            </div>
            </div>
          </div>

          <section class="timeline-section">
            <section class="timeline-workspace">
              <div class="timeline-summary-card embedded-timeline-card">
                <div class="summary-topline">
                  <div>
                    <span class="summary-label">Timeline</span>
                    <strong>{{ clips.length }} clip{{ clips.length === 1 ? '' : 's' }}</strong>
                  </div>
                  <span class="summary-meta">{{ formatTime(totalTimelineDuration) }} total · {{ audioOverlayCountLabel }}</span>
                </div>

                <p class="timeline-hint">Drag clips to reorder. Click ruler to scrub. Drag clip edges to ripple trim.</p>

                <div v-if="timelineTrackLayout.length" class="timeline-ruler-card">
                  <div class="timeline-ruler-scale">
                    <span
                      v-for="marker in timelineMarkers"
                      :key="marker.time"
                      class="ruler-tick"
                      :style="{ left: `${marker.left}%` }"
                    >
                      {{ formatTime(marker.time) }}
                    </span>
                  </div>

                  <div ref="timelineRulerScrollEl" class="timeline-ruler-scroll" @scroll="onTimelineScroll('ruler')" @wheel="onTimelineScrollWheel('ruler', $event)">
                    <div ref="rulerTrackEl" class="timeline-ruler-track" :style="timelineTrackStyle" @mousedown.prevent="startTimelineScrub">
                      <div v-if="hasTimelineClips" class="timeline-playhead-line" :style="{ left: `${timelinePlayheadPct}%` }"></div>
                      <button
                        v-for="segment in timelineTrackLayout"
                        :key="segment.id"
                        class="ruler-segment"
                        :class="[
                          transitionClassName(segment.transitionType),
                          { active: segment.id === selectedClipId, 'transition-target': transitionFocusClipId === segment.id }
                        ]"
                        :style="{ left: `${segment.left}%`, width: `${segment.displayWidth}%` }"
                        @click="segment.id !== DRAFT_CLIP_ID && loadClip(segment.id)"
                      >
                        <span>#{{ segment.index + 1 }}</span>
                        <span v-if="segment.transitionDuration > 0.01" class="ruler-transition">
                          {{ formatTransitionLabel(segment.transitionType) }} - {{ segment.transitionDuration.toFixed(1) }}s
                        </span>
                      </button>

                      <button
                        v-for="handle in transitionHandles"
                        :key="`handle-${handle.id}`"
                        class="transition-drag-handle"
                        :class="[transitionClassName(handle.transitionType), { active: transitionFocusClipId === handle.id }]"
                        :style="{ left: `${handle.left}%` }"
                        :title="`Adjust ${formatTransitionLabel(handle.transitionType)} transition`"
                        @mousedown.prevent="startTransitionHandleDrag($event, handle)"
                        @click.stop="focusTransition(handle.id)"
                      >
                        <span class="transition-drag-core"></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="timeline-list embedded-timeline-list">
                <div v-if="!clips.length" class="empty-timeline">
                  Add a trimmed section from the active video, then build the final export from the timeline.
                </div>

                <div v-if="hasTimelineClips" class="timeline-controls-bar">
                  <div class="zoom-control-row">
                    <button class="mini-btn" type="button" title="Zoom out" @click="adjustTimelineZoom(-0.01)">-</button>
                    <input v-model="timelineZoom" class="timeline-zoom-slider" type="range" min="0.25" max="3" step="0.01" />
                    <strong>{{ timelineZoomLabel }}</strong>
                    <button class="mini-btn" type="button" title="Zoom in" @click="adjustTimelineZoom(0.01)">+</button>
                    <button class="mini-btn secondary" type="button" title="Fit timeline to view" @click="resetTimelineZoom">Fit</button>
                  </div>
                  <label class="snap-toggle timeline-options-snap" title="Toggle snapping (N)">
                    <input type="checkbox" :checked="snapEnabled" @change="snapEnabled = $event.target.checked" />
                    <span>Snap</span>
                  </label>
                </div>

                <div v-if="clips.length" ref="timelineLaneScrollEl" class="timeline-lane-scroll" @scroll="onTimelineScroll('lane')" @wheel="onTimelineScrollWheel('lane', $event)">
                  <div class="timeline-clip-lane" :style="timelineTrackStyle">
                    <div v-if="hasTimelineClips" class="timeline-playhead-line lane-playhead" :style="{ left: `${timelinePlayheadPct}%` }"></div>
                    <div class="timeline-lane-section timeline-video-section">
                      <span class="timeline-track-section-label">Video</span>
                      <template v-for="segment in timelineTrackLayout" :key="segment.id">
                        <article
                          class="timeline-clip timeline-clip-block"
                          :class="{
                            active: segment.id === selectedClipId,
                            dragging: dragClipId === segment.id,
                            'transition-target': transitionFocusClipId === segment.id
                          }"
                          :style="{ left: `${segment.left}%`, width: `${segment.displayWidth}%` }"
                          draggable="true"
                          @dragstart="onClipDragStart(segment.id)"
                          @dragover.prevent
                          @drop="onClipDrop(segment.id)"
                          @dragend="onClipDragEnd"
                        >
                          <button class="timeline-clip-main" @click="loadClip(segment.id)">
                            <div class="clip-thumb-wrap">
                              <img v-if="segment.thumbnail" :src="segment.thumbnail" class="clip-thumb" alt="Clip thumbnail" />
                              <div v-else class="clip-thumb placeholder">{{ segment.thumbnailLoading ? '...' : 'No Preview' }}</div>
                              <span class="clip-order">{{ segment.index + 1 }}</span>
                            </div>

                            <span class="clip-copy">
                              <strong>{{ segment.sourceName }}</strong>
                              <span>{{ formatTimePrecise(segment.startTime) }} - {{ formatTimePrecise(segment.endTime) }}</span>
                              <span class="clip-badges-row">
                                <span v-for="badge in getClipBadges(segment)" :key="badge" class="clip-badge">{{ badge }}</span>
                                <span v-if="!getClipBadges(segment).length" class="clip-badge clip-badge-default">Default</span>
                              </span>
                            </span>

                            <span class="clip-duration">{{ formatTime(segment.duration) }}</span>
                          </button>

                          <div class="ripple-trim-handle ripple-trim-left" @mousedown.prevent="startRippleTrim($event, segment.id, 'left')"></div>
                          <div class="ripple-trim-handle ripple-trim-right" @mousedown.prevent="startRippleTrim($event, segment.id, 'right')"></div>

                          <div class="timeline-clip-actions">
                            <span class="drag-hint">Drag to reorder</span>
                            <button class="mini-btn danger" title="Remove clip" @click="removeClipById(segment.id)">Remove</button>
                          </div>
                        </article>

                        <div
                          v-if="segment.index < clips.length - 1"
                          class="transition-bridge transition-bridge-block"
                          :class="[transitionClassName(segment.transitionType), { active: transitionFocusClipId === segment.id }]"
                          :style="{ left: `${timelineTrackLayout[segment.index + 1].left}%` }"
                        >
                          <div class="transition-bridge-line"></div>
                          <button class="transition-pill" @click="focusTransition(segment.id)">
                            <span>
                              {{ segment.transitionDuration > 0.01
                                ? `${formatTransitionLabel(segment.transitionType)} - ${formatAudioTransitionLabel(segment.audioTransitionCurve)}`
                                : 'Hard Cut' }}
                            </span>
                            <strong>{{ segment.transitionDuration > 0.01 ? `${segment.transitionDuration.toFixed(1)}s` : '0.0s' }}</strong>
                          </button>
                        </div>
                      </template>
                    </div>

                    <div class="timeline-lane-section timeline-audio-section">
                      <span class="timeline-track-section-label">Audio Overlays
                        <button class="mini-btn text-add-btn" @click.stop="addAudioOverlays" title="Add audio overlay">+ Add</button>
                      </span>
                      <div v-if="!audioOverlayLayout.length" class="empty-audio-track">Import audio, then drag it to where it should play in the project.</div>
                      <article
                        v-for="overlay in audioOverlayLayout"
                        :key="overlay.id"
                        class="audio-overlay-block"
                        :class="{ active: overlay.id === selectedAudioOverlayId }"
                        :style="{ left: `${overlay.left}%`, width: `${overlay.width}%` }"
                        @click.stop="selectAudioOverlay(overlay.id)"
                        @mousedown.left.prevent="startAudioOverlayDrag($event, overlay.id)"
                      >
                        <div class="audio-overlay-copy">
                          <strong>{{ overlay.name }}</strong>
                          <span>{{ formatTime(overlay.timelineStart) }} · Trim {{ formatTime(overlay.trimStart) }} - {{ formatTime(overlay.trimEnd) }}</span>
                        </div>
                        <span class="audio-overlay-duration">{{ formatTime(overlay.effectiveDuration) }}</span>
                        <button class="mini-btn danger audio-overlay-remove" @mousedown.stop @click.stop="removeAudioOverlayById(overlay.id)">Remove</button>
                      </article>
                    </div>

                    <div class="timeline-lane-section timeline-text-section" :style="{ minHeight: `${24 + Math.max(1, textOverlayRowCount) * 52}px` }">
                      <span class="timeline-track-section-label">Text
                        <button class="mini-btn text-add-btn" @click.stop="addTextOverlay" title="Add text overlay">+ Add</button>
                      </span>
                      <div v-if="!textOverlayLayout.length" class="empty-text-track">Click "+ Add" to create a text overlay on the timeline.</div>
                      <article
                        v-for="overlay in textOverlayLayout"
                        :key="overlay.id"
                        class="text-overlay-block"
                        :class="{ active: overlay.id === selectedTextOverlayId }"
                        :style="{ left: `${overlay.left}%`, width: `${overlay.width}%`, top: `${24 + overlay.row * 52}px` }"
                        @click.stop="selectTextOverlay(overlay.id)"
                        @mousedown.left.prevent="startTextOverlayDrag($event, overlay.id)"
                      >
                        <div class="text-overlay-copy">
                          <strong>{{ overlay.text || 'Title' }}</strong>
                          <span>{{ formatTime(overlay.timelineStart) }} · {{ formatTime(overlay.duration) }}</span>
                        </div>
                        <div class="timeline-overlay-resize-handle left" @mousedown.left.stop.prevent="startTextOverlayResize($event, overlay.id, 'left')"></div>
                        <div class="timeline-overlay-resize-handle right" @mousedown.left.stop.prevent="startTextOverlayResize($event, overlay.id, 'right')"></div>
                        <button class="mini-btn danger text-overlay-remove" @mousedown.stop @click.stop="removeTextOverlayById(overlay.id)">×</button>
                      </article>
                    </div>

                    <div class="timeline-lane-section timeline-text-section" :style="{ minHeight: `${24 + Math.max(1, watermarkOverlayRowCount) * 52}px` }">
                      <span class="timeline-track-section-label">Watermarks
                        <button class="mini-btn text-add-btn" @click.stop="addWatermarkOverlay" title="Add watermark overlay">+ Add</button>
                      </span>
                      <div v-if="!watermarkOverlayLayout.length" class="empty-text-track">Click "+ Add" to create a watermark overlay on the timeline.</div>
                      <article
                        v-for="overlay in watermarkOverlayLayout"
                        :key="overlay.id"
                        class="text-overlay-block"
                        :class="{ active: overlay.id === selectedWatermarkOverlayId }"
                        :style="{ left: `${overlay.left}%`, width: `${overlay.width}%`, top: `${24 + overlay.row * 52}px` }"
                        @click.stop="selectWatermarkOverlay(overlay.id)"
                        @mousedown.left.prevent="startWatermarkOverlayDrag($event, overlay.id)"
                      >
                        <div class="text-overlay-copy">
                          <strong>{{ overlay.mode === 'image' ? (overlay.imagePath ? overlay.imagePath.split(/[\\/]/).pop() : 'Watermark Image') : (overlay.text || 'Watermark') }}</strong>
                          <span>{{ formatTime(overlay.timelineStart) }} · {{ formatTime(overlay.duration) }}</span>
                        </div>
                        <div class="timeline-overlay-resize-handle left" @mousedown.left.stop.prevent="startWatermarkOverlayResize($event, overlay.id, 'left')"></div>
                        <div class="timeline-overlay-resize-handle right" @mousedown.left.stop.prevent="startWatermarkOverlayResize($event, overlay.id, 'right')"></div>
                        <button class="mini-btn danger text-overlay-remove" @mousedown.stop @click.stop="removeWatermarkOverlayById(overlay.id)">×</button>
                      </article>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </section>

          <div class="program-monitor" :class="{ fullscreen: previewFullscreen }">
            <div class="monitor-toolbar">
              <span class="monitor-label">Preview</span>
              <span class="monitor-meta">{{ formatTime(totalTimelineDuration) }}</span>
              <button class="monitor-fullscreen-btn" @click="previewFullscreen = !previewFullscreen" :title="previewFullscreen ? 'Exit fullscreen' : 'Fullscreen'">{{ previewFullscreen ? '⧉' : '⛶' }}</button>
            </div>
            <div class="preview-card project-preview-card">
              <div class="video-container timeline-preview-video">
                <div ref="previewStageEl" class="timeline-preview-stage accurate-preview-stage">
                  <template v-if="hasTimelineClips">
                    <video
                      v-if="showRenderedProjectPreview"
                      ref="projectPreviewEl"
                      class="timeline-preview-layer rendered-preview-layer"
                      :src="projectPreviewSrc"
                      preload="auto"
                      playsinline
                      @loadedmetadata="onProjectPreviewLoadedMetadata"
                      @play="onProjectPreviewPlay"
                      @playing="onProjectPreviewPlaying"
                      @pause="onProjectPreviewPause"
                      @timeupdate="onProjectPreviewTimeUpdate"
                      @seeking="onProjectPreviewSeeking"
                      @seeked="onProjectPreviewSeeked"
                      @ended="onProjectPreviewEnded"
                    ></video>
                    <template v-else>
                      <video
                        ref="previewVideoEl"
                        class="timeline-preview-layer"
                        :style="previewChromakeyActive ? { ...previewBaseStyle, opacity: '0' } : previewBaseStyle"
                        :src="previewBaseSrc"
                        preload="auto"
                        playsinline
                        @loadeddata="onPreviewLayerLoaded('base')"
                        @seeked="scheduleChromakeyDraw"
                      ></video>
                      <canvas
                        ref="chromakeyCanvasEl"
                        class="timeline-preview-layer chromakey-canvas"
                        :style="{ ...previewPrimaryStyle, display: previewChromakeyActive ? 'block' : 'none' }"
                      ></canvas>
                      <video
                        ref="previewOverlayEl"
                        class="timeline-preview-layer overlay"
                        :style="previewOverlayStyle"
                        :src="previewOverlaySrc"
                        preload="auto"
                        playsinline
                        @loadeddata="onPreviewLayerLoaded('overlay')"
                      ></video>
                    </template>
                    <!-- Cinematic effect overlays (always visible in live preview) -->
                    <template v-if="!showRenderedProjectPreview && previewEffectsClip">
                      <div v-if="(previewEffectsClip.letterbox || 0) > 0" class="preview-letterbox-top" :style="{ height: (previewEffectsClip.letterbox / 100 * 14) + '%' }"></div>
                      <div v-if="(previewEffectsClip.letterbox || 0) > 0" class="preview-letterbox-bottom" :style="{ height: (previewEffectsClip.letterbox / 100 * 14) + '%' }"></div>
                      <div v-if="(previewEffectsClip.vignette || 0) > 0" class="preview-vignette" :style="{ background: `radial-gradient(ellipse at center, transparent ${Math.max(10, 70 - previewEffectsClip.vignette * 0.6)}%, rgba(0,0,0,${Math.min(0.85, previewEffectsClip.vignette / 100 * 0.85).toFixed(2)}) 100%)` }"></div>
                      <div v-if="(previewEffectsClip.grain || 0) > 0" class="preview-grain" :style="{ opacity: Math.min(0.5, previewEffectsClip.grain / 100 * 0.5) }"></div>
                    </template>
                    <div v-if="!showRenderedProjectPreview" class="overlay-bounds-container" :style="overlayContainerStyle">
                      <div
                        v-for="txtOvl in visibleTextOverlays"
                        :key="txtOvl.id"
                        class="text-overlay-preview"
                        :class="{ 'overlay-selected': txtOvl.id === selectedTextOverlayId }"
                        :style="{
                          left: `${txtOvl.positionX}%`,
                          top: `${txtOvl.positionY}%`,
                          transform: 'translate(-50%, -50%)',
                          fontFamily: txtOvl.fontFamily || 'sans-serif',
                          fontSize: `${Math.max(8, (txtOvl.fontSize || 48) * overlayFontScale).toFixed(1)}px`,
                          fontWeight: txtOvl.fontWeight || 'bold',
                          color: txtOvl.color || '#ffffff',
                          backgroundColor: txtOvl.backgroundColor || 'transparent',
                          opacity: txtOvl.computedOpacity,
                          padding: `${Math.max(2, 6 * overlayFontScale).toFixed(1)}px ${Math.max(4, 14 * overlayFontScale).toFixed(1)}px`,
                          textShadow: `0 ${(2 * overlayFontScale).toFixed(1)}px ${(8 * overlayFontScale).toFixed(1)}px rgba(0,0,0,0.7), 0 0 ${(2 * overlayFontScale).toFixed(1)}px rgba(0,0,0,0.5)`,
                        }"
                        @click.stop="selectTextOverlay(txtOvl.id)"
                      >{{ txtOvl.text || 'Title' }}</div>
                      <template v-for="wm in visibleWatermarkOverlays" :key="wm.id">
                        <template v-if="wm.position !== 'tile'">
                          <div v-if="wm.mode === 'text' && wm.text" :style="watermarkPreviewStyleFor(wm)" class="watermark-preview" :class="{ 'overlay-selected': wm.id === selectedWatermarkOverlayId }" @click.stop="selectWatermarkOverlay(wm.id)">{{ wm.text }}</div>
                          <img v-else-if="wm.mode === 'image' && wm.imagePath" :src="buildWatermarkPreviewSrc(wm.imagePath)" :style="{ ...watermarkPreviewStyleFor(wm), width: wm.scale + '%', height: 'auto', objectFit: 'contain' }" class="watermark-preview" :class="{ 'overlay-selected': wm.id === selectedWatermarkOverlayId }" @click.stop="selectWatermarkOverlay(wm.id)" />
                        </template>
                        <template v-else>
                          <div class="watermark-tile-container" :class="{ 'overlay-selected': wm.id === selectedWatermarkOverlayId }" :style="{ opacity: wm.computedOpacity }" @click.stop="selectWatermarkOverlay(wm.id)">
                            <div class="watermark-tile-inner"
                              :style="{
                                fontFamily: wm.mode === 'text' ? (wm.fontFamily || 'sans-serif') : undefined,
                                fontSize: wm.mode === 'text' ? (Math.max(8, (wm.fontSize || 24) * overlayFontScale).toFixed(1) + 'px') : undefined,
                                fontWeight: wm.mode === 'text' ? (wm.fontWeight || 'bold') : undefined,
                                color: wm.mode === 'text' ? (wm.color || '#ffffff') : undefined,
                                textShadow: (wm.mode === 'text' && wm.shadow) ? `0 ${(2 * overlayFontScale).toFixed(1)}px ${((wm.shadowBlur||4) * overlayFontScale).toFixed(1)}px ${wm.shadowColor||'#000'}, 0 0 ${(2 * overlayFontScale).toFixed(1)}px ${wm.shadowColor||'#000'}` : undefined,
                              }"
                            >
                              <template v-for="item in watermarkTileItemsFor(wm)" :key="`${wm.id}-${item.key}`">
                                <div
                                  v-if="wm.mode === 'text' && wm.text"
                                  class="watermark-tile-item"
                                  :style="{ left: item.x + 'px', top: item.y + 'px' }"
                                >{{ wm.text }}</div>
                                <img
                                  v-else-if="wm.mode === 'image' && wm.imagePath"
                                  :src="buildWatermarkPreviewSrc(wm.imagePath)"
                                  class="watermark-tile-item"
                                  :style="{
                                    left: item.x + 'px',
                                    top: item.y + 'px',
                                    width: wm.scale + '%',
                                    height: 'auto',
                                    objectFit: 'contain',
                                  }"
                                />
                              </template>
                            </div>
                          </div>
                        </template>
                      </template>
                    </div>
                  </template>
                  <!-- Loading spinner during render -->
                  <div v-if="hasTimelineClips && previewRendering" class="preview-loading-overlay">
                    <div class="preview-spinner"></div>
                    <span class="preview-loading-text">Rendering preview…</span>
                  </div>
                  <div v-if="!hasTimelineClips" class="timeline-preview-empty-state">
                    <strong>No clips on the timeline</strong>
                    <span>Add trimmed selections from source videos to build your project.</span>
                  </div>
                </div>
              </div>

              <div class="controls-row">
                <button class="ctrl-btn" :disabled="!hasTimelineClips" @click="toggleProjectPreviewPlay">
                  {{ previewPlaying ? 'Pause' : 'Play' }}
                </button>
                <span class="time-display">{{ formatTime(timelinePreviewProjectTime) }} / {{ formatTime(totalTimelineDuration) }}</span>
                <span class="preview-status" :class="{ active: timelinePreviewActive, disabled: !hasTimelineClips }">
                  {{ hasTimelineClips ? (showRenderedProjectPreview ? (previewPlaying ? 'Rendered preview' : 'Rendered preview paused') : (previewPlaying ? 'Real-time preview' : (timelinePreviewActive ? 'Paused' : 'Ready'))) : 'Add clips to enable project preview' }}
                </span>
                <button class="ctrl-btn secondary" :disabled="!hasTimelineClips" @click="restartProjectPreview">Restart</button>
              </div>
            </div>
          </div>

          <div class="inspector-panel" :class="{ collapsed: !inspectorOpen }">
            <div class="inspector-panel-header" @click="inspectorOpen = !inspectorOpen">
              <span class="inspector-panel-title">{{ inspectorTitle }}</span>
              <span class="collapse-arrow">{{ inspectorOpen ? '▸' : '◂' }}</span>
            </div>
            <div v-show="inspectorOpen" class="inspector-panel-body">
            <div v-if="selectedClip" class="clip-editor-card">
              <div class="clip-editor-head">
                <div>
                  <span class="summary-label">Selected Clip</span>
                  <strong>{{ selectedClip.sourceName }}</strong>
                  <span v-if="isTransitionFocus" class="transition-edit-label">Editing transition into clip {{ selectedClipIndex + 2 }}</span>
                </div>
                <span class="summary-meta">{{ formatTime(selectedClip.duration) }}</span>
              </div>

              <nav class="inspector-tabs">
                <button class="inspector-tab" :class="{ active: inspectorTab === 'timing' }" @click="inspectorTab = 'timing'">Timing</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'speed' }" @click="inspectorTab = 'speed'">Speed</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'presets' }" @click="inspectorTab = 'presets'">Presets</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'color' }" @click="inspectorTab = 'color'">Color</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'motion' }" @click="inspectorTab = 'motion'">Motion</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'audio' }" @click="inspectorTab = 'audio'">Audio</button>
                <button class="inspector-tab" :class="{ active: inspectorTab === 'effects' }" @click="inspectorTab = 'effects'">Effects</button>
              </nav>
              <div class="inspector-tab-content">
              <div v-show="inspectorTab === 'timing'" class="inspector-tab-panel">
                <label class="slider-field">
                  <span>Fade In</span>
                  <input :value="selectedClip.fadeIn" type="range" min="0" :max="selectedClipFadeCap" step="0.1" @input="updateSelectedClipField('fadeIn', Number($event.target.value))" />
                  <strong>{{ selectedClip.fadeIn.toFixed(1) }}s</strong>
                </label>
                <label class="slider-field">
                  <span>Fade Out</span>
                  <input :value="selectedClip.fadeOut" type="range" min="0" :max="selectedClipFadeCap" step="0.1" @input="updateSelectedClipField('fadeOut', Number($event.target.value))" />
                  <strong>{{ selectedClip.fadeOut.toFixed(1) }}s</strong>
                </label>
                <label class="slider-field" :class="{ disabled: !selectedClipNext }">
                  <span>Crossfade</span>
                  <input :value="selectedClip.transitionDuration" type="range" min="0" :max="selectedClipTransitionCap" step="0.1" :disabled="!selectedClipNext" @input="updateSelectedClipField('transitionDuration', Number($event.target.value))" />
                  <strong>{{ selectedClipNext ? `${selectedClip.transitionDuration.toFixed(1)}s` : 'Last clip' }}</strong>
                </label>
                <label class="preset-field" :class="{ disabled: !selectedClipNext }">
                  <span>Transition</span>
                  <select :value="selectedClip.transitionType" class="preset-select" :disabled="!selectedClipNext" @change="updateSelectedClipField('transitionType', $event.target.value)">
                    <option v-for="option in transitionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label class="preset-field" :class="{ disabled: !selectedClipNext }">
                  <span>Audio Blend</span>
                  <select :value="selectedClip.audioTransitionCurve" class="preset-select" :disabled="!selectedClipNext" @change="updateSelectedClipField('audioTransitionCurve', $event.target.value)">
                    <option v-for="option in audioTransitionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
              </div>

              <div v-show="inspectorTab === 'speed'" class="inspector-tab-panel">
                <label class="slider-field">
                  <span>Speed</span>
                  <input :value="selectedClip.speed" type="range" min="0.25" max="4" step="0.25" @input="updateSelectedClipField('speed', Number($event.target.value))" />
                  <strong>{{ selectedClip.speed.toFixed(2) }}x</strong>
                </label>
                <label class="slider-field">
                  <span>Scale</span>
                  <input :value="selectedClip.scale" type="range" min="25" max="200" step="1" @input="updateSelectedClipField('scale', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.scale) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Position X</span>
                  <input :value="selectedClip.posX" type="range" min="-100" max="100" step="1" @input="updateSelectedClipField('posX', Number($event.target.value))" />
                  <strong>{{ selectedClip.posX > 0 ? '+' : '' }}{{ Math.round(selectedClip.posX) }}</strong>
                </label>
                <label class="slider-field">
                  <span>Position Y</span>
                  <input :value="selectedClip.posY" type="range" min="-100" max="100" step="1" @input="updateSelectedClipField('posY', Number($event.target.value))" />
                  <strong>{{ selectedClip.posY > 0 ? '+' : '' }}{{ Math.round(selectedClip.posY) }}</strong>
                </label>
              </div>

              <div v-show="inspectorTab === 'presets'" class="inspector-tab-panel">
                <div class="preset-field">
                  <span>Fix Presets</span>
                  <div class="fix-preset-row">
                    <button class="mini-btn" @click="applyFixPreset('dialogue')">Clean Dialogue</button>
                    <button class="mini-btn" @click="applyFixPreset('lowLight')">Low Light Rescue</button>
                    <button class="mini-btn" @click="applyFixPreset('mobile')">Mobile Cleanup</button>
                    <button class="mini-btn secondary" @click="applyFixPreset('reset')">Reset Fixes</button>
                  </div>
                </div>
              </div>

              <div v-show="inspectorTab === 'color'" class="inspector-tab-panel">
                <label class="slider-field">
                  <span>Exposure</span>
                  <input :value="selectedClip.exposure" type="range" min="-40" max="40" step="1" @input="updateSelectedClipField('exposure', Number($event.target.value))" />
                  <strong>{{ selectedClip.exposure > 0 ? '+' : '' }}{{ Math.round(selectedClip.exposure) }}</strong>
                </label>
                <label class="slider-field">
                  <span>Contrast</span>
                  <input :value="selectedClip.contrast" type="range" min="50" max="150" step="1" @input="updateSelectedClipField('contrast', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.contrast) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Saturation</span>
                  <input :value="selectedClip.saturation" type="range" min="0" max="200" step="1" @input="updateSelectedClipField('saturation', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.saturation) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Temperature</span>
                  <input :value="selectedClip.temperature" type="range" min="-100" max="100" step="1" @input="updateSelectedClipField('temperature', Number($event.target.value))" />
                  <strong>{{ selectedClip.temperature > 0 ? '+' : '' }}{{ Math.round(selectedClip.temperature) }}</strong>
                </label>
                <label class="slider-field">
                  <span>Tint</span>
                  <input :value="selectedClip.tint" type="range" min="-100" max="100" step="1" @input="updateSelectedClipField('tint', Number($event.target.value))" />
                  <strong>{{ selectedClip.tint > 0 ? '+' : '' }}{{ Math.round(selectedClip.tint) }}</strong>
                </label>
              </div>

              <div v-show="inspectorTab === 'motion'" class="inspector-tab-panel">
                <label class="slider-field">
                  <span>Stabilize</span>
                  <input :value="selectedClip.stabilize" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('stabilize', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.stabilize) }}%</strong>
                </label>
                <label class="preset-field">
                  <span>Stabilization Mode</span>
                  <select :value="selectedClip.stabilizeMode || 'standard'" class="preset-select" @change="updateSelectedClipField('stabilizeMode', $event.target.value)">
                    <option v-for="option in stabilizationModeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label class="slider-field">
                  <span>Jello Repair</span>
                  <input :value="selectedClip.wobbleRepair" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('wobbleRepair', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.wobbleRepair) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Wobble Crop</span>
                  <input :value="selectedClip.wobbleCrop" type="range" min="0" max="25" step="1" @input="updateSelectedClipField('wobbleCrop', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.wobbleCrop) }}%</strong>
                </label>
              </div>

              <div v-show="inspectorTab === 'audio'" class="inspector-tab-panel">
                <label class="slider-field">
                  <span>Volume</span>
                  <input :value="selectedClip.volume" type="range" min="0" max="2" step="0.05" :disabled="selectedClip.muted" @input="updateSelectedClipField('volume', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.volume * 100) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Clarity</span>
                  <input :value="selectedClip.clarity" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('clarity', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.clarity) }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Video Denoise</span>
                  <input :value="selectedClip.videoDenoise" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('videoDenoise', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.videoDenoise) }}%</strong>
                </label>
                <label class="slider-field" :class="{ disabled: selectedClip.muted }">
                  <span>Background Noise</span>
                  <input :value="selectedClip.audioDenoise" type="range" min="0" max="100" step="1" :disabled="selectedClip.muted" @input="updateSelectedClipField('audioDenoise', Number($event.target.value))" />
                  <strong>{{ selectedClip.muted ? 'Muted' : `${Math.round(selectedClip.audioDenoise)}%` }}</strong>
                </label>
                <label class="check-field">
                  <input :checked="selectedClip.muted" type="checkbox" @change="updateSelectedClipField('muted', $event.target.checked)" />
                  <span>Remove sound</span>
                </label>
                <label class="check-field" :class="{ disabled: selectedClip.muted }">
                  <input :checked="selectedClip.speechFocus" type="checkbox" :disabled="selectedClip.muted" @change="updateSelectedClipField('speechFocus', $event.target.checked)" />
                  <span>Speech focus</span>
                </label>
                <label class="check-field" :class="{ disabled: selectedClip.muted }">
                  <input :checked="selectedClip.loudnessNormalize" type="checkbox" :disabled="selectedClip.muted" @change="updateSelectedClipField('loudnessNormalize', $event.target.checked)" />
                  <span>Normalize loudness</span>
                </label>
                <label class="check-field" :class="{ disabled: selectedClip.muted }">
                  <input :checked="selectedClip.peakLimiter" type="checkbox" :disabled="selectedClip.muted" @change="updateSelectedClipField('peakLimiter', $event.target.checked)" />
                  <span>Peak limiter</span>
                </label>
              </div>

              <div v-show="inspectorTab === 'effects'" class="inspector-tab-panel">
                <div class="inspector-section-title">Cinematic</div>
                <label class="slider-field">
                  <span>Letterbox</span>
                  <input :value="selectedClip.letterbox" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('letterbox', Number($event.target.value))" />
                  <strong>{{ selectedClip.letterbox > 0 ? (1.78 + selectedClip.letterbox / 100 * 0.61).toFixed(2) + ':1' : 'Off' }}</strong>
                </label>
                <label class="slider-field">
                  <span>Vignette</span>
                  <input :value="selectedClip.vignette" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('vignette', Number($event.target.value))" />
                  <strong>{{ selectedClip.vignette > 0 ? Math.round(selectedClip.vignette) + '%' : 'Off' }}</strong>
                </label>
                <label class="slider-field">
                  <span>Film Grain</span>
                  <input :value="selectedClip.grain" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('grain', Number($event.target.value))" />
                  <strong>{{ selectedClip.grain > 0 ? Math.round(selectedClip.grain) + '%' : 'Off' }}</strong>
                </label>
                <label class="slider-field">
                  <span>Blur</span>
                  <input :value="selectedClip.blur" type="range" min="0" max="100" step="1" @input="updateSelectedClipField('blur', Number($event.target.value))" />
                  <strong>{{ selectedClip.blur > 0 ? Math.round(selectedClip.blur) + '%' : 'Off' }}</strong>
                </label>

                <div class="inspector-section-title">Color Grade (LUT)</div>
                <label class="preset-field">
                  <span>Preset</span>
                  <select :value="selectedClip.lutName || ''" class="preset-select" @change="applyLutPreset($event.target.value)">
                    <option value="">None</option>
                    <option v-for="lut in builtinLuts" :key="lut.file" :value="lut.file">{{ lut.name }}</option>
                    <option value="__custom__">Custom .cube file…</option>
                  </select>
                </label>
                <span v-if="selectedClip.lutPath" class="inspector-meta">{{ selectedClip.lutPath.split(/[\\/]/).pop() }}</span>

                <div class="inspector-section-title">Green Screen</div>
                <label class="preset-field">
                  <span>Key Color</span>
                  <div class="chromakey-row">
                    <input type="color" :value="selectedClip.chromakeyColor || '#00ff00'" class="chromakey-picker" @input="updateSelectedClipField('chromakeyColor', $event.target.value)" />
                    <button v-if="selectedClip.chromakeyColor" class="mini-btn danger" @click="updateSelectedClipField('chromakeyColor', '')">Clear</button>
                    <button v-else class="mini-btn" @click="updateSelectedClipField('chromakeyColor', '#00ff00')">Enable</button>
                  </div>
                </label>
                <label v-if="selectedClip.chromakeyColor" class="slider-field">
                  <span>Tolerance</span>
                  <input :value="selectedClip.chromakeyTolerance" type="range" min="1" max="100" step="1" @input="updateSelectedClipField('chromakeyTolerance', Number($event.target.value))" />
                  <strong>{{ Math.round(selectedClip.chromakeyTolerance) }}%</strong>
                </label>

                <div class="fix-preset-row" style="margin-top: 8px">
                  <button class="mini-btn" @click="applyEffectsPreset('trailer')">Trailer Look</button>
                  <button class="mini-btn" @click="applyEffectsPreset('dreamy')">Dreamy</button>
                  <button class="mini-btn" @click="applyEffectsPreset('retro')">Retro Film</button>
                  <button class="mini-btn secondary" @click="applyEffectsPreset('reset')">Reset Effects</button>
                </div>
              </div>
              </div>

              <div class="clip-edit-actions">
                <button class="mini-btn" :disabled="!canSplitSelectedClip" title="Split at Playhead (S)" @click="splitSelectedClipAtPlayhead">Split at Playhead</button>
                <button class="mini-btn danger" title="Ripple Delete (Delete)" @click="rippleDeleteSelectedClip">Ripple Delete</button>
                <button class="mini-btn" title="Copy Attributes (Ctrl+C)" @click="copyClipAttributes">Copy Attrs</button>
                <button class="mini-btn" :disabled="!clipboardAttrs" title="Paste Attributes (Ctrl+V)" @click="pasteClipAttributes">Paste Attrs</button>
              </div>
            </div>
            <div v-else-if="selectedAudioOverlay" class="clip-editor-card">
              <div class="clip-editor-head">
                <div>
                  <span class="summary-label">Audio Overlay</span>
                  <strong>{{ selectedAudioOverlay.name }}</strong>
                </div>
                <span class="summary-meta">{{ formatTime(selectedAudioOverlay.trimEnd - selectedAudioOverlay.trimStart) }}</span>
              </div>

              <div class="inspector-section-title">Placement</div>

              <label class="slider-field">
                <span>Start on Timeline</span>
                <input
                  :value="selectedAudioOverlay.timelineStart"
                  type="range"
                  min="0"
                  :max="Math.max(0, totalTimelineDuration - (selectedAudioOverlay.trimEnd - selectedAudioOverlay.trimStart))"
                  step="0.1"
                  @input="updateAudioOverlayById(selectedAudioOverlay.id, { timelineStart: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedAudioOverlay.timelineStart) }}</strong>
              </label>

              <div class="inspector-section-title">Trim</div>

              <label class="slider-field">
                <span>Trim In</span>
                <input
                  :value="selectedAudioOverlay.trimStart"
                  type="range"
                  min="0"
                  :max="Math.max(0, selectedAudioOverlay.sourceDuration - 0.05)"
                  step="0.1"
                  @input="updateAudioOverlayById(selectedAudioOverlay.id, { trimStart: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedAudioOverlay.trimStart) }}</strong>
              </label>

              <label class="slider-field">
                <span>Trim Out</span>
                <input
                  :value="selectedAudioOverlay.trimEnd"
                  type="range"
                  min="0.05"
                  :max="Math.max(0.05, selectedAudioOverlay.sourceDuration)"
                  step="0.1"
                  @input="updateAudioOverlayById(selectedAudioOverlay.id, { trimEnd: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedAudioOverlay.trimEnd) }}</strong>
              </label>

              <div class="inspector-section-title">Level</div>

              <label class="slider-field" :class="{ disabled: selectedAudioOverlay.muted }">
                <span>Volume</span>
                <input
                  :value="selectedAudioOverlay.volume"
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  :disabled="selectedAudioOverlay.muted"
                  @input="updateAudioOverlayById(selectedAudioOverlay.id, { volume: Number($event.target.value) })"
                />
                <strong>{{ Math.round(selectedAudioOverlay.volume * 100) }}%</strong>
              </label>

              <label class="check-field">
                <input :checked="selectedAudioOverlay.muted" type="checkbox" @change="updateAudioOverlayById(selectedAudioOverlay.id, { muted: $event.target.checked })" />
                <span>Mute overlay</span>
              </label>

              <div class="clip-edit-actions">
                <button class="mini-btn danger" @click="removeAudioOverlayById(selectedAudioOverlay.id)">Remove Overlay</button>
              </div>
            </div>

            <!-- Text Overlay Inspector -->
            <div v-else-if="selectedTextOverlay" class="clip-editor-card">
              <div class="clip-editor-head">
                <div>
                  <span class="summary-label">Text Overlay</span>
                  <strong>{{ selectedTextOverlay.text || 'Untitled' }}</strong>
                </div>
                <span class="summary-meta">{{ formatTime(selectedTextOverlay.duration) }}</span>
              </div>

              <div class="inspector-section-title">Content</div>

              <label class="slider-field text-input-field">
                <span>Text</span>
                <input
                  :value="selectedTextOverlay.text"
                  type="text"
                  class="text-overlay-input"
                  placeholder="Enter text..."
                  @input="updateTextOverlayById(selectedTextOverlay.id, { text: $event.target.value })"
                />
              </label>

              <label class="slider-field">
                <span>Font</span>
                <select
                  :value="selectedTextOverlay.fontFamily"
                  class="text-overlay-select"
                  @change="updateTextOverlayById(selectedTextOverlay.id, { fontFamily: $event.target.value })"
                >
                  <option value="sans-serif">Sans-serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                  <option value="'Inter', sans-serif">Inter</option>
                  <option value="'Roboto', sans-serif">Roboto</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Poppins', sans-serif">Poppins</option>
                  <option value="'Oswald', sans-serif">Oswald</option>
                  <option value="'Playfair Display', serif">Playfair Display</option>
                  <option value="'Bebas Neue', sans-serif">Bebas Neue</option>
                  <option value="'Raleway', sans-serif">Raleway</option>
                  <option value="'Lato', sans-serif">Lato</option>
                  <option value="'Source Code Pro', monospace">Source Code Pro</option>
                  <option value="'Arial Black', sans-serif">Arial Black</option>
                  <option value="'Georgia', serif">Georgia</option>
                  <option value="'Impact', sans-serif">Impact</option>
                  <option value="'Courier New', monospace">Courier New</option>
                  <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                </select>
              </label>

              <label class="slider-field">
                <span>Size</span>
                <input
                  :value="selectedTextOverlay.fontSize"
                  type="range"
                  min="12"
                  max="120"
                  step="1"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { fontSize: Number($event.target.value) })"
                />
                <strong>{{ selectedTextOverlay.fontSize }}px</strong>
              </label>

              <label class="slider-field">
                <span>Weight</span>
                <select
                  :value="selectedTextOverlay.fontWeight"
                  class="text-overlay-select"
                  @change="updateTextOverlayById(selectedTextOverlay.id, { fontWeight: $event.target.value })"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="100">Thin</option>
                  <option value="300">Light</option>
                  <option value="600">Semi-Bold</option>
                  <option value="900">Black</option>
                </select>
              </label>

              <div class="inspector-section-title">Colors</div>

              <label class="slider-field color-field">
                <span>Text Color</span>
                <input
                  :value="selectedTextOverlay.color"
                  type="color"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { color: $event.target.value })"
                />
                <strong>{{ selectedTextOverlay.color }}</strong>
              </label>

              <label class="slider-field color-field">
                <span>Background</span>
                <input
                  :value="selectedTextOverlay.backgroundColor || '#000000'"
                  type="color"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { backgroundColor: $event.target.value })"
                />
                <strong>{{ selectedTextOverlay.backgroundColor || 'None' }}</strong>
              </label>

              <label class="check-field">
                <input :checked="!selectedTextOverlay.backgroundColor" type="checkbox" @change="updateTextOverlayById(selectedTextOverlay.id, { backgroundColor: $event.target.checked ? '' : '#000000' })" />
                <span>Transparent background</span>
              </label>

              <div class="inspector-section-title">Position</div>

              <label class="slider-field">
                <span>X Position</span>
                <input
                  :value="selectedTextOverlay.positionX"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { positionX: Number($event.target.value) })"
                />
                <strong>{{ selectedTextOverlay.positionX }}%</strong>
              </label>

              <label class="slider-field">
                <span>Y Position</span>
                <input
                  :value="selectedTextOverlay.positionY"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { positionY: Number($event.target.value) })"
                />
                <strong>{{ selectedTextOverlay.positionY }}%</strong>
              </label>

              <div class="inspector-section-title">Timing</div>

              <label class="slider-field">
                <span>Start</span>
                <input
                  :value="selectedTextOverlay.timelineStart"
                  type="range"
                  min="0"
                  :max="Math.max(0, totalTimelineDuration - selectedTextOverlay.duration)"
                  step="0.1"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { timelineStart: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedTextOverlay.timelineStart) }}</strong>
              </label>

              <label class="slider-field">
                <span>Duration</span>
                <input
                  :value="selectedTextOverlay.duration"
                  type="range"
                  min="0.5"
                  :max="Math.max(0.5, totalTimelineDuration - selectedTextOverlay.timelineStart)"
                  step="0.1"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { duration: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedTextOverlay.duration) }}</strong>
              </label>

              <label class="slider-field">
                <span>Fade In</span>
                <input
                  :value="selectedTextOverlay.fadeIn"
                  type="range"
                  min="0"
                  :max="Math.min(2, selectedTextOverlay.duration / 2)"
                  step="0.05"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { fadeIn: Number($event.target.value) })"
                />
                <strong>{{ selectedTextOverlay.fadeIn.toFixed(2) }}s</strong>
              </label>

              <label class="slider-field">
                <span>Fade Out</span>
                <input
                  :value="selectedTextOverlay.fadeOut"
                  type="range"
                  min="0"
                  :max="Math.min(2, selectedTextOverlay.duration / 2)"
                  step="0.05"
                  @input="updateTextOverlayById(selectedTextOverlay.id, { fadeOut: Number($event.target.value) })"
                />
                <strong>{{ selectedTextOverlay.fadeOut.toFixed(2) }}s</strong>
              </label>

              <div class="clip-edit-actions">
                <button class="mini-btn danger" @click="removeTextOverlayById(selectedTextOverlay.id)">Remove Text</button>
              </div>
            </div>

            <div v-else-if="selectedWatermarkOverlay" class="clip-editor-card">
              <div class="clip-editor-head">
                <div>
                  <span class="summary-label">Watermark Overlay</span>
                  <strong>{{ selectedWatermarkOverlay.mode === 'image'
                    ? (selectedWatermarkOverlay.imagePath ? selectedWatermarkOverlay.imagePath.split(/[\\/]/).pop() : 'Watermark Image')
                    : (selectedWatermarkOverlay.text || 'Watermark') }}</strong>
                </div>
                <span class="summary-meta">{{ formatTime(selectedWatermarkOverlay.duration) }}</span>
              </div>

              <div class="inspector-section-title">Type</div>

              <div class="watermark-mode-row">
                <button class="mini-btn" :class="{ active: selectedWatermarkOverlay.mode === 'text' }" @click="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { mode: 'text' })">Text</button>
                <button class="mini-btn" :class="{ active: selectedWatermarkOverlay.mode === 'image' }" @click="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { mode: 'image' })">Image</button>
              </div>

              <template v-if="selectedWatermarkOverlay.mode === 'text'">
                <div class="inspector-section-title">Text Content</div>

                <label class="slider-field text-input-field">
                  <span>Text</span>
                  <input
                    :value="selectedWatermarkOverlay.text"
                    type="text"
                    class="text-overlay-input"
                    placeholder="e.g. © 2026 Your Name"
                    @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { text: $event.target.value })"
                  />
                </label>

                <label class="slider-field">
                  <span>Font</span>
                  <select :value="selectedWatermarkOverlay.fontFamily" class="text-overlay-select" @change="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { fontFamily: $event.target.value })">
                    <option value="sans-serif">Sans-serif</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="'Inter', sans-serif">Inter</option>
                    <option value="'Roboto', sans-serif">Roboto</option>
                    <option value="'Montserrat', sans-serif">Montserrat</option>
                    <option value="'Poppins', sans-serif">Poppins</option>
                    <option value="'Oswald', sans-serif">Oswald</option>
                    <option value="'Playfair Display', serif">Playfair Display</option>
                    <option value="'Bebas Neue', sans-serif">Bebas Neue</option>
                    <option value="'Arial Black', sans-serif">Arial Black</option>
                    <option value="'Impact', sans-serif">Impact</option>
                  </select>
                </label>

                <label class="slider-field">
                  <span>Size</span>
                  <input :value="selectedWatermarkOverlay.fontSize" type="range" min="8" max="80" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { fontSize: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.fontSize }}px</strong>
                </label>

                <label class="slider-field">
                  <span>Weight</span>
                  <select :value="selectedWatermarkOverlay.fontWeight" class="text-overlay-select" @change="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { fontWeight: $event.target.value })">
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="300">Light</option>
                    <option value="600">Semi-Bold</option>
                    <option value="900">Black</option>
                  </select>
                </label>

                <label class="slider-field color-field">
                  <span>Color</span>
                  <input :value="selectedWatermarkOverlay.color" type="color" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { color: $event.target.value })" />
                  <strong>{{ selectedWatermarkOverlay.color }}</strong>
                </label>
              </template>

              <template v-else>
                <div class="inspector-section-title">Image Source</div>
                <div class="watermark-image-pick">
                  <button class="mini-btn" @click="pickWatermarkImageForOverlay(selectedWatermarkOverlay.id)">{{ selectedWatermarkOverlay.imagePath ? 'Change Image' : 'Select Image' }}</button>
                  <span v-if="selectedWatermarkOverlay.imagePath" class="watermark-image-path">{{ selectedWatermarkOverlay.imagePath.split(/[\\/]/).pop() }}</span>
                  <span v-else class="watermark-image-path dim">No image selected</span>
                </div>

                <label class="slider-field">
                  <span>Scale</span>
                  <input :value="selectedWatermarkOverlay.scale" type="range" min="5" max="200" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { scale: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.scale }}%</strong>
                </label>
              </template>

              <div class="inspector-section-title">Appearance</div>

              <label class="slider-field">
                <span>Opacity</span>
                <input :value="selectedWatermarkOverlay.opacity" type="range" min="0.05" max="1" step="0.05" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { opacity: Number($event.target.value) })" />
                <strong>{{ Math.round(selectedWatermarkOverlay.opacity * 100) }}%</strong>
              </label>

              <label class="slider-field">
                <span>Rotation</span>
                <input :value="selectedWatermarkOverlay.rotation" type="range" min="-180" max="180" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { rotation: Number($event.target.value) })" />
                <strong>{{ selectedWatermarkOverlay.rotation }}°</strong>
              </label>

              <label class="check-field">
                <input :checked="selectedWatermarkOverlay.shadow" type="checkbox" @change="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { shadow: $event.target.checked })" />
                <span>Drop shadow</span>
              </label>

              <template v-if="selectedWatermarkOverlay.shadow">
                <label class="slider-field color-field">
                  <span>Shadow Color</span>
                  <input :value="selectedWatermarkOverlay.shadowColor" type="color" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { shadowColor: $event.target.value })" />
                  <strong>{{ selectedWatermarkOverlay.shadowColor }}</strong>
                </label>

                <label class="slider-field">
                  <span>Shadow Blur</span>
                  <input :value="selectedWatermarkOverlay.shadowBlur" type="range" min="0" max="20" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { shadowBlur: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.shadowBlur }}px</strong>
                </label>
              </template>

              <div class="inspector-section-title">Position</div>

              <label class="slider-field">
                <span>Placement</span>
                <select :value="selectedWatermarkOverlay.position" class="text-overlay-select" @change="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { position: $event.target.value })">
                  <option value="top-left">Top Left</option>
                  <option value="top-center">Top Center</option>
                  <option value="top-right">Top Right</option>
                  <option value="center-left">Center Left</option>
                  <option value="center">Center</option>
                  <option value="center-right">Center Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="tile">Tile (Repeat)</option>
                  <option value="custom">Custom Position</option>
                </select>
              </label>

              <div v-if="selectedWatermarkOverlay.position !== 'tile'" class="watermark-position-grid">
                <button
                  v-for="pos in ['top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right']"
                  :key="pos"
                  class="pos-grid-btn"
                  :class="{ active: selectedWatermarkOverlay.position === pos }"
                  @click="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { position: pos })"
                >
                  <span class="pos-grid-dot"></span>
                </button>
              </div>

              <template v-if="selectedWatermarkOverlay.position === 'custom'">
                <label class="slider-field">
                  <span>X</span>
                  <input :value="selectedWatermarkOverlay.customX" type="range" min="0" max="100" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { customX: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.customX }}%</strong>
                </label>
                <label class="slider-field">
                  <span>Y</span>
                  <input :value="selectedWatermarkOverlay.customY" type="range" min="0" max="100" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { customY: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.customY }}%</strong>
                </label>
              </template>

              <label v-if="selectedWatermarkOverlay.position !== 'tile'" class="slider-field">
                <span>Margin</span>
                <input :value="selectedWatermarkOverlay.margin" type="range" min="0" max="100" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { margin: Number($event.target.value) })" />
                <strong>{{ selectedWatermarkOverlay.margin }}px</strong>
              </label>

              <template v-if="selectedWatermarkOverlay.position === 'tile'">
                <label class="slider-field">
                  <span>Tile Spacing</span>
                  <input :value="selectedWatermarkOverlay.tileSpacing" type="range" min="50" max="600" step="10" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { tileSpacing: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.tileSpacing }}px</strong>
                </label>
                <label class="slider-field">
                  <span>Tile Angle</span>
                  <input :value="selectedWatermarkOverlay.tileAngle" type="range" min="-90" max="90" step="1" @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { tileAngle: Number($event.target.value) })" />
                  <strong>{{ selectedWatermarkOverlay.tileAngle }}°</strong>
                </label>
              </template>

              <div class="inspector-section-title">Timing</div>

              <label class="slider-field">
                <span>Start</span>
                <input
                  :value="selectedWatermarkOverlay.timelineStart"
                  type="range"
                  min="0"
                  :max="Math.max(0, totalTimelineDuration - selectedWatermarkOverlay.duration)"
                  step="0.1"
                  @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { timelineStart: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedWatermarkOverlay.timelineStart) }}</strong>
              </label>

              <label class="slider-field">
                <span>Duration</span>
                <input
                  :value="selectedWatermarkOverlay.duration"
                  type="range"
                  min="0.5"
                  :max="Math.max(0.5, totalTimelineDuration - selectedWatermarkOverlay.timelineStart)"
                  step="0.1"
                  @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { duration: Number($event.target.value) })"
                />
                <strong>{{ formatTime(selectedWatermarkOverlay.duration) }}</strong>
              </label>

              <label class="slider-field">
                <span>Fade In</span>
                <input
                  :value="selectedWatermarkOverlay.fadeIn"
                  type="range"
                  min="0"
                  :max="Math.min(2, selectedWatermarkOverlay.duration / 2)"
                  step="0.05"
                  @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { fadeIn: Number($event.target.value) })"
                />
                <strong>{{ selectedWatermarkOverlay.fadeIn.toFixed(2) }}s</strong>
              </label>

              <label class="slider-field">
                <span>Fade Out</span>
                <input
                  :value="selectedWatermarkOverlay.fadeOut"
                  type="range"
                  min="0"
                  :max="Math.min(2, selectedWatermarkOverlay.duration / 2)"
                  step="0.05"
                  @input="updateWatermarkOverlayById(selectedWatermarkOverlay.id, { fadeOut: Number($event.target.value) })"
                />
                <strong>{{ selectedWatermarkOverlay.fadeOut.toFixed(2) }}s</strong>
              </label>

              <div class="clip-edit-actions">
                <button class="mini-btn danger" @click="removeWatermarkOverlayById(selectedWatermarkOverlay.id)">Remove Watermark</button>
              </div>
            </div>

            <div v-else class="clip-editor-card empty-inspector-card">
              <div class="clip-editor-head">
                <div>
                  <span class="summary-label">Clip Inspector</span>
                  <strong>Select a timeline item</strong>
                </div>
              </div>
              <div class="empty-inspector-content">
                <svg class="empty-inspector-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                  <path d="M20 20l8 6-8 6V20z" fill="currentColor" opacity="0.3"/>
                </svg>
                <p class="timeline-hint">Choose a clip or audio overlay in the timeline to adjust timing, trims, transitions, repair tools, color, and audio.</p>
                <div class="empty-inspector-shortcuts">
                  <span>Space — Play source</span>
                  <span>I / O — Set In / Out</span>
                  <span>S — Split at playhead</span>
                  <span>? — All shortcuts</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <p v-if="error" class="trim-error">{{ error }}</p>
        <p v-if="successMsg" class="trim-success">{{ successMsg }}</p>
      </div>

      <!-- Close confirmation dialog -->
      <div v-if="showCloseConfirm" class="confirm-close-overlay" @click.self="dismissCloseConfirm">
        <div class="confirm-close-dialog">
          <strong>Close Video Editor?</strong>
          <p>You have unsaved work on the timeline. Any unexported changes will be lost.</p>
          <div class="confirm-close-actions">
            <button class="mini-btn" @click="downloadProjectFile(); dismissCloseConfirm()">Save Project First</button>
            <button class="mini-btn danger" @click="forceClose">Discard &amp; Close</button>
            <button class="mini-btn secondary" @click="dismissCloseConfirm">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Keyboard shortcuts panel -->
      <div v-if="showShortcutPanel" class="shortcut-panel-overlay" @click.self="showShortcutPanel = false">
        <div class="shortcut-panel">
          <div class="shortcut-panel-header">
            <strong>Keyboard Shortcuts</strong>
            <button class="close-btn" @click="showShortcutPanel = false">&times;</button>
          </div>
          <div class="shortcut-grid">
            <div class="shortcut-group">
              <h4>Playback</h4>
              <div class="shortcut-row"><kbd>Space</kbd><span>Play/Pause source</span></div>
              <div class="shortcut-row"><kbd>Shift+Space</kbd><span>Play/Pause project</span></div>
              <div class="shortcut-row"><kbd>P</kbd><span>Play/Pause project</span></div>
              <div class="shortcut-row"><kbd>J</kbd><span>Reverse / slower</span></div>
              <div class="shortcut-row"><kbd>K</kbd><span>Stop playback</span></div>
              <div class="shortcut-row"><kbd>L</kbd><span>Forward / faster</span></div>
              <div class="shortcut-row"><kbd>&larr; / &rarr;</kbd><span>Nudge 1 frame</span></div>
              <div class="shortcut-row"><kbd>Shift+&larr;/&rarr;</kbd><span>Nudge 1 second</span></div>
            </div>
            <div class="shortcut-group">
              <h4>Editing</h4>
              <div class="shortcut-row"><kbd>I</kbd><span>Set In point</span></div>
              <div class="shortcut-row"><kbd>O</kbd><span>Set Out point</span></div>
              <div class="shortcut-row"><kbd>S</kbd><span>Split at playhead</span></div>
              <div class="shortcut-row"><kbd>Delete</kbd><span>Ripple delete</span></div>
              <div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
              <div class="shortcut-row"><kbd>Ctrl+Shift+Z</kbd><span>Redo</span></div>
              <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>Copy attributes</span></div>
              <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>Paste attributes</span></div>
            </div>
            <div class="shortcut-group">
              <h4>Project</h4>
              <div class="shortcut-row"><kbd>Ctrl+S</kbd><span>Export / Save</span></div>
              <div class="shortcut-row"><kbd>N</kbd><span>Toggle snap</span></div>
              <div class="shortcut-row"><kbd>?</kbd><span>This panel</span></div>
              <div class="shortcut-row"><kbd>Esc</kbd><span>Exit fullscreen / Close shortcuts</span></div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="saving" class="save-progress-overlay" aria-live="polite" aria-busy="true">
        <div class="save-progress-dialog">
          <div class="save-progress-spinner"></div>
          <strong>Saving Video Edit...</strong>
          <p v-if="exportProgress >= 0">Export in progress: {{ exportProgress }}%</p>
          <p v-else>Preparing timeline and starting export...</p>
          <div class="save-progress-bar">
            <div class="save-progress-fill" :style="{ width: `${Math.max(2, exportProgress >= 0 ? exportProgress : 12)}%` }"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const DRAFT_CLIP_ID = 'draft-clip'
const PREVIEW_PRELOAD_LEAD = 0.35

const props = defineProps({
  videoPath: { type: String, default: '' },
  initialVideoPaths: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

function getVideoEditorBridge() {
  if (window?.plutoVideoEditorBridge) return window.plutoVideoEditorBridge
  if (window?.electron?.ipcRenderer) {
    return {
      composeVideo(payload) {
        return window.electron.ipcRenderer.invoke('compose-video', payload)
      },
      getVideoClipThumbnail(payload) {
        return window.electron.ipcRenderer.invoke('get-video-clip-thumbnail', payload)
      },
      selectVideoFiles() {
        return window.electron.ipcRenderer.invoke('select-video-files')
      },
      selectAudioFiles() {
        return window.electron.ipcRenderer.invoke('select-audio-files')
      },
      selectWatermarkImage() {
        return window.electron.ipcRenderer.invoke('select-watermark-image')
      },
      selectLutFile() {
        return window.electron.ipcRenderer.invoke('select-lut-file')
      },
      getBuiltinLuts() {
        return window.electron.ipcRenderer.invoke('get-builtin-luts')
      },
      toMediaUrl(filePath) {
        if (!filePath) return ''
        return filePath.startsWith('pluto://') ? filePath : `pluto://${filePath}`
      },
    }
  }
  throw new Error('Video editor bridge is not available.')
}

const videoEditorBridge = getVideoEditorBridge()

let nextSourceId = 1
let nextClipId = 1
let nextAudioOverlayId = 1
let trimDragMode = null
let transitionDragState = null
let audioOverlayDragState = null
let previewRenderDebounce = 0
const previewRenderCache = new Map()

const trimmerPanelEl = ref(null)
const sourceVideoEl = ref(null)
const previewVideoEl = ref(null)
const previewOverlayEl = ref(null)
const projectPreviewEl = ref(null)
const previewStageEl = ref(null)
const chromakeyCanvasEl = ref(null)
let chromakeyAnimFrame = null
const previewNatWidth = ref(0)
const previewNatHeight = ref(0)
const previewStageWidth = ref(0)
const previewStageHeight = ref(0)
const timelineEl = ref(null)
const rulerTrackEl = ref(null)
const timelineRulerScrollEl = ref(null)
const timelineLaneScrollEl = ref(null)
const sourceVideos = ref([])
const selectedSourceId = ref(null)
const draftRanges = ref({})
const clips = ref([])
const audioOverlays = ref([])
const selectedClipId = ref(null)
const selectedAudioOverlayId = ref(null)
const transitionFocusClipId = ref(null)
const dragClipId = ref(null)
const duration = ref(0)
const currentTime = ref(0)
const sourcePlaying = ref(false)
const trimStart = ref(0)
const trimEnd = ref(0)
const sourceRotation = ref(0)
const sourceVideoWidth = ref(0)
const sourceVideoHeight = ref(0)
const timelinePreviewActive = ref(false)
const timelinePreviewProjectTime = ref(0)
const timelinePreviewClipId = ref(null)
const previewPlaying = ref(false)
const previewRendering = ref(false)
const projectPreviewPath = ref('')
const projectPreviewNeedsRender = ref(true)
const previewPlaybackMode = ref('live')
const previewBaseSrc = ref('')
const previewOverlaySrc = ref('')
const previewBaseStyle = ref({ opacity: '0' })
const previewOverlayStyle = ref({ opacity: '0' })
const previewBaseTargetTime = ref(0)
const previewOverlayTargetTime = ref(0)
let previewLayersSwapped = false
const saving = ref(false)
const exportProgress = ref(-1)
const error = ref('')
const successMsg = ref('')
const exportPreset = ref('source')
const timelineZoom = ref(1)
let timelineScrollSyncSource = null
let previewRenderToken = 0
let previewRenderPromise = null
let previewRenderPromiseKey = ''
let previewPlaybackToken = 0
let previewUnmounted = false

let previewPlaybackFrame = 0
let previewPlaybackStartedAt = 0
let previewPlaybackStartedProjectTime = 0

const undoStack = ref([])
const redoStack = ref([])
const MAX_UNDO = 50
const inspectorCollapsed = ref({})
const inspectorTab = ref('timing')
const showShortcutPanel = ref(false)
const activeHeaderMenu = ref(null)
const fileMenuEl = ref(null)
const editMenuEl = ref(null)
const clipboardAttrs = ref(null)
const snapEnabled = ref(true)
const sourceCollapsed = ref(false)
const previewFullscreen = ref(false)
const inspectorOpen = ref(true)
const SNAP_THRESHOLD_PX = 8
const sourcePlaybackRate = ref(1)
let timelineScrubState = null
let rippleTrimState = null
let nextTextOverlayId = 1
let nextWatermarkOverlayId = 1
const textOverlays = ref([])
const watermarkOverlays = ref([])
const selectedTextOverlayId = ref(null)
const selectedWatermarkOverlayId = ref(null)
let watermarkOverlayDragState = null
let watermarkOverlayResizeState = null
let textOverlayResizeState = null

function makeWatermarkOverlay(overrides = {}) {
  return {
    id: `watermark-${nextWatermarkOverlayId++}`,
    mode: 'text',
    text: 'Watermark',
    imagePath: '',
    fontFamily: 'sans-serif',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    opacity: 0.3,
    position: 'bottom-right',
    customX: 90,
    customY: 90,
    scale: 200,
    rotation: 0,
    margin: 30,
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 4,
    tileSpacing: 200,
    tileAngle: -30,
    timelineStart: 0,
    duration: 3,
    fadeIn: 0.2,
    fadeOut: 0.2,
    ...overrides,
  }
}

const transitionOptions = [
  { value: 'fade', label: 'Dissolve' },
  { value: 'fadeblack', label: 'Dip to Black' },
  { value: 'fadewhite', label: 'Dip to White' },
  { value: 'wipeleft', label: 'Wipe Left' },
  { value: 'wiperight', label: 'Wipe Right' },
  { value: 'wipeup', label: 'Wipe Up' },
  { value: 'wipedown', label: 'Wipe Down' },
  { value: 'slideleft', label: 'Slide Left' },
  { value: 'slideright', label: 'Slide Right' },
  { value: 'slideup', label: 'Slide Up' },
  { value: 'slidedown', label: 'Slide Down' },
  { value: 'circlecrop', label: 'Circle Crop' },
  { value: 'circleopen', label: 'Circle Open' },
  { value: 'circleclose', label: 'Circle Close' },
  { value: 'vertopen', label: 'Vertical Open' },
  { value: 'vertclose', label: 'Vertical Close' },
  { value: 'horzopen', label: 'Horizontal Open' },
  { value: 'horzclose', label: 'Horizontal Close' },
  { value: 'dissolve', label: 'Dissolve (Dither)' },
  { value: 'pixelize', label: 'Pixelize' },
  { value: 'radial', label: 'Radial Wipe' },
  { value: 'zoomin', label: 'Zoom In' },
]

const audioTransitionOptions = [
  { value: 'tri', label: 'Balanced' },
  { value: 'qsin', label: 'Smooth' },
  { value: 'hsin', label: 'Soft' },
  { value: 'exp', label: 'Sharp' },
]

const stabilizationModeOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'rolling', label: 'Rolling Shutter Safe' },
]

const builtinLuts = ref([])

async function loadBuiltinLuts() {
  try {
    builtinLuts.value = await videoEditorBridge.getBuiltinLuts()
  } catch { builtinLuts.value = [] }
}

async function applyLutPreset(lutFile) {
  if (!selectedClip.value) return
  if (lutFile === '__custom__') {
    try {
      const result = await videoEditorBridge.selectLutFile()
      if (result?.path) {
        updateClipById(selectedClip.value.id, { lutName: '__custom__', lutPath: result.path })
      }
    } catch { /* user cancelled */ }
    return
  }
  if (!lutFile) {
    updateClipById(selectedClip.value.id, { lutName: '', lutPath: '' })
    return
  }
  const lut = builtinLuts.value.find(l => l.file === lutFile)
  if (lut) updateClipById(selectedClip.value.id, { lutName: lut.file, lutPath: lut.path })
}

function applyEffectsPreset(presetKey) {
  if (!selectedClip.value) return
  const presets = {
    trailer: { letterbox: 70, vignette: 35, grain: 15, blur: 0, chromakeyColor: '', chromakeyTolerance: 30 },
    dreamy: { letterbox: 0, vignette: 20, grain: 0, blur: 30, chromakeyColor: '', chromakeyTolerance: 30 },
    retro: { letterbox: 0, vignette: 50, grain: 45, blur: 0, chromakeyColor: '', chromakeyTolerance: 30 },
    reset: { letterbox: 0, vignette: 0, grain: 0, blur: 0, lutName: '', lutPath: '', chromakeyColor: '', chromakeyTolerance: 30 },
  }
  if (presets[presetKey]) updateClipById(selectedClip.value.id, presets[presetKey])
}

const fixPresetMap = {
  dialogue: {
    audioDenoise: 52,
    speechFocus: true,
    loudnessNormalize: true,
    peakLimiter: true,
    stabilize: 0,
    stabilizeMode: 'standard',
    wobbleRepair: 0,
    temperature: 0,
    wobbleCrop: 0,
    tint: 0,
    videoDenoise: 10,
    clarity: 6,
    exposure: 0,
    contrast: 104,
    saturation: 96,
  },
  lowLight: {
    exposure: 18,
    contrast: 112,
    saturation: 114,
    temperature: 12,
    tint: 4,
    stabilize: 12,
    stabilizeMode: 'rolling',
    wobbleRepair: 24,
    loudnessNormalize: true,
    peakLimiter: true,
    videoDenoise: 36,
    clarity: 18,
    audioDenoise: 18,
    speechFocus: false,
  },
  mobile: {
    exposure: 8,
    contrast: 109,
    saturation: 108,
    temperature: 4,
    tint: 0,
    stabilize: 34,
    stabilizeMode: 'rolling',
    wobbleRepair: 42,
    wobbleCrop: 8,
    loudnessNormalize: true,
    peakLimiter: true,
    videoDenoise: 30,
    clarity: 20,
    audioDenoise: 28,
    speechFocus: true,
  },
  reset: {
    exposure: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    stabilize: 0,
    stabilizeMode: 'standard',
    wobbleRepair: 0,
    wobbleCrop: 0,
    loudnessNormalize: false,
    peakLimiter: false,
    clarity: 0,
    videoDenoise: 0,
    audioDenoise: 0,
    speechFocus: false,
    letterbox: 0,
    vignette: 0,
    grain: 0,
    blur: 0,
    lutName: '',
    lutPath: '',
    chromakeyColor: '',
    chromakeyTolerance: 30,
  },
}

const normalizeRawPath = (filePath) => String(filePath || '').replace(/^pluto:\/\//i, '')

const selectedSource = computed(() => sourceVideos.value.find((source) => source.id === selectedSourceId.value) || null)
const selectedClipIndex = computed(() => clips.value.findIndex((clip) => clip.id === selectedClipId.value))
const selectedClip = computed(() => clips.value[selectedClipIndex.value] || null)
const selectedClipNext = computed(() => selectedClipIndex.value >= 0 ? clips.value[selectedClipIndex.value + 1] || null : null)
const selectedAudioOverlayIndex = computed(() => audioOverlays.value.findIndex((overlay) => overlay.id === selectedAudioOverlayId.value))
const selectedAudioOverlay = computed(() => audioOverlays.value[selectedAudioOverlayIndex.value] || null)
const selectedTextOverlayIndex = computed(() => textOverlays.value.findIndex((t) => t.id === selectedTextOverlayId.value))
const selectedTextOverlay = computed(() => textOverlays.value[selectedTextOverlayIndex.value] || null)
const selectedWatermarkOverlayIndex = computed(() => watermarkOverlays.value.findIndex((w) => w.id === selectedWatermarkOverlayId.value))
const selectedWatermarkOverlay = computed(() => watermarkOverlays.value[selectedWatermarkOverlayIndex.value] || null)
const isTransitionFocus = computed(() => !!selectedClip.value && transitionFocusClipId.value === selectedClip.value.id)
const activeSelectionDuration = computed(() => Math.max(0, trimEnd.value - trimStart.value))
const hasTimelineClips = computed(() => clips.value.length > 0)
const canAddClip = computed(() => !!selectedSource.value && activeSelectionDuration.value > 0.05)
const canExport = computed(() => exportClips.value.length > 0)
const hasFreshProjectPreview = computed(() => !!projectPreviewSrc.value && !projectPreviewNeedsRender.value && !previewRendering.value)
const canSplitSelectedClip = computed(() => {
  if (!selectedClip.value || selectedSourceId.value !== selectedClip.value.sourceId) return false
  return currentTime.value > selectedClip.value.startTime + 0.05 && currentTime.value < selectedClip.value.endTime - 0.05
})

const sourceVideoSrc = computed(() => {
  if (!selectedSource.value?.path) return ''
  return videoEditorBridge.toMediaUrl(selectedSource.value.path)
})

const projectPreviewSrc = computed(() => {
  if (!projectPreviewPath.value) return ''
  return videoEditorBridge.toMediaUrl(projectPreviewPath.value)
})
const showRenderedProjectPreview = computed(() => previewPlaybackMode.value === 'rendered' && !!projectPreviewSrc.value)

const overlayContainerStyle = computed(() => {
  const natW = previewNatWidth.value
  const natH = previewNatHeight.value
  const stageW = previewStageWidth.value
  const stageH = previewStageHeight.value
  if (!natW || !natH || !stageW || !stageH) {
    return { position: 'absolute', inset: '0', pointerEvents: 'none' }
  }
  const videoAspect = natW / natH
  const stageAspect = stageW / stageH
  let renderW, renderH
  if (videoAspect > stageAspect) {
    renderW = stageW
    renderH = stageW / videoAspect
  } else {
    renderH = stageH
    renderW = stageH * videoAspect
  }
  const offsetX = (stageW - renderW) / 2
  const offsetY = (stageH - renderH) / 2
  return {
    position: 'absolute',
    left: `${offsetX}px`,
    top: `${offsetY}px`,
    width: `${renderW}px`,
    height: `${renderH}px`,
    pointerEvents: 'none',
    overflow: 'hidden',
  }
})

const overlayRenderWidth = computed(() => {
  const natW = previewNatWidth.value
  const natH = previewNatHeight.value
  const stageW = previewStageWidth.value
  const stageH = previewStageHeight.value
  if (!natW || !natH || !stageW || !stageH) return 0
  const videoAspect = natW / natH
  return (videoAspect > stageW / stageH) ? stageW : stageH * videoAspect
})

const overlayRenderHeight = computed(() => {
  const natW = previewNatWidth.value
  const natH = previewNatHeight.value
  const stageW = previewStageWidth.value
  const stageH = previewStageHeight.value
  if (!natW || !natH || !stageW || !stageH) return 0
  const videoAspect = natW / natH
  return (videoAspect > stageW / stageH) ? stageW / videoAspect : stageH
})

const overlayFontScale = computed(() => {
  const natW = previewNatWidth.value
  if (!natW || !overlayRenderWidth.value) return 1
  return overlayRenderWidth.value / natW
})

const timelineTrackStyle = computed(() => ({
  width: `${timelineZoom.value * 100}%`,
}))
const timelineZoomLabel = computed(() => `${Math.round(timelineZoom.value * 100)}%`)
const audioOverlayCountLabel = computed(() => `${audioOverlays.value.length} audio overlay${audioOverlays.value.length === 1 ? '' : 's'}`)
const inspectorTitle = computed(() => {
  if (selectedClip.value) return `Properties — ${selectedClip.value.sourceName}`
  if (selectedAudioOverlay.value) return `Properties — ${selectedAudioOverlay.value.name}`
  if (selectedTextOverlay.value) return `Properties — ${selectedTextOverlay.value.text || 'Text Overlay'}`
  if (selectedWatermarkOverlay.value) return 'Properties — Watermark Overlay'
  return 'Properties'
})

const startPct = computed(() => duration.value > 0 ? (trimStart.value / duration.value) * 100 : 0)
const endPct = computed(() => duration.value > 0 ? (trimEnd.value / duration.value) * 100 : 100)
const playheadPct = computed(() => duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0)
const sourceRotationLabel = computed(() => `Rotation ${sourceRotation.value}°`)
const isQuarterTurnRotation = computed(() => sourceRotation.value % 180 !== 0)
const sourceRotationScale = computed(() => {
  if (!isQuarterTurnRotation.value) return 1
  if (!sourceVideoWidth.value || !sourceVideoHeight.value) return 0.56
  return Math.min(1, sourceVideoHeight.value / sourceVideoWidth.value)
})
const sourceVideoStyle = computed(() => {
  const quarterTurn = isQuarterTurnRotation.value
  return {
    transform: sourceRotation.value
      ? `rotate(${sourceRotation.value}deg) scale(${sourceRotationScale.value})`
      : 'none',
    transformOrigin: 'center center',
    width: quarterTurn ? 'auto' : '100%',
    maxWidth: '100%',
    height: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  }
})

const exportClips = computed(() => {
  if (clips.value.length) return clips.value
  if (!selectedSource.value || activeSelectionDuration.value <= 0.05) return []
  return [{
    id: DRAFT_CLIP_ID,
    sourceId: selectedSource.value.id,
    sourceName: selectedSource.value.name,
    inputPath: selectedSource.value.path,
    startTime: trimStart.value,
    endTime: trimEnd.value,
    duration: activeSelectionDuration.value,
    fadeIn: 0,
    fadeOut: 0,
    transitionDuration: 0,
    transitionType: 'fade',
    audioTransitionCurve: 'tri',
    volume: 1,
    muted: false,
    exposure: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    stabilize: 0,
    stabilizeMode: 'standard',
    wobbleRepair: 0,
    clarity: 0,
    wobbleCrop: 0,
    videoDenoise: 0,
    audioDenoise: 0,
    speechFocus: false,
    loudnessNormalize: false,
    peakLimiter: false,
    rotation: sourceRotation.value,
    speed: 1,
    scale: 100,
    posX: 0,
    posY: 0,
  }]
})

const timelineTrackLayout = computed(() => {
  if (!exportClips.value.length) return []

  let cursor = 0
  const base = exportClips.value.map((clip, index) => {
    const nextClip = exportClips.value[index + 1] || null
    const speed = Math.max(0.25, Math.min(4, Number(clip.speed) || 1))
    const effectiveDuration = clip.duration / speed
    const nextEffDur = nextClip ? nextClip.duration / Math.max(0.25, Math.min(4, Number(nextClip.speed) || 1)) : 0
    const transitionDuration = nextClip
      ? clampTransitionDuration(clip.transitionDuration, effectiveDuration, nextEffDur)
      : 0

    const segment = {
      ...clip,
      index,
      effectiveDuration,
      timelineStart: cursor,
      transitionDuration,
      left: 0,
      width: 0,
    }

    cursor += effectiveDuration - transitionDuration
    return segment
  })

  const total = cursor || 1
  return base.map((segment, index) => ({
    displayDuration: Math.max(0.05, segment.effectiveDuration - segment.transitionDuration),
    ...segment,
    incomingTransitionDuration: index > 0 ? base[index - 1].transitionDuration : 0,
    left: (segment.timelineStart / total) * 100,
    width: Math.max((segment.effectiveDuration / total) * 100, 4),
    displayWidth: Math.max((Math.max(0.05, segment.effectiveDuration - segment.transitionDuration) / total) * 100, 2),
  }))
})

const totalTimelineDuration = computed(() => {
  if (!timelineTrackLayout.value.length) return 0
  const last = timelineTrackLayout.value[timelineTrackLayout.value.length - 1]
  return last.timelineStart + last.effectiveDuration
})

const audioOverlayLayout = computed(() => {
  const total = Math.max(totalTimelineDuration.value, 0.1)
  return audioOverlays.value
    .map((overlay, index) => {
      const durationValue = Math.max(0.05, overlay.trimEnd - overlay.trimStart)
      const clampedTimelineStart = Math.max(0, Math.min(overlay.timelineStart, Math.max(0, totalTimelineDuration.value - durationValue)))
      const effectiveDuration = Math.max(0.05, Math.min(durationValue, Math.max(0.05, totalTimelineDuration.value - clampedTimelineStart)))
      return {
        ...overlay,
        index,
        duration: durationValue,
        effectiveDuration,
        left: (clampedTimelineStart / total) * 100,
        width: Math.max((effectiveDuration / total) * 100, 8),
      }
    })
    .filter((overlay) => overlay.effectiveDuration > 0.04)
})

function assignOverlayRows(items) {
  const rowEnds = []
  for (const item of items) {
    let placed = false
    for (let r = 0; r < rowEnds.length; r++) {
      if (item.left >= rowEnds[r]) {
        rowEnds[r] = item.left + item.width
        item.row = r
        placed = true
        break
      }
    }
    if (!placed) {
      item.row = rowEnds.length
      rowEnds.push(item.left + item.width)
    }
  }
  return items
}

const textOverlayLayout = computed(() => {
  const total = Math.max(totalTimelineDuration.value, 0.1)
  const items = textOverlays.value.map((overlay, index) => {
    const dur = Math.max(0.5, Number(overlay.duration) || 3)
    const start = Math.max(0, Math.min(Number(overlay.timelineStart) || 0, Math.max(0, total - dur)))
    return {
      ...overlay,
      index,
      effectiveDuration: dur,
      left: (start / total) * 100,
      width: Math.max((dur / total) * 100, 4),
      row: 0,
    }
  })
  return assignOverlayRows(items)
})

const textOverlayRowCount = computed(() => {
  const layout = textOverlayLayout.value
  if (!layout.length) return 0
  return Math.max(...layout.map(o => o.row)) + 1
})

const watermarkOverlayRowCount = computed(() => {
  const layout = watermarkOverlayLayout.value
  if (!layout.length) return 0
  return Math.max(...layout.map(o => o.row)) + 1
})

const visibleTextOverlays = computed(() => {
  const t = timelinePreviewProjectTime.value
  const selectedId = selectedTextOverlayId.value
  return textOverlays.value.filter((o) => {
    // Always show the selected overlay so property edits are immediately visible
    if (o.id === selectedId) return true
    const start = Number(o.timelineStart) || 0
    const end = start + (Number(o.duration) || 3)
    return t >= start && t < end
  }).map((o) => {
    const start = Number(o.timelineStart) || 0
    const dur = Number(o.duration) || 3
    const elapsed = timelinePreviewProjectTime.value - start
    const fadeIn = Number(o.fadeIn) || 0
    const fadeOut = Number(o.fadeOut) || 0
    let opacity = 1
    if (previewPlaying.value) {
      if (fadeIn > 0 && elapsed < fadeIn) opacity = Math.min(1, elapsed / fadeIn)
      if (fadeOut > 0 && (dur - elapsed) < fadeOut) opacity = Math.min(opacity, (dur - elapsed) / fadeOut)
    }
    return { ...o, computedOpacity: Math.max(0, Math.min(1, opacity)) }
  })
})

const watermarkOverlayLayout = computed(() => {
  const total = Math.max(totalTimelineDuration.value, 0.1)
  const items = watermarkOverlays.value.map((overlay, index) => {
    const dur = Math.max(0.5, Number(overlay.duration) || 3)
    const start = Math.max(0, Math.min(Number(overlay.timelineStart) || 0, Math.max(0, total - dur)))
    return {
      ...overlay,
      index,
      effectiveDuration: dur,
      left: (start / total) * 100,
      width: Math.max((dur / total) * 100, 4),
      row: 0,
    }
  })
  return assignOverlayRows(items)
})

const visibleWatermarkOverlays = computed(() => {
  const t = timelinePreviewProjectTime.value
  const selectedId = selectedWatermarkOverlayId.value
  return watermarkOverlays.value.filter((o) => {
    // Always show the selected overlay so property edits are immediately visible
    if (o.id === selectedId) return true
    const start = Number(o.timelineStart) || 0
    const end = start + (Number(o.duration) || 3)
    return t >= start && t < end
  }).map((o) => {
    const start = Number(o.timelineStart) || 0
    const dur = Number(o.duration) || 3
    const elapsed = timelinePreviewProjectTime.value - start
    const fadeIn = Number(o.fadeIn) || 0
    const fadeOut = Number(o.fadeOut) || 0
    let opacity = Math.max(0.05, Math.min(1, Number(o.opacity) || 0.3))
    if (previewPlaying.value) {
      if (fadeIn > 0 && elapsed < fadeIn) opacity *= Math.min(1, elapsed / fadeIn)
      if (fadeOut > 0 && (dur - elapsed) < fadeOut) opacity *= Math.min(1, (dur - elapsed) / fadeOut)
    }
    return { ...o, computedOpacity: Math.max(0, Math.min(1, opacity)) }
  })
})

function watermarkPreviewStyleFor(wm) {
  if (!wm) return null
  const fs = overlayFontScale.value
  const m = ((wm.margin || 0) * fs).toFixed(1)
  const posMap = {
    'top-left': { top: `${m}px`, left: `${m}px` },
    'top-center': { top: `${m}px`, left: '50%', transform: 'translateX(-50%)' },
    'top-right': { top: `${m}px`, right: `${m}px` },
    'center-left': { top: '50%', left: `${m}px`, transform: 'translateY(-50%)' },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    'center-right': { top: '50%', right: `${m}px`, transform: 'translateY(-50%)' },
    'bottom-left': { bottom: `${m}px`, left: `${m}px` },
    'bottom-center': { bottom: `${m}px`, left: '50%', transform: 'translateX(-50%)' },
    'bottom-right': { bottom: `${m}px`, right: `${m}px` },
    'custom': { top: `${wm.customY}%`, left: `${wm.customX}%`, transform: 'translate(-50%, -50%)' },
  }
  const base = posMap[wm.position] || posMap['bottom-right']
  const style = { position: 'absolute', pointerEvents: 'auto', cursor: 'pointer', zIndex: 11, opacity: wm.computedOpacity, ...base }
  if (wm.rotation) {
    const existing = style.transform || ''
    style.transform = `${existing} rotate(${wm.rotation}deg)`.trim()
  }
  if (wm.mode === 'text') {
    style.fontFamily = wm.fontFamily || 'sans-serif'
    style.fontSize = `${Math.max(8, (wm.fontSize || 24) * fs).toFixed(1)}px`
    style.fontWeight = wm.fontWeight || 'bold'
    style.color = wm.color || '#ffffff'
    style.whiteSpace = 'nowrap'
    if (wm.shadow) {
      style.textShadow = `0 ${(2 * fs).toFixed(1)}px ${((wm.shadowBlur || 4) * fs).toFixed(1)}px ${wm.shadowColor || '#000000'}, 0 0 ${(2 * fs).toFixed(1)}px ${wm.shadowColor || '#000000'}`
    }
  }
  if (wm.mode === 'image' && wm.shadow) {
    style.filter = `drop-shadow(0 ${(2 * fs).toFixed(1)}px ${((wm.shadowBlur || 4) * fs).toFixed(1)}px ${wm.shadowColor || '#000000'})`
  }
  return style
}

const watermarkTileCache = computed(() => {
  const fs = overlayFontScale.value
  const containerW = overlayRenderWidth.value || 2000
  const containerH = overlayRenderHeight.value || 1200
  const map = new Map()
  for (const wm of watermarkOverlays.value) {
    if (!wm || wm.position !== 'tile') continue
    const spacing = Math.max(60, (wm.tileSpacing || 200) * fs)
    const angle = Number(wm.tileAngle || -30)
    const angleRad = (Math.PI / 180) * angle
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const cols = Math.max(3, Math.ceil((containerW * 2) / spacing))
    const rows = Math.max(3, Math.ceil((containerH * 2) / spacing))
    const halfW = containerW * 0.5
    const halfH = containerH * 0.5
    const items = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const baseX = -halfW + c * spacing
        const baseY = -halfH + r * spacing
        const x = Math.round(baseX * cosA - baseY * sinA) + halfW
        const y = Math.round(baseX * sinA + baseY * cosA) + halfH
        if (x < -spacing || x > containerW + spacing || y < -spacing || y > containerH + spacing) continue
        items.push({ x, y, key: `${c}-${r}` })
      }
    }
    map.set(wm.id, items)
  }
  return map
})

function watermarkTileItemsFor(wm) {
  if (!wm || wm.position !== 'tile') return []
  return watermarkTileCache.value.get(wm.id) || []
}

const timelineMarkers = computed(() => {
  const total = totalTimelineDuration.value
  if (total <= 0) return []
  const interval = total <= 30 ? 5 : total <= 90 ? 10 : total <= 300 ? 30 : 60
  const markers = []
  for (let time = 0; time <= total + 0.001; time += interval) {
    markers.push({ time, left: (time / total) * 100 })
  }
  if (markers[markers.length - 1]?.time !== total) {
    markers.push({ time: total, left: 100 })
  }
  return markers
})

const transitionHandles = computed(() => timelineTrackLayout.value
  .filter((_, index) => index < timelineTrackLayout.value.length - 1)
  .map((segment, index) => ({
    id: segment.id,
    index,
    left: timelineTrackLayout.value[index + 1].left,
    transitionType: segment.transitionType,
  })))

const selectedClipFadeCap = computed(() => Math.max(0, ((selectedClip.value?.duration || 0) / 2) - 0.05))
const selectedClipTransitionCap = computed(() => {
  if (!selectedClip.value || !selectedClipNext.value) return 0
  return clampTransitionDuration(0, selectedClip.value.duration, selectedClipNext.value.duration, true)
})
const timelinePreviewClipIndex = computed(() => clips.value.findIndex((clip) => clip.id === timelinePreviewClipId.value))

const previewEffectsClip = computed(() => {
  const id = timelinePreviewClipId.value
  if (!id) return clips.value[0] || null
  return clips.value.find((c) => c.id === id) || clips.value[0] || null
})

const previewChromakeyActive = computed(() => {
  const clip = previewEffectsClip.value
  return !!(clip && clip.chromakeyColor && !showRenderedProjectPreview.value)
})

const previewPrimaryStyle = computed(() => previewLayersSwapped ? previewOverlayStyle.value : previewBaseStyle.value)

function drawChromakeyPreview() {
  const canvas = chromakeyCanvasEl.value
  const video = previewLayersSwapped ? previewOverlayEl.value : previewVideoEl.value
  const clip = previewEffectsClip.value
  if (!canvas || !video || !clip?.chromakeyColor || video.readyState < 2) return
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const vw = video.videoWidth || 640
  const vh = video.videoHeight || 360
  // Match the video's rendered content area within the container (object-fit: contain)
  const cw = canvas.clientWidth || vw
  const ch = canvas.clientHeight || vh
  const videoAspect = vw / vh
  const containerAspect = cw / ch
  let drawW, drawH, drawX, drawY
  if (videoAspect > containerAspect) {
    drawW = cw
    drawH = Math.round(cw / videoAspect)
    drawX = 0
    drawY = Math.round((ch - drawH) / 2)
  } else {
    drawH = ch
    drawW = Math.round(ch * videoAspect)
    drawX = Math.round((cw - drawW) / 2)
    drawY = 0
  }
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw
    canvas.height = ch
  }
  ctx.clearRect(0, 0, cw, ch)
  ctx.drawImage(video, drawX, drawY, drawW, drawH)
  const imgData = ctx.getImageData(drawX, drawY, drawW, drawH)
  const d = imgData.data
  const hex = clip.chromakeyColor.replace('#', '')
  const tR = parseInt(hex.substring(0, 2), 16)
  const tG = parseInt(hex.substring(2, 4), 16)
  const tB = parseInt(hex.substring(4, 6), 16)
  const tol = (clip.chromakeyTolerance || 30) / 100
  const maxDist = 441.67 // sqrt(255^2 * 3)
  const threshold = tol * maxDist * 0.5 + 22
  const blendRange = threshold * 0.4
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - tR
    const dg = d[i + 1] - tG
    const db = d[i + 2] - tB
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    if (dist < threshold - blendRange) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0
    } else if (dist < threshold) {
      const mix = (dist - (threshold - blendRange)) / blendRange
      d[i] = Math.round(d[i] * mix)
      d[i + 1] = Math.round(d[i + 1] * mix)
      d[i + 2] = Math.round(d[i + 2] * mix)
    }
  }
  ctx.putImageData(imgData, drawX, drawY)
}

function scheduleChromakeyDraw() {
  if (!previewChromakeyActive.value) return
  if (chromakeyAnimFrame) cancelAnimationFrame(chromakeyAnimFrame)
  chromakeyAnimFrame = requestAnimationFrame(() => {
    drawChromakeyPreview()
    chromakeyAnimFrame = null
  })
}

function formatTime(secs, precise = false) {
  const safe = Math.max(0, Number(secs) || 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const frames = Math.floor((safe % 1) * 30)
  const frameSuffix = precise ? `.${String(frames).padStart(2, '0')}` : ''
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${frameSuffix}`
  return `${minutes}:${String(seconds).padStart(2, '0')}${frameSuffix}`
}

function formatTimePrecise(secs) {
  return formatTime(secs, true)
}

function formatTransitionLabel(type) {
  return transitionOptions.find((option) => option.value === type)?.label || 'Dissolve'
}

function formatAudioTransitionLabel(curve) {
  return audioTransitionOptions.find((option) => option.value === curve)?.label || 'Balanced'
}

function transitionClassName(type) {
  return `transition-${type || 'fade'}`
}

function clampTransitionDuration(value, clipDuration, nextClipDuration, returnCapOnly = false) {
  const cap = Math.max(0, Math.min(Number(clipDuration) || 0, Number(nextClipDuration) || 0) - 0.05)
  return returnCapOnly ? cap : Math.min(Math.max(0, Number(value) || 0), cap)
}

function rememberSelection() {
  if (!selectedSource.value) return
  draftRanges.value = {
    ...draftRanges.value,
    [selectedSource.value.id]: {
      start: trimStart.value,
      end: trimEnd.value,
      current: currentTime.value,
      rotation: sourceRotation.value,
    },
  }
}

function normalizeRotation(value) {
  const numeric = Number(value) || 0
  const snapped = Math.round(numeric / 90) * 90
  return ((snapped % 360) + 360) % 360
}

function buildMediaSrc(filePath) {
  if (!filePath) return ''
  return videoEditorBridge.toMediaUrl(filePath)
}

function buildWatermarkPreviewSrc(filePath) {
  const normalizedPath = normalizeRawPath(filePath)
  return normalizedPath ? buildMediaSrc(normalizedPath) : ''
}

function loadMediaDuration(filePath) {
  return new Promise((resolve) => {
    const media = document.createElement('audio')
    const finalize = (value) => {
      media.removeAttribute('src')
      media.load()
      resolve(Math.max(0, Number(value) || 0))
    }
    media.preload = 'metadata'
    media.src = buildMediaSrc(filePath)
    media.addEventListener('loadedmetadata', () => finalize(media.duration), { once: true })
    media.addEventListener('error', () => finalize(0), { once: true })
  })
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function normalizeAudioOverlaySequence(sequence) {
  const projectDuration = Math.max(0, totalTimelineDuration.value)
  return sequence.map((overlay) => {
    const sourceDuration = Math.max(0.05, Number(overlay.sourceDuration) || 0.05)
    const trimStart = Math.max(0, Math.min(Number(overlay.trimStart) || 0, Math.max(0, sourceDuration - 0.05)))
    const trimEnd = Math.max(trimStart + 0.05, Math.min(Number(overlay.trimEnd) || sourceDuration, sourceDuration))
    const durationValue = trimEnd - trimStart
    const timelineStart = Math.max(0, Math.min(Number(overlay.timelineStart) || 0, Math.max(0, projectDuration - durationValue)))
    return {
      ...overlay,
      sourceDuration,
      trimStart,
      trimEnd,
      timelineStart,
      volume: Math.min(2, Math.max(0, Number(overlay.volume) || 1)),
      muted: !!overlay.muted,
    }
  })
}

function setAudioOverlaysNormalized(sequence) {
  pushUndo()
  invalidateProjectPreview()
  audioOverlays.value = normalizeAudioOverlaySequence(sequence)
}

function updateAudioOverlayById(overlayId, updater) {
  const overlayIndex = audioOverlays.value.findIndex((overlay) => overlay.id === overlayId)
  if (overlayIndex < 0) return null

  invalidateProjectPreview()
  const currentOverlay = audioOverlays.value[overlayIndex]
  const candidate = typeof updater === 'function' ? updater(currentOverlay) : { ...currentOverlay, ...updater }
  const nextOverlays = [...audioOverlays.value]
  nextOverlays.splice(overlayIndex, 1, candidate)
  const normalized = normalizeAudioOverlaySequence(nextOverlays)
  audioOverlays.value = normalized
  return normalized[overlayIndex] || null
}

function buildComposePayload() {
  return exportClips.value.map((clip) => ({
    inputPath: normalizeRawPath(clip.inputPath),
    startTime: clip.startTime,
    endTime: clip.endTime,
    fadeIn: clip.fadeIn || 0,
    fadeOut: clip.fadeOut || 0,
    transitionDuration: clip.transitionDuration || 0,
    transitionType: clip.transitionType || 'fade',
    audioTransitionCurve: clip.audioTransitionCurve || 'tri',
    volume: clip.volume ?? 1,
    muted: !!clip.muted,
    exposure: clip.exposure ?? 0,
    contrast: clip.contrast ?? 100,
    saturation: clip.saturation ?? 100,
    temperature: clip.temperature ?? 0,
    tint: clip.tint ?? 0,
    stabilize: clip.stabilize ?? 0,
    stabilizeMode: clip.stabilizeMode || 'standard',
    wobbleRepair: clip.wobbleRepair ?? 0,
    wobbleCrop: clip.wobbleCrop ?? 0,
    clarity: clip.clarity ?? 0,
    videoDenoise: clip.videoDenoise ?? 0,
    audioDenoise: clip.audioDenoise ?? 0,
    speechFocus: !!clip.speechFocus,
    loudnessNormalize: !!clip.loudnessNormalize,
    peakLimiter: !!clip.peakLimiter,
    rotation: clip.rotation ?? 0,
    speed: clip.speed ?? 1,
    scale: clip.scale ?? 100,
    posX: clip.posX ?? 0,
    posY: clip.posY ?? 0,
    letterbox: clip.letterbox ?? 0,
    vignette: clip.vignette ?? 0,
    grain: clip.grain ?? 0,
    blur: clip.blur ?? 0,
    lutPath: clip.lutPath || '',
    chromakeyColor: clip.chromakeyColor || '',
    chromakeyTolerance: clip.chromakeyTolerance ?? 30,
  }))
}

function buildAudioOverlayPayload() {
  return audioOverlayLayout.value.map((overlay) => ({
    inputPath: normalizeRawPath(overlay.inputPath),
    timelineStart: overlay.timelineStart,
    trimStart: overlay.trimStart,
    trimEnd: overlay.trimStart + overlay.effectiveDuration,
    sourceDuration: overlay.sourceDuration,
    volume: overlay.volume ?? 1,
    muted: !!overlay.muted,
  }))
}

function buildTextOverlayPayload() {
  return textOverlays.value.map((t) => ({
    text: String(t.text || 'Title'),
    fontFamily: t.fontFamily || 'sans-serif',
    fontSize: Math.max(8, Math.min(200, Number(t.fontSize) || 48)),
    fontWeight: t.fontWeight || 'bold',
    color: t.color || '#ffffff',
    backgroundColor: t.backgroundColor || '',
    positionX: Math.max(0, Math.min(100, Number(t.positionX) || 50)),
    positionY: Math.max(0, Math.min(100, Number(t.positionY) || 85)),
    timelineStart: Math.max(0, Number(t.timelineStart) || 0),
    duration: Math.max(0.5, Number(t.duration) || 3),
    fadeIn: Math.max(0, Number(t.fadeIn) || 0),
    fadeOut: Math.max(0, Number(t.fadeOut) || 0),
  }))
}

function buildWatermarkOverlayPayload() {
  return watermarkOverlays.value.map((w) => ({
    mode: w.mode === 'image' ? 'image' : 'text',
    text: String(w.text || ''),
    imagePath: w.imagePath ? normalizeRawPath(w.imagePath) : '',
    fontFamily: w.fontFamily || 'sans-serif',
    fontSize: Math.max(8, Math.min(120, Number(w.fontSize) || 24)),
    fontWeight: w.fontWeight || 'bold',
    color: w.color || '#ffffff',
    opacity: Math.max(0.05, Math.min(1, Number(w.opacity) || 0.3)),
    position: w.position || 'bottom-right',
    customX: Math.max(0, Math.min(100, Number(w.customX) || 90)),
    customY: Math.max(0, Math.min(100, Number(w.customY) || 90)),
    scale: Math.max(5, Math.min(400, Number(w.scale) || 100)),
    rotation: Math.max(-180, Math.min(180, Number(w.rotation) || 0)),
    margin: Math.max(0, Math.min(200, Number(w.margin) || 20)),
    shadow: !!w.shadow,
    shadowColor: w.shadowColor || '#000000',
    shadowBlur: Math.max(0, Math.min(20, Number(w.shadowBlur) || 4)),
    tileSpacing: Math.max(50, Math.min(600, Number(w.tileSpacing) || 200)),
    tileAngle: Math.max(-90, Math.min(90, Number(w.tileAngle) || -30)),
    timelineStart: Math.max(0, Number(w.timelineStart) || 0),
    duration: Math.max(0.5, Number(w.duration) || 3),
    fadeIn: Math.max(0, Number(w.fadeIn) || 0),
    fadeOut: Math.max(0, Number(w.fadeOut) || 0),
  }))
}

function getPreviewCacheKey(payload, audioPayload, textPayload, watermarkPayload) {
  return JSON.stringify({
    clips: payload,
    audioOverlays: audioPayload,
    textOverlays: textPayload,
    watermarkOverlays: watermarkPayload,
    exportPreset: exportPreset.value,
  })
}

function getPreviewPlaybackLimit() {
  const activePreviewEl = showRenderedProjectPreview.value ? projectPreviewEl.value : previewVideoEl.value
  const videoDuration = Number(activePreviewEl?.duration || 0)
  return Math.max(0, videoDuration || totalTimelineDuration.value || 0)
}

function clampPreviewTime(value) {
  return Math.max(0, Math.min(Number(value) || 0, getPreviewPlaybackLimit()))
}

function updateProjectPreviewTime(value, syncElement = false) {
  const safeTime = clampPreviewTime(value)
  timelinePreviewProjectTime.value = safeTime
  const activePreviewEl = showRenderedProjectPreview.value ? projectPreviewEl.value : previewVideoEl.value
  if (!syncElement || !activePreviewEl) return safeTime
  if (Math.abs(Number(activePreviewEl.currentTime || 0) - safeTime) > 0.05) {
    try { activePreviewEl.currentTime = safeTime } catch {}
  }
  return safeTime
}

function cancelPendingPreviewPlayback() {
  previewPlaybackToken += 1
}

function syncProjectPreviewStateFromElement({ keepActive = false } = {}) {
  const videoEl = projectPreviewEl.value
  if (!videoEl) {
    previewPlaying.value = false
    if (!keepActive) timelinePreviewActive.value = false
    return
  }

  const safeTime = updateProjectPreviewTime(videoEl.currentTime || 0)
  const isPlaying = !videoEl.paused && !videoEl.ended
  previewPlaying.value = isPlaying
  timelinePreviewActive.value = keepActive
    ? (timelinePreviewActive.value || isPlaying)
    : (hasFreshProjectPreview.value && (isPlaying || safeTime > 0.01))
}

function scheduleProjectPreviewRender() {
  // No-op: preview is now real-time via dual video layers.
  // FFmpeg rendering is only used for final export.
}

function buildPreviewFilter(clip) {
  if (!clip) return 'none'
  const brightness = Math.max(0.2, 1 + (Number(clip.exposure || 0) / 100) * 0.45)
  const contrast = Math.max(0.5, Number(clip.contrast || 100) / 100)
  const saturation = Math.max(0, Number(clip.saturation || 100) / 100)
  const warmth = Number(clip.temperature || 0)
  const tint = Number(clip.tint || 0)
  const sepia = Math.min(0.35, Math.abs(warmth) / 100 * 0.28)
  const hueRotate = (tint / 100) * 14
  const blurAmount = Number(clip.blur || 0)
  const blurPx = blurAmount > 0.5 ? (blurAmount / 100 * 12).toFixed(1) : 0
  // Skip filter entirely when all values are at identity — avoids GPU filter compositing cost
  const isIdentity = Math.abs(brightness - 1) < 0.005 && Math.abs(contrast - 1) < 0.005
    && Math.abs(saturation - 1) < 0.005 && sepia < 0.005 && Math.abs(hueRotate) < 0.1 && blurPx <= 0
  if (isIdentity) return 'none'
  let f = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) sepia(${sepia.toFixed(3)}) hue-rotate(${hueRotate.toFixed(2)}deg)`
  if (blurPx > 0) f += ` blur(${blurPx}px)`
  return f
}

function buildPreviewTransform(clip) {
  return buildPreviewTransformFull(clip)
}

function getEffectiveClipFadeWindow(clip, incomingTransitionDuration = 0, outgoingTransitionDuration = 0) {
  const durationValue = Math.max(0, Number(clip?.duration) || 0)
  const fadeInRequested = Math.max(0, Number(clip?.fadeIn) || 0)
  const fadeOutRequested = Math.max(0, Number(clip?.fadeOut) || 0)
  const fadeInStart = Math.max(0, Math.min(durationValue, Number(incomingTransitionDuration) || 0))
  const maxFadeInDuration = Math.max(0, durationValue - fadeInStart - 0.01)
  const fadeInDuration = Math.min(fadeInRequested, maxFadeInDuration)
  const fadeOutEnd = Math.max(0, durationValue - Math.max(0, Number(outgoingTransitionDuration) || 0))
  const maxFadeOutDuration = Math.max(0, fadeOutEnd - 0.01)
  const fadeOutDuration = Math.min(fadeOutRequested, maxFadeOutDuration)
  const fadeOutStart = Math.max(0, fadeOutEnd - fadeOutDuration)

  return {
    fadeInStart,
    fadeInDuration,
    fadeOutStart,
    fadeOutEnd,
    fadeOutDuration,
  }
}

function computeClipFadeOpacity(clip, localTime, baseOpacity = 1, incomingTransitionDuration = 0, outgoingTransitionDuration = 0) {
  if (!clip) return 0
  const elapsed = Math.max(0, localTime - clip.startTime)
  const fadeWindow = getEffectiveClipFadeWindow(clip, incomingTransitionDuration, outgoingTransitionDuration)
  let opacity = baseOpacity
  if (fadeWindow.fadeInDuration > 0.01) {
    opacity *= clampUnit((elapsed - fadeWindow.fadeInStart) / fadeWindow.fadeInDuration)
  }
  if (fadeWindow.fadeOutDuration > 0.01 && elapsed >= fadeWindow.fadeOutStart) {
    opacity *= clampUnit((fadeWindow.fadeOutEnd - elapsed) / fadeWindow.fadeOutDuration)
  }
  return clampUnit(opacity)
}

function joinPreviewTransforms(...parts) {
  const transforms = parts.filter((part) => part && part !== 'none')
  return transforms.length ? transforms.join(' ') : 'none'
}

function buildPreviewLayerStyle(layerState, isBase) {
  if (!layerState?.clip) {
    return { opacity: '0', transform: 'none', filter: 'none', clipPath: 'none', zIndex: isBase ? '1' : '2' }
  }

  const transitionType = layerState.transitionType || 'fade'
  const progress = clampUnit(layerState.transitionProgress)
  const opacityValue = clampUnit(layerState.opacity)
  const baseTransform = buildPreviewTransform(layerState.clip)
  const baseFilter = buildPreviewFilter(layerState.clip)
  const style = {
    opacity: String(opacityValue),
    transform: baseTransform,
    filter: baseFilter,
    clipPath: 'none',
    zIndex: isBase ? '1' : '2',
  }

  if (layerState.preloadOnly) {
    style.opacity = '0'
    return style
  }

  if (!layerState.inTransition) return style

  // Dip to black
  if (transitionType === 'fadeblack') {
    const dipStrength = 1 - Math.abs(progress - 0.5) / 0.5
    const brightness = Math.max(0.3, 1 - dipStrength * 0.65)
    style.filter = `${baseFilter} brightness(${brightness.toFixed(3)})`
    return style
  }

  // Dip to white
  if (transitionType === 'fadewhite') {
    const dipStrength = 1 - Math.abs(progress - 0.5) / 0.5
    if (layerState.layerRole === 'primary') {
      style.opacity = String(clampUnit(1 - progress))
      style.filter = `${baseFilter} brightness(${(1 + dipStrength * 1.5).toFixed(3)})`
    } else {
      style.opacity = String(clampUnit(progress))
      style.filter = `${baseFilter} brightness(${(1 + dipStrength * 1.5).toFixed(3)})`
    }
    return style
  }

  // Wipe left/right
  if (transitionType === 'wipeleft' || transitionType === 'wiperight') {
    if (layerState.layerRole === 'secondary') {
      const insetValue = `${((1 - progress) * 100).toFixed(2)}%`
      style.clipPath = transitionType === 'wipeleft'
        ? `inset(0 ${insetValue} 0 0)`
        : `inset(0 0 0 ${insetValue})`
      style.opacity = '1'
    }
    return style
  }

  // Wipe up/down
  if (transitionType === 'wipeup' || transitionType === 'wipedown') {
    if (layerState.layerRole === 'secondary') {
      const insetValue = `${((1 - progress) * 100).toFixed(2)}%`
      style.clipPath = transitionType === 'wipeup'
        ? `inset(${insetValue} 0 0 0)`
        : `inset(0 0 ${insetValue} 0)`
      style.opacity = '1'
    }
    return style
  }

  // Slide left/right
  if (transitionType === 'slideleft' || transitionType === 'slideright') {
    const direction = transitionType === 'slideleft' ? -1 : 1
    const outgoingOffset = `${(progress * 100 * direction).toFixed(2)}%`
    const incomingOffset = `${((1 - progress) * 100 * -direction).toFixed(2)}%`
    style.transform = joinPreviewTransforms(
      baseTransform,
      `translateX(${layerState.layerRole === 'primary' ? outgoingOffset : incomingOffset})`,
    )
    style.opacity = '1'
    return style
  }

  // Slide up/down
  if (transitionType === 'slideup' || transitionType === 'slidedown') {
    const direction = transitionType === 'slideup' ? -1 : 1
    const outgoingOffset = `${(progress * 100 * direction).toFixed(2)}%`
    const incomingOffset = `${((1 - progress) * 100 * -direction).toFixed(2)}%`
    style.transform = joinPreviewTransforms(
      baseTransform,
      `translateY(${layerState.layerRole === 'primary' ? outgoingOffset : incomingOffset})`,
    )
    style.opacity = '1'
    return style
  }

  // Circle crop / circle open / circle close
  if (transitionType === 'circlecrop' || transitionType === 'circleopen' || transitionType === 'circleclose') {
    const radius = transitionType === 'circleclose' ? (1 - progress) : progress
    const r = (radius * 72).toFixed(2)
    if (layerState.layerRole === 'secondary') {
      style.clipPath = `circle(${r}% at 50% 50%)`
      style.opacity = '1'
    }
    return style
  }

  // Vertical open / close (split from center)
  if (transitionType === 'vertopen' || transitionType === 'vertclose') {
    if (layerState.layerRole === 'secondary') {
      const half = transitionType === 'vertopen' ? (progress * 50).toFixed(2) : ((1 - progress) * 50).toFixed(2)
      const top = `${(50 - half)}%`
      const bottom = `${(50 - half)}%`
      style.clipPath = `inset(${transitionType === 'vertopen' ? `${top} 0 ${bottom} 0` : `${top} 0 ${bottom} 0`})`
      style.opacity = '1'
    }
    return style
  }

  // Horizontal open / close (split from center)
  if (transitionType === 'horzopen' || transitionType === 'horzclose') {
    if (layerState.layerRole === 'secondary') {
      const half = transitionType === 'horzopen' ? (progress * 50).toFixed(2) : ((1 - progress) * 50).toFixed(2)
      const side = `${(50 - half)}%`
      style.clipPath = `inset(0 ${side} 0 ${side})`
      style.opacity = '1'
    }
    return style
  }

  // Dissolve (dithered) — approximated as cross-fade with grain
  if (transitionType === 'dissolve') {
    // Fall through to default cross-fade (opacity blend matches the xfade dissolve closely)
    return style
  }

  // Pixelize — approximated with blur
  if (transitionType === 'pixelize') {
    const peakBlur = 20
    const blurAmount = peakBlur * (1 - Math.abs(progress - 0.5) / 0.5)
    style.filter = `${baseFilter} blur(${blurAmount.toFixed(1)}px)`
    return style
  }

  // Radial wipe
  if (transitionType === 'radial') {
    if (layerState.layerRole === 'secondary') {
      const angle = (progress * 360).toFixed(2)
      style.clipPath = `conic-gradient(from 0deg at 50% 50%, black ${angle}deg, transparent ${angle}deg)`
      // conic-gradient not supported in clipPath — use polygon approximation
      const a = progress * 360
      const pts = ['50% 50%', '50% 0%']
      const corners = [
        { angle: 45, point: '100% 0%' },
        { angle: 135, point: '100% 100%' },
        { angle: 225, point: '0% 100%' },
        { angle: 315, point: '0% 0%' },
      ]
      for (const c of corners) {
        if (a > c.angle) pts.push(c.point)
      }
      if (a > 0 && a < 360) {
        const rad = (a - 90) * Math.PI / 180
        const cx = 50 + Math.cos(rad) * 70.71
        const cy = 50 + Math.sin(rad) * 70.71
        pts.push(`${cx.toFixed(2)}% ${cy.toFixed(2)}%`)
      }
      style.clipPath = `polygon(${pts.join(', ')})`
      style.opacity = '1'
    }
    return style
  }

  // Zoom in — incoming clip scales up from center
  if (transitionType === 'zoomin') {
    if (layerState.layerRole === 'secondary') {
      const scale = 0.3 + progress * 0.7
      style.transform = joinPreviewTransforms(baseTransform, `scale(${scale.toFixed(3)})`)
      style.opacity = String(clampUnit(progress))
    }
    return style
  }

  return style
}

function resolveLivePreviewState(projectTime) {
  const layout = timelineTrackLayout.value
  if (!layout.length) return null
  const safeTime = Math.max(0, Math.min(projectTime, totalTimelineDuration.value))

  for (let index = 0; index < layout.length; index++) {
    const clip = layout[index]
    const nextClip = layout[index + 1] || null
    const clipSpeed = Math.max(0.25, Math.min(4, Number(clip.speed) || 1))
    const nextSpeed = nextClip ? Math.max(0.25, Math.min(4, Number(nextClip.speed) || 1)) : 1
    const clipStart = clip.timelineStart
    const clipEnd = clip.timelineStart + clip.effectiveDuration
    const overlapStart = nextClip ? nextClip.timelineStart : Number.POSITIVE_INFINITY

    if (nextClip && clip.transitionDuration > 0.01 && safeTime >= overlapStart && safeTime < clipEnd) {
      const progress = clampUnit((safeTime - overlapStart) / clip.transitionDuration)
      const isDipToBlack = clip.transitionType === 'fadeblack'
      const primaryBaseOpacity = 1 - progress
      const secondaryBaseOpacity = progress
      const secondaryIncomingFadeOffset = isDipToBlack ? 0 : clip.transitionDuration
      return {
        primary: {
          clip,
          localTime: clip.startTime + (safeTime - clipStart) * clipSpeed,
          opacity: computeClipFadeOpacity(
            clip,
            clip.startTime + (safeTime - clipStart) * clipSpeed,
            primaryBaseOpacity,
            clip.incomingTransitionDuration,
            clip.transitionDuration,
          ),
          incomingTransitionDuration: clip.incomingTransitionDuration,
          outgoingTransitionDuration: clip.transitionDuration,
          inTransition: true,
          layerRole: 'primary',
          transitionType: clip.transitionType,
          transitionProgress: progress,
        },
        secondary: {
          clip: nextClip,
          localTime: nextClip.startTime + (safeTime - overlapStart) * nextSpeed,
          opacity: computeClipFadeOpacity(
            nextClip,
            nextClip.startTime + (safeTime - overlapStart) * nextSpeed,
            secondaryBaseOpacity,
            secondaryIncomingFadeOffset,
            nextClip.transitionDuration,
          ),
          incomingTransitionDuration: secondaryIncomingFadeOffset,
          outgoingTransitionDuration: nextClip.transitionDuration,
          inTransition: true,
          layerRole: 'secondary',
          transitionType: clip.transitionType,
          transitionProgress: progress,
        },
      }
    }

    const soloEnd = nextClip ? overlapStart : clipEnd
    if (safeTime >= clipStart && safeTime < soloEnd) {
      const shouldPreloadNext = !!nextClip && clip.transitionDuration > 0.01 && safeTime >= overlapStart - PREVIEW_PRELOAD_LEAD
      return {
        primary: {
          clip,
          localTime: clip.startTime + (safeTime - clipStart) * clipSpeed,
          opacity: computeClipFadeOpacity(
            clip,
            clip.startTime + (safeTime - clipStart) * clipSpeed,
            1,
            clip.incomingTransitionDuration,
            clip.transitionDuration,
          ),
          incomingTransitionDuration: clip.incomingTransitionDuration,
          outgoingTransitionDuration: clip.transitionDuration,
          inTransition: false,
          layerRole: 'primary',
          transitionType: null,
          transitionProgress: 0,
        },
        secondary: shouldPreloadNext
          ? {
              clip: nextClip,
              localTime: nextClip.startTime,
              opacity: 0,
              incomingTransitionDuration: clip.transitionDuration,
              outgoingTransitionDuration: nextClip.transitionDuration,
              inTransition: false,
              layerRole: 'secondary',
              transitionType: clip.transitionType,
              transitionProgress: 0,
              preloadOnly: true,
            }
          : null,
      }
    }
  }

  const finalClip = layout[layout.length - 1]
  return {
    primary: {
      clip: finalClip,
      localTime: finalClip.endTime,
      opacity: 1,
      incomingTransitionDuration: finalClip.incomingTransitionDuration,
      outgoingTransitionDuration: 0,
      inTransition: false,
      layerRole: 'primary',
      transitionType: null,
      transitionProgress: 0,
    },
    secondary: null,
  }
}

function stopPreviewAnimation() {
  if (previewPlaybackFrame) {
    cancelAnimationFrame(previewPlaybackFrame)
    previewPlaybackFrame = 0
  }
}

function syncPreviewVideoLayer(layerKey, layerState, shouldPlay) {
  const isBase = layerKey === 'base'
  const videoEl = isBase ? previewVideoEl.value : previewOverlayEl.value
  const srcRef = isBase ? previewBaseSrc : previewOverlaySrc
  const styleRef = isBase ? previewBaseStyle : previewOverlayStyle
  const timeRef = isBase ? previewBaseTargetTime : previewOverlayTargetTime

  if (!layerState?.clip) {
    styleRef.value = { opacity: '0', transform: 'none', filter: 'none' }
    if (videoEl) {
      videoEl.pause()
      videoEl.volume = 0
    }
    return
  }

  const mediaSrc = buildMediaSrc(layerState.clip.inputPath)
  const mediaChanged = srcRef.value !== mediaSrc
  if (mediaChanged) {
    srcRef.value = mediaSrc
  }
  timeRef.value = layerState.localTime
  const style = buildPreviewLayerStyle(layerState, isBase)
  // When layers are swapped, flip z-index so the incoming clip stays visually on top during transitions
  if (previewLayersSwapped && layerState.inTransition) {
    style.zIndex = isBase ? '2' : '1'
  }
  // Disable CSS transitions during live playback — rAF delivers new values every ~16ms,
  // and the 60ms CSS transition creates visual lag/jitter fighting the JS-driven animation.
  style.transition = shouldPlay ? 'none' : undefined
  styleRef.value = style

  if (!videoEl) return
  const driftThreshold = layerState.inTransition ? 0.3 : 0.12
  if (
    videoEl.readyState >= 1
    && (mediaChanged || videoEl.paused || Math.abs(videoEl.currentTime - layerState.localTime) > driftThreshold)
  ) {
    try { videoEl.currentTime = layerState.localTime } catch {}
  }
  const desiredVolume = layerState.clip.muted
    ? 0
    : Math.max(0, Math.min(1, (Number(layerState.clip.volume) || 1) * clampUnit(layerState.opacity)))
  if (Math.abs(videoEl.volume - desiredVolume) > 0.02) {
    videoEl.volume = desiredVolume
  }

  const clipSpeed = Math.max(0.25, Math.min(4, Number(layerState.clip.speed) || 1))
  if (Math.abs(videoEl.playbackRate - clipSpeed) > 0.01) {
    videoEl.playbackRate = clipSpeed
  }

  const shouldBePlaying = !layerState.preloadOnly && shouldPlay && (layerState.inTransition || clampUnit(layerState.opacity) > 0.001)
  if (shouldBePlaying) {
    if (videoEl.paused) void videoEl.play().catch(() => {})
  } else if (!videoEl.paused) {
    videoEl.pause()
  }
}

function applyLivePreviewState(projectTime, shouldPlay) {
  const state = resolveLivePreviewState(projectTime)
  timelinePreviewProjectTime.value = Math.max(0, Math.min(projectTime, totalTimelineDuration.value))
  timelinePreviewClipId.value = state?.secondary?.clip?.id || state?.primary?.clip?.id || null

  // Determine optimal layer assignment to avoid src reloads (which cause flash/delay).
  // During transitions, the secondary (incoming) needs higher z-index for wipe/slide to render
  // correctly. We only re-evaluate swap when going solo; during transitions/preload we keep
  // the current assignment so that the preloaded src stays on the right element.
  if (!state?.secondary?.clip) {
    const primarySrc = state?.primary?.clip ? buildMediaSrc(state.primary.clip.inputPath) : ''
    if (primarySrc && primarySrc === previewOverlaySrc.value && primarySrc !== previewBaseSrc.value) {
      previewLayersSwapped = true
    } else if (primarySrc && primarySrc === previewBaseSrc.value) {
      previewLayersSwapped = false
    }
  }

  const baseState = previewLayersSwapped ? (state?.secondary || null) : (state?.primary || null)
  const overlayState = previewLayersSwapped ? (state?.primary || null) : (state?.secondary || null)
  syncPreviewVideoLayer('base', baseState, shouldPlay)
  syncPreviewVideoLayer('overlay', overlayState, shouldPlay)
}

function onPreviewPlaybackFrame(now) {
  if (!previewPlaying.value) return
  const nextProjectTime = previewPlaybackStartedProjectTime + ((now - previewPlaybackStartedAt) / 1000)
  if (nextProjectTime >= totalTimelineDuration.value) {
    applyLivePreviewState(totalTimelineDuration.value, false)
    stopTimelinePreview({ resetProjectTime: false, pauseVideo: true })
    timelinePreviewProjectTime.value = totalTimelineDuration.value
    return
  }
  applyLivePreviewState(nextProjectTime, true)
  if (previewChromakeyActive.value) drawChromakeyPreview()
  previewPlaybackFrame = requestAnimationFrame(onPreviewPlaybackFrame)
}

function onPreviewLayerLoaded(layerKey) {
  const videoEl = layerKey === 'base' ? previewVideoEl.value : previewOverlayEl.value
  const targetTime = layerKey === 'base' ? previewBaseTargetTime.value : previewOverlayTargetTime.value
  if (!videoEl) return
  if (layerKey === 'base' && videoEl.videoWidth && videoEl.videoHeight) {
    previewNatWidth.value = videoEl.videoWidth
    previewNatHeight.value = videoEl.videoHeight
  }
  try { videoEl.currentTime = targetTime } catch {}
  if (previewPlaying.value) {
    void videoEl.play().catch(() => {})
  }
  if (layerKey === 'base') scheduleChromakeyDraw()
}

function onProjectPreviewLoadedMetadata() {
  // Do NOT update previewNatWidth/previewNatHeight here.
  // These represent the SOURCE video dimensions and are used for CSS overlay scaling
  // (overlayFontScale = overlayRenderWidth / previewNatWidth). The rendered preview
  // has smaller dimensions (960px max) which would corrupt the font scale, making
  // all overlays appear ~3x too large when switching back to live preview.
  updateProjectPreviewTime(timelinePreviewProjectTime.value, true)
}

function onProjectPreviewPlay() {
  timelinePreviewActive.value = true
  previewPlaying.value = true
}

function onProjectPreviewPlaying() {
  syncProjectPreviewStateFromElement({ keepActive: true })
}

function onProjectPreviewPause() {
  syncProjectPreviewStateFromElement()
}

function onProjectPreviewTimeUpdate() {
  if (!projectPreviewEl.value) return
  updateProjectPreviewTime(projectPreviewEl.value.currentTime || 0)
}

function onProjectPreviewSeeking() {
  if (!projectPreviewEl.value) return
  timelinePreviewActive.value = true
  updateProjectPreviewTime(projectPreviewEl.value.currentTime || 0)
}

function onProjectPreviewSeeked() {
  syncProjectPreviewStateFromElement({ keepActive: true })
}

function onProjectPreviewEnded() {
  cancelPendingPreviewPlayback()
  previewPlaying.value = false
  timelinePreviewActive.value = false
  updateProjectPreviewTime(totalTimelineDuration.value)
}

function invalidateProjectPreview() {
  cancelPendingPreviewPlayback()
  projectPreviewNeedsRender.value = true
  const wasRendered = previewPlaybackMode.value === 'rendered'
  previewPlaybackMode.value = 'live'
  if (projectPreviewEl.value) projectPreviewEl.value.pause()
  const shouldPlay = previewPlaying.value
  const t = timelinePreviewProjectTime.value
  if (wasRendered) {
    // When switching from rendered to live mode, the live <video> elements
    // don't exist yet (v-if/v-else). Wait for Vue to re-create the DOM.
    nextTick(() => applyLivePreviewState(t, shouldPlay))
  } else {
    applyLivePreviewState(t, shouldPlay)
  }
}

function stopTimelinePreview({ resetProjectTime = false, pauseVideo = true } = {}) {
  stopPreviewAnimation()
  cancelPendingPreviewPlayback()
  timelinePreviewActive.value = false
  timelinePreviewClipId.value = null
  previewPlaying.value = false
  previewLayersSwapped = false
  if (resetProjectTime) updateProjectPreviewTime(0)
  if (pauseVideo && projectPreviewEl.value) projectPreviewEl.value.pause()
  if (pauseVideo && previewVideoEl.value) previewVideoEl.value.pause()
  if (pauseVideo && previewOverlayEl.value) previewOverlayEl.value.pause()
}

function getTimelineStartTimeForClip(clipId) {
  const segment = timelineTrackLayout.value.find((entry) => entry.id === clipId)
  return segment?.timelineStart ?? 0
}

async function renderProjectPreview() {
  if (!hasTimelineClips.value) return false
  const payload = buildComposePayload()
  const audioPayload = buildAudioOverlayPayload()
  const textPayload = buildTextOverlayPayload()
  const watermarkPayload = buildWatermarkOverlayPayload()
  const cacheKey = getPreviewCacheKey(payload, audioPayload, textPayload, watermarkPayload)
  const cachedPreviewPath = previewRenderCache.get(cacheKey)
  if (cachedPreviewPath) {
    projectPreviewPath.value = cachedPreviewPath
    projectPreviewNeedsRender.value = false
    return true
  }

  if (previewRenderPromise && previewRenderPromiseKey === cacheKey) {
    return previewRenderPromise
  }

  const renderToken = ++previewRenderToken
  previewRenderPromiseKey = cacheKey
  previewRendering.value = true
  error.value = ''

  let pendingRender = null
  pendingRender = (async () => {
    try {
      const result = await videoEditorBridge.composeVideo({
        clips: payload,
        audioOverlays: audioPayload,
        textOverlays: textPayload,
        watermarkOverlays: watermarkPayload,
        exportPreset: exportPreset.value,
        previewMode: true,
      })

      if (previewUnmounted || renderToken !== previewRenderToken) return false

      if (!result?.success || !result.outputPath) {
        error.value = result?.error || 'Failed to render preview.'
        return false
      }

      projectPreviewPath.value = result.outputPath
      previewRenderCache.set(cacheKey, result.outputPath)
      projectPreviewNeedsRender.value = false
      return true
    } catch (err) {
      if (previewUnmounted || renderToken !== previewRenderToken) return false
      error.value = `Failed to render preview: ${err?.message || err}`
      return false
    } finally {
      if (renderToken === previewRenderToken) {
        previewRendering.value = false
      }
      if (previewRenderPromise === pendingRender) {
        previewRenderPromise = null
        previewRenderPromiseKey = ''
      }
    }
  })()

  previewRenderPromise = pendingRender
  return pendingRender
}

function getTimelinePreviewStartTime() {
  if (timelinePreviewActive.value) {
    return Math.max(0, Math.min(timelinePreviewProjectTime.value, totalTimelineDuration.value))
  }

  if (selectedClip.value) {
    const base = getTimelineStartTimeForClip(selectedClip.value.id)
    const offset = Math.max(0, Math.min(currentTime.value - selectedClip.value.startTime, selectedClip.value.duration))
    return base + offset
  }

  return 0
}

function applyDraftForSource(sourceId) {
  const draft = draftRanges.value[sourceId]
  const source = sourceVideos.value.find((entry) => entry.id === sourceId)
  trimStart.value = draft?.start ?? 0
  trimEnd.value = draft?.end ?? (source?.duration || 0)
  currentTime.value = Math.min(draft?.current ?? trimStart.value, source?.duration || 0)
  sourceRotation.value = normalizeRotation(draft?.rotation)
}

function ensureInitialSource() {
  const initialPaths = [props.videoPath, ...(Array.isArray(props.initialVideoPaths) ? props.initialVideoPaths : [])]
    .map((entry) => normalizeRawPath(entry))
    .filter(Boolean)

  if (!initialPaths.length) return

  const seen = new Set()
  sourceVideos.value = initialPaths.reduce((acc, rawPath) => {
    const key = rawPath.toLowerCase()
    if (seen.has(key)) return acc
    seen.add(key)
    acc.push({
      id: nextSourceId++,
      path: rawPath,
      name: rawPath.split(/[\\/]/).pop() || 'Video',
      duration: 0,
    })
    return acc
  }, [])

  if (sourceVideos.value.length) selectedSourceId.value = sourceVideos.value[0].id
}

function selectSource(sourceId) {
  rememberSelection()
  selectedSourceId.value = sourceId
  transitionFocusClipId.value = null
}

function selectAudioOverlay(overlayId) {
  selectedAudioOverlayId.value = overlayId
  selectedClipId.value = null
  selectedTextOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  transitionFocusClipId.value = null
  inspectorOpen.value = true
}

function makeAudioOverlay(filePath, sourceDuration, overrides = {}) {
  const safeDuration = Math.max(0.05, Number(sourceDuration) || 0.05)
  const durationCap = Math.min(safeDuration, Math.max(0.05, totalTimelineDuration.value || safeDuration))
  return {
    id: `audio-overlay-${nextAudioOverlayId++}`,
    inputPath: filePath,
    name: normalizeRawPath(filePath).split(/[\\/]/).pop() || 'Audio Overlay',
    sourceDuration: safeDuration,
    timelineStart: 0,
    trimStart: 0,
    trimEnd: durationCap,
    volume: 1,
    muted: false,
    ...overrides,
  }
}

function makeClipFromSelection(overrides = {}) {
  return {
    id: `clip-${nextClipId++}`,
    sourceId: selectedSource.value.id,
    sourceName: selectedSource.value.name,
    inputPath: selectedSource.value.path,
    startTime: trimStart.value,
    endTime: trimEnd.value,
    duration: activeSelectionDuration.value,
    fadeIn: 0,
    fadeOut: 0,
    transitionDuration: 0,
    transitionType: 'fade',
    audioTransitionCurve: 'tri',
    volume: 1,
    muted: false,
    exposure: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    tint: 0,
    stabilize: 0,
    stabilizeMode: 'standard',
    wobbleRepair: 0,
    clarity: 0,
    wobbleCrop: 0,
    videoDenoise: 0,
    audioDenoise: 0,
    speechFocus: false,
    loudnessNormalize: false,
    peakLimiter: false,
    rotation: sourceRotation.value,
    speed: 1,
    scale: 100,
    posX: 0,
    posY: 0,
    letterbox: 0,
    vignette: 0,
    grain: 0,
    blur: 0,
    lutName: '',
    lutPath: '',
    chromakeyColor: '',
    chromakeyTolerance: 30,
    thumbnail: '',
    thumbnailLoading: true,
    ...overrides,
  }
}

function normalizeClipSequence(sequence) {
  return sequence.map((clip, index) => {
    const nextClip = sequence[index + 1] || null
    const durationValue = Math.max(0, Number(clip.duration) || 0)
    const fadeCap = Math.max(0, durationValue / 2 - 0.05)

    return {
      ...clip,
      duration: durationValue,
      fadeIn: Math.min(Math.max(0, Number(clip.fadeIn) || 0), fadeCap),
      fadeOut: Math.min(Math.max(0, Number(clip.fadeOut) || 0), fadeCap),
      volume: Math.min(2, Math.max(0, Number(clip.volume) || 0)),
      muted: !!clip.muted,
      exposure: Math.min(40, Math.max(-40, Number(clip.exposure) || 0)),
      contrast: Math.min(150, Math.max(50, Number(clip.contrast) || 100)),
      saturation: Math.min(200, Math.max(0, Number(clip.saturation) || 100)),
      temperature: Math.min(100, Math.max(-100, Number(clip.temperature) || 0)),
      tint: Math.min(100, Math.max(-100, Number(clip.tint) || 0)),
      stabilize: Math.min(100, Math.max(0, Number(clip.stabilize) || 0)),
      stabilizeMode: clip.stabilizeMode === 'rolling' ? 'rolling' : 'standard',
      wobbleRepair: Math.min(100, Math.max(0, Number(clip.wobbleRepair) || 0)),
      wobbleCrop: Math.min(25, Math.max(0, Number(clip.wobbleCrop) || 0)),
      clarity: Math.min(100, Math.max(0, Number(clip.clarity) || 0)),
      videoDenoise: Math.min(100, Math.max(0, Number(clip.videoDenoise) || 0)),
      audioDenoise: Math.min(100, Math.max(0, Number(clip.audioDenoise) || 0)),
      speechFocus: !!clip.speechFocus,
      loudnessNormalize: !!clip.loudnessNormalize,
      peakLimiter: !!clip.peakLimiter,
      rotation: normalizeRotation(clip.rotation),
      speed: Math.min(4, Math.max(0.25, Number(clip.speed) || 1)),
      scale: Math.min(200, Math.max(25, Number(clip.scale) || 100)),
      posX: Math.min(100, Math.max(-100, Number(clip.posX) || 0)),
      posY: Math.min(100, Math.max(-100, Number(clip.posY) || 0)),
      transitionType: nextClip ? (clip.transitionType || 'fade') : 'fade',
      audioTransitionCurve: nextClip ? (clip.audioTransitionCurve || 'tri') : 'tri',
      transitionDuration: nextClip
        ? clampTransitionDuration(clip.transitionDuration, durationValue, nextClip.duration)
        : 0,
    }
  })
}

function setClipsNormalized(sequence) {
  pushUndo()
  invalidateProjectPreview()
  clips.value = normalizeClipSequence(sequence)
}

function updateClipById(clipId, updater) {
  const clipIndex = clips.value.findIndex((clip) => clip.id === clipId)
  if (clipIndex < 0) return null

  invalidateProjectPreview()
  const currentClip = clips.value[clipIndex]
  const candidate = typeof updater === 'function' ? updater(currentClip) : { ...currentClip, ...updater }
  const nextClips = [...clips.value]
  nextClips.splice(clipIndex, 1, candidate)
  const normalizedClips = normalizeClipSequence(nextClips)
  clips.value = normalizedClips
  return normalizedClips[clipIndex] || null
}

function updateSelectedClipField(field, value) {
  if (!selectedClip.value) return
  updateClipById(selectedClip.value.id, { [field]: value })
}

function applyFixPreset(presetKey) {
  if (!selectedClip.value || !fixPresetMap[presetKey]) return
  const preset = fixPresetMap[presetKey]
  const nextValues = selectedClip.value.muted
    ? { ...preset, audioDenoise: 0, speechFocus: false, loudnessNormalize: false, peakLimiter: false }
    : preset
  updateClipById(selectedClip.value.id, nextValues)
}

async function hydrateClipThumbnail(clipId, inputPath, startTime, durationSeconds) {
  try {
    const result = await videoEditorBridge.getVideoClipThumbnail({
      inputPath: normalizeRawPath(inputPath),
      timeSec: startTime + Math.max(0.05, durationSeconds / 2),
    })
    clips.value = clips.value.map((clip) => clip.id === clipId
      ? { ...clip, thumbnail: result?.success ? result.thumbnail : '', thumbnailLoading: false }
      : clip)
  } catch {
    clips.value = clips.value.map((clip) => clip.id === clipId
      ? { ...clip, thumbnail: '', thumbnailLoading: false }
      : clip)
  }
}

function queueClipThumbnail(clip) {
  hydrateClipThumbnail(clip.id, clip.inputPath, clip.startTime, clip.duration)
}

function onSourceMetadataLoaded() {
  if (!sourceVideoEl.value || !selectedSource.value) return
  duration.value = Number(sourceVideoEl.value.duration || 0)
  sourceVideoWidth.value = Number(sourceVideoEl.value.videoWidth || 0)
  sourceVideoHeight.value = Number(sourceVideoEl.value.videoHeight || 0)
  sourceVideos.value = sourceVideos.value.map((source) => source.id === selectedSource.value.id
    ? { ...source, duration: duration.value }
    : source)
  applyDraftForSource(selectedSource.value.id)
  if (sourceVideoEl.value.currentTime !== currentTime.value) {
    sourceVideoEl.value.currentTime = currentTime.value
  }
  rememberSelection()
}

function onSourceTimeUpdate() {
  if (!sourceVideoEl.value) return
  currentTime.value = sourceVideoEl.value.currentTime
  rememberSelection()
  if (sourcePlaying.value && sourceVideoEl.value.currentTime >= trimEnd.value) {
    sourceVideoEl.value.pause()
    sourcePlaying.value = false
  }
}

async function toggleSourcePlay() {
  if (!sourceVideoEl.value) return

  if (sourcePlaying.value) {
    sourceVideoEl.value.pause()
    sourcePlaying.value = false
    return
  }

  if (sourceVideoEl.value.currentTime < trimStart.value || sourceVideoEl.value.currentTime >= trimEnd.value) {
    sourceVideoEl.value.currentTime = trimStart.value
  }
  await sourceVideoEl.value.play()
  sourcePlaying.value = true
}

function rotateSourceSelection(delta) {
  sourceRotation.value = normalizeRotation(sourceRotation.value + delta)
  rememberSelection()
}

function seekTo(event) {
  if (!timelineEl.value || !sourceVideoEl.value || duration.value <= 0) return
  const rect = timelineEl.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  sourceVideoEl.value.currentTime = pct * duration.value
}

function startTrimDrag(mode) {
  trimDragMode = mode
  window.addEventListener('mousemove', onTrimDrag)
  window.addEventListener('mouseup', stopTrimDrag)
}

function onTrimDrag(event) {
  if (!trimDragMode || !timelineEl.value || duration.value <= 0) return
  const rect = timelineEl.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const time = pct * duration.value
  if (trimDragMode === 'start') {
    trimStart.value = Math.min(time, trimEnd.value - 0.1)
    if (sourceVideoEl.value) sourceVideoEl.value.currentTime = trimStart.value
  } else {
    trimEnd.value = Math.max(time, trimStart.value + 0.1)
    if (sourceVideoEl.value) sourceVideoEl.value.currentTime = Math.max(trimStart.value, trimEnd.value - 0.05)
  }
  rememberSelection()
}

function stopTrimDrag() {
  trimDragMode = null
  window.removeEventListener('mousemove', onTrimDrag)
  window.removeEventListener('mouseup', stopTrimDrag)
}

function resetSelection() {
  trimStart.value = 0
  trimEnd.value = duration.value
  currentTime.value = 0
  if (sourceVideoEl.value) sourceVideoEl.value.currentTime = 0
  rememberSelection()
}

function addCurrentSelectionAsClip() {
  if (!canAddClip.value) return
  const clip = makeClipFromSelection()
  setClipsNormalized([...clips.value, clip])
  selectedClipId.value = clip.id
  selectedAudioOverlayId.value = null
  selectedTextOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  queueClipThumbnail(clip)
  successMsg.value = 'Clip added to timeline.'
  error.value = ''
}

function updateSelectedClip() {
  if (!selectedClip.value || !selectedSource.value) return
  const updatedClip = {
    ...selectedClip.value,
    sourceId: selectedSource.value.id,
    sourceName: selectedSource.value.name,
    inputPath: selectedSource.value.path,
    startTime: trimStart.value,
    endTime: trimEnd.value,
    duration: activeSelectionDuration.value,
    rotation: sourceRotation.value,
    thumbnail: '',
    thumbnailLoading: true,
  }
  updateClipById(updatedClip.id, updatedClip)
  selectedClipId.value = updatedClip.id
  selectedAudioOverlayId.value = null
  selectedTextOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  queueClipThumbnail(updatedClip)
  successMsg.value = 'Timeline clip updated.'
  error.value = ''
}

function loadClip(clipId) {
  const clip = clips.value.find((entry) => entry.id === clipId)
  if (!clip) return
  selectedClipId.value = clip.id
  selectedAudioOverlayId.value = null
  selectedTextOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  transitionFocusClipId.value = null
  inspectorOpen.value = true
  draftRanges.value = {
    ...draftRanges.value,
    [clip.sourceId]: {
      start: clip.startTime,
      end: clip.endTime,
      current: clip.startTime,
      rotation: normalizeRotation(clip.rotation),
    },
  }
  if (selectedSourceId.value === clip.sourceId) {
    trimStart.value = clip.startTime
    trimEnd.value = clip.endTime
    currentTime.value = clip.startTime
    sourceRotation.value = normalizeRotation(clip.rotation)
    if (sourceVideoEl.value) sourceVideoEl.value.currentTime = clip.startTime
  } else {
    selectedSourceId.value = clip.sourceId
  }
}

function focusTransition(clipId) {
  transitionFocusClipId.value = clipId
  loadClip(clipId)
  transitionFocusClipId.value = clipId
}

function setTimelineZoom(nextZoom) {
  const clamped = Math.max(0.25, Math.min(3, Number(nextZoom) || 1))
  timelineZoom.value = Math.round(clamped * 100) / 100
}

function adjustTimelineZoom(delta) {
  setTimelineZoom((Number(timelineZoom.value) || 1) + delta)
}

function resetTimelineZoom() {
  setTimelineZoom(1)
}

function syncTimelineScroll(source) {
  const ruler = timelineRulerScrollEl.value
  const lane = timelineLaneScrollEl.value
  if (!ruler || !lane) return

  const sourceEl = source === 'ruler' ? ruler : lane
  const targetEl = source === 'ruler' ? lane : ruler
  if (!sourceEl || !targetEl) return

  timelineScrollSyncSource = source
  targetEl.scrollLeft = sourceEl.scrollLeft
  requestAnimationFrame(() => {
    timelineScrollSyncSource = null
  })
}

function onTimelineScroll(source) {
  if (timelineScrollSyncSource && timelineScrollSyncSource !== source) return
  syncTimelineScroll(source)
}

function scrollTimelineBy(delta) {
  const target = timelineLaneScrollEl.value || timelineRulerScrollEl.value
  if (!target) return
  target.scrollBy({ left: delta, behavior: 'smooth' })
}

function onTimelineScrollWheel(source, event) {
  // Only hijack horizontal scrolling; let vertical scroll pass through naturally
  // so stacked overlay rows can be scrolled
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) return
  const target = source === 'ruler' ? timelineRulerScrollEl.value : timelineLaneScrollEl.value
  if (!target) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (!delta) return
  event.preventDefault()
  target.scrollLeft += delta
  syncTimelineScroll(source)
}

function startAudioOverlayDrag(event, overlayId) {
  const laneEl = timelineLaneScrollEl.value
  if (!laneEl || !totalTimelineDuration.value) return
  audioOverlayDragState = {
    overlayId,
    startX: event.clientX,
    startTimelineStart: selectedAudioOverlay.value?.id === overlayId
      ? selectedAudioOverlay.value.timelineStart
      : (audioOverlays.value.find((overlay) => overlay.id === overlayId)?.timelineStart || 0),
  }
  selectAudioOverlay(overlayId)
  window.addEventListener('mousemove', onAudioOverlayDrag)
  window.addEventListener('mouseup', stopAudioOverlayDrag)
}

function onAudioOverlayDrag(event) {
  if (!audioOverlayDragState || !timelineLaneScrollEl.value || !totalTimelineDuration.value) return
  const trackRect = timelineLaneScrollEl.value.getBoundingClientRect()
  const overlay = audioOverlays.value.find((entry) => entry.id === audioOverlayDragState.overlayId)
  if (!overlay || trackRect.width <= 0) return

  const deltaPct = (event.clientX - audioOverlayDragState.startX) / trackRect.width
  const deltaTime = deltaPct * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  const overlayDuration = Math.max(0.05, overlay.trimEnd - overlay.trimStart)
  updateAudioOverlayById(audioOverlayDragState.overlayId, {
    timelineStart: Math.max(0, Math.min(audioOverlayDragState.startTimelineStart + deltaTime, Math.max(0, totalTimelineDuration.value - overlayDuration))),
  })
}

function stopAudioOverlayDrag() {
  audioOverlayDragState = null
  window.removeEventListener('mousemove', onAudioOverlayDrag)
  window.removeEventListener('mouseup', stopAudioOverlayDrag)
}

function updateTransitionDurationByTrackPosition(clipId, clientX) {
  if (!rulerTrackEl.value || totalTimelineDuration.value <= 0) return
  const clipIndex = clips.value.findIndex((clip) => clip.id === clipId)
  const clip = clips.value[clipIndex]
  const nextClip = clips.value[clipIndex + 1]
  const layoutSegment = timelineTrackLayout.value[clipIndex]
  if (!clip || !nextClip || !layoutSegment) return

  const rect = rulerTrackEl.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const timeAtPointer = pct * totalTimelineDuration.value
  const desiredTransition = clip.duration - (timeAtPointer - layoutSegment.timelineStart)
  updateClipById(clipId, {
    transitionDuration: clampTransitionDuration(desiredTransition, clip.duration, nextClip.duration),
  })
}

function startTransitionHandleDrag(event, handle) {
  transitionDragState = { clipId: handle.id }
  focusTransition(handle.id)
  updateTransitionDurationByTrackPosition(handle.id, event.clientX)
  window.addEventListener('mousemove', onTransitionHandleDrag)
  window.addEventListener('mouseup', stopTransitionHandleDrag)
}

function onTransitionHandleDrag(event) {
  if (!transitionDragState) return
  updateTransitionDurationByTrackPosition(transitionDragState.clipId, event.clientX)
}

function stopTransitionHandleDrag() {
  transitionDragState = null
  window.removeEventListener('mousemove', onTransitionHandleDrag)
  window.removeEventListener('mouseup', stopTransitionHandleDrag)
}

async function toggleProjectPreviewPlay() {
  if (!hasTimelineClips.value) return

  if (previewPlaying.value) {
    cancelPendingPreviewPlayback()
    stopPreviewAnimation()
    previewPlaying.value = false
    if (projectPreviewEl.value) projectPreviewEl.value.pause()
    if (previewVideoEl.value) previewVideoEl.value.pause()
    if (previewOverlayEl.value) previewOverlayEl.value.pause()
    return
  }

  const startTime = getTimelinePreviewStartTime()
  stopPreviewAnimation()
  if (previewVideoEl.value) previewVideoEl.value.pause()
  if (previewOverlayEl.value) previewOverlayEl.value.pause()

  const renderedPreviewReady = await renderProjectPreview()
  if (renderedPreviewReady && projectPreviewSrc.value) {
    previewPlaybackMode.value = 'rendered'
    timelinePreviewActive.value = true
    updateProjectPreviewTime(startTime)
    await nextTick()

    const renderedPreviewEl = projectPreviewEl.value
    if (renderedPreviewEl) {
      try { renderedPreviewEl.currentTime = startTime } catch {}
      renderedPreviewEl.playbackRate = 1
      try {
        await renderedPreviewEl.play()
        return
      } catch {
        previewPlaybackMode.value = 'live'
      }
    } else {
      previewPlaybackMode.value = 'live'
    }
  }

  previewPlaybackMode.value = 'live'
  previewPlaying.value = true
  timelinePreviewActive.value = true
  previewPlaybackStartedAt = performance.now()
  previewPlaybackStartedProjectTime = startTime
  applyLivePreviewState(startTime, true)
  previewPlaybackFrame = requestAnimationFrame(onPreviewPlaybackFrame)
}

function restartProjectPreview() {
  if (!hasTimelineClips.value) return
  cancelPendingPreviewPlayback()
  stopPreviewAnimation()
  previewPlaybackMode.value = 'live'
  if (projectPreviewEl.value) projectPreviewEl.value.pause()
  if (previewVideoEl.value) previewVideoEl.value.pause()
  if (previewOverlayEl.value) previewOverlayEl.value.pause()
  previewPlaying.value = false
  timelinePreviewActive.value = false
  updateProjectPreviewTime(0)
  applyLivePreviewState(0, false)
}

function removeClipById(clipId) {
  setClipsNormalized(clips.value.filter((clip) => clip.id !== clipId))
  if (selectedClipId.value === clipId) selectedClipId.value = null
  if (transitionFocusClipId.value === clipId) transitionFocusClipId.value = null
  if (transitionFocusClipId.value && !clips.value.some((clip) => clip.id === transitionFocusClipId.value)) {
    transitionFocusClipId.value = null
  }
}

function removeAudioOverlayById(overlayId) {
  setAudioOverlaysNormalized(audioOverlays.value.filter((overlay) => overlay.id !== overlayId))
  if (selectedAudioOverlayId.value === overlayId) selectedAudioOverlayId.value = null
}

// --- Watermark overlay CRUD ---

function addWatermarkOverlay() {
  if (!hasTimelineClips.value) {
    error.value = 'Add at least one video clip before placing watermark overlays on the timeline.'
    return
  }
  pushUndo()
  const overlay = makeWatermarkOverlay()
  watermarkOverlays.value = [...watermarkOverlays.value, overlay]
  selectedWatermarkOverlayId.value = overlay.id
  selectedClipId.value = null
  selectedAudioOverlayId.value = null
  selectedTextOverlayId.value = null
  inspectorOpen.value = true
  invalidateProjectPreview()
}

function selectWatermarkOverlay(id) {
  selectedWatermarkOverlayId.value = id
  selectedClipId.value = null
  selectedAudioOverlayId.value = null
  selectedTextOverlayId.value = null
  transitionFocusClipId.value = null
  inspectorOpen.value = true
  // Auto-scrub timeline so the overlay is visible in the preview
  const overlay = watermarkOverlays.value.find((o) => o.id === id)
  if (overlay) {
    const start = Number(overlay.timelineStart) || 0
    const end = start + (Number(overlay.duration) || 3)
    const t = timelinePreviewProjectTime.value
    if (t < start || t >= end) {
      updateProjectPreviewTime(start + 0.05, true)
      applyLivePreviewState(start + 0.05, false)
    }
  }
}

function normalizeWatermarkOverlay(overlay) {
  const durationValue = Math.max(0.5, Number(overlay.duration) || 3)
  const start = Math.max(0, Math.min(Number(overlay.timelineStart) || 0, Math.max(0, totalTimelineDuration.value - durationValue)))
  const fadeIn = Math.max(0, Math.min(Number(overlay.fadeIn) || 0, durationValue / 2))
  const fadeOut = Math.max(0, Math.min(Number(overlay.fadeOut) || 0, durationValue / 2))
  return {
    ...overlay,
    mode: overlay.mode === 'image' ? 'image' : 'text',
    text: String(overlay.text || ''),
    imagePath: String(overlay.imagePath || ''),
    fontFamily: overlay.fontFamily || 'sans-serif',
    fontSize: Math.max(8, Math.min(120, Number(overlay.fontSize) || 24)),
    fontWeight: overlay.fontWeight || 'bold',
    color: overlay.color || '#ffffff',
    opacity: Math.max(0.05, Math.min(1, Number(overlay.opacity) || 0.3)),
    position: overlay.position || 'bottom-right',
    customX: Math.max(0, Math.min(100, Number(overlay.customX) || 90)),
    customY: Math.max(0, Math.min(100, Number(overlay.customY) || 90)),
    scale: Math.max(5, Math.min(400, Number(overlay.scale) || 100)),
    rotation: Math.max(-180, Math.min(180, Number(overlay.rotation) || 0)),
    margin: Math.max(0, Math.min(200, Number(overlay.margin) || 20)),
    shadow: !!overlay.shadow,
    shadowColor: overlay.shadowColor || '#000000',
    shadowBlur: Math.max(0, Math.min(20, Number(overlay.shadowBlur) || 4)),
    tileSpacing: Math.max(50, Math.min(600, Number(overlay.tileSpacing) || 200)),
    tileAngle: Math.max(-90, Math.min(90, Number(overlay.tileAngle) || -30)),
    timelineStart: start,
    duration: durationValue,
    fadeIn,
    fadeOut,
  }
}

function updateWatermarkOverlayById(id, updates, skipUndo = false) {
  if (!skipUndo) pushUndo()
  watermarkOverlays.value = watermarkOverlays.value.map((w) => {
    if (w.id !== id) return w
    return normalizeWatermarkOverlay({ ...w, ...updates })
  })
  invalidateProjectPreview()
}

function removeWatermarkOverlayById(id) {
  pushUndo()
  watermarkOverlays.value = watermarkOverlays.value.filter((w) => w.id !== id)
  if (selectedWatermarkOverlayId.value === id) selectedWatermarkOverlayId.value = null
  invalidateProjectPreview()
}

async function pickWatermarkImageForOverlay(id) {
  try {
    const result = await videoEditorBridge.selectWatermarkImage()
    if (!result?.path) return
    updateWatermarkOverlayById(id, { imagePath: result.path, mode: 'image' })
  } catch (err) {
    error.value = `Failed to pick watermark image: ${err?.message || err}`
  }
}

function startWatermarkOverlayDrag(event, overlayId) {
  const laneEl = timelineLaneScrollEl.value
  if (!laneEl || !totalTimelineDuration.value) return
  const overlay = watermarkOverlays.value.find((w) => w.id === overlayId)
  if (!overlay) return
  watermarkOverlayDragState = {
    overlayId,
    startX: event.clientX,
    startTimelineStart: overlay.timelineStart,
  }
  pushUndo()
  selectWatermarkOverlay(overlayId)
  window.addEventListener('mousemove', onWatermarkOverlayDrag)
  window.addEventListener('mouseup', stopWatermarkOverlayDrag)
}

function onWatermarkOverlayDrag(event) {
  if (!watermarkOverlayDragState || !timelineLaneScrollEl.value || !totalTimelineDuration.value) return
  const trackRect = timelineLaneScrollEl.value.getBoundingClientRect()
  const overlay = watermarkOverlays.value.find((w) => w.id === watermarkOverlayDragState.overlayId)
  if (!overlay || trackRect.width <= 0) return
  const deltaPct = (event.clientX - watermarkOverlayDragState.startX) / trackRect.width
  const deltaTime = deltaPct * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  updateWatermarkOverlayById(watermarkOverlayDragState.overlayId, {
    timelineStart: Math.max(0, Math.min(watermarkOverlayDragState.startTimelineStart + deltaTime, Math.max(0, totalTimelineDuration.value - overlay.duration))),
  }, true)
}

function stopWatermarkOverlayDrag() {
  watermarkOverlayDragState = null
  window.removeEventListener('mousemove', onWatermarkOverlayDrag)
  window.removeEventListener('mouseup', stopWatermarkOverlayDrag)
}

function startWatermarkOverlayResize(event, overlayId, edge) {
  const laneEl = timelineLaneScrollEl.value
  if (!laneEl || !totalTimelineDuration.value) return
  const overlay = watermarkOverlays.value.find((w) => w.id === overlayId)
  if (!overlay) return
  watermarkOverlayResizeState = {
    overlayId,
    edge,
    startX: event.clientX,
    originalStart: overlay.timelineStart,
    originalDuration: overlay.duration,
  }
  pushUndo()
  selectWatermarkOverlay(overlayId)
  window.addEventListener('mousemove', onWatermarkOverlayResize)
  window.addEventListener('mouseup', stopWatermarkOverlayResize)
}

function onWatermarkOverlayResize(event) {
  if (!watermarkOverlayResizeState || !timelineLaneScrollEl.value || !totalTimelineDuration.value) return
  const trackRect = timelineLaneScrollEl.value.getBoundingClientRect()
  if (trackRect.width <= 0) return
  const deltaPct = (event.clientX - watermarkOverlayResizeState.startX) / trackRect.width
  const deltaTime = deltaPct * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  const minDuration = 0.5
  const maxTimeline = totalTimelineDuration.value

  if (watermarkOverlayResizeState.edge === 'left') {
    const maxStart = watermarkOverlayResizeState.originalStart + watermarkOverlayResizeState.originalDuration - minDuration
    const timelineStart = Math.max(0, Math.min(maxStart, watermarkOverlayResizeState.originalStart + deltaTime))
    const duration = Math.max(minDuration, watermarkOverlayResizeState.originalDuration - (timelineStart - watermarkOverlayResizeState.originalStart))
    updateWatermarkOverlayById(watermarkOverlayResizeState.overlayId, { timelineStart, duration }, true)
    return
  }

  const maxDuration = Math.max(minDuration, maxTimeline - watermarkOverlayResizeState.originalStart)
  const duration = Math.max(minDuration, Math.min(maxDuration, watermarkOverlayResizeState.originalDuration + deltaTime))
  updateWatermarkOverlayById(watermarkOverlayResizeState.overlayId, { duration }, true)
}

function stopWatermarkOverlayResize() {
  watermarkOverlayResizeState = null
  window.removeEventListener('mousemove', onWatermarkOverlayResize)
  window.removeEventListener('mouseup', stopWatermarkOverlayResize)
}

// --- Text overlay CRUD ---

function addTextOverlay() {
  if (!hasTimelineClips.value) return
  pushUndo()
  const id = `text-${nextTextOverlayId++}`
  textOverlays.value = [...textOverlays.value, {
    id,
    text: 'Title',
    fontFamily: 'sans-serif',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: '',
    positionX: 50,
    positionY: 85,
    timelineStart: 0,
    duration: 3,
    fadeIn: 0.3,
    fadeOut: 0.3,
  }]
  selectedTextOverlayId.value = id
  selectedClipId.value = null
  selectedAudioOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  invalidateProjectPreview()
}

function selectTextOverlay(id) {
  selectedTextOverlayId.value = id
  selectedClipId.value = null
  selectedAudioOverlayId.value = null
  selectedWatermarkOverlayId.value = null
  transitionFocusClipId.value = null
  inspectorOpen.value = true
  // Auto-scrub timeline so the overlay is visible in the preview
  const overlay = textOverlays.value.find((o) => o.id === id)
  if (overlay) {
    const start = Number(overlay.timelineStart) || 0
    const end = start + (Number(overlay.duration) || 3)
    const t = timelinePreviewProjectTime.value
    if (t < start || t >= end) {
      updateProjectPreviewTime(start + 0.05, true)
      applyLivePreviewState(start + 0.05, false)
    }
  }
}

function updateTextOverlayById(id, updates, skipUndo = false) {
  if (!skipUndo) pushUndo()
  textOverlays.value = textOverlays.value.map((t) => t.id === id ? { ...t, ...updates } : t)
  invalidateProjectPreview()
}

function removeTextOverlayById(id) {
  pushUndo()
  textOverlays.value = textOverlays.value.filter((t) => t.id !== id)
  if (selectedTextOverlayId.value === id) selectedTextOverlayId.value = null
  invalidateProjectPreview()
}

// --- Text overlay drag ---
let textOverlayDragState = null

function startTextOverlayDrag(event, overlayId) {
  const laneEl = timelineLaneScrollEl.value
  if (!laneEl || !totalTimelineDuration.value) return
  const overlay = textOverlays.value.find((t) => t.id === overlayId)
  if (!overlay) return
  textOverlayDragState = {
    overlayId,
    startX: event.clientX,
    startTimelineStart: overlay.timelineStart,
  }
  pushUndo()
  selectTextOverlay(overlayId)
  window.addEventListener('mousemove', onTextOverlayDrag)
  window.addEventListener('mouseup', stopTextOverlayDrag)
}

function onTextOverlayDrag(event) {
  if (!textOverlayDragState || !timelineLaneScrollEl.value || !totalTimelineDuration.value) return
  const trackRect = timelineLaneScrollEl.value.getBoundingClientRect()
  const overlay = textOverlays.value.find((t) => t.id === textOverlayDragState.overlayId)
  if (!overlay || trackRect.width <= 0) return
  const deltaPct = (event.clientX - textOverlayDragState.startX) / trackRect.width
  const deltaTime = deltaPct * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  updateTextOverlayById(textOverlayDragState.overlayId, {
    timelineStart: Math.max(0, Math.min(textOverlayDragState.startTimelineStart + deltaTime, Math.max(0, totalTimelineDuration.value - overlay.duration))),
  }, true)
}

function stopTextOverlayDrag() {
  textOverlayDragState = null
  window.removeEventListener('mousemove', onTextOverlayDrag)
  window.removeEventListener('mouseup', stopTextOverlayDrag)
}

function startTextOverlayResize(event, overlayId, edge) {
  const laneEl = timelineLaneScrollEl.value
  if (!laneEl || !totalTimelineDuration.value) return
  const overlay = textOverlays.value.find((t) => t.id === overlayId)
  if (!overlay) return
  textOverlayResizeState = {
    overlayId,
    edge,
    startX: event.clientX,
    originalStart: overlay.timelineStart,
    originalDuration: overlay.duration,
  }
  pushUndo()
  selectTextOverlay(overlayId)
  window.addEventListener('mousemove', onTextOverlayResize)
  window.addEventListener('mouseup', stopTextOverlayResize)
}

function onTextOverlayResize(event) {
  if (!textOverlayResizeState || !timelineLaneScrollEl.value || !totalTimelineDuration.value) return
  const trackRect = timelineLaneScrollEl.value.getBoundingClientRect()
  if (trackRect.width <= 0) return
  const deltaPct = (event.clientX - textOverlayResizeState.startX) / trackRect.width
  const deltaTime = deltaPct * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  const minDuration = 0.5
  const maxTimeline = totalTimelineDuration.value

  if (textOverlayResizeState.edge === 'left') {
    const maxStart = textOverlayResizeState.originalStart + textOverlayResizeState.originalDuration - minDuration
    const timelineStart = Math.max(0, Math.min(maxStart, textOverlayResizeState.originalStart + deltaTime))
    const duration = Math.max(minDuration, textOverlayResizeState.originalDuration - (timelineStart - textOverlayResizeState.originalStart))
    updateTextOverlayById(textOverlayResizeState.overlayId, { timelineStart, duration }, true)
    return
  }

  const maxDuration = Math.max(minDuration, maxTimeline - textOverlayResizeState.originalStart)
  const duration = Math.max(minDuration, Math.min(maxDuration, textOverlayResizeState.originalDuration + deltaTime))
  updateTextOverlayById(textOverlayResizeState.overlayId, { duration }, true)
}

function stopTextOverlayResize() {
  textOverlayResizeState = null
  window.removeEventListener('mousemove', onTextOverlayResize)
  window.removeEventListener('mouseup', stopTextOverlayResize)
}

function rippleDeleteSelectedClip() {
  if (!selectedClip.value) return
  const currentIndex = clips.value.findIndex((clip) => clip.id === selectedClip.value.id)
  const nextSelection = clips.value[currentIndex + 1] || clips.value[currentIndex - 1] || null
  removeClipById(selectedClip.value.id)
  if (nextSelection) selectedClipId.value = nextSelection.id
}

function splitSelectedClipAtPlayhead() {
  if (!canSplitSelectedClip.value || !selectedClip.value) return
  const current = selectedClip.value
  const splitTime = currentTime.value
  const leftClip = {
    ...current,
    id: `clip-${nextClipId++}`,
    endTime: splitTime,
    duration: splitTime - current.startTime,
    fadeOut: 0,
    transitionDuration: 0,
    transitionType: 'fade',
    audioTransitionCurve: 'tri',
    thumbnail: '',
    thumbnailLoading: true,
  }
  const rightClip = {
    ...current,
    id: `clip-${nextClipId++}`,
    startTime: splitTime,
    duration: current.endTime - splitTime,
    fadeIn: 0,
    thumbnail: '',
    thumbnailLoading: true,
  }

  const index = clips.value.findIndex((clip) => clip.id === current.id)
  const nextClips = [...clips.value]
  nextClips.splice(index, 1, leftClip, rightClip)
  setClipsNormalized(nextClips)
  selectedClipId.value = rightClip.id
  transitionFocusClipId.value = null
  queueClipThumbnail(leftClip)
  queueClipThumbnail(rightClip)
  loadClip(rightClip.id)
  successMsg.value = 'Clip split at playhead.'
  error.value = ''
}

function onClipDragStart(clipId) {
  dragClipId.value = clipId
}

function onClipDrop(targetClipId) {
  if (!dragClipId.value || dragClipId.value === targetClipId) return
  const fromIndex = clips.value.findIndex((clip) => clip.id === dragClipId.value)
  const toIndex = clips.value.findIndex((clip) => clip.id === targetClipId)
  if (fromIndex < 0 || toIndex < 0) return
  const next = [...clips.value]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  setClipsNormalized(next)
  dragClipId.value = null
}

function onClipDragEnd() {
  dragClipId.value = null
}

async function addVideos() {
  try {
    const result = await videoEditorBridge.selectVideoFiles()
    const paths = Array.isArray(result?.paths) ? result.paths : []
    if (!paths.length) return

    const existing = new Set(sourceVideos.value.map((source) => normalizeRawPath(source.path).toLowerCase()))
    const additions = []

    for (const filePath of paths) {
      const raw = normalizeRawPath(filePath)
      const key = raw.toLowerCase()
      if (!raw || existing.has(key)) continue
      existing.add(key)
      additions.push({
        id: nextSourceId++,
        path: raw,
        name: raw.split(/[\\/]/).pop() || 'Video',
        duration: 0,
      })
    }

    if (!additions.length) return
    sourceVideos.value = [...sourceVideos.value, ...additions]
    selectedSourceId.value = additions[0].id
    successMsg.value = `${additions.length} video${additions.length === 1 ? '' : 's'} added to the editor.`
    error.value = ''
  } catch (err) {
    error.value = `Failed to add videos: ${err?.message || err}`
  }
}

async function addAudioOverlays() {
  if (!hasTimelineClips.value) {
    error.value = 'Add at least one video clip before placing audio overlays on the timeline.'
    return
  }

  try {
    const result = await videoEditorBridge.selectAudioFiles()
    const paths = Array.isArray(result?.paths) ? result.paths : []
    if (!paths.length) return

    const existing = new Set(audioOverlays.value.map((overlay) => normalizeRawPath(overlay.inputPath).toLowerCase()))
    const additions = []

    for (const filePath of paths) {
      const raw = normalizeRawPath(filePath)
      const key = raw.toLowerCase()
      if (!raw || existing.has(key)) continue
      existing.add(key)
      const sourceDuration = await loadMediaDuration(raw)
      additions.push(makeAudioOverlay(raw, sourceDuration))
    }

    if (!additions.length) return
    setAudioOverlaysNormalized([...audioOverlays.value, ...additions])
    selectedAudioOverlayId.value = additions[0].id
    selectedClipId.value = null
    selectedTextOverlayId.value = null
    selectedWatermarkOverlayId.value = null
    transitionFocusClipId.value = null
    successMsg.value = `${additions.length} audio overlay${additions.length === 1 ? '' : 's'} added to the timeline.`
    error.value = ''
  } catch (err) {
    error.value = `Failed to add audio overlays: ${err?.message || err}`
  }
}

const showCloseConfirm = ref(false)

function confirmClose() {
  if (clips.value.length || audioOverlays.value.length || textOverlays.value.length || watermarkOverlays.value.length) {
    showCloseConfirm.value = true
  } else {
    emit('close')
  }
}

function dismissCloseConfirm() {
  showCloseConfirm.value = false
}

function forceClose() {
  showCloseConfirm.value = false
  emit('close')
}

async function saveTrim() {
  saving.value = true
  exportProgress.value = -1
  error.value = ''
  successMsg.value = ''

  const onProgress = (event) => {
    if (event.data && event.data.__electronIpc === 'video-export-progress') {
      exportProgress.value = event.data.payload.percent
    }
  }
  window.addEventListener('message', onProgress)

  try {
    const payload = buildComposePayload()
    const audioPayload = buildAudioOverlayPayload()

    const result = await videoEditorBridge.composeVideo({
      clips: payload,
      audioOverlays: audioPayload,
      textOverlays: buildTextOverlayPayload(),
      watermarkOverlays: buildWatermarkOverlayPayload(),
      exportPreset: exportPreset.value,
    })

    if (result?.success) {
      successMsg.value = `Saved to ${String(result.outputPath || '').split(/[\\/]/).pop()}`
      emit('saved', result.outputPath)
      return
    }

    error.value = result?.error || 'Failed to export video.'
  } catch (err) {
    error.value = `Failed to export video: ${err?.message || err}`
  } finally {
    window.removeEventListener('message', onProgress)
    saving.value = false
    exportProgress.value = -1
  }
}

watch(selectedSourceId, (nextSourceIdValue, previousSourceIdValue) => {
  if (previousSourceIdValue) rememberSelection()
  if (!nextSourceIdValue) return
  const nextSource = sourceVideos.value.find((source) => source.id === nextSourceIdValue)
  duration.value = nextSource?.duration || 0
  applyDraftForSource(nextSourceIdValue)
  sourcePlaying.value = false
})

watch(selectedClipNext, (nextClip) => {
  if (!nextClip && transitionFocusClipId.value === selectedClipId.value) {
    transitionFocusClipId.value = null
  }
})

watch(audioOverlays, (nextOverlays) => {
  if (selectedAudioOverlayId.value && !nextOverlays.some((overlay) => overlay.id === selectedAudioOverlayId.value)) {
    selectedAudioOverlayId.value = null
  }
}, { deep: true })

watch(watermarkOverlays, (nextOverlays) => {
  if (selectedWatermarkOverlayId.value && !nextOverlays.some((overlay) => overlay.id === selectedWatermarkOverlayId.value)) {
    selectedWatermarkOverlayId.value = null
  }
}, { deep: true })

// --- Undo / Redo ---

function captureState() {
  return {
    clips: JSON.parse(JSON.stringify(clips.value)),
    audioOverlays: JSON.parse(JSON.stringify(audioOverlays.value)),
    textOverlays: JSON.parse(JSON.stringify(textOverlays.value)),
    watermarkOverlays: JSON.parse(JSON.stringify(watermarkOverlays.value)),
  }
}

function pushUndo() {
  undoStack.value = [...undoStack.value.slice(-(MAX_UNDO - 1)), captureState()]
  redoStack.value = []
}

function undo() {
  if (!undoStack.value.length) return
  const current = captureState()
  redoStack.value = [...redoStack.value, current]
  const prev = undoStack.value[undoStack.value.length - 1]
  undoStack.value = undoStack.value.slice(0, -1)
  clips.value = prev.clips
  audioOverlays.value = prev.audioOverlays
  textOverlays.value = prev.textOverlays || []
  watermarkOverlays.value = prev.watermarkOverlays || []
  invalidateProjectPreview()
}

function redo() {
  if (!redoStack.value.length) return
  const current = captureState()
  undoStack.value = [...undoStack.value, current]
  const next = redoStack.value[redoStack.value.length - 1]
  redoStack.value = redoStack.value.slice(0, -1)
  clips.value = next.clips
  audioOverlays.value = next.audioOverlays
  textOverlays.value = next.textOverlays || []
  watermarkOverlays.value = next.watermarkOverlays || []
  invalidateProjectPreview()
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

// --- Clipboard (Copy / Paste Attributes) ---

const COPYABLE_ATTRS = [
  'fadeIn', 'fadeOut', 'volume', 'muted', 'exposure', 'contrast', 'saturation',
  'temperature', 'tint', 'stabilize', 'stabilizeMode', 'wobbleRepair', 'wobbleCrop',
  'clarity', 'videoDenoise', 'audioDenoise', 'speechFocus', 'loudnessNormalize',
  'peakLimiter', 'speed', 'scale', 'posX', 'posY',
]

function copyClipAttributes() {
  if (!selectedClip.value) return
  const attrs = {}
  for (const key of COPYABLE_ATTRS) attrs[key] = selectedClip.value[key]
  clipboardAttrs.value = attrs
  successMsg.value = 'Clip attributes copied.'
}

function pasteClipAttributes() {
  if (!selectedClip.value || !clipboardAttrs.value) return
  pushUndo()
  updateClipById(selectedClip.value.id, clipboardAttrs.value)
  successMsg.value = 'Clip attributes pasted.'
}

// --- Remove Source Video ---

function removeSourceVideo(sourceId) {
  const hasClips = clips.value.some((clip) => clip.sourceId === sourceId)
  if (hasClips) {
    error.value = 'Remove all clips from this source before removing the source.'
    return
  }
  sourceVideos.value = sourceVideos.value.filter((source) => source.id !== sourceId)
  if (selectedSourceId.value === sourceId) {
    selectedSourceId.value = sourceVideos.value[0]?.id || null
  }
  const { [sourceId]: _, ...rest } = draftRanges.value
  draftRanges.value = rest
}

// --- Timeline Scrub ---

const timelinePlayheadPct = computed(() => {
  if (totalTimelineDuration.value <= 0) return 0
  return (timelinePreviewProjectTime.value / totalTimelineDuration.value) * 100
})

function scrubTimelineAtEvent(event) {
  const trackEl = rulerTrackEl.value
  if (!trackEl || totalTimelineDuration.value <= 0) return
  const rect = trackEl.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const projectTime = pct * totalTimelineDuration.value
  if (previewPlaybackMode.value === 'rendered') {
    previewPlaybackMode.value = 'live'
    if (projectPreviewEl.value) projectPreviewEl.value.pause()
  }
  timelinePreviewActive.value = true
  applyLivePreviewState(projectTime, false)
}

function startTimelineScrub(event) {
  scrubTimelineAtEvent(event)
  timelineScrubState = { active: true }
  window.addEventListener('mousemove', onTimelineScrubDrag)
  window.addEventListener('mouseup', stopTimelineScrub)
}

function onTimelineScrubDrag(event) {
  if (!timelineScrubState) return
  scrubTimelineAtEvent(event)
}

function stopTimelineScrub() {
  timelineScrubState = null
  window.removeEventListener('mousemove', onTimelineScrubDrag)
  window.removeEventListener('mouseup', stopTimelineScrub)
}

// --- Snap logic ---

function getSnapTargets() {
  if (!snapEnabled.value) return []
  const targets = [0, totalTimelineDuration.value]
  for (const seg of timelineTrackLayout.value) {
    targets.push(seg.timelineStart)
    targets.push(seg.timelineStart + seg.duration)
  }
  return [...new Set(targets)]
}

function snapTime(time, trackWidth) {
  if (!snapEnabled.value || trackWidth <= 0) return time
  const total = totalTimelineDuration.value
  const targets = getSnapTargets()
  for (const target of targets) {
    const pxDist = Math.abs((target - time) / total * trackWidth)
    if (pxDist < SNAP_THRESHOLD_PX) return target
  }
  return time
}

// --- Ripple Trim (drag clip edges on timeline) ---

function startRippleTrim(event, clipId, edge) {
  const clip = clips.value.find((c) => c.id === clipId)
  if (!clip) return
  event.stopPropagation()
  rippleTrimState = { clipId, edge, startX: event.clientX, originalStart: clip.startTime, originalEnd: clip.endTime }
  window.addEventListener('mousemove', onRippleTrimDrag)
  window.addEventListener('mouseup', stopRippleTrim)
}

function onRippleTrimDrag(event) {
  if (!rippleTrimState || !timelineLaneScrollEl.value || totalTimelineDuration.value <= 0) return
  const rect = timelineLaneScrollEl.value.getBoundingClientRect()
  if (rect.width <= 0) return
  const timeDelta = ((event.clientX - rippleTrimState.startX) / rect.width) * totalTimelineDuration.value / Math.max(1, timelineZoom.value)
  const clip = clips.value.find((c) => c.id === rippleTrimState.clipId)
  if (!clip) return
  if (rippleTrimState.edge === 'left') {
    const newStart = Math.max(0, Math.min(rippleTrimState.originalStart + timeDelta, clip.endTime - 0.1))
    pushUndo()
    updateClipById(clip.id, { startTime: newStart, duration: clip.endTime - newStart })
  } else {
    const newEnd = Math.max(clip.startTime + 0.1, rippleTrimState.originalEnd + timeDelta)
    pushUndo()
    updateClipById(clip.id, { endTime: newEnd, duration: newEnd - clip.startTime })
  }
}

function stopRippleTrim() {
  rippleTrimState = null
  window.removeEventListener('mousemove', onRippleTrimDrag)
  window.removeEventListener('mouseup', stopRippleTrim)
}

// --- Save / Load Project ---

function serializeProject() {
  return JSON.stringify({
    version: 1,
    sourceVideos: sourceVideos.value.map((s) => ({ path: s.path, name: s.name })),
    clips: clips.value.map(({ thumbnail, thumbnailLoading, ...rest }) => rest),
    audioOverlays: audioOverlays.value,
    textOverlays: textOverlays.value,
    watermarkOverlays: watermarkOverlays.value,
    exportPreset: exportPreset.value,
  }, null, 2)
}

function downloadProjectFile() {
  const data = serializeProject()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pluto-project-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  successMsg.value = 'Project saved to file.'
}

function loadProjectFromFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const project = JSON.parse(text)
      if (!project?.version || !Array.isArray(project.clips)) {
        error.value = 'Invalid project file.'
        return
      }
      pushUndo()
      const existing = new Set(sourceVideos.value.map((s) => normalizeRawPath(s.path).toLowerCase()))
      for (const src of project.sourceVideos || []) {
        const raw = normalizeRawPath(src.path)
        if (!raw || existing.has(raw.toLowerCase())) continue
        existing.add(raw.toLowerCase())
        sourceVideos.value.push({ id: nextSourceId++, path: raw, name: src.name || raw.split(/[\\/]/).pop(), duration: 0 })
      }
      clips.value = normalizeClipSequence(project.clips.map((c) => ({
        ...c,
        id: `clip-${nextClipId++}`,
        thumbnail: '',
        thumbnailLoading: true,
      })))
      audioOverlays.value = normalizeAudioOverlaySequence(project.audioOverlays || [])
      textOverlays.value = (project.textOverlays || []).map((t) => ({ ...t, id: `text-${nextTextOverlayId++}` }))
      if (Array.isArray(project.watermarkOverlays)) {
        watermarkOverlays.value = project.watermarkOverlays.map((w) => normalizeWatermarkOverlay(makeWatermarkOverlay({ ...w, id: `watermark-${nextWatermarkOverlayId++}` })))
      } else if (project.watermark?.enabled) {
        watermarkOverlays.value = [normalizeWatermarkOverlay(makeWatermarkOverlay({ ...project.watermark, id: `watermark-${nextWatermarkOverlayId++}`, timelineStart: 0, duration: Math.max(0.5, totalTimelineDuration.value || 3) }))]
      } else {
        watermarkOverlays.value = []
      }
      if (project.exportPreset) exportPreset.value = project.exportPreset
      clips.value.forEach((clip) => queueClipThumbnail(clip))
      invalidateProjectPreview()
      successMsg.value = 'Project loaded.'
    } catch (err) {
      error.value = `Failed to load project: ${err?.message || err}`
    }
  }
  input.click()
}

// --- Inspector toggle ---

function toggleInspectorSection(section) {
  inspectorCollapsed.value = { ...inspectorCollapsed.value, [section]: !inspectorCollapsed.value[section] }
}

function isInspectorSectionOpen(section) {
  return !inspectorCollapsed.value[section]
}

// --- Clip settings badge helpers ---

function getClipBadges(segment) {
  const badges = []
  if (segment.speed !== 1) badges.push(`${segment.speed.toFixed(2)}x`)
  if (segment.transitionDuration > 0.01) badges.push(formatTransitionLabel(segment.transitionType).substring(0, 4))
  if (segment.fadeIn > 0 || segment.fadeOut > 0) badges.push('Fade')
  if (segment.exposure !== 0 || segment.contrast !== 100 || segment.saturation !== 100) badges.push('Color')
  if (segment.temperature !== 0 || segment.tint !== 0) badges.push('WB')
  if (segment.stabilize > 0 || segment.wobbleRepair > 0) badges.push('Stab')
  if (segment.clarity > 0 || segment.videoDenoise > 0) badges.push('Fix')
  if (segment.audioDenoise > 0 || segment.speechFocus) badges.push('Audio')
  if (segment.loudnessNormalize || segment.peakLimiter) badges.push('Norm')
  if (segment.muted) badges.push('Muted')
  if (segment.scale !== 100 || segment.posX !== 0 || segment.posY !== 0) badges.push('Frame')
  if (segment.letterbox > 0 || segment.vignette > 0 || segment.grain > 0 || segment.blur > 0) badges.push('FX')
  if (segment.lutPath) badges.push('LUT')
  if (segment.chromakeyColor) badges.push('Key')
  return badges
}

// --- Preview transform with scale/position ---

function buildPreviewTransformFull(clip) {
  if (!clip) return 'none'
  const rotation = normalizeRotation(clip.rotation)
  const rotScale = rotation % 180 !== 0 ? 0.56 : 1
  const scale = (Number(clip.scale) || 100) / 100
  const posX = Number(clip.posX) || 0
  const posY = Number(clip.posY) || 0
  const parts = []
  if (posX || posY) parts.push(`translate(${posX}%, ${posY}%)`)
  if (rotation) parts.push(`rotate(${rotation}deg)`)
  parts.push(`scale(${(rotScale * scale).toFixed(3)})`)
  return parts.join(' ') || 'none'
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

function nudgeSourcePlayhead(delta) {
  if (!sourceVideoEl.value || duration.value <= 0) return
  const nextTime = Math.max(0, Math.min(duration.value, currentTime.value + delta))
  sourceVideoEl.value.currentTime = nextTime
  currentTime.value = nextTime
  rememberSelection()
}

function setTrimBoundary(boundary) {
  if (!duration.value) return
  if (boundary === 'in') {
    trimStart.value = Math.min(currentTime.value, trimEnd.value - 0.1)
  } else {
    trimEnd.value = Math.max(currentTime.value, trimStart.value + 0.1)
  }
  rememberSelection()
}

function closeHeaderMenu() {
  activeHeaderMenu.value = null
}

function toggleHeaderMenu(menuName) {
  activeHeaderMenu.value = activeHeaderMenu.value === menuName ? null : menuName
}

function onWindowPointerDown(event) {
  if (!activeHeaderMenu.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (fileMenuEl.value?.contains(target) || editMenuEl.value?.contains(target)) return
  closeHeaderMenu()
}

function onWindowKeydown(event) {
  if (event.key === 'Escape') {
    if (previewFullscreen.value) {
      previewFullscreen.value = false
      return
    }
    if (activeHeaderMenu.value) {
      closeHeaderMenu()
      return
    }
    if (showShortcutPanel.value) { showShortcutPanel.value = false; return }
    return
  }

  if (isEditableTarget(event.target)) return

  // Undo: Ctrl+Z
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
    return
  }

  // Redo: Ctrl+Shift+Z or Ctrl+Y
  if ((event.ctrlKey || event.metaKey) && (event.shiftKey && event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
    event.preventDefault()
    redo()
    return
  }

  // Copy attributes: Ctrl+C
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
    event.preventDefault()
    copyClipAttributes()
    return
  }

  // Paste attributes: Ctrl+V
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    pasteClipAttributes()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!saving.value && canExport.value) void saveTrim()
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    if (event.shiftKey && hasTimelineClips.value) {
      void toggleProjectPreviewPlay()
    } else {
      void toggleSourcePlay()
    }
    return
  }

  if (event.key.toLowerCase() === 'i') {
    event.preventDefault()
    setTrimBoundary('in')
    return
  }

  if (event.key.toLowerCase() === 'o') {
    event.preventDefault()
    setTrimBoundary('out')
    return
  }

  if (event.key.toLowerCase() === 'p' && hasTimelineClips.value) {
    event.preventDefault()
    void toggleProjectPreviewPlay()
    return
  }

  if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    splitSelectedClipAtPlayhead()
    return
  }

  // J-K-L playback control
  if (event.key.toLowerCase() === 'j') {
    event.preventDefault()
    sourcePlaybackRate.value = Math.max(-4, sourcePlaybackRate.value <= 0 ? sourcePlaybackRate.value - 1 : -1)
    if (sourceVideoEl.value) {
      sourceVideoEl.value.playbackRate = Math.abs(sourcePlaybackRate.value)
      if (sourcePlaybackRate.value < 0) {
        nudgeSourcePlayhead(-1 / 30)
      }
    }
    return
  }

  if (event.key.toLowerCase() === 'k') {
    event.preventDefault()
    sourcePlaybackRate.value = 1
    if (sourceVideoEl.value) {
      sourceVideoEl.value.pause()
      sourceVideoEl.value.playbackRate = 1
    }
    sourcePlaying.value = false
    return
  }

  if (event.key.toLowerCase() === 'l') {
    event.preventDefault()
    sourcePlaybackRate.value = Math.min(4, sourcePlaybackRate.value >= 1 ? sourcePlaybackRate.value + 1 : 1)
    if (sourceVideoEl.value) {
      sourceVideoEl.value.playbackRate = sourcePlaybackRate.value
      if (sourceVideoEl.value.paused) void sourceVideoEl.value.play().catch(() => {})
      sourcePlaying.value = true
    }
    return
  }

  // ? key — toggle shortcut panel
  if (event.key === '?') {
    event.preventDefault()
    showShortcutPanel.value = !showShortcutPanel.value
    return
  }

  // N — toggle snap
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault()
    snapEnabled.value = !snapEnabled.value
    successMsg.value = `Snapping ${snapEnabled.value ? 'enabled' : 'disabled'}`
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClip.value) {
    event.preventDefault()
    rippleDeleteSelectedClip()
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAudioOverlay.value) {
    event.preventDefault()
    removeAudioOverlayById(selectedAudioOverlay.value.id)
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTextOverlay.value) {
    event.preventDefault()
    removeTextOverlayById(selectedTextOverlay.value.id)
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedWatermarkOverlay.value) {
    event.preventDefault()
    removeWatermarkOverlayById(selectedWatermarkOverlay.value.id)
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    nudgeSourcePlayhead(event.shiftKey ? -1 : -(1 / 30))
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    nudgeSourcePlayhead(event.shiftKey ? 1 : (1 / 30))
  }
}

ensureInitialSource()

let previewStageResizeObserver = null

function updatePreviewStageDimensions() {
  const el = previewStageEl.value
  if (el) {
    previewStageWidth.value = el.clientWidth
    previewStageHeight.value = el.clientHeight
  }
}

onMounted(() => {
  previewUnmounted = false
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('pointerdown', onWindowPointerDown)
  loadBuiltinLuts()
  nextTick(() => {
    trimmerPanelEl.value?.focus()
    updatePreviewStageDimensions()
    if (previewStageEl.value) {
      previewStageResizeObserver = new ResizeObserver(() => updatePreviewStageDimensions())
      previewStageResizeObserver.observe(previewStageEl.value)
    }
  })
})

onBeforeUnmount(() => {
  previewUnmounted = true
  cancelPendingPreviewPlayback()
  stopPreviewAnimation()
  if (previewStageResizeObserver) {
    previewStageResizeObserver.disconnect()
    previewStageResizeObserver = null
  }
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('pointerdown', onWindowPointerDown)
  stopTimelinePreview({ pauseVideo: true })
  stopTrimDrag()
  stopTransitionHandleDrag()
  stopAudioOverlayDrag()
  stopLayoutResize()
  stopTimelineScrub()
  stopRippleTrim()
  stopWatermarkOverlayDrag()
  stopWatermarkOverlayResize()
  stopTextOverlayResize()
  if (sourceVideoEl.value) sourceVideoEl.value.pause()
  if (previewVideoEl.value) previewVideoEl.value.pause()
  if (previewOverlayEl.value) previewOverlayEl.value.pause()
  if (chromakeyAnimFrame) { cancelAnimationFrame(chromakeyAnimFrame); chromakeyAnimFrame = null }
})
</script>

<style scoped>
.video-trimmer-overlay,
.video-trimmer-overlay *,
.video-trimmer-overlay *::before,
.video-trimmer-overlay *::after {
  box-sizing: border-box;
}

.video-trimmer-overlay,
.video-trimmer-panel,
.video-trimmer-panel button,
.video-trimmer-panel select,
.video-trimmer-panel input,
.video-trimmer-panel label,
.video-trimmer-panel span,
.video-trimmer-panel strong,
.video-trimmer-panel p {
  font-family: var(--font-sans, 'Inter Variable', Inter, 'Segoe UI', sans-serif);
}

.video-trimmer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  animation: overlay-in 0.2s ease;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.video-trimmer-panel {
  width: min(1360px, 97vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #13151b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  animation: panel-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes panel-pop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.trimmer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.trimmer-header h2 {
  margin: 0;
  color: #fff;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.header-subtitle {
  margin: 8px 0 0;
  max-width: 58ch;
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  line-height: 1.55;
}

.close-btn {
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.5);
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
}

.close-btn:hover {
  color: #fff;
}

.trimmer-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.editor-layout-v2 {
  display: grid;
  grid-template-areas:
    "source program program"
    "timeline timeline inspector";
  grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.2fr) clamp(320px, 28vw, 440px);
  grid-template-rows: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 0;
  min-height: 0;
  flex: 1;
}

.source-monitor {
  grid-area: source;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: #0c0c0e;
  overflow: hidden;
}

.source-monitor.collapsed {
  grid-template-rows: auto;
}

.monitor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 32px;
}

.monitor-toggle-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.monitor-toggle-btn:hover {
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.08);
}

.monitor-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.monitor-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-fullscreen-btn {
  margin-left: auto;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1;
}

.monitor-fullscreen-btn:hover {
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.08);
}

.source-monitor-body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  gap: 8px;
  padding: 8px 10px 10px;
}

.program-monitor {
  grid-area: program;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #0c0c0e;
}

.program-monitor .preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border: none;
  gap: 8px;
  padding: 8px 12px 10px;
}

.program-monitor.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8000;
  background: #000;
}

.program-monitor.fullscreen .monitor-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.92);
}

.program-monitor.fullscreen .preview-card {
  padding: 40px 0 0;
  background: #000;
}

.program-monitor.fullscreen .project-preview-card {
  background: #000;
}

.program-monitor.fullscreen .timeline-preview-stage {
  height: calc(100vh - 90px);
  contain: layout style;
}

.timeline-section {
  grid-area: timeline;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.timeline-section .timeline-workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 16px;
}

.inspector-panel {
  grid-area: inspector;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.015);
  overflow: hidden;
  min-height: 0;
}

.inspector-panel:not(.collapsed) {
  min-height: 0;
}

.inspector-panel.collapsed {
  min-height: 30px;
}

.inspector-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  background: rgba(255, 255, 255, 0.025);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  min-height: 30px;
  flex-shrink: 0;
}

.inspector-panel-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.inspector-panel-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.inspector-panel-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.inspector-tabs {
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.inspector-tab {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.inspector-tab:hover {
  color: rgba(255, 255, 255, 0.7);
}

.inspector-tab.active {
  color: #64d2ff;
  border-bottom-color: #64d2ff;
}

.inspector-tab-content {
  padding: 8px 12px;
  min-height: 0;
}

.inspector-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inspector-panel .clip-editor-card {
  padding: 12px;
  background: transparent;
  border: none;
}

.inspector-panel .clip-editor-head {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.inspector-panel .clip-editor-head .summary-label {
  color: rgba(147, 197, 253, 0.9);
}

.inspector-panel .clip-editor-head strong {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.25;
}

.inspector-panel .clip-editor-head .summary-meta {
  color: rgba(191, 219, 254, 0.9);
}

.inspector-panel .inspector-tab-content {
  padding: 10px 0 0;
}

.inspector-panel .inspector-tab-panel {
  gap: 8px;
}

.inspector-panel .inspector-section-title {
  margin: 10px 0 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.inspector-panel .chromakey-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inspector-panel .chromakey-picker {
  width: 32px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.inspector-panel .inspector-meta {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.inspector-panel .slider-field,
.inspector-panel .preset-field,
.inspector-panel .check-field {
  margin-top: 0;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.inspector-panel .slider-field,
.inspector-panel .preset-field {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.inspector-panel .preset-field {
  grid-template-columns: 110px minmax(0, 1fr);
}

.inspector-panel .check-field {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
}

.inspector-panel .slider-field > span,
.inspector-panel .preset-field > span {
  min-width: 0;
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  font-weight: 600;
}

.inspector-panel .slider-field strong {
  min-width: 58px;
  color: #93c5fd;
  font-size: 11px;
}

.inspector-panel .preset-select {
  width: 100%;
  min-width: 0;
}

.inspector-panel .fix-preset-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  justify-content: stretch;
}

.inspector-panel .fix-preset-row .mini-btn {
  width: 100%;
  justify-content: center;
}

.inspector-panel .clip-edit-actions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.timeline-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #f5f5f7;
}

.preview-card-header strong {
  display: block;
  margin-top: 2px;
  font-size: 16px;
  font-weight: 700;
}

.project-preview-card {
  background: linear-gradient(180deg, rgba(0, 240, 255, 0.05), rgba(255, 255, 255, 0.04));
}

.timeline-preview-video {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.timeline-preview-stage {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 200px;
  overflow: hidden;
}

.accurate-preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.timeline-preview-rendered {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.timeline-preview-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: rgba(255, 255, 255, 0.72);
}

.timeline-preview-empty-state strong {
  color: #fff;
  font-size: 18px;
}

.timeline-preview-empty-state span {
  max-width: 42ch;
  font-size: 13px;
  line-height: 1.5;
}

.timeline-preview-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  will-change: opacity, transform;
}

.rendered-preview-layer {
  transform: translateZ(0);
}

.timeline-preview-layer.overlay {
  pointer-events: none;
}

.timeline-preview-layer.chromakey-canvas {
  pointer-events: none;
  z-index: 2;
  image-rendering: auto;
}

/* Cinematic effect preview overlays */
.preview-letterbox-top,
.preview-letterbox-bottom {
  position: absolute;
  left: 0;
  right: 0;
  background: #000;
  z-index: 5;
  pointer-events: none;
}
.preview-letterbox-top { top: 0; }
.preview-letterbox-bottom { bottom: 0; }

.preview-vignette {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.preview-grain {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 0 0 / 4px 4px;
  animation: grainShift 0.12s steps(2) infinite;
  mix-blend-mode: overlay;
}

@keyframes grainShift {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-2px, 1px); }
  100% { transform: translate(1px, -1px); }
}

/* Preview loading spinner */
.preview-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10;
  pointer-events: none;
}

.preview-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spinPreview 0.7s linear infinite;
}

.preview-loading-text {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

@keyframes spinPreview {
  to { transform: rotate(360deg); }
}

.source-strip {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
}

.source-chip,
.add-video-btn,
.ctrl-btn,
.action-btn,
.btn-cancel,
.btn-save,
.mini-btn,
.preset-select {
  border-radius: 8px;
  font-size: 14px;
}

.source-chip,
.add-video-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.source-chip.active {
  background: rgba(0, 240, 255, 0.1);
  border-color: rgba(0, 240, 255, 0.45);
}

.source-chip-name {
  max-width: 180px;
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.source-chip-meta,
.summary-label,
.summary-meta,
.timeline-hint,
.drag-hint {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

.summary-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-meta {
  font-weight: 600;
}

.add-video-btn {
  justify-content: center;
  font-weight: 600;
}

.video-container {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
  border-radius: 12px;
}

.source-video-container {
  min-height: 0;
}

.source-video-container video {
  transition: transform 0.18s ease;
}

.source-video-container.rotated-quarter-turn {
  min-height: 0;
}

.video-container video {
  display: block;
  width: 100%;
  height: min(40vh, 360px);
  max-height: min(40vh, 360px);
  object-fit: contain;
  background: #000;
}

.program-monitor .video-container video {
  height: 100%;
  max-height: none;
}

.source-monitor .video-container video {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.source-monitor .preview-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 6px;
  padding: 8px;
  overflow: hidden;
}

.source-monitor .source-strip {
  gap: 6px;
}

.source-monitor .source-video-container {
  flex: 1 1 auto;
  min-height: 64px;
}

.source-monitor .source-video-container.rotated-quarter-turn {
  min-height: 64px;
}

.source-monitor .trim-timeline {
  margin-top: 2px;
}

.source-monitor .source-chip,
.source-monitor .add-video-btn {
  padding: 6px 8px;
  font-size: 11px;
}

.source-monitor .source-chip-name {
  font-size: 12px;
}

.source-monitor .source-chip-meta {
  font-size: 11px;
}

.source-monitor .ctrl-btn,
.source-monitor .action-btn {
  padding: 5px 8px;
  font-size: 11px;
}

.source-monitor .controls-row {
  gap: 6px;
  flex-wrap: nowrap;
}

.source-monitor .controls-row .time-display {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-monitor .selection-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: auto;
}

.source-monitor .selection-actions .action-btn {
  min-width: 0;
  width: 100%;
  padding: 5px 6px;
  font-size: 10px;
  line-height: 1.15;
}

.source-monitor .time-display {
  font-size: 12px;
}

.source-monitor .trim-info {
  gap: 6px;
}

.source-monitor .trim-time {
  padding: 6px 8px;
}

.source-monitor .trim-time label {
  margin-bottom: 3px;
  font-size: 10px;
}

.source-monitor .trim-time span {
  font-size: 11px;
}

.controls-row,
.selection-actions,
.trimmer-actions,
.clip-edit-actions,
.summary-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.ctrl-btn,
.action-btn,
.mini-btn {
  padding: 8px 14px;
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.ctrl-btn:hover,
.action-btn:hover,
.mini-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.ctrl-btn.secondary,
.action-btn.secondary {
  color: rgba(255, 255, 255, 0.78);
}

.time-display,
.trim-time span,
.clip-duration {
  font-family: var(--font-mono, 'SF Mono', Consolas, Menlo, monospace);
}

.time-display {
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  font-weight: 600;
}

.preview-status {
  padding: 5px 10px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.preview-status.active {
  color: #dffeff;
  border-color: rgba(0, 240, 255, 0.35);
  background: rgba(0, 240, 255, 0.1);
}

.preview-status.disabled {
  opacity: 0.58;
}

.trim-timeline {
  position: relative;
  height: 48px;
  user-select: none;
}

.timeline-track {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  height: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
}

.trim-region {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 240, 255, 0.2);
  border-top: 2px solid rgba(0, 240, 255, 0.6);
  border-bottom: 2px solid rgba(0, 240, 255, 0.6);
}

.playhead {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 24px;
  background: #fff;
  transform: translateX(-1px);
  pointer-events: none;
}

.trim-handle {
  position: absolute;
  top: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 32px;
  transform: translateX(-7px);
  cursor: ew-resize;
}

.handle-bar {
  width: 6px;
  height: 24px;
  background: rgba(0, 240, 255, 0.8);
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
}

.trim-handle:hover .handle-bar {
  background: #00f0ff;
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
}

.trim-info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.trim-time,
.timeline-summary-card,
.clip-editor-card,
.timeline-list {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.trim-time {
  flex: 1;
  padding: 10px 12px;
  text-align: center;
}

.trim-time label {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.trim-time span {
  color: #00f0ff;
  font-size: 17px;
  font-weight: 700;
}

.timeline-summary-card,
.clip-editor-card {
  padding: 14px 16px;
  color: #f5f5f7;
}

.timeline-summary-card strong,
.clip-editor-card strong {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.timeline-secondary-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.timeline-controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  flex-shrink: 0;
}

.timeline-options-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
}

.timeline-options-zoom {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.timeline-options-label {
  color: rgba(255, 255, 255, 0.58);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 0 0 auto;
}

.timeline-options-snap {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.timeline-zoom-control {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.timeline-zoom-control span {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.78);
}

.timeline-zoom-control input[type='range'] {
  width: 140px;
}

.timeline-zoom-value {
  min-width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #f8fafc;
}

.summary-topline {
  justify-content: space-between;
}

.preset-field,
.slider-field,
.check-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.preset-field {
  justify-content: space-between;
}

.fix-preset-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.preset-select {
  min-width: 148px;
  padding: 8px 10px;
  color: #f5f5f7;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.timeline-hint {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
}

.timeline-ruler-card {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.timeline-ruler-scale {
  position: relative;
  height: 20px;
}

.timeline-ruler-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 10px;
}

.ruler-tick {
  position: absolute;
  top: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  transform: translateX(-50%);
}

.ruler-tick::after {
  content: '';
  position: absolute;
  top: 14px;
  left: 50%;
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.16);
}

.timeline-ruler-track {
  position: relative;
  height: 46px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.ruler-segment {
  position: absolute;
  top: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 36px;
  height: 30px;
  padding: 0 10px;
  color: #dffeff;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(0, 240, 255, 0.08));
  border: 1px solid rgba(0, 240, 255, 0.28);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.ruler-segment.active {
  border-color: rgba(255, 255, 255, 0.65);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.ruler-segment.transition-target,
.timeline-clip.transition-target {
  box-shadow: 0 0 0 1px rgba(0, 240, 255, 0.45), 0 0 18px rgba(0, 240, 255, 0.12);
}

.ruler-transition {
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.transition-bridge {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  margin: -2px 0 2px;
}

.transition-bridge-line {
  position: absolute;
  left: 26px;
  right: 26px;
  height: 1px;
  background: linear-gradient(90deg, rgba(0, 240, 255, 0.18), rgba(255, 255, 255, 0.22), rgba(0, 240, 255, 0.18));
}

.transition-pill {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: rgba(225, 250, 255, 0.9);
  background: rgba(11, 16, 22, 0.92);
  border: 1px solid rgba(0, 240, 255, 0.18);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.transition-pill strong {
  color: #00f0ff;
  font-weight: 700;
}

.transition-drag-handle {
  position: absolute;
  top: 5px;
  z-index: 3;
  width: 18px;
  height: 34px;
  padding: 0;
  background: transparent;
  border: none;
  transform: translateX(-50%);
  cursor: ew-resize;
}

.transition-drag-core {
  display: block;
  width: 8px;
  height: 100%;
  margin: 0 auto;
  background: rgba(8, 12, 18, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(0, 240, 255, 0.12);
}

.transition-drag-handle.active .transition-drag-core,
.transition-drag-handle:hover .transition-drag-core {
  border-color: rgba(255, 255, 255, 0.72);
  box-shadow: 0 0 0 1px rgba(0, 240, 255, 0.28), 0 0 14px rgba(0, 240, 255, 0.18);
}

.transition-edit-label {
  display: block;
  margin-top: 4px;
  color: rgba(0, 240, 255, 0.78);
  font-size: 11px;
}

.transition-bridge.active .transition-pill {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.transition-fade .transition-pill,
.ruler-segment.transition-fade {
  background-image: linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(0, 240, 255, 0.08));
}

.transition-fadeblack .transition-pill,
.ruler-segment.transition-fadeblack {
  background-image: linear-gradient(135deg, rgba(8, 10, 14, 0.92), rgba(0, 240, 255, 0.12));
}

.transition-wipeleft .transition-pill,
.ruler-segment.transition-wipeleft {
  background-image: linear-gradient(90deg, rgba(0, 240, 255, 0.05) 0%, rgba(0, 240, 255, 0.32) 45%, rgba(255, 255, 255, 0.1) 46%, rgba(255, 255, 255, 0.1) 54%, rgba(0, 240, 255, 0.1) 55%, rgba(0, 240, 255, 0.22) 100%);
}

.transition-wiperight .transition-pill,
.ruler-segment.transition-wiperight {
  background-image: linear-gradient(270deg, rgba(0, 240, 255, 0.05) 0%, rgba(0, 240, 255, 0.32) 45%, rgba(255, 255, 255, 0.1) 46%, rgba(255, 255, 255, 0.1) 54%, rgba(0, 240, 255, 0.1) 55%, rgba(0, 240, 255, 0.22) 100%);
}

.transition-slideleft .transition-pill,
.ruler-segment.transition-slideleft {
  background-image: linear-gradient(135deg, rgba(0, 240, 255, 0.18) 0%, rgba(0, 240, 255, 0.18) 42%, rgba(255, 255, 255, 0.22) 43%, rgba(255, 255, 255, 0.08) 57%, rgba(0, 240, 255, 0.08) 58%, rgba(0, 240, 255, 0.24) 100%);
}

.transition-slideright .transition-pill,
.ruler-segment.transition-slideright {
  background-image: linear-gradient(225deg, rgba(0, 240, 255, 0.18) 0%, rgba(0, 240, 255, 0.18) 42%, rgba(255, 255, 255, 0.22) 43%, rgba(255, 255, 255, 0.08) 57%, rgba(0, 240, 255, 0.08) 58%, rgba(0, 240, 255, 0.24) 100%);
}

.clip-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.inspector-section-title {
  margin: 12px 0 2px;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.slider-field span:first-child,
.check-field span {
  min-width: 96px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 13px;
  font-weight: 600;
}

.slider-field input {
  flex: 1;
}

.slider-field strong {
  min-width: 68px;
  color: #00f0ff;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.slider-field.disabled,
.preset-field.disabled {
  opacity: 0.65;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  flex: 1;
  padding: 10px;
  overflow: hidden;
  overflow-y: auto;
}

.timeline-lane-scroll {
  overflow-x: auto;
  overflow-y: auto;
  padding-bottom: 10px;
}

.timeline-clip-lane {
  position: relative;
  min-height: 320px;
}

.timeline-lane-section {
  position: relative;
}

.timeline-video-section {
  min-height: 154px;
}

.timeline-audio-section {
  min-height: 82px;
  margin-top: 8px;
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.timeline-track-section-label {
  position: absolute;
  top: 0;
  left: 0;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.empty-audio-track {
  display: flex;
  align-items: center;
  height: 68px;
  padding: 0 14px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.empty-timeline {
  padding: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  line-height: 1.6;
}

.timeline-clip {
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}

.timeline-clip-block {
  position: absolute;
  top: 24px;
  min-width: 0;
  height: 112px;
}

.timeline-clip.active {
  border-color: rgba(0, 240, 255, 0.45);
}

.timeline-clip.dragging {
  opacity: 0.55;
}

.timeline-clip-main {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.timeline-clip-block .timeline-clip-main {
  min-width: 0;
}

.clip-thumb-wrap {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 46px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.clip-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clip-thumb.placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.clip-order {
  position: absolute;
  top: 6px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  color: #00f0ff;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.clip-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.timeline-clip-block .clip-copy strong,
.timeline-clip-block .clip-copy span,
.timeline-clip-block .clip-settings-line {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.clip-copy strong,
.clip-duration {
  color: #f5f5f7;
}

.clip-copy strong {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.clip-copy span {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  line-height: 1.45;
}

.clip-settings-line {
  color: rgba(0, 240, 255, 0.66);
}

.clip-duration {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
}

.timeline-clip-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 8px;
}

.transition-bridge-block {
  position: absolute;
  top: 148px;
  transform: translateX(-50%);
  width: 168px;
}

.audio-overlay-block {
  position: absolute;
  top: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 58px;
  padding: 0 12px;
  color: #f5f5f7;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.12));
  border: 1px solid rgba(96, 165, 250, 0.28);
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.22);
  cursor: grab;
  user-select: none;
}

.audio-overlay-block.active {
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 10px 24px rgba(2, 6, 23, 0.28);
}

.audio-overlay-block:active {
  cursor: grabbing;
}

.audio-overlay-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.audio-overlay-copy strong,
.audio-overlay-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-overlay-copy strong,
.audio-overlay-duration {
  color: #f8fafc;
}

.audio-overlay-copy span {
  color: rgba(226, 232, 240, 0.78);
  font-size: 12px;
}

.audio-overlay-duration {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
}

.audio-overlay-remove {
  flex-shrink: 0;
}

/* --- Text Overlay Timeline --- */

.timeline-text-section {
  margin-top: 8px;
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.timeline-text-section .timeline-track-section-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-add-btn {
  padding: 1px 7px !important;
  font-size: 10px !important;
  letter-spacing: 0;
  text-transform: none;
}

.empty-text-track {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 14px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.text-overlay-block {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 46px;
  padding: 0 10px;
  color: #f5f5f7;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(236, 72, 153, 0.14));
  border: 1px solid rgba(192, 132, 252, 0.3);
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(2, 6, 23, 0.2);
  cursor: grab;
  user-select: none;
}

.timeline-overlay-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  z-index: 3;
  cursor: ew-resize;
}

.timeline-overlay-resize-handle.left {
  left: 0;
  border-left: 2px solid rgba(255, 255, 255, 0.32);
}

.timeline-overlay-resize-handle.right {
  right: 0;
  border-right: 2px solid rgba(255, 255, 255, 0.32);
}

.text-overlay-block.active .timeline-overlay-resize-handle.left,
.text-overlay-block.active .timeline-overlay-resize-handle.right,
.text-overlay-block:hover .timeline-overlay-resize-handle.left,
.text-overlay-block:hover .timeline-overlay-resize-handle.right {
  border-color: rgba(255, 255, 255, 0.85);
}

.text-overlay-block.active {
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 8px 20px rgba(2, 6, 23, 0.28);
}

.text-overlay-block:active {
  cursor: grabbing;
}

.text-overlay-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.text-overlay-copy strong,
.text-overlay-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-overlay-copy strong {
  color: #f8fafc;
  font-size: 13px;
}

.text-overlay-copy span {
  color: rgba(226, 232, 240, 0.7);
  font-size: 11px;
}

.text-overlay-remove {
  flex-shrink: 0;
  padding: 2px 5px !important;
  font-size: 14px !important;
  line-height: 1;
}

/* --- Overlay Bounds Container --- */

.overlay-bounds-container {
  z-index: 10;
  pointer-events: none;
}

/* --- Text Overlay Preview --- */

.text-overlay-preview {
  position: absolute;
  z-index: 10;
  padding: 6px 14px;
  border-radius: 4px;
  pointer-events: auto;
  cursor: pointer;
  white-space: pre-wrap;
  text-align: center;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7), 0 0 2px rgba(0, 0, 0, 0.5);
  transition: opacity 0.1s ease, outline-color 0.15s ease;
}

/* --- Selected overlay highlight --- */

.overlay-selected {
  outline: 2px dashed rgba(100, 180, 255, 0.85);
  outline-offset: 3px;
}

/* --- Text Overlay Inspector --- */

.text-overlay-input {
  flex: 1;
  padding: 5px 8px;
  color: #f5f5f7;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  outline: none;
}

.text-overlay-input:focus {
  border-color: rgba(255, 255, 255, 0.28);
}

.text-overlay-select {
  flex: 1;
  padding: 5px 8px;
  color: #f5f5f7;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  outline: none;
  cursor: pointer;
}

.text-overlay-select:focus {
  border-color: rgba(255, 255, 255, 0.28);
}

.text-input-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-field input[type="color"] {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  cursor: pointer;
}

.mini-btn.danger {
  color: #ff7b7b;
  border-color: rgba(255, 123, 123, 0.3);
}

.mini-btn:disabled,
.action-btn:disabled,
.btn-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.trimmer-actions {
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 20px;
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.btn-save {
  padding: 10px 24px;
  color: #000;
  background: linear-gradient(135deg, #00f0ff, #a855f7);
  border: none;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.92;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.export-progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 6px;
}
.export-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00f0ff, #a855f7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.trim-error,
.trim-success {
  margin-top: 12px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.trim-error {
  color: #ff8080;
}

.trim-success {
  color: #00ff88;
}

/* Align the video editor with the ImageEditor visual system. */
.video-trimmer-overlay {
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(30px) saturate(1.2);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

.video-trimmer-panel {
  width: 94vw;
  height: 90vh;
  max-height: 90vh;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

.trimmer-header {
  position: relative;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.035);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.trimmer-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: #f5f5f7;
  letter-spacing: 0.01em;
}

.header-subtitle {
  margin: 4px 0 0;
  max-width: 72ch;
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  line-height: 1.45;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.65);
  font-size: 18px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.95);
}

.trimmer-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.editor-layout-v2 {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.source-monitor-body::-webkit-scrollbar,
.inspector-panel-body::-webkit-scrollbar,
.timeline-ruler-scroll::-webkit-scrollbar,
.timeline-lane-scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.source-monitor-body::-webkit-scrollbar-thumb,
.inspector-panel-body::-webkit-scrollbar-thumb,
.timeline-ruler-scroll::-webkit-scrollbar-thumb,
.timeline-lane-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.source-monitor-body::-webkit-scrollbar-thumb:hover,
.inspector-panel-body::-webkit-scrollbar-thumb:hover,
.timeline-ruler-scroll::-webkit-scrollbar-thumb:hover,
.timeline-lane-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
  background-clip: padding-box;
}

.source-monitor-body::-webkit-scrollbar-track,
.inspector-panel-body::-webkit-scrollbar-track,
.timeline-ruler-scroll::-webkit-scrollbar-track,
.timeline-lane-scroll::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
}

.preview-card {
  gap: 10px;
  padding: 12px;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
}

.project-preview-card {
  background: #141416;
}

.preview-card-header strong,
.timeline-summary-card strong,
.clip-editor-card strong,
.clip-copy strong,
.timeline-preview-empty-state strong {
  color: #e4e4e8;
}

.summary-label,
.inspector-section-title {
  color: rgba(255, 255, 255, 0.35);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-meta,
.source-chip-meta,
.timeline-hint,
.drag-hint,
.clip-copy span,
.time-display,
.trim-time label,
.preview-status,
.ruler-transition,
.transition-edit-label,
.empty-timeline,
.header-subtitle {
  color: rgba(255, 255, 255, 0.4);
}

.source-chip,
.add-video-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.62);
}

.source-chip:hover,
.add-video-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.82);
}

.source-chip.active {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.3);
  color: #dbeafe;
}

.source-chip-name {
  color: #e4e4e8;
}

.source-monitor .monitor-meta {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.82);
  letter-spacing: 0.01em;
}

.timeline-summary-card .summary-topline {
  align-items: center;
  gap: 10px;
}

.timeline-summary-card .summary-topline > div {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.timeline-summary-card .summary-label {
  color: rgba(191, 219, 254, 0.86);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
}

.timeline-summary-card .summary-topline strong {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.timeline-summary-card .summary-meta {
  color: rgba(191, 219, 254, 0.72);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.video-container,
.accurate-preview-stage {
  background: #000;
  border-radius: 10px;
}

.ctrl-btn,
.action-btn,
.mini-btn,
.preset-select,
.zoom-control-row {
  border-radius: 7px;
}

.ctrl-btn,
.action-btn,
.mini-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11.5px;
  font-weight: 500;
}

.ctrl-btn:hover,
.action-btn:hover,
.mini-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e8;
}

.ctrl-btn.secondary,
.action-btn.secondary,
.mini-btn.secondary {
  color: rgba(255, 255, 255, 0.58);
}

.selection-actions .action-btn,
.controls-row .ctrl-btn,
.clip-edit-actions .mini-btn,
.timeline-clip-actions .mini-btn {
  width: auto;
  min-width: 0;
  padding: 8px 12px;
}

.action-btn:not(.secondary):not(:disabled),
.btn-save {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  box-shadow: 0 2px 12px rgba(37, 99, 235, 0.2);
}

.action-btn:not(.secondary):not(:disabled):hover,
.btn-save:hover:not(:disabled) {
  background: #3b82f6;
  border-color: #3b82f6;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.7);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e8;
}

.mini-btn.danger {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.2);
}

.mini-btn.danger:hover {
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(127, 29, 29, 0.24);
}

.preset-select {
  min-width: 148px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e4e4e8;
}

.preset-select:focus,
.video-trimmer-panel input[type='number']:focus,
.video-trimmer-panel input[type='text']:focus {
  border-color: rgba(59, 130, 246, 0.4);
  outline: none;
}

.timeline-summary-card,
.clip-editor-card,
.timeline-list {
  background: transparent;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.035);
}

.timeline-summary-card,
.clip-editor-card {
  padding: 12px 16px 14px;
}

.timeline-workspace .timeline-summary-card,
.timeline-workspace .timeline-list {
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
}

.timeline-workspace .timeline-summary-card {
  padding: 14px 16px;
}

.timeline-list {
  gap: 8px;
  min-height: 0;
  padding: 12px 16px 20px;
}

.timeline-workspace .timeline-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

.empty-inspector-card {
  min-height: 220px;
  justify-content: flex-start;
}

.clip-editor-head {
  margin-bottom: 2px;
}

.slider-field,
.preset-field,
.check-field {
  margin-top: 10px;
}

.slider-field span:first-child,
.check-field span,
.preset-field > span {
  min-width: 110px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 500;
}

.slider-field strong,
.timeline-zoom-value,
.zoom-control-row strong,
.trim-time span,
.transition-pill strong,
.clip-order,
.clip-settings-line {
  color: #60a5fa;
}

.check-field input {
  accent-color: #3b82f6;
}

.video-trimmer-panel input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  outline: none;
  cursor: pointer;
  transition: background 0.15s;
}

.video-trimmer-panel input[type='range']:hover {
  background: rgba(255, 255, 255, 0.12);
}

.video-trimmer-panel input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e4e4e8;
  border: 2px solid #141416;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.12s ease;
}

.video-trimmer-panel input[type='range']::-webkit-slider-thumb:hover {
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(59, 130, 246, 0.3);
  transform: scale(1.1);
}

.video-trimmer-panel input[type='range']::-webkit-slider-thumb:active {
  background: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.video-trimmer-panel input[type='range']::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e4e4e8;
  border: 2px solid #141416;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.video-trimmer-panel input[type='range']::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
}

.zoom-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.timeline-zoom-control,
.zoom-control-row {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 6px 10px;
}

.trim-timeline {
  padding: 2px 0;
}

.timeline-track {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.trim-region {
  background: rgba(59, 130, 246, 0.18);
  border-top: 2px solid rgba(59, 130, 246, 0.62);
  border-bottom: 2px solid rgba(59, 130, 246, 0.62);
}

.playhead {
  background: rgba(255, 255, 255, 0.92);
}

.handle-bar {
  background: rgba(96, 165, 250, 0.95);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.34);
}

.trim-handle:hover .handle-bar {
  background: #93c5fd;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
}

.preview-status.active {
  color: #dbeafe;
  border-color: rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.12);
}

.timeline-ruler-card {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.ruler-tick {
  color: rgba(255, 255, 255, 0.42);
}

.ruler-tick::after,
.transition-bridge-line {
  background: rgba(255, 255, 255, 0.12);
}

.timeline-ruler-track {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.ruler-segment {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.24);
}

.ruler-segment.active,
.timeline-clip.active {
  border-color: rgba(59, 130, 246, 0.34);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
}

.ruler-segment.transition-target,
.timeline-clip.transition-target {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.36), 0 0 18px rgba(59, 130, 246, 0.1);
}

.transition-pill,
.transition-drag-core {
  background: rgba(20, 20, 22, 0.96);
  border-color: rgba(59, 130, 246, 0.18);
}

.transition-drag-handle.active .transition-drag-core,
.transition-drag-handle:hover .transition-drag-core,
.transition-bridge.active .transition-pill {
  border-color: rgba(59, 130, 246, 0.36);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12), 0 0 14px rgba(59, 130, 246, 0.12);
}

.timeline-clip {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.02));
  border-radius: 10px;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
}

.timeline-clip:hover {
  border-color: rgba(59, 130, 246, 0.24);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.08), rgba(255, 255, 255, 0.02));
}

.timeline-clip.active {
  border-color: rgba(96, 165, 250, 0.7);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.12));
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.28), 0 8px 20px rgba(37, 99, 235, 0.2);
}

.timeline-clip.active .clip-thumb-wrap {
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.45);
}

.timeline-clip.active .clip-copy strong,
.timeline-clip.active .clip-duration {
  color: #eff6ff;
}

.timeline-clip.active .clip-copy span {
  color: rgba(219, 234, 254, 0.85);
}

.clip-thumb-wrap {
  background: rgba(255, 255, 255, 0.08);
}

.clip-order {
  background: rgba(15, 23, 42, 0.82);
}

.trimmer-actions {
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.01);
}

.trim-error,
.trim-success {
  margin: 10px 16px 0;
  text-align: left;
}

/* ===== Header toolbar ===== */
.header-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.header-right-actions {
  position: absolute;
  right: 20px;
  top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 2;
}

.header-action-btn {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 6px 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.header-action-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.header-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.header-close-btn {
  font-size: 18px;
  line-height: 1;
  padding: 4px 10px;
}

.header-menubar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-dropdown {
  position: relative;
}

.menu-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 6px 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.menu-dropdown-trigger:hover {
  background: rgba(255, 255, 255, 0.14);
}

.menu-dropdown-list {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  min-width: 180px;
  padding: 6px;
  background: #181a1f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.45);
}

.menu-item {
  width: 100%;
  padding: 7px 10px;
  color: rgba(255, 255, 255, 0.86);
  background: transparent;
  border: none;
  border-radius: 6px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.045);
  overflow-x: auto;
}

.toolbar-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.toolbar-select {
  min-width: 88px;
  padding: 4px 6px;
  color: #f5f5f7;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  font-size: 11px;
}

.toolbar-select:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.5);
}

.toolbar-divider {
  width: 2px;
  height: 22px;
  background: rgba(255, 255, 255, 0.34);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  flex: 0 0 2px;
}

.toolbar-spacer {
  flex: 1 1 auto;
  min-width: 20px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
}

.toolbar-btn:active {
  transform: translateY(1px);
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-btn.active {
  color: #fff;
  border-color: rgba(52, 211, 153, 0.75);
  background: rgba(16, 185, 129, 0.22);
}

.toolbar-btn-project-save {
  border-color: rgba(96, 165, 250, 0.5);
  background: rgba(59, 130, 246, 0.22);
}

.toolbar-btn-project-save:hover {
  background: rgba(59, 130, 246, 0.32);
  border-color: rgba(96, 165, 250, 0.72);
}

.toolbar-btn-export-save {
  border-color: rgba(52, 211, 153, 0.6);
  background: rgba(16, 185, 129, 0.28);
  color: #ecfdf5;
}

.toolbar-btn-export-save:hover {
  background: rgba(16, 185, 129, 0.38);
  border-color: rgba(110, 231, 183, 0.78);
}

.timeline-zoom-slider {
  width: clamp(110px, 12vw, 180px) !important;
  min-width: 110px;
  max-width: 180px;
}

.zoom-control-row .mini-btn.active {
  color: #fff;
  border-color: rgba(52, 211, 153, 0.75);
  background: rgba(16, 185, 129, 0.22);
}

.toolbar-btn-cancel {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(239, 68, 68, 0.16);
}

.toolbar-btn-cancel:hover {
  background: rgba(239, 68, 68, 0.26);
  border-color: rgba(252, 165, 165, 0.65);
}

.header-export-progress-bar {
  height: 4px;
  margin-top: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.header-export-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #38bdf8);
  transition: width 0.15s ease;
}

/* ===== Source chip remove button ===== */
.source-chip {
  position: relative;
}

.source-chip-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(239, 68, 68, 0.7);
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  z-index: 2;
}

.source-chip:hover .source-chip-remove {
  opacity: 1;
}

.source-chip-remove:hover {
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
}

/* ===== Timeline playhead line ===== */
.timeline-playhead-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(-1px);
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
}

.timeline-playhead-line::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid rgba(255, 255, 255, 0.85);
}

.lane-playhead::before {
  display: none;
}

/* ===== Collapsible inspector sections ===== */
.inspector-section-title.collapsible {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  margin: 4px 0 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}

.inspector-section-title.collapsible:hover {
  color: rgba(255, 255, 255, 0.6);
}

.collapse-arrow {
  font-size: 10px;
  transition: transform 0.2s ease;
  color: rgba(255, 255, 255, 0.3);
}

.inspector-section-body {
  overflow: hidden;
}

/* ===== Clip badges (compact settings) ===== */
.clip-badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.clip-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.clip-badge-default {
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.06);
}

/* ===== Ripple trim handles ===== */
.ripple-trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  cursor: ew-resize;
  z-index: 5;
  transition: background 0.15s;
}

.ripple-trim-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  transition: background 0.15s;
}

.ripple-trim-left {
  left: -1px;
  border-radius: 10px 0 0 10px;
}

.ripple-trim-right {
  right: -1px;
  border-radius: 0 10px 10px 0;
}

.ripple-trim-handle:hover {
  background: rgba(59, 130, 246, 0.15);
}

.ripple-trim-handle:hover::after {
  background: rgba(96, 165, 250, 0.7);
}

/* ===== Snap toggle ===== */
.snap-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}

.snap-toggle input[type='checkbox'] {
  accent-color: #3b82f6;
  cursor: pointer;
}

/* ===== Empty inspector improved ===== */
.empty-inspector-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
  text-align: center;
}

.empty-inspector-icon {
  width: 56px;
  height: 56px;
  color: rgba(255, 255, 255, 0.15);
}

.empty-inspector-content .timeline-hint {
  margin: 0;
  max-width: 30ch;
}

.empty-inspector-shortcuts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 12px;
  margin-top: 4px;
}

.empty-inspector-shortcuts span {
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  font-family: var(--font-mono, 'SF Mono', Consolas, Menlo, monospace);
}

/* ===== Footer export preset ===== */
.trimmer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.trimmer-actions-left {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: auto;
}

.trimmer-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-preset-field {
  margin-top: 0;
}

.export-preset-field span {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 500;
}

/* ===== Keyboard shortcut panel ===== */
.shortcut-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 60000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  animation: overlay-in 0.15s ease;
}

.shortcut-panel {
  width: min(640px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #1a1a1e;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: panel-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.shortcut-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.shortcut-panel-header strong {
  color: #e4e4e8;
  font-size: 15px;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px;
  padding: 20px;
}

.shortcut-group h4 {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.shortcut-row kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 7px;
  color: #e4e4e8;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  font-family: var(--font-mono, 'SF Mono', Consolas, Menlo, monospace);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.shortcut-row span {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

@media (max-width: 980px) {
  .editor-layout-v2 {
    grid-template-areas:
      "source"
      "program"
      "inspector"
      "timeline";
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto 1fr;
  }

  .source-monitor {
    border-right: none;
  }

  .timeline-section {
    border-right: none;
  }

  .inspector-panel {
    border-left: none;
  }
}

@media (max-width: 720px) {
  .video-trimmer-panel {
    width: 96vw;
    height: 94vh;
    max-height: 94vh;
  }

  .trimmer-header,
  .source-monitor-body {
    padding: 10px;
  }

  .header-title-row {
    align-items: flex-start;
  }

  .header-toolbar {
    flex-wrap: nowrap;
    padding: 8px;
    gap: 6px;
  }

  .toolbar-btn {
    padding: 6px 10px;
    font-size: 11px;
  }

  .toolbar-divider {
    height: 16px;
  }

  .timeline-summary-card,
  .clip-editor-card,
  .timeline-list,
  .trimmer-actions {
    padding-left: 14px;
    padding-right: 14px;
  }

  .trim-info,
  .preset-field,
  .slider-field,
  .check-field {
    flex-direction: column;
    align-items: stretch;
  }

  .zoom-control-row,
  .selection-actions .action-btn,
  .controls-row .ctrl-btn,
  .clip-edit-actions .mini-btn {
    width: 100%;
  }

  .timeline-options-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .timeline-options-zoom {
    width: 100%;
  }

  .timeline-options-snap {
    align-self: flex-start;
  }

  .timeline-clip-main {
    align-items: flex-start;
  }
}

/* --- Close Confirmation Dialog --- */

.confirm-close-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.confirm-close-dialog {
  background: #1e1e22;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 28px 32px;
  max-width: 380px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.confirm-close-dialog strong {
  display: block;
  font-size: 16px;
  color: #f5f5f7;
  margin-bottom: 8px;
}

.confirm-close-dialog p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 20px;
  line-height: 1.5;
}

.confirm-close-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.confirm-close-actions .mini-btn.danger {
  background: rgba(255, 59, 48, 0.2);
  color: #ff6b6b;
}

.confirm-close-actions .mini-btn.danger:hover {
  background: rgba(255, 59, 48, 0.35);
}

/* --- Watermark Panel --- */

.watermark-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.watermark-panel {
  background: #1e1e22;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  width: 440px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.watermark-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.watermark-panel-header strong {
  font-size: 15px;
  color: #f5f5f7;
}

.watermark-panel-body {
  padding: 16px 22px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.watermark-enable-toggle {
  margin-bottom: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.watermark-sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.watermark-sections.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.watermark-mode-row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.watermark-mode-row .mini-btn {
  flex: 1;
  text-align: center;
}

.mini-btn.active {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.3);
  color: #f5f5f7;
}

.watermark-image-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 8px;
}

.watermark-image-path {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.watermark-image-path.dim {
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
}

.watermark-position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 120px;
  margin: 6px 0 10px;
}

.pos-grid-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.pos-grid-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.pos-grid-btn.active {
  background: rgba(100, 149, 237, 0.25);
  border-color: rgba(100, 149, 237, 0.5);
}

.pos-grid-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
}

.pos-grid-btn.active .pos-grid-dot {
  background: #6495ed;
}

.watermark-toggle-btn {
  font-size: 12px;
}

.watermark-toggle-btn.active {
  background: rgba(100, 149, 237, 0.2);
  border-color: rgba(100, 149, 237, 0.4);
  color: #a8c4f0;
}

/* --- Watermark Preview --- */

.watermark-preview {
  position: absolute;
  z-index: 11;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.watermark-tile-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 11;
  pointer-events: auto;
  cursor: pointer;
  overflow: hidden;
}

.watermark-tile-inner {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.watermark-tile-item {
  position: absolute;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
}

.save-progress-overlay {
  position: fixed;
  inset: 0;
  z-index: 62000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(4px);
}

.save-progress-dialog {
  width: min(420px, 90vw);
  padding: 18px 20px;
  border-radius: 12px;
  background: #171a1f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  color: #f8fafc;
}

.save-progress-dialog strong {
  display: block;
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 700;
}

.save-progress-dialog p {
  margin: 0 0 10px;
  color: rgba(226, 232, 240, 0.8);
  font-size: 13px;
}

.save-progress-spinner {
  width: 18px;
  height: 18px;
  margin-bottom: 8px;
  border: 2px solid rgba(255, 255, 255, 0.22);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.65s linear infinite;
}

.save-progress-bar {
  width: 100%;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.save-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #38bdf8);
  transition: width 0.22s ease;
}
</style>