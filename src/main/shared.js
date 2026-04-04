/**
 * shared.js — Common utility functions used by both index.js (Electron IPC)
 * and api-server.js (companion browser). Eliminates code duplication.
 */
import sharp from 'sharp'
import fs from 'fs'

// ── Pure math / vector utilities ───────────────────────────

/** Euclidean distance between two equal-length numeric arrays */
export function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Cosine similarity between two L2-normalised vectors */
export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** L2-normalise a vector in place and return it */
export function l2Normalise(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

// ── ArcFace alignment utilities ────────────────────────────

/** ArcFace reference landmark positions for a 112×112 aligned face */
export const ARCFACE_REF = [
  [38.2946, 51.6963],  // left eye centre
  [73.5318, 51.5014],  // right eye centre
  [56.0252, 71.7366],  // nose tip
  [41.5493, 92.3655],  // left mouth corner
  [70.7299, 92.2041],  // right mouth corner
];

/**
 * Estimate a 2-D similarity transform (rotation + uniform scale + translation)
 * that maps `src` points to `dst` points in a least-squares sense.
 *
 * Transform:  dx = a·sx − b·sy + tx
 *             dy = b·sx + a·sy + ty
 *
 * Returns { a, b, tx, ty }.
 */
export function estimateSimilarityTransform(src, dst) {
  const n = src.length;
  // Build normal-equation matrices (AᵀA is 4×4)
  const AtA = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const Atb = new Array(4).fill(0);
  for (let i = 0; i < n; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    // Row 1: [sx, -sy, 1, 0] → dx
    // Row 2: [sy,  sx, 0, 1] → dy
    const rows = [[sx, -sy, 1, 0, dx], [sy, sx, 0, 1, dy]];
    for (const r of rows) {
      for (let j = 0; j < 4; j++) {
        Atb[j] += r[j] * r[4];
        for (let k = 0; k < 4; k++) AtA[j][k] += r[j] * r[k];
      }
    }
  }
  // Solve 4×4 via Gaussian elimination with partial pivoting
  const aug = AtA.map((row, i) => [...row, Atb[i]]);
  for (let col = 0; col < 4; col++) {
    let best = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[best][col])) best = row;
    }
    [aug[col], aug[best]] = [aug[best], aug[col]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-12) continue;
    for (let j = col; j <= 4; j++) aug[col][j] /= piv;
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = col; j <= 4; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  return { a: aug[0][4], b: aug[1][4], tx: aug[2][4], ty: aug[3][4] };
}

/**
 * Warp a raw-RGB buffer to a 112×112 aligned face using the inverse of the
 * given similarity transform.  Uses bilinear interpolation.
 *
 * @param {Buffer} rgbBuf   Raw RGB pixels of the source crop
 * @param {number} srcW     Width  of the source crop in pixels
 * @param {number} srcH     Height of the source crop in pixels
 * @param {object} T        { a, b, tx, ty } — forward similarity transform
 * @returns {Float32Array}  NCHW float32 tensor (1×3×112×112) normalised to [−1, 1]
 */
export function warpAlignedFace(rgbBuf, srcW, srcH, T) {
  const S = 112;
  const det = T.a * T.a + T.b * T.b;
  const out = new Float32Array(3 * S * S);

  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const du = u - T.tx, dv = v - T.ty;
      const srcX = (T.a * du + T.b * dv) / det;
      const srcY = (T.a * dv - T.b * du) / det;

      // Bilinear interpolation
      const x0 = Math.floor(srcX), y0 = Math.floor(srcY);
      const fx = srcX - x0, fy = srcY - y0;
      for (let c = 0; c < 3; c++) {
        const px = (x, y) => {
          if (x < 0 || x >= srcW || y < 0 || y >= srcH) return 128;
          return rgbBuf[(y * srcW + x) * 3 + c];
        };
        const val =
          (1 - fx) * (1 - fy) * px(x0, y0) +
          fx * (1 - fy) * px(x0 + 1, y0) +
          (1 - fx) * fy * px(x0, y0 + 1) +
          fx * fy * px(x0 + 1, y0 + 1);
        out[c * S * S + v * S + u] = (val / 255.0 - 0.5) / 0.5;
      }
    }
  }
  return out;
}

// ── DB helpers (take db as first argument) ─────────────────

// ── ArcFace ONNX inference ─────────────────────────────────

let _arcfaceSession = null;

/**
 * Lazy-load the ArcFace ONNX session.  Call once with the absolute path to the
 * .onnx file; subsequent calls reuse the cached session.
 */
export async function ensureArcFace(modelPath) {
  if (_arcfaceSession) return _arcfaceSession;
  const ort = await import('onnxruntime-node');
  _arcfaceSession = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });
  console.log('[ArcFace] ONNX model loaded');
  return _arcfaceSession;
}

/**
 * Compute a 512-dim L2-normalised ArcFace descriptor for a detected face.
 *
 * @param {string} imagePath   Absolute path to the source image
 * @param {{x:number,y:number,width:number,height:number}} box  Face bounding box (original-image coords)
 * @param {number[][]} landmarks  5-point landmarks [[lx,ly],[rx,ry],[nose],[lm],[rm]] (original-image coords)
 * @returns {Promise<number[]|null>}  512-dim L2-normalised embedding, or null on failure
 */
export async function computeArcFaceDescriptor(imagePath, box, landmarks) {
  if (!_arcfaceSession) throw new Error('ArcFace model not loaded — call ensureArcFace() first');
  const ort = await import('onnxruntime-node');

  // Pad the face box to include enough context for alignment
  const padFactor = 0.5;
  const meta = await sharp(imagePath, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) return null;

  // Handle EXIF orientation — sharp.rotate() swaps width/height for orientations ≥ 5
  const rotated = meta.orientation && meta.orientation >= 5;
  const imgW = rotated ? meta.height : meta.width;
  const imgH = rotated ? meta.width : meta.height;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const halfW = box.width * (1 + padFactor) / 2;
  const halfH = box.height * (1 + padFactor) / 2;
  const cropX = Math.max(0, Math.round(cx - halfW));
  const cropY = Math.max(0, Math.round(cy - halfH));
  const cropW = Math.min(Math.round(halfW * 2), imgW - cropX);
  const cropH = Math.min(Math.round(halfH * 2), imgH - cropY);

  if (cropW < 20 || cropH < 20) return null;

  const rgbBuf = await sharp(imagePath, { failOn: 'none' })
    .rotate()
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Remap landmarks relative to crop origin
  const remappedLM = landmarks.map(([x, y]) => [x - cropX, y - cropY]);

  // Alignment: landmarks → ArcFace 112×112 reference
  const T = estimateSimilarityTransform(remappedLM, ARCFACE_REF);
  const tensor = warpAlignedFace(rgbBuf, cropW, cropH, T);

  // Run ArcFace ONNX — use dynamic tensor names (w600k_r50 uses 'input.1' / '683')
  const inputTensor = new ort.Tensor('float32', tensor, [1, 3, 112, 112]);
  const inputName = _arcfaceSession.inputNames[0];
  const outputName = _arcfaceSession.outputNames[0];
  const results = await _arcfaceSession.run({ [inputName]: inputTensor });
  const emb = Array.from(results[outputName].data);
  l2Normalise(emb);

  return emb;
}

/**
 * Recompute the centroid descriptor for a person from all their face descriptors.
 * @param {object} db - better-sqlite3 database instance
 * @param {number} personId
 */
export function recomputePersonCentroid(db, personId) {
  const faces = db.prepare('SELECT descriptor FROM image_faces WHERE person_id = ? AND descriptor IS NOT NULL').all(personId);
  if (faces.length === 0) {
    db.prepare('UPDATE people SET centroid = NULL WHERE id = ?').run(personId);
    return;
  }
  const first = JSON.parse(faces[0].descriptor);
  const dim = first.length;
  const avg = new Array(dim).fill(0);
  let count = 0;
  for (const f of faces) {
    try { const d = JSON.parse(f.descriptor); for (let i = 0; i < dim; i++) avg[i] += d[i]; count++; } catch {}
  }
  if (count > 0) {
    for (let i = 0; i < dim; i++) avg[i] /= count;
    // L2-normalize centroid for cosine similarity matching
    l2Normalise(avg);
    db.prepare('UPDATE people SET centroid = ? WHERE id = ?').run(JSON.stringify(avg), personId);
  }
}

/**
 * Remove people entries that have zero face entries (orphan cleanup).
 * @param {object} db - better-sqlite3 database instance
 */
export function cleanupOrphanedPeople(db) {
  db.prepare('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM image_faces WHERE person_id IS NOT NULL)').run();
}

// ── Search / stemming utilities ────────────────────────────

/**
 * Reduce a word to a crude stem and wrap with SQL LIKE wildcards.
 * e.g. "smiling" → "%smil%", "cars" → "%car%"
 */
export function stemToPattern(word) {
  let w = word.toLowerCase();
  const suffixes = [
    'iness',
    'ness', 'ment', 'able', 'ible', 'tion', 'sion',
    'ical', 'ally', 'ized', 'ised',
    'ful', 'ous', 'ive', 'ing', 'ely',
    'ies', 'ied', 'ers', 'est', 'ess',
    'ed', 'ly', 'er', 'es', 'en',
    'e',
    's'
  ];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return `%${w}%`;
}

/**
 * Load synonym groups from a JSON file and build a lookup map.
 * @param {string} synPath - absolute path to search-synonyms.json
 * @returns {Object.<string, string[]>} map of word → group
 */
export function loadSynonymMap(synPath) {
  const map = {};
  try {
    if (fs.existsSync(synPath)) {
      const synData = JSON.parse(fs.readFileSync(synPath, 'utf-8'));
      for (const group of synData.groups || []) {
        for (const w of group) map[w.toLowerCase()] = group.map(g => g.toLowerCase());
      }
    }
  } catch (e) {
    console.warn('[Search] Failed to load search-synonyms.json:', e.message);
  }
  return map;
}

/**
 * Build SQL LIKE condition(s) for a keyword, expanding with synonyms + stemming.
 * @param {Object.<string, string[]>} synonymMap - pre-loaded synonym map
 * @param {string} keyword - search term
 * @param {string} [column='captions'] - SQL column name
 * @returns {{ sql: string, params: string[] }}
 */
export function synonymLikeCondition(synonymMap, keyword, column = 'captions') {
  const w = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return { sql: '1=1', params: [] };
  const group = synonymMap[w];
  const seen = new Set();
  const patterns = [];
  const words = group || [w];
  for (const syn of words) {
    const pat = stemToPattern(syn);
    if (!seen.has(pat)) { seen.add(pat); patterns.push(pat); }
  }
  if (patterns.length === 1) return { sql: `${column} LIKE ?`, params: patterns };
  return {
    sql: `(${patterns.map(() => `${column} LIKE ?`).join(' OR ')})`,
    params: patterns
  };
}

// ── Color / tone analysis ──────────────────────────────────

/**
 * Map an RGB color to a human-readable color name.
 * Uses HSL with refined hue boundaries and lightness/saturation-aware categories.
 */
export function rgbToColorName(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d < 0.04) {
    if (l < 0.18) return 'black';
    if (l > 0.82) return 'white';
    return 'gray';
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  if (s < 0.1) {
    if (l < 0.18) return 'black';
    if (l > 0.82) return 'white';
    return 'gray';
  }

  if (s < 0.2) {
    if (l < 0.2) return 'black';
    if (l > 0.82) return 'white';
    if (h >= 15 && h < 50 && l > 0.5) return 'beige';
    if (h >= 15 && h < 50) return 'brown';
    if (h >= 210 && h < 280 && l > 0.6) return 'lavender';
    return 'gray';
  }

  if (h >= 15 && h < 45 && l > 0.55 && (s < 0.5 || l > 0.75)) return 'beige';

  if (h < 10 || h >= 340) {
    if (l < 0.28) return 'maroon';
    if (l > 0.8) return 'pink';
    if (l > 0.7 && s < 0.5) return 'pink';
    return 'red';
  }
  if (h < 25) {
    if (l < 0.25) return 'brown';
    return s < 0.45 ? 'brown' : (l < 0.45 ? 'brown' : 'orange');
  }
  if (h < 45) {
    if (l < 0.28) return 'brown';
    return 'orange';
  }
  if (h < 62) {
    if (l < 0.25 || s < 0.3) return 'olive';
    return l < 0.45 ? 'gold' : 'yellow';
  }
  if (h < 85) {
    if (l < 0.4 || s < 0.3) return 'olive';
    return 'yellow';
  }
  if (h < 160) {
    if (l < 0.35 && s < 0.5) return 'olive';
    return 'green';
  }
  if (h < 190) return 'teal';
  if (h < 200) return l < 0.25 ? 'teal' : 'cyan';
  if (h < 260) {
    if (l < 0.28) return 'navy';
    if (l > 0.7 && s < 0.4) return 'lavender';
    return 'blue';
  }
  if (h < 300) {
    if (l > 0.7) return 'lavender';
    return 'purple';
  }
  if (l < 0.28) return 'purple';
  if (l > 0.65) return 'pink';
  return s > 0.6 ? 'magenta' : 'pink';
}

/**
 * Analyse the dominant color scheme of an image buffer.
 * Uses pixel-level analysis on a downscaled thumbnail for accurate color/tone detection.
 * Returns a descriptor like "black and white", "warm-toned orange", "cool-toned blue", etc.
 */
export async function analyseColorScheme(buf) {
  try {
    const { data } = await sharp(buf)
      .resize(64, 64, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = (data.length / 3) | 0;

    let bwPixels = 0;
    let totalLum = 0;
    let warmPixels = 0;
    let coolPixels = 0;
    let totalSat = 0;
    let chromaticCount = 0;
    const colorBins = {};

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      totalLum += lum;

      const pxSpread = Math.max(r, g, b) - Math.min(r, g, b);
      if (pxSpread < 20) { bwPixels++; continue; }

      const rn = r / 255, gn = g / 255, bn = b / 255;
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
      const l = (max + min) / 2;
      const d = max - min;
      const s = d < 0.001 ? 0 : (l > 0.5 ? d / (2 - max - min) : d / (max + min));

      if (s < 0.1) { bwPixels++; continue; }

      let h = 0;
      if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else                 h = ((rn - gn) / d + 4) * 60;

      chromaticCount++;
      totalSat += s;

      if ((h < 70) || h >= 330) warmPixels++;
      else if (h >= 180 && h < 310) coolPixels++;

      const name = rgbToColorName(r, g, b);
      if (name !== 'black' && name !== 'white' && name !== 'gray') {
        colorBins[name] = (colorBins[name] || 0) + 1;
      }
    }

    const avgLum = totalLum / pixelCount;
    const bwRatio = bwPixels / pixelCount;

    if (bwRatio > 0.85) {
      if (avgLum < 60)  return 'dark black and white';
      if (avgLum > 200) return 'high-key black and white';
      return 'black and white';
    }

    let dominantColor = null;
    let maxBin = 0;
    for (const [color, count] of Object.entries(colorBins)) {
      if (count > maxBin) { maxBin = count; dominantColor = color; }
    }
    const chromaticRatio = maxBin / pixelCount;
    const colorSuffix = dominantColor && chromaticRatio > 0.08 ? ` ${dominantColor}` : '';

    const totalBinned = Object.values(colorBins).reduce((a, b) => a + b, 0);
    const sepiaCount = (colorBins['brown'] || 0) + (colorBins['beige'] || 0) + (colorBins['orange'] || 0);
    const avgSat = chromaticCount > 0 ? totalSat / chromaticCount : 0;
    if (totalBinned > pixelCount * 0.15 && sepiaCount / Math.max(totalBinned, 1) > 0.55 && avgSat < 0.35) {
      return `sepia-toned${colorSuffix}`;
    }

    const tempPixels = warmPixels + coolPixels;
    const warmRatio = tempPixels > 0 ? warmPixels / tempPixels : 0.5;
    const isVibrant = avgSat > 0.45;

    if (warmRatio > 0.65) {
      return `${isVibrant ? 'vibrant warm-toned' : 'warm-toned'}${colorSuffix}`;
    }
    if (warmRatio < 0.35) {
      return `${isVibrant ? 'vibrant cool-toned' : 'cool-toned'}${colorSuffix}`;
    }

    if (avgLum < 50)  return `dark${colorSuffix}`;
    if (avgLum > 210) return `bright${colorSuffix}`;
    if (isVibrant || avgSat > 0.4) return `colorful${colorSuffix}`;

    if (warmRatio > 0.55) return `warm-toned${colorSuffix}`;
    if (warmRatio < 0.45) return `cool-toned${colorSuffix}`;

    if (colorSuffix) return dominantColor;
    return null;
  } catch {
    return null;
  }
}
