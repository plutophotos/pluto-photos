import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');

/**
 * Convert raw RGBA pixel data to a proper Windows BMP file (24-bit, bottom-up).
 * NSIS requires actual BMP format — a renamed PNG won't work.
 */
function rgbaToBmp(rawPixels, width, height) {
  const rowBytes = width * 3;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + rowPadding;
  const pixelDataSize = paddedRowBytes * height;
  const headerSize = 14; // BMP file header
  const dibSize = 40;    // BITMAPINFOHEADER
  const fileSize = headerSize + dibSize + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  let offset = 0;

  // BMP File Header (14 bytes)
  buf.write('BM', offset); offset += 2;
  buf.writeUInt32LE(fileSize, offset); offset += 4;
  buf.writeUInt16LE(0, offset); offset += 2; // reserved
  buf.writeUInt16LE(0, offset); offset += 2; // reserved
  buf.writeUInt32LE(headerSize + dibSize, offset); offset += 4; // pixel data offset

  // DIB Header — BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, offset); offset += 4;     // header size
  buf.writeInt32LE(width, offset); offset += 4;    // width
  buf.writeInt32LE(height, offset); offset += 4;   // height (positive = bottom-up)
  buf.writeUInt16LE(1, offset); offset += 2;       // color planes
  buf.writeUInt16LE(24, offset); offset += 2;      // bits per pixel
  buf.writeUInt32LE(0, offset); offset += 4;       // compression (none)
  buf.writeUInt32LE(pixelDataSize, offset); offset += 4;
  buf.writeInt32LE(2835, offset); offset += 4;     // horizontal resolution (72 dpi)
  buf.writeInt32LE(2835, offset); offset += 4;     // vertical resolution
  buf.writeUInt32LE(0, offset); offset += 4;       // colors in palette
  buf.writeUInt32LE(0, offset); offset += 4;       // important colors

  // Pixel data — BMP is stored bottom-up, BGR order
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4; // RGBA
      buf[offset++] = rawPixels[srcIdx + 2]; // B
      buf[offset++] = rawPixels[srcIdx + 1]; // G
      buf[offset++] = rawPixels[srcIdx + 0]; // R
    }
    // Row padding to 4-byte boundary
    for (let p = 0; p < rowPadding; p++) {
      buf[offset++] = 0;
    }
  }

  return buf;
}

async function svgToBmp(svgStr, outPath, width, height) {
  const { data } = await sharp(Buffer.from(svgStr))
    .resize(width, height)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const bmpData = rgbaToBmp(data, width, height);
  fs.writeFileSync(outPath, bmpData);
}

async function main() {
  // Header image: 150x57 (shown at top-right of installer pages)
  const headerSvg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#16213e"/>
      </linearGradient>
    </defs>
    <rect width="150" height="57" fill="url(#bg)"/>
    <text x="75" y="25" font-family="Segoe UI,Arial" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">Pluto Photos</text>
    <text x="75" y="42" font-family="Segoe UI,Arial" font-size="8" fill="#aaaacc" text-anchor="middle">Your Private Photo Library</text>
  </svg>`;

  await svgToBmp(headerSvg, path.join(buildDir, 'installerHeader.bmp'), 150, 57);
  console.log('Created installerHeader.bmp (150x57)');

  // Sidebar image: 164x314 (shown on welcome/finish pages)
  const sidebarSvg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sbg" x1="0%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" style="stop-color:#0f0c29"/>
        <stop offset="50%" style="stop-color:#302b63"/>
        <stop offset="100%" style="stop-color:#24243e"/>
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#sbg)"/>
    <circle cx="82" cy="80" r="30" fill="none" stroke="#6c63ff" stroke-width="2" opacity="0.6"/>
    <circle cx="82" cy="80" r="12" fill="#6c63ff" opacity="0.4"/>
    <text x="82" y="140" font-family="Segoe UI,Arial" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Pluto</text>
    <text x="82" y="160" font-family="Segoe UI,Arial" font-size="16" font-weight="700" fill="#ffffff" text-anchor="middle">Photos</text>
    <line x1="52" y1="180" x2="112" y2="180" stroke="#6c63ff" stroke-width="1" opacity="0.5"/>
    <text x="82" y="205" font-family="Segoe UI,Arial" font-size="8" fill="#9999bb" text-anchor="middle">Private</text>
    <text x="82" y="218" font-family="Segoe UI,Arial" font-size="8" fill="#9999bb" text-anchor="middle">Offline</text>
    <text x="82" y="231" font-family="Segoe UI,Arial" font-size="8" fill="#9999bb" text-anchor="middle">Fast</text>
    <text x="82" y="290" font-family="Segoe UI,Arial" font-size="7" fill="#666688" text-anchor="middle">plutophotos.com</text>
  </svg>`;

  await svgToBmp(sidebarSvg, path.join(buildDir, 'installerSidebar.bmp'), 164, 314);
  console.log('Created installerSidebar.bmp (164x314)');
}

main().catch(err => { console.error(err); process.exit(1); });
