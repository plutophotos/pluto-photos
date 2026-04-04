/**
 * afterPack hook for electron-builder
 *
 * Strips unnecessary files from the packed app to reduce build size:
 *
 * 1. onnxruntime-node: Remove non-target platform binaries (~140-175 MB saved)
 * 2. pdfjs-dist: Remove legacy/ build (duplicate of build/) (~17 MB saved)
 * 3. @vladmandic/face-api: Remove demo/ and model/ dirs (~15 MB saved)
 *    (face models are already separately bundled in resources/face-models)
 * 4. blip-model: Remove fp32 encoder if quantized version exists (~245 MB saved)
 * 5. @napi-rs/canvas: Remove non-target platform binaries (~30-70 MB saved)
 * 6. @img/sharp: Remove non-target platform binaries (~16-33 MB saved)
 * 7. ffmpeg-static: Remove wrong-platform binary (~76-79 MB saved)
 * 8. better-sqlite3: Remove C source files and cross-platform prebuilds (~20 MB saved)
 */

const path = require('path');
const fs = require('fs');

function rmSync(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

exports.default = async function afterPack(context) {
  const appDir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked');
  const platform = context.electronPlatformName; // 'darwin', 'linux', 'win32'
  let totalSaved = 0;

  console.log(`\n[afterPack] Stripping unnecessary files for platform: ${platform}`);

  // ── 1. Strip non-target platform onnxruntime-node binaries ──
  const ortBinDir = path.join(appDir, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
  if (fs.existsSync(ortBinDir)) {
    // Map electron platform names to onnxruntime directory names
    const platformDirMap = {
      'darwin': 'darwin',
      'linux': 'linux',
      'win32': 'win32',
    };
    // Map electron arch to onnxruntime arch dir
    const arch = context.arch === 1 ? 'x64' : context.arch === 3 ? 'arm64' : 'x64';
    const keepPlatform = platformDirMap[platform];

    for (const platformDir of fs.readdirSync(ortBinDir, { withFileTypes: true })) {
      if (!platformDir.isDirectory()) continue;
      const platformPath = path.join(ortBinDir, platformDir.name);

      if (platformDir.name !== keepPlatform) {
        // Remove entire non-target platform directory
        const size = dirSize(platformPath);
        rmSync(platformPath);
        totalSaved += size;
        console.log(`  [onnxruntime] Removed ${platformDir.name}/ (${formatMB(size)})`);
      } else {
        // Within the target platform, remove non-target architectures
        for (const archDir of fs.readdirSync(platformPath, { withFileTypes: true })) {
          if (!archDir.isDirectory()) continue;
          if (archDir.name !== arch) {
            const archPath = path.join(platformPath, archDir.name);
            const size = dirSize(archPath);
            rmSync(archPath);
            totalSaved += size;
            console.log(`  [onnxruntime] Removed ${platformDir.name}/${archDir.name}/ (${formatMB(size)})`);
          }
        }
      }
    }
  }

  // ── 2. Strip pdfjs-dist legacy/ (duplicate of build/) ──
  const pdfjsLegacy = path.join(appDir, 'node_modules', 'pdfjs-dist', 'legacy');
  if (fs.existsSync(pdfjsLegacy)) {
    const size = dirSize(pdfjsLegacy);
    rmSync(pdfjsLegacy);
    totalSaved += size;
    console.log(`  [pdfjs-dist] Removed legacy/ (${formatMB(size)})`);
  }

  // ── 3. Strip @vladmandic/face-api demo/ and model/ ──
  const faceApiDir = path.join(appDir, 'node_modules', '@vladmandic', 'face-api');
  for (const sub of ['demo', 'model', '.github', '.vscode']) {
    const p = path.join(faceApiDir, sub);
    if (fs.existsSync(p)) {
      const size = dirSize(p);
      rmSync(p);
      totalSaved += size;
      console.log(`  [face-api] Removed ${sub}/ (${formatMB(size)})`);
    }
  }

  // ── 4. Remove fp32 BLIP encoder if quantized version exists ──
  const blipOnnxDir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'resources', 'blip-model', 'onnx');
  const fp32Encoder = path.join(blipOnnxDir, 'encoder_model.onnx');
  const quantEncoder = path.join(blipOnnxDir, 'encoder_model_quantized.onnx');
  if (fs.existsSync(fp32Encoder) && fs.existsSync(quantEncoder)) {
    const size = fs.statSync(fp32Encoder).size;
    fs.unlinkSync(fp32Encoder);
    totalSaved += size;
    console.log(`  [blip-model] Removed fp32 encoder_model.onnx (${formatMB(size)})`);
  }

  // ── 5. Strip cross-platform @napi-rs/canvas binaries ──
  const napiRsDir = path.join(appDir, 'node_modules', '@napi-rs');
  if (fs.existsSync(napiRsDir)) {
    const platformMap = { 'win32': 'win32', 'darwin': 'darwin', 'linux': 'linux' };
    const keepPlatform = platformMap[platform] || platform;
    for (const entry of fs.readdirSync(napiRsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('canvas-')) continue;
      // canvas-win32-x64-msvc, canvas-linux-x64-gnu, canvas-darwin-arm64, etc.
      if (!entry.name.includes(keepPlatform)) {
        const p = path.join(napiRsDir, entry.name);
        const size = dirSize(p);
        rmSync(p);
        totalSaved += size;
        console.log(`  [@napi-rs] Removed ${entry.name}/ (${formatMB(size)})`);
      }
    }
  }

  // ── 6. Strip cross-platform @img/sharp binaries ──
  const imgDir = path.join(appDir, 'node_modules', '@img');
  if (fs.existsSync(imgDir)) {
    const keepPlatform = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
    for (const entry of fs.readdirSync(imgDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // sharp-win32-x64, sharp-linux-x64, sharp-libvips-linux-x64, sharp-linuxmusl-x64, etc.
      const name = entry.name;
      if (name === 'colour') continue; // keep colour profiles
      const isForCurrentPlatform = name.includes(keepPlatform)
        || (keepPlatform === 'linux' && (name.includes('linux') || name.includes('linuxmusl')));
      if (!isForCurrentPlatform) {
        const p = path.join(imgDir, name);
        const size = dirSize(p);
        rmSync(p);
        totalSaved += size;
        console.log(`  [@img] Removed ${name}/ (${formatMB(size)})`);
      }
    }
  }

  // ── 7. Strip cross-platform ffmpeg-static binary ──
  const ffmpegDir = path.join(appDir, 'node_modules', 'ffmpeg-static');
  if (fs.existsSync(ffmpegDir)) {
    // On Windows keep ffmpeg.exe, remove ffmpeg (Linux); on Linux/Mac keep ffmpeg, remove ffmpeg.exe
    if (platform === 'win32') {
      const linuxBin = path.join(ffmpegDir, 'ffmpeg');
      if (fs.existsSync(linuxBin) && !linuxBin.endsWith('.exe')) {
        const size = fs.statSync(linuxBin).size;
        fs.unlinkSync(linuxBin);
        totalSaved += size;
        console.log(`  [ffmpeg-static] Removed Linux ffmpeg binary (${formatMB(size)})`);
      }
    } else {
      const winBin = path.join(ffmpegDir, 'ffmpeg.exe');
      if (fs.existsSync(winBin)) {
        const size = fs.statSync(winBin).size;
        fs.unlinkSync(winBin);
        totalSaved += size;
        console.log(`  [ffmpeg-static] Removed Windows ffmpeg.exe (${formatMB(size)})`);
      }
    }
  }

  // ── 8. Strip better-sqlite3 source files and cross-platform binaries ──
  const sqliteDir = path.join(appDir, 'node_modules', 'better-sqlite3');
  if (fs.existsSync(sqliteDir)) {
    for (const sub of ['deps', 'src', 'bin']) {
      const p = path.join(sqliteDir, sub);
      if (fs.existsSync(p)) {
        const size = dirSize(p);
        rmSync(p);
        totalSaved += size;
        console.log(`  [better-sqlite3] Removed ${sub}/ (${formatMB(size)})`);
      }
    }
  }

  console.log(`[afterPack] Total saved: ${formatMB(totalSaved)}\n`);
};
