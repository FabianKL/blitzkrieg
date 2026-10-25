// Stijl zomer (Normandië, Arnhem, Koersk, ...) voor de gedeelde wereldweergave (world-view.js).
// Fijne korrel over de kaartkleuren, zandzakken rond de bases, gedetailleerde tanks van bovenaf.
// De spelpagina (shell.js) start hem met start(game); de opmaak van het zijpaneel staat in zomer.css.
import * as G from '/shared/game.js';
import { startWorld, R } from '/world-view.js';
import { hash, vnoise, shade, mix, drawEmblem, drawSpots } from '/render-common.js';

// Uiterlijk per kaart (config: tanks, via teamLook); dit is alleen de begintoestand
const TEAMS = [
  { name: 'SHERMAN', ploeg: 'PLOEG A · ★', hull: '#55602f', turret: '#647038', dark: '#2c3318', mark: 'star', fuel: '#4e5a26' },
  { name: 'PANZER', ploeg: 'PLOEG B · B2', hull: '#62686b', turret: '#72787a', dark: '#2f3335', mark: 'number', number: 'B2', fuel: '#4a4f52' },
  { name: 'T-34', ploeg: 'PLOEG C · 34', hull: '#45573a', turret: '#516646', dark: '#232d1d', mark: 'redstar', fuel: '#3f5534' },
  { name: 'CROMWELL', ploeg: 'PLOEG D · ◉', hull: '#857650', turret: '#95865d', dark: '#443b25', mark: 'roundel', fuel: '#7a6a3e' },
];
function teamLook(spec, i) {
  const hull = spec.variant ? shade(spec.hull, 0.85) : spec.hull;
  const sign = spec.mark === 'number' ? spec.number : { star: '★', redstar: '★', roundel: '◉' }[spec.mark] || '';
  return {
    ...spec, hull, turret: mix(hull, '#ffffff', 0.1), dark: shade(hull, 0.5), fuel: shade(hull, 0.9),
    ploeg: `PLOEG ${'ABCD'[i]} · ${sign}`,
  };
}
const BASE_NAMES = ['A', 'B', 'C', 'D'];

// ---------- Kaartkleuren (per pixel, zie world-view.js) ----------
// De kleuren zelf komen uit de kaart; hier alleen korrel, randen en vlekken.
function ground(p) {
  const { n, j } = p;
  p.ground();
  p.shade(n < 0.5 ? 1 : n < 0.76 ? 0.86 : n < 0.94 ? 1.14 : 1.32);
  p.r += j; p.g += j; p.b += j * 0.7;
  // donkere rand langs een tunnel
  const { u, v } = p;
  if ((v === 0 && p.nT === G.EMPTY) || (v === R - 1 && p.nB === G.EMPTY) || (u === 0 && p.nL === G.EMPTY) || (u === R - 1 && p.nR === G.EMPTY)) {
    p.r *= 0.6; p.g *= 0.6; p.b *= 0.6;
  }
}
function tunnel(p) {
  const k = (p.n - 0.5) * 10;
  p.tunnelBase();
  p.r += k; p.g += k; p.b += k * 0.8;
  if ((p.X + p.Y) % 5 === 0) { p.r -= 5; p.g -= 4; p.b -= 3; }
  if (p.debris()) p.set(112 + k, 80 + k, 46 + k); // splinters van een weggeschoten boom
}
function rock(p) {
  const out = p.rockF < p.rockThr + 0.07; // donkere omlijning
  const hi = !out && p.rockAt(-2, -2) < p.rockThr; // licht randje linksboven
  p.rockBase();
  p.shade(out ? 0.44 : hi ? 1.27 : 1 + (p.n - 0.5) * 0.09);
}
function water(p) {
  // donker water met golfjes, modderige oever
  if (p.waterF() < p.waterThr + 0.08) { p.ground(); p.shade(0.62); p.r += p.j; p.g += p.j; p.b += p.j; return; }
  const k = Math.sin(p.X * 0.45 + p.Y * 0.18 + vnoise(p.X / 30, p.Y / 30) * 6) * 6 + (p.n - 0.5) * 6;
  p.waterBase();
  p.r += k; p.g += k; p.b += k;
}
function veg(p) {
  // bladerdek: donkere rand, vlekken licht en donker groen (rond de kleur van de kaart)
  const leaf = vnoise(p.X / 2.3, p.Y / 2.3);
  p.vegBase();
  p.shade(p.vegF() < p.vegThr + 0.08 ? 0.6 : leaf > 0.62 ? 1.55 : leaf > 0.4 ? 1.05 : 0.75);
  p.r += p.j * 0.5; p.g += p.j * 0.5;
}
function base(p) { // basisvloer en muur (de zandzakken worden er los overheen getekend)
  const k = (p.n - 0.5) * 8;
  p.set(44 + k, 33 + k, 25 + k);
  if (p.X % (3 * R) === 0 || p.Y % (3 * R) === 0) { p.r -= 9; p.g -= 7; p.b -= 5; }
}

// Dunne lichte barsten in grote rotsen: eenmalig uitgerekend, per tegel getekend
const isInterior = (x, y) => [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => view.at(x + dx, y + dy) === G.ROCK);
let cracks = new Map(); // tegel -> [[X, Y, r, g, b], ...]
function buildCracks() {
  cracks = new Map();
  const put = (X, Y, r, g, b) => {
    const t = `${(X / R / 32) | 0},${(Y / R / 32) | 0}`;
    if (!cracks.has(t)) cracks.set(t, []);
    cracks.get(t).push([X, Y, r, g, b]);
  };
  for (let y = 3; y < G.H - 3; y++) {
    for (let x = 3; x < G.W - 3; x++) {
      if (hash(x * 7 + 1, y * 13 + 5) % 60 !== 0 || !isInterior(x, y)) continue;
      const rnd = G.mulberry32(hash(x, y));
      let px = x * R + R / 2, py = y * R + R / 2, ang = rnd() * Math.PI * 2;
      for (let s = 0, ok = true; s < 3 && ok; s++) {
        const len = (2 + rnd() * 3) * R;
        ang += (rnd() - 0.5) * 1.6;
        const cx = Math.cos(ang), cy = Math.sin(ang);
        for (let t = 0; t < len; t++) {
          const X = Math.round(px + cx * t), Y = Math.round(py + cy * t);
          if (!isInterior((X / R) | 0, (Y / R) | 0)) { ok = false; break; }
          put(X, Y, 178, 180, 175);
          put(X, Y + 1, 102, 104, 100);
        }
        px += cx * len; py += cy * len;
      }
    }
  }
}

// ---------- Effecten ----------
const DIRT_CHUNKS = ['#5c4129', '#6e5034', '#4a3420', '#7d5c3c'];
const METAL = ['#2a2a26', '#3b3b35', '#55524a'];
const LEAVES = ['#36502a', '#56783a', '#7a5a34', '#8aa456'];
const FIRE = ['#ffb347', '#ff8a2a', '#ffd27a', '#ff6a1a'];

function onEvent(e, spawn) {
  if (e.t === 'x' && e.veg) spawn('chunk', e.x, e.y, e.fell ? 26 : 10, { speed: e.fell ? 18 : 12, life: 0.8, cols: LEAVES });
  if (e.t === 'x') {
    if (e.r === G.BULLET_DIG_R) {
      spawn('flash', e.x, e.y, 1, { life: 0.15, r0: 1, r1: 2.6 });
      spawn('chunk', e.x, e.y, 10, { speed: 14, life: 0.6, cols: DIRT_CHUNKS });
      spawn('smoke', e.x, e.y, 3, { speed: 2, life: 1.2, r0: 1, r1: 3.5 });
      spawn('spark', e.x, e.y, 4, { speed: 16, life: 0.25, cols: FIRE });
    } else if (e.r) {
      spawn('flash', e.x, e.y, 1, { life: 0.18, r0: 1, r1: 2.2 });
      spawn('spark', e.x, e.y, 14, { speed: 22, life: 0.35, cols: FIRE });
      spawn('smoke', e.x, e.y, 2, { speed: 2, life: 1, r0: 0.8, r1: 2.5 });
    } else {
      spawn('flash', e.x, e.y, 1, { life: 0.1, r0: 0.6, r1: 1.4 });
      spawn('spark', e.x, e.y, 8, { speed: 14, life: 0.25, cols: FIRE });
    }
  } else if (e.t === 'k') {
    const team = TEAMS[e.i];
    spawn('flash', e.x, e.y, 1, { life: 0.35, r0: 3, r1: 9 });
    spawn('fire', e.x, e.y, 30, { speed: 14, life: 0.7, r0: 1.2, r1: 0.2, cols: FIRE });
    spawn('chunk', e.x, e.y, 30, { speed: 26, life: 1.1, cols: [...METAL, team.hull, team.dark] });
    spawn('smoke', e.x, e.y, 14, { speed: 4, life: 2.6, r0: 2, r1: 8 });
    spawn('spark', e.x, e.y, 20, { speed: 30, life: 0.5, cols: FIRE });
  }
}

// ---------- Zandzakken ----------
function bag(ctx, x, y, w, h) {
  ctx.fillStyle = '#a8844d';
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.fill();
  ctx.fillStyle = '#c09b61';
  ctx.beginPath(); ctx.roundRect(x + 0.4, y + 0.38, w - 0.8, (h - 0.2) * 0.38, 0.35); ctx.fill();
  ctx.strokeStyle = '#5c4527'; ctx.lineWidth = 0.18;
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.stroke();
}
function bagRow(ctx, a, b, fixed, horizontal) {
  const len = b - a;
  if (len <= 0.5) return;
  const n = Math.max(1, Math.round(len / 5.5)), L = len / n; // langwerpige zakken
  for (let k = 0; k < n; k++) {
    if (horizontal) bag(ctx, a + k * L, fixed, L, 3); else bag(ctx, fixed, a + k * L, 3, L);
  }
}
function drawBase(ctx, b) {
  const { x0, y0, x1, y1, d0, d1 } = b;
  // Band van 3 cellen dik, gecentreerd op de muur van 1 cel
  bagRow(ctx, y0 - 1, y1 + 2, x0 - 1, false);
  bagRow(ctx, y0 - 1, y1 + 2, x1 - 1, false);
  for (const y of [y0 - 1, y1 - 1]) {
    bagRow(ctx, x0 + 2, d0, y, true);
    bagRow(ctx, d1 + 1, x1 - 1, y, true);
  }
  ctx.fillStyle = 'rgba(214, 196, 150, 0.7)';
  ctx.font = '1.7px "Special Elite", monospace';
  ctx.fillText(`BASIS ${BASE_NAMES[b.i]}`, x0 + 2.8, y0 + 4.2);
}

// ---------- Tanks ----------
// Getekend met de neus naar rechts (+x), daarna gedraaid
function drawTank(ctx, team, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  // rupsbanden met schakels
  ctx.fillStyle = '#25251f';
  ctx.fillRect(-3.5, -2.55, 7, 1.15);
  ctx.fillRect(-3.5, 1.4, 7, 1.15);
  ctx.strokeStyle = '#4c4b42'; ctx.lineWidth = 0.16;
  ctx.beginPath();
  for (let tx = -3.3; tx < 3.5; tx += 0.6) {
    ctx.moveTo(tx, -2.55); ctx.lineTo(tx, -1.4);
    ctx.moveTo(tx, 1.4); ctx.lineTo(tx, 2.55);
  }
  ctx.stroke();

  // romp
  ctx.fillStyle = team.hull;
  ctx.fillRect(-3.0, -1.6, 6.0, 3.2);
  drawSpots(ctx, team, -3.0, -1.6, 6.0, 3.2);
  ctx.strokeStyle = team.dark; ctx.lineWidth = 0.2;
  ctx.strokeRect(-3.0, -1.6, 6.0, 3.2);
  ctx.beginPath(); // motorrooster achter en neus voor
  for (let gx = -2.7; gx < -1.6; gx += 0.35) { ctx.moveTo(gx, -1.1); ctx.lineTo(gx, 1.1); }
  ctx.moveTo(2.3, -1.6); ctx.lineTo(2.3, 1.6);
  ctx.stroke();

  // kanon en toren
  ctx.fillStyle = team.dark;
  ctx.fillRect(0.9, -0.22, 4.1, 0.44);
  ctx.fillRect(4.75, -0.32, 0.45, 0.64);
  ctx.fillStyle = team.turret;
  ctx.beginPath(); ctx.arc(-0.2, 0, 1.45, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = team.dark; ctx.lineWidth = 0.2; ctx.stroke();

  drawEmblem(ctx, team, -0.2, 0, 0.9);
  ctx.restore();
}

let view = null;
export default function start(game) {
  view = startWorld({
    viewCells: 80, background: '#2a1f17', teams: TEAMS,
    fullText: 'alle vier de ploegen zijn al bemand',
    ground, tunnel, rock, water, veg, base,
    afterTile: (tx, ty, setPx) => { for (const px of cracks.get(`${tx},${ty}`) || []) setPx(...px); },
    skipRepaint: isInterior, // rots binnenin verandert nooit (en heeft barsten die we willen houden)
    onMap: buildCracks,
    clouds: { smoke: '74, 70, 62' }, cloudAlpha: { smoke: 0.42 },
    onEvent, drawBase, drawTank, teamLook,
    shadow: { color: 0x000000, alpha: 0.38 },
    eraser: { name: 'STORM', haze: '70, 64, 56', hazeAlpha: 0.3, streak: '205, 196, 178' },
    label: () => TEAMS[view.game.me]?.ploeg ?? '', // je ploeg rechtsboven in het speelveld
  }, game);
  return view;
}
