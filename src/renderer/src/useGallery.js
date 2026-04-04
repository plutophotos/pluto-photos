import { ref, onMounted, onUnmounted } from 'vue'
import { ipcOn } from './ipcListen'

export function useGallery() {
  const mediaFiles = ref([])
  const totalCount = ref(0)
  const isLoading = ref(false)
  const searchQuery = ref('')
  const currentSort = ref('date_taken-DESC')
  let _loadSeq = 0 // monotonic request counter for race-condition prevention

  // O(1) lookup map: originalPath -> reactive item reference
  let mediaMap = new Map()

  // Batch handler: receive multiple thumbnail completions at once (reduces IPC storms)
  const onThumbnailReadyBatch = (batch) => {
    if (!Array.isArray(batch)) return
    for (const data of batch) {
      if (!data || !data.original) continue
      const item = mediaMap.get(data.original)
      if (item) {
        // Don't downgrade: if we already have a cached file thumbnail, don't
        // replace it with a lower-quality EXIF data-URL preview.
        if (item.src && item.src.startsWith('pluto://') && data.thumbnail.startsWith('data:')) continue
        item.src = data.thumbnail
      }
    }
  }

  onMounted(() => {
    const cleanup = ipcOn('thumbnails-ready-batch', onThumbnailReadyBatch)
    onUnmounted(() => {
      if (cleanup) cleanup()
    })
  })

  const loadImages = async ({ albumId, folderId, filePath, filter } = {}) => {
    const seq = ++_loadSeq
    isLoading.value = true
    try {
      const entries = await window.electron.ipcRenderer.invoke('get-all-image-paths', {
        albumId,
        folderId,
        filePath,
        filter,
        search: searchQuery.value,
        sort: currentSort.value
      })

      // Discard stale responses — a newer loadImages was called while we awaited
      if (seq !== _loadSeq) return

      const items = entries.map(e => ({
        src: e.thumb ? (e.thumb.startsWith('pluto://') ? e.thumb : `pluto://${e.thumb}`) : '',
        original: e.original.startsWith('pluto://') ? e.original : `pluto://${e.original}`,
        rawPath: e.rawPath,
        ext: e.original.split('.').pop().toLowerCase(),
        inAlbum: !!e.inAlbum,
        locked: !!e.locked
      }))
      mediaFiles.value = items
      totalCount.value = entries.length

      // Rebuild lookup map
      mediaMap = new Map()
      for (const item of mediaFiles.value) {
        mediaMap.set(item.original, item)
      }
    } finally {
      isLoading.value = false
    }
  }

  return {
    mediaFiles,
    totalCount,
    isLoading,
    searchQuery,
    currentSort,
    loadImages
  }
}