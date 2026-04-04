import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 1. Define whitelists for security
const ALLOWED_CHANNELS = [
  'get-server-info',
  'set-web-credentials',
  'clear-web-credentials',
  'verify-web-password',
  'process-thumbnails-for-paths',
  'get-projects',
  'create-project',
  'remove-from-album',
  'reorder-albums',
  'delete-project',
  'sync-folder',
  'toggle-project-collapse',
  'create-album',
  'update-album-cover',
  'delete-album',
  'add-to-album',
  'get-all-image-paths',
  'get-all-folders',
  'get-mac-folder-access-diagnostics',
  'delete-folder',
  'delete-file',
  'import-folder',
  'get-file-metadata',
  'delete-selected',
  'clear-catalog',
  'open-external-file',
  'show-in-folder',
  'set-album-cover',
  'copy-to-album',
  'import-files',
  'get-individual-files',
  'get-settings',
  'get-setting',
  'set-setting',
  'set-settings',
  'get-cache-info',
  'clear-thumbnail-cache',
  'get-app-version',
  'check-for-updates',
  'download-update',
  'install-update',
  'remove-bg-rmbg',
  // Feature 15: Contextual Search
  'get-caption-model-path',
  'caption-model-available',
  'get-images-for-caption-scan',
  'caption-image',
  'get-image-captions',
  'context-search',
  'get-caption-scan-stats',
  'reset-caption-data',
  'start-caption-scan',
  // Feature 5: Tags & Ratings
  'set-image-rating',
  'set-image-color-label',
  'get-image-tags',
  'add-image-tag',
  'remove-image-tag',
  'get-image-details',
  'get-all-tags',
  // Feature 6: Smart Albums
  'get-smart-albums',
  'create-smart-album',
  'update-smart-album',
  'delete-smart-album',
  'query-smart-album',
  // Feature 7: Face Detection
  'get-people',
  'get-distinct-locations',
  'rename-person',
  'merge-people',
  'get-person-images',
  'get-person-faces',
  'get-face-review-summary',
  'get-face-review-queue',
  'reassign-face',
  'delete-face',
  'set-person-avatar',
  'create-person',
  'save-detected-faces',
  'get-all-image-paths-for-scan',
  'get-face-model-path',
  'auto-merge-people',
  'reset-face-data',
  // Feature 8: Map View
  'get-images-with-gps',
  'extract-gps-for-image',
  'extract-gps-bulk',
  // Feature 9: Timeline
  'get-timeline-groups',
  // Feature 10: Batch Operations
  'batch-set-rating',
  'batch-set-color-label',
  'batch-add-tag',
  'batch-move-to-album',
  'batch-export',
  // Feature 11: Editing
  'apply-image-edit',
  'save-raw-edit',
  'auto-enhance',
  'get-image-dimensions',
  'get-edited-files',
  'delete-edited-file',
  'trim-video',
  'compose-video',
  'get-video-clip-thumbnail',
  'select-video-files',
  'select-audio-files',
  'select-watermark-image',
  'select-lut-file',
  'get-builtin-luts',
  // Feature 12: Duplicates
  'find-duplicates',
  'delete-duplicate',
  'dismiss-duplicate-group',
  // Feature 13: Cloud Import
  'import-google-takeout',
  'import-from-immich',
  'import-icloud',
  // Feature 14: Slideshow
  'get-slideshow-settings',
  'set-slideshow-settings',
  // Feature: Quick Filters
  'get-filter-counts',
  // Window controls
  'window-minimize',
  'window-maximize',
  'window-close',
  'window-is-maximized',
  // License management
  'get-license-info',
  'activate-license',
  'deactivate-license',
  'validate-license',
  'check-feature',
  'check-limit',
  'get-usage-stats',
  'start-free-trial',
  'cancel-auto-scan',
  'pause-auto-scan',
  'resume-auto-scan',
  'get-auto-scan-status',
  'skip-update-version'
];

const ALLOWED_LISTENERS = ['thumbnails-ready-batch', 'import-progress', 'import-complete', 'update-available', 'update-download-progress', 'update-downloaded', 'window-maximized-changed', 'auto-scan-progress', 'context-caption-updated', 'video-export-progress'];

// ---- IPC -> postMessage relay ----
// contextBridge proxies cannot reliably pass data through callbacks
// (structured clone failures). We relay IPC events via window.postMessage
// which natively handles cross-context data transfer.
ALLOWED_LISTENERS.forEach(channel => {
  ipcRenderer.on(channel, (_event, ...args) => {
    try {
      const payload = args.length === 1 ? args[0] : args;
      const origin = window.location.origin !== 'null' ? window.location.origin : '*';
      window.postMessage({ __electronIpc: channel, payload: JSON.parse(JSON.stringify(payload)) }, origin);
    } catch (e) {
      console.error('IPC relay error:', channel, e);
    }
  });
});

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI, 
      platform: process.platform,
      ipcRenderer: {
        // --- INVOKE (Renderer to Main) ---
        invoke: (channel, ...args) => {
          if (ALLOWED_CHANNELS.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
          }
          console.error(`Blocked unauthorized IPC invoke on channel: ${channel}`);
          return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
        },
        
        // --- ON (Main to Renderer) ---
        // Uses window message events relayed above — no bridge callback cloning needed.
        on: (channel, callback) => {
          if (ALLOWED_LISTENERS.includes(channel)) {
            const handler = (event) => {
              // Only accept messages from our own window — reject cross-frame spoofing
              if (event.source !== window) return;
              if (event.data && event.data.__electronIpc === channel) {
                try { callback(event.data.payload); } catch (e) {
                  console.error('IPC callback error:', channel, e);
                }
              }
            };
            window.addEventListener('message', handler);
            return () => window.removeEventListener('message', handler);
          }
          console.warn(`Blocked unauthorized IPC listener on channel: ${channel}`);
          return () => {}; 
        },
        
        // --- CLEANUP ---
        removeAllListeners: (channel) => {
          // Note: this only clears internal IPC listeners, not postMessage handlers.
          // Callers should use the cleanup function returned by on() instead.
          if (ALLOWED_LISTENERS.includes(channel)) {
            // postMessage relay listeners are permanent, but we can signal no more forwarding
          }
        }
      }
    });
  } catch (error) {
    console.error('Preload script error:', error);
  }
} else {
  // Context isolation is required — refuse to start without it
  console.error('FATAL: Context isolation is disabled. Pluto Photos requires contextIsolation for security.');
}