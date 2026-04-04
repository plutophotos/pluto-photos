import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

export function useGrid(mediaFiles, scrollContainerRef) {
  const GAP = 12
  const cardSize = ref(200)
  const columnCount = ref(5)
  const scrollTop = ref(0)

  const itemFullHeight = computed(() => cardSize.value + GAP)

  const updateLayout = () => {
    if (!scrollContainerRef.value) return
    const el = scrollContainerRef.value
    // Skip layout when the window is minimized / hidden (dimensions are 0)
    if (el.clientWidth < 10 || el.clientHeight < 10) return
    const width = el.clientWidth - 16
    const count = Math.floor(width / (cardSize.value + GAP))
    columnCount.value = Math.max(1, count)
    // Re-sync scrollTop from the actual DOM (might be stale after minimize/restore)
    scrollTop.value = el.scrollTop
    // Force recalculate render window on layout change
    _forceRecalc()
  }

  const handleScaleUpdate = (newVal) => {
    cardSize.value = Number(newVal)
  }

  watch(cardSize, () => {
    requestAnimationFrame(updateLayout)
  })

  // ---- Buffered virtual scroll ----
  // Instead of recomputing visible items on EVERY scroll frame (60fps),
  // we maintain a "render window" that covers the viewport plus a generous
  // buffer zone on each side.  The render window only shifts when the
  // viewport scrolls near its edge, cutting Vue re-renders from 60/sec
  // to roughly 2-5/sec during smooth scrolling.

  const BUFFER_ROWS = 3 // rows of buffer above and below viewport

  const viewportRows = computed(() => {
    const vh = scrollContainerRef.value?.clientHeight || 800
    return Math.ceil(vh / itemFullHeight.value)
  })

  // Which row is at the top of the viewport (updates every rAF)
  const currentTopRow = computed(() => Math.floor(scrollTop.value / itemFullHeight.value))

  // renderStartRow only updates when the viewport approaches the edges of the
  // pre-rendered region.  Everything downstream (startIndex, gridOffsetTop,
  // visibleImages) depends on this, so they ALSO update infrequently.
  const renderStartRow = ref(0)
  const renderRowCount = computed(() => viewportRows.value + 2 * BUFFER_ROWS)

  let _pendingRecalc = null
  function _forceRecalc() {
    if (_pendingRecalc) { clearTimeout(_pendingRecalc); _pendingRecalc = null }
    renderStartRow.value = Math.max(0, currentTopRow.value - BUFFER_ROWS)
  }

  watch(currentTopRow, (topRow) => {
    const bufferAbove = topRow - renderStartRow.value
    const renderEnd  = renderStartRow.value + renderRowCount.value
    const bufferBelow = renderEnd - (topRow + viewportRows.value)

    // Viewport jumped completely outside the render window (scrollbar drag)
    // — update immediately, no throttle
    if (bufferAbove < 0 || bufferBelow < 0) {
      if (_pendingRecalc) { clearTimeout(_pendingRecalc); _pendingRecalc = null }
      renderStartRow.value = Math.max(0, topRow - BUFFER_ROWS)
      return
    }

    // Still comfortably within buffer — nothing to do
    if (bufferAbove >= 2 && bufferBelow >= 2) return

    // Near an edge — schedule a re-center (throttled to ~30fps max)
    if (_pendingRecalc) return
    _pendingRecalc = setTimeout(() => {
      _pendingRecalc = null
      renderStartRow.value = Math.max(0, currentTopRow.value - BUFFER_ROWS)
    }, 32)
  }, { flush: 'sync' })  // sync flush: fires immediately when scrollTop changes, no frame delay

  const startIndex = computed(() => renderStartRow.value * columnCount.value)

  const gridOffsetTop = computed(() => renderStartRow.value * itemFullHeight.value)

  const gridStyle = computed(() => ({
    display: 'grid',
    transform: `translateY(${gridOffsetTop.value}px)`,
    gridTemplateColumns: `repeat(${columnCount.value}, ${cardSize.value}px)`,
    gridAutoRows: `${cardSize.value}px`,
    gap: `${GAP}px`,
    willChange: 'transform',
    contain: 'layout style'
  }))

  const visibleImages = computed(() => {
    if (!mediaFiles.value.length) return []
    const itemsToShow = renderRowCount.value * columnCount.value
    return mediaFiles.value.slice(startIndex.value, startIndex.value + itemsToShow)
  })

  const totalGridHeight = computed(() => {
    const rowCount = Math.ceil(mediaFiles.value.length / columnCount.value)
    return (rowCount * itemFullHeight.value) + 100
  })

  let _scrollRaf = null
  const handleScroll = (e) => {
    // No rAF throttle — setting a ref is cheap, and the sync watch above
    // ensures renderStartRow updates in the SAME tick as the scroll event,
    // eliminating 1-2 frames of pipeline delay during fast scrollbar drags.
    scrollTop.value = e.target.scrollTop
  }

  let resizeObserver = null
  const _onVisibilityChange = () => {
    if (!document.hidden) {
      // Window restored from minimize — re-sync layout and scroll position
      requestAnimationFrame(updateLayout)
    }
  }
  onMounted(() => {
    updateLayout()
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateLayout)
    })
    if (scrollContainerRef.value) resizeObserver.observe(scrollContainerRef.value)
    document.addEventListener('visibilitychange', _onVisibilityChange)
  })

  onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect()
    document.removeEventListener('visibilitychange', _onVisibilityChange)
  })

  return {
    cardSize, scrollTop, gridStyle, totalGridHeight, startIndex,
    visibleImages, handleScroll, updateLayout, handleScaleUpdate
  }
}