// Stijl tunneler (Tunneler - Classic): twee tanks in een woestijnarena van gouden en rood zand,
// omzoomd door grijze rotsen. Geen begroeiing, geen weer, geen mijnen.
import * as G from '/shared/game.js';
import { startWorld } from '/world-view.js';
import { shade, mix, FIRE, sandbagRow } from '/render-common.js';

const TEAMS = [
  { name: 'VIPER MK-I',  hull: '#2d8c3a', turret: '#38a248', camo: '#1a5c24', mark: '#2fd04a' },
  { name: 'KOBALT MK-I', hull: '#2a5ca0', turret: '#3870b8', camo: '#1a3c6e', mark: '#2f7fe8' },
  { name: 'VIPER MK-I',  hull: '#8c2d2d', turret: '#a23838', camo: '#5c1a1a', mark: '#e0352b' },
  { name: 'KOBALT MK-I', hull: '#8c7a2d', turret: '#a29038', camo: '#5c501a', mark: '#f2b51c' },
].map((t) => ({ ...t, mini: t.mark }));
const SLOT = TEAMS.map((t) => t.mark);
function teamLook(spec, i) {
  const hull = spec.variant ? shade(spec.hull, 0.88) : spec.hull;
  return { ...spec, emblem: spec.mark, hull, turret: mix(hull, '#ffffff', 0.12), camo: shade(hull, 0.72), mark: SLOT[i], mini: spec.mini ?? SLOT[i] };
}

// ---------- Basis: zandzakken ----------
const BAGS = { bag: '#a09080', top: '#b8a898', edge: '#5a4e42', line: 0.16, len: 5 };
function drawBase(ctx, b) {
  const { x0, y0, x1, y1, d0, d1 } = b;
  sandbagRow(ctx, y0 - 1, y1 + 2, x0 - 1, false, BAGS);
  sandbagRow(ctx, y0 - 1, y1 + 2, x1 - 1, false, BAGS);
  for (const y of [y0 - 1, y1 - 1]) {
    sandbagRow(ctx, x0 + 2, d0, y, true, BAGS);
    sandbagRow(ctx, d1 + 1, x1 - 1, y, true, BAGS);
  }
}

// ---------- Tanks (procedureel, fallback als sprites ontbreken) ----------
function drawTank(g, team, x, y, ang, now) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);

  for (const ty of [-2.65, 1.45]) {
    g.fillStyle = '#3a3a3a';
    g.beginPath(); g.roundRect(-3.7, ty, 7.4, 1.2, 0.45); g.fill();
    g.strokeStyle = '#5e5e5e'; g.lineWidth = 0.14;
    g.beginPath();
    for (let tx = -3.4; tx < 3.6; tx += 0.5) { g.moveTo(tx, ty + 0.1); g.lineTo(tx, ty + 1.1); }
    g.stroke();
  }

  const hull = team.hull;
  g.fillStyle = hull;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.fill();
  g.save();
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.clip();
  g.fillStyle = team.camo;
  for (const [cx, cy, rx, ry] of [[-2.2, -0.9, 0.9, 0.5], [0.6, 1.0, 1.1, 0.55], [2.3, -1.1, 0.7, 0.45]]) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.fillStyle = mix(hull, '#ffffff', 0.22); g.fillRect(-2.95, -1.55, 5.9, 0.4);
  g.strokeStyle = shade(hull, 0.5); g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.stroke();

  g.fillStyle = team.mark;
  g.fillRect(-2.95, -1.05, 1.3, 2.1);

  g.fillStyle = shade(hull, 0.55); g.fillRect(1.0, -0.25, 4.3, 0.5);
  g.fillStyle = shade(hull, 0.42); g.fillRect(4.9, -0.36, 0.5, 0.72);

  const tur = team.turret;
  g.fillStyle = tur;
  g.beginPath(); g.roundRect(-1.7, -1.3, 3.0, 2.6, 0.55); g.fill();
  g.fillStyle = mix(tur, '#ffffff', 0.25);
  g.beginPath(); g.roundRect(-1.5, -1.15, 2.3, 0.6, 0.3); g.fill();
  g.strokeStyle = shade(tur, 0.5); g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-1.7, -1.3, 3.0, 2.6, 0.55); g.stroke();
  { g.fillStyle = shade(tur, 0.7); g.beginPath(); g.arc(-0.55, 0.4, 0.45, 0, Math.PI * 2); g.fill(); }

  g.restore();
}

// ---------- Effecten ----------
const SAND_BITS = ['#d4b06a', '#c9a463', '#c27a3a', '#b86830'];
const METAL = ['#3a3a3a', '#5a5a5a', '#6f6f6f'];

function onEvent(e, spawn) {
  if (e.t === 'x') {
    if (e.r === G.BULLET_DIG_R) {
      spawn('flash', e.x, e.y, 1, { life: 0.15, r0: 1, r1: 2.6 });
      spawn('chunk', e.x, e.y, 10, { speed: 14, life: 0.6, cols: SAND_BITS });
      spawn('dust', e.x, e.y, 4, { speed: 3, life: 1.1, r0: 1, r1: 3.2 });
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
    spawn('ring', e.x, e.y, 1, { life: 0.5, r0: 1, r1: 10 });
    spawn('fire', e.x, e.y, 30, { speed: 14, life: 0.7, r0: 1.2, r1: 0.2, cols: FIRE });
    spawn('chunk', e.x, e.y, 28, { speed: 26, life: 1.1, cols: [...METAL, team.hull, team.camo] });
    spawn('dust', e.x, e.y, 10, { speed: 5, life: 2, r0: 2, r1: 7 });
    spawn('smoke', e.x, e.y, 12, { speed: 4, life: 2.6, r0: 2, r1: 8 });
  }
}

let view = null;
export default function start(game) {
  view = startWorld({
    viewCells: 90, background: '#c8a860', teams: TEAMS, teamLook,
    surface: {
      lip: { shade: 1.1, amount: 0.5, inner: 0.72 }, rock: { edge: 0.75, light: 1.15 },
      bank: { shade: 0.8 }, floor: { color: '#c0a060', tracks: 0.88, grain: 10 }, debris: '#6a5030',
    },
    clouds: { dust: '200, 170, 120', smoke: '64, 56, 46' }, cloudAlpha: { dust: 0.6, smoke: 0.45 }, burialColor: '#c8a860',
    onEvent, drawBase, drawTank,
    shadow: { color: 0x50401a, alpha: 0.35, dx: 0.5, dy: 0.65 },
  }, game);
  return view;
}
