#!/usr/bin/env node
/**
 * generate-installer-images.mjs
 *
 * Generates branded NSIS installer images (BMP format) for Pluto Photos.
 *
 * Outputs:
 *   build/installerHeader.bmp   — 150×57  top-right banner on each page
 *   build/installerSidebar.bmp  — 164×314 left panel on welcome/finish pages
 *
 * Uses @napi-rs/canvas for text rendering + sharp for BMP conversion.
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BUILD = resolve(ROOT, 'build');
const ICON_PATH = resolve(BUILD, 'icon.png');

// ── Brand colours (from the icon's teal palette) ──
const DARK_BG    = '#0f1e2a';   // deep navy
const TEAL       = '#2dd4a8';   // bright teal accent
const TEAL_DIM   = '#1a7a6a';   // muted teal for gradient
const WHITE      = '#ffffff';
const LIGHT_GRAY = '#a0b4c0';

// ── Helpers ──

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function canvasToBmp(canvas) {
  const W = canvas.width, H = canvas.height;
  const imageData = canvas.getContext('2d').getImageData(0, 0, W, H);
  const pixels = imageData.data; // RGBA

  // BMP row stride must be a multiple of 4 bytes (3 bytes per pixel for 24-bit)
  const rowStride = Math.ceil(W * 3 / 4) * 4;
  const pixelDataSize = rowStride * H;
  const headerSize = 14 + 40; // file header + DIB header

  const buf = Buffer.alloc(headerSize + pixelDataSize);

  // ── File header (14 bytes) ──
  buf.write('BM', 0);                              // signature
  buf.writeUInt32LE(buf.length, 2);                 // file size
  buf.writeUInt32LE(0, 6);                          // reserved
  buf.writeUInt32LE(headerSize, 10);                // pixel data offset

  // ── DIB header (BITMAPINFOHEADER — 40 bytes) ──
  buf.writeUInt32LE(40, 14);                        // DIB header size
  buf.writeInt32LE(W, 18);                          // width
  buf.writeInt32LE(H, 22);                          // height (positive = bottom-up)
  buf.writeUInt16LE(1, 26);                         // colour planes
  buf.writeUInt16LE(24, 28);                        // bits per pixel
  buf.writeUInt32LE(0, 30);                         // compression (none)
  buf.writeUInt32LE(pixelDataSize, 34);             // image size
  buf.writeInt32LE(2835, 38);                       // h-res (72 DPI)
  buf.writeInt32LE(2835, 42);                       // v-res
  buf.writeUInt32LE(0, 46);                         // colours in palette
  buf.writeUInt32LE(0, 50);                         // important colours

  // ── Pixel data (bottom-up, BGR) ──
  for (let y = 0; y < H; y++) {
    const srcRow = (H - 1 - y) * W * 4; // BMP is bottom-up
    const dstRow = headerSize + y * rowStride;
    for (let x = 0; x < W; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 3;
      buf[di]     = pixels[si + 2]; // B
      buf[di + 1] = pixels[si + 1]; // G
      buf[di + 2] = pixels[si];     // R
    }
  }

  return buf;
}

// ── Generate Header (150×57) ──

async function generateHeader(icon) {
  const W = 150, H = 57;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient (dark navy → slightly lighter)
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, DARK_BG);
  grad.addColorStop(1, '#162838');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle teal accent line at bottom
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, H - 2, W, 2);

  // Icon (scaled to fit height with padding)
  const iconSize = 36;
  const iconY = (H - iconSize) / 2 - 1;
  ctx.drawImage(icon, 8, iconY, iconSize, iconSize);

  // "Pluto Photos" text
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pluto', 50, H / 2 - 8);

  ctx.fillStyle = TEAL;
  ctx.font = '12px sans-serif';
  ctx.fillText('Photos', 50, H / 2 + 8);

  return canvasToBmp(canvas);
}

// ── Generate Sidebar (164×314) ──

async function generateSidebar(icon) {
  const W = 164, H = 314;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient (top dark → bottom slightly lighter)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a1520');
  grad.addColorStop(0.5, DARK_BG);
  grad.addColorStop(1, '#162838');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Teal accent line on right edge
  ctx.fillStyle = TEAL;
  ctx.fillRect(W - 2, 0, 2, H);

  // Subtle glow circle behind icon
  const glowGrad = ctx.createRadialGradient(W / 2, 85, 10, W / 2, 85, 60);
  glowGrad.addColorStop(0, 'rgba(45, 212, 168, 0.15)');
  glowGrad.addColorStop(1, 'rgba(45, 212, 168, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 25, W, 120);

  // Icon (centered, decent size)
  const iconSize = 72;
  const iconX = (W - iconSize) / 2;
  ctx.drawImage(icon, iconX, 50, iconSize, iconSize);

  // "Pluto Photos" title
  ctx.textAlign = 'center';

  ctx.fillStyle = WHITE;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Pluto', W / 2, 148);

  ctx.fillStyle = TEAL;
  ctx.font = '16px sans-serif';
  ctx.fillText('Photos', W / 2, 168);

  // Divider line
  ctx.strokeStyle = 'rgba(45, 212, 168, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 185);
  ctx.lineTo(W - 30, 185);
  ctx.stroke();

  // Feature list
  ctx.fillStyle = LIGHT_GRAY;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const features = [
    '✦  Smart Albums',
    '✦  Face Detection',
    '✦  Map View',
    '✦  Photo Editor',
    '✦  100% Offline',
  ];
  features.forEach((f, i) => {
    ctx.fillText(f, W / 2, 205 + i * 18);
  });

  // Website at bottom
  ctx.fillStyle = TEAL_DIM;
  ctx.font = '9px sans-serif';
  ctx.fillText('plutophotos.com', W / 2, H - 12);

  return canvasToBmp(canvas);
}

// ── Main ──

async function main() {
  console.log('Generating installer images...');

  const icon = await loadImage(ICON_PATH);

  const [headerBuf, sidebarBuf] = await Promise.all([
    generateHeader(icon),
    generateSidebar(icon),
  ]);

  const { writeFileSync } = await import('fs');
  writeFileSync(resolve(BUILD, 'installerHeader.bmp'), headerBuf);
  console.log(`  ✅ installerHeader.bmp (${headerBuf.length} bytes)`);

  writeFileSync(resolve(BUILD, 'installerSidebar.bmp'), sidebarBuf);
  console.log(`  ✅ installerSidebar.bmp (${sidebarBuf.length} bytes)`);

  // Also generate uninstaller sidebar (same image)
  writeFileSync(resolve(BUILD, 'uninstallerSidebar.bmp'), sidebarBuf);
  console.log(`  ✅ uninstallerSidebar.bmp`);

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
