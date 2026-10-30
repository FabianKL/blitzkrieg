// Rijden, kogels en mijnen: de regels die server en browser elke tick gelijk uitrekenen. De browser
// voorspelt er je eigen tank mee.
import { ICE } from './config.js';
import { BUILDING, BULLET_SPEED, CLASSES, DIRS, DIRT, MASKS, SPEED_ONE, TANK_R, TANK_WID, TUNNEL_COST, VEG, W, WATER, dirIndex, isSolid, playable, tankCovers } from './world.js';

// Welke mijnen liggen onder de tankvorm op (x, y) in richting dir?
export function minesUnder(mines, x, y, dir) {
  const hit = [];
  for (const c of MASKS[dir]) {
    const i = (y + c.y) * W + x + c.x;
    if (mines.has(i)) hit.push(i);
  }
  return hit;
}

// ---------- Rijden ----------
// Eén tick rijden met de ingedrukte richting. Gedeeld zodat de browser je eigen tank
// kan voorspellen met exact dezelfde regels als de server.
// t: {x, y, dir, mv, fuel, input: {dx, dy}}; others: andere levende tanks {x, y}.
// mv telt op tot een hele stap: door traag terrein rijdt een tank niet elke tick.
const overlaps = (x, y, o) => Math.abs(x - o.x) <= 2 * TANK_R && Math.abs(y - o.y) <= 2 * TANK_R;
function tankBlocked(t, nx, ny, others) {
  // Zitten tanks al in elkaar (bv. na respawn), laat ze dan uit elkaar rijden
  return others.some((o) => overlaps(nx, ny, o) && !overlaps(t.x, t.y, o));
}

export function moveTank(t, w, others) {
  const { dx, dy } = t.input;
  if (!dx && !dy) return;
  if (waterUnder(w.map, t.x, t.y, t.dir) > 0) { moveWet(t, w, others); return; }
  // Draaien mag alleen als de nieuwe stand niet in rots, muur of begroeiing steekt. Past de
  // gedraaide tank net niet (een boom of rots vlak naast je), dan schuift hij 1 of 2 cellen op
  // naar een plek waar hij wel past, liefst in de stuurrichting. Zo kun je niet klem komen te zitten.
  const nd = dirIndex(dx, dy);
  if (nd !== t.dir && probeFootprint(w.map, t.x, t.y, nd) === FP_BLOCKED) {
    const spot = turnNudge(t, w, nd, dx, dy, others);
    if (!spot || t.fuel <= 0) return;
    t.x = spot[0]; t.y = spot[1]; t.dir = nd; t.mv = 0;
    t.fuel -= TUNNEL_COST.fuel;
    return;
  }
  t.dir = nd;
  if (t.fuel <= 0) return;
  const options = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]]; // schuif langs muren
  for (const [mx, my] of options) {
    const nx = t.x + mx, ny = t.y + my;
    const cost = stepCost(w, nx, ny, t.dir);
    if (!cost || tankBlocked(t, nx, ny, others)) continue;
    // t.slow: snelheidsfactor door een meter (oververhit, bevroren motor, zand), SPEED_ONE = normaal
    const speed = t.slow !== undefined && t.slow < SPEED_ONE ? Math.round((cost.speed * t.slow) / SPEED_ONE) : cost.speed;
    if (speed < SPEED_ONE) {
      t.mv = (t.mv || 0) + speed;
      if (t.mv < SPEED_ONE) return; // nog niet ver genoeg gegraven voor een hele stap
      t.mv -= SPEED_ONE;
    } else t.mv = 0;
    t.x = nx; t.y = ny;
    t.fuel -= cost.fuel;
    return;
  }
}

// Dichtstbijzijnde plek (1 of 2 cellen verder) waar de tank in richting nd past; eerst in de
// stuurrichting, dan de andere richtingen. null = nergens.
const NUDGES = [1, 2].flatMap((s) => DIRS.map(([x, y]) => [x * s, y * s]));
function turnNudge(t, w, nd, dx, dy, others) {
  const order = [[dx, dy], [dx * 2, dy * 2], ...NUDGES];
  for (const [ox, oy] of order) {
    const nx = t.x + ox, ny = t.y + oy;
    if (probeFootprint(w.map, nx, ny, nd) === FP_BLOCKED || tankBlocked(t, nx, ny, others)) continue;
    if (waterUnder(w.map, nx, ny, nd) > 0) continue; // niet het water in schuiven
    return [nx, ny];
  }
  return null;
}

// Hoeveel watercellen liggen onder de tankvorm? -1 = er zit rots, een muur of begroeiing onder.
export function waterUnder(map, cx, cy, dir) {
  let n = 0;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!playable(x, y)) return -1;
    const v = map[y * W + x];
    if (v === WATER) n++;
    else if (isSolid(v)) return -1;
  }
  return n;
}

// In een wak gezakt: heel langzaam, en alleen een kant op waar niet meer water onder de tank
// komt (eruit, of langs de rand), zodat je niet zwemmend een rivier oversteekt.
export const WET_SPEED = Math.round(ICE.sinkSpeed * SPEED_ONE);
function moveWet(t, w, others) {
  const { dx, dy } = t.input;
  const nd = dirIndex(dx, dy);
  const wet = waterUnder(w.map, t.x, t.y, t.dir);
  if (nd !== t.dir) {
    const nw = waterUnder(w.map, t.x, t.y, nd);
    if (nw < 0 || nw > wet) return;
    t.dir = nd;
  }
  if (t.fuel <= 0) return;
  const options = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
  for (const [mx, my] of options) {
    const nx = t.x + mx, ny = t.y + my;
    const nw = waterUnder(w.map, nx, ny, t.dir);
    if (nw < 0 || nw > wet || tankBlocked(t, nx, ny, others)) continue;
    t.mv = (t.mv || 0) + WET_SPEED;
    if (t.mv < SPEED_ONE) return;
    t.mv -= SPEED_ONE;
    t.x = nx; t.y = ny;
    t.fuel -= TUNNEL_COST.fuel;
    return;
  }
}

// Wat zit er onder de tankvorm op (cx, cy) in richting dir?
export const FP_CLEAR = 0, FP_DIRT = 1, FP_BLOCKED = 2;
export function probeFootprint(map, cx, cy, dir) {
  let dirt = false;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!playable(x, y)) return FP_BLOCKED;
    const v = map[y * W + x];
    if (isSolid(v)) return FP_BLOCKED;
    if (v === DIRT) dirt = true;
  }
  return dirt ? FP_DIRT : FP_CLEAR;
}

// Wat kost een stap naar (cx, cy)? null = geblokkeerd. Door een bestaande tunnel TUNNEL_COST;
// moet er gegraven worden, dan telt de traagste klasse onder de nieuwe tankvorm.
export function stepCost(w, cx, cy, dir) {
  let worst = null;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!playable(x, y)) return null;
    const v = w.map[y * W + x];
    if (isSolid(v)) return null;
    if (v === DIRT) {
      const cls = CLASSES[w.terrain[y * W + x]];
      if (!worst || cls.speed < worst.speed) worst = cls;
    }
  }
  return worst || TUNNEL_COST;
}

// ---------- Kogels ----------
// Een kogel vliegt over grond en water heen en stopt bij een tank, begroeiing, gebouw, rots of
// muur (§5.8). Met dig (bulletsDig, retro) stopt hij ook in de grond en graaft daar een krater.
// Begroeiing en gebouwen raakt een kogel over de hele breedte van een tank (2 cellen naar
// weerszijden): alles wat je tank tegenhoudt, kun je wegschieten. De kogel staat dan op de
// geraakte cel (b.x, b.y), zodat server en clients dezelfde plant raken.
const SWEEP = Math.floor(TANK_WID);
function bulletCheck(b, map, tanks, dig) {
  if (!playable(b.x, b.y)) return { kind: 'solid' };
  const c = map[b.y * W + b.x];
  if (isSolid(c) && c !== WATER) return { kind: 'solid' };
  for (const t of tanks) {
    if (t.alive && t.id !== b.owner && tankCovers(t, b.x, b.y)) return { kind: 'tank', tank: t };
  }
  const [px, py] = DIRS[(b.d + 2) % 8]; // dwars op de vliegrichting
  for (let k = 1; k <= SWEEP; k++) {
    for (const sgn of [1, -1]) {
      const x = b.x + px * k * sgn, y = b.y + py * k * sgn;
      if (!playable(x, y)) continue;
      const v = map[y * W + x];
      if (v === VEG || v === BUILDING) { b.x = x; b.y = y; return { kind: 'solid' }; }
    }
  }
  if (dig && c === DIRT) return { kind: 'dirt' };
  return null;
}

// Beweeg een kogel één tick. Geeft null terug of waar hij op insloeg.
export function stepBullet(b, map, tanks, dig = false) {
  if (b.fresh) {
    b.fresh = false;
    const hit = bulletCheck(b, map, tanks, dig);
    if (hit) return hit;
  }
  const [dx, dy] = DIRS[b.d];
  for (let s = 0; s < BULLET_SPEED; s++) {
    b.x += dx; b.y += dy;
    const hit = bulletCheck(b, map, tanks, dig);
    if (hit) return hit;
  }
  return null;
}
