<template>
  <Teleport to="body">
    <div class="editor-overlay" @click.self="$emit('close')">
      <div class="editor-panel">
        <div class="panel-header">
          <h2>Edit Photo</h2>
          <span class="file-name">{{ fileName }}</span>
          <div class="header-tools">
            <button class="header-btn" :disabled="!canUndo" @click="undo" title="Undo (Ctrl+Z)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button class="header-btn" :disabled="!canRedo" @click="redo" title="Redo (Ctrl+Y)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <span class="tool-divider"></span>
            <button class="header-btn" @click="zoomOut" :disabled="zoomLevel <= 0.25" title="Zoom Out">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <button class="zoom-preset" @click="resetZoom" title="Fit to View">Fit</button>
            <span class="zoom-label" @click="resetZoom" title="Reset Zoom">{{ zoomPercent }}%</span>
            <button class="zoom-preset" @click="zoomActualPixels" title="Actual Pixels">1:1</button>
            <button class="header-btn" @click="zoomIn" :disabled="zoomLevel >= 5" title="Zoom In">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </button>
            <span class="tool-divider"></span>
            <button class="header-btn" :class="{ active: compareMode }" @click="compareMode = !compareMode; renderCanvas()" title="Before / After (B)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
            <button class="header-btn" :class="{ active: showOriginal }" @mousedown="showOriginal = true" @mouseup="showOriginal = false" @mouseleave="showOriginal = false" title="Hold to compare">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <button class="btn-close" @click="$emit('close')">✕</button>
        </div>

        <div class="editor-body">
          <div class="canvas-area">
            <div class="canvas-wrapper" ref="canvasWrapper" @wheel="handleWheel"
              :class="{ 'is-panning': isPanning, 'can-pan': zoomLevel > 1 }"
              @mousedown="onWrapperMouseDown" @mousemove="onWrapperMouseMove"
              @mouseup="onWrapperMouseUp" @mouseleave="onWrapperMouseUp">
              <div class="canvas-container" ref="canvasContainer">
                <canvas ref="canvas" class="edit-canvas"
                  :class="{ 'eraser-active': eraserMode, 'bg-removed': bgRemoved, 'select-active': selectMode, 'draw-active': drawMode }"
                  @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove"
                  @mouseup="onCanvasMouseUp" @mouseleave="onCanvasMouseLeave"></canvas>
                <div v-if="(eraserMode || drawMode) && cursorVisible" class="eraser-cursor-ring"
                  :style="{ left: cursorPos.x + 'px', top: cursorPos.y + 'px', width: brushCursorSize + 'px', height: brushCursorSize + 'px',
                    borderColor: drawMode ? drawColor : 'rgba(255,255,255,0.85)' }"></div>
                <div v-if="cropMode" class="crop-overlay" @mousedown="onCropOverlayMouseDown" @mousemove="onCropOverlayMouseMove" @mouseup="onCropOverlayMouseUp" @dblclick.stop="applyCrop">
                  <div class="crop-box" v-if="cropRect.w > 0" :style="cropBoxStyle">
                    <div class="crop-grid"></div>
                    <div class="crop-dim-label">{{ realCropDimensions }}</div>
                    <!-- Move handle (entire box interior) -->
                    <div class="crop-move-area" @mousedown.stop="startCropMove($event)"></div>
                    <!-- Corner handles -->
                    <div class="crop-handle corner nw" @mousedown.stop="startCropResize('nw', $event)"></div>
                    <div class="crop-handle corner ne" @mousedown.stop="startCropResize('ne', $event)"></div>
                    <div class="crop-handle corner sw" @mousedown.stop="startCropResize('sw', $event)"></div>
                    <div class="crop-handle corner se" @mousedown.stop="startCropResize('se', $event)"></div>
                    <!-- Edge handles -->
                    <div class="crop-handle edge n" @mousedown.stop="startCropResize('n', $event)"></div>
                    <div class="crop-handle edge s" @mousedown.stop="startCropResize('s', $event)"></div>
                    <div class="crop-handle edge w" @mousedown.stop="startCropResize('w', $event)"></div>
                    <div class="crop-handle edge e" @mousedown.stop="startCropResize('e', $event)"></div>
                  </div>
                </div>
                <div v-if="selectMode" class="select-overlay" @mousedown="startSelect" @mousemove="moveSelect" @mouseup="endSelect">
                  <div class="select-box" v-if="selectRect.w > 0" :style="selectBoxStyle"></div>
                </div>
                <!-- Text items rendered on canvas -->
                <div v-for="item in textItems" v-show="!showOriginal && !compareMode" :key="item.id" class="text-overlay-item"
                  :class="{ selected: selectedTextId === item.id }"
                  :style="getTextOverlayStyle(item)"
                  @mousedown.stop="startDragText(item, $event)">
                  <span v-if="inlineTextEditId !== item.id" class="text-overlay-label" :style="getTextLabelStyle(item)" @dblclick.stop="beginInlineTextEdit(item)">{{ item.text }}</span>
                  <textarea v-else ref="inlineTextEditor" v-model="inlineTextDraft" class="text-inline-editor" :style="getInlineTextEditorStyle(item)"
                    rows="3" @mousedown.stop @keydown.stop.esc.prevent="finishInlineTextEdit(false)" @blur="finishInlineTextEdit(true)"></textarea>
                  <div v-if="selectedTextId === item.id && inlineTextEditId !== item.id" class="text-selection-frame">
                    <button class="text-handle rotate" title="Rotate text" @mousedown.stop.prevent="startRotateText(item, $event)"></button>
                    <button class="text-handle resize" title="Resize text" @mousedown.stop.prevent="startResizeText(item, $event)"></button>
                  </div>
                </div>
                <div v-if="snapGuideX !== null" class="snap-guide vertical" :style="{ left: snapGuideX + 'px' }"></div>
                <div v-if="snapGuideY !== null" class="snap-guide horizontal" :style="{ top: snapGuideY + 'px' }"></div>
                <!-- Before/After compare handle -->
                <div v-if="compareMode" class="compare-handle-wrap"
                  :style="{ left: compareSplit * 100 + '%' }"
                  @mousedown.stop.prevent="startCompareDrag($event)">
                  <div class="compare-handle-line"></div>
                  <div class="compare-handle-grip">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 8l3-4v8zM12 8l-3-4v8z"/></svg>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="removingBg || portraitProcessing" class="bg-loading-overlay">
              <div class="bg-spinner"></div>
              <p>{{ portraitProcessing ? 'Detecting subject...' : bgProgress || 'Removing background...' }}</p>
            </div>
          </div>

          <div class="controls-sidebar">
            <!-- Histogram -->
            <div class="histogram-wrap">
              <canvas ref="histogramCanvas" class="histogram-canvas" width="256" height="70"></canvas>
              <div class="histogram-badges">
                <span class="histogram-badge shadow" :class="{ active: shadowClipPercent > 0.2 }">Shadows {{ shadowClipPercent.toFixed(1) }}%</span>
                <span class="histogram-badge highlight" :class="{ active: highlightClipPercent > 0.2 }">Highlights {{ highlightClipPercent.toFixed(1) }}%</span>
              </div>
            </div>

            <!-- Tools -->
            <div class="control-section">
              <h3 @click="toggleSection('tools')"><span class="chevron" :class="{ open: openSections.tools }">›</span> Tools</h3>
              <div class="section-body" :class="{ open: openSections.tools }">
                <div class="quick-actions">
                  <button class="tool-btn labeled" @click="rotateImage(-90)" title="Rotate Left">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    <span class="tool-label">Rotate L</span>
                  </button>
                  <button class="tool-btn labeled" @click="rotateImage(90)" title="Rotate Right">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    <span class="tool-label">Rotate R</span>
                  </button>
                  <button class="tool-btn labeled" @click="flipImage('h')" title="Flip Horizontal">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18"/><path d="M16 7l4 5-4 5"/><path d="M8 7L4 12l4 5"/></svg>
                    <span class="tool-label">Flip H</span>
                  </button>
                  <button class="tool-btn labeled" @click="flipImage('v')" title="Flip Vertical">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h18"/><path d="M7 8L12 4l5 4"/><path d="M7 16l5 4 5-4"/></svg>
                    <span class="tool-label">Flip V</span>
                  </button>
                </div>
                <div class="quick-actions tool-row-main">
                  <button class="tool-btn labeled" :class="{ active: cropMode }" @click="toggleCropMode" title="Crop">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
                    <span class="tool-label">Crop</span>
                  </button>
                  <button class="tool-btn labeled" :class="{ active: eraserMode }" @click="toggleEraserMode" title="Eraser">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                    <span class="tool-label">Eraser</span>
                  </button>
                  <button class="tool-btn labeled" :class="{ active: selectMode }" @click="toggleSelectMode" title="Select">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 2"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>
                    <span class="tool-label">Select</span>
                  </button>
                  <button class="tool-btn labeled" :class="{ active: textMode }" @click="toggleTextMode" title="Text">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 4h12"/><path d="M12 4v16"/><path d="M9 20h6"/></svg>
                    <span class="tool-label">Text</span>
                  </button>
                  <button class="tool-btn labeled" :class="{ active: drawMode }" @click="toggleDrawMode" title="Draw">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    <span class="tool-label">Draw</span>
                  </button>
                  <button class="tool-btn labeled" @click="autoEnhance" title="Auto Enhance">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
                    <span class="tool-label">Auto</span>
                  </button>
                </div>
                <!-- Crop aspect ratios -->
                <div v-if="cropMode" class="sub-controls">
                  <label class="sub-label">Aspect Ratio</label>
                  <div class="ratio-btns">
                    <button v-for="r in cropRatios" :key="r.label" class="ratio-btn" :class="{ active: activeCropRatio === r.label }"
                      @click="setCropRatio(r)">{{ r.label }}</button>
                  </div>
                  <p class="tool-hint">Drag to create a crop area. Move it by dragging inside, or resize with the corner/edge handles. Double-click or press Enter to apply.</p>
                  <div class="sub-actions">
                    <button class="action-btn small inline-action" @click="applyCrop" :disabled="cropRect.w < 10 || cropRect.h < 10">Apply Crop</button>
                    <button class="action-btn small ghost-action" @click="cancelCrop">Cancel</button>
                  </div>
                </div>
                <!-- Eraser/Draw brush size -->
                <div v-if="eraserMode || drawMode" class="sub-controls">
                  <label class="sub-label">Brush Size <span class="val">{{ brushSize }}px</span></label>
                  <input type="range" min="2" max="120" v-model.number="brushSize" class="modern-slider" />
                </div>
                <!-- Draw color -->
                <div v-if="drawMode" class="sub-controls">
                  <label class="sub-label">Color</label>
                  <input type="color" v-model="drawColor" class="color-input" />
                </div>
                <!-- Straighten -->
                <div class="sub-controls" @dblclick="adjustments.straighten = 0">
                  <label class="sub-label">Straighten
                    <input type="number" class="val-input" min="-45" max="45" step="0.1"
                      :value="adjustments.straighten.toFixed(1)" @input="setStraighten($event)" @click.stop />°
                  </label>
                  <input type="range" min="-45" max="45" step="0.1" v-model.number="adjustments.straighten" class="modern-slider" />
                </div>
                <!-- Text settings -->
                <div v-if="textMode || selectedTextId" class="sub-controls">
                  <label class="sub-label">Text <span class="val">{{ selectedTextId ? 'Selected' : 'Click image to place' }}</span></label>
                  <textarea v-model="textInput" placeholder="Type text..." class="text-input text-area-input" rows="3"></textarea>
                  <p class="tool-hint">Click anywhere on the image to place text, then drag it to reposition.</p>
                  <div class="text-settings-row">
                    <input type="number" v-model.number="textFontSize" min="8" max="200" class="text-size-input" title="Font size" />
                    <select v-model="textFontFamily" class="text-font-select">
                      <option v-for="f in fonts" :key="f" :value="f">{{ f }}</option>
                    </select>
                    <input type="color" v-model="textColor" class="color-input" />
                    <button class="mini-btn" :class="{ active: textBold }" @click="textBold = !textBold" title="Bold"><b>B</b></button>
                    <button class="mini-btn" :class="{ active: textItalic }" @click="textItalic = !textItalic" title="Italic"><i>I</i></button>
                  </div>
                  <div class="text-settings-row">
                    <button class="mini-btn wide" :class="{ active: textAlign === 'left' }" @click="textAlign = 'left'" title="Align left">L</button>
                    <button class="mini-btn wide" :class="{ active: textAlign === 'center' }" @click="textAlign = 'center'" title="Align center">C</button>
                    <button class="mini-btn wide" :class="{ active: textAlign === 'right' }" @click="textAlign = 'right'" title="Align right">R</button>
                    <label class="mini-field grow">Rotate
                      <input type="range" min="-180" max="180" step="1" v-model.number="textRotation" class="modern-slider mini" />
                    </label>
                  </div>
                  <div class="text-settings-row text-effects-row">
                    <label class="mini-field">Shadow
                      <input type="range" min="0" max="100" step="1" v-model.number="textShadow" class="modern-slider mini" />
                    </label>
                    <label class="mini-field">Stroke
                      <input type="range" min="0" max="12" step="0.5" v-model.number="textStrokeWidth" class="modern-slider mini" />
                    </label>
                    <input type="color" v-model="textStrokeColor" class="color-input" title="Stroke color" />
                  </div>
                  <div class="sub-actions">
                    <button class="action-btn small inline-action" @click="addCenteredText">Add Center</button>
                    <button class="action-btn small inline-action" @click="duplicateSelectedText" :disabled="!selectedTextId">Duplicate</button>
                    <button class="action-btn small inline-action" @click="commitText" :disabled="!selectedTextId">Update</button>
                    <button class="action-btn small ghost-action" @click="removeSelectedText" :disabled="!selectedTextId">Delete</button>
                    <button class="action-btn small ghost-action" @click="finishTextEditing" :disabled="!selectedTextId && !textMode">Done</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Light -->
            <div class="control-section">
              <h3 @click="toggleSection('light')"><span class="chevron" :class="{ open: openSections.light }">›</span> Light <span v-if="hasLightEdits" class="section-reset" @click.stop="resetLightSection" title="Reset">↺</span></h3>
              <div class="section-body" :class="{ open: openSections.light }">
                <div class="slider-group" v-for="s in lightSliders" :key="s.key" @dblclick="resetSlider(s)">
                  <label>{{ s.label }}
                    <input type="number" class="val-input" :min="s.min" :max="s.max" :step="s.step || 1"
                      :value="adjustments[s.key]" @input="setSliderVal(s, $event)" @click.stop />
                  </label>
                  <input type="range" :min="s.min" :max="s.max" :step="s.step || 1" v-model.number="adjustments[s.key]" class="modern-slider" />
                </div>
              </div>
            </div>

            <!-- Color -->
            <div class="control-section">
              <h3 @click="toggleSection('color')"><span class="chevron" :class="{ open: openSections.color }">›</span> Color <span v-if="hasColorEdits" class="section-reset" @click.stop="resetColorSection" title="Reset">↺</span></h3>
              <div class="section-body" :class="{ open: openSections.color }">
                <div class="slider-group" v-for="s in colorSliders" :key="s.key" @dblclick="resetSlider(s)">
                  <label>{{ s.label }}
                    <input type="number" class="val-input" :min="s.min" :max="s.max" :step="s.step || 1"
                      :value="adjustments[s.key]" @input="setSliderVal(s, $event)" @click.stop />
                  </label>
                  <input type="range" :min="s.min" :max="s.max" :step="s.step || 1" v-model.number="adjustments[s.key]" class="modern-slider" />
                </div>
              </div>
            </div>

            <!-- Detail -->
            <div class="control-section">
              <h3 @click="toggleSection('detail')"><span class="chevron" :class="{ open: openSections.detail }">›</span> Detail <span v-if="hasDetailEdits" class="section-reset" @click.stop="resetDetailSection" title="Reset">↺</span></h3>
              <div class="section-body" :class="{ open: openSections.detail }">
                <div class="slider-group" v-for="s in detailSliders" :key="s.key" @dblclick="resetSlider(s)">
                  <label>{{ s.label }}
                    <input type="number" class="val-input" :min="s.min" :max="s.max" :step="s.step || 1"
                      :value="adjustments[s.key]" @input="setSliderVal(s, $event)" @click.stop />
                  </label>
                  <input type="range" :min="s.min" :max="s.max" :step="s.step || 1" v-model.number="adjustments[s.key]" class="modern-slider" />
                </div>
              </div>
            </div>

            <!-- Tone Curve -->
            <div class="control-section">
              <h3 @click="toggleSection('curve')"><span class="chevron" :class="{ open: openSections.curve }">›</span> Tone Curve</h3>
              <div class="section-body" :class="{ open: openSections.curve }">
                <div class="curve-channel-tabs">
                  <button v-for="ch in ['rgb','red','green','blue']" :key="ch"
                    class="curve-tab" :class="[ch, { active: curveChannel === ch }]"
                    @click="curveChannel = ch">{{ ch === 'rgb' ? 'RGB' : ch[0].toUpperCase() }}</button>
                </div>
                <canvas ref="curveCanvas" class="curve-canvas" width="256" height="256"
                  @mousedown="onCurveMouseDown" @mousemove="onCurveMouseMove"
                  @mouseup="onCurveMouseUp" @mouseleave="onCurveMouseUp"
                  @contextmenu.prevent="onCurveRightClick"></canvas>
                <button class="action-btn small" @click="resetCurve">Reset Curve</button>
              </div>
            </div>

            <!-- HSL -->
            <div class="control-section">
              <h3 @click="toggleSection('hsl')"><span class="chevron" :class="{ open: openSections.hsl }">›</span> HSL / Color</h3>
              <div class="section-body" :class="{ open: openSections.hsl }">
                <div class="hsl-tabs">
                  <button v-for="tab in ['hue','saturation','luminance']" :key="tab"
                    class="hsl-tab" :class="{ active: hslTab === tab }"
                    @click="hslTab = tab">{{ tab === 'hue' ? 'H' : tab === 'saturation' ? 'S' : 'L' }}</button>
                </div>
                <div v-for="(ch, name) in hslChannels" :key="name" class="hsl-slider-row">
                  <span class="hsl-dot" :style="{ background: hslDotColors[name] }"></span>
                  <span class="hsl-name">{{ name }}</span>
                  <input type="range"
                    :min="hslTab === 'hue' ? -30 : -100" :max="hslTab === 'hue' ? 30 : 100"
                    :value="ch[hslProp]" @input="ch[hslProp] = +$event.target.value"
                    class="modern-slider hsl-slider" />
                  <span class="hsl-val">{{ ch[hslProp] }}</span>
                </div>
              </div>
            </div>

            <!-- Effects -->
            <div class="control-section">
              <h3 @click="toggleSection('effects')"><span class="chevron" :class="{ open: openSections.effects }">›</span> Effects</h3>
              <div class="section-body" :class="{ open: openSections.effects }">
                <div class="portrait-blur-section">
                  <div class="portrait-blur-header">
                    <label class="sub-label" style="margin:0">Portrait Blur</label>
                    <button class="action-btn small" style="width:auto;padding:4px 12px" :disabled="portraitProcessing || !isPro" @click="applyPortraitBlur">
                      {{ portraitProcessing ? 'Detecting...' : _portraitMask ? '✓ Detected' : 'Detect Subject' }}
                    </button>
                  </div>
                  <p v-if="!isPro" class="pro-hint" style="margin:2px 0 4px">Pro feature</p>
                  <div v-if="_portraitMask" class="portrait-preset-row">
                    <button v-for="preset in portraitBlurPresets" :key="preset.name" class="portrait-preset-chip" :class="{ active: portraitPreset === preset.name }" @click="applyPortraitPreset(preset)">{{ preset.name }}</button>
                  </div>
                  <p v-if="_portraitMask" class="tool-hint">Use a softer preset first. High blur values now keep more edge detail and tone down the background instead of smearing it.</p>
                  <div v-if="_portraitMask" class="slider-group" style="margin-top:6px" @dblclick="portraitBlur = 0">
                    <label>Blur Amount
                      <input type="number" class="val-input" min="0" max="100" step="1"
                        :value="portraitBlur" @input="portraitBlur = clampInput(+$event.target.value, 0, 100)" @click.stop />
                    </label>
                    <input type="range" min="0" max="100" v-model.number="portraitBlur" class="modern-slider" />
                  </div>
                  <div v-if="_portraitMask" class="slider-group" @dblclick="portraitFeather = 36">
                    <label>Edge Feather
                      <input type="number" class="val-input" min="0" max="100" step="1"
                        :value="portraitFeather" @input="portraitFeather = clampInput(+$event.target.value, 0, 100)" @click.stop />
                    </label>
                    <input type="range" min="0" max="100" v-model.number="portraitFeather" class="modern-slider" />
                  </div>
                  <div v-if="_portraitMask" class="slider-group" @dblclick="portraitBackdrop = 10">
                    <label>Background Focus
                      <input type="number" class="val-input" min="0" max="40" step="1"
                        :value="portraitBackdrop" @input="portraitBackdrop = clampInput(+$event.target.value, 0, 40)" @click.stop />
                    </label>
                    <input type="range" min="0" max="40" v-model.number="portraitBackdrop" class="modern-slider" />
                  </div>
                  <div v-if="_portraitMask" class="slider-group" @dblclick="portraitSubjectProtect = 18">
                    <label>Subject Protection
                      <input type="number" class="val-input" min="0" max="40" step="1"
                        :value="portraitSubjectProtect" @input="portraitSubjectProtect = clampInput(+$event.target.value, 0, 40)" @click.stop />
                    </label>
                    <input type="range" min="0" max="40" v-model.number="portraitSubjectProtect" class="modern-slider" />
                  </div>
                </div>
                <div class="slider-group" @dblclick="adjustments.vignette = 0">
                  <label>Vignette
                    <input type="number" class="val-input" min="0" max="100" step="1"
                      :value="adjustments.vignette" @input="adjustments.vignette = clampInput(+$event.target.value, 0, 100)" @click.stop />
                  </label>
                  <input type="range" min="0" max="100" v-model.number="adjustments.vignette" class="modern-slider" />
                </div>
                <div class="slider-group" @dblclick="adjustments.grain = 0">
                  <label>Grain
                    <input type="number" class="val-input" min="0" max="100" step="1"
                      :value="adjustments.grain" @input="adjustments.grain = clampInput(+$event.target.value, 0, 100)" @click.stop />
                  </label>
                  <input type="range" min="0" max="100" v-model.number="adjustments.grain" class="modern-slider" />
                </div>
                <label class="sub-label">Split Toning</label>
                <div class="split-tone-row">
                  <div class="split-tone-group">
                    <span>Highlights</span>
                    <input type="color" v-model="splitHighlight" class="color-input" />
                    <input type="range" min="0" max="100" v-model.number="splitHighlightAmount" class="modern-slider mini" />
                  </div>
                  <div class="split-tone-group">
                    <span>Shadows</span>
                    <input type="color" v-model="splitShadow" class="color-input" />
                    <input type="range" min="0" max="100" v-model.number="splitShadowAmount" class="modern-slider mini" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Presets -->
            <div class="control-section">
              <h3 @click="toggleSection('presets')"><span class="chevron" :class="{ open: openSections.presets }">›</span> Presets</h3>
              <div class="section-body" :class="{ open: openSections.presets }">
                <div class="slider-group" @dblclick="presetIntensity = 100">
                  <label>Preset Amount
                    <input type="number" class="val-input" min="0" max="100" step="1"
                      :value="presetIntensity" @input="presetIntensity = clampInput(+$event.target.value, 0, 100)" @click.stop />
                  </label>
                  <input type="range" min="0" max="100" v-model.number="presetIntensity" class="modern-slider" />
                </div>
                <div class="filter-grid">
                  <button v-for="f in presets" :key="f.name" class="filter-chip"
                    :class="{ active: activeFilter === f.name }" @click="applyPreset(f)">
                    <span class="filter-icon">{{ f.icon }}</span>
                    <span class="filter-label">{{ f.name }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Background -->
            <div class="control-section">
              <h3 @click="toggleSection('background')"><span class="chevron" :class="{ open: openSections.background }">›</span> Background <span v-if="!isPro" class="pro-tag">PRO</span></h3>
              <div class="section-body" :class="{ open: openSections.background }">
                <button class="action-btn" :disabled="removingBg || !isPro" @click="handleRemoveBg">
                  <template v-if="removingBg">{{ bgProgress || 'Processing...' }}</template>
                  <template v-else-if="bgRemoved">✓ Background Removed</template>
                  <template v-else>Remove Background</template>
                </button>
                <p v-if="!isPro" class="pro-hint">Upgrade to Pro to remove backgrounds</p>
              </div>
            </div>

            <!-- Crop Info -->
            <div v-if="cropMode && cropRect.w > 0" class="control-section">
              <h3>Crop</h3>
              <p class="crop-info">{{ realCropDimensions }}</p>
              <button class="action-btn" @click="applyCrop">Apply Crop</button>
            </div>
            <div v-if="selectMode && selectRect.w > 0" class="control-section">
              <h3>Selection</h3>
              <p class="crop-info">{{ realSelectDimensions }}</p>
              <button class="action-btn" @click="deleteSelection">Delete Selection (Del)</button>
            </div>
            <div v-if="pendingCrop.w > 0 && !cropMode" class="control-section">
              <h3>Pending Crop</h3>
              <p class="crop-info">{{ pendingCrop.w }} × {{ pendingCrop.h }} px</p>
              <button class="action-btn" @click="clearCrop">Remove Crop</button>
            </div>

            <div class="control-section">
              <h3 @click="toggleSection('history')"><span class="chevron" :class="{ open: openSections.history }">›</span> History</h3>
              <div class="section-body" :class="{ open: openSections.history }">
                <div class="history-list">
                  <button v-for="(entry, index) in visibleHistoryEntries" :key="`${index}-${entry.label}`" class="history-item" :class="{ active: entry.actualIndex === historyIndex }" @click="jumpToHistory(entry.actualIndex)">
                    <span class="history-index">{{ entry.actualIndex + 1 }}</span>
                    <span class="history-label">{{ entry.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="control-section">
              <button class="action-btn" @click="resetAll">Reset All</button>
            </div>
            <div class="save-section">
              <div class="export-options">
                <div class="export-row">
                  <span class="export-label">Format</span>
                  <select v-model="exportFormat" class="export-select">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                  </select>
                </div>
                <div v-if="exportFormat !== 'png'" class="export-row">
                  <span class="export-label">Quality</span>
                  <input type="range" min="1" max="100" v-model.number="exportQuality" class="modern-slider export-slider" />
                  <span class="export-quality-val">{{ exportQuality }}%</span>
                </div>
                <div class="export-row">
                  <span class="export-label">Resize</span>
                  <input type="range" min="10" max="100" v-model.number="exportScale" class="modern-slider export-slider" />
                  <span class="export-quality-val">{{ exportScale }}%</span>
                </div>
                <div class="export-row">
                  <span class="export-label">Screen Sharpen</span>
                  <input type="range" min="0" max="100" v-model.number="exportSharpenScreen" class="modern-slider export-slider" />
                  <span class="export-quality-val">{{ exportSharpenScreen }}</span>
                </div>
                <div class="export-row export-row-stack">
                  <span class="export-label">Suffix</span>
                  <input v-model="exportSuffix" class="text-input export-text-input" placeholder="_edited" />
                </div>
              </div>
              <button class="action-btn primary" @click="saveEdit" :disabled="saving">{{ saving ? 'Saving...' : 'Save as Copy' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  imagePath: { type: String, required: true },
  tier: { type: String, default: 'free' }
})
const emit = defineEmits(['close', 'saved'])

// ===== CORE STATE =====
const canvas = ref(null)
const canvasWrapper = ref(null)
const canvasContainer = ref(null)
const histogramCanvas = ref(null)
const curveCanvas = ref(null)
const saving = ref(false)
const removingBg = ref(false)
const bgProgress = ref('')
const bgRemoved = ref(false)
const showOriginal = ref(false)
const zoomLevel = ref(1)
const isPanning = ref(false)
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 }
let spaceHeld = false
let originalImage = null
let imageWidth = 0
let imageHeight = 0
let displayScale = 1
let editCanvas = null

const isPro = computed(() => props.tier !== 'free')
const zoomPercent = computed(() => Math.round(zoomLevel.value * 100))
const fileName = computed(() => props.imagePath?.split(/[\\/]/).pop() || 'Untitled')

// ===== ADJUSTMENTS STATE =====
const adjustments = reactive({
  // Light
  exposure: 0,       // -3 to 3
  brightness: 100,   // 50-200
  contrast: 100,     // 50-200
  highlights: 0,     // -100 to 100
  shadows: 0,        // -100 to 100
  whites: 0,         // -100 to 100
  blacks: 0,         // -100 to 100
  // Color
  temperature: 0,    // -100 to 100
  tint: 0,           // -100 to 100
  vibrance: 0,       // -100 to 100
  saturation: 100,   // 0-300
  // Detail
  clarity: 0,        // -100 to 100
  dehaze: 0,         // -100 to 100
  sharpen: 0,        // 0-10
  // Effects
  vignette: 0,       // 0-100
  grain: 0,          // 0-100
  // Transform
  rotation: 0,       // 0, 90, 180, 270
  straighten: 0,     // -45 to 45
  flipH: false,
  flipV: false
})

// Slider configs
const lightSliders = [
  { key: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.05, unit: ' EV' },
  { key: 'brightness', label: 'Brightness', min: 50, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 50, max: 200, unit: '%' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'whites', label: 'Whites', min: -100, max: 100 },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
]
const colorSliders = [
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 300, unit: '%' },
]
const detailSliders = [
  { key: 'clarity', label: 'Clarity', min: -100, max: 100 },
  { key: 'dehaze', label: 'Dehaze', min: -100, max: 100 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 10, step: 0.5 },
]

// Split toning
const splitHighlight = ref('#ff9933')
const splitHighlightAmount = ref(0)
const splitShadow = ref('#334499')
const splitShadowAmount = ref(0)

// ===== HSL STATE =====
const hslTab = ref('hue')
const hslProp = computed(() => hslTab.value === 'hue' ? 'h' : hslTab.value === 'saturation' ? 's' : 'l')
const hslChannels = reactive({
  Red:     { h: 0, s: 0, l: 0 },
  Orange:  { h: 0, s: 0, l: 0 },
  Yellow:  { h: 0, s: 0, l: 0 },
  Green:   { h: 0, s: 0, l: 0 },
  Aqua:    { h: 0, s: 0, l: 0 },
  Blue:    { h: 0, s: 0, l: 0 },
  Purple:  { h: 0, s: 0, l: 0 },
  Magenta: { h: 0, s: 0, l: 0 },
})
const hslDotColors = { Red: '#e53935', Orange: '#ff9800', Yellow: '#fdd835', Green: '#43a047', Aqua: '#00bcd4', Blue: '#1e88e5', Purple: '#8e24aa', Magenta: '#d81b60' }

// Hue band center angles (degrees)
const hslBands = [
  { name: 'Red',     center: 0 },
  { name: 'Orange',  center: 30 },
  { name: 'Yellow',  center: 60 },
  { name: 'Green',   center: 120 },
  { name: 'Aqua',    center: 180 },
  { name: 'Blue',    center: 240 },
  { name: 'Purple',  center: 270 },
  { name: 'Magenta', center: 330 },
]

// ===== TONE CURVE STATE =====
const curveChannel = ref('rgb')
const curvePoints = reactive({
  rgb:   [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  red:   [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  blue:  [{ x: 0, y: 0 }, { x: 255, y: 255 }],
})
let dragCurveIdx = -1
let curveLUTs = { rgb: null, red: null, green: null, blue: null }

// ===== TOOL STATE =====
const cropMode = ref(false)
const eraserMode = ref(false)
const selectMode = ref(false)
const textMode = ref(false)
const drawMode = ref(false)
const brushSize = ref(30)
const drawColor = ref('#ff0000')
const activeFilter = ref(null)
const activeCropRatio = ref('Free')
const presetIntensity = ref(100)

const cropRect = reactive({ x: 0, y: 0, w: 0, h: 0 })
const pendingCrop = reactive({ x: 0, y: 0, w: 0, h: 0 })
const selectRect = reactive({ x: 0, y: 0, w: 0, h: 0 })
const snapGuideX = ref(null)
const snapGuideY = ref(null)
let cropping = false, cropStart = { x: 0, y: 0 }
let cropDragMode = null // 'draw' | 'move' | 'resize-nw' | 'resize-ne' | etc.
let cropResizeEdge = null
let cropMoveStart = { x: 0, y: 0, rx: 0, ry: 0, rw: 0, rh: 0 }
let selecting = false, selectStart = { x: 0, y: 0 }
let isErasing = false, isDrawing = false

// Text tool
const textItems = ref([])
const selectedTextId = ref(null)
const selectedTextItem = computed(() => textItems.value.find((item) => item.id === selectedTextId.value) || null)
const textInput = ref('Your text')
const textFontSize = ref(48)
const textFontFamily = ref('Arial')
const textColor = ref('#ffffff')
const textBold = ref(false)
const textItalic = ref(false)
const textAlign = ref('left')
const textRotation = ref(0)
const textShadow = ref(35)
const textStrokeWidth = ref(0)
const textStrokeColor = ref('#000000')
const inlineTextEditId = ref(null)
const inlineTextDraft = ref('')
const inlineTextEditor = ref(null)
const fonts = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS']
let textDragStart = null

// Crop ratios
const cropRatios = [
  { label: 'Free', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4/3 },
  { label: '3:2', ratio: 3/2 },
  { label: '16:9', ratio: 16/9 },
  { label: '5:4', ratio: 5/4 },
  { label: '2:3', ratio: 2/3 },
  { label: '9:16', ratio: 9/16 },
]
let constrainedRatio = null

// Sidebar sections
const openSections = reactive({
  tools: true, light: true, color: true, detail: false,
  curve: false, hsl: false, effects: false, presets: false, background: false, history: false,
})
const toggleSection = (key) => { openSections[key] = !openSections[key] }

// ===== COMPARE MODE =====
const compareMode = ref(false)
const compareSplit = ref(0.5)
let compareDragging = false

// ===== PORTRAIT BLUR STATE =====
let _portraitMask = null  // ImageBitmap of subject mask (alpha = subject)
const portraitBlur = ref(0)  // 0-100 blur intensity
const portraitFeather = ref(36)
const portraitBackdrop = ref(10)
const portraitSubjectProtect = ref(18)
const portraitPreset = ref('Natural')
const portraitBlurPresets = [
  { name: 'Soft', blur: 16, feather: 32, backdrop: 5, protect: 22 },
  { name: 'Natural', blur: 24, feather: 40, backdrop: 8, protect: 18 },
  { name: 'Studio', blur: 34, feather: 48, backdrop: 12, protect: 14 },
  { name: 'Dramatic', blur: 44, feather: 56, backdrop: 18, protect: 10 },
]
const portraitProcessing = ref(false)

// ===== EXPORT OPTIONS =====
const exportFormat = ref('png')
const exportQuality = ref(92)
const exportScale = ref(100)
const exportSharpenScreen = ref(0)
const exportSuffix = ref('_edited')

// ===== SECTION EDIT DETECTION =====
const hasLightEdits = computed(() => adjustments.exposure !== 0 || adjustments.brightness !== 100 || adjustments.contrast !== 100 || adjustments.highlights !== 0 || adjustments.shadows !== 0 || adjustments.whites !== 0 || adjustments.blacks !== 0)
const hasColorEdits = computed(() => adjustments.temperature !== 0 || adjustments.tint !== 0 || adjustments.vibrance !== 0 || adjustments.saturation !== 100)
const hasDetailEdits = computed(() => adjustments.clarity !== 0 || adjustments.dehaze !== 0 || adjustments.sharpen !== 0)

// ===== UNDO / REDO =====
const historyStack = ref([])
const historyIndex = ref(-1)
const MAX_HISTORY = 30
let captureQueue = Promise.resolve()
let historyCaptureTimer = null
let pendingHistorySignature = null
let suppressHistoryCapture = false
let queuedHistoryLabel = 'Edit'
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)
const visibleHistoryEntries = computed(() => historyStack.value.slice(-8).map((entry, index, arr) => ({
  ...entry,
  actualIndex: historyStack.value.length - arr.length + index,
})).reverse())

const highlightClipPercent = ref(0)
const shadowClipPercent = ref(0)

const getHistorySignature = () => JSON.stringify({
  width: editCanvas?.width || 0,
  height: editCanvas?.height || 0,
  adjustments,
  pendingCrop: { ...pendingCrop },
  activeFilter: activeFilter.value,
  bgRemoved: bgRemoved.value,
  textItems: textItems.value,
  curvePoints,
  hslChannels,
  splitHighlight: splitHighlight.value,
  splitHighlightAmount: splitHighlightAmount.value,
  splitShadow: splitShadow.value,
  splitShadowAmount: splitShadowAmount.value,
  portraitBlur: portraitBlur.value,
  portraitFeather: portraitFeather.value,
  portraitBackdrop: portraitBackdrop.value,
  portraitSubjectProtect: portraitSubjectProtect.value,
  portraitPreset: portraitPreset.value,
})

const queueHistoryCapture = (label = 'Edit', delay = 220) => {
  if (!editCanvas || suppressHistoryCapture) return
  queuedHistoryLabel = label
  if (historyCaptureTimer) clearTimeout(historyCaptureTimer)
  historyCaptureTimer = setTimeout(() => {
    historyCaptureTimer = null
    captureState(queuedHistoryLabel)
  }, delay)
}

const captureState = (label = 'Edit', options = {}) => {
  if (!editCanvas) return
  const signature = getHistorySignature()
  const activeEntry = historyStack.value[historyIndex.value]
  if (!options.force && (activeEntry?.signature === signature || pendingHistorySignature === signature)) return

  const snapshotCanvas = document.createElement('canvas')
  snapshotCanvas.width = editCanvas.width
  snapshotCanvas.height = editCanvas.height
  snapshotCanvas.getContext('2d').drawImage(editCanvas, 0, 0)
  const state = {
    width: editCanvas.width,
    height: editCanvas.height,
    adjustments: JSON.parse(JSON.stringify(adjustments)),
    pendingCrop: { ...pendingCrop },
    activeFilter: activeFilter.value,
    bgRemoved: bgRemoved.value,
    textItems: JSON.parse(JSON.stringify(textItems.value)),
    curvePoints: JSON.parse(JSON.stringify(curvePoints)),
    hslChannels: JSON.parse(JSON.stringify(hslChannels)),
    splitHighlight: splitHighlight.value,
    splitHighlightAmount: splitHighlightAmount.value,
    splitShadow: splitShadow.value,
    splitShadowAmount: splitShadowAmount.value,
    portraitBlur: portraitBlur.value,
    portraitFeather: portraitFeather.value,
    portraitBackdrop: portraitBackdrop.value,
    portraitSubjectProtect: portraitSubjectProtect.value,
    portraitPreset: portraitPreset.value,
    label,
    signature,
  }

  pendingHistorySignature = signature
  captureQueue = captureQueue.then(() => new Promise((resolve) => {
    snapshotCanvas.toBlob((blob) => {
      if (blob) {
        const nextState = { ...state, blob }
        historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
        historyStack.value.push(nextState)
        if (historyStack.value.length > MAX_HISTORY) historyStack.value.shift()
        historyIndex.value = historyStack.value.length - 1
      }
      if (pendingHistorySignature === signature) pendingHistorySignature = null
      resolve()
    }, 'image/png')
  }))
}

const restoreState = async (state) => {
  if (!editCanvas || !state) return
  suppressHistoryCapture = true
  if (historyCaptureTimer) {
    clearTimeout(historyCaptureTimer)
    historyCaptureTimer = null
  }
  editCanvas.width = state.width
  editCanvas.height = state.height
  const ctx = editCanvas.getContext('2d')
  const bitmap = await createImageBitmap(state.blob)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  imageWidth = state.width
  imageHeight = state.height
  Object.assign(adjustments, state.adjustments)
  Object.assign(pendingCrop, state.pendingCrop)
  activeFilter.value = state.activeFilter
  bgRemoved.value = state.bgRemoved
  textItems.value = (state.textItems || []).map((item) => ensureTextItemDefaults(item))
  if (state.curvePoints) Object.assign(curvePoints, state.curvePoints)
  if (state.hslChannels) Object.assign(hslChannels, state.hslChannels)
  if (state.splitHighlight) splitHighlight.value = state.splitHighlight
  if (state.splitHighlightAmount !== undefined) splitHighlightAmount.value = state.splitHighlightAmount
  if (state.splitShadow) splitShadow.value = state.splitShadow
  if (state.splitShadowAmount !== undefined) splitShadowAmount.value = state.splitShadowAmount
  if (state.portraitBlur !== undefined) portraitBlur.value = state.portraitBlur
  if (state.portraitFeather !== undefined) portraitFeather.value = state.portraitFeather
  if (state.portraitBackdrop !== undefined) portraitBackdrop.value = state.portraitBackdrop
  if (state.portraitSubjectProtect !== undefined) portraitSubjectProtect.value = state.portraitSubjectProtect
  if (state.portraitPreset) portraitPreset.value = state.portraitPreset
  renderCanvas()
  await nextTick()
  suppressHistoryCapture = false
}

const undo = async () => { if (canUndo.value) { historyIndex.value--; await restoreState(historyStack.value[historyIndex.value]) } }
const redo = async () => { if (canRedo.value) { historyIndex.value++; await restoreState(historyStack.value[historyIndex.value]) } }
const jumpToHistory = async (index) => {
  if (index < 0 || index >= historyStack.value.length || index === historyIndex.value) return
  historyIndex.value = index
  await restoreState(historyStack.value[index])
}

/* eslint-disable @typescript-eslint/explicit-function-return-type */
const normalizeRotation = (rotation) => ((rotation % 360) + 360) % 360
const isQuarterTurn = (rotation) => {
  const normalized = normalizeRotation(rotation)
  return normalized === 90 || normalized === 270
}

const getSourceRect = () => {
  const srcX = pendingCrop.w > 0 ? pendingCrop.x : 0
  const srcY = pendingCrop.w > 0 ? pendingCrop.y : 0
  const srcW = pendingCrop.w > 0 ? pendingCrop.w : imageWidth
  const srcH = pendingCrop.w > 0 ? pendingCrop.h : imageHeight
  return { srcX, srcY, srcW, srcH }
}

const getOrientedSize = (width, height, rotation = adjustments.rotation) => {
  return isQuarterTurn(rotation)
    ? { width: height, height: width }
    : { width, height }
}

const getRenderMetrics = ({ scaleOverride } = {}) => {
  const { srcX, srcY, srcW, srcH } = getSourceRect()
  const oriented = getOrientedSize(srcW, srcH)
  const scale = scaleOverride ?? (() => {
    const wrapper = canvasWrapper.value
    if (!wrapper) return 1
    const maxW = Math.max(wrapper.clientWidth - 20, 1)
    const maxH = Math.max(wrapper.clientHeight - 20, 1)
    const fitScale = Math.min(maxW / oriented.width, maxH / oriented.height, 1)
    return fitScale * zoomLevel.value
  })()
  const drawW = Math.max(1, Math.round(srcW * scale))
  const drawH = Math.max(1, Math.round(srcH * scale))
  const canvasW = Math.max(1, Math.round(oriented.width * scale))
  const canvasH = Math.max(1, Math.round(oriented.height * scale))
  return { srcX, srcY, srcW, srcH, scale, drawW, drawH, canvasW, canvasH }
}

const createImageTransformMatrix = (metrics) => {
  return new DOMMatrix()
    .translateSelf(metrics.canvasW / 2, metrics.canvasH / 2)
    .rotateSelf(normalizeRotation(adjustments.rotation))
    .scaleSelf(adjustments.flipH ? -1 : 1, adjustments.flipV ? -1 : 1)
    .rotateSelf(adjustments.straighten)
    .translateSelf(-metrics.drawW / 2, -metrics.drawH / 2)
}

const drawImageLayer = (ctx, source, metrics) => {
  ctx.save()
  ctx.setTransform(createImageTransformMatrix(metrics))
  ctx.drawImage(source, metrics.srcX, metrics.srcY, metrics.srcW, metrics.srcH, 0, 0, metrics.drawW, metrics.drawH)
  ctx.restore()
}

const mapImagePointToCanvas = (x, y, metrics = getRenderMetrics()) => {
  if (!metrics.scale) return { x: 0, y: 0 }
  const point = new DOMPoint((x - metrics.srcX) * metrics.scale, (y - metrics.srcY) * metrics.scale)
  const mapped = point.matrixTransform(createImageTransformMatrix(metrics))
  return { x: mapped.x, y: mapped.y }
}

const mapCanvasPointToImage = (x, y, metrics = getRenderMetrics()) => {
  if (!metrics.scale) return { x: 0, y: 0 }
  const local = new DOMPoint(x, y).matrixTransform(createImageTransformMatrix(metrics).inverse())
  return {
    x: metrics.srcX + local.x / metrics.scale,
    y: metrics.srcY + local.y / metrics.scale,
  }
}

const getCanvasPointFromEvent = (e) => {
  if (!canvas.value) return { x: 0, y: 0 }
  const rect = canvas.value.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvas.value.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.value.height / rect.height),
  }
}

const getTextSnapTarget = (value, candidates, threshold = 10) => {
  let best = null
  let bestDistance = threshold + 1
  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return bestDistance <= threshold ? best : null
}

const applyTextSnap = (item, metrics = getRenderMetrics()) => {
  const point = mapImagePointToCanvas(item.x, item.y, metrics)
  const xCandidate = getTextSnapTarget(point.x, [0, metrics.canvasW / 2, metrics.canvasW])
  const yCandidate = getTextSnapTarget(point.y, [0, metrics.canvasH / 2, metrics.canvasH])
  snapGuideX.value = xCandidate
  snapGuideY.value = yCandidate
  if (xCandidate !== null) item.x = mapCanvasPointToImage(xCandidate, point.y, metrics).x
  if (yCandidate !== null) item.y = mapCanvasPointToImage(point.x, yCandidate, metrics).y
}

const clearTextSnapGuides = () => {
  snapGuideX.value = null
  snapGuideY.value = null
}

const getTextItemDefaults = () => ({
  align: 'left',
  rotation: 0,
  shadow: 35,
  strokeWidth: 0,
  strokeColor: '#000000',
})

const ensureTextItemDefaults = (item) => {
  if (!item) return item
  const defaults = getTextItemDefaults()
  for (const [key, value] of Object.entries(defaults)) {
    if (item[key] === undefined || item[key] === null) item[key] = value
  }
  return item
}

const syncTextControlsFromItem = (item) => {
  const nextItem = ensureTextItemDefaults(item)
  if (!nextItem) return
  textInput.value = nextItem.text
  textFontSize.value = nextItem.fontSize
  textFontFamily.value = nextItem.fontFamily
  textColor.value = nextItem.color
  textBold.value = nextItem.bold
  textItalic.value = nextItem.italic
  textAlign.value = nextItem.align
  textRotation.value = nextItem.rotation
  textShadow.value = nextItem.shadow
  textStrokeWidth.value = nextItem.strokeWidth
  textStrokeColor.value = nextItem.strokeColor
}

const applyTextControlsToItem = (item) => {
  const nextItem = ensureTextItemDefaults(item)
  if (!nextItem) return
  nextItem.text = textInput.value || 'Text'
  nextItem.fontSize = textFontSize.value
  nextItem.fontFamily = textFontFamily.value
  nextItem.color = textColor.value
  nextItem.bold = textBold.value
  nextItem.italic = textItalic.value
  nextItem.align = textAlign.value
  nextItem.rotation = textRotation.value
  nextItem.shadow = textShadow.value
  nextItem.strokeWidth = textStrokeWidth.value
  nextItem.strokeColor = textStrokeColor.value
}

const createTextItem = (overrides = {}) => {
  const id = Date.now() + Math.floor(Math.random() * 1000)
  return ensureTextItemDefaults({
    id,
    text: textInput.value || 'Text',
    fontSize: textFontSize.value,
    fontFamily: textFontFamily.value,
    color: textColor.value,
    bold: textBold.value,
    italic: textItalic.value,
    align: textAlign.value,
    rotation: textRotation.value,
    shadow: textShadow.value,
    strokeWidth: textStrokeWidth.value,
    strokeColor: textStrokeColor.value,
    ...overrides,
  })
}

const textMeasureCanvas = document.createElement('canvas')
const textMeasureCtx = textMeasureCanvas.getContext('2d')

const measureTextItem = (item, scale = displayScale) => {
  const nextItem = ensureTextItemDefaults(item)
  const fontSize = nextItem.fontSize * scale
  textMeasureCtx.font = `${nextItem.italic ? 'italic ' : ''}${nextItem.bold ? 'bold ' : ''}${fontSize}px ${nextItem.fontFamily}`
  const lines = `${nextItem.text || 'Text'}`.split(/\r?\n/)
  const width = Math.max(...lines.map((line) => textMeasureCtx.measureText(line || ' ').width), fontSize * 0.65)
  const lineHeight = fontSize * 1.14
  const height = Math.max(lineHeight, lines.length * lineHeight)
  return { width, height, fontSize, lineHeight, lines }
}

const getTextTransformOrigin = (item) => {
  const nextItem = ensureTextItemDefaults(item)
  if (nextItem.align === 'center') return '50% 0'
  if (nextItem.align === 'right') return '100% 0'
  return '0 0'
}

const getTextTranslate = (item) => {
  const nextItem = ensureTextItemDefaults(item)
  if (nextItem.align === 'center') return 'translateX(-50%)'
  if (nextItem.align === 'right') return 'translateX(-100%)'
  return 'translateX(0)'
}

const getTextShadowStyle = (item, scale = displayScale) => {
  const nextItem = ensureTextItemDefaults(item)
  if (!nextItem.shadow) return 'none'
  const blur = Math.max(2, Math.round((nextItem.fontSize * scale) * 0.08 + nextItem.shadow * 0.12))
  const alpha = Math.min(0.85, 0.18 + nextItem.shadow / 180)
  return `0 2px ${blur}px rgba(0, 0, 0, ${alpha})`
}

const getTextOverlayStyle = (item) => {
  const nextItem = ensureTextItemDefaults(item)
  const point = mapImagePointToCanvas(nextItem.x, nextItem.y)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    transform: `${getTextTranslate(nextItem)} rotate(${nextItem.rotation}deg)`,
    transformOrigin: getTextTransformOrigin(nextItem),
    textAlign: nextItem.align,
    zIndex: selectedTextId.value === nextItem.id ? 6 : 3,
  }
}

const getTextLabelStyle = (item, scale = displayScale) => {
  const nextItem = ensureTextItemDefaults(item)
  return {
    fontSize: `${nextItem.fontSize * scale}px`,
    fontFamily: nextItem.fontFamily,
    color: nextItem.color,
    fontWeight: nextItem.bold ? 'bold' : 'normal',
    fontStyle: nextItem.italic ? 'italic' : 'normal',
    textAlign: nextItem.align,
    textShadow: getTextShadowStyle(nextItem, scale),
    WebkitTextStroke: nextItem.strokeWidth > 0 ? `${Math.max(1, nextItem.strokeWidth * scale)}px ${nextItem.strokeColor}` : '0 transparent',
    lineHeight: '1.08',
    whiteSpace: 'pre-wrap',
  }
}

const getInlineTextEditorStyle = (item) => {
  const metrics = measureTextItem(item)
  return {
    ...getTextLabelStyle(item),
    width: `${Math.max(metrics.width + 28, 140)}px`,
    minHeight: `${Math.max(metrics.height + 20, 72)}px`,
  }
}

const clampImageBounds = (bounds, metrics = getSourceRect()) => {
  const minX = metrics.srcX
  const minY = metrics.srcY
  const maxX = metrics.srcX + metrics.srcW
  const maxY = metrics.srcY + metrics.srcH
  const x = Math.max(minX, Math.min(maxX, bounds.x))
  const y = Math.max(minY, Math.min(maxY, bounds.y))
  const right = Math.max(x, Math.min(maxX, bounds.x + bounds.w))
  const bottom = Math.max(y, Math.min(maxY, bounds.y + bounds.h))
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(0, Math.round(right - x)),
    h: Math.max(0, Math.round(bottom - y)),
  }
}

const getImageBoundsFromCanvasRect = (rect) => {
  const metrics = getRenderMetrics()
  const corners = [
    mapCanvasPointToImage(rect.x, rect.y, metrics),
    mapCanvasPointToImage(rect.x + rect.w, rect.y, metrics),
    mapCanvasPointToImage(rect.x, rect.y + rect.h, metrics),
    mapCanvasPointToImage(rect.x + rect.w, rect.y + rect.h, metrics),
  ]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  return clampImageBounds({
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }, metrics)
}

const drawTextLayer = (ctx, metrics, scale = metrics.scale) => {
  ctx.save()
  ctx.setTransform(createImageTransformMatrix(metrics))
  for (const rawItem of textItems.value) {
    const item = ensureTextItemDefaults(rawItem)
    const measurement = measureTextItem(item, scale)
    ctx.save()
    ctx.translate((item.x - metrics.srcX) * scale, (item.y - metrics.srcY) * scale)
    if (item.rotation) ctx.rotate(item.rotation * Math.PI / 180)
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${item.fontSize * scale}px ${item.fontFamily}`
    ctx.textBaseline = 'top'
    ctx.textAlign = item.align
    ctx.fillStyle = item.color
    ctx.shadowColor = item.shadow ? `rgba(0, 0, 0, ${Math.min(0.85, 0.18 + item.shadow / 180)})` : 'transparent'
    ctx.shadowBlur = item.shadow ? Math.max(2, Math.round((item.fontSize * scale) * 0.08 + item.shadow * 0.12)) : 0
    if (item.strokeWidth > 0) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = Math.max(1, item.strokeWidth * scale)
      measurement.lines.forEach((line, index) => {
        ctx.strokeText(line || ' ', 0, index * measurement.lineHeight)
      })
    }
    measurement.lines.forEach((line, index) => {
      ctx.fillText(line || ' ', 0, index * measurement.lineHeight)
    })
    ctx.restore()
  }
  ctx.restore()
}
/* eslint-enable @typescript-eslint/explicit-function-return-type */

const clampCanvasCropRect = (rect) => {
  if (!canvas.value) return { x: 0, y: 0, w: 0, h: 0 }
  const maxW = canvas.value.width
  const maxH = canvas.value.height
  const width = Math.max(0, Math.min(rect.w, maxW))
  const height = Math.max(0, Math.min(rect.h, maxH))
  const x = Math.max(0, Math.min(maxW - width, rect.x))
  const y = Math.max(0, Math.min(maxH - height, rect.y))
  return { x, y, w: width, h: height }
}

const getCanvasCropRectFromImageBounds = (bounds) => {
  const metrics = getRenderMetrics()
  const corners = [
    mapImagePointToCanvas(bounds.x, bounds.y, metrics),
    mapImagePointToCanvas(bounds.x + bounds.w, bounds.y, metrics),
    mapImagePointToCanvas(bounds.x, bounds.y + bounds.h, metrics),
    mapImagePointToCanvas(bounds.x + bounds.w, bounds.y + bounds.h, metrics),
  ]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  return clampCanvasCropRect({
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  })
}

const setCropRect = (rect) => {
  cropRect.x = rect.x
  cropRect.y = rect.y
  cropRect.w = rect.w
  cropRect.h = rect.h
}

const getDefaultCropRect = () => {
  if (!canvas.value) return { x: 0, y: 0, w: 0, h: 0 }
  if (cropRect.w > 0 && cropRect.h > 0) return { ...cropRect }
  if (pendingCrop.w > 0 && pendingCrop.h > 0) return getCanvasCropRectFromImageBounds({ ...pendingCrop })

  const inset = 0.92
  const width = canvas.value.width * inset
  const height = canvas.value.height * inset
  return {
    x: (canvas.value.width - width) / 2,
    y: (canvas.value.height - height) / 2,
    w: width,
    h: height,
  }
}

const fitCropRectToRatio = (ratio, baseRect = getDefaultCropRect()) => {
  if (!canvas.value) return { x: 0, y: 0, w: 0, h: 0 }
  const safeBase = clampCanvasCropRect(baseRect)
  if (!ratio) return safeBase

  const centerX = safeBase.x + safeBase.w / 2
  const centerY = safeBase.y + safeBase.h / 2
  const maxWidth = Math.max(0, Math.min(centerX, canvas.value.width - centerX) * 2)
  const maxHeight = Math.max(0, Math.min(centerY, canvas.value.height - centerY) * 2)

  let width = safeBase.w || Math.min(canvas.value.width, maxWidth)
  let height = safeBase.h || Math.min(canvas.value.height, maxHeight)

  if (!width || !height) {
    width = maxWidth || canvas.value.width
    height = maxHeight || canvas.value.height
  }

  if (width / height > ratio) width = height * ratio
  else height = width / ratio

  if (width > maxWidth) {
    width = maxWidth
    height = width / ratio
  }
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }

  return clampCanvasCropRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    w: width,
    h: height,
  })
}

const syncCropRectToRatio = (ratio) => {
  const nextRect = fitCropRectToRatio(ratio)
  setCropRect(nextRect)
}

// ===== KEYBOARD SHORTCUTS =====
const handleKeyDown = (e) => {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key === 'z') { e.preventDefault(); undo() }
  if (mod && e.key === 'y') { e.preventDefault(); redo() }
  if (e.key === 'Delete' && selectMode.value && selectRect.w > 2) { e.preventDefault(); deleteSelection() }
  if (e.key === 'Delete' && selectedTextId.value && !e.target.closest('input, select, textarea')) { e.preventDefault(); removeSelectedText() }
  if (selectedTextItem.value && !e.target.closest('input, select, textarea') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowLeft') selectedTextItem.value.x = Math.max(0, selectedTextItem.value.x - step)
    if (e.key === 'ArrowRight') selectedTextItem.value.x = Math.min(imageWidth, selectedTextItem.value.x + step)
    if (e.key === 'ArrowUp') selectedTextItem.value.y = Math.max(0, selectedTextItem.value.y - step)
    if (e.key === 'ArrowDown') selectedTextItem.value.y = Math.min(imageHeight, selectedTextItem.value.y + step)
    scheduleRender()
    return
  }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn() }
  if (mod && e.key === '-') { e.preventDefault(); zoomOut() }
  if (mod && e.key === '0') { e.preventDefault(); resetZoom() }
  if (e.key === 'Enter' && cropMode.value && cropRect.w > 9 && cropRect.h > 9 && !e.target.closest('input, select, textarea')) { e.preventDefault(); applyCrop() }
  if (e.key === 'Escape') {
    if (cropMode.value) { e.preventDefault(); cancelCrop(); return }
    if (selectedTextId.value || textMode.value) { e.preventDefault(); finishTextEditing() }
  }
  if (e.code === 'Space' && !spaceHeld) { spaceHeld = true }
  if (!e.target.closest('input, select, textarea') && !mod) {
    if (e.key === 'b') { compareMode.value = !compareMode.value; renderCanvas() }
  }
}
const handleKeyUp = (e) => { if (e.code === 'Space') spaceHeld = false }

// ===== PAN / ZOOM =====
const onWrapperMouseDown = (e) => {
  if (e.button === 1 || spaceHeld) { e.preventDefault(); startPan(e); return }
  if (e.button === 0 && !eraserMode.value && !cropMode.value && !selectMode.value && !drawMode.value && !textMode.value && zoomLevel.value > 1) startPan(e)
}
const onWrapperMouseMove = (e) => {
  if (!isPanning.value) return
  const w = canvasWrapper.value
  if (w) { w.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x); w.scrollTop = panStart.scrollTop - (e.clientY - panStart.y) }
}
const onWrapperMouseUp = () => { isPanning.value = false }
const startPan = (e) => { isPanning.value = true; const w = canvasWrapper.value; panStart = { x: e.clientX, y: e.clientY, scrollLeft: w.scrollLeft, scrollTop: w.scrollTop } }
const zoomIn = () => { zoomLevel.value = Math.min(5, +(zoomLevel.value * 1.25).toFixed(2)); renderCanvas() }
const zoomOut = () => { zoomLevel.value = Math.max(0.25, +(zoomLevel.value / 1.25).toFixed(2)); renderCanvas() }
const resetZoom = () => { zoomLevel.value = 1; renderCanvas() }
const handleWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut() } }

const zoomActualPixels = () => {
  const { srcW, srcH } = getSourceRect()
  if (!canvasWrapper.value || !srcW) return
  const oriented = getOrientedSize(srcW, srcH)
  const maxW = canvasWrapper.value.clientWidth - 20
  const maxH = canvasWrapper.value.clientHeight - 20
  const fitScale = Math.min(maxW / oriented.width, maxH / oriented.height, 1)
  zoomLevel.value = fitScale > 0 ? Math.max(1, +(1 / fitScale).toFixed(2)) : 1
  renderCanvas()
}

const startCompareDrag = (e) => {
  compareDragging = true
  const onMove = (ev) => {
    if (!compareDragging || !canvas.value) return
    const rect = canvas.value.getBoundingClientRect()
    compareSplit.value = Math.max(0.01, Math.min(0.99, (ev.clientX - rect.left) / rect.width))
    renderCanvas()
  }
  const onUp = () => { compareDragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ===== CURSOR =====
const cursorPos = reactive({ x: 0, y: 0 })
const cursorVisible = ref(false)
const brushCursorSize = computed(() => brushSize.value * displayScale)

// ===== CANVAS MOUSE EVENTS =====
const onCanvasMouseDown = (e) => {
  if (spaceHeld || e.button === 1) return
  if (textMode.value) { placeText(e); return }
  if (eraserMode.value) { isErasing = true; bgRemoved.value = true; captureState(); brushAt(e, true); return }
  if (drawMode.value) { isDrawing = true; captureState(); brushAt(e, false); return }
}
const onCanvasMouseMove = (e) => {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  cursorPos.x = e.clientX - rect.left; cursorPos.y = e.clientY - rect.top; cursorVisible.value = true
  if (eraserMode.value && isErasing) brushAt(e, true)
  if (drawMode.value && isDrawing) brushAt(e, false)
}
const onCanvasMouseUp = () => { isErasing = false; isDrawing = false }
const onCanvasMouseLeave = () => { cursorVisible.value = false; isErasing = false; isDrawing = false }

// ===== BRUSH (Eraser + Draw) =====
const brushAt = (e, erase) => {
  if (!canvas.value || !editCanvas) return
  const rect = canvas.value.getBoundingClientRect()
  const scaleX = canvas.value.width / rect.width, scaleY = canvas.value.height / rect.height
  const cx = (e.clientX - rect.left) * scaleX, cy = (e.clientY - rect.top) * scaleY
  // Display canvas
  const ctx = canvas.value.getContext('2d')
  ctx.save()
  if (erase) {
    ctx.globalCompositeOperation = 'destination-out'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = drawColor.value
  }
  ctx.beginPath(); ctx.arc(cx, cy, brushSize.value * displayScale * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  // Full-res editCanvas
  const srcX = pendingCrop.w > 0 ? pendingCrop.x : 0, srcY = pendingCrop.w > 0 ? pendingCrop.y : 0
  const ex = srcX + cx / displayScale, ey = srcY + cy / displayScale
  const ectx = editCanvas.getContext('2d')
  ectx.save()
  if (erase) {
    ectx.globalCompositeOperation = 'destination-out'
  } else {
    ectx.globalCompositeOperation = 'source-over'
    ectx.fillStyle = drawColor.value
  }
  ectx.beginPath(); ectx.arc(ex, ey, brushSize.value * 0.5, 0, Math.PI * 2); ectx.fill(); ectx.restore()
}

// ===== TOOL TOGGLES =====
const disableAllTools = () => { cropMode.value = false; eraserMode.value = false; selectMode.value = false; textMode.value = false; drawMode.value = false }
const toggleEraserMode = () => { const v = !eraserMode.value; disableAllTools(); eraserMode.value = v }
const toggleCropMode = () => {
  const v = !cropMode.value
  disableAllTools()
  cropMode.value = v
  if (v) syncCropRectToRatio(constrainedRatio)
}
const toggleSelectMode = () => { const v = !selectMode.value; disableAllTools(); selectMode.value = v; selectRect.x = 0; selectRect.y = 0; selectRect.w = 0; selectRect.h = 0 }
const toggleTextMode = () => {
  const v = !textMode.value
  disableAllTools()
  textMode.value = v
  if (!v) {
    inlineTextEditId.value = null
    selectedTextId.value = null
  }
}
const toggleDrawMode = () => { const v = !drawMode.value; disableAllTools(); drawMode.value = v }

// ===== TEXT TOOL =====
const placeText = (e) => {
  const canvasPoint = getCanvasPointFromEvent(e)
  const imagePoint = mapCanvasPointToImage(canvasPoint.x, canvasPoint.y)
  const x = Math.max(0, Math.min(imageWidth, imagePoint.x))
  const y = Math.max(0, Math.min(imageHeight, imagePoint.y))
  const item = createTextItem({ x, y })
  textItems.value.push(item)
  selectedTextId.value = item.id
  captureState('Add text')
  beginInlineTextEdit(item)
}
const addCenteredText = () => {
  const { srcX, srcY, srcW, srcH } = getSourceRect()
  const item = createTextItem({ x: srcX + srcW / 2, y: srcY + srcH / 2 })
  textItems.value.push(item)
  selectedTextId.value = item.id
  textMode.value = true
  captureState('Add centered text')
  beginInlineTextEdit(item)
}
const beginInlineTextEdit = (item) => {
  ensureTextItemDefaults(item)
  selectedTextId.value = item.id
  syncTextControlsFromItem(item)
  inlineTextDraft.value = item.text
  inlineTextEditId.value = item.id
  nextTick(() => {
    const editor = inlineTextEditor.value
    if (editor) {
      editor.focus()
      editor.select()
    }
  })
}
const commitInlineTextEdit = () => finishInlineTextEdit(true)
const finishInlineTextEdit = (save = true) => {
  if (!inlineTextEditId.value) return
  const item = selectedTextItem.value
  if (save && item) {
    textInput.value = inlineTextDraft.value || 'Text'
    applyTextControlsToItem(item)
    captureState('Edit text')
    scheduleRender()
  } else if (item) {
    syncTextControlsFromItem(item)
  }
  inlineTextEditId.value = null
  inlineTextDraft.value = ''
}
const startDragText = (item, e) => {
  ensureTextItemDefaults(item)
  selectedTextId.value = item.id
  syncTextControlsFromItem(item)
  const canvasRect = canvas.value.getBoundingClientRect()
  const metrics = getRenderMetrics()
  const startPoint = getCanvasPointFromEvent(e)
  const startImagePoint = mapCanvasPointToImage(startPoint.x, startPoint.y, metrics)
  textDragStart = { mx: e.clientX, my: e.clientY, ox: item.x, oy: item.y, startImagePoint, moved: false }
  const onMove = (ev) => {
    if (!textDragStart.moved) {
      const delta = Math.hypot(ev.clientX - textDragStart.mx, ev.clientY - textDragStart.my)
      if (delta < 4) return
      textDragStart.moved = true
    }
    const point = {
      x: (ev.clientX - canvasRect.left) * (canvas.value.width / canvasRect.width),
      y: (ev.clientY - canvasRect.top) * (canvas.value.height / canvasRect.height),
    }
    const imagePoint = mapCanvasPointToImage(point.x, point.y, metrics)
    item.x = Math.max(0, Math.min(imageWidth, textDragStart.ox + (imagePoint.x - textDragStart.startImagePoint.x)))
    item.y = Math.max(0, Math.min(imageHeight, textDragStart.oy + (imagePoint.y - textDragStart.startImagePoint.y)))
    applyTextSnap(item, metrics)
    scheduleRender()
  }
  const onUp = () => {
    if (textDragStart?.moved) captureState('Move text')
    clearTextSnapGuides()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
const startResizeText = (item, e) => {
  ensureTextItemDefaults(item)
  selectedTextId.value = item.id
  syncTextControlsFromItem(item)
  const canvasRect = canvas.value.getBoundingClientRect()
  const anchor = mapImagePointToCanvas(item.x, item.y)
  const startDistance = Math.max(10, Math.hypot(e.clientX - canvasRect.left - anchor.x, e.clientY - canvasRect.top - anchor.y))
  const startSize = item.fontSize
  const onMove = (ev) => {
    const distance = Math.max(10, Math.hypot(ev.clientX - canvasRect.left - anchor.x, ev.clientY - canvasRect.top - anchor.y))
    item.fontSize = clampInput(Math.round(startSize * (distance / startDistance)), 8, 320)
    textFontSize.value = item.fontSize
    scheduleRender()
  }
  const onUp = () => { captureState('Resize text'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
const startRotateText = (item, e) => {
  ensureTextItemDefaults(item)
  selectedTextId.value = item.id
  syncTextControlsFromItem(item)
  const canvasRect = canvas.value.getBoundingClientRect()
  const anchor = mapImagePointToCanvas(item.x, item.y)
  const startAngle = Math.atan2(e.clientY - canvasRect.top - anchor.y, e.clientX - canvasRect.left - anchor.x)
  const startRotation = item.rotation
  const onMove = (ev) => {
    const currentAngle = Math.atan2(ev.clientY - canvasRect.top - anchor.y, ev.clientX - canvasRect.left - anchor.x)
    item.rotation = Math.round(startRotation + (currentAngle - startAngle) * 180 / Math.PI)
    textRotation.value = item.rotation
    scheduleRender()
  }
  const onUp = () => { captureState('Rotate text'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
const commitText = () => {
  if (selectedTextItem.value) {
    applyTextControlsToItem(selectedTextItem.value)
    captureState('Update text')
    scheduleRender()
  }
}
const duplicateSelectedText = () => {
  if (!selectedTextItem.value) return
  const item = createTextItem({
    ...JSON.parse(JSON.stringify(selectedTextItem.value)),
    id: Date.now() + Math.floor(Math.random() * 1000),
    x: Math.min(imageWidth, selectedTextItem.value.x + 24),
    y: Math.min(imageHeight, selectedTextItem.value.y + 24),
  })
  textItems.value.push(item)
  selectedTextId.value = item.id
  syncTextControlsFromItem(item)
  captureState('Duplicate text')
  scheduleRender()
}
const removeSelectedText = () => {
  if (!selectedTextId.value) return
  const nextItems = textItems.value.filter((item) => item.id !== selectedTextId.value)
  if (nextItems.length === textItems.value.length) return
  textItems.value = nextItems
  inlineTextEditId.value = null
  inlineTextDraft.value = ''
  selectedTextId.value = null
  captureState('Delete text')
  scheduleRender()
}
const finishTextEditing = () => {
  if (inlineTextEditId.value) finishInlineTextEdit(true)
  selectedTextId.value = null
  if (textMode.value) {
    disableAllTools()
  }
}
// Watch text settings changes and apply to selected text
watch([textInput, textFontSize, textFontFamily, textColor, textBold, textItalic, textAlign, textRotation, textShadow, textStrokeWidth, textStrokeColor], () => {
  if (!selectedTextId.value || inlineTextEditId.value === selectedTextId.value) return
  applyTextControlsToItem(selectedTextItem.value)
  scheduleRender()
})

// ===== CROP =====
const setCropRatio = (r) => {
  activeCropRatio.value = r.label
  constrainedRatio = r.ratio
  if (cropMode.value) syncCropRectToRatio(constrainedRatio)
}

// Unified crop overlay handlers
const getCropOverlayPoint = (e) => {
  const rect = canvasContainer.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(e.clientX - rect.left, canvas.value.width)),
    y: Math.max(0, Math.min(e.clientY - rect.top, canvas.value.height)),
  }
}

const onCropOverlayMouseDown = (e) => {
  // If clicking outside existing crop box, start drawing a new one
  const pt = getCropOverlayPoint(e)
  cropStart = { x: pt.x, y: pt.y }
  cropDragMode = 'draw'
  cropping = true
  cropRect.x = pt.x; cropRect.y = pt.y; cropRect.w = 0; cropRect.h = 0
}

const onCropOverlayMouseMove = (e) => {
  if (!cropping) return
  if (cropDragMode === 'draw') {
    drawCropFromMouse(e)
  } else if (cropDragMode === 'move') {
    moveCropBox(e)
  } else if (cropDragMode && cropDragMode.startsWith('resize-')) {
    resizeCropBox(e)
  }
}

const onCropOverlayMouseUp = () => {
  cropping = false
  cropDragMode = null
  cropResizeEdge = null
}

// Draw a new crop rect from scratch
const drawCropFromMouse = (e) => {
  const pt = getCropOverlayPoint(e)
  const signX = pt.x >= cropStart.x ? 1 : -1
  const signY = pt.y >= cropStart.y ? 1 : -1
  let width = Math.abs(pt.x - cropStart.x)
  let height = Math.abs(pt.y - cropStart.y)

  const maxWidth = signX > 0 ? canvas.value.width - cropStart.x : cropStart.x
  const maxHeight = signY > 0 ? canvas.value.height - cropStart.y : cropStart.y

  if (constrainedRatio) {
    if (height > 0 && width / height >= constrainedRatio) height = width / constrainedRatio
    else width = height * constrainedRatio

    width = Math.min(width, maxWidth)
    height = width / constrainedRatio
    if (height > maxHeight) { height = maxHeight; width = height * constrainedRatio }
  } else {
    width = Math.min(width, maxWidth)
    height = Math.min(height, maxHeight)
  }

  cropRect.x = signX < 0 ? cropStart.x - width : cropStart.x
  cropRect.y = signY < 0 ? cropStart.y - height : cropStart.y
  cropRect.w = width
  cropRect.h = height
}

// Move existing crop box
const startCropMove = (e) => {
  cropDragMode = 'move'
  cropping = true
  const pt = getCropOverlayPoint(e)
  cropMoveStart = { x: pt.x, y: pt.y, rx: cropRect.x, ry: cropRect.y, rw: cropRect.w, rh: cropRect.h }
}

const moveCropBox = (e) => {
  const pt = getCropOverlayPoint(e)
  const dx = pt.x - cropMoveStart.x
  const dy = pt.y - cropMoveStart.y
  const maxX = canvas.value.width - cropMoveStart.rw
  const maxY = canvas.value.height - cropMoveStart.rh
  cropRect.x = Math.max(0, Math.min(maxX, cropMoveStart.rx + dx))
  cropRect.y = Math.max(0, Math.min(maxY, cropMoveStart.ry + dy))
}

// Resize from edge/corner handles
const startCropResize = (edge, e) => {
  cropDragMode = `resize-${edge}`
  cropResizeEdge = edge
  cropping = true
  const pt = getCropOverlayPoint(e)
  cropMoveStart = { x: pt.x, y: pt.y, rx: cropRect.x, ry: cropRect.y, rw: cropRect.w, rh: cropRect.h }
}

const resizeCropBox = (e) => {
  const pt = getCropOverlayPoint(e)
  const edge = cropResizeEdge
  const { rx, ry, rw, rh } = cropMoveStart
  const cw = canvas.value.width, ch = canvas.value.height

  let newX = rx, newY = ry, newW = rw, newH = rh

  // Determine which edges to adjust
  const movesLeft = edge.includes('w')
  const movesRight = edge.includes('e')
  const movesTop = edge.includes('n')
  const movesBottom = edge.includes('s')

  if (movesLeft) {
    const left = Math.max(0, Math.min(pt.x, rx + rw - 20))
    newX = left; newW = rx + rw - left
  }
  if (movesRight) {
    newW = Math.max(20, Math.min(pt.x - rx, cw - rx))
  }
  if (movesTop) {
    const top = Math.max(0, Math.min(pt.y, ry + rh - 20))
    newY = top; newH = ry + rh - top
  }
  if (movesBottom) {
    newH = Math.max(20, Math.min(pt.y - ry, ch - ry))
  }

  // Enforce aspect ratio constraint
  if (constrainedRatio) {
    const aspectW = newH * constrainedRatio
    const aspectH = newW / constrainedRatio

    if (edge === 'n' || edge === 's') {
      // Top/bottom edge: adjust width from center
      newW = Math.min(aspectW, cw)
      newH = newW / constrainedRatio
      const cx = newX + (rx + rw / 2 - newX)
      newX = Math.max(0, Math.min(cw - newW, cx - newW / 2))
    } else if (edge === 'w' || edge === 'e') {
      // Left/right edge: adjust height from center
      newH = Math.min(aspectH, ch)
      newW = newH * constrainedRatio
      const cy = newY + (ry + rh / 2 - newY)
      newY = Math.max(0, Math.min(ch - newH, cy - newH / 2))
    } else {
      // Corner: constrain to ratio, keeping the opposite corner fixed
      if (newW / newH > constrainedRatio) {
        newW = newH * constrainedRatio
      } else {
        newH = newW / constrainedRatio
      }
      // Re-anchor based on which corner
      if (movesLeft) newX = rx + rw - newW
      if (movesTop) newY = ry + rh - newH
    }
  }

  // Clamp to canvas bounds
  newX = Math.max(0, newX)
  newY = Math.max(0, newY)
  newW = Math.min(newW, cw - newX)
  newH = Math.min(newH, ch - newY)

  cropRect.x = newX
  cropRect.y = newY
  cropRect.w = Math.max(20, newW)
  cropRect.h = Math.max(20, newH)
}

const startCrop = (e) => {
  const rect = canvasContainer.value.getBoundingClientRect()
  cropStart = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  cropping = true; cropRect.x = cropStart.x; cropRect.y = cropStart.y; cropRect.w = 0; cropRect.h = 0
}
const moveCrop = (e) => {
  if (!cropping) return
  drawCropFromMouse(e)
}
const endCrop = () => { cropping = false }
const cancelCrop = () => {
  cropping = false
  cropRect.x = 0; cropRect.y = 0; cropRect.w = 0; cropRect.h = 0
  cropMode.value = false
}
const applyCrop = () => {
  if (cropRect.w < 10 || cropRect.h < 10) return
  const bounds = getImageBoundsFromCanvasRect(cropRect)
  if (bounds.w < 10 || bounds.h < 10) return
  pendingCrop.x = bounds.x
  pendingCrop.y = bounds.y
  pendingCrop.w = bounds.w
  pendingCrop.h = bounds.h
  cropRect.x = 0; cropRect.y = 0; cropRect.w = 0; cropRect.h = 0
  cropMode.value = false; renderCanvas(); captureState('Crop')
}
const clearCrop = () => { pendingCrop.x = 0; pendingCrop.y = 0; pendingCrop.w = 0; pendingCrop.h = 0; cropRect.x = 0; cropRect.y = 0; cropRect.w = 0; cropRect.h = 0; renderCanvas() }
const cropBoxStyle = computed(() => ({ left: cropRect.x + 'px', top: cropRect.y + 'px', width: cropRect.w + 'px', height: cropRect.h + 'px' }))
const realCropDimensions = computed(() => { if (!cropRect.w) return ''; return `${Math.round(cropRect.w / displayScale)} × ${Math.round(cropRect.h / displayScale)} px` })

// ===== SELECT =====
const startSelect = (e) => { const r = canvasContainer.value.getBoundingClientRect(); selectStart = { x: e.clientX - r.left, y: e.clientY - r.top }; selecting = true; selectRect.x = selectStart.x; selectRect.y = selectStart.y; selectRect.w = 0; selectRect.h = 0 }
const moveSelect = (e) => {
  if (!selecting) return
  const r = canvasContainer.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - r.left, canvas.value.width)), y = Math.max(0, Math.min(e.clientY - r.top, canvas.value.height))
  selectRect.x = Math.min(selectStart.x, x); selectRect.y = Math.min(selectStart.y, y)
  selectRect.w = Math.abs(x - selectStart.x); selectRect.h = Math.abs(y - selectStart.y)
}
const endSelect = () => { selecting = false }
const deleteSelection = () => {
  if (selectRect.w < 2 || selectRect.h < 2) return
  captureState('Delete selection')
  const ctx = canvas.value.getContext('2d'); ctx.clearRect(selectRect.x, selectRect.y, selectRect.w, selectRect.h)
  if (editCanvas) {
    const bounds = getImageBoundsFromCanvasRect(selectRect)
    editCanvas.getContext('2d').clearRect(bounds.x, bounds.y, bounds.w, bounds.h)
  }
  bgRemoved.value = true; selectRect.x = 0; selectRect.y = 0; selectRect.w = 0; selectRect.h = 0
}
const selectBoxStyle = computed(() => ({ left: selectRect.x + 'px', top: selectRect.y + 'px', width: selectRect.w + 'px', height: selectRect.h + 'px' }))
const realSelectDimensions = computed(() => { if (!selectRect.w) return ''; return `${Math.round(selectRect.w / displayScale)} × ${Math.round(selectRect.h / displayScale)} px` })

// ===== ROTATE / FLIP =====
const rotateImage = (deg) => { captureState('Rotate image'); adjustments.rotation = (adjustments.rotation + deg + 360) % 360; renderCanvas() }
const flipImage = (axis) => { captureState(axis === 'h' ? 'Flip horizontal' : 'Flip vertical'); if (axis === 'h') adjustments.flipH = !adjustments.flipH; else adjustments.flipV = !adjustments.flipV; renderCanvas() }
const autoEnhance = () => { captureState('Auto enhance'); adjustments.exposure = 0.15; adjustments.brightness = 103; adjustments.contrast = 110; adjustments.highlights = -10; adjustments.shadows = 20; adjustments.vibrance = 15; adjustments.clarity = 15; adjustments.saturation = 110; adjustments.sharpen = 1; activeFilter.value = null; renderCanvas() }

// ===== SLIDER HELPERS =====
const sliderDefaults = { exposure: 0, brightness: 100, contrast: 100, highlights: 0, shadows: 0, whites: 0, blacks: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 100, clarity: 0, dehaze: 0, sharpen: 0, vignette: 0, grain: 0, straighten: 0 }
const clampInput = (val, min, max) => isNaN(val) ? min : Math.max(min, Math.min(max, val))
const setSliderVal = (s, e) => { const v = +e.target.value; adjustments[s.key] = clampInput(v, s.min, s.max) }
const resetSlider = (s) => { adjustments[s.key] = sliderDefaults[s.key] ?? 0 }
const setStraighten = (e) => { adjustments.straighten = clampInput(+e.target.value, -45, 45) }
const resetLightSection = () => { adjustments.exposure = 0; adjustments.brightness = 100; adjustments.contrast = 100; adjustments.highlights = 0; adjustments.shadows = 0; adjustments.whites = 0; adjustments.blacks = 0 }
const resetColorSection = () => { adjustments.temperature = 0; adjustments.tint = 0; adjustments.vibrance = 0; adjustments.saturation = 100 }
const resetDetailSection = () => { adjustments.clarity = 0; adjustments.dehaze = 0; adjustments.sharpen = 0 }

// ===== PRESETS =====
const presets = [
  { name: 'HDR',       icon: '🌄', exposure: 0.3, brightness: 102, contrast: 112, saturation: 115, highlights: -85, shadows: 70, whites: 20, blacks: 25, clarity: 40, dehaze: 25, vibrance: 18, sharpen: 1.5 },
  { name: 'B&W',       icon: '🖤', exposure: 0.05, brightness: 105, contrast: 120, saturation: 0, highlights: -15, shadows: 20, clarity: 12, sharpen: 0.5 },
  { name: 'Cinematic', icon: '🎬', exposure: -0.2, brightness: 96, contrast: 125, saturation: 78, temperature: -20, tint: -4, blacks: 18, highlights: -45, shadows: 20, clarity: 15, dehaze: 5, vignette: 38, grain: 4 },
  { name: 'Matte',     icon: '🌫️', brightness: 105, contrast: 78, saturation: 78, blacks: 35, highlights: -10, clarity: -12 },
  { name: 'Vivid',     icon: '🎨', brightness: 103, contrast: 112, saturation: 140, vibrance: 30, clarity: 18, highlights: -10, sharpen: 1 },
  { name: 'Dramatic',  icon: '🎭', brightness: 95, contrast: 135, saturation: 85, clarity: 45, highlights: -30, shadows: -25, sharpen: 2, vignette: 30 },
  { name: 'Portrait',  icon: '📷', clarity: -5 },
  { name: 'Golden',    icon: '☀️', brightness: 106, contrast: 102, saturation: 120, temperature: 28, tint: 6, highlights: -15, shadows: 10, vignette: 18 },
  { name: 'Velvia',    icon: '🏔️', brightness: 100, contrast: 115, saturation: 145, vibrance: 25, clarity: 22, dehaze: 15, highlights: -10, sharpen: 1 },
  { name: 'Noir',      icon: '🕶️', brightness: 100, contrast: 130, saturation: 0, blacks: -15, highlights: -25, shadows: -10, clarity: 25, vignette: 40, grain: 14 },
  { name: 'Cool',      icon: '❄️', brightness: 100, contrast: 108, saturation: 90, temperature: -30, tint: -8, highlights: -10, clarity: 5 },
  { name: 'Vintage',   icon: '📜', brightness: 97, contrast: 78, saturation: 55, temperature: 18, tint: 4, blacks: 40, highlights: -20, shadows: 12, clarity: -5, grain: 10, vignette: 28 },
]
const applyPreset = (p) => {
  captureState(`Preset: ${p.name}`)
  if (activeFilter.value === p.name) {
    // Toggle off
    resetAdjustments(); resetPortraitBlurControls(); activeFilter.value = null; renderCanvas(); return
  }
  resetAdjustments()
  const blend = presetIntensity.value / 100
  for (const [k, v] of Object.entries(p)) {
    if (k !== 'name' && k !== 'icon' && k in adjustments && typeof v === 'number') {
      adjustments[k] = sliderDefaults[k] !== undefined ? sliderDefaults[k] + (v - sliderDefaults[k]) * blend : v * blend
    }
  }
  if (p.vignette) adjustments.vignette = p.vignette * blend
  if (p.grain) adjustments.grain = p.grain * blend
  activeFilter.value = p.name
  if (p.name === 'Portrait' && isPro.value && !_portraitMask) {
    applyPortraitBlur()
  } else if (p.name === 'Portrait' && _portraitMask) {
    applyPortraitPreset(portraitBlurPresets[1], { capture: false })
  }
  renderCanvas()
}

const resetPortraitBlurControls = () => {
  portraitBlur.value = 0
  portraitFeather.value = 36
  portraitBackdrop.value = 10
  portraitSubjectProtect.value = 18
  portraitPreset.value = 'Natural'
}

const applyPortraitPreset = (preset, options = {}) => {
  const capture = options.capture ?? true
  portraitPreset.value = preset.name
  portraitBlur.value = preset.blur
  portraitFeather.value = preset.feather
  portraitBackdrop.value = preset.backdrop
  portraitSubjectProtect.value = preset.protect ?? 18
  if (capture && _portraitMask) captureState(`Portrait preset: ${preset.name}`)
  scheduleRender()
}

// ===== PIXEL PROCESSING ENGINE =====
const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v
const smoothstep = (edge0, edge1, x) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t) }

// RGB <-> HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2
  if (max === min) { h = s = 0 }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s, l]
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  let r, g, b
  if (s === 0) { r = g = b = l }
  else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3)
  }
  return [r * 255, g * 255, b * 255]
}

// HSL band weight: how much a given hue belongs to each named band
function getHslBandWeight(hue) {
  const weights = {}
  for (const band of hslBands) {
    let dist = Math.abs(hue - band.center)
    if (dist > 180) dist = 360 - dist
    weights[band.name] = Math.max(0, 1 - dist / 30) // 30° half-width
  }
  return weights
}

// Check if any HSL adjustments are non-zero
function hasHslAdjustments() {
  for (const ch of Object.values(hslChannels)) { if (ch.h !== 0 || ch.s !== 0 || ch.l !== 0) return true }
  return false
}

// ===== TONE CURVE =====
function computeCurveLUT(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const n = sorted.length
  const lut = new Uint8Array(256)
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut }

  // Monotone cubic hermite interpolation
  const dx = [], dy = [], m = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(sorted[i+1].x - sorted[i].x)
    dy.push(sorted[i+1].y - sorted[i].y)
    m.push(dx[i] > 0 ? dy[i] / dx[i] : 0)
  }
  const tangents = new Array(n)
  tangents[0] = m[0]; tangents[n-1] = m[n-2]
  for (let i = 1; i < n - 1; i++) {
    if (m[i-1] * m[i] <= 0) tangents[i] = 0
    else tangents[i] = (m[i-1] + m[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-6) { tangents[i] = 0; tangents[i+1] = 0; continue }
    const a = tangents[i] / m[i], b = tangents[i+1] / m[i]
    const mag = a * a + b * b
    if (mag > 9) { const s = 3 / Math.sqrt(mag); tangents[i] = s * a * m[i]; tangents[i+1] = s * b * m[i] }
  }

  let seg = 0
  for (let x = 0; x < 256; x++) {
    if (x <= sorted[0].x) { lut[x] = Math.max(0, Math.min(255, Math.round(sorted[0].y))); continue }
    if (x >= sorted[n-1].x) { lut[x] = Math.max(0, Math.min(255, Math.round(sorted[n-1].y))); continue }
    while (seg < n - 2 && x > sorted[seg + 1].x) seg++
    const h = dx[seg]
    if (h === 0) { lut[x] = Math.round(sorted[seg].y); continue }
    const t = (x - sorted[seg].x) / h, t2 = t * t, t3 = t2 * t
    const val = (2*t3 - 3*t2 + 1) * sorted[seg].y + (t3 - 2*t2 + t) * h * tangents[seg] + (-2*t3 + 3*t2) * sorted[seg+1].y + (t3 - t2) * h * tangents[seg+1]
    lut[x] = Math.max(0, Math.min(255, Math.round(val)))
  }
  return lut
}

function updateCurveLUTs() {
  curveLUTs.rgb = computeCurveLUT(curvePoints.rgb)
  curveLUTs.red = computeCurveLUT(curvePoints.red)
  curveLUTs.green = computeCurveLUT(curvePoints.green)
  curveLUTs.blue = computeCurveLUT(curvePoints.blue)
}

function isCurveIdentity(lut) {
  for (let i = 0; i < 256; i++) { if (lut[i] !== i) return false }
  return true
}

// Curve canvas interaction
const onCurveMouseDown = (e) => {
  const rect = curveCanvas.value.getBoundingClientRect()
  const sx = rect.width / 256, sy = rect.height / 256
  const mx = (e.clientX - rect.left) / sx, my = 255 - (e.clientY - rect.top) / sy
  const pts = curvePoints[curveChannel.value]
  // Check if near an existing point
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(pts[i].x - mx) < 10 && Math.abs(pts[i].y - my) < 10) { dragCurveIdx = i; return }
  }
  // Add new point
  const newPt = { x: Math.round(mx), y: Math.round(my) }
  pts.push(newPt); pts.sort((a, b) => a.x - b.x)
  dragCurveIdx = pts.indexOf(newPt)
  updateCurveLUTs(); renderCurve(); renderCanvas()
}
const onCurveMouseMove = (e) => {
  if (dragCurveIdx < 0) return
  const rect = curveCanvas.value.getBoundingClientRect()
  const sx = rect.width / 256, sy = rect.height / 256
  const pts = curvePoints[curveChannel.value]
  const pt = pts[dragCurveIdx]
  if (!pt) return
  const newX = Math.max(0, Math.min(255, Math.round((e.clientX - rect.left) / sx)))
  const newY = Math.max(0, Math.min(255, Math.round(255 - (e.clientY - rect.top) / sy)))
  // Don't move endpoints past each other
  if (dragCurveIdx === 0) pt.x = 0
  else if (dragCurveIdx === pts.length - 1) pt.x = 255
  else pt.x = newX
  pt.y = newY
  updateCurveLUTs(); renderCurve(); renderCanvas()
}
const onCurveMouseUp = () => { dragCurveIdx = -1 }
const onCurveRightClick = (e) => {
  const rect = curveCanvas.value.getBoundingClientRect()
  const sx = rect.width / 256, sy = rect.height / 256
  const mx = (e.clientX - rect.left) / sx, my = 255 - (e.clientY - rect.top) / sy
  const pts = curvePoints[curveChannel.value]
  for (let i = 1; i < pts.length - 1; i++) {
    if (Math.abs(pts[i].x - mx) < 10 && Math.abs(pts[i].y - my) < 10) {
      pts.splice(i, 1); updateCurveLUTs(); renderCurve(); renderCanvas(); return
    }
  }
}
const resetCurve = () => {
  curvePoints[curveChannel.value] = [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  updateCurveLUTs(); renderCurve(); renderCanvas()
}

function renderCurve() {
  const cv = curveCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  const w = cv.width, h = cv.height
  ctx.clearRect(0, 0, w, h)
  // Background
  ctx.fillStyle = '#1a1a1c'; ctx.fillRect(0, 0, w, h)
  // Grid
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke() }
  // Identity line
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke()
  // Draw all channel curves faintly, then active channel brightly
  const channelColors = { rgb: '#ffffff', red: '#ff4444', green: '#44ff44', blue: '#4488ff' }
  for (const ch of ['rgb', 'red', 'green', 'blue']) {
    const lut = computeCurveLUT(curvePoints[ch])
    const isActive = ch === curveChannel.value
    ctx.strokeStyle = channelColors[ch]
    ctx.globalAlpha = isActive ? 1 : 0.15
    ctx.lineWidth = isActive ? 2 : 1
    ctx.beginPath()
    for (let x = 0; x < 256; x++) { const px = x * w / 255, py = h - lut[x] * h / 255; x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py) }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  // Control points for active channel
  const pts = curvePoints[curveChannel.value]
  ctx.fillStyle = channelColors[curveChannel.value]
  for (const pt of pts) { ctx.beginPath(); ctx.arc(pt.x * w / 255, h - pt.y * h / 255, 5, 0, Math.PI * 2); ctx.fill() }
}

// ===== OPTIMIZED RENDER PIPELINE =====
let renderRAF = 0
let _idleTimer = 0
let _interacting = false
const _rLUT = new Int16Array(256)
const _gLUT = new Int16Array(256)
const _bLUT = new Int16Array(256)
let _tonalLUT = null
let _clarityLUT = null
let _histCanvas = null
let _histCtx = null

function rebuildLUTs() {
  updateCurveLUTs()
  const rgbC = curveLUTs.rgb, rC = curveLUTs.red, gC = curveLUTs.green, bC = curveLUTs.blue
  const expMul = Math.pow(2, adjustments.exposure)
  const bri = (adjustments.brightness - 100) * 2.55
  const con = adjustments.contrast / 100
  const temp = adjustments.temperature, tintV = adjustments.tint
  for (let i = 0; i < 256; i++) {
    const base = rgbC[i]
    let rv = rC[base] * expMul + bri; rv = (rv - 128) * con + 128 + temp * 1.5 - tintV * 0.4
    let gv = gC[base] * expMul + bri; gv = (gv - 128) * con + 128 + tintV * 0.8
    let bv = bC[base] * expMul + bri; bv = (bv - 128) * con + 128 - temp * 1.5
    _rLUT[i] = Math.round(rv); _gLUT[i] = Math.round(gv); _bLUT[i] = Math.round(bv)
  }
  const hl = adjustments.highlights * 0.003, sh = adjustments.shadows * 0.003
  const wh = adjustments.whites * 0.003, bl = adjustments.blacks * 0.003
  if (hl || sh || wh || bl) {
    if (!_tonalLUT) _tonalLUT = new Int16Array(256)
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let adj = 0
      if (hl) adj += hl * smoothstep(0.5, 1, t)
      if (sh) adj += sh * (1 - smoothstep(0, 0.5, t))
      if (wh) adj += wh * smoothstep(0.7, 1, t)
      if (bl) adj += bl * (1 - smoothstep(0, 0.3, t))
      _tonalLUT[i] = Math.round(adj * 255)
    }
  } else _tonalLUT = null
  const clar = adjustments.clarity * 0.005
  if (clar) {
    if (!_clarityLUT) _clarityLUT = new Float32Array(256)
    for (let i = 0; i < 256; i++) _clarityLUT[i] = 1 + clar * (1 - Math.abs(i / 255 - 0.5) * 2)
  } else _clarityLUT = null
}

const scheduleRender = () => {
  _interacting = true
  if (_idleTimer) clearTimeout(_idleTimer)
  _idleTimer = setTimeout(() => { _interacting = false; renderCanvas() }, 250)
  if (renderRAF) return
  renderRAF = requestAnimationFrame(() => { renderRAF = 0; renderCanvas() })
}

const renderCanvas = () => {
  if (!canvas.value || !originalImage) return
  const wrapper = canvasWrapper.value
  if (!wrapper) return

  const source = showOriginal.value ? originalImage : (editCanvas || originalImage)
  const metrics = getRenderMetrics()
  displayScale = metrics.scale

  canvas.value.width = metrics.canvasW; canvas.value.height = metrics.canvasH
  const ctx = canvas.value.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, metrics.canvasW, metrics.canvasH)

  drawImageLayer(ctx, source, metrics)

  // Apply pixel effects (skip if showing original)
  if (!showOriginal.value) {
    applyPixelEffects(canvas.value)
    if (adjustments.sharpen > 0 && !_interacting) applySharpen(canvas.value, adjustments.sharpen)
    if (portraitBlur.value > 0 && _portraitMask && !_interacting) applyPortraitMaskBlur(canvas.value, portraitBlur.value)
  }

  if (!showOriginal.value && compareMode.value) drawTextLayer(ctx, metrics)

  // Before/After split comparison
  if (compareMode.value && originalImage && !showOriginal.value) {
    const splitX = Math.round(metrics.canvasW * compareSplit.value)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, splitX, metrics.canvasH)
    ctx.clip()
    ctx.clearRect(0, 0, splitX, metrics.canvasH)
    drawImageLayer(ctx, originalImage, metrics)
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.moveTo(splitX, 0)
    ctx.lineTo(splitX, metrics.canvasH)
    ctx.stroke()
    ctx.restore()
    ctx.font = '600 9px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    if (splitX > 50) ctx.fillText('BEFORE', splitX / 2, 20)
    if (metrics.canvasW - splitX > 50) ctx.fillText('AFTER', splitX + (metrics.canvasW - splitX) / 2, 20)
  }

  if (!_interacting) updateHistogram()
  nextTick(() => renderCurve())
}

function applyPixelEffects(targetCanvas) {
  const ctx = targetCanvas.getContext('2d')
  const w = targetCanvas.width, h = targetCanvas.height
  if (w === 0 || h === 0) return

  rebuildLUTs()
  const hasHsl = hasHslAdjustments()
  const satFactor = adjustments.saturation / 100
  const vibAmt = adjustments.vibrance * 0.01
  const dehazeAmt = adjustments.dehaze * 0.01
  const vigAmt = adjustments.vignette * 0.01
  const grainAmt = adjustments.grain

  // Split toning
  const stHlAmt = splitHighlightAmount.value * 0.01
  const stShAmt = splitShadowAmount.value * 0.01
  let stHlR = 0, stHlG = 0, stHlB = 0, stShR = 0, stShG = 0, stShB = 0
  if (stHlAmt > 0) { const c = splitHighlight.value; stHlR = parseInt(c.slice(1,3), 16); stHlG = parseInt(c.slice(3,5), 16); stHlB = parseInt(c.slice(5,7), 16) }
  if (stShAmt > 0) { const c = splitShadow.value; stShR = parseInt(c.slice(1,3), 16); stShG = parseInt(c.slice(3,5), 16); stShB = parseInt(c.slice(5,7), 16) }

  // Early-out: check if any processing needed
  let lutsIdentity = true
  for (let i = 0; i < 256; i++) { if (_rLUT[i] !== i || _gLUT[i] !== i || _bLUT[i] !== i) { lutsIdentity = false; break } }
  if (lutsIdentity && !_tonalLUT && !_clarityLUT && !hasHsl &&
    vibAmt === 0 && satFactor === 1 && dehazeAmt === 0 &&
    vigAmt === 0 && grainAmt === 0 && stHlAmt === 0 && stShAmt === 0) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Vignette: squared distance (no sqrt needed)
  const cx = w * 0.5, cy = h * 0.5
  const invMaxDist2 = vigAmt > 0 ? vigAmt / (cx * cx + cy * cy) : 0

  // Dehaze constants
  const dehazeMul = dehazeAmt !== 0 ? 1 + dehazeAmt * 0.3 : 1
  const dehazeBase = dehazeAmt * 20

  for (let y = 0; y < h; y++) {
    const dy2 = vigAmt > 0 ? (y - cy) * (y - cy) : 0
    const rowOff = y * w << 2
    for (let x = 0; x < w; x++) {
      const i = rowOff + (x << 2)
      if (data[i + 3] === 0) continue

      // Channel LUTs: curve + exposure + brightness + contrast + temp/tint in one lookup
      let r = _rLUT[data[i]], g = _gLUT[data[i + 1]], b = _bLUT[data[i + 2]]

      // Integer luminance via fixed-point (77/256≈0.299, 150/256≈0.587, 29/256≈0.113)
      const cr = r < 0 ? 0 : r > 255 ? 255 : r
      const lum = (77 * cr + 150 * (g < 0 ? 0 : g > 255 ? 255 : g) + 29 * (b < 0 ? 0 : b > 255 ? 255 : b)) >> 8

      // Tonal adjustments from pre-computed LUT
      if (_tonalLUT) { const adj = _tonalLUT[lum]; r += adj; g += adj; b += adj }

      // HSL per-channel
      if (hasHsl) {
        const cR = r < 0 ? 0 : r > 255 ? 255 : r, cG = g < 0 ? 0 : g > 255 ? 255 : g, cB = b < 0 ? 0 : b > 255 ? 255 : b
        let [hue, sat, lig] = rgbToHsl(cR, cG, cB)
        const weights = getHslBandWeight(hue)
        let hShift = 0, sShift = 0, lShift = 0
        for (const [name, bw] of Object.entries(weights)) {
          if (bw > 0) { hShift += hslChannels[name].h * bw; sShift += hslChannels[name].s * bw; lShift += hslChannels[name].l * bw }
        }
        if (hShift !== 0 || sShift !== 0 || lShift !== 0) {
          hue += hShift
          sat = Math.max(0, Math.min(1, sat + sShift * 0.01))
          lig = Math.max(0, Math.min(1, lig + lShift * 0.01))
          ;[r, g, b] = hslToRgb(hue, sat, lig)
        }
      }

      // Vibrance
      if (vibAmt !== 0) {
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b)
        const curSat = maxC > 0 ? (maxC - minC) / maxC : 0
        const boost = vibAmt * (1 - curSat)
        const avg = (r + g + b) / 3
        r += (r - avg) * boost; g += (g - avg) * boost; b += (b - avg) * boost
      }

      // Saturation
      if (satFactor !== 1) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        r = gray + (r - gray) * satFactor; g = gray + (g - gray) * satFactor; b = gray + (b - gray) * satFactor
      }

      // Clarity from pre-computed LUT
      if (_clarityLUT) {
        const cf = _clarityLUT[lum]
        r = (r - 128) * cf + 128; g = (g - 128) * cf + 128; b = (b - 128) * cf + 128
      }

      // Dehaze
      if (dehazeAmt !== 0) {
        const darkW = 1 - lum / 255
        r = r * dehazeMul - dehazeBase * darkW
        g = g * dehazeMul - dehazeBase * darkW
        b = b * dehazeMul - dehazeBase * darkW
      }

      // Split toning
      if (stHlAmt > 0 && lum > 127) {
        const sw = (lum / 255 - 0.5) * 2 * stHlAmt * 0.3
        r += (stHlR - r) * sw; g += (stHlG - g) * sw; b += (stHlB - b) * sw
      }
      if (stShAmt > 0 && lum < 128) {
        const sw = (1 - lum / 127.5) * stShAmt * 0.3
        r += (stShR - r) * sw; g += (stShG - g) * sw; b += (stShB - b) * sw
      }

      // Vignette (squared distance — no sqrt)
      if (invMaxDist2 > 0) {
        const dx = x - cx
        const vf = 1 - (dx * dx + dy2) * invMaxDist2
        r *= vf; g *= vf; b *= vf
      }

      // Grain
      if (grainAmt > 0) {
        const noise = (Math.random() - 0.5) * grainAmt * 1.5
        r += noise; g += noise; b += noise
      }

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r + 0.5 | 0
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g + 0.5 | 0
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b + 0.5 | 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

// ===== AI PORTRAIT BLUR =====
const applyPortraitBlur = async () => {
  if (!isPro.value || !originalImage || portraitProcessing.value) return
  portraitProcessing.value = true
  try {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = imageWidth; tempCanvas.height = imageHeight
    tempCanvas.getContext('2d').drawImage(originalImage, 0, 0)
    const resultDataUrl = await window.electron.ipcRenderer.invoke('remove-bg-rmbg', tempCanvas.toDataURL('image/png'))
    const maskImg = new Image()
    await new Promise((resolve, reject) => { maskImg.onload = resolve; maskImg.onerror = reject; maskImg.src = resultDataUrl })
    // Extract the alpha channel as a grayscale mask
    const mc = document.createElement('canvas')
    mc.width = imageWidth; mc.height = imageHeight
    const mctx = mc.getContext('2d')
    mctx.drawImage(maskImg, 0, 0)
    _portraitMask = mc
    if (portraitBlur.value === 0) applyPortraitPreset(portraitBlurPresets[1], { capture: false })
    captureState()
    renderCanvas()
  } catch (err) { console.error('Portrait detection failed:', err) }
  finally { portraitProcessing.value = false }
}

function applyPortraitMaskBlur(targetCanvas, amount) {
  const w = targetCanvas.width, h = targetCanvas.height
  if (!_portraitMask || w === 0 || h === 0) return
  const feather = portraitFeather.value / 100
  const backdrop = portraitBackdrop.value / 100
  const subjectProtect = portraitSubjectProtect.value / 40
  // More moderate scaling than before so portrait mode looks photographic instead of smeared.
  const maxDim = Math.max(w, h)
  const blurPx = Math.round(Math.pow(amount / 100, 1.04) * maxDim / 82)
  if (blurPx < 1) return
  const ctx = targetCanvas.getContext('2d')

  // 1. Save sharp original
  const sharpC = document.createElement('canvas')
  sharpC.width = w; sharpC.height = h
  const sharpCtx = sharpC.getContext('2d')
  sharpCtx.drawImage(targetCanvas, 0, 0)

  // 2. Create blurred background (pad edges to prevent color bleeding)
  const pad = blurPx * 2
  const padW = w + pad * 2, padH = h + pad * 2
  const padC = document.createElement('canvas')
  padC.width = padW; padC.height = padH
  const pctx = padC.getContext('2d')
  // Fill padded border by stretching edge pixels
  pctx.drawImage(sharpC, 0, 0, 1, h, 0, pad, pad, h)             // left
  pctx.drawImage(sharpC, w - 1, 0, 1, h, padW - pad, pad, pad, h) // right
  pctx.drawImage(sharpC, 0, 0, w, 1, pad, 0, w, pad)             // top
  pctx.drawImage(sharpC, 0, h - 1, w, 1, pad, padH - pad, w, pad) // bottom
  pctx.drawImage(sharpC, 0, 0, w, h, pad, pad, w, h)             // center
  const blurC = document.createElement('canvas')
  blurC.width = padW; blurC.height = padH
  const bctx = blurC.getContext('2d')
  bctx.filter = `blur(${blurPx}px)`
  bctx.drawImage(padC, 0, 0)
  const blurNearC = document.createElement('canvas')
  blurNearC.width = padW; blurNearC.height = padH
  const bnctx = blurNearC.getContext('2d')
  bnctx.filter = `blur(${Math.max(4, Math.round(blurPx * 0.45))}px)`
  bnctx.drawImage(padC, 0, 0)

  // 3. Build soft mask from RMBG alpha channel
  const maskC = document.createElement('canvas')
  maskC.width = w; maskC.height = h
  const mctx = maskC.getContext('2d')
  mctx.drawImage(_portraitMask, 0, 0, w, h)
  const maskImgData = mctx.getImageData(0, 0, w, h)
  const md = maskImgData.data
  // Alpha → grayscale (white = subject, black = background)
  for (let i = 0; i < md.length; i += 4) {
    const a = md[i + 3]
    md[i] = md[i + 1] = md[i + 2] = a
    md[i + 3] = 255
  }
  mctx.putImageData(maskImgData, 0, 0)

  // Small feather to soften hard mask edges (not proportional to blur!)
  const featherPx = Math.max(2, Math.round(maxDim / (310 - feather * 150)))
  const softMaskC = document.createElement('canvas')
  softMaskC.width = w; softMaskC.height = h
  const smctx = softMaskC.getContext('2d')
  smctx.filter = `blur(${featherPx}px)`
  smctx.drawImage(maskC, 0, 0)
  const protectMaskC = document.createElement('canvas')
  protectMaskC.width = w; protectMaskC.height = h
  const pmctx = protectMaskC.getContext('2d')
  const expandPx = Math.max(1, Math.round(maxDim / (420 - subjectProtect * 190)))
  pmctx.filter = `blur(${expandPx}px)`
  pmctx.drawImage(maskC, 0, 0)

  // 4. Per-pixel alpha blend: sharp × mask + blurred × (1 - mask)
  const sharpData = sharpCtx.getImageData(0, 0, w, h).data
  const blurData = bctx.getImageData(pad, pad, w, h).data
  const blurNearData = bnctx.getImageData(pad, pad, w, h).data
  const softData = smctx.getImageData(0, 0, w, h).data
  const protectData = pmctx.getImageData(0, 0, w, h).data
  const result = ctx.createImageData(w, h)
  const rd = result.data
  for (let i = 0; i < rd.length; i += 4) {
    const maskBase = softData[i] / 255
    const expandedMask = protectData[i] / 255
    const protectedMask = Math.min(1, Math.max(maskBase, expandedMask * (0.7 + subjectProtect * 0.22)))
    const normalizedMask = smoothstep(Math.max(0.01, 0.15 - feather * 0.1 - subjectProtect * 0.06), Math.min(0.99, 0.82 + feather * 0.08 + subjectProtect * 0.05), protectedMask)
    const bgTone = 1 - backdrop * 0.28
    const edgeBlend = smoothstep(0.2, 0.88, normalizedMask)
    const bgR = blurNearData[i] * edgeBlend + blurData[i] * (1 - edgeBlend)
    const bgG = blurNearData[i + 1] * edgeBlend + blurData[i + 1] * (1 - edgeBlend)
    const bgB = blurNearData[i + 2] * edgeBlend + blurData[i + 2] * (1 - edgeBlend)
    const blurGray = (bgR + bgG + bgB) / 3
    const bgSatMix = backdrop * 0.14
    const tonedR = (bgR * (1 - bgSatMix) + blurGray * bgSatMix) * bgTone
    const tonedG = (bgG * (1 - bgSatMix) + blurGray * bgSatMix) * bgTone
    const tonedB = (bgB * (1 - bgSatMix) + blurGray * bgSatMix) * bgTone
    const m = normalizedMask
    const inv = 1 - m
    rd[i]     = sharpData[i]     * m + tonedR * inv
    rd[i + 1] = sharpData[i + 1] * m + tonedG * inv
    rd[i + 2] = sharpData[i + 2] * m + tonedB * inv
    rd[i + 3] = 255
  }
  ctx.putImageData(result, 0, 0)
}

// ===== SHARPEN (Unsharp Mask) =====
function applySharpen(targetCanvas, amount) {
  if (amount <= 0) return
  const ctx = targetCanvas.getContext('2d')
  const w = targetCanvas.width, h = targetCanvas.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const src = new Uint8Array(imageData.data.length)
  src.set(imageData.data)
  const dst = imageData.data
  const k = amount * 0.3
  const stride = w << 2
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * stride
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + (x << 2)
      for (let c = 0; c < 3; c++) {
        const ic = i + c
        const center = src[ic]
        const avg = (src[ic - stride - 4] + src[ic - stride] + src[ic - stride + 4] +
          src[ic - 4] + src[ic + 4] +
          src[ic + stride - 4] + src[ic + stride] + src[ic + stride + 4]) * 0.125
        const val = center + (center - avg) * k
        dst[ic] = val < 0 ? 0 : val > 255 ? 255 : val + 0.5 | 0
      }
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

// ===== HISTOGRAM =====
function updateHistogram() {
  const hc = histogramCanvas.value
  if (!hc || !canvas.value) return
  const w = canvas.value.width, h = canvas.value.height
  if (w === 0 || h === 0) return
  const sampleW = Math.min(w, 256), sampleH = Math.min(h, Math.round(h * 256 / w))
  if (!_histCanvas) { _histCanvas = document.createElement('canvas'); _histCtx = _histCanvas.getContext('2d') }
  _histCanvas.width = sampleW; _histCanvas.height = sampleH
  _histCtx.drawImage(canvas.value, 0, 0, sampleW, sampleH)
  const imgData = _histCtx.getImageData(0, 0, sampleW, sampleH).data

  const rHist = new Uint32Array(256), gHist = new Uint32Array(256), bHist = new Uint32Array(256)
  let shadowClip = 0
  let highlightClip = 0
  for (let i = 0; i < imgData.length; i += 4) {
    if (imgData[i + 3] === 0) continue
    rHist[imgData[i]]++; gHist[imgData[i+1]]++; bHist[imgData[i+2]]++
    if (imgData[i] <= 2 && imgData[i+1] <= 2 && imgData[i+2] <= 2) shadowClip++
    if (imgData[i] >= 253 && imgData[i+1] >= 253 && imgData[i+2] >= 253) highlightClip++
  }
  const totalSamples = Math.max(1, imgData.length / 4)
  shadowClipPercent.value = +(shadowClip / totalSamples * 100).toFixed(1)
  highlightClipPercent.value = +(highlightClip / totalSamples * 100).toFixed(1)
  let maxVal = 0
  for (let i = 0; i < 256; i++) { if (rHist[i] > maxVal) maxVal = rHist[i]; if (gHist[i] > maxVal) maxVal = gHist[i]; if (bHist[i] > maxVal) maxVal = bHist[i] }
  if (!maxVal) maxVal = 1

  const ctx = hc.getContext('2d')
  const cw = hc.width, ch = hc.height
  ctx.clearRect(0, 0, cw, ch)
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cw, ch)

  const drawChannel = (hist, color) => {
    ctx.fillStyle = color; ctx.globalAlpha = 0.4
    ctx.beginPath(); ctx.moveTo(0, ch)
    for (let x = 0; x < 256; x++) { ctx.lineTo(x * cw / 255, ch - (hist[x] / maxVal) * ch) }
    ctx.lineTo(cw, ch); ctx.closePath(); ctx.fill()
  }
  drawChannel(rHist, '#ff4444'); drawChannel(gHist, '#44ff44'); drawChannel(bHist, '#4488ff')
  ctx.globalAlpha = 1
}

// ===== BACKGROUND REMOVAL =====
const handleRemoveBg = async () => {
  if (!isPro.value || !originalImage || removingBg.value) return
  removingBg.value = true; bgProgress.value = 'Loading model...'
  try {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = imageWidth; tempCanvas.height = imageHeight
    tempCanvas.getContext('2d').drawImage(originalImage, 0, 0)
    bgProgress.value = 'Removing background...'
    const resultDataUrl = await window.electron.ipcRenderer.invoke('remove-bg-rmbg', tempCanvas.toDataURL('image/png'))
    const newImg = new Image()
    await new Promise((resolve, reject) => { newImg.onload = resolve; newImg.onerror = reject; newImg.src = resultDataUrl })
    originalImage = newImg; imageWidth = newImg.naturalWidth; imageHeight = newImg.naturalHeight
    initEditCanvas(); bgRemoved.value = true; clearCrop(); renderCanvas(); captureState()
  } catch (err) { console.error('BG removal failed:', err); bgProgress.value = 'Failed'; setTimeout(() => { bgProgress.value = '' }, 3000) }
  finally { removingBg.value = false }
}

// ===== IMAGE LOADING =====
const initEditCanvas = () => {
  editCanvas = document.createElement('canvas'); editCanvas.width = imageWidth; editCanvas.height = imageHeight
  editCanvas.getContext('2d').drawImage(originalImage, 0, 0, imageWidth, imageHeight)
}

const loadImage = async () => {
  const img = new Image(); img.crossOrigin = 'anonymous'
  return new Promise((resolve) => {
    img.onload = () => { originalImage = img; imageWidth = img.naturalWidth; imageHeight = img.naturalHeight; initEditCanvas(); renderCanvas(); resolve() }
    img.onerror = () => resolve()
    img.src = props.imagePath.startsWith('pluto://') ? props.imagePath : `pluto://${props.imagePath}`
  })
}

// ===== RESET =====
const resetAdjustments = () => {
  adjustments.exposure = 0; adjustments.brightness = 100; adjustments.contrast = 100
  adjustments.highlights = 0; adjustments.shadows = 0; adjustments.whites = 0; adjustments.blacks = 0
  adjustments.temperature = 0; adjustments.tint = 0; adjustments.vibrance = 0; adjustments.saturation = 100
  adjustments.clarity = 0; adjustments.dehaze = 0; adjustments.sharpen = 0
  adjustments.vignette = 0; adjustments.grain = 0; adjustments.straighten = 0
}

const resetAll = () => {
  suppressHistoryCapture = true
  if (historyCaptureTimer) {
    clearTimeout(historyCaptureTimer)
    historyCaptureTimer = null
  }
  pendingHistorySignature = null
  resetAdjustments()
  adjustments.rotation = 0; adjustments.flipH = false; adjustments.flipV = false
  cropRect.x = 0; cropRect.y = 0; cropRect.w = 0; cropRect.h = 0
  pendingCrop.x = 0; pendingCrop.y = 0; pendingCrop.w = 0; pendingCrop.h = 0
  disableAllTools(); bgRemoved.value = false; activeFilter.value = null
  _portraitMask = null; resetPortraitBlurControls()
  selectRect.x = 0; selectRect.y = 0; selectRect.w = 0; selectRect.h = 0
  textItems.value = []; selectedTextId.value = null; inlineTextEditId.value = null; inlineTextDraft.value = ''
  splitHighlightAmount.value = 0; splitShadowAmount.value = 0
  curvePoints.rgb = [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  curvePoints.red = [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  curvePoints.green = [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  curvePoints.blue = [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  for (const ch of Object.values(hslChannels)) { ch.h = 0; ch.s = 0; ch.l = 0 }
  zoomLevel.value = 1; historyStack.value = []; historyIndex.value = -1
  presetIntensity.value = 100; exportScale.value = 100; exportSharpenScreen.value = 0; exportSuffix.value = '_edited'
  loadImage().then(() => {
    suppressHistoryCapture = false
    captureState('Open image', { force: true })
  })
}

// ===== SAVE =====
const saveEdit = async () => {
  saving.value = true
  try {
    const rawPath = props.imagePath.replace(/^pluto:\/\//i, '')
    // Render full-res with all effects
    const fullCanvas = document.createElement('canvas')
    const metrics = getRenderMetrics({ scaleOverride: 1 })
    fullCanvas.width = metrics.canvasW
    fullCanvas.height = metrics.canvasH
    const fctx = fullCanvas.getContext('2d')
    drawImageLayer(fctx, editCanvas || originalImage, metrics)
    // Apply pixel effects at full res
    applyPixelEffects(fullCanvas)
    if (adjustments.sharpen > 0) applySharpen(fullCanvas, adjustments.sharpen)
    drawTextLayer(fctx, metrics, 1)
    let exportCanvas = fullCanvas
    if (exportScale.value < 100) {
      const scaledCanvas = document.createElement('canvas')
      scaledCanvas.width = Math.max(1, Math.round(fullCanvas.width * exportScale.value / 100))
      scaledCanvas.height = Math.max(1, Math.round(fullCanvas.height * exportScale.value / 100))
      const scaledCtx = scaledCanvas.getContext('2d')
      scaledCtx.imageSmoothingQuality = 'high'
      scaledCtx.drawImage(fullCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height)
      exportCanvas = scaledCanvas
    }
    if (exportSharpenScreen.value > 0) applySharpen(exportCanvas, exportSharpenScreen.value / 25)
    // Send to main process
    const mimeType = exportFormat.value === 'jpeg' ? 'image/jpeg' : exportFormat.value === 'webp' ? 'image/webp' : 'image/png'
    const quality = exportFormat.value === 'png' ? undefined : exportQuality.value / 100
    const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, mimeType, quality))
    const arrayBuf = await blob.arrayBuffer()
    const result = await window.electron.ipcRenderer.invoke('save-raw-edit', {
      originalPath: rawPath,
      imageData: new Uint8Array(arrayBuf),
      edits: {
        outputFormat: exportFormat.value,
        outputQuality: exportQuality.value,
        outputSuffix: exportSuffix.value,
        sharpen: exportSharpenScreen.value > 0,
      },
      format: exportFormat.value
    })
    if (result.success) emit('saved', result.outputPath)
  } catch (err) { console.error('Save failed:', err) }
  finally { saving.value = false }
}

// ===== WATCHERS =====
watch(adjustments, () => { scheduleRender(); queueHistoryCapture('Adjustments') }, { deep: true })
watch([splitHighlight, splitHighlightAmount, splitShadow, splitShadowAmount], () => { scheduleRender(); queueHistoryCapture('Color grading') })
watch(showOriginal, () => renderCanvas())
watch(hslChannels, () => { scheduleRender(); queueHistoryCapture('HSL') }, { deep: true })
watch([portraitBlur, portraitFeather, portraitBackdrop, portraitSubjectProtect], () => { scheduleRender(); queueHistoryCapture('Portrait blur') })
watch(textItems, () => queueHistoryCapture('Text'), { deep: true })
watch(pendingCrop, () => queueHistoryCapture(pendingCrop.w > 0 ? 'Crop' : 'Clear crop'), { deep: true })

onMounted(() => {
  loadImage().then(() => { setTimeout(() => captureState('Open image'), 100) })
  updateCurveLUTs()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  if (renderRAF) cancelAnimationFrame(renderRAF)
  if (_idleTimer) clearTimeout(_idleTimer)
  if (historyCaptureTimer) clearTimeout(historyCaptureTimer)
  captureQueue = Promise.resolve()
})
</script>

<style scoped>
/* ===== FOUNDATION ===== */
.editor-overlay {
  position: fixed; inset: 0; z-index: 50000;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(30px) saturate(1.2);
  display: flex; align-items: center; justify-content: center;
  animation: overlay-in 0.25s ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
.editor-panel {
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  width: 94vw; height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  animation: panel-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}
@keyframes overlay-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes panel-pop { from { opacity: 0; transform: scale(0.97) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }

/* ===== HEADER ===== */
.panel-header {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}
.panel-header h2 {
  font-size: 13px; font-weight: 600; color: #e4e4e8; margin: 0;
  letter-spacing: 0.01em;
}
.file-name {
  font-size: 11px; color: rgba(255, 255, 255, 0.3);
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.header-tools { display: flex; gap: 2px; align-items: center; }
.tool-divider { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.08); margin: 0 6px; }
.zoom-label {
  font-size: 11px; color: rgba(255, 255, 255, 0.35); cursor: pointer;
  min-width: 44px; text-align: center; user-select: none;
  font-variant-numeric: tabular-nums; transition: color 0.15s;
  font-weight: 500;
}
.zoom-label:hover { color: rgba(255, 255, 255, 0.7); }
.header-btn {
  width: 28px; height: 28px; border-radius: 6px; border: none;
  background: transparent; color: rgba(255, 255, 255, 0.5);
  font-size: 14px; cursor: pointer; display: grid; place-items: center;
  transition: all 0.15s ease;
}
.header-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); color: #fff; }
.header-btn:disabled { opacity: 0.2; cursor: default; }
.header-btn.active { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.btn-close {
  background: none; border: none; color: rgba(255, 255, 255, 0.3);
  font-size: 16px; cursor: pointer; padding: 4px 8px;
  border-radius: 6px; transition: all 0.15s;
}
.btn-close:hover { background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.7); }

/* ===== CANVAS ===== */
.editor-body { display: flex; flex: 1; min-height: 0; }
.canvas-area {
  flex: 1; display: flex; align-items: center; justify-content: center;
  background: #0c0c0e; position: relative;
  background-image: radial-gradient(ellipse at center, rgba(30, 30, 36, 0.4) 0%, transparent 70%);
}
.canvas-wrapper { position: relative; display: flex; width: 100%; height: 100%; overflow: auto; }
.canvas-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
.canvas-wrapper::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
.canvas-wrapper::-webkit-scrollbar-corner { background: transparent; }
.canvas-wrapper.can-pan { cursor: grab; }
.canvas-wrapper.is-panning { cursor: grabbing; user-select: none; }
.canvas-container { position: relative; display: inline-block; line-height: 0; margin: auto; flex-shrink: 0; }
.edit-canvas { display: block; border-radius: 2px; }
.edit-canvas.bg-removed {
  background-image: conic-gradient(#e0e0e0 90deg, #fff 90deg 180deg, #e0e0e0 180deg 270deg, #fff 270deg);
  background-size: 16px 16px;
}
.edit-canvas.eraser-active, .edit-canvas.draw-active { cursor: none; }
.edit-canvas.select-active { cursor: crosshair; }
.eraser-cursor-ring {
  position: absolute; border: 1.5px solid rgba(255, 255, 255, 0.85);
  border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(0, 0, 0, 0.15); z-index: 5;
}
.crop-overlay { position: absolute; inset: 0; cursor: crosshair; }
.crop-box { position: absolute; border: 1.5px solid #60a5fa; background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5); overflow: visible; }
.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, transparent 33.333%, rgba(255,255,255,0.35) 33.333%, rgba(255,255,255,0.35) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent 66.666%, rgba(255,255,255,0.35) 66.666%, rgba(255,255,255,0.35) calc(66.666% + 1px), transparent calc(66.666% + 1px)),
    linear-gradient(to bottom, transparent 33.333%, rgba(255,255,255,0.35) 33.333%, rgba(255,255,255,0.35) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent 66.666%, rgba(255,255,255,0.35) 66.666%, rgba(255,255,255,0.35) calc(66.666% + 1px), transparent calc(66.666% + 1px));
}
.crop-dim-label {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.crop-move-area {
  position: absolute;
  inset: 8px;
  cursor: move;
  z-index: 1;
}
.crop-handle {
  position: absolute;
  z-index: 2;
}
.crop-handle.corner {
  width: 14px;
  height: 14px;
  background: #fff;
  border: 2px solid #60a5fa;
  border-radius: 2px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.crop-handle.corner.nw { top: -7px; left: -7px; cursor: nw-resize; }
.crop-handle.corner.ne { top: -7px; right: -7px; cursor: ne-resize; }
.crop-handle.corner.sw { bottom: -7px; left: -7px; cursor: sw-resize; }
.crop-handle.corner.se { bottom: -7px; right: -7px; cursor: se-resize; }
.crop-handle.edge {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.crop-handle.edge.n { top: -3px; left: calc(50% - 16px); width: 32px; height: 5px; cursor: n-resize; }
.crop-handle.edge.s { bottom: -3px; left: calc(50% - 16px); width: 32px; height: 5px; cursor: s-resize; }
.crop-handle.edge.w { left: -3px; top: calc(50% - 16px); width: 5px; height: 32px; cursor: w-resize; }
.crop-handle.edge.e { right: -3px; top: calc(50% - 16px); width: 5px; height: 32px; cursor: e-resize; }
.snap-guide {
  position: absolute;
  pointer-events: none;
  z-index: 7;
  background: rgba(96, 165, 250, 0.95);
  box-shadow: 0 0 0 1px rgba(12, 12, 14, 0.35);
}
.snap-guide.vertical { top: 0; bottom: 0; width: 1px; }
.snap-guide.horizontal { left: 0; right: 0; height: 1px; }
.select-overlay { position: absolute; inset: 0; cursor: crosshair; z-index: 4; }
.select-box { position: absolute; border: 1.5px dashed #fb923c; background: rgba(251, 146, 60, 0.06); }
.bg-loading-overlay {
  position: absolute; inset: 0;
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
  display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; gap: 14px;
}
.bg-loading-overlay p { color: rgba(255, 255, 255, 0.6); font-size: 12px; margin: 0; font-weight: 500; }
.bg-spinner {
  width: 28px; height: 28px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #60a5fa;
  border-radius: 50%; animation: bg-spin 0.7s linear infinite;
}
@keyframes bg-spin { to { transform: rotate(360deg) } }

/* Text overlay items */
.text-overlay-item {
  position: absolute; cursor: move; user-select: none;
  pointer-events: auto; z-index: 3; white-space: pre-wrap;
}
.text-overlay-label {
  display: inline-block;
  white-space: pre-wrap;
  line-height: 1.08;
}
.text-overlay-item.selected { z-index: 6; }
.text-selection-frame {
  position: absolute;
  inset: -8px;
  border: 1px dashed rgba(96, 165, 250, 0.9);
  border-radius: 8px;
  pointer-events: none;
}
.text-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: #60a5fa;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  cursor: pointer;
}
.text-handle.rotate {
  top: -18px;
  left: calc(50% - 6px);
  background: #f59e0b;
  cursor: grab;
}
.text-handle.resize {
  right: -8px;
  bottom: -8px;
  cursor: nwse-resize;
}
.text-inline-editor {
  min-width: 140px;
  background: rgba(12, 12, 14, 0.92);
  border: 1px solid rgba(96, 165, 250, 0.55);
  border-radius: 8px;
  color: #f3f4f6;
  padding: 8px 10px;
  outline: none;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
}

/* ===== SIDEBAR ===== */
.controls-sidebar {
  width: 300px;
  background: rgba(255, 255, 255, 0.015);
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  overflow-y: auto; overflow-x: hidden;
  padding: 0; display: flex; flex-direction: column;
}
.controls-sidebar::-webkit-scrollbar { width: 3px; }
.controls-sidebar::-webkit-scrollbar-track { background: transparent; }
.controls-sidebar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 3px; }
.controls-sidebar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }

/* Histogram */
.histogram-wrap {
  padding: 10px 14px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.histogram-canvas {
  width: 100%; height: 52px; border-radius: 6px; display: block;
  opacity: 0.85;
}
.histogram-badges {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.histogram-badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.04);
}
.histogram-badge.active.shadow { color: #93c5fd; background: rgba(59, 130, 246, 0.16); }
.histogram-badge.active.highlight { color: #fde68a; background: rgba(245, 158, 11, 0.16); }

/* Sections */
.control-section {
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.035);
}
.control-section:last-child { border-bottom: none; }
.control-section h3 {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.35);
  margin: 0; padding: 11px 0 8px; cursor: pointer;
  display: flex; align-items: center; gap: 6px; user-select: none;
  transition: color 0.15s;
}
.control-section h3:hover { color: rgba(255, 255, 255, 0.55); }
.chevron { display: inline-block; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-size: 11px; color: rgba(255, 255, 255, 0.25); }
.chevron.open { transform: rotate(90deg); }
.section-body {
  max-height: 0; overflow: hidden; opacity: 0;
  padding-bottom: 0;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease,
              padding-bottom 0.3s ease;
  will-change: max-height, opacity;
}
.section-body.open {
  max-height: 1200px; opacity: 1;
  padding-bottom: 10px;
}

/* Tools */
.quick-actions { display: flex; gap: 5px; flex-wrap: wrap; }
.quick-actions.tool-row-main { margin-top: 6px; }
.tool-btn {
  width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6); font-size: 15px;
  cursor: pointer; display: grid; place-items: center;
  transition: all 0.15s ease;
}
.tool-btn.labeled {
  width: auto; height: auto;
  padding: 6px 8px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  min-width: 44px;
}
.tool-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.7;
  white-space: nowrap;
}
.tool-btn:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.85); border-color: rgba(255, 255, 255, 0.1); }
.tool-btn.active {
  background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3);
  color: #60a5fa; box-shadow: 0 0 12px rgba(59, 130, 246, 0.08);
}
.sub-controls { margin-top: 8px; }
.sub-label {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: rgba(255, 255, 255, 0.4); margin-bottom: 5px;
}

/* Crop ratios */
.ratio-btns { display: flex; flex-wrap: wrap; gap: 4px; }
.ratio-btn {
  padding: 3px 8px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.45);
  font-size: 10px; cursor: pointer; transition: all 0.15s;
  font-weight: 500;
}
.ratio-btn:hover { background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7); }
.ratio-btn.active { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); color: #60a5fa; }
.tool-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.38);
  line-height: 1.45;
  margin: 6px 0 0;
}
.sub-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.inline-action {
  width: auto;
  padding: 6px 12px;
  min-width: 0;
}
.ghost-action {
  width: auto;
  padding: 6px 12px;
  min-width: 0;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.62);
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.58);
  cursor: pointer;
  text-align: left;
}
.history-item.active {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.12);
  color: #dbeafe;
}
.history-index {
  min-width: 18px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 10px;
  font-weight: 700;
}
.history-label {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== CUSTOM RANGE SLIDERS ===== */
.slider-group { margin-bottom: 6px; }
.slider-group label {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: rgba(255, 255, 255, 0.5); margin-bottom: 4px;
  font-weight: 450;
}
.slider-group .val, .sub-controls .val { color: #60a5fa; font-size: 11px; font-weight: 500; }
.val-input {
  width: 48px; background: transparent; border: 1px solid transparent;
  border-radius: 4px; color: rgba(255, 255, 255, 0.55); font-size: 11px;
  text-align: right; padding: 2px 4px; font-variant-numeric: tabular-nums;
  outline: none; -moz-appearance: textfield; transition: all 0.15s;
  font-weight: 500;
}
.val-input::-webkit-inner-spin-button, .val-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.val-input:hover { border-color: rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.03); }
.val-input:focus { border-color: rgba(59, 130, 246, 0.5); background: rgba(59, 130, 246, 0.06); color: #e4e4e8; }

.modern-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 3px; border-radius: 2px;
  background: rgba(255, 255, 255, 0.08); outline: none;
  transition: background 0.15s;
  cursor: pointer;
}
.modern-slider:hover { background: rgba(255, 255, 255, 0.12); }
.modern-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; border-radius: 50%;
  background: #e4e4e8;
  border: 2px solid #141416;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
  cursor: pointer; transition: all 0.12s ease;
}
.modern-slider::-webkit-slider-thumb:hover {
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(59, 130, 246, 0.3);
  transform: scale(1.1);
}
.modern-slider::-webkit-slider-thumb:active {
  background: #60a5fa;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}
.modern-slider::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: #e4e4e8; border: 2px solid #141416;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4); cursor: pointer;
}
.modern-slider::-moz-range-track {
  height: 3px; border-radius: 2px;
  background: rgba(255, 255, 255, 0.08); border: none;
}

/* Text tool inputs */
.text-input {
  width: 100%; background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; padding: 7px 10px;
  color: #e4e4e8; font-size: 12px; margin-bottom: 6px; box-sizing: border-box;
  transition: border-color 0.15s;
}
.text-area-input {
  min-height: 78px;
  resize: vertical;
  line-height: 1.4;
  white-space: pre-wrap;
}
.export-text-input {
  margin: 0;
}
.export-row-stack {
  display: grid;
  gap: 6px;
}
.text-input:focus { border-color: rgba(59, 130, 246, 0.4); outline: none; }
.text-settings-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.text-effects-row { align-items: stretch; }
.text-size-input {
  width: 50px; background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; padding: 5px 6px; color: #e4e4e8; font-size: 11px;
}
.text-font-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px; padding: 5px; color: #e4e4e8; font-size: 11px;
  flex: 1; min-width: 0;
}
.color-input {
  width: 26px; height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px; padding: 0; cursor: pointer; background: none;
}
.mini-btn {
  width: 26px; height: 26px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5); font-size: 11px;
  cursor: pointer; display: grid; place-items: center;
  transition: all 0.15s;
}
.mini-btn.wide { width: 34px; font-weight: 700; }
.mini-btn.active { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); color: #60a5fa; }
.mini-field {
  min-width: 88px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.46);
  font-size: 10px;
  font-weight: 600;
}
.mini-field.grow { min-width: 116px; }

/* Tone Curve */
.curve-channel-tabs { display: flex; gap: 3px; margin-bottom: 8px; }
.curve-tab {
  padding: 4px 10px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.35);
  font-size: 10px; cursor: pointer; font-weight: 600;
  transition: all 0.15s;
}
.curve-tab:hover { background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.5); }
.curve-tab.active { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.12); }
.curve-tab.active.rgb { color: #e4e4e8; }
.curve-tab.active.red { color: #f87171; }
.curve-tab.active.green { color: #4ade80; }
.curve-tab.active.blue { color: #60a5fa; }
.curve-canvas {
  width: 100%; aspect-ratio: 1;
  border-radius: 8px; cursor: crosshair; display: block;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* HSL */
.hsl-tabs { display: flex; gap: 3px; margin-bottom: 8px; }
.hsl-tab {
  flex: 1; padding: 5px; border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px; font-weight: 600; cursor: pointer; text-align: center;
  transition: all 0.15s;
}
.hsl-tab.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
}
.hsl-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.hsl-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 3px rgba(0, 0, 0, 0.3); }
.hsl-name {
  font-size: 10px; color: rgba(255, 255, 255, 0.4); width: 50px;
  flex-shrink: 0; text-transform: capitalize; font-weight: 500;
}
.hsl-slider { flex: 1; }
.hsl-val {
  font-size: 10px; color: rgba(255, 255, 255, 0.45);
  width: 28px; text-align: right;
  font-variant-numeric: tabular-nums; font-weight: 500;
}

/* Effects */
.split-tone-row { display: flex; gap: 10px; }
.split-tone-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.split-tone-group span { font-size: 10px; color: rgba(255, 255, 255, 0.35); font-weight: 500; }
.modern-slider.mini { height: 2px; }
.modern-slider.mini::-webkit-slider-thumb { width: 10px; height: 10px; }

/* Portrait Blur */
.portrait-blur-section {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.portrait-blur-header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.portrait-preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 8px 0 4px;
}
.portrait-preset-chip {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.56);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.portrait-preset-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.portrait-preset-chip.active {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(59, 130, 246, 0.34);
  color: #93c5fd;
}

/* Presets */
.filter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.filter-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px; border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px; cursor: pointer;
  transition: all 0.18s ease; font-weight: 450;
}
.filter-chip:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  transform: translateY(-1px);
}
.filter-chip.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.06);
}
.filter-icon { font-size: 12px; flex-shrink: 0; }
.filter-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Actions */
.crop-info { font-size: 11px; color: rgba(255, 255, 255, 0.4); margin: 0 0 6px; font-weight: 500; }
.action-btn {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px; padding: 8px;
  color: rgba(255, 255, 255, 0.7); font-size: 11.5px;
  cursor: pointer; text-align: center;
  transition: all 0.15s ease; font-weight: 500;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.08); color: #e4e4e8; }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.action-btn.primary {
  background: #2563eb; border-color: #2563eb;
  color: #fff; font-weight: 600;
  box-shadow: 0 2px 12px rgba(37, 99, 235, 0.2);
}
.action-btn.primary:hover {
  background: #3b82f6;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
}
.action-btn.small { padding: 5px; font-size: 10.5px; margin-top: 6px; }
.save-section {
  padding: 12px 16px; margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.01);
}
.pro-tag {
  font-size: 8px;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: #fff; padding: 2px 5px; border-radius: 3px;
  font-weight: 700; letter-spacing: 0.06em;
  vertical-align: middle; margin-left: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.pro-hint { font-size: 11px; color: rgba(255, 255, 255, 0.25); margin: 6px 0 0; }

/* Zoom Presets */
.zoom-preset {
  font-size: 10px; font-weight: 600; color: rgba(255, 255, 255, 0.3);
  background: none; border: 1px solid transparent; cursor: pointer; padding: 2px 7px;
  border-radius: 4px; transition: all 0.15s; letter-spacing: 0.02em;
  font-family: inherit;
}
.zoom-preset:hover { color: rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.08); }

/* Before/After Compare Handle */
.compare-handle-wrap {
  position: absolute; top: 0; bottom: 0; width: 0;
  z-index: 6; cursor: col-resize;
  transform: translateX(-50%);
}
.compare-handle-line {
  position: absolute; top: 0; bottom: 0; left: 50%;
  width: 2px; background: rgba(255, 255, 255, 0.9);
  transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.compare-handle-grip {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  color: #141416;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  cursor: col-resize;
}

/* Section Reset */
.section-reset {
  margin-left: auto; font-size: 12px; color: rgba(255, 255, 255, 0.2);
  cursor: pointer; transition: color 0.15s; padding: 0 2px;
}
.section-reset:hover { color: #60a5fa; }

/* Export Options */
.export-options { margin-bottom: 10px; }
.export-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.export-label {
  font-size: 10.5px; color: rgba(255, 255, 255, 0.4); font-weight: 500;
  width: 48px; flex-shrink: 0;
}
.export-select {
  flex: 1; background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px; padding: 4px 8px;
  color: #e4e4e8; font-size: 11px; outline: none;
  cursor: pointer;
}
.export-select:focus { border-color: rgba(59, 130, 246, 0.4); }
.export-slider { flex: 1; }
.export-quality-val {
  font-size: 10px; color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums; width: 30px; text-align: right;
  font-weight: 500;
}

/* SVG icon sizing */
.header-btn svg, .tool-btn svg { display: block; }
</style>
