// Stijl winter (Ardennen, Leningrad) voor de gedeelde wereldweergave (world-view.js): sneeuwlip
// langs tunnels (surface), dennen- of berkenbos en rotsblokken, palissade. Kaarten met fog: true
// beginnen in dichte mist die langzaam optrekt. De spelpagina (shell.js) start hem met start(game);
// de opmaak van het zijpaneel staat in winter.css.
import * as G from '/shared/game.js';
import { startWorld } from '/world-view.js';
import { clamp, shade, mix, rgb, hash, h01, vnoise, drawEmblem, drawSpots, FIRE } from '/render-common.js';

let ctx = null; // canvas waarop de basis getekend wordt (zie drawBase)

// Uiterlijk per kaart (config: tanks, via teamLook); mini = vaste kleur per speler op de minikaart
const TEAMS = [
  { name: 'SHERMAN', hull: '#5d7a2e', turret: '#6c8b36', mark: 'star', mini: '#2fd04a' },
  { name: 'CROMWELL', hull: '#2f6db3', turret: '#3d80c6', star: false, mini: '#2f7fe8' },
  { name: 'T-34', hull: '#b3392e', turret: '#c74a3c', star: false, mini: '#e8352b' },
  { name: 'STUART', hull: '#c49c25', turret: '#d6b03a', star: false, mini: '#f2b51c' },
];

const MINI = TEAMS.map((t) => t.mini);
function teamLook(spec, i) {
  const hull = spec.variant ? shade(spec.hull, 0.85) : spec.hull;
  return { ...spec, hull, turret: mix(hull, '#ffffff', 0.12), mini: MINI[i] };
}

function starPath(g, x, y, r, points, inner, rot) {
  g.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = rot + (k * Math.PI) / points, rr = k % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function drawTree(g, x, y, r, rot) {
  const layers = [[1, '#1c3529'], [0.7, '#274837'], [0.42, '#345c46']];
  for (const [k, col] of layers) {
    g.fillStyle = col;
    starPath(g, x, y, r * k, 9, 0.6, rot + k);
    g.fill();
    g.fillStyle = 'rgba(236, 242, 246, 0.92)';
    starPath(g, x - r * k * 0.2, y - r * k * 0.24, r * k * 0.5, 9, 0.55, rot + k * 2);
    g.fill();
  }
  g.fillStyle = '#f4f8fa';
  g.beginPath(); g.arc(x - r * 0.06, y - r * 0.08, r * 0.12, 0, Math.PI * 2); g.fill();
}

// Berk (Leningrad): wit-grijze stammetjes onder een open, grijsgroen bladerdek met sneeuw
function drawBirch(g, x, y, r, rot) {
  const crown = view.colors.veg;
  g.fillStyle = shade(crown, 0.6);
  g.beginPath(); g.arc(x, y, r * 0.95, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 5; k++) {
    const a = rot + k * 1.26, d = r * 0.42;
    g.fillStyle = k % 2 ? crown : mix(crown, '#ffffff', 0.18);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(240, 245, 248, 0.85)';
  g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.38, 0, Math.PI * 2); g.fill();
  // stam met zwarte vlekjes
  g.fillStyle = '#e8e6df'; g.fillRect(x - 0.18, y - 0.18, 0.36, r * 0.55);
  g.fillStyle = '#2a2a28'; g.fillRect(x - 0.18, y + r * 0.12, 0.36, 0.1); g.fillRect(x - 0.18, y + r * 0.3, 0.2, 0.08);
}

function drawBoulder(g, x, y, r, rnd) {
  const pts = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    pts.push([x + Math.cos(a) * r * (0.75 + rnd() * 0.35), y + Math.sin(a) * r * (0.7 + rnd() * 0.3)]);
  }
  const poly = (scale, ox, oy) => {
    g.beginPath();
    for (const [px, py] of pts) g.lineTo(x + (px - x) * scale + ox, y + (py - y) * scale + oy);
    g.closePath();
  };
  const stone = view.colors.rock;
  g.fillStyle = shade(stone, 0.92); poly(1, 0, 0); g.fill();
  g.fillStyle = mix(stone, '#ffffff', 0.22); poly(0.7, -r * 0.15, -r * 0.15); g.fill(); // lichte kant
  g.strokeStyle = shade(stone, 0.52); g.lineWidth = 0.14; poly(1, 0, 0); g.stroke();
  g.fillStyle = '#f2f6f9'; poly(0.55, -r * 0.12, -r * 0.4); g.fill(); // sneeuwkapje
}

// Op een vast rooster (elke 2,5 cel) een boom op begroeiing of een rotsblok op rots,
// met toeval per roosterpunt: zo komt elk stuk hetzelfde uit, ook als alleen een deel
// opnieuw getekend wordt (x0..x1, y0..y1 in cellen).
function drawObjects(g, x0, y0, x1, y1) {
  const map = view.game.map;
  const trees = [], rocks = [];
  const STEP = 2.5; // dichte bossen
  const gy0 = Math.max(0, Math.floor(y0 / STEP)) * STEP, gx0 = Math.max(0, Math.floor(x0 / STEP)) * STEP;
  for (let gy = gy0; gy < Math.min(G.H, y1); gy += STEP) {
    for (let gx = gx0; gx < Math.min(G.W, x1); gx += STEP) {
      const rnd = G.mulberry32(hash(Math.round(gx * 31 + 7), Math.round(gy * 17 + 3)));
      const x = gx + rnd() * STEP, y = gy + rnd() * STEP;
      const c = map[(y | 0) * G.W + (x | 0)];
      if (c === G.VEG) {
        const broken = view.game.world.scar[(y | 0) * G.W + (x | 0)] === G.SCAR_TREETOPS; // na een barrage
        if (rnd() < 0.06) rocks.push({ x, y, r: 0.9 + rnd() * 0.6, rnd });
        else trees.push({ x, y, r: (1.8 + rnd() * 0.9) * (broken ? 0.55 : 1), rot: rnd() * 6, broken });
      } else if (c === G.ROCK) {
        rocks.push({ x, y, r: 1.2 + rnd() * 1.0, rnd });
      }
    }
  }
  for (const k of rocks) drawBoulder(g, k.x, k.y, k.r, k.rnd);
  trees.sort((a, b) => a.y - b.y); // schaduwen tekent de wereldweergave (look.light)
  const birch = view.game.rules.vegetation?.type === 'birch';
  for (const t of trees) {
    (birch ? drawBirch : drawTree)(g, t.x, t.y, t.r, t.rot);
    if (t.broken) { // afgeknapte top: splinters
      g.strokeStyle = '#6a4a2c'; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(t.x - t.r, t.y - t.r * 0.3); g.lineTo(t.x + t.r * 1.3, t.y + t.r * 0.5); g.stroke();
    }
  }
}

// ---------- Basis: houten palissade met sneeuw ----------
function log(x, y, w, h) {
  const horiz = w > h;
  ctx.fillStyle = '#7b5230';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(w, h) / 2); ctx.fill();
  ctx.strokeStyle = '#3a2513'; ctx.lineWidth = 0.14; ctx.stroke();
  ctx.strokeStyle = '#a87445'; ctx.lineWidth = 0.2;
  ctx.beginPath();
  if (horiz) { ctx.moveTo(x + 0.4, y + h * 0.3); ctx.lineTo(x + w - 0.4, y + h * 0.3); }
  else { ctx.moveTo(x + w * 0.3, y + 0.4); ctx.lineTo(x + w * 0.3, y + h - 0.4); }
  ctx.stroke();
  // sneeuw bovenop
  ctx.fillStyle = '#f3f7fa';
  if (horiz) for (let t = x + 0.3; t < x + w - 0.3; t += 0.55) { ctx.beginPath(); ctx.arc(t, y + 0.12 + Math.sin(t * 3.1) * 0.06, 0.3, 0, Math.PI * 2); ctx.fill(); }
  else for (let t = y + 0.3; t < y + h - 0.3; t += 0.55) { ctx.beginPath(); ctx.arc(x + 0.12 + Math.sin(t * 3.1) * 0.06, t, 0.3, 0, Math.PI * 2); ctx.fill(); }
}
function post(x, y) {
  ctx.fillStyle = '#6b4527';
  ctx.beginPath(); ctx.arc(x, y, 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#33200f'; ctx.lineWidth = 0.14; ctx.stroke();
  ctx.strokeStyle = '#a06f42'; ctx.lineWidth = 0.12;
  ctx.beginPath(); ctx.arc(x, y, 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f3f7fa';
  ctx.beginPath(); ctx.arc(x - 0.12, y - 0.2, 0.5, 0, Math.PI * 2); ctx.fill();
}
function wallH(a, b, y) {
  if (b - a < 0.5) return;
  log(a, y - 1, b - a, 1.35);
  log(a, y + 0.6, b - a, 1.35);
  for (let px = a + 0.6; px <= b - 0.5; px += Math.max(2.5, (b - a - 1.2) / Math.max(1, Math.round((b - a) / 5)))) post(px, y + 0.5);
  post(b - 0.6, y + 0.5);
}
function wallV(a, b, x) {
  if (b - a < 0.5) return;
  log(x - 1, a, 1.35, b - a);
  log(x + 0.6, a, 1.35, b - a);
  for (let py = a + 0.6; py <= b - 0.5; py += Math.max(2.5, (b - a - 1.2) / Math.max(1, Math.round((b - a) / 5)))) post(x + 0.5, py);
  post(x + 0.5, b - 0.6);
}
function crate(x, y, s) {
  ctx.fillStyle = '#946535'; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = '#4e3218'; ctx.lineWidth = 0.14;
  ctx.strokeRect(x, y, s, s);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.stroke();
  ctx.fillStyle = '#f3f7fa'; ctx.fillRect(x + 0.1, y + 0.1, s - 0.2, s * 0.22);
}
function drawBase(c, b) {
  ctx = c;
  const { x0, y0, x1, y1, d0, d1 } = b;
  crate(x0 + 2, y1 - 3.8, 1.8);
  crate(x0 + 4.1, y1 - 3.8, 1.8);
  crate(x1 - 3.8, y0 + 2, 1.8);
  wallV(y0 - 0.5, y1 + 1.5, x0);
  wallV(y0 - 0.5, y1 + 1.5, x1);
  for (const y of [y0, y1]) {
    wallH(x0 + 1.5, d0, y);
    wallH(d1 + 1, x1 - 0.5, y);
  }
}

// ---------- Tanks ----------
// Getekend met de neus naar rechts (+x), in celmaten. Licht valt van linksboven; de schaduw
// tekent de wereldweergave (style.shadow).
function drawTank(g, team, x, y, ang) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);

  // rupsbanden met platen
  for (const ty of [-2.65, 1.45]) {
    g.fillStyle = '#2a2c2e';
    g.beginPath(); g.roundRect(-3.7, ty, 7.4, 1.2, 0.45); g.fill();
    g.strokeStyle = '#4c5054'; g.lineWidth = 0.14;
    g.beginPath();
    for (let tx = -3.4; tx < 3.6; tx += 0.5) { g.moveTo(tx, ty + 0.1); g.lineTo(tx, ty + 1.1); }
    g.stroke();
  }

  // romp met reliëf
  const hull = team.hull, dark = shade(hull, 0.5);
  g.fillStyle = hull;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.35); g.fill();
  g.fillStyle = mix(hull, '#ffffff', 0.25);
  g.fillRect(-2.95, -1.55, 5.9, 0.45);
  g.fillStyle = shade(hull, 0.75);
  g.fillRect(-2.95, 1.1, 5.9, 0.45);
  drawSpots(g, team, -3.15, -1.65, 6.3, 3.3);
  g.strokeStyle = dark; g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.35); g.stroke();
  g.beginPath(); // motorrooster en luiken
  for (let gx = -2.8; gx < -1.8; gx += 0.3) { g.moveTo(gx, -0.9); g.lineTo(gx, 0.9); }
  g.stroke();
  g.fillStyle = shade(hull, 0.8);
  g.fillRect(2.0, -1.0, 0.7, 0.7);
  g.strokeRect(2.0, -1.0, 0.7, 0.7);

  // kanon
  g.fillStyle = shade(hull, 0.62);
  g.fillRect(1.0, -0.26, 4.3, 0.52);
  g.fillStyle = mix(hull, '#ffffff', 0.15);
  g.fillRect(1.0, -0.26, 4.3, 0.14);
  g.fillStyle = shade(hull, 0.45);
  g.fillRect(4.9, -0.38, 0.55, 0.76);

  // toren
  const tur = team.turret;
  g.fillStyle = tur;
  g.beginPath(); g.roundRect(-1.85, -1.3, 3.1, 2.6, 0.8); g.fill();
  g.fillStyle = mix(tur, '#ffffff', 0.28);
  g.beginPath(); g.roundRect(-1.65, -1.15, 2.4, 0.7, 0.35); g.fill();
  g.strokeStyle = shade(tur, 0.5); g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-1.85, -1.3, 3.1, 2.6, 0.8); g.stroke();
  g.restore();
}

// ---------- Effecten ----------
const SNOW_BITS = ['#ffffff', '#e6ecf1', '#d2dae0'];
const NEEDLES = ['#1c3529', '#274837', '#345c46', '#6b4a2c'];
const FROZEN = ['#5a4232', '#463326', '#6e5442'];
const METAL = ['#2a2c2e', '#3e4246', '#5a5e62'];

function onEvent(e, spawn) {
  if (e.t === 'x' && e.veg) {
    spawn('chunk', e.x, e.y, e.fell ? 24 : 9, { speed: e.fell ? 18 : 12, life: 0.8, cols: NEEDLES });
    spawn('chunk', e.x, e.y, e.fell ? 10 : 4, { speed: 10, life: 0.6, cols: SNOW_BITS });
  }
  if (e.t === 'x') {
    if (e.r === G.BULLET_DIG_R) {
      spawn('flash', e.x, e.y, 1, { life: 0.15, r0: 1, r1: 2.6 });
      spawn('chunk', e.x, e.y, 8, { speed: 14, life: 0.6, cols: SNOW_BITS });
      spawn('chunk', e.x, e.y, 4, { speed: 12, life: 0.6, cols: FROZEN });
      spawn('puff', e.x, e.y, 4, { speed: 3, life: 1.1, r0: 1, r1: 3.5 });
    } else if (e.r) {
      spawn('flash', e.x, e.y, 1, { life: 0.18, r0: 1, r1: 2.2 });
      spawn('spark', e.x, e.y, 14, { speed: 22, life: 0.35, cols: FIRE });
      spawn('smoke', e.x, e.y, 2, { speed: 2, life: 1, r0: 0.8, r1: 2.5 });
    } else {
      spawn('flash', e.x, e.y, 1, { life: 0.1, r0: 0.6, r1: 1.4 });
      spawn('chunk', e.x, e.y, 5, { speed: 10, life: 0.4, cols: SNOW_BITS });
      spawn('spark', e.x, e.y, 6, { speed: 14, life: 0.25, cols: FIRE });
    }
  } else if (e.t === 'k') {
    const team = TEAMS[e.i];
    spawn('flash', e.x, e.y, 1, { life: 0.35, r0: 3, r1: 9 });
    spawn('fire', e.x, e.y, 30, { speed: 14, life: 0.7, r0: 1.2, r1: 0.2, cols: FIRE });
    spawn('chunk', e.x, e.y, 26, { speed: 26, life: 1.1, cols: [...METAL, team.hull] });
    spawn('chunk', e.x, e.y, 30, { speed: 20, life: 1.0, cols: SNOW_BITS });
    spawn('smoke', e.x, e.y, 14, { speed: 4, life: 2.6, r0: 2, r1: 8 });
    spawn('spark', e.x, e.y, 20, { speed: 30, life: 0.5, cols: FIRE });
  }
}

// ---------- Mist ----------
// Witte mist zolang het weer de vlag fog heeft (Ardennen: begin van ronde 1 en 2). Hoe ver
// hij is opgetrokken komt uit het weer, dus bij iedereen even ver.
const FOG_SECONDS = 120; // alleen voor de tekst; de echte duur staat in het weer (config)
const FOG_CLEAR_START = 9; // zicht rond je tank bij de start, in cellen
const FOG_CLEAR_END = 70; // zicht vlak voordat de mist helemaal weg is

// Naadloos herhalende wolkentextuur (ruis die op de rand terugloopt)
const fogTex = document.createElement('canvas');
fogTex.width = fogTex.height = 256;
{
  const g = fogTex.getContext('2d'), im = g.createImageData(256, 256), P = 8;
  const wn = (x, y, p) => { // vnoise die na p cellen herhaalt
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const c = (i, j) => h01(((i % p) + p) % p, ((j % p) + p) % p + 777);
    const a = c(xi, yi), b = c(xi + 1, yi), cc = c(xi, yi + 1), d = c(xi + 1, yi + 1);
    return (a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy;
  };
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const v = wn(x / 32, y / 32, P) * 0.6 + wn(x / 16, y / 16, P * 2) * 0.3 + wn(x / 8, y / 8, P * 4) * 0.1;
      const i = (y * 256 + x) * 4;
      im.data[i] = 236; im.data[i + 1] = 240; im.data[i + 2] = 245;
      im.data[i + 3] = Math.round(clamp((v - 0.25) * 1.6, 0, 1) * 255);
    }
  }
  g.putImageData(im, 0, 0);
}
const fogCanvas = document.createElement('canvas');
const fctx = fogCanvas.getContext('2d');

// 0 = dichte mist, 1 = helemaal opgetrokken (kaarten zonder fog: altijd 1)
function fogProgress() {
  const wx = view.game.weather;
  if (!wx?.flags.fog) return 1; // mist volgens het weer (Ardennen: ronde 1 en 2)
  return wx.flags.fogProgress ?? 1;
}
const smooth = (t) => t * t * (3 - 2 * t);
const fogClearRadius = () => FOG_CLEAR_START + (FOG_CLEAR_END - FOG_CLEAR_START) * smooth(fogProgress());

// Geeft het mistcanvas terug (op een kwart van het speelveld), of niets als er geen mist is
function drawFog(cam, now) {
  const { canvas } = view;
  const density = 1 - smooth(fogProgress());
  if (density <= 0.01) return null;
  const Z = cam.Z;
  // op een kwart van de resolutie: mist is zacht, dat scheelt veel rekenwerk
  const fw = Math.ceil(canvas.width / 4), fh = Math.ceil(canvas.height / 4);
  if (fogCanvas.width !== fw || fogCanvas.height !== fh) { fogCanvas.width = fw; fogCanvas.height = fh; }
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fw, fh);
  fctx.fillStyle = `rgba(222, 228, 235, ${0.9 * density})`;
  fctx.fillRect(0, 0, fw, fh);
  // drijvende wolken, met de camera mee zodat ze aan de grond "vastzitten"
  const s = (Z / 4) * 0.9; // 1 textuurpixel ≈ 0.9 cel
  const ox = (((-cam.x * s + now * 0.004) % (256 * s)) + 256 * s) % (256 * s);
  const oy = (((-cam.y * s + now * 0.0015) % (256 * s)) + 256 * s) % (256 * s);
  fctx.globalAlpha = density;
  for (let ty = oy - 256 * s; ty < fh; ty += 256 * s) {
    for (let tx = ox - 256 * s; tx < fw; tx += 256 * s) fctx.drawImage(fogTex, tx, ty, 256 * s, 256 * s);
  }
  fctx.globalAlpha = 1;
  // open plek rond je eigen tank
  const self = view.game.tanks.get(view.game.me);
  const cx = self && self.rx !== undefined ? self.rx + 0.5 : cam.x + cam.w / 2;
  const cy = self && self.ry !== undefined ? self.ry + 0.5 : cam.y + cam.h / 2;
  const sx = ((cx - cam.x) * Z) / 4, sy = ((cy - cam.y) * Z) / 4, rr = (fogClearRadius() * Z) / 4;
  const hole = fctx.createRadialGradient(sx, sy, rr * 0.35, sx, sy, rr);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  fctx.globalCompositeOperation = 'destination-out';
  fctx.fillStyle = hole;
  fctx.fillRect(0, 0, fw, fh);
  fctx.globalCompositeOperation = 'source-over';
  return fogCanvas;
}

// Linksboven in het speelveld: hoe lang de ochtendmist nog hangt
function fogLabel() {
  if (!view.game.map) return '';
  const pr = fogProgress();
  return pr >= 1 ? '' : `MIST · OPGETROKKEN OVER ${Math.ceil((1 - pr) * FOG_SECONDS)} S`;
}

let view = null;
export default function start(game) {
  view = startWorld({
    viewCells: 96, background: '#e9eef3', teams: TEAMS,
    // grondshader (view/ground-gpu.js): witte sneeuwlip langs tunnels, besneeuwde oever,
    // platgereden sneeuw in de basis met bandensporen; bomen staan in de objectlaag
    surface: {
      lip: { color: '#f4f8fc', amount: 0.75, inner: 0.85 }, rock: { edge: 0.82, light: 1.1 }, veg: 'ground',
      bank: { color: '#eef4fa' }, floor: { color: '#d8dde6', tracks: 0.9, grain: 10 }, debris: '#705030',
    },
    // minikaart (world-view.js): zolang de mist hangt, ligt die ook over de minikaart
    minimap: {
      smooth: false,
      overlay: (g) => {
        const density = 1 - smooth(fogProgress());
        if (density > 0.01) { g.fillStyle = `rgba(226, 231, 237, ${0.92 * density})`; g.fillRect(0, 0, G.W, G.H); }
      },
    },
    objects: { draw: drawObjects, over: true },
    clouds: { puff: '245, 248, 252', smoke: '62, 64, 66' }, cloudAlpha: { puff: 0.7, smoke: 0.45 }, burialColor: '#eef3f8',
    onEvent, overlay: drawFog, teamLook, drawBase, drawTank,
    shadow: { color: 0x283755, alpha: 0.35 },
    tracer: ['rgba(255, 170, 60, 0)', 'rgba(255, 210, 110, 1)'],
    eraser: { name: 'SNEEUWSTORM', haze: '232, 238, 245', hazeAlpha: 0.38, streak: '255, 255, 255' },
    label: fogLabel,
  }, game);
  return view;
}
