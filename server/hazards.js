// Gevaren en schaarse middelen per kaart (SPEC-blitzkrieg §10), alleen op de server: die gooit
// de dobbelsteen en stuurt wat er gebeurt naar iedereen. Gevaren zijn neutraal: ze treffen
// iedereen, een dood erdoor telt niet als kill, en wie geraakt wordt geeft de anderen een
// richtingshint (een groot geluid, §8).
//
// Een kaart heeft (config):
//   hazard  {type, ...}: forestBarrage, bridgeBlast, facades, bombardment
//   scarce  {type, ...}: fuelDepots, ammoDepot, airDrops
//   meter   {type, ...}: sand, heat, temp (per tank, zie METERS)
// De server roept aan: roundStart(room, events) bij elke nieuwe ronde (en bij het begin),
// step(room, tick, events, hurt) elke tick, en snapshot(room) voor het instapbericht.
// hurt(t, procent, events) haalt pantser af en laat de tank zo nodig ontploffen.
import * as G from '../shared/game.js';
import { HINTS, SMOKE } from '../shared/config.js';
import { searchlightAt, searchlightBeams } from '../shared/vision.js';

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
    const cfg = room.rules.scarce, w = room.world;
    // fixed: depots blijven het hele spel op dezelfde plek
    if (cfg.fixed && room.hz.depots?.length) {
      for (const d of room.hz.depots) d[2] = 1; // hervul
      events.push({ t: 'dep', list: room.hz.depots });
      return;
    }
    const n = typeof cfg.count === 'number' ? cfg.count : (cfg.count[room.size] ?? 2);
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
      t.fuel = G.effectiveMax(room.settings).fuel; // vol volgens de instelling van de wachtkamer
      const inf = !!room.rules.scarce.infinite;
      if (!inf) d[2] = 0;
      events.push({ t: 'depu', k, i: t.id, inf });
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
    const vs = room.world.villages?.filter((d) => d.depot === 'ammo') || [];
    room.hz.ammoDepots = vs.map((v) => [v.x, v.y]);
  },
  step(room, tick) {
    const ds = room.hz.ammoDepots, cfg = room.rules.scarce;
    if (!ds?.length || tick % Math.round(G.TICK_RATE / cfg.perSecond)) return;
    for (const d of ds) for (const t of room.tanks) if (t?.alive && Math.hypot(t.x - d[0], t.y - d[1]) <= cfg.radiusT * G.T) t.ammo = Math.min(G.effectiveMax(room.settings).ammo, t.ammo + 1);
  },
  snapshot(room) { return { ammoDepots: room.hz.ammoDepots }; },
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
export function battleSmoke(room, x, y, events) { // tank geraakt: rookvlek van 20 s
  if (room.wx?.flags.battleSmoke) events.push({ t: 'smoke', x, y, r: SMOKE.battle.rT * G.T, s: SMOKE.battle.seconds });
}

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
    if ((room.wx?.flags.drops || cfg.always) && tick >= hz.nextDrop) {
      hz.nextDrop = tick + ticks(cfg.everySeconds);
      const count = cfg.dropCount || 1;
      for (let d = 0; d < count; d++) {
        for (let tries = 0; tries < 300; tries++) {
          const x = Math.floor(rnd() * G.W), y = Math.floor(rnd() * G.H), v = w.map[y * G.W + x];
          if ((v !== G.DIRT && v !== G.EMPTY) || w.border?.[y * G.W + x]) continue;
          const crate = [x, y, rnd() < 0.5 ? 'fuel' : 'ammo', 1];
          hz.crates.push(crate);
          events.push({ t: 'drop', k: hz.crates.length - 1, c: crate });
          break;
        }
      }
    }
    const max = G.effectiveMax(room.settings); // een krat vult een deel van de tank van dit spel
    hz.crates.forEach((c, k) => {
      if (!c[3]) return;
      const t = room.tanks.find((o) => o?.alive && Math.abs(o.x - c[0]) <= 4 && Math.abs(o.y - c[1]) <= 4);
      if (!t) return;
      if (c[2] === 'fuel') t.fuel = Math.min(max.fuel, t.fuel + cfg.fuel * max.fuel); else t.ammo = Math.min(max.ammo, t.ammo + cfg.ammo);
      c[3] = 0;
      events.push({ t: 'dropu', k, i: t.id });
    });
  },
  snapshot(room) { return { crates: room.hz.crates || [] }; },
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

// ---------- Bombardement (Ardennen §10.8, Seelow §10.9) ----------
// Twee modi: barrage (tijdgestuurd gebiedsbombardement, cfg.levels) en salvo (event-getriggerd
// gericht vuur op een doel, cfg.salvo). Een map kan één of beide gebruiken.
// Barrage: drie zwaartegraden (licht/gemiddeld/zwaar), inslagen verspreid over durationSeconds
// in een areaT×areaT-gebied. Triggers: timer (everySeconds/intervals[]) of host (hostBarrage).
// Salvo: zoeklicht vangt tank → beam volgt → escalerende inslagen (lock-in).
const bombardment = {
  roundStart(room) {
    const cfg = room.rules.hazard;
    room.hz.active = room.hz.active || [];
    room.hz.barrageCount = 0;
    const first = cfg.intervals ? cfg.intervals[0] : cfg.everySeconds;
    room.hz.next = first ? room.tick + ticks(first) : Infinity;
  },
  step(room, tick, events, hurt) {
    const cfg = room.rules.hazard, hz = room.hz, w = room.world;
    const half = ((cfg.areaT || 3) * G.T) / 2;
    // lopende bombardementen: inslagen verspreid over durationSeconds
    for (let k = hz.active.length - 1; k >= 0; k--) {
      const b = hz.active[k];
      if (tick >= b.end) {
        hz.active.splice(k, 1);
        const ev = { t: 'zb', box: b.box, kind: 'bomb' };
        if (cfg.craters) {
          const craters = b.impacts.map(([x, y, r]) => [x, y, r]);
          G.markArtillery(w, b.box, craters);
          ev.craters = craters;
        }
        events.push(ev);
        continue;
      }
      // inslagen uit de vooraf gekozen lijst, gelijkmatig verdeeld over [start, end)
      while (b.nextIdx < b.impacts.length) {
        const frac = b.nextIdx / b.impacts.length;
        if (tick < b.start + Math.round(frac * (b.end - b.start))) break;
        const [ix, iy, r] = b.impacts[b.nextIdx++];
        if (cfg.destroysPine) G.blastVegetation(w, ix, iy, r);
        events.push({ t: 'zi', x: ix, y: iy, r, ...(cfg.destroysPine ? { v: 1 } : {}) });
        for (const t of room.tanks) if (t?.alive && t.x >= b.box[0] && t.x <= b.box[2] && t.y >= b.box[1] && t.y <= b.box[3]) hurt(t, b.armorLoss, events);
      }
    }
    // zoeklicht-salvo: bundel volgt de tank, escalerende inslagen (lock-in)
    if (cfg.salvo && room.wx?.flags?.searchlights) {
      const slCfg = room.wx.flags.searchlights;
      const sv = cfg.salvo;
      hz.stuckBeams ??= new Map();
      const beamRx = ((slCfg.lengthT || slCfg.widthT) * G.T) / 2;
      const beamRy = (slCfg.widthT * G.T) / 2;
      const trackPx = (slCfg.trackSpeedT || 3) * G.T / G.TICK_RATE;
      const sr = slCfg.sweepRect;
      // stuck beams: volg de tank, vuur salvo's, laat los als ontsnapt
      for (const [beam, st] of [...hz.stuckBeams]) {
        const target = room.tanks.find((o) => o?.id === st.tankId);
        if (!target?.alive || (sr && target.x < sr[0] * G.W)) {
          hz.stuckBeams.delete(beam);
          events.push({ t: 'slr', beam });
          continue;
        }
        // beam volgt de tank met beperkte snelheid
        const dx = target.x - st.x, dy = target.y - st.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > trackPx) { st.x += dx / dist * trackPx; st.y += dy / dist * trackPx; }
        else { st.x = target.x; st.y = target.y; }
        // tank buiten de beam-ellips? (te snel voor het zoeklicht)
        if (((target.x - st.x) / beamRx) ** 2 + ((target.y - st.y) / beamRy) ** 2 > 1) {
          hz.stuckBeams.delete(beam);
          events.push({ t: 'slr', beam });
          continue;
        }
        // escalerende inslagen
        if (tick >= st.nextStrike) {
          const scatter = Math.max(sv.endScatterT, sv.startScatterT * sv.scatterDecay ** st.strikeCount) * G.T;
          const nImpacts = Math.min(sv.maxImpacts, 1 + Math.floor(st.strikeCount / 2));
          for (let i = 0; i < nImpacts; i++) {
            const angle = rnd() * Math.PI * 2, rd = rnd() * scatter;
            const ix = Math.round(target.x + Math.cos(angle) * rd);
            const iy = Math.round(target.y + Math.sin(angle) * rd);
            const cr = 1 + Math.floor(rnd() * 2);
            events.push({ t: 'zi', x: ix, y: iy, r: cr, ...(sv.craters ? { cr: 1 } : {}) });
            if (sv.craters) G.markArtillery(w, [ix - cr, iy - cr, ix + cr, iy + cr], [[ix, iy, cr]]);
            const sR = sv.strikeRadius * G.T;
            for (const t of room.tanks) {
              if (t?.alive && Math.abs(t.x - ix) <= sR && Math.abs(t.y - iy) <= sR) hurt(t, sv.strikeDamage, events);
            }
          }
          st.strikeCount++;
          const interval = Math.max(sv.minInterval, sv.baseInterval - st.strikeCount * sv.intervalStep);
          st.nextStrike = tick + ticks(interval);
        }
      }
      // detectie: vrije bundels zoeken tanks
      const beams = searchlightBeams(slCfg, tick - room.mapTick, hz.stuckBeams);
      for (const t of room.tanks) {
        if (!t?.alive) continue;
        for (let k = 0; k < beams.length; k++) {
          if (hz.stuckBeams.has(k)) continue;
          const b = beams[k];
          if (((t.x - b.cx) / b.rx) ** 2 + ((t.y - b.cy) / b.ry) ** 2 <= 1) {
            hz.stuckBeams.set(k, {
              tankId: t.id, x: t.x, y: t.y,
              nextStrike: tick + ticks(sv.firstStrikeSeconds), strikeCount: 0,
            });
            events.push({ t: 'sls', beam: k, x: t.x, y: t.y, i: t.id });
            break;
          }
        }
      }
    }
    // timer-gebaseerd bombardement (vast interval of versnellend), alleen als levels bestaan
    if (cfg.levels && tick >= hz.next) {
      const { x, y } = bombardmentCenter(room, cfg, half);
      startBombardment(hz, tick, x, y, half, cfg, events);
      hz.barrageCount++;
      const iv = cfg.intervals
        ? cfg.intervals[Math.min(hz.barrageCount, cfg.intervals.length - 1)]
        : cfg.everySeconds;
      hz.next = iv ? tick + ticks(iv) : Infinity;
    }
  },
  snapshot(room) {
    const out = {
      barrage: room.hz.active?.map((b) => ({ box: b.box, level: b.level, end: b.end, impacts: b.impacts })) || [],
    };
    if (room.hz.stuckBeams?.size) out.stuckBeams = [...room.hz.stuckBeams].map(([k, v]) => [k, v.x, v.y, v.tankId]);
    return out;
  },
};
// Bepaal het centrum van een bombardement: nabij een levende speler of willekeurig op de kaart
function bombardmentCenter(room, cfg, half) {
  if (cfg.nearPlayer) {
    const alive = room.tanks.filter((t) => t?.alive);
    if (alive.length) {
      const target = alive[Math.floor(rnd() * alive.length)];
      const angle = rnd() * Math.PI * 2, dist = rnd() * (cfg.nearOffsetT || 0) * G.T;
      const x = Math.round(Math.max(half, Math.min(G.W - half, target.x + Math.cos(angle) * dist)));
      const y = Math.round(Math.max(half, Math.min(G.H - half, target.y + Math.sin(angle) * dist)));
      return { x, y };
    }
  }
  return { x: Math.round(half + rnd() * (G.W - 2 * half)), y: Math.round(half + rnd() * (G.H - 2 * half)) };
}
function pickLevel(levels) {
  const total = Object.values(levels).reduce((a, l) => a + l.weight, 0);
  let r = rnd() * total;
  for (const [name, l] of Object.entries(levels)) { r -= l.weight; if (r <= 0) return [name, l]; }
  const last = Object.entries(levels).at(-1);
  return last;
}
function startBombardment(hz, tick, cx, cy, half, cfg, events) {
  const [level, lv] = pickLevel(cfg.levels);
  const box = [Math.round(cx - half), Math.round(cy - half), Math.round(cx + half), Math.round(cy + half)];
  const ds = cfg.durationSeconds;
  const dur = ticks(Array.isArray(ds) ? ds[0] + rnd() * (ds[1] - ds[0]) : (ds || 3));
  // alle inslagposities vooraf kiezen
  const impacts = [];
  for (let k = 0; k < lv.impacts; k++) {
    impacts.push([
      Math.round(box[0] + rnd() * (box[2] - box[0])),
      Math.round(box[1] + rnd() * (box[3] - box[1])),
      2 + Math.floor(rnd() * 2),
    ]);
  }
  const warnEnd = tick + ticks(cfg.warningSeconds);
  hz.active.push({
    box, level, armorLoss: lv.armorLoss, impacts, nextIdx: 0,
    start: warnEnd, end: warnEnd + dur,
  });
  events.push({ t: 'z', box, at: warnEnd, kind: 'bomb', level, impacts });
}

const HAZARDS = { forestBarrage, bridgeBlast, facades, bombardment };
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
const inOwnBase = (room, t) => room.world.map[t.y * G.W + t.x] === G.BASE + G.baseIndex(t.id, room.gameMode);
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
    if (t.gauge > m.danger) t.shield = Math.max(0, t.shield - Math.round((m.armorPct * G.effectiveMax(room.settings).shield) / 100));
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

// Motortemperatuur (Koersk, §10.5): boven 80% van de topsnelheid +4 per seconde, langzamer of
// stil -6; in de eigen basis -20. Bij 100 oververhit: hoogstens
// 40% snelheid tot de meter onder 50 is.
registerMeter('temp', (room, t, info) => {
  const m = room.rules.meter;
  t.moved = info.moved;
  const speed = cellsPerSecond(t);
  if (room.tick % G.TICK_RATE === 0) {
    if (inOwnBase(room, t)) t.gauge += m.base;
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
// Host drukt B: extra bombardement nabij een speler (telt niet mee voor de versnelling)
export function hostBarrage(room, events) {
  const cfg = room.rules.hazard;
  if (!cfg?.levels) return;
  const half = ((cfg.areaT || 3) * G.T) / 2;
  const { x, y } = bombardmentCenter(room, cfg, half);
  startBombardment(room.hz, room.tick, x, y, half, cfg, events);
}
export function snapshot(room) {
  return Object.assign({}, ...parts(room).map((p) => p.snapshot?.(room) || {}));
}
