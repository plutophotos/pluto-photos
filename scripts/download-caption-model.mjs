/**
 * Downloads AI models for offline contextual search + captioning.
 *
 * Models:
 *   1. CLIP ViT-B/32 (quantized ONNX) — embedding-based semantic search
 *      - vision encoder (~85MB) + text encoder (~65MB) + tokenizer
 *   2. mozilla/distilvit image captioning (ONNX) — free-form caption generation
 *      - ViT vision encoder quantized (~83MB) + GPT2 text decoder quantized (~95MB) + tokenizer/configs
 *
 * All models run entirely offline via onnxruntime-node.
 *
 * Run: node scripts/download-caption-model.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIP_DIR = path.join(__dirname, '..', 'resources', 'caption-model')
const BLIP_DIR = path.join(__dirname, '..', 'resources', 'blip-model')

// ── CLIP ViT-B/32 (for search embeddings) ──
const XENOVA_CLIP = 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/'
const OPENAI_CLIP = 'https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/'

const CLIP_FILES = [
  { url: XENOVA_CLIP + 'onnx/text_model_quantized.onnx', dest: 'clip_text.onnx', label: 'CLIP text encoder' },
  { url: XENOVA_CLIP + 'onnx/vision_model_quantized.onnx', dest: 'clip_vision.onnx', label: 'CLIP vision encoder' },
  { url: OPENAI_CLIP + 'vocab.json', dest: 'vocab.json', label: 'CLIP BPE vocabulary' },
  { url: OPENAI_CLIP + 'merges.txt', dest: 'merges.txt', label: 'CLIP BPE merges' },
]

// ── mozilla/distilvit image captioning (for free-form caption generation) ──
const DISTILVIT = 'https://huggingface.co/mozilla/distilvit/resolve/main/'

const CAPTION_GEN_FILES = [
  { url: DISTILVIT + 'onnx/encoder_model_quantized.onnx', dest: 'onnx/encoder_model_quantized.onnx', label: 'ViT vision encoder (quantized)' },
  { url: DISTILVIT + 'onnx/decoder_model_merged_quantized.onnx', dest: 'onnx/decoder_model_merged_quantized.onnx', label: 'GPT2 text decoder (quantized)' },
  { url: DISTILVIT + 'config.json', dest: 'config.json', label: 'Model config' },
  { url: DISTILVIT + 'tokenizer.json', dest: 'tokenizer.json', label: 'GPT2 tokenizer' },
  { url: DISTILVIT + 'tokenizer_config.json', dest: 'tokenizer_config.json', label: 'Tokenizer config' },
  { url: DISTILVIT + 'preprocessor_config.json', dest: 'preprocessor_config.json', label: 'Preprocessor config' },
  { url: DISTILVIT + 'generation_config.json', dest: 'generation_config.json', label: 'Generation config' },
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

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

async function downloadGroup(label, outDir, files) {
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`\n── ${label} ──`)
  console.log(`   Output: ${outDir}\n`)

  let groupSize = 0
  for (const file of files) {
    const dest = path.join(outDir, file.dest)

    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size
      console.log(`  [skip] ${file.dest} (${formatSize(size)})`)
      groupSize += size
      continue
    }

    process.stdout.write(`  [dl]   ${file.label} → ${file.dest}...`)
    try {
      const size = await downloadFile(file.url, dest)
      groupSize += size
      console.log(` ${formatSize(size)}`)
    } catch (err) {
      console.log(` FAILED`)
      console.error(`         ${err.message}`)
      process.exit(1)
    }
  }
  return groupSize
}

async function main() {
  // Remove old MobileNet files if present
  for (const old of ['mobilenetv2.onnx', 'imagenet_classes.txt']) {
    const oldPath = path.join(CLIP_DIR, old)
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath)
      console.log(`  [cleanup] Removed old ${old}`)
    }
  }

  console.log('Downloading AI models for Pluto Photos contextual search...')

  const clipSize = await downloadGroup('CLIP ViT-B/32 (semantic search)', CLIP_DIR, CLIP_FILES)
  const blipSize = await downloadGroup('mozilla/distilvit image captioning (captions)', BLIP_DIR, CAPTION_GEN_FILES)

  // Clear cached vocab embeddings
  for (const f of fs.readdirSync(CLIP_DIR)) {
    if (f.startsWith('vocab_embeddings') && f.endsWith('.json')) {
      fs.unlinkSync(path.join(CLIP_DIR, f))
      console.log(`\n  [cleanup] Cleared ${f}`)
    }
  }

  const total = clipSize + blipSize
  console.log(`\nDone! Total: ${formatSize(total)} (CLIP: ${formatSize(clipSize)}, distilvit: ${formatSize(blipSize)})`)
  console.log('Models bundled in resources/caption-model/ + resources/blip-model/')
}

main().catch(err => {
  console.error('Download failed:', err)
  process.exit(1)
})
