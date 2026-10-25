// Tunneler-client: stuurt alleen input, ontvangt delta's en tekent in retro-stijl.
import * as G from '/shared/game.js';
import { connect } from '/net.js';
import { updateRenderPositions } from '/shared/client-sim.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

// Scherm-indeling in "virtuele pixels" (1 vpx = 1 kaartcel), daarna heel-getallig opgeschaald
const VIEW_W = 80, VIEW_H = 56; // zichtbaar stuk kaart
const HUD_H = 21;
const VW = VIEW_W + 2; // + blauwe rand
const VH = VIEW_H + 2 + HUD_H;
let S = 1; // schermpixels per virtuele pixel

const particles = [];

// ---------- Kleuren ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (hex, k) => toHex(rgb(hex).map((v) => v * k));
const mix = (hex, other, k) => { const a = rgb(hex), b = rgb(other); return toHex(a.map((v, i) => v + (b[i] - v) * k)); };

const DIRT_LIGHT = rgb('#d2781e'), DIRT_DARK = rgb('#be661a');
const BLACK = [0, 0, 0];
const ROCK_COLS = [rgb('#a2a2a2'), rgb('#9a9a9a')];
const WALL_COLS = G.COLORS.map(rgb);
const WATER_COLS = [[0, 0, 168], [0, 0, 128]], VEG_COLS = [[0, 150, 0], [0, 108, 0]], SCAR_COL = [120, 72, 24];
const BULLET_LIGHT = '#ff7a7a', BULLET_DARK = '#b0141a';
const DEBRIS = ['#ff5a6e', '#ff92a2', '#e0283c', '#ffb4bc', '#c81e32'];
const SPARK = ['#ff4040', '#ff9a30', '#ffe060', '#ff6a6a'];
const DUST = ['#d2781e', '#be661a', '#e08a34'];

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function cellColor(x, y, c) {
  if (c === G.EMPTY) {
    // retro: tunnels blijven altijd (zie config.js); puin waar een plant weggeschoten is
    return game.world?.scar[y * G.W + x] && hash(x, y) % 4 === 0 ? SCAR_COL : BLACK;
  }
  if (c >= G.BASE) return BLACK;
  if (c === G.WATER) return WATER_COLS[hash(x, y) % 3 ? 0 : 1];
  if (c === G.VEG) return VEG_COLS[hash(x, y) % 3 ? 0 : 1];
  if (c === G.DIRT) {
    return hash(x, y) % 100 < 55 ? DIRT_LIGHT : DIRT_DARK;
  }
  if (c === G.ROCK) return ROCK_COLS[hash(x, y) % 7 === 0 ? 1 : 0];
  return WALL_COLS[c - G.WALL];
}

// ---------- Kaart: offscreen canvas van 1 pixel per cel ----------
// Alleen cellen die veranderen worden opnieuw ingekleurd (dirty rectangle).
const mapCanvas = document.createElement('canvas');
mapCanvas.width = G.W;
mapCanvas.height = G.H;
const mapCtx = mapCanvas.getContext('2d');
const img = mapCtx.createImageData(G.W, G.H);
let dirty = null;

function paint(x, y) {
  const i = (y * G.W + x) * 4;
  const [r, g, b] = cellColor(x, y, game.map[y * G.W + x]);
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  if (!dirty) dirty = { x0: x, y0: y, x1: x, y1: y };
  else {
    dirty.x0 = Math.min(dirty.x0, x); dirty.y0 = Math.min(dirty.y0, y);
    dirty.x1 = Math.max(dirty.x1, x); dirty.y1 = Math.max(dirty.y1, y);
  }
}

function flushMap() {
  if (!dirty) return;
  mapCtx.putImageData(img, 0, 0, dirty.x0, dirty.y0, dirty.x1 - dirty.x0 + 1, dirty.y1 - dirty.y0 + 1);
  dirty = null;
}

// ---------- Tank-sprite ----------
// Eén ontwerp met de neus naar rechts: rupsbanden boven en onder, romp met een
// donkere achterkant, geel kanon vanaf het midden. Bij het tekenen draait de hele
// sprite naar de rijrichting (ook 45° voor schuin), dus hij ziet er altijd hetzelfde uit.
const TANK_ART = [
  'TTTTT..',
  'DBBBB..',
  'DBYYYYY',
  'DBBBB..',
  'TTTTT..',
];
const SPRITE_CX = 2, SPRITE_CY = 2; // middelpunt van de tank in het ontwerp

const SPRITES = G.COLORS.map((col) => {
  const c = document.createElement('canvas');
  c.width = TANK_ART[0].length;
  c.height = TANK_ART.length;
  const g = c.getContext('2d');
  const pal = { T: shade(col, 0.38), D: shade(col, 0.62), B: col, Y: '#f4e800' };
  TANK_ART.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    g.fillStyle = pal[ch];
    g.fillRect(i, j, 1, 1);
  }));
  return c;
});

function drawTank(id, t) {
  const [dx, dy] = G.DIRS[t.rd];
  ctx.save();
  ctx.translate(t.rx + 0.5, t.ry + 0.5); // midden van de tankcel
  ctx.rotate(Math.atan2(dy, dx));
  ctx.drawImage(SPRITES[id], -SPRITE_CX - 0.5, -SPRITE_CY - 0.5);
  ctx.restore();
}

// ---------- Effecten ----------
function burst(x, y, n, speed, colors, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      ttl: life * (0.5 + Math.random() * 0.5), col: colors[(Math.random() * colors.length) | 0],
    });
  }
}

// ---------- Netwerk (gedeeld met de 1944-versie, zie net.js) ----------
const game = connect({
  onMap: () => { for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) paint(x, y); },
  onDig: paint,
  onEvent: (e) => {
    if (e.t === 'x') {
      if (e.r === G.BULLET_DIG_R) { burst(e.x, e.y, 10, 14, DUST, 0.5); burst(e.x, e.y, 6, 18, SPARK, 0.35); }
      else if (e.r) burst(e.x, e.y, 16, 22, SPARK, 0.45);
      else burst(e.x, e.y, 5, 12, SPARK, 0.3);
    } else if (e.t === 'k') {
      burst(e.x, e.y, 110, 60, DEBRIS, 1.8);
      burst(e.x, e.y, 25, 18, SPARK, 0.6);
    }
  },
  onStatus: (s) => {
    if (s === 'playing') setMsg('');
    else if (s === 'full') setMsg('SERVER VOL<br><small>max 4 spelers</small>');
    else if (s === 'closed') setMsg('VERBINDING VERBROKEN<br><small>herlaad de pagina</small>');
  },
}, { room: 'retro' }); // eigen potje: het originele zand, zonder terreinklassen
const { tanks, bullets } = game;

// ---------- Tekenen ----------
function resize() {
  const dpr = devicePixelRatio || 1;
  S = Math.max(1, Math.floor(Math.min((innerWidth * dpr) / VW, ((innerHeight - 24) * dpr) / VH)));
  canvas.width = VW * S;
  canvas.height = VH * S;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
}
addEventListener('resize', resize);
resize();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * S, y * S, w * S, h * S); };

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  px(0, 0, VW, VIEW_H + 2, '#1c1ca8'); // blauwe rand om het speelveld
  px(1, 1, VIEW_W, VIEW_H, '#000');

  if (game.map) {
    flushMap();
    drawWorld(now, dt);
  }
  drawHud(now);
}
requestAnimationFrame(frame);

function drawWorld(now, dt) {
  // Eigen tank voorspeld, de rest vloeiend uit de buffer (zet rx/ry/rd)
  updateRenderPositions(game, now);

  // Camera rond je eigen tank
  const self = tanks.get(game.me);
  const fx = self && self.rx !== undefined ? self.rx + 0.5 : G.W / 2;
  const fy = self && self.ry !== undefined ? self.ry + 0.5 : G.H / 2;
  const camX = clamp(fx - VIEW_W / 2, 0, G.W - VIEW_W);
  const camY = clamp(fy - VIEW_H / 2, 0, G.H - VIEW_H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(S, S, VIEW_W * S, VIEW_H * S);
  ctx.clip();
  ctx.setTransform(S, 0, 0, S, S - Math.round(camX * S), S - Math.round(camY * S));

  const sx = Math.floor(camX), sy = Math.floor(camY);
  const sw = Math.min(VIEW_W + 1, G.W - sx), sh = Math.min(VIEW_H + 1, G.H - sy);
  ctx.drawImage(mapCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

  // Kogels: rood streepje in een licht/donker-patroon, achter de kop aan
  for (const b of bullets.values()) {
    const [dx, dy] = G.DIRS[b.d];
    const hx = Math.round(b.rx), hy = Math.round(b.ry);
    for (let k = Math.round(b.trail); k >= 0; k--) {
      ctx.fillStyle = k % 2 === 0 ? BULLET_LIGHT : BULLET_DARK;
      ctx.fillRect(hx - dx * k, hy - dy * k, 1, 1);
    }
  }

  for (const [id, t] of tanks) {
    if (t.a && t.rx !== undefined) drawTank(id, t);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = Math.pow(0.04, dt);
    p.vx *= drag; p.vy *= drag;
    p.ttl -= dt;
    if (p.ttl <= 0) { particles.splice(i, 1); continue; }
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
  }

  ctx.restore();
}

// ---------- HUD: grijs metalen paneel met E / S / M ----------
const GLYPHS = {
  E: ['###', '#..', '##.', '#..', '###'],
  S: ['###', '#..', '###', '..#', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
};
function glyph(ch, x, y, col) {
  GLYPHS[ch].forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') px(x + i, y + j, 1, 1, col); }));
}

function bevel(x, y, w, h, light, dark) {
  px(x, y, w, 1, light); px(x, y, 1, h, light);
  px(x, y + h - 1, w, 1, dark); px(x + w - 1, y, 1, h, dark);
}

function bar(row, letter, col, pct, now) {
  const y = VIEW_H + 2 + 2 + row * 6;
  // icoonvakje
  px(2, y - 1, 7, 7, '#6a6a6a');
  bevel(2, y - 1, 7, 7, '#3a3a3a', '#dcdcdc');
  glyph(letter, 3 + ((5 - GLYPHS[letter][0].length) >> 1), y, col);
  // balk met inzetrand
  bevel(11, y, VW - 13, 5, '#3a3a3a', '#e8e8e8');
  px(12, y + 1, VW - 15, 3, '#000');
  const low = pct < 0.2 && Math.floor(now / 250) % 2 === 0; // knipperen bij bijna leeg
  const w = Math.round((VW - 15) * clamp(pct, 0, 1));
  if (w > 0 && !low) {
    px(12, y + 1, w, 3, col);
    px(12, y + 1, w, 1, mix(col, '#ffffff', 0.45));
  }
}

function drawHud(now) {
  const y0 = VIEW_H + 2;
  px(0, y0, VW, HUD_H, '#a6a6a6');
  bevel(0, y0, VW, HUD_H, '#dedede', '#4a4a4a');
  const self = tanks.get(game.me);
  bar(0, 'E', '#f2e41c', self ? self.f / 100 : 0, now);
  bar(1, 'S', '#22e2ee', self ? self.s / G.SHIELD_MAX : 0, now);
  bar(2, 'M', '#ff3c3c', self ? self.m / G.AMMO_MAX : 0, now);
  updateOverlay();
}

// ---------- Tekst-overlays (DOM alleen aanraken als er iets verandert) ----------
let lastScores = '', lastMsg = null;
function setMsg(html) {
  if (html === lastMsg) return;
  lastMsg = html;
  $('msg').innerHTML = html;
}

function updateOverlay() {
  const scores = [...tanks.entries()].sort((a, b) => a[0] - b[0])
    .map(([id, t]) => `<div style="color:${G.COLORS[id]}">P${id + 1}${id === game.me ? '*' : ' '} ${String(t.c ?? 0).padStart(2, '0')}</div>`)
    .join('');
  if (scores !== lastScores) { lastScores = scores; $('scores').innerHTML = scores; }
  const self = tanks.get(game.me);
  if (self) setMsg(self.a === 0 ? 'VERNIETIGD<br><small>terug naar je basis…</small>' : '');
}

setInterval(() => {
  $('net').textContent = `${(game.bytes / 1024).toFixed(2)} KB/s`;
  game.bytes = 0;
}, 1000);
