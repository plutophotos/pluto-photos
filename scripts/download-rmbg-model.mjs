/**
 * Downloads the RMBG-1.4 (BRIA AI) model files for offline bundling.
 * Uses the ONNX model from HuggingFace (quantized for web).
 * Run: node scripts/download-rmbg-model.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'resources', 'bg-removal-rmbg')

// HuggingFace model repo for ONNX version of RMBG-1.4
const HF_BASE = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/'

// Files needed for transformers.js to load the model
const FILES = [
  // Model config
  'config.json',
  'preprocessor_config.json',
  // ONNX model (quantized versions available in onnx/ folder)
  'onnx/model.onnx',
]

async function downloadFile(url, destPath) {
  const dir = path.dirname(destPath)
  fs.mkdirSync(dir, { recursive: true })

  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  fs.writeFileSync(destPath, buf)
  return buf.length
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('Downloading RMBG-1.4 model files...')
  console.log(`Output: ${OUT_DIR}\n`)

  let totalSize = 0
  for (const file of FILES) {
    const url = HF_BASE + file
    const dest = path.join(OUT_DIR, file)

    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size
      console.log(`  [skip] ${file} (${(size / 1024 / 1024).toFixed(1)} MB) — already exists`)
      totalSize += size
      continue
    }

    process.stdout.write(`  [dl]   ${file}...`)
    const size = await downloadFile(url, dest)
    totalSize += size
    console.log(` ${(size / 1024 / 1024).toFixed(1)} MB`)
  }

  console.log(`\nDone! Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
}

main().catch(err => { console.error(err); process.exit(1) })
