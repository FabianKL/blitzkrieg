// Stijl zomer (Normandië, Arnhem, Koersk, ...) voor de gedeelde wereldweergave (world-view.js).
// Donkere rand langs tunnels (surface), zandzakken rond de bases, gedetailleerde tanks van bovenaf.
// De spelpagina (shell.js) start hem met start(game); de opmaak van het zijpaneel staat in zomer.css.
import * as G from '/shared/game.js';
import { startWorld } from '/world-view.js';
import { shade, mix, drawEmblem, drawSpots, FIRE, sandbagRow } from '/render-common.js';

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

// ---------- Effecten ----------
const DIRT_CHUNKS = ['#5c4129', '#6e5034', '#4a3420', '#7d5c3c'];
const METAL = ['#2a2a26', '#3b3b35', '#55524a'];
const LEAVES = ['#36502a', '#56783a', '#7a5a34', '#8aa456'];

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
const BAGS = { bag: '#a8844d', top: '#c09b61', edge: '#5c4527', line: 0.18, len: 5.5 }; // langwerpige zakken
function drawBase(ctx, b) {
  const { x0, y0, x1, y1, d0, d1 } = b;
  // Band van 3 cellen dik, gecentreerd op de muur van 1 cel
  sandbagRow(ctx, y0 - 1, y1 + 2, x0 - 1, false, BAGS);
  sandbagRow(ctx, y0 - 1, y1 + 2, x1 - 1, false, BAGS);
  for (const y of [y0 - 1, y1 - 1]) {
    sandbagRow(ctx, x0 + 2, d0, y, true, BAGS);
    sandbagRow(ctx, d1 + 1, x1 - 1, y, true, BAGS);
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
    // grondshader (view/ground-gpu.js): donkere rand langs tunnels, bladerdek, modderige oever
    surface: {
      lip: { shade: 0.6, amount: 1, inner: 1 }, rock: { edge: 0.44, light: 1.27 }, veg: 'canopy',
      bank: { shade: 0.62 }, floor: { color: '#2c2119', grid: 3, grain: 8 }, debris: '#70502e',
    },
    clouds: { smoke: '74, 70, 62' }, cloudAlpha: { smoke: 0.42 },
    onEvent, drawBase, drawTank, teamLook,
    shadow: { color: 0x000000, alpha: 0.38 },
    eraser: { name: 'STORM', haze: '70, 64, 56', hazeAlpha: 0.3, streak: '205, 196, 178' },
    label: () => TEAMS[view.game.me]?.ploeg ?? '', // je ploeg rechtsboven in het speelveld
  }, game);
  return view;
}
