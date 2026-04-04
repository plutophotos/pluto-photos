/**
 * Listen for IPC events relayed via window.postMessage from the preload.
 *
 * Because Electron's contextBridge cannot reliably pass data through
 * callback proxies (structured clone errors), the preload relays IPC
 * events using window.postMessage which handles cross-context data
 * transfer natively.
 *
 * @param {string} channel - The IPC channel name (e.g. 'import-progress')
 * @param {function} callback - Handler receiving the payload data
 * @returns {function} Cleanup function to remove the listener
 */
export function ipcOn(channel, callback) {
  const handler = (event) => {
    if (event.data && event.data.__electronIpc === channel) {
      callback(event.data.payload)
    }
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
