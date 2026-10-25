// Tunneler El Alamein: stijl voor de gedeelde wereldweergave (world-view.js), eigen potje
// met mijnenvelden, struiken en zandstormen. Zand met duinribbels, loopgraven, rotsplateaus
// met lagen en (bijna onzichtbare) mijnen.
import * as G from '/shared/game.js';
import { startWorld, R } from '/world-view.js';
import { clamp, shade, mix, rgb, hash, vnoise, pack, drawEmblem } from '/render-common.js';

const $ = (id) => document.getElementById(id);

// Uiterlijk per kaart (config: tanks, via teamLook); de herkenningspanelen en wimpels geven de
// vaste kleur van de speler
const TEAMS = [
  { name: 'CRUSADER', hull: '#c7ad76', turret: '#d4bc87', camo: '#8b7a50', mark: '#2fbf4a' },
  { name: 'PANZER III', hull: '#b3a47c', turret: '#c2b48d', camo: '#7a7258', mark: '#2f7fe8' },
  { name: 'M13/40', hull: '#c1a26a', turret: '#cfb17b', camo: '#8e7244', mark: '#e0352b' },
  { name: 'GRANT', hull: '#bca775', turret: '#cab786', camo: '#6d6847', mark: '#f2b51c' },
].map((t) => ({ ...t, mini: t.mark }));
const SLOT = TEAMS.map((t) => t.mark);
function teamLook(spec, i) {
  const hull = spec.variant ? shade(spec.hull, 0.88) : spec.hull;
  return { ...spec, emblem: spec.mark, hull, turret: mix(hull, '#ffffff', 0.12), camo: spec.camo || shade(hull, 0.72), mark: SLOT[i], mini: SLOT[i] };
}
function onTeams() { hudKey = ''; }

// ---------- Kaartkleuren (per pixel, zie world-view.js) ----------
// De dure ruiskleuren (duinen, loopgraaf, rotslagen) worden per pixel onthouden;
// opnieuw schilderen bij graven of vervagen is dan alleen opzoeken.
// Het zijn helderheden (x1000) over de kaartkleur heen.
const SAND = 0, TRENCH = 1, ROCKC = 2; // cache-vakken
const sandShade = (X, Y) => {
  const n = (hash(X, Y) & 1023) / 1023;
  // duinribbels: schuine golfjes die een beetje meanderen
  const ripple = Math.sin(X * 0.21 + Y * 0.07 + vnoise(X / 50, Y / 50) * 7);
  const big = vnoise(X / 70 + 20, Y / 70 + 20);
  return Math.round(1000 + ((big - 0.5) * 22 + ripple * 7 + (n - 0.5) * 12) * 4.5);
};
const trenchShade = (X, Y) => {
  const n = (hash(X, Y) & 1023) / 1023;
  return Math.round(1000 + ((n - 0.5) * 16 + (vnoise(X / 12, Y / 12) - 0.5) * 14) * 7);
};
const rockShade = (X, Y) => {
  const n = (hash(X, Y) & 1023) / 1023;
  return Math.round(1000 + (Math.sin(Y * 0.22 + vnoise(X / 25, Y / 25) * 5) * 13 + (n - 0.5) * 12) * 7); // horizontale lagen
};

function ground(p) {
  p.ground();
  p.shade(p.cachedValue(SAND, sandShade) / 1000);
}
function tunnel(p) {
  // loopgraaf: aangestampt zand, schaduw onder de rand, lichte zandlip
  // (randen alleen als de cel zelf loopgraaf is, niet in een afgeronde rotshoek)
  const inside = p.own === G.EMPTY;
  const top = inside ? p.nT : G.EMPTY, left = inside ? p.nL : G.EMPTY;
  const right = inside ? p.nR : G.EMPTY, bot = inside ? p.nB : G.EMPTY;
  const { u, v } = p;
  p.tunnelBase();
  p.shade(p.cachedValue(TRENCH, trenchShade) / 1000);
  if ((v === 0 && top !== G.EMPTY) || (u === 0 && left !== G.EMPTY) || (u === R - 1 && right !== G.EMPTY) || (v === R - 1 && bot !== G.EMPTY)) {
    if ((p.h >>> 12) % 10 < 5) { p.ground(); p.shade(1.1); } // lichte zandlip
  } else if ((v <= 2 && top !== G.EMPTY) || (u <= 1 && left !== G.EMPTY)) {
    p.r *= 0.72; p.g *= 0.72; p.b *= 0.72;
  }
  if (p.debris()) p.set(98, 76, 48); // takjes van een weggeschoten struik
}
function rock(p) {
  // rotsplateau: donkere rand, lichte bovenkant, verder gelaagd gesteente
  p.rockBase();
  if (p.rockF < p.rockThr + 0.07) p.shade(0.55);
  else if (p.rockAt(-2, -2) < p.rockThr) p.shade(1.3);
  else p.shade(p.cachedValue(ROCKC, rockShade) / 1000);
}
function water(p) {
  // zee: golfjes, natte zandrand
  if (p.waterF() < p.waterThr + 0.08) { p.ground(); p.shade(0.8); return; }
  const k = Math.sin(p.X * 0.35 + p.Y * 0.12 + vnoise(p.X / 40, p.Y / 40) * 6) * 7 + (p.n - 0.5) * 6;
  p.waterBase();
  p.r += k; p.g += k; p.b += k;
}
function veg(p) {
  // dorre struik: zand met een kluwen olijfgroene en bruine takjes
  ground(p);
  const twig = vnoise(p.X / 1.7, p.Y / 1.7), edgeV = p.vegF();
  if (twig > 0.5 && edgeV > 0.45) { if ((p.h >>> 14) & 1) p.vegBase(); else p.set(88, 66, 40); }
  else if (edgeV > 0.62) { p.r *= 0.8; p.g *= 0.78; p.b *= 0.72; } // schaduw onder de struik
}
function base(p) {
  // aangestampte basisvloer met bandensporen door de deur
  const k = (p.n - 0.5) * 10;
  p.set(210 + k, 182 + k, 128 + k);
  const bs = p.bases[p.base];
  if (bs && Math.abs(Math.abs(p.X / R - bs.dc) - 1.6) < 0.35) { p.r -= 26; p.g -= 24; p.b -= 18; }
}
// ---------- Struikjes op de rotsranden (objectlaag, in celmaten) ----------
function drawObjects(g, x0, y0, x1, y1) {
  const at = view.at;
  for (let y = Math.max(2, Math.floor(y0)); y < Math.min(G.H - 2, y1); y++) {
    for (let x = Math.max(2, Math.floor(x0)); x < Math.min(G.W - 2, x1); x++) {
      if (at(x, y) !== G.ROCK || hash(x * 3 + 1, y * 5 + 2) % 22) continue;
      const edge = at(x - 1, y) !== G.ROCK || at(x + 1, y) !== G.ROCK || at(x, y - 1) !== G.ROCK || at(x, y + 1) !== G.ROCK;
      if (!edge) continue;
      const rnd = G.mulberry32(hash(x, y));
      const cx = x + 0.5, cy = y + 0.5, r = 0.7 + rnd() * 0.5;
      for (let k = 0; k < 7; k++) { // kameeldoorn: pluisjes in donker olijf
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7;
        g.fillStyle = k % 2 ? '#6b6a3a' : '#837f48';
        g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.45, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

// ---------- Mijnen ----------
// Bijna onzichtbaar: een heel licht bobbeltje in het zand. In een loopgraaf
// (blootgegraven door een granaat) iets duidelijker.
// g is een Pixi-Graphics in celmaten (laag onder de tanks, zie world-view.js)
function drawMine(g, x, y, inTrench) {
  const cx = x + 0.5, cy = y + 0.5;
  if (inTrench) {
    g.circle(cx, cy, 0.55).fill({ color: 0x56573f, alpha: 0.45 });
    g.circle(cx, cy, 0.2).fill({ color: 0x7b7c5e, alpha: 0.45 });
    return;
  }
  g.ellipse(cx - 0.1, cy - 0.1, 0.8, 0.65).fill({ color: 0xfff0cd, alpha: 0.16 }); // iets lichter zandheuveltje
  g.ellipse(cx + 0.2, cy + 0.25, 0.7, 0.45).fill({ color: 0x785a32, alpha: 0.12 }); // zacht schaduwrandje
}
function drawMines(ctx, cam) {
  const { game } = view;
  for (const i of game.mines) {
    const mx = i % G.W, my = (i / G.W) | 0;
    if (mx < cam.x - 1 || my < cam.y - 1 || mx > cam.x + cam.w + 1 || my > cam.y + cam.h + 1) continue;
    drawMine(ctx, mx, my, game.map[i] === G.EMPTY);
  }
}

// ---------- Basis: zandzakken, olievaten, jerrycans ----------
function bag(ctx, x, y, w, h) {
  ctx.fillStyle = '#b39a68';
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.fill();
  ctx.fillStyle = '#c9b282';
  ctx.beginPath(); ctx.roundRect(x + 0.4, y + 0.38, w - 0.8, (h - 0.2) * 0.38, 0.35); ctx.fill();
  ctx.strokeStyle = '#6a5634'; ctx.lineWidth = 0.16;
  ctx.beginPath(); ctx.roundRect(x + 0.08, y + 0.1, w - 0.16, h - 0.2, 0.6); ctx.stroke();
}
function bagRow(ctx, a, b, fixed, horizontal) {
  const len = b - a;
  if (len <= 0.5) return;
  const n = Math.max(1, Math.round(len / 5)), L = len / n;
  for (let k = 0; k < n; k++) {
    if (horizontal) bag(ctx, a + k * L, fixed, L, 3); else bag(ctx, fixed, a + k * L, 3, L);
  }
}
function drum(ctx, x, y) {
  ctx.fillStyle = '#6f5a36'; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3e301b'; ctx.lineWidth = 0.12; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#9a8352'; ctx.beginPath(); ctx.arc(x - 0.25, y - 0.25, 0.14, 0, Math.PI * 2); ctx.fill();
}
function jerrycan(ctx, x, y) {
  ctx.fillStyle = '#7a7444'; ctx.fillRect(x, y, 1.1, 1.5);
  ctx.strokeStyle = '#3f3b20'; ctx.lineWidth = 0.1; ctx.strokeRect(x, y, 1.1, 1.5);
  ctx.beginPath(); ctx.moveTo(x + 0.15, y + 0.3); ctx.lineTo(x + 0.95, y + 1.25); ctx.moveTo(x + 0.95, y + 0.3); ctx.lineTo(x + 0.15, y + 1.25); ctx.stroke();
}
function drawBase(ctx, b) {
  const { x0, y0, x1, y1, d0, d1 } = b;
  for (let k = 0; k < 3; k++) jerrycan(ctx, x0 + 2 + k * 1.3, y1 - 3.2);
  drum(ctx, x1 - 2.6, y0 + 2.7); drum(ctx, x1 - 4.3, y0 + 2.7); drum(ctx, x1 - 2.6, y0 + 4.4);
  bagRow(ctx, y0 - 1, y1 + 2, x0 - 1, false);
  bagRow(ctx, y0 - 1, y1 + 2, x1 - 1, false);
  for (const y of [y0 - 1, y1 - 1]) {
    bagRow(ctx, x0 + 2, d0, y, true);
    bagRow(ctx, d1 + 1, x1 - 1, y, true);
  }
}

// ---------- Tanks ----------
// Neus naar rechts (+x), in celmaten. Woestijnkleur met camouflagevlekken,
// een gekleurd herkenningspaneel op het achterdek en een wimpel aan de antenne. De schaduw
// tekent de wereldweergave (style.shadow); de wimpel wappert in tankFrames plaatjes.
function drawTank(g, team, x, y, ang, now) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);

  for (const ty of [-2.65, 1.45]) { // rupsbanden
    g.fillStyle = '#3a342a';
    g.beginPath(); g.roundRect(-3.7, ty, 7.4, 1.2, 0.45); g.fill();
    g.strokeStyle = '#5e5546'; g.lineWidth = 0.14;
    g.beginPath();
    for (let tx = -3.4; tx < 3.6; tx += 0.5) { g.moveTo(tx, ty + 0.1); g.lineTo(tx, ty + 1.1); }
    g.stroke();
  }

  const hull = team.hull;
  g.fillStyle = hull;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.fill();
  g.save(); // camouflagevlekken binnen de romp
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.clip();
  g.fillStyle = team.camo;
  for (const [cx, cy, rx, ry] of [[-2.2, -0.9, 0.9, 0.5], [0.6, 1.0, 1.1, 0.55], [2.3, -1.1, 0.7, 0.45], [-0.8, 1.2, 0.6, 0.4]]) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.fillStyle = mix(hull, '#ffffff', 0.22); g.fillRect(-2.95, -1.55, 5.9, 0.4);
  g.strokeStyle = shade(hull, 0.5); g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-3.15, -1.65, 6.3, 3.3, 0.3); g.stroke();

  // herkenningspaneel op het achterdek
  g.fillStyle = team.mark;
  g.fillRect(-2.95, -1.05, 1.3, 2.1);
  g.strokeStyle = shade(team.mark, 0.5); g.lineWidth = 0.12; g.strokeRect(-2.95, -1.05, 1.3, 2.1);

  // kanon
  g.fillStyle = shade(hull, 0.55); g.fillRect(1.0, -0.25, 4.3, 0.5);
  g.fillStyle = shade(hull, 0.42); g.fillRect(4.9, -0.36, 0.5, 0.72);

  // toren
  const tur = team.turret;
  g.fillStyle = tur;
  g.beginPath(); g.roundRect(-1.7, -1.3, 3.0, 2.6, 0.55); g.fill();
  g.fillStyle = mix(tur, '#ffffff', 0.25);
  g.beginPath(); g.roundRect(-1.5, -1.15, 2.3, 0.6, 0.3); g.fill();
  g.strokeStyle = shade(tur, 0.5); g.lineWidth = 0.18;
  g.beginPath(); g.roundRect(-1.7, -1.3, 3.0, 2.6, 0.55); g.stroke();
  if (team.emblem) drawEmblem(g, { ...team, mark: team.emblem }, -0.35, 0.05, 0.7);
  else { g.fillStyle = shade(tur, 0.7); g.beginPath(); g.arc(-0.55, 0.4, 0.45, 0, Math.PI * 2); g.fill(); }

  // antenne met wapperende wimpel in de ploegkleur
  const wave = Math.sin(now / 120 + x) * 0.25;
  g.strokeStyle = '#2e2416'; g.lineWidth = 0.08;
  g.beginPath(); g.moveTo(-1.1, -0.9); g.lineTo(-2.6, -1.9); g.stroke();
  g.fillStyle = team.mark;
  g.beginPath(); g.moveTo(-2.6, -1.9); g.lineTo(-3.8, -1.75 + wave); g.lineTo(-2.55, -1.45); g.closePath(); g.fill();
  g.restore();
}

// ---------- Effecten ----------
const SAND_BITS = ['#e2c48a', '#d4b273', '#c9a463', '#efd8a6'];
const FIRE = ['#ffb347', '#ff8a2a', '#ffd27a', '#ff6a1a'];
const METAL = ['#3a342a', '#5a5040', '#6f6650'];
const TWIGS = ['#706838', '#58422a', '#8a7a4a', '#a08c5a'];

function onEvent(e, spawn) {
  if (e.t === 'x' && e.veg) {
    spawn('chunk', e.x, e.y, e.fell ? 22 : 8, { speed: e.fell ? 16 : 11, life: 0.7, cols: TWIGS });
    spawn('dust', e.x, e.y, e.fell ? 4 : 1, { speed: 3, life: 1.2, r0: 1, r1: 3 });
  }
  if (e.t === 'm') {
    // mijn: felle flits, schokgolf, zandfontein, rook
    spawn('flash', e.x, e.y, 1, { life: 0.22, r0: 1.5, r1: 4 });
    spawn('ring', e.x, e.y, 1, { life: 0.35, r0: 0.5, r1: 5 });
    spawn('chunk', e.x, e.y, 16, { speed: 18, life: 0.7, cols: SAND_BITS });
    spawn('dust', e.x, e.y, 7, { speed: 4, life: 1.4, r0: 1, r1: 4 });
    spawn('smoke', e.x, e.y, 3, { speed: 2, life: 1.2, r0: 0.8, r1: 2.6 });
    spawn('spark', e.x, e.y, 8, { speed: 20, life: 0.3, cols: FIRE });
    if (e.i === view.game.me) view.shake(0.22);
  } else if (e.t === 'x') {
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

// ---------- Zijbalk: je tank (naam, zeges, meters) ----------
function setGauge(k, pct, text, low) {
  $(`g-${k}`).style.width = `calc(${clamp(pct, 0, 1) * 100}% - 2px)`;
  $(`g-${k}`).classList.toggle('low', low);
  $(`n-${k}`).textContent = text;
}

let hudKey = '';
function hud() {
  const { game } = view;
  const self = game.tanks.get(game.me);
  if (!self) return;
  const key = `${game.me},${TEAMS[game.me].name},${self.f},${self.s},${self.m},${self.c}`;
  if (key === hudKey) return;
  hudKey = key;
  $('name').textContent = TEAMS[game.me].name;
  setGauge('fuel', (self.f ?? 0) / 100, `${self.f ?? 0}%`, self.f < 20);
  setGauge('armour', (self.s ?? 0) / G.SHIELD_MAX, `${self.s ?? 0}`, self.s < 30);
  setGauge('ammo', (self.m ?? 0) / G.AMMO_MAX, `${self.m ?? 0}`, self.m < 10);
  $('wins').textContent = self.c ?? 0;
}

const view = startWorld({
  room: 'el-alamein', viewCells: 90, background: '#d9be86', teams: TEAMS, teamLook, onTeams,
  ground, tunnel, rock, water, veg, base,
  // minikaart (world-view.js): tijdens een zandstorm waait er stof over de hele kaart
  minimap: {
    rect: 'rgba(46, 36, 22, 0.9)',
    overlay: (g) => { if (view.eraserInfo()?.active) { g.fillStyle = 'rgba(196, 150, 90, 0.4)'; g.fillRect(0, 0, G.W, G.H); } },
  },
  objects: { draw: drawObjects, over: false },
  clouds: { dust: '226, 200, 150', smoke: '64, 56, 46' }, cloudAlpha: { dust: 0.6, smoke: 0.45 },
  onEvent, drawUnder: drawMines, drawBase, drawTank,
  tankFrames: 8, tankPeriod: 754, // één golf van de wimpel (sin(now / 120))
  shadow: { color: 0x50321a, alpha: 0.35, dx: 0.5, dy: 0.65 },
  eraser: { name: 'ZANDSTORM', haze: '196, 156, 98', hazeAlpha: 0.42, streak: '245, 226, 182' },
  hud,
});
