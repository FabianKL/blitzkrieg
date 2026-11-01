// Maakt brugsprites uit de bronafbeeldingen in input/bridges/. Elke intacte afbeelding bevat drie
// segmenten naast elkaar (begin, midden, eind); een wrakafbeelding is één stuk. Per type (hout/staal)
// en stijl (zomer/winter) komen de delen in public/assets/<stijl>/bridges/<soort>-<deel>.png, en
// manifest.json wordt bijgewerkt. Alleen Node (zlib), geen beeldbibliotheek.
//   node tools/maak-bruggen.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const IN = `${ROOT}input/bridges/`;
const OUT = `${ROOT}public/assets/`;
const MANIFEST = `${ROOT}public/assets/manifest.json`;

const SOURCES = [
  { file: 'Houten brugsegmenten met mos en aarde.png', style: 'zomer', kind: 'hout', type: 'intact' },
  { file: 'Beschadigde houten brug met kloof.png', style: 'zomer', kind: 'hout', type: 'wrak' },
  { file: 'houten brugtegels met sneeuw.png', style: 'winter', kind: 'hout', type: 'intact' },
  { file: 'Beschadigde besneeuwde houten brug.png', style: 'winter', kind: 'hout', type: 'wrak' },
  { file: 'Stalen trussbrug wegtegels.png', style: 'zomer', kind: 'staal', type: 'intact' },
  { file: 'Vernietigde stalen trussbrug.png', style: 'zomer', kind: 'staal', type: 'wrak' },
  { file: 'Sneeuwbedekte stalen brugsegmenten.png', style: 'winter', kind: 'staal', type: 'intact' },
  { file: 'Beschadigde winterbrug met ingestort midden.png', style: 'winter', kind: 'staal', type: 'wrak' },
];

// ---------- PNG lezen en schrijven (8 bit RGBA of RGB, niet interlaced) ----------
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

// ---------- Segmenten vinden: aaneengesloten groepen niet-transparante kolommen ----------
function findSegments(img) {
  // per kolom: hoeveel pixels zijn dekkend?
  const colCount = new Uint32Array(img.w);
  for (let x = 0; x < img.w; x++) {
    let n = 0;
    for (let y = 0; y < img.h; y++) if (img.px[(y * img.w + x) * 4 + 3] > 32) n++;
    colCount[x] = n;
  }
  // een kolom is "leeg" als minder dan 2% van de pixels dekkend is
  const threshold = img.h * 0.02;
  const segments = [];
  let start = -1;
  for (let x = 0; x <= img.w; x++) {
    const empty = x === img.w || colCount[x] < threshold;
    if (!empty && start < 0) start = x;
    if (empty && start >= 0) {
      if (x - start > 20) segments.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  // verticale grenzen per segment
  for (const seg of segments) {
    seg.y0 = img.h; seg.y1 = 0;
    for (let y = 0; y < img.h; y++) {
      for (let x = seg.x0; x <= seg.x1; x++) {
        if (img.px[(y * img.w + x) * 4 + 3] > 32) { seg.y0 = Math.min(seg.y0, y); seg.y1 = Math.max(seg.y1, y); break; }
      }
    }
  }
  return segments;
}

// ---------- Rechthoekig stuk uit een afbeelding knippen ----------
function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const si = ((y + y0) * img.w + x0) * 4, di = y * w * 4;
    px.set(img.px.subarray(si, si + w * 4), di);
  }
  return { w, h, px };
}

// ---------- Hoofdprogramma ----------
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// steen-entries uit het manifest verwijderen
for (const key of Object.keys(manifest.files)) {
  if (key.includes('/bridges/steen-')) delete manifest.files[key];
}

for (const src of SOURCES) {
  const path = IN + src.file;
  if (!existsSync(path)) { console.log(`${src.file} ontbreekt, overgeslagen`); continue; }
  console.log(`\n${src.file}`);
  const img = readPng(path);
  const dir = `${OUT}${src.style}/bridges/`;
  mkdirSync(dir, { recursive: true });

  if (src.type === 'intact') {
    const segments = findSegments(img);
    if (segments.length !== 3) throw new Error(`  ${segments.length} segmenten gevonden, 3 verwacht`);
    const names = ['begin', 'midden', 'eind'];
    for (let i = 0; i < 3; i++) {
      const seg = segments[i], cropped = crop(img, seg.x0, seg.y0, seg.x1, seg.y1);
      const key = `${src.style}/bridges/${src.kind}-${names[i]}.png`;
      writePng(`${OUT}${key}`, cropped);
      manifest.files[key] = [cropped.w, cropped.h];
      console.log(`  ${src.kind}-${names[i]}: ${cropped.w}×${cropped.h}`);
    }
  } else {
    // wrak: één stuk, mogelijk met gat in het midden → totale bounding box
    const segments = findSegments(img);
    if (!segments.length) throw new Error('  geen inhoud gevonden');
    const x0 = Math.min(...segments.map((s) => s.x0));
    const x1 = Math.max(...segments.map((s) => s.x1));
    const y0 = Math.min(...segments.map((s) => s.y0));
    const y1 = Math.max(...segments.map((s) => s.y1));
    const cropped = crop(img, x0, y0, x1, y1);
    const key = `${src.style}/bridges/${src.kind}-wrak.png`;
    writePng(`${OUT}${key}`, cropped);
    manifest.files[key] = [cropped.w, cropped.h];
    console.log(`  ${src.kind}-wrak: ${cropped.w}×${cropped.h}`);
  }
}

// oude steen-bestanden van schijf verwijderen
for (const style of ['zomer', 'winter']) {
  const dir = `${OUT}${style}/bridges/`;
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (f.startsWith('steen-')) { unlinkSync(dir + f); console.log(`\nVerwijderd: ${style}/bridges/${f}`); }
  }
}

// deckHeightPx bijwerken: de hoogte van het midden-segment bepaalt de schaal
const midH = manifest.files['zomer/bridges/hout-midden.png']?.[1] || manifest.files['winter/bridges/hout-midden.png']?.[1] || 384;
manifest.bridges.deckHeightPx = midH;

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log('\nmanifest.json bijgewerkt');
