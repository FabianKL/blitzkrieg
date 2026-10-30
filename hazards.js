// Gevaren en schaarse middelen per kaart (SPEC-blitzkrieg §10), alleen op de server: die gooit
// de dobbelsteen en stuurt wat er gebeurt naar iedereen. Gevaren zijn neutraal: ze treffen
// iedereen, een dood erdoor telt niet als kill, en wie geraakt wordt geeft de anderen een
// richtingshint (een groot geluid, §8).
//
// Een kaart heeft (config):
//   hazard  {type, ...}: forestBarrage, grainFire, atGuns, bridgeBlast, artillery, facades
//   scarce  {type, ...}: fuelDepots, ammoDepot, airDrops
//   meter   {type, ...}: sand, heat, temp (per tank, zie METERS)
// De server roept aan: roundStart(room, events) bij elke nieuwe ronde (en bij het begin),
// step(room, tick, events, hurt) elke tick, en snapshot(room) voor het instapbericht.
// hurt(t, procent, events) haalt pantser af en laat de tank zo nodig ontploffen.
import * as G from './shared/game.js';
import { HINTS, SMOKE } from './shared/config.js';
import { searchlightAt } from './shared/vision.js';

const rnd = () => Math.random(); // (tests kunnen Math.random vervangen)
const ticks = (s) => Math.round(s * G.TICK_RATE);

// ---------- Artilleriebarrage in het bos (§10.8) ----------
// Elke everySeconds een stuk bos van area x area T; warningSeconds van tevoren is het te zien
// en te horen. Wie in of binnen 1 T van het bos in dat vak staat, verliest armorLoss% pantser.
// Er blijven kapotte boomtoppen liggen (scar 3, zie game.js markBarrage).
const forestBarrage = {
  roundStart(room) { room.hz.next = room.tick + ticks(room.rules.hazard.everySeconds); },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, hz = room.hz, w = room.world;
    if (hz.pending && tick >= hz.pending.at) {
      const box = hz.pending.box;
      hz.pending = null;
      G.markBarrage(w, box);
      events.push({ t: 'zb', box });
      for (const t of room.tanks) {
        if (!t?.alive || !nearForestIn(w, t, box)) continue;
        hurt(t, cfg.armorLoss, events);
      }
    }
    if (tick < hz.next) return;
    hz.next = tick + ticks(cfg.everySeconds);
    for (let tries = 0; tries < 300; tries++) {
      const i = Math.floor(rnd() * w.map.length);
      if (w.map[i] !== G.VEG) continue;
      const half = (cfg.area * G.T) / 2, x = i % G.W, y = (i / G.W) | 0;
      const box = [Math.round(x - half), Math.round(y - half), Math.round(x + half), Math.round(y + half)];
      hz.pending = { box, at: tick + ticks(cfg.warningSeconds) };
      events.push({ t: 'z', box, at: hz.pending.at });
      break;
    }
  },
  snapshot(room) { return room.hz.pending ? { barrage: room.hz.pending } : {}; },
};
// Staat de tank in of binnen 1 T van bos dat in het vak ligt?
function nearForestIn(w, t, [x0, y0, x1, y1]) {
  const r = G.TANK_R + G.T;
  for (let y = t.y - r; y <= t.y + r; y++) {
    for (let x = t.x - r; x <= t.x + r; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1 || !G.inBounds(x, y)) continue;
      if (w.map[y * G.W + x] === G.VEG) return true;
    }
  }
  return false;
}

// ---------- Brandstofdepots (§10.8) ----------
// Elke ronde count depots (per kaartgrootte) op een nieuwe willekeurige plek, buiten de
// beschermde zones. Eén vulling per depot: wie erover rijdt, tankt vol; leeg blijft zichtbaar.
const fuelDepots = {
  roundStart(room, events) {
    const cfg = room.rules.scarce, w = room.world, n = cfg.count[room.size] ?? 2;
    room.hz.depots = [];
    for (let tries = 0; room.hz.depots.length < n && tries < 2000; tries++) {
      const x = Math.floor(rnd() * G.W), y = Math.floor(rnd() * G.H);
      if (!freeSpot(w, x, y, cfg.reach) || w.bases.some((b) => Math.hypot(b.x - x, b.y - y) < cfg.fromBase)) continue;
      if (room.hz.depots.some((d) => Math.hypot(d[0] - x, d[1] - y) < cfg.apart)) continue;
      room.hz.depots.push([x, y, 1]);
    }
    events.push({ t: 'dep', list: room.hz.depots });
  },
  step(room, tick, events) {
    const reach = room.rules.scarce.reach;
    room.hz.depots.forEach((d, k) => {
      if (!d[2]) return;
      const t = room.tanks.find((o) => o?.alive && Math.abs(o.x - d[0]) <= reach && Math.abs(o.y - d[1]) <= reach);
      if (!t) return;
      t.fuel = G.FUEL_MAX;
      d[2] = 0;
      events.push({ t: 'depu', k, i: t.id });
    });
  },
  snapshot(room) { return { depots: room.hz.depots || [] }; },
};
// Een plek waar een tank kan komen: graafbaar terrein of tunnel, buiten de beschermde zones
function freeSpot(w, x, y, r) {
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      if (!G.playable(x + i, y + j)) return false; // niet in de onbegaanbare rand
      const k = (y + j) * G.W + x + i, v = w.map[k];
      if ((v !== G.DIRT && v !== G.EMPTY) || w.zone?.[k]) return false;
    }
  }
  return true;
}

// ---------- Munitiedepot in het dorp (Grebbeberg, §10.1) ----------
// Munitie wordt niet in de basis aangevuld (refill.ammo false), alleen bij het depot in Rhenen
const ammoDepot = {
  roundStart(room) {
    const v = room.world.villages?.find((d) => d.depot === 'ammo');
    room.hz.ammoDepot = v ? [v.x, v.y] : null;
  },
  step(room, tick) {
    const d = room.hz.ammoDepot, cfg = room.rules.scarce;
    if (!d || tick % Math.round(G.TICK_RATE / cfg.perSecond)) return;
    for (const t of room.tanks) if (t?.alive && Math.hypot(t.x - d[0], t.y - d[1]) <= cfg.radiusT * G.T) t.ammo = Math.min(G.AMMO_MAX, t.ammo + 1);
  },
  snapshot(room) { return { ammoDepot: room.hz.ammoDepot }; },
};

// ---------- Rook (Grebbeberg: brandende boerderijen in de vallei; Arnhem: boven de stad;
// Koersk: na elk vuurgevecht). Rook blokkeert het zicht (§9), de clients tekenen hem. ----------
function smokeStep(room, tick, events) {
  const f = room.wx?.flags || {};
  const { farm, city } = SMOKE;
  if (f.farmSmoke && tick % ticks(farm.everySeconds) === 0) { // drijvende rook boven de vallei
    events.push({ t: 'smoke', x: Math.round(rnd() * farm.valleyX * G.W), y: Math.round(rnd() * G.H), r: farm.rT * G.T, s: farm.seconds });
  }
  if (f.citySmoke && tick % ticks(city.everySeconds) === 0) { // rook boven Arnhem
    const v = room.world.villages?.[0], [sx, sy] = city.spreadT;
    if (v) events.push({ t: 'smoke', x: Math.round(v.x + (rnd() - 0.5) * sx * G.T), y: Math.round(v.y + (rnd() - 0.5) * sy * G.T), r: city.rT * G.T, s: city.seconds });
  }
}
export function battleSmoke(room, x, y, events) { // tank geraakt of brand: rookvlek van 20 s
  if (room.wx?.flags.battleSmoke) events.push({ t: 'smoke', x, y, r: SMOKE.battle.rT * G.T, s: SMOKE.battle.seconds });
}

// ---------- Brandend graan (Koersk, §10.5) ----------
// Vuur in vakken van T x T. Een schot op graan steekt het aan (kans), en zolang het zomer is
// elke everySeconds een spontane brand. Elke seconde springt het vuur naar het volgende vak in
// de windrichting (als dat graan is); een vak brandt burnSeconds en wordt dan verbrande grond.
// Wie in een brandend vak staat, verliest armorPerSecond% pantser per seconde.
const grainFire = {
  roundStart(room) {
    const hz = room.hz;
    hz.wind ??= G.DIRS[Math.floor(rnd() * 8)]; // windrichting van dit spel
    hz.fires ??= new Map(); // vak -> tick waarop het uitbrandt
    hz.nextFire = room.tick + ticks(room.rules.hazard.everySeconds);
  },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, hz = room.hz, w = room.world, tw = Math.ceil(G.W / G.T);
    const summer = room.wx?.flags.fires;
    if (!summer && hz.fires.size && room.wx?.flags.thunder) { // onweer: alle branden doven
      for (const tile of hz.fires.keys()) { G.burnTile(w, tile); events.push({ t: 'fo', tile }); }
      hz.fires.clear();
    }
    if (summer && tick >= hz.nextFire) { // spontane brand op graan
      hz.nextFire = tick + ticks(cfg.everySeconds);
      for (let tries = 0; tries < 200; tries++) {
        const x = Math.floor(rnd() * G.W), y = Math.floor(rnd() * G.H);
        if (w.terrain[y * G.W + x] === G.CLASS.normal && w.map[y * G.W + x] === G.DIRT) { ignite(room, G.fireTileAt(x, y), tick, events); break; }
      }
    }
    if (tick % ticks(cfg.spreadSeconds) === 0) {
      for (const [tile, until] of [...hz.fires]) {
        if (tick >= until) { hz.fires.delete(tile); G.burnTile(w, tile); events.push({ t: 'fo', tile }); continue; }
        const nx = (tile % tw) + hz.wind[0], ny = ((tile / tw) | 0) + hz.wind[1];
        if (nx >= 0 && ny >= 0 && nx < tw && ny * G.T < G.H) {
          const next = ny * tw + nx, cx = nx * G.T + 2, cy = ny * G.T + 2;
          if (!hz.fires.has(next) && G.inBounds(cx, cy) && w.terrain[cy * G.W + cx] === G.CLASS.normal) ignite(room, next, tick, events);
        }
      }
    }
    if (tick % G.TICK_RATE === 0) { // schade in een brandend vak
      for (const t of room.tanks) if (t?.alive && hz.fires.has(G.fireTileAt(t.x, t.y))) hurt(t, cfg.armorPerSecond, events);
    }
  },
  // schot geland op (x, y): kans op brand als het graan is
  bulletLanded(room, x, y, events) {
    const cfg = room.rules.hazard, w = room.world;
    if (!G.inBounds(x, y) || w.terrain[y * G.W + x] !== G.CLASS.normal) return;
    if (rnd() < (room.wx?.flags.thunder ? cfg.stormShotChance : cfg.shotChance)) ignite(room, G.fireTileAt(x, y), room.tick, events);
  },
  snapshot(room) { return { fires: [...(room.hz.fires || new Map()).keys()] }; },
};
function ignite(room, tile, tick, events) {
  room.hz.fires.set(tile, tick + ticks(room.rules.hazard.burnSeconds));
  events.push({ t: 'fi', tile });
  const tw = Math.ceil(G.W / G.T);
  battleSmoke(room, (tile % tw) * G.T + 2, ((tile / tw) | 0) * G.T + 2, events);
}
export const isBurning = (room, x, y) => !!room.hz?.fires?.has(G.fireTileAt(x, y));

// ---------- Verborgen antitankgeschut (Carentan, §10.6) ----------
// count stukken achter een heg, onzichtbaar tot ze vuren. Elke everySeconds schieten ze op een
// tank in hun schootsveld (kegel van coneDegrees, rangeT lang): armorLoss%. Daarna zichtbaar
// en met hp treffers uit te schakelen (blijft het hele spel uit).
const atGuns = {
  roundStart(room) {
    if (room.hz.guns) return; // eenmaal per spel geplaatst
    const cfg = room.rules.hazard, w = room.world, guns = [];
    for (let tries = 0; guns.length < cfg.count && tries < 4000; tries++) {
      const x = 10 + Math.floor(rnd() * (G.W - 20)), y = 10 + Math.floor(rnd() * (G.H - 20)), i = y * G.W + x;
      if (w.map[i] !== G.DIRT || w.zone?.[i] || w.bases.some((b) => Math.hypot(b.x - x, b.y - y) < 60)) continue;
      // achter een heg: begroeiing vlak naast, schootsveld de andere kant op
      const d = G.DIRS.findIndex(([dx, dy]) => w.map[(y + dy * 3) * G.W + x + dx * 3] === G.VEG);
      if (d < 0 || guns.some((g) => Math.hypot(g.x - x, g.y - y) < 80)) continue;
      const [fx, fy] = G.DIRS[(d + 4) % 8];
      guns.push({ x, y, ang: Math.atan2(fy, fx), hp: cfg.hp, seen: false, next: room.tick + ticks(cfg.everySeconds) });
    }
    room.hz.guns = guns;
  },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, range = cfg.rangeT * G.T, half = (cfg.coneDegrees / 2) * (Math.PI / 180);
    room.hz.guns.forEach((g, k) => {
      if (g.hp <= 0 || tick < g.next) return;
      const target = room.tanks.find((t) => {
        if (!t?.alive) return false;
        const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
        let a = Math.atan2(dy, dx) - g.ang;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        return d <= range && Math.abs(a) <= half;
      });
      if (!target) return;
      g.next = tick + ticks(cfg.everySeconds);
      g.seen = true;
      events.push({ t: 'gun', k, x: g.x, y: g.y, ang: g.ang, hp: g.hp, tx: target.x, ty: target.y });
      hurt(target, cfg.armorLoss, events);
    });
  },
  // kogel bij (x, y): raakt hij een zichtbaar stuk geschut? Dan is hij op.
  bulletAt(room, x, y, events) {
    for (const [k, g] of (room.hz.guns || []).entries()) {
      if (!g.seen || g.hp <= 0 || Math.abs(g.x - x) > 2 || Math.abs(g.y - y) > 2) continue;
      g.hp--;
      events.push({ t: 'gun', k, x: g.x, y: g.y, ang: g.ang, hp: g.hp });
      return true;
    }
    return false;
  },
  snapshot(room) { return { guns: (room.hz.guns || []).map((g, k) => (g.seen ? { k, x: g.x, y: g.y, ang: g.ang, hp: g.hp } : null)).filter(Boolean) }; },
};

// ---------- De brug ontploft (Market Garden, §10.7) ----------
// Wie over de brug over de Rijn rijdt, haalt de overkant; daarna ontploft hij met kans chance,
// en elke oversteek wordt die kans chanceStep groter (de teller loopt door over de rondes, een
// nieuw spel begint weer bij chance). Ontploft: armorLoss% pantser, en de brug is de rest van
// de ronde water met een wrak. Volgende ronde weer heel.
const bridgeBlast = {
  roundStart(room, events) {
    const hz = room.hz, w = room.world;
    if (hz.bridge === undefined) { // de grootste brug (over de Rijn)
      const b = [...(w.bridges || [])].sort((p, q) => q.cells - p.cells)[0];
      hz.bridge = b ? { box: [b.x0, b.y0, b.x1, b.y1], cells: b.list || [] } : null;
    }
    if (hz.bridge?.blown) { G.setBridge(w, hz.bridge.cells, false); hz.bridge.blown = false; events.push({ t: 'bridge', blown: false }); }
    hz.onBridge = new Set();
  },
  step(room, tick, events, hurt) {
    const br = room.hz.bridge;
    if (!br || br.blown) return;
    const [x0, y0, x1, y1] = br.box;
    for (const t of room.tanks) {
      if (!t?.alive) continue;
      const on = t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1;
      if (on) { room.hz.onBridge.add(t.id); continue; }
      if (!room.hz.onBridge.has(t.id)) continue;
      // over de brug heen: ontploft hij nu?
      room.hz.onBridge.delete(t.id);
      const cfg = room.rules.hazard, n = room.hz.crossings || 0;
      room.hz.crossings = n + 1;
      if (rnd() >= (cfg.chance ?? 1) + n * (cfg.chanceStep ?? 0)) continue;
      br.blown = true;
      G.setBridge(room.world, br.cells, true);
      events.push({ t: 'bridge', blown: true, x: (x0 + x1) >> 1, y: (y0 + y1) >> 1 });
      hurt(t, room.rules.hazard.armorLoss, events);
      break;
    }
  },
  snapshot(room) { return { bridge: room.hz.bridge && { box: room.hz.bridge.box, cells: room.hz.bridge.cells, blown: !!room.hz.bridge.blown } }; },
};

// ---------- Droppings (Market Garden, §10.7) ----------
// Elke everySeconds een krat aan een parachute op een willekeurige plek (zolang het weer drops
// toestaat): brandstof of munitie. Wie eroverheen rijdt, krijgt de inhoud.
const airDrops = {
  roundStart(room) { room.hz.crates ??= []; room.hz.nextDrop = room.tick + ticks(room.rules.scarce.everySeconds); },
  step(room, tick, events) {
    const cfg = room.rules.scarce, hz = room.hz, w = room.world;
    if (room.wx?.flags.drops && tick >= hz.nextDrop) {
      hz.nextDrop = tick + ticks(cfg.everySeconds);
      for (let tries = 0; tries < 300; tries++) {
        const x = Math.floor(rnd() * G.W), y = Math.floor(rnd() * G.H), v = w.map[y * G.W + x];
        if ((v !== G.DIRT && v !== G.EMPTY) || w.border?.[y * G.W + x]) continue;
        const crate = [x, y, rnd() < 0.5 ? 'fuel' : 'ammo', 1];
        hz.crates.push(crate);
        events.push({ t: 'drop', k: hz.crates.length - 1, c: crate });
        break;
      }
    }
    hz.crates.forEach((c, k) => {
      if (!c[3]) return;
      const t = room.tanks.find((o) => o?.alive && Math.abs(o.x - c[0]) <= 4 && Math.abs(o.y - c[1]) <= 4);
      if (!t) return;
      if (c[2] === 'fuel') t.fuel = Math.min(G.FUEL_MAX, t.fuel + cfg.fuel * G.FUEL_MAX); else t.ammo = Math.min(G.AMMO_MAX, t.ammo + cfg.ammo);
      c[3] = 0;
      events.push({ t: 'dropu', k, i: t.id });
    });
  },
  snapshot(room) { return { crates: room.hz.crates || [] }; },
};

// ---------- Artilleriebarrage (Oder-front, §10.9) ----------
// Elke everySeconds licht een vak van area x area T op; warningSeconds later wordt het
// beschoten: armorLoss% voor wie erin staat; daarna kraters (zachte grond).
const artillery = {
  roundStart(room) { room.hz.next = room.tick + ticks(room.rules.hazard.everySeconds); },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, hz = room.hz, w = room.world;
    if (hz.pending && tick >= hz.pending.at) {
      const { box } = hz.pending;
      hz.pending = null;
      const craters = [];
      for (let k = 0; k < 6; k++) craters.push([Math.round(box[0] + rnd() * (box[2] - box[0])), Math.round(box[1] + rnd() * (box[3] - box[1])), 3 + Math.floor(rnd() * 3)]);
      G.markArtillery(w, box, craters);
      events.push({ t: 'zb', box, craters });
      for (const t of room.tanks) if (t?.alive && t.x >= box[0] && t.x <= box[2] && t.y >= box[1] && t.y <= box[3]) hurt(t, cfg.armorLoss, events);
    }
    if (tick < hz.next) return;
    hz.next = tick + ticks(cfg.everySeconds);
    const half = (cfg.area * G.T) / 2, x = half + rnd() * (G.W - 2 * half), y = half + rnd() * (G.H - 2 * half);
    hz.pending = { box: [Math.round(x - half), Math.round(y - half), Math.round(x + half), Math.round(y + half)], at: tick + ticks(cfg.warningSeconds) };
    events.push({ t: 'z', box: hz.pending.box, at: hz.pending.at, kind: 'art' });
  },
  snapshot(room) { return room.hz.pending ? { barrage: { ...room.hz.pending, kind: 'art' } } : {}; },
};

// ---------- Instortende gevels (Berlijn, §10.10) ----------
// Wie vlak naast een gebouw rijdt of staat: elke seconde chancePerSecond kans op een vallende
// gevel (armorLoss%). Wie tegen een gebouw aan rijdt: zeker (rammingLoss%). Een gebouw met
// collapseAfterHits treffers stort na collapseSeconds helemaal in (collapseLoss% voor wie
// ernaast staat). Instortingen laten puin achter en een stofwolk die het zicht blokkeert.
const facades = {
  roundStart(room) { room.hz.collapsing ??= new Map(); },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, w = room.world, hz = room.hz;
    // gebouwen die genoeg treffers hebben: na een paar seconden helemaal in
    for (const [id, at] of [...hz.collapsing]) {
      if (tick < at) continue;
      hz.collapsing.delete(id);
      const cells = w.vegCells[id];
      const c = cells.find((i) => w.map[i] === G.BUILDING);
      if (c === undefined) continue;
      const x = c % G.W, y = (c / G.W) | 0;
      G.destroyObstacleAt(w, x, y);
      events.push({ t: 'fb', x, y });
      const box = boxOf(cells);
      dust(room, box, events);
      for (const t of room.tanks) if (t?.alive && near(t, box, 4)) hurt(t, cfg.collapseLoss, events);
    }
    if (tick % 15 === 0) {
      for (let id = 0; id < w.vegHp.length; id++) {
        if (hz.collapsing.has(id) || w.vegHp[id] > G.BUILDING_HP - cfg.collapseAfterHits || w.vegHp[id] <= 0) continue;
        if (w.vegCells[id].some((i) => w.map[i] === G.BUILDING)) hz.collapsing.set(id, tick + ticks(cfg.collapseSeconds));
      }
    }
    if (tick % G.TICK_RATE) return;
    for (const t of room.tanks) {
      if (!t?.alive) continue;
      const side = buildingBeside(w, t);
      if (!side) continue;
      const ramming = (t.input?.dx || t.input?.dy) && t.still > 5 && side.ahead;
      if (!ramming && rnd() >= cfg.chancePerSecond) continue;
      // gevel valt: puin tussen tank en gebouw, stof, en pantser kwijt
      const box = [Math.min(t.x, side.x) - 2, Math.min(t.y, side.y) - 2, Math.max(t.x, side.x) + 2, Math.max(t.y, side.y) + 2];
      G.collapseRubble(w, box);
      events.push({ t: 'fc', box });
      dust(room, box, events);
      hurt(t, ramming ? cfg.rammingLoss : cfg.armorLoss, events);
    }
  },
};
function boxOf(cells) {
  let x0 = G.W, y0 = G.H, x1 = 0, y1 = 0;
  for (const i of cells) { const x = i % G.W, y = (i / G.W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
const near = (t, [x0, y0, x1, y1], d) => t.x >= x0 - d - G.TANK_R && t.x <= x1 + d + G.TANK_R && t.y >= y0 - d - G.TANK_R && t.y <= y1 + d + G.TANK_R;
function dust(room, [x0, y0, x1, y1], events) {
  events.push({ t: 'smoke', x: (x0 + x1) >> 1, y: (y0 + y1) >> 1, r: Math.max(1.5 * G.T, (x1 - x0) / 2 + 4), s: room.rules.hazard.dustSeconds });
}
// staat er een gebouw direct naast de tank? ahead = in de rijrichting
function buildingBeside(w, t) {
  const [fx, fy] = G.DIRS[t.dir];
  for (let d = G.TANK_R + 1; d <= G.TANK_R + 2; d++) {
    const x = t.x + fx * d, y = t.y + fy * d;
    if (G.inBounds(x, y) && w.map[y * G.W + x] === G.BUILDING) return { x, y, ahead: true };
  }
  for (let k = 0; k < 8; k++) {
    const [dx, dy] = G.DIRS[k], x = t.x + dx * (G.TANK_R + 1), y = t.y + dy * (G.TANK_R + 1);
    if (G.inBounds(x, y) && w.map[y * G.W + x] === G.BUILDING) return { x, y, ahead: false };
  }
  return null;
}

// ---------- Weer met gevolgen voor de tanks (los van het gevaar van de kaart) ----------
// stofspoor (Barbarossa, zomer): wie over hard rijdt, geeft eens per dustEverySeconds een hint;
// modderseizoen (Barbarossa): dubbel brandstof op zacht en moeras; zoeklichten (Oder-front):
// een tegenstander in een bundel geeft iedereen een hint.
function weatherTankStep(room, t, info, events) {
  const f = room.wx?.flags || {}, w = room.world, cls = G.CLASSES[w.terrain[t.y * G.W + t.x]]?.name;
  if (f.dust && info.moved && cls === 'hard' && room.tick >= (t.nextDust || 0)) {
    t.nextDust = room.tick + ticks(HINTS.dustEverySeconds);
    events.push({ t: 'hint', x: t.x, y: t.y, i: t.id, kind: 'dust' });
  }
  if (f.mud && info.moved && (cls === 'soft' || cls === 'marsh') && w.map[t.y * G.W + t.x] === G.DIRT) t.fuel -= G.CLASSES[w.terrain[t.y * G.W + t.x]].fuel;
  if (f.searchlights && room.tick % 15 === 0 && room.tick >= (t.nextLight || 0) && searchlightAt(f.searchlights, room.tick - room.mapTick, t.x, t.y)) {
    t.nextLight = room.tick + ticks(f.searchlights.sweepSeconds / 2);
    events.push({ t: 'hint', x: t.x, y: t.y, i: t.id, kind: 'light' });
  }
}

const HAZARDS = { forestBarrage, grainFire, atGuns, bridgeBlast, artillery, facades };
const SCARCE = { fuelDepots, ammoDepot, airDrops };
const parts = (room) => [HAZARDS[room.rules.hazard?.type], SCARCE[room.rules.scarce?.type]].filter(Boolean);

// ---------- Meters (§10.3, 10.4, 10.5) ----------
// Een meter per tank (0..100, t.gauge), elke tick bijgewerkt; t.slow = snelheidsfactor
// (G.SPEED_ONE = normaal). De soorten staan in METERS (per kaart: meter.type in de config).
const METERS = {};
export function tankStep(room, t, info, events, hurt) {
  weatherTankStep(room, t, info, events);
  const m = room.rules.meter;
  if (!m || !METERS[m.type]) return;
  METERS[m.type](room, t, info, events, hurt);
  t.gauge = Math.max(0, Math.min(100, t.gauge));
}
export function registerMeter(type, fn) { METERS[type] = fn; }
const SLOW = (k) => Math.round(k * G.SPEED_ONE);
const cellsPerSecond = (t) => { // hoe hard rijdt de tank (gemeten over de laatste seconde)
  t.trail = t.trail || [];
  t.trail.push(t.moved ? 1 : 0);
  if (t.trail.length > G.TICK_RATE) t.trail.shift();
  return t.trail.reduce((a, b) => a + b, 0);
};
const inOwnBase = (room, t) => room.world.map[t.y * G.W + t.x] === G.BASE + t.id;
const classUnder = (room, t) => G.CLASSES[room.world.terrain[t.y * G.W + t.x]].name;

// Zandmeter (El Alamein, §10.3): per vak (T cellen gereden) +2 op zand, -5 op hard of verhard.
// Boven danger kost elk extra vak zand 1% pantser; bij 100 rijdt de tank 30% langzamer tot
// de meter weer onder danger is.
registerMeter('sand', (room, t, info) => {
  const m = room.rules.meter;
  if (!info.moved) return;
  t.meterState.cells = (t.meterState.cells || 0) + 1;
  if (t.meterState.cells < G.T) return;
  t.meterState.cells = 0;
  const cls = classUnder(room, t);
  if (cls === 'soft') {
    if (t.gauge > m.danger) t.shield = Math.max(0, t.shield - Math.round((m.armorPct * G.SHIELD_MAX) / 100));
    t.gauge += m.soft;
  } else if (cls === 'hard' || cls === 'paved') t.gauge += m.firm;
  if (t.gauge >= 100) t.slow = SLOW(m.slow);
  else if (t.gauge < m.danger) t.slow = G.SPEED_ONE;
});

// Motorwarmte (Leningrad, §10.4): stil of langzaam (onder 30% van de topsnelheid) -5 per
// seconde, rijden of in de eigen basis +10. Bij 0 bevroren: de tank komt in 4 s op snelheid.
// Na de dooi vervalt dit.
registerMeter('heat', (room, t, info) => {
  const m = room.rules.meter;
  t.moved = info.moved;
  const speed = cellsPerSecond(t);
  if (room.wx?.flags.thawed) { t.gauge = 100; t.slow = G.SPEED_ONE; return; }
  if (room.tick % G.TICK_RATE === 0) t.gauge += speed >= m.idleBelow * G.TICK_RATE || inOwnBase(room, t) ? m.warm : m.cool;
  if (t.gauge <= 0) t.meterState.frozen = true;
  const wants = t.input && (t.input.dx || t.input.dy);
  if (t.meterState.frozen) { // bevroren motor: langzaam op gang (4 s)
    t.meterState.ramp = wants ? (t.meterState.ramp || 0) + 1 : 0;
    const ramp = ticks(m.rampSeconds);
    t.slow = SLOW(Math.min(1, m.rampFrom + ((1 - m.rampFrom) * t.meterState.ramp) / ramp));
    if (t.meterState.ramp >= ramp && t.gauge > 0) { t.meterState.frozen = false; t.slow = G.SPEED_ONE; }
  }
});

// Motortemperatuur (Koersk, §10.5): boven 80% van de topsnelheid +4 per seconde, in een
// brandend vak +15; langzamer of stil -6; in de eigen basis -20. Bij 100 oververhit: hoogstens
// 40% snelheid tot de meter onder 50 is.
registerMeter('temp', (room, t, info) => {
  const m = room.rules.meter;
  t.moved = info.moved;
  const speed = cellsPerSecond(t);
  if (room.tick % G.TICK_RATE === 0) {
    if (isBurning(room, t.x, t.y)) t.gauge += m.fire;
    else if (inOwnBase(room, t)) t.gauge += m.base;
    else if (speed > m.fastAbove * G.TICK_RATE) t.gauge += m.fast;
    else t.gauge += m.idle;
  }
  if (t.gauge >= 100) t.meterState.hot = true;
  if (t.meterState.hot && t.gauge < m.coolTo) t.meterState.hot = false;
  t.slow = t.meterState.hot ? SLOW(m.hotSlow) : G.SPEED_ONE;
});

export function roundStart(room, events) {
  room.hz = room.hz || {};
  for (const p of parts(room)) p.roundStart?.(room, events);
}
export function step(room, tick, events, hurt) {
  smokeStep(room, tick, events);
  for (const p of parts(room)) p.step?.(room, tick, events, hurt);
}
// Een kogel is ergens geland (x, y): kans op brand (Koersk)
export function bulletLanded(room, x, y, events) {
  for (const p of parts(room)) p.bulletLanded?.(room, x, y, events);
}
// Een kogel op (x, y): raakt hij een object (geschut)? Dan true: de kogel is op.
export function bulletAt(room, x, y, events) {
  return parts(room).some((p) => p.bulletAt?.(room, x, y, events));
}
export function snapshot(room) {
  return Object.assign({}, ...parts(room).map((p) => p.snapshot?.(room) || {}));
}
