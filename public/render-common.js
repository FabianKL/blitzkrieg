// Gedeeld door de gedetailleerde weergaves (1944, 1943, 1942): hulpjes, kaartschilder,
// camera, deeltjes en schermmeldingen. Elke weergave levert alleen zijn eigen stijl.
import * as G from '/shared/game.js';
import { trackMix, eraserInfo } from '/shared/client-sim.js';

export { trackMix, eraserInfo };

// ---------- Kleuren en ruis ----------
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const toHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const shade = (hex, k) => toHex(rgb(hex).map((v) => v * k));
export const mix = (hex, other, k) => { const a = rgb(hex), b = rgb(other); return toHex(a.map((v, i) => v + (b[i] - v) * k)); };

export function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export const h01 = (x, y) => hash(x, y) / 4294967296;

// Zachte ruis voor grote vlekken
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = h01(xi, yi), b = h01(xi + 1, yi), c = h01(xi, yi + 1), d = h01(xi + 1, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

// ---------- Kaart ----------
export const cellAt = (map, x, y) => (G.inBounds(x, y) ? map[y * G.W + x] : G.ROCK);

// ---------- Terrein en sporen ----------
// Cel zoals de weergave hem ziet: een vage tunnel (spoor onder de helft) krijgt geen
// randjes bij de buren, anders tekent een dun spoor op harde grond toch een dikke tunnel.
export function seenCell(game, x, y) {
  const c = cellAt(game.map, x, y);
  return c === G.EMPTY && trackMix(game, y * G.W + x) < 0.5 ? G.DIRT : c;
}

// Water en begroeiing met afgeronde randen, net als rots: per pixel kijken of het vervaagde
// veld boven de drempel komt. Valt een pixel van een water/plantcel erbuiten, dan neemt hij
// het terrein van de buurcel aan die kant. fields = {water, veg} uit obstacleFields().
export function obstacleFields(map) {
  return { water: blurField(map, (c) => c === G.WATER), veg: blurField(map, (c) => c === G.VEG) };
}

// Een plant is omgegaan (e.box = rechthoek van zijn cellen, zie client-sim): alleen daar het
// plantveld bijwerken en de cellen opnieuw schilderen waarvan de ronde rand verandert.
export function plantFelled(fields, map, painter, box) {
  const [x0, y0, x1, y1] = box;
  blurField(map, (c) => c === G.VEG, fields.veg, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
  painter.markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
}
const isObstacle = (c) => c === G.ROCK || c === G.WATER || c === G.VEG;
export function createObstacleSampler(R) {
  const water = createFieldSampler(R), veg = createFieldSampler(R);
  let own, nT, nB, nL, nR;
  return {
    water, veg,
    load(fields, x, y, cell, t, b, l, r) {
      water.load(fields.water, x, y, 0); veg.load(fields.veg, x, y, 0);
      own = cell; nT = t; nB = b; nL = l; nR = r;
    },
    // celtype voor pixel (u, v) binnen de cel, gegeven wat er tot nu toe gekozen is (c)
    pick(u, v, c) {
      if (c === G.ROCK) return c;
      if (water.sample(u, v) >= (own === G.WATER ? 0.34 : 0.5)) return G.WATER;
      if (veg.sample(u, v) >= (own === G.VEG ? 0.34 : 0.5)) return G.VEG;
      if (c === G.WATER || c === G.VEG) {
        const side = u < R / 2 ? nL : nR, vert = v < R / 2 ? nT : nB;
        return !isObstacle(side) ? side : !isObstacle(vert) ? vert : G.DIRT;
      }
      return c;
    },
  };
}

// Puin/stronken in het permanente gat van een weggeschoten plant (h = pixelhash)
export const isDebris = (game, i, h) => game.world?.scar[i] === 1 && (h >>> 8) % 100 < 24;

// ---------- Sporenwisser (storm) ----------
// Waas en waaiende strepen over het hele beeld zolang hij woedt, en een melding bovenin
// (waarschuwing vooraf, aftellen tijdens). style: {name, haze, hazeAlpha, streak, banner}.
export function drawEraser(ctx, canvas, info, now, style) {
  if (!info || (!info.active && !info.warn)) return;
  const W = canvas.width, H = canvas.height, s = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (info.active) {
    ctx.fillStyle = `rgba(${style.haze}, ${style.hazeAlpha})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(${style.streak}, 0.45)`;
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const speed = 0.35 + (i % 7) * 0.08, len = (18 + (i % 5) * 14) * s;
      const x = ((i * 137.3 + now * speed * s) % (W + 200 * s)) - 100 * s;
      const y = ((i * 71.9) % 100) / 100 * H + Math.sin(now / 900 + i) * 12 * s;
      ctx.lineWidth = (1 + (i % 3)) * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + len * 0.18); ctx.stroke();
    }
  }
  if (style.banner === false) return;
  const name = style.name || info.label.toUpperCase();
  const txt = info.active ? `${name} — NOG ${info.secs} S` : `${name} OVER ${info.secs} S`;
  if (!info.active && Math.floor(now / 400) % 2) return; // knipperen tijdens de waarschuwing
  ctx.font = `bold ${14 * s}px monospace`;
  const tw = ctx.measureText(txt).width, pad = 10 * s;
  ctx.fillStyle = 'rgba(20, 14, 10, 0.78)';
  ctx.fillRect((W - tw) / 2 - pad, 12 * s, tw + pad * 2, 26 * s);
  ctx.fillStyle = info.active ? '#ffd27a' : '#ff8a5a';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, (W - tw) / 2, 25 * s);
  ctx.textBaseline = 'alphabetic';
}

// Pixel van een tunnelcel: tunnelkleur of toch terrein? Hoe vager het spoor, hoe meer
// pixels terrein blijven (h = pixelhash, mix = trackMix van de cel).
export const showsTunnel = (h, mix) => ((h >>> 20) & 1023) / 1023 < mix;

// Bases opzoeken (muurcellen per speler); bases[i] = {i, x0, y0, x1, y1, d0, d1, dc}
export function findBases(map) {
  const bases = [];
  for (let i = 0; i < G.MAX_PLAYERS; i++) {
    let x0 = G.W, y0 = G.H, x1 = -1, y1 = -1;
    for (let y = 0; y < G.H; y++) {
      for (let x = 0; x < G.W; x++) {
        if (map[y * G.W + x] !== G.WALL + i) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) continue;
    let d0 = -1, d1 = -1;
    for (let x = x0; x <= x1; x++) {
      if (map[y0 * G.W + x] === G.BASE + i) { if (d0 < 0) d0 = x; d1 = x; }
    }
    bases[i] = { i, x0, y0, x1, y1, d0, d1, dc: (d0 + d1 + 1) / 2 };
  }
  return bases;
}

// Vervaagd veld (3x3 gemiddelde) van cellen die aan test() voldoen: voor gladde randen
// Met f en een rechthoek (box = [x0, y0, x1, y1]) wordt alleen dat stuk van f bijgewerkt.
export function blurField(map, test, f = new Float32Array(G.W * G.H), box = [0, 0, G.W - 1, G.H - 1]) {
  for (let y = Math.max(0, box[1]); y <= Math.min(G.H - 1, box[3]); y++) {
    for (let x = Math.max(0, box[0]); x <= Math.min(G.W - 1, box[2]); x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += test(cellAt(map, x + i, y + j), x + i, y + j) ? 1 : 0;
      f[y * G.W + x] = s / 9;
    }
  }
  return f;
}

// Bilineair gemengde waarde van een veld rond cel (x, y) op subpixel (u, v); voor ronde randen.
// Vul eerst load(field, x, y) aan, daarna sample(u, v) per pixel.
export function createFieldSampler(R) {
  const k = new Float32Array(9);
  return {
    load(field, x, y, outside = 1) {
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const nx = x + i, ny = y + j;
          k[(j + 1) * 3 + i + 1] = G.inBounds(nx, ny) ? field[ny * G.W + nx] : outside;
        }
      }
    },
    sample(u, v) {
      const fx = (u + 0.5) / R - 0.5, fy = (v + 0.5) / R - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
      const a = k[(j0 + 1) * 3 + i0 + 1], b = k[(j0 + 1) * 3 + i0 + 2];
      const c = k[(j0 + 2) * 3 + i0 + 1], d = k[(j0 + 2) * 3 + i0 + 2];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
  };
}

// ---------- Tegelcanvassen ----------
// Een kaartlaag in losse canvassen van TILE x TILE cellen (TP pixels per zijde). Eén groot
// canvas kan op een grote kaart niet als textuur naar de videokaart (te groot), en zo hoeft
// bij een wijziging alleen die ene tegel opnieuw geüpload te worden.
export const TILE = 32;
export function createTileCanvases(R) {
  const TP = TILE * R, TILES_X = Math.ceil(G.W / TILE), TILES_Y = Math.ceil(G.H / TILE);
  const list = new Array(TILES_X * TILES_Y).fill(null);
  const changed = new Set(); // tegels die sinds de laatste takeChanged() veranderd zijn
  return {
    TP, TILES_X, TILES_Y, list, changed,
    // canvas van tegel t (wordt gemaakt als hij er nog niet is)
    get(t) {
      if (!list[t]) {
        const c = list[t] = document.createElement('canvas');
        c.width = c.height = TP;
      }
      return list[t];
    },
    touch(t) { changed.add(t); },
    takeChanged() { const out = [...changed]; changed.clear(); return out; },
    reset() { list.fill(null); changed.clear(); },
    // Stuk van de laag (in cellen) tekenen op een gewoon canvas (legenda, minikaart)
    drawRegion(g, sx, sy, sw, sh, dx, dy, dw, dh) {
      const kx = dw / sw, ky = dh / sh;
      for (let ty = Math.floor(sy / TILE); ty <= Math.floor((sy + sh - 1e-6) / TILE); ty++) {
        for (let tx = Math.floor(sx / TILE); tx <= Math.floor((sx + sw - 1e-6) / TILE); tx++) {
          const c = list[ty * TILES_X + tx];
          if (!c || tx >= TILES_X || ty >= TILES_Y) continue;
          const x0 = Math.max(sx, tx * TILE), y0 = Math.max(sy, ty * TILE);
          const x1 = Math.min(sx + sw, (tx + 1) * TILE), y1 = Math.min(sy + sh, (ty + 1) * TILE);
          g.drawImage(c, (x0 - tx * TILE) * R, (y0 - ty * TILE) * R, (x1 - x0) * R, (y1 - y0) * R,
            dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
        }
      }
    },
  };
}

// ---------- Kaartschilder ----------
// Tegels van 32x32 cellen met R pixels per cel, elk een eigen canvas (createTileCanvases).
// - Een tegel wordt pas geschilderd als hij (bijna) in beeld komt: snel instappen.
// - Bij graven worden alleen de geraakte cellen en hun buren opnieuw geschilderd.
// - cache(slot, X, Y, fn) onthoudt dure pixelkleuren (ruis), zodat opnieuw schilderen
//   alleen nog opzoeken is. fn(X, Y) geeft een kleur terug als 0xRRGGBB.
// - Pixels en kleurgeheugen bestaan per tegel en alleen voor de MAX_TILES tegels die het
//   laatst in beeld waren. Een opgeruimde tegel houdt zijn canvas; verandert er iets in, dan
//   wordt hij helemaal opnieuw geschilderd zodra hij weer in beeld komt.
// paintCell(x, y, setPx) schildert één cel; afterTile(tx, ty, setPx) mag er iets overheen zetten.
// Gemaakt voor de kaartmaat van dat moment (G.W x G.H): bij een andere kaartgrootte een nieuwe.
// ruim twee schermen vol; met ?tiles=8 in de adresbalk kun je het opruimen testen
const MAX_TILES = Number(new URLSearchParams(location.search).get('tiles')) || 48;
const UNPAINTED = 0, LIVE = 1, PARKED = 2; // PARKED: canvas bestaat, maar zonder pixels in het geheugen

export function createMapPainter({ R, paintCell, afterTile, skipRepaint }) {
  const layer = createTileCanvases(R);
  const { TP, TILES_X, TILES_Y } = layer;
  const state = new Uint8Array(TILES_X * TILES_Y);
  const tiles = new Array(TILES_X * TILES_Y).fill(null); // {img, caches, used}
  const dirtyCells = new Set();
  const dirtyTiles = new Set();
  let live = 0, clock = 0;

  // De tegel waar pixel (X, Y) in valt; onthoudt de laatste, want een cel ligt in één tegel
  let curT = -1, cur = null;
  const tileAt = (X, Y) => {
    const t = ((Y / TP) | 0) * TILES_X + ((X / TP) | 0);
    if (t !== curT) {
      curT = t;
      cur = tiles[t];
      if (!cur) { cur = tiles[t] = { img: new ImageData(TP, TP), caches: [], used: clock }; live++; }
    }
    return cur;
  };
  const setPx = (X, Y, r, g, b) => {
    const d = tileAt(X, Y).img.data, i = ((Y % TP) * TP + (X % TP)) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };
  const putTile = (t) => { layer.get(t).getContext('2d').putImageData(tiles[t].img, 0, 0); layer.touch(t); };
  function paintTile(tx, ty) {
    for (let y = ty * TILE; y < Math.min(G.H, (ty + 1) * TILE); y++) {
      for (let x = tx * TILE; x < Math.min(G.W, (tx + 1) * TILE); x++) paintCell(x, y, setPx);
    }
    afterTile?.(tx, ty, setPx);
    state[ty * TILES_X + tx] = LIVE;
    putTile(ty * TILES_X + tx);
  }
  // Te veel tegels in het geheugen: de langst niet geziene opruimen (niet die nu in beeld zijn)
  function evict() {
    while (live > MAX_TILES) {
      let old = -1;
      for (let t = 0; t < tiles.length; t++) if (tiles[t] && tiles[t].used < clock && (old < 0 || tiles[t].used < tiles[old].used)) old = t;
      if (old < 0) return;
      tiles[old] = null;
      state[old] = PARKED;
      live--;
      if (curT === old) curT = -1;
    }
  }

  return {
    layer,
    // Nieuwe kaart: alles vergeten
    reset() {
      state.fill(UNPAINTED);
      tiles.fill(null);
      live = 0; curT = -1;
      dirtyCells.clear();
      layer.reset();
    },
    // Cel is veranderd: hem en zijn buren (randjes) opnieuw schilderen
    markDig(x, y) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (G.inBounds(nx, ny)) dirtyCells.add(ny * G.W + nx);
      }
    },
    // Alle cellen in een rechthoek opnieuw schilderen (bv. rond een omgeschoten plant)
    markRect(x0, y0, x1, y1) {
      for (let y = Math.max(0, y0); y <= Math.min(G.H - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(G.W - 1, x1); x++) dirtyCells.add(y * G.W + x);
      }
    },
    cache(slot, X, Y, fn) {
      const caches = tileAt(X, Y).caches;
      const c = caches[slot] || (caches[slot] = new Uint32Array(TP * TP));
      const i = (Y % TP) * TP + (X % TP);
      let v = c[i];
      if (!v) v = c[i] = fn(X, Y) | 0x1000000; // bit 24 = "al berekend"
      return v & 0xffffff;
    },
    // Tegels in beeld schilderen en gewijzigde cellen bijwerken; view in cellen
    flush(view) {
      clock++;
      const tx0 = clamp(Math.floor((view.x - 4) / TILE), 0, TILES_X - 1), tx1 = clamp(Math.floor((view.x + view.w + 4) / TILE), 0, TILES_X - 1);
      const ty0 = clamp(Math.floor((view.y - 4) / TILE), 0, TILES_Y - 1), ty1 = clamp(Math.floor((view.y + view.h + 4) / TILE), 0, TILES_Y - 1);
      for (const idx of dirtyCells) {
        const x = idx % G.W, y = (idx / G.W) | 0;
        const t = ((y / TILE) | 0) * TILES_X + ((x / TILE) | 0);
        if (state[t] === PARKED) state[t] = UNPAINTED; // geen pixels meer: straks helemaal opnieuw
        if (state[t] !== LIVE) continue; // wordt helemaal geschilderd zodra hij in beeld komt
        if (skipRepaint?.(x, y)) continue;
        paintCell(x, y, setPx);
        dirtyTiles.add(t);
      }
      dirtyCells.clear();
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = ty * TILES_X + tx;
          if (state[t] === UNPAINTED) { paintTile(tx, ty); dirtyTiles.delete(t); }
          if (tiles[t]) tiles[t].used = clock;
        }
      }
      for (const t of dirtyTiles) putTile(t);
      dirtyTiles.clear();
      evict();
    },
  };
}
export const unpack = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const pack = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);

// ---------- Canvas, camera en tanks ----------
export function fitCanvas(canvas, panel) {
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(panel.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(panel.clientHeight * dpr));
  };
  new ResizeObserver(resize).observe(panel);
  resize();
}

// Camera rond je eigen tank; viewCells langs de kortste kant, nooit meer dan de kaart
export function camera(game, canvas, viewCells, shake) {
  const Z = Math.max(Math.min(canvas.width, canvas.height) / viewCells, canvas.width / G.W, canvas.height / G.H);
  const w = canvas.width / Z, h = canvas.height / Z;
  const self = game.tanks.get(game.me);
  const fx = self && self.rx !== undefined ? self.rx + 0.5 : G.W / 2;
  const fy = self && self.ry !== undefined ? self.ry + 0.5 : G.H / 2;
  const x = clamp(fx - w / 2, 0, G.W - w), y = clamp(fy - h / 2, 0, G.H - h);
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0;
  return { Z, x, y, w, h, drawX: x + sx, drawY: y + sy };
}

// Tanks draaien vloeiend naar hun richting (t.ang volgt t.rd)
export function smoothTankAngles(game, dt) {
  for (const t of game.tanks.values()) {
    if (t.rd === undefined) continue;
    const [dx, dy] = G.DIRS[t.rd];
    const target = Math.atan2(dy, dx);
    if (t.ang === undefined || t.snapAngle) { t.ang = target; t.snapAngle = false; }
    const diff = Math.atan2(Math.sin(target - t.ang), Math.cos(target - t.ang));
    t.ang += diff * Math.min(1, dt * 16);
  }
}

// Stuk kaart dat in beeld is (in cellen, met marge), voor drawImage van kaartlagen
export function visibleCells(cam, margin = 3) {
  const sx = Math.max(0, Math.floor(cam.x) - margin), sy = Math.max(0, Math.floor(cam.y) - margin);
  return { sx, sy, sw: Math.min(Math.ceil(cam.w) + 2 * margin, G.W - sx), sh: Math.min(Math.ceil(cam.h) + 2 * margin, G.H - sy) };
}

// Kogel als lichtspoor met een felle kop
export function drawTracer(ctx, b, tail, head) {
  const [dx, dy] = G.DIRS[b.d];
  const hx = b.rx + 0.5, hy = b.ry + 0.5;
  const tx = hx - dx * b.trail, ty = hy - dy * b.trail;
  const g = ctx.createLinearGradient(tx, ty, hx, hy);
  g.addColorStop(0, tail);
  g.addColorStop(1, head);
  ctx.strokeStyle = g; ctx.lineWidth = 0.45; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#fff4cc';
  ctx.beginPath(); ctx.arc(hx, hy, 0.33, 0, Math.PI * 2); ctx.fill();
}

// ---------- Deeltjes ----------
// Soorten: flash, ring, fire, spark (licht), chunk (brokjes), en wolken (kleur per weergave).
// clouds: {soort: 'r, g, b'}, bv. { smoke: '74, 70, 62', dust: '226, 200, 150' }.
export function createParticles(clouds, cloudAlpha = {}) {
  const list = [];
  const LIGHT = new Set(['fire', 'spark', 'flash']);
  const order = [...Object.keys(clouds), 'chunk', 'ring', 'fire', 'spark', 'flash'];
  return {
    spawn(kind, x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.25 + Math.random() * 0.75) * (o.speed || 0);
        const life = (0.6 + Math.random() * 0.4) * o.life;
        list.push({
          kind, x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          ttl: life, max: life, r0: o.r0 ?? 0.4, r1: o.r1 ?? 0.4,
          col: o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : null, rot: Math.random() * 6,
        });
      }
    },
    draw(ctx, dt) {
      // bijwerken; dode deeltjes in één keer opruimen (geen splice per deeltje)
      let w = 0;
      for (const p of list) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const drag = Math.pow(p.kind in clouds ? 0.5 : 0.06, dt);
        p.vx *= drag; p.vy *= drag;
        p.ttl -= dt;
        if (p.ttl > 0) list[w++] = p;
      }
      list.length = w;
      for (const kind of order) {
        ctx.globalCompositeOperation = LIGHT.has(kind) ? 'lighter' : 'source-over';
        for (const p of list) {
          if (p.kind !== kind) continue;
          const k = p.ttl / p.max; // 1 -> 0
          const r = p.r1 + (p.r0 - p.r1) * k;
          if (kind in clouds) {
            ctx.fillStyle = `rgba(${clouds[kind]}, ${(cloudAlpha[kind] ?? 0.45) * k})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          } else if (kind === 'chunk') {
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + (1 - k) * 4);
            ctx.fillStyle = p.col; ctx.fillRect(-0.35, -0.25, 0.7, 0.5);
            ctx.restore();
          } else if (kind === 'ring') {
            ctx.strokeStyle = `rgba(255, 240, 210, ${0.8 * k})`; ctx.lineWidth = 0.35 * k + 0.05;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
          } else if (kind === 'fire') {
            ctx.globalAlpha = k; ctx.fillStyle = p.col;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          } else if (kind === 'spark') {
            ctx.strokeStyle = p.col; ctx.globalAlpha = k; ctx.lineWidth = 0.22;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
            ctx.globalAlpha = 1;
          } else {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, `rgba(255, 236, 170, ${k})`);
            g.addColorStop(0.5, `rgba(255, 150, 50, ${0.6 * k})`);
            g.addColorStop(1, 'rgba(255, 90, 20, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

// ---------- Schermmeldingen ----------
// Grote stempel in het midden (verbinden, uitgeschakeld, ...); DOM alleen bij verandering
export function createOverlay(el) {
  let key = 'start';
  return (big, small = '') => {
    const k = big ? `${big}|${small}` : '';
    if (k === key) return;
    key = k;
    el.innerHTML = big ? `<div class="big">${big}</div><div class="small">${small}</div>` : '';
  };
}

// ---------- Tankuiterlijk per kaart (config: tanks) ----------
function starPath(g, cx, cy, r) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}
// Embleem op de toren, gecentreerd op (cx, cy) met straal r (in celmaten).
// team.mark: star, redstar, number (team.number), roundel, triangle
export function drawEmblem(g, team, cx, cy, r) {
  if (team.mark === 'star') {
    g.strokeStyle = '#ebe6d6'; g.lineWidth = r * 0.15;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ebe6d6'; starPath(g, cx, cy, r * 0.85); g.fill();
  } else if (team.mark === 'redstar') {
    g.fillStyle = '#b8332a'; starPath(g, cx, cy, r * 0.95); g.fill();
  } else if (team.mark === 'triangle') { // oranje driehoek (Nederland, 1940)
    g.fillStyle = '#e8792a';
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.95, cy + r * 0.7); g.lineTo(cx - r * 0.95, cy + r * 0.7); g.closePath(); g.fill();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = r * 0.12; g.stroke();
  } else if (team.mark === 'roundel') {
    for (const [k, c] of [[1, '#2c4a8a'], [0.65, '#e6e2d6'], [0.32, '#b03a2e']]) {
      g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.fill();
    }
  } else if (team.number) {
    const w = r * (0.7 + team.number.length * 0.55);
    g.fillStyle = 'rgba(20, 20, 20, 0.75)';
    g.beginPath(); g.roundRect(cx - w / 2, cy - r * 0.62, w, r * 1.24, r * 0.15); g.fill();
    g.fillStyle = '#f0eee6'; g.font = `bold ${r * 1.05}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(team.number, cx, cy + r * 0.05);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
}
// Camouflage- of wintervlekken op de romp (rechthoek x, y, w, h; neus naar rechts)
export function drawSpots(g, team, x, y, w, h) {
  const col = team.winter ? 'rgba(240, 242, 238, 0.85)' : team.camo;
  if (!col) return;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = col;
  for (const [fx, fy, rx, ry] of [[0.15, 0.2, 0.16, 0.18], [0.55, 0.85, 0.2, 0.2], [0.85, 0.15, 0.12, 0.16], [0.35, 0.75, 0.1, 0.14], [0.7, 0.45, 0.08, 0.12]]) {
    g.beginPath(); g.ellipse(x + fx * w, y + fy * h, rx * w, ry * h, 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// Statusmeldingen van de verbinding
export function statusOverlay(setOverlay, fullText) {
  return (s) => {
    if (s === 'full') setOverlay('VOL', fullText);
    else if (s === 'closed') setOverlay('VERBINDING VERBROKEN', 'herlaad de pagina');
  };
}

// Ontvangen bytes per seconde tonen
export function showBandwidth(game, el, prefix = 'radio: ') {
  setInterval(() => {
    el.textContent = `${prefix}${(game.bytes / 1024).toFixed(2)} KB/s`;
    game.bytes = 0;
  }, 1000);
}
