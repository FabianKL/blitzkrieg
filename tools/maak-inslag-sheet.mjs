// Maakt de artillerie-inslagspritesheet uit de bronafbeelding in input/effects/.
// Leest de bron-PNG, detecteert de 16 frames (4 banden × 4 kolommen), centreert elk
// in een 320×320 cel en schrijft een schone 1280×1280 sheet + PixiJS-JSON.
//   node tools/maak-inslag-sheet.mjs [input/effects/artillerie-inslag-bron.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = process.argv[2] || `${ROOT}input/effects/artillerie-inslag-bron.png`;
const OUT_PNG = `${ROOT}public/assets/effects/artillerie-inslag.png`;
const OUT_JSON = `${ROOT}public/assets/effects/artillerie-inslag.json`;
const NAME = 'artillerie-inslag';
const CELL = 320, COLS = 4, ROWS = 4, MIN_SIZE = 50;

// ---------- PNG lezen / schrijven (8 bit RGBA of RGB, niet interlaced) ----------
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
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] += a;
      else if (f === 2) line[x] += b;
      else if (f === 3) line[x] += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
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

// ---------- Frame-detectie ----------
const img = readPng(SRC);
console.log(`Bron: ${img.w}×${img.h}`);
const alpha = (x, y) => (x >= 0 && y >= 0 && x < img.w && y < img.h ? img.px[(y * img.w + x) * 4 + 3] : 0);

// Horizontale banden: aaneengesloten rijen met dekkende pixels
function findBands() {
  const out = [];
  let start = -1;
  for (let y = 0; y <= img.h; y++) {
    let on = false;
    if (y < img.h) for (let x = 0; x < img.w && !on; x++) on = alpha(x, y) > 10;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start > MIN_SIZE) out.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  return out;
}

// Per band: verticale kolommen met dekkende pixels
function findCols(band) {
  const out = [];
  let cs = -1;
  for (let x = 0; x <= img.w; x++) {
    let on = false;
    if (x < img.w) for (let y = band.y0; y <= band.y1 && !on; y++) on = alpha(x, y) > 10;
    if (on && cs < 0) cs = x;
    if (!on && cs >= 0) { if (x - cs > MIN_SIZE) out.push({ x0: cs, x1: x - 1 }); cs = -1; }
  }
  return out;
}

// Strakke begrenzingsdoos per frame
function tightBox(x0, y0, x1, y1) {
  let tx0 = x1, ty0 = y1, tx1 = x0, ty1 = y0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (alpha(x, y) > 10) { tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y); }
  }
  return { x0: tx0, y0: ty0, x1: tx1, y1: ty1, w: tx1 - tx0 + 1, h: ty1 - ty0 + 1 };
}

const bands = findBands();
const frames = [];
for (const band of bands) {
  const cols = findCols(band);
  for (const col of cols) {
    frames.push(tightBox(col.x0, band.y0, col.x1, band.y1));
  }
}
console.log(`${frames.length} frames gevonden`);
if (frames.length !== COLS * ROWS) {
  console.log('Verwacht:', COLS * ROWS, '— aanpassen als nodig');
  for (const f of frames) console.log(`  ${f.x0},${f.y0} ${f.w}×${f.h}`);
}

// ---------- Spritesheet samenstellen ----------
const outW = COLS * CELL, outH = ROWS * CELL;
const out = { w: outW, h: outH, px: new Uint8Array(outW * outH * 4) };

for (let k = 0; k < frames.length && k < COLS * ROWS; k++) {
  const f = frames[k];
  const col = k % COLS, row = Math.floor(k / COLS);
  const cx = col * CELL + Math.floor((CELL - f.w) / 2);
  const cy = row * CELL + Math.floor((CELL - f.h) / 2);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const si = ((f.y0 + y) * img.w + (f.x0 + x)) * 4;
      const di = ((cy + y) * outW + (cx + x)) * 4;
      out.px[di] = img.px[si]; out.px[di + 1] = img.px[si + 1];
      out.px[di + 2] = img.px[si + 2]; out.px[di + 3] = img.px[si + 3];
    }
  }
}

writePng(OUT_PNG, out);
console.log(`Geschreven: ${OUT_PNG} (${outW}×${outH})`);

// ---------- JSON-descriptor ----------
const jsonFrames = {};
const animNames = [];
for (let k = 0; k < Math.min(frames.length, COLS * ROWS); k++) {
  const id = `${NAME}-${String(k).padStart(2, '0')}`;
  animNames.push(id);
  jsonFrames[id] = {
    frame: { x: (k % COLS) * CELL, y: Math.floor(k / COLS) * CELL, w: CELL, h: CELL },
    rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: CELL, h: CELL },
    sourceSize: { w: CELL, h: CELL },
    anchor: { x: 0.5, y: 0.5 },
  };
}
const json = {
  frames: jsonFrames,
  animations: { [NAME]: animNames },
  meta: { image: `${NAME}.png`, format: 'RGBA8888', size: { w: outW, h: outH }, scale: '1' },
};
writeFileSync(OUT_JSON, JSON.stringify(json, null, 1));
console.log(`Geschreven: ${OUT_JSON}`);
