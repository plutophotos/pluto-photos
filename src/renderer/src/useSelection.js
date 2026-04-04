import { ref } from 'vue'

export function useSelection(mediaFiles) {
  const selectedPaths = ref(new Set())
  const lastSelectedIndex = ref(null)

  const handleClick = (path, index, event) => {
    if (event.shiftKey && lastSelectedIndex.value !== null) {
      const start = Math.min(lastSelectedIndex.value, index)
      const end = Math.max(lastSelectedIndex.value, index)
      for (let i = start; i <= end; i++) {
        selectedPaths.value.add(mediaFiles.value[i].original)
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (selectedPaths.value.has(path)) {
        selectedPaths.value.delete(path)
      } else {
        selectedPaths.value.add(path)
      }
      lastSelectedIndex.value = index
    } else {
      selectedPaths.value.clear()
      selectedPaths.value.add(path)
      lastSelectedIndex.value = index
    }
  }

  const deselectAll = () => {
    selectedPaths.value.clear()
    lastSelectedIndex.value = null
  }

  return {
    selectedPaths,
    lastSelectedIndex,
    handleClick,
    deselectAll
  }
}