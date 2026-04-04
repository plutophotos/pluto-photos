/**
 * Downloads the @imgly/background-removal model files for offline bundling.
 * Only downloads the medium model (isnet_fp16) + required WASM/JS files.
 * Run: node scripts/download-bg-model.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/'
const OUT_DIR = path.join(__dirname, '..', 'resources', 'bg-removal')

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 1. Fetch the resources manifest
  console.log('Fetching resources.json...')
  const res = await fetch(BASE_URL + 'resources.json')
  const resources = await res.json()

  // Only keep the resources we need:
  // - WASM runtime (non-jsep = CPU, which is the default)
  // - The medium model (isnet_fp16)
  // - The JS glue files
  const needed = [
    '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
    '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
    '/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
    '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs',
    '/models/isnet_fp16',
  ]

  // Build a trimmed resources.json with only our needed entries
  const trimmed = {}
  for (const key of needed) {
    if (resources[key]) {
      trimmed[key] = resources[key]
    }
  }

  // Write trimmed resources.json
  fs.writeFileSync(path.join(OUT_DIR, 'resources.json'), JSON.stringify(trimmed, null, 2))
  console.log('Wrote resources.json with', Object.keys(trimmed).length, 'entries')

  // 2. Download all chunks
  const allChunks = []
  for (const [key, entry] of Object.entries(trimmed)) {
    for (const chunk of entry.chunks) {
      if (!allChunks.includes(chunk.name)) {
        allChunks.push(chunk.name)
      }
    }
  }

  console.log(`Downloading ${allChunks.length} chunks...`)
  let done = 0
  // Download 4 at a time
  for (let i = 0; i < allChunks.length; i += 4) {
    const batch = allChunks.slice(i, i + 4)
    await Promise.all(batch.map(async (name) => {
      const url = BASE_URL + name
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      fs.writeFileSync(path.join(OUT_DIR, name), buf)
      done++
      console.log(`  [${done}/${allChunks.length}] ${name} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
    }))
  }

  const totalSize = allChunks.reduce((sum, name) => {
    return sum + fs.statSync(path.join(OUT_DIR, name)).size
  }, 0)
  console.log(`\nDone! Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
}

main().catch(err => { console.error(err); process.exit(1) })
