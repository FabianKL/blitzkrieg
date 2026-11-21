// Verwijdert de achtergrondgloed van tankbronnen in input/tunneler-style/.
// Schrijft opgeschoonde versies naar input/tanks/ zodat maak-tanks.mjs ze kan verwerken.
//   node tools/schoon-achtergrond.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const JOBS = [
  { in: 'Neon Groene Tankonderdelen op Transparante Achtergrond.png', out: 'viper.png' },
  { in: 'Blauwe Tankonderdelen als Clipart.png', out: 'kobalt.png' },
];

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

// ---------- Achtergrond verwijderen ----------
// 1. Detecteer de bandgebieden (dichte rijen) in het origineel — die worden beschermd.
// 2. Flood fill vanuit de randen, maar NIET in beschermde gebieden.
// 3. Maak de rest transparant en ruim losse fragmenten op.
function clean(img) {
  const { w, h, px } = img;
  const N = w * h;

  // Stap 1: vind aaneengesloten gebieden met veel dekkende pixels (de banden)
  const rowOpaque = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 128) n++;
    rowOpaque[y] = n;
  }
  const bands = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && rowOpaque[y] > w * 0.1;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { bands.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  // bescherm banden die minstens 40 rijen hoog zijn (echte tankinhoud)
  const protBands = bands.filter(b => b.y1 - b.y0 >= 40);
  const isProtected = new Uint8Array(h);
  for (const b of protBands) for (let y = b.y0; y <= b.y1; y++) isProtected[y] = 1;
  console.log(`  ${protBands.length} beschermde banden:`, protBands.map(b => `y=${b.y0}-${b.y1} (h=${b.y1-b.y0+1})`).join(', '));

  // Stap 2: flood fill vanuit de randen, maar niet in beschermde rijen
  const visited = new Uint8Array(N);
  const isBg = new Uint8Array(N);
  const bgCheck = (idx) => {
    const a = px[idx * 4 + 3];
    if (a < 100) return true;
    const r = px[idx * 4], g = px[idx * 4 + 1], b = px[idx * 4 + 2];
    return (r + g + b) / 3 < 110;
  };

  const stack = new Int32Array(N);
  let sp = 0;
  for (let x = 0; x < w; x++) { stack[sp++] = x; stack[sp++] = (h - 1) * w + x; }
  for (let y = 1; y < h - 1; y++) { stack[sp++] = y * w; stack[sp++] = y * w + w - 1; }

  while (sp > 0) {
    const idx = stack[--sp];
    if (visited[idx]) continue;
    visited[idx] = 1;
    const y = (idx / w) | 0;
    if (isProtected[y]) continue;
    if (!bgCheck(idx)) continue;
    isBg[idx] = 1;
    const x = idx % w;
    if (x > 0 && !visited[idx - 1]) stack[sp++] = idx - 1;
    if (x < w - 1 && !visited[idx + 1]) stack[sp++] = idx + 1;
    if (y > 0 && !visited[idx - w]) stack[sp++] = idx - w;
    if (y < h - 1 && !visited[idx + w]) stack[sp++] = idx + w;
  }

  // Stap 3: achtergrondpixels en semi-transparante pixels buiten banden transparant maken
  for (let i = 0; i < N; i++) {
    const y = (i / w) | 0;
    if (isBg[i] || (!isProtected[y] && px[i * 4 + 3] < 128)) {
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = px[i * 4 + 3] = 0;
    }
  }

  let removed = 0;
  for (let i = 0; i < N; i++) if (px[i * 4 + 3] === 0) removed++;
  return removed;
}

// ---------- Hoofdprogramma ----------
for (const job of JOBS) {
  const inPath = `${ROOT}input/tunneler-style/${job.in}`;
  const outPath = `${ROOT}input/tanks/${job.out}`;
  if (!existsSync(inPath)) { console.log(`${job.in} ontbreekt, overgeslagen`); continue; }
  console.log(`Lezen: ${job.in}...`);
  const img = readPng(inPath);
  console.log(`  ${img.w}×${img.h}, opschonen...`);
  const removed = clean(img);
  console.log(`  ${removed} pixels verwijderd (${(removed / (img.w * img.h) * 100).toFixed(1)}%)`);
  writePng(outPath, img);
  console.log(`  Geschreven: ${job.out}`);
}
