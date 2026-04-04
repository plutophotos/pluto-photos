import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      // In dev mode, use local license server; in production, use live server
      'process.env.PLUTO_LICENSE_SERVER': JSON.stringify(
        process.env.PLUTO_LICENSE_SERVER || (process.env.NODE_ENV === 'development' ? 'http://localhost:3100' : 'https://license.plutophotos.com')
      )
    },
    build: {
      rollupOptions: {
        // These modules must NOT be bundled. They stay as 'require()'
        // so Electron can find them in the unpacked node_modules folder.
        external: ['better-sqlite3', 'sharp', 'fluent-ffmpeg', 'ffmpeg-static', '@napi-rs/canvas', 'onnxruntime-node']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})