// Maakt de tanksprites uit de bronvellen in input/tanks/ (docs/SPEC-tanks.md §2). Elk vel heeft
// drie banden onder elkaar: de complete tank, de romp zonder rupsen (zelfde schaal) en een
// rupsstrook. Per tank komt in public/assets/tanks/<naam>/: tank.png, romp.png, rups.png en
// tank.json, en manifest.json wordt bijgewerkt. Alleen Node (zlib), geen beeldbibliotheek.
//   node tools/maak-tanks.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const IN = `${ROOT}input/tanks/`, OUT = `${ROOT}public/assets/tanks/`, MANIFEST = `${ROOT}public/assets/manifest.json`;
const PX = 32, CANVAS = 448, TRACK_LEN = 7.6; // px per cel, canvas, lengte van de rupsen in cellen
const SOURCES = [
  { file: 'Landsverk.png', name: 'landsverk', title: 'LANDSVERK L-60', nation: 'NL' },
  { file: 't34.png', name: 't34', title: 'T-34/76', nation: 'SU' },
  { file: 'panter.png', name: 'panther', title: 'PANTHER', nation: 'DE' },
  { file: 'sherman.png', name: 'sherman', title: 'M4A1 SHERMAN', nation: 'US' },
  { file: 'comet.png', name: 'comet', title: 'A34 COMET', nation: 'UK' },
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
    const o = y * (w * 4 + 1); // filter "sub": kleiner bestand dan geen filter
    raw[o] = 1;
    for (let x = 0; x < w * 4; x++) raw[o + 1 + x] = (px[y * w * 4 + x] - (x >= 4 ? px[y * w * 4 + x - 4] : 0)) & 255;
  }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

const alpha = (img, x, y) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.px[(y * img.w + x) * 4 + 3]);

// Banden: aaneengesloten rijen met dekkende pixels, van boven naar onder
function bands(img) {
  const out = [];
  let start = -1;
  for (let y = 0; y <= img.h; y++) {
    let on = false;
    if (y < img.h) for (let x = 0; x < img.w && !on; x += 2) on = alpha(img, x, y) > 128;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start > 40) out.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  for (const b of out) {
    b.x0 = img.w; b.x1 = 0;
    for (let y = b.y0; y <= b.y1; y++) for (let x = 0; x < img.w; x++) if (alpha(img, x, y) > 128) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); }
  }
  return out;
}

// Verschuiving (dx, dy) waarmee de romp het best op de complete tank valt: kleinste kleurverschil
// waar beide dekkend zijn
function align(img, tank, romp) {
  let best = { score: Infinity };
  const cy = Math.round((tank.y0 + tank.y1) / 2 - (romp.y0 + romp.y1) / 2);
  for (let dy = cy - 40; dy <= cy + 40; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      let sum = 0, n = 0;
      for (let y = romp.y0; y <= romp.y1; y += 3) {
        for (let x = romp.x0; x <= romp.x1; x += 3) {
          const tx = x + dx, ty = y + dy;
          if (ty < tank.y0 || ty > tank.y1 || alpha(img, x, y) < 220 || alpha(img, tx, ty) < 220) continue;
          const a = (y * img.w + x) * 4, b = (ty * img.w + tx) * 4;
          sum += Math.abs(img.px[a] - img.px[b]) + Math.abs(img.px[a + 1] - img.px[b + 1]) + Math.abs(img.px[a + 2] - img.px[b + 2]);
          n++;
        }
      }
      if (n > 2000 && sum / n < best.score) best = { score: sum / n, dx, dy };
    }
  }
  return best;
}

// Rupsen: dekkend in de complete tank, niet in de (verschoven) romp. Twee groepen rijen boven en
// onder het midden; per groep middenlijn, breedte en begin/eind (in bronpixels)
function measureTracks(img, tank, shift) {
  const isTrack = (x, y) => alpha(img, x, y) > 128 && alpha(img, x - shift.dx, y - shift.dy) < 64;
  const mid = (tank.y0 + tank.y1) / 2, out = [];
  for (const [ya, yb] of [[tank.y0, Math.floor(mid)], [Math.ceil(mid), tank.y1]]) {
    const rows = [];
    for (let y = ya; y <= yb; y++) { let n = 0; for (let x = tank.x0; x <= tank.x1; x++) n += isTrack(x, y); rows.push([y, n]); }
    const max = Math.max(...rows.map((r) => r[1])), on = rows.filter((r) => r[1] > max * 0.3).map((r) => r[0]);
    const y0 = Math.min(...on), y1 = Math.max(...on), cols = [];
    for (let x = tank.x0; x <= tank.x1; x++) { let n = 0; for (let y = y0; y <= y1; y++) n += isTrack(x, y); cols.push([x, n]); }
    const cmax = Math.max(...cols.map((c) => c[1])), con = cols.filter((c) => c[1] > cmax * 0.25).map((c) => c[0]);
    out.push({ y0, y1, x0: Math.min(...con), x1: Math.max(...con) + 1 });
  }
  return out;
}

// Verkleinen met vlakgemiddelde (voorvermenigvuldigd met alpha): bronpixel (sx0 + ox / sxs,
// sy0 + oy / sys) wordt doelpixel (ox, oy). Buiten de bron (of buiten clip) is transparant.
function resample(img, sx0, sy0, sxs, sys, w, h, clip) {
  const weights = (o0, scale, n, lo, hi) => {
    const out = [];
    for (let o = 0; o < n; o++) {
      const a = o0 + o / scale, b = o0 + (o + 1) / scale, list = [];
      for (let s = Math.floor(a); s < Math.ceil(b); s++) {
        if (s < lo || s > hi) continue;
        const wgt = Math.min(b, s + 1) - Math.max(a, s);
        if (wgt > 0) list.push([s, wgt * scale]);
      }
      out.push(list);
    }
    return out;
  };
  const wx = weights(sx0, sxs, w, clip.x0, clip.x1), wy = weights(sy0, sys, h, clip.y0, clip.y1);
  const px = new Uint8Array(w * h * 4);
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [sy, fy] of wy[oy]) for (const [sx, fx] of wx[ox]) {
        const i = (sy * img.w + sx) * 4, f = fx * fy, al = img.px[i + 3] * f;
        r += img.px[i] * al; g += img.px[i + 1] * al; b += img.px[i + 2] * al; a += al;
      }
      const o = (oy * w + ox) * 4;
      if (a > 0) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); px[o + 3] = Math.min(255, Math.round(a)); }
    }
  }
  return { w, h, px };
}

// Periode van de rupsstrook (in bronpixels, met breuk): autocorrelatie van de helderheid per
// kolom, eerst de kleinste goede verschuiving, dan verfijnd over zoveel mogelijk schakels
function stripPeriod(img, b) {
  const prof = [];
  for (let x = b.x0; x <= b.x1; x++) {
    let s = 0;
    for (let y = b.y0; y <= b.y1; y++) { const i = (y * img.w + x) * 4; s += (img.px[i] + img.px[i + 1] + img.px[i + 2]) * img.px[i + 3] / 255; }
    prof.push(s / (b.y1 - b.y0 + 1));
  }
  const n = prof.length, m = n / 2 | 0, lo = Math.floor(n * 0.1), hi = n - lo;
  const corr = (lag) => { // correlatie tussen [lo, hi - lag) en [lo + lag, hi), mag een breuk zijn
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, k = 0;
    for (let x = lo; x + lag < hi - 1; x++) {
      const p = x + lag, f = p - Math.floor(p), v = prof[Math.floor(p)] * (1 - f) + prof[Math.floor(p) + 1] * f, u = prof[x];
      sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v; k++;
    }
    const cov = sab / k - (sa / k) * (sb / k);
    return cov / Math.sqrt((saa / k - (sa / k) ** 2) * (sbb / k - (sb / k) ** 2) || 1);
  };
  const c = []; for (let lag = 20; lag < m; lag++) c[lag] = corr(lag);
  const top = Math.max(...c.filter(Number.isFinite));
  let p = 20; while (!(c[p] > top * 0.85 && c[p] >= c[p - 1] && c[p] >= c[p + 1])) p++;
  const k = Math.floor((hi - lo) * 0.6 / p); // zoveel schakels verder: periode nauwkeuriger
  let best = [k * p, -Infinity];
  for (let lag = k * p - k; lag <= k * p + k; lag += 0.05) { const v = corr(lag); if (v > best[1]) best = [lag, v]; }
  return best[0] / k;
}

const round = (v) => Math.round(v * 100) / 100;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
for (const src of SOURCES) {
  if (!existsSync(IN + src.file)) { console.log(`${src.file} ontbreekt, overgeslagen`); continue; }
  const img = readPng(IN + src.file), b = bands(img);
  if (b.length !== 3) throw new Error(`${src.file}: ${b.length} banden in plaats van 3`);
  const [tank, romp, strip] = b, shift = align(img, tank, romp), seen = measureTracks(img, tank, shift);
  // de strook staat op dezelfde schaal als de tank: zijn hoogte is de volle breedte van een rups
  // (in de tank valt de binnenkant onder de romp); de buitenrand is wat je in de tank ziet
  const width = strip.y1 - strip.y0 + 1;
  const tracks = [{ ...seen[0], y0: seen[0].y0, y1: seen[0].y0 + width - 1 }, { ...seen[1], y0: seen[1].y1 - width + 1, y1: seen[1].y1 }];
  // schaal: rupsen TRACK_LEN cellen lang; draaipunt = midden van de rupsen
  const len = (tracks[0].x1 - tracks[0].x0 + tracks[1].x1 - tracks[1].x0) / 2, s = (TRACK_LEN * PX) / len;
  const cx = (tracks[0].x0 + tracks[0].x1 + tracks[1].x0 + tracks[1].x1) / 4;
  const cy = ((tracks[0].y0 + tracks[0].y1 + 1) / 2 + (tracks[1].y0 + tracks[1].y1 + 1) / 2) / 2;
  const x0 = cx - CANVAS / 2 / s, y0 = cy - CANVAS / 2 / s;
  const dir = `${OUT}${src.name}/`;
  mkdirSync(dir, { recursive: true });
  writePng(dir + 'tank.png', resample(img, x0, y0, s, s, CANVAS, CANVAS, tank));
  writePng(dir + 'romp.png', resample(img, x0 - shift.dx, y0 - shift.dy, s, s, CANVAS, CANVAS, romp));
  // rupsstrook: middendeel (zonder afgeronde uiteinden), een geheel aantal schakels; de lengte
  // iets bijgesteld tot hele pixels per schakel
  const period = stripPeriod(img, strip), linkPx = Math.max(4, Math.round(period * s)), links = Math.max(1, Math.floor((strip.x1 - strip.x0) * 0.7 / period));
  const start = (strip.x0 + strip.x1) / 2 - (links * period) / 2, stripH = Math.round(width * s);
  writePng(dir + 'rups.png', resample(img, start, strip.y0, linkPx / period, stripH / width, links * linkPx, stripH, strip));
  const cell = (v) => round(v * s / PX);
  const json = {
    name: src.title, nation: src.nation,
    tracks: tracks.map((t) => ({ y: cell((t.y0 + t.y1 + 1) / 2 - cy), width: cell(t.y1 - t.y0 + 1), x0: cell(t.x0 - cx), x1: cell(t.x1 - cx) })),
    linkCells: round(linkPx / PX),
  };
  writeFileSync(dir + 'tank.json', JSON.stringify(json, null, 1) + '\n');
  for (const f of ['tank.png', 'romp.png']) manifest.files[`tanks/${src.name}/${f}`] = [CANVAS, CANVAS];
  manifest.files[`tanks/${src.name}/rups.png`] = [links * linkPx, stripH];
  manifest.files[`tanks/${src.name}/tank.json`] = 'json';
  console.log(`${src.name}: romp verschoven ${shift.dx},${shift.dy} (verschil ${shift.score.toFixed(1)}), schaal ${s.toFixed(3)}, schakel ${period.toFixed(1)} px`, JSON.stringify(json.tracks), json.linkCells);
}
// tanks die niet (meer) op schijf staan, uit het manifest
for (const k of Object.keys(manifest.files)) if (k.startsWith('tanks/') && !existsSync(`${ROOT}public/assets/${k}`)) delete manifest.files[k];
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
