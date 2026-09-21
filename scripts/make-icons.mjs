// Draws the brand mark into the PNG icons the web app manifest needs.
// No image library: the rasteriser below is ~60 lines and the encoder is zlib
// plus four CRC'd chunks, which is cheaper than a dependency for five files.
// Regenerate with `pnpm icons` after changing the mark; commit the output.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INK = '#17231e';      // Same dark green as the theme colour and favicon.
const LEAF = '#9dbb86';     // Brand green, lightened so it reads on the ink.
const ORANGE = '#f0a34a';

const rgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));

// The mark is three skewed blocks on a 31 x 30 grid, matching `.brand-mark`
// in styles.css: bottom-aligned, 7 wide, 3 apart, the last one orange.
const BARS = [
  { x: 0, width: 7, height: 22, color: LEAF },
  { x: 10, width: 7, height: 30, color: LEAF },
  { x: 20, width: 7, height: 17, color: ORANGE },
];
const GRID = { width: 27, height: 30 };
const SKEW = Math.tan(-8 * Math.PI / 180); // CSS skewY(-8deg).

/** Signed-distance style coverage of a rounded rectangle, 0 outside, 1 inside. */
const inRoundedRect = (x, y, left, top, width, height, radius) => {
  const dx = Math.max(left - x, 0, x - (left + width));
  const dy = Math.max(top - y, 0, y - (top + height));
  if (dx === 0 && dy === 0) {
    const inset = Math.min(x - left, left + width - x, y - top, top + height - y);
    if (inset >= radius) return true;
  }
  const cx = Math.min(Math.max(x, left + radius), left + width - radius);
  const cy = Math.min(Math.max(y, top + radius), top + height - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
};

/**
 * @param size pixel size of the square icon
 * @param inset fraction of the canvas the mark leaves free on each side
 * @param corner corner radius as a fraction of the size (0.5 is a circle, 0 a square)
 */
function drawIcon(size, { inset, corner }) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = (size * (1 - 2 * inset)) / GRID.width;
  const originX = size * inset;
  // Centre the mark vertically; its skew is measured about the grid centre.
  const originY = (size - GRID.height * scale) / 2;
  const centre = originX + (GRID.width * scale) / 2;
  const [backR, backG, backB] = rgb(INK);
  const samples = 4, step = 1 / samples;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let backdrop = 0;
      const bar = new Map();
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) * step, py = y + (sy + 0.5) * step;
          if (!inRoundedRect(px, py, 0, 0, size, size, corner * size)) continue;
          backdrop++;
          // Undo the skew, then test the upright grid rectangles.
          const gx = (px - originX) / scale;
          const gy = (py - SKEW * (px - centre) - originY) / scale;
          for (const shape of BARS) {
            if (gx < shape.x || gx > shape.x + shape.width) continue;
            if (gy < GRID.height - shape.height || gy > GRID.height) continue;
            bar.set(shape.color, (bar.get(shape.color) || 0) + 1);
          }
        }
      }
      const total = samples * samples;
      const alpha = backdrop / total;
      if (alpha === 0) continue;
      let r = backR, g = backG, b = backB;
      for (const [color, hits] of bar) {
        const [cr, cg, cb] = rgb(color), mix = hits / backdrop;
        r += (cr - r) * mix; g += (cg - g) * mix; b += (cb - b) * mix;
      }
      const at = (y * size + x) * 4;
      pixels[at] = Math.round(r); pixels[at + 1] = Math.round(g);
      pixels[at + 2] = Math.round(b); pixels[at + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buffer => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};

/** Truecolour-with-alpha PNG, one filter-0 scanline per row. */
export function encodePng(size, pixels) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// `any` icons keep the favicon's rounded-square silhouette. The maskable one is
// full-bleed with the mark inside the 80% safe circle, because the platform
// crops it to its own shape. iOS applies its own mask, so that one is square.
const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 0.22, corner: 0.1875 },
  { file: 'icon-512.png', size: 512, inset: 0.22, corner: 0.1875 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.3, corner: 0 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.24, corner: 0 },
];

const directory = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(directory, { recursive: true });
for (const icon of ICONS) {
  const png = encodePng(icon.size, drawIcon(icon.size, icon));
  writeFileSync(new URL(icon.file, `file://${directory}`), png);
  console.log(`${icon.file.padEnd(24)} ${icon.size}px  ${png.length} bytes`);
}
