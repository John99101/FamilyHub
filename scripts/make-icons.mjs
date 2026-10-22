// Draws the FamilyHub icons (a white house with a coral heart on teal) and
// writes them as PNG and SVG into public/icons. Run: node scripts/make-icons.mjs
// No external tools: a tiny PNG encoder with Node's zlib.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const TEAL = [15, 118, 110];
const WHITE = [255, 255, 255];
const CORAL = [242, 107, 91];

// Shapes in a 512 x 512 design space.
const HOUSE = [[256, 104], [428, 246], [382, 246], [382, 408], [130, 408], [130, 246], [84, 246]];
const HEART = (() => {
  const points = [];
  const k = 3.7, cx = 256, cy = 322;
  for (let i = 0; i < 240; i += 1) {
    const t = (i / 240) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push([cx + k * x, cy - k * (y + 2.5)]);
  }
  return points;
})();

function bbox(poly) {
  const xs = poly.map((p) => p[0]); const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const HEART_BOX = bbox(HEART);
const HOUSE_BOX = bbox(HOUSE);

function inPolygon(x, y, poly, box) {
  if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 512 - r);
  const cy = Math.min(Math.max(y, r), 512 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Colour at one design space point, or null for transparent.
function sample(x, y, { radius, contentScale }) {
  if (x < 0 || y < 0 || x > 512 || y > 512) return null;
  if (radius > 0 && !inRoundedRect(x, y, radius)) return null;
  const sx = 256 + (x - 256) / contentScale;
  const sy = 256 + (y - 256) / contentScale;
  if (inPolygon(sx, sy, HEART, HEART_BOX)) return CORAL;
  if (inPolygon(sx, sy, HOUSE, HOUSE_BOX)) return WHITE;
  return TEAL;
}

function render(size, options) {
  const ss = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ss; j += 1) {
        for (let i = 0; i < ss; i += 1) {
          const c = sample((px + (i + 0.5) / ss) * scale, (py + (j + 0.5) / ss) * scale, options);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        pixels[o] = Math.round(r / a); pixels[o + 1] = Math.round(g / a); pixels[o + 2] = Math.round(b / a);
      }
      pixels[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const variants = [
  { file: 'icon-192.png', size: 192, radius: 112, contentScale: 1 },
  { file: 'icon-512.png', size: 512, radius: 112, contentScale: 1 },
  // Maskable: full square, artwork shrunk into the safe zone.
  { file: 'icon-maskable-512.png', size: 512, radius: 0, contentScale: 0.78 },
  // iOS rounds the corners itself.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, contentScale: 0.9 },
];
for (const v of variants) {
  writeFileSync(join(outDir, v.file), png(v.size, render(v.size, v)));
  console.log('wrote', v.file);
}

const pts = (poly) => poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="rgb(${TEAL})"/>
  <polygon points="${pts(HOUSE)}" fill="rgb(${WHITE})"/>
  <polygon points="${pts(HEART)}" fill="rgb(${CORAL})"/>
</svg>
`;
writeFileSync(join(outDir, 'icon.svg'), svg);
console.log('wrote icon.svg');
