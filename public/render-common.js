// Gedeeld door de weergave (world-view.js en de stijlen): hulpjes voor kleur en ruis, velden,
// tegelcanvassen voor de getekende objecten, camera, gedeelde tekeningen en schermmeldingen.
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

// ---------- Velden ----------
// Vervaagde velden van water en begroeiing (voor de ronde randen in de grondshader)
export function obstacleFields(map) {
  return { water: blurField(map, (c) => c === G.WATER), veg: blurField(map, (c) => c === G.VEG) };
}

// Een plant is omgegaan (e.box = rechthoek van zijn cellen, zie client-sim): alleen daar het
// plantveld bijwerken en de grond eromheen opnieuw laten tekenen (ground.markRect)
export function plantFelled(fields, map, ground, box) {
  const [x0, y0, x1, y1] = box;
  blurField(map, (c) => c === G.VEG, fields.veg, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
  ground.markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
}
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

// ---------- Tegelcanvassen ----------
// Een laag in losse canvassen van TILE x TILE cellen (TP pixels per zijde), voor de getekende
// objecten (als er geen sprites zijn). Eén groot canvas kan op een grote kaart niet als textuur
// naar de videokaart, en zo hoeft bij een wijziging alleen die ene tegel opnieuw geüpload te worden.
export const R = 6; // pixels per cel in de tegelcanvassen
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

export const unpack = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const pack = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);

// ---------- Canvas, camera en tanks ----------
// Camera rond je eigen tank; viewCells langs de kortste kant, nooit meer dan de kaart.
// focus = [fx, fy] (fractie van de kaart): kijk daar in plaats van naar je tank (?kijk=, ontwikkelen)
export function camera(game, canvas, viewCells, shake, focus = null) {
  const Z = Math.max(Math.min(canvas.width, canvas.height) / viewCells, canvas.width / G.W, canvas.height / G.H);
  const w = canvas.width / Z, h = canvas.height / Z;
  const self = game.tanks.get(game.me);
  const fx = focus ? focus[0] * G.W : self && self.rx !== undefined ? self.rx + 0.5 : G.W / 2;
  const fy = focus ? focus[1] * G.H : self && self.ry !== undefined ? self.ry + 0.5 : G.H / 2;
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

// Brandstof (B) en munitie (M) halen: badge op de kaart, vakje op de minikaart en in de legenda
export const REFILL_COLORS = { fuel: '#e0b02a', ammo: '#d8572e' };
// Het B- of M-vakje (legenda, en de badge boven een laadplek op de kaart)
export function paintRefillIcon(canvas, kind) {
  const g = canvas.getContext('2d'), n = canvas.width;
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  g.fillStyle = REFILL_COLORS[kind]; g.fillRect(2, 2, n - 4, n - 4);
  g.fillStyle = 'rgba(0, 0, 0, 0.85)'; g.font = `bold ${Math.round(n * 0.6)}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(kind === 'fuel' ? 'B' : 'M', n / 2, n / 2 + 1);
}

// Vuur en vonken bij explosies: in elke stijl dezelfde kleuren
export const FIRE = ['#ffb347', '#ff8a2a', '#ffd27a', '#ff6a1a'];

// Zandzakken rond een basis: een rij van a tot b op hoogte (of x) fixed, 3 cellen dik.
// look = { bag, top, edge: kleuren, line: dikte van de rand, len: lengte van een zak in cellen }
export function sandbagRow(ctx, a, b, fixed, horizontal, look) {
  const len = b - a;
  if (len <= 0.5) return;
  const n = Math.max(1, Math.round(len / look.len)), L = len / n;
  for (let k = 0; k < n; k++) {
    if (horizontal) sandbag(ctx, a + k * L, fixed, L, 3, look); else sandbag(ctx, fixed, a + k * L, 3, L, look);
  }
}
function sandbag(ctx, x, y, w, h, look) {
  ctx.fillStyle = look.bag;
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.fill();
  ctx.fillStyle = look.top;
  ctx.beginPath(); ctx.roundRect(x + 0.4, y + 0.38, w - 0.8, (h - 0.2) * 0.38, 0.35); ctx.fill();
  ctx.strokeStyle = look.edge; ctx.lineWidth = look.line;
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.stroke();
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
    else if (s === 'left') setOverlay('JE HEBT HET SPEL VERLATEN', 'druk op OPNIEUW MEEDOEN om weer in te stappen');
  };
}

// Ontvangen bytes per seconde tonen
export function showBandwidth(game, el, prefix = 'radio: ') {
  setInterval(() => {
    el.textContent = `${prefix}${(game.bytes / 1024).toFixed(2)} KB/s`;
    game.bytes = 0;
  }, 1000);
}
