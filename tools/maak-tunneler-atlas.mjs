// Maakt de tunneler-atlas: snijdt de 3×3 rotssprites uit, kopieert kraters
// van woestijn, en pakt alles in een PixiJS-spritesheet (objects.json + objects.png).
//   node tools/maak-tunneler-atlas.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ROTS_SRC = `${ROOT}input/tunneler-style/Grijze Rotsclustersprites in Rasterformaat.png`;
const OBJ_DIR = `${ROOT}public/assets/tunneler/objects/`;
const ATLAS_PNG = `${ROOT}public/assets/tunneler/objects.png`;
const ATLAS_JSON = `${ROOT}public/assets/tunneler/objects.json`;
const WOESTIJN_OBJ = `${ROOT}public/assets/woestijn/objects/`;

const ROTS_SIZE = 160;    // doelgrootte rotssprites
const KRATER_SIZE = 256;  // kraters zijn al 256×256
const PAD = 4;            // ruimte tussen sprites in de atlas

// ---------- PNG lezen/schrijven (kopie uit maak-tanks.mjs) ----------
function readPng(path) {
  const d = readFileSync(path);
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < d.length) {
    const n = d.readUInt32BE(p), t = d.toString('latin1', p + 4, p + 8), c = d.subarray(p + 8, p + 8 + n);
    if (t === 'IHDR') { w = c.readUInt32BE(0); h = c.readUInt32BE(4); type = c[9]; if (c[8] !== 8 || c[12]) throw new Error(`${path}: alleen 8 bit, niet interlaced`); }
    if (t === 'IDAT') idat.push(c);
    p += 12 + n;
  }
  const bpp = { 6: 4, 2: 3 }[type];
  if (!bpp) throw new Error(`${path}: kleurtype ${type} niet ondersteund`);
  const raw = inflateSync(Buffer.concat(idat)), st = w * bpp, px = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(st), i = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[i++], line = Uint8Array.from(raw.subarray(i, i + st));
    i += st;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c2 = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] += a;
      else if (f === 2) line[x] += b;
      else if (f === 3) line[x] += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c2), pb = Math.abs(a - c2), pc = Math.abs(a + b - 2 * c2); line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c2; }
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) px[(y * w + x) * 4 + k] = k < bpp ? line[x * bpp + k] : 255;
    prev = line;
  }
  return { w, h, px };
}
function writePng(path, { w, h, px }) {
  const chunk = (t, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(t, 'latin1'), data]), crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 1;
    for (let x = 0; x < w * 4; x++) raw[o + 1 + x] = (px[y * w * 4 + x] - (x >= 4 ? px[y * w * 4 + x - 4] : 0)) & 255;
  }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// Verschaal een rechthoekig stuk van een afbeelding naar w×h
function resample(img, sx0, sy0, sw, sh, dw, dh) {
  const scaleX = dw / sw, scaleY = dh / sh;
  const px = new Uint8Array(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      const srcX0 = sx0 + dx / scaleX, srcX1 = sx0 + (dx + 1) / scaleX;
      const srcY0 = sy0 + dy / scaleY, srcY1 = sy0 + (dy + 1) / scaleY;
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = Math.floor(srcY0); sy < Math.ceil(srcY1); sy++) {
        for (let sx = Math.floor(srcX0); sx < Math.ceil(srcX1); sx++) {
          if (sx < 0 || sx >= img.w || sy < 0 || sy >= img.h) continue;
          const fy = Math.min(srcY1, sy + 1) - Math.max(srcY0, sy);
          const fx = Math.min(srcX1, sx + 1) - Math.max(srcX0, sx);
          const f = fx * fy * scaleX * scaleY;
          const i = (sy * img.w + sx) * 4, al = img.px[i + 3] * f;
          r += img.px[i] * al; g += img.px[i + 1] * al; b += img.px[i + 2] * al; a += al;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (a > 0) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); px[o + 3] = Math.min(255, Math.round(a)); }
    }
  }
  return { w: dw, h: dh, px };
}

// Kopieer een rechthoek van src naar dst
function blit(dst, dx, dy, src) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4, di = ((dy + y) * dst.w + dx + x) * 4;
      for (let k = 0; k < 4; k++) dst.px[di + k] = src.px[si + k];
    }
  }
}

// ---------- Stap 1: rotsen uitsnijden ----------
mkdirSync(OBJ_DIR, { recursive: true });

console.log('Lezen rotsspritegrid...');
const grid = readPng(ROTS_SRC);
const cellW = Math.floor(grid.w / 3), cellH = Math.floor(grid.h / 3);
console.log(`  ${grid.w}×${grid.h}, cel ${cellW}×${cellH}`);

const rocks = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    const idx = row * 3 + col + 1;
    const name = `rots-${String(idx).padStart(2, '0')}`;
    const sprite = resample(grid, col * cellW, row * cellH, cellW, cellH, ROTS_SIZE, ROTS_SIZE);
    // Donkere achtergrond transparant maken (zwart/bijna-zwart)
    for (let i = 0; i < sprite.w * sprite.h; i++) {
      const o = i * 4;
      const br = (sprite.px[o] + sprite.px[o + 1] + sprite.px[o + 2]) / 3;
      if (br < 25) { sprite.px[o] = sprite.px[o + 1] = sprite.px[o + 2] = sprite.px[o + 3] = 0; }
    }
    const path = `${OBJ_DIR}${name}.png`;
    writePng(path, sprite);
    rocks.push({ name, img: sprite });
    console.log(`  ${name}: ${ROTS_SIZE}×${ROTS_SIZE}`);
  }
}

// ---------- Stap 2: kraters kopiëren ----------
const craters = [];
for (let i = 1; i <= 4; i++) {
  const name = `krater-${String(i).padStart(2, '0')}`;
  const src = `${WOESTIJN_OBJ}${name}.png`;
  const dst = `${OBJ_DIR}${name}.png`;
  copyFileSync(src, dst);
  const img = readPng(dst);
  craters.push({ name, img });
  console.log(`  ${name}: ${img.w}×${img.h} (gekopieerd)`);
}

// ---------- Stap 3: atlas samenstellen ----------
// Indeling: rij 0 = 4 kraters (256×256), rij 1 = 9 rotsen (160×160)
const sprites = [...craters, ...rocks];
const atlasW = 1024 + PAD * 4;  // 4 kraters × 256 + tussenruimte
const atlasH = PAD + KRATER_SIZE + PAD + ROTS_SIZE + PAD;
// Eigenlijk: laten we precies uitrekenen
const row0W = craters.length * (KRATER_SIZE + PAD) + PAD;
const row1W = rocks.length * (ROTS_SIZE + PAD) + PAD;
const aw = Math.max(row0W, row1W);
const ah = PAD + KRATER_SIZE + PAD + ROTS_SIZE + PAD;

console.log(`\nAtlas: ${aw}×${ah}`);
const atlas = { w: aw, h: ah, px: new Uint8Array(aw * ah * 4) };

const frames = {};

// Rij 0: kraters
let cx = PAD;
for (const c of craters) {
  blit(atlas, cx, PAD, c.img);
  frames[c.name] = { x: cx, y: PAD, w: c.img.w, h: c.img.h };
  cx += c.img.w + PAD;
}

// Rij 1: rotsen
let rx = PAD;
const ry = PAD + KRATER_SIZE + PAD;
for (const r of rocks) {
  blit(atlas, rx, ry, r.img);
  frames[r.name] = { x: rx, y: ry, w: r.img.w, h: r.img.h };
  rx += r.img.w + PAD;
}

writePng(ATLAS_PNG, atlas);
console.log(`  ${ATLAS_PNG}`);

// JSON in PixiJS-formaat
const json = {
  frames: {},
  meta: { image: 'objects.png', format: 'RGBA8888', size: { w: aw, h: ah }, scale: '1' },
};
for (const [name, f] of Object.entries(frames)) {
  json.frames[name] = {
    frame: { x: f.x, y: f.y, w: f.w, h: f.h },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
    sourceSize: { w: f.w, h: f.h },
    anchor: { x: 0.5, y: 0.5 },
  };
}
writeFileSync(ATLAS_JSON, JSON.stringify(json, null, 1));
console.log(`  ${ATLAS_JSON}`);
console.log('Klaar!');
