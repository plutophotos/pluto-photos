import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  base: '/video-editor-assets/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  build: {
    outDir: 'build/video-editor-web',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('src/renderer/video-editor.html'),
    },
  },
})