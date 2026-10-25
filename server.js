// Autoritatieve Tunneler-server: draait de echte simulatie op 30 ticks/sec,
// ontvangt alleen input van spelers en stuurt delta's + gebeurtenissen terug.
// Er zijn meerdere "rooms" (aparte potjes), elk met hun eigen kaart en regels.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as G from './shared/game.js';
import * as Weather from './shared/weather.js';
import * as Hazards from './hazards.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const ALLOWED = [path.join(ROOT, 'public'), path.join(ROOT, 'shared')];
// Pakketten voor de weergave (PixiJS e.d.), rechtstreeks uit node_modules: alleen deze bestanden.
// De stijlpagina's koppelen de namen eraan met een import map.
const VENDOR = {
  '/vendor/pixi.mjs': 'node_modules/pixi.js/dist/pixi.min.mjs',
  '/vendor/pixi-filters.mjs': 'node_modules/pixi-filters/dist/pixi-filters.mjs',
  '/vendor/simplex-noise.mjs': 'node_modules/simplex-noise/dist/esm/simplex-noise.js',
};

// ---------- Statische bestanden ----------
// / is het spel (BLITZKRIEG), /retro het originele Tunneler. De weergaves (1944.html enz.)
// worden door de spelpagina ingeladen. Oude adressen sturen door naar het spel.
const PAGES = {
  '/': 'public/index.html',
  '/retro': 'public/retro.html',
};
const OLD_PAGES = new Set(['/1944', '/1943', '/1942', '/koersk', '/leningrad']);
const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { urlPath = '/'; }
  if (OLD_PAGES.has(urlPath)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
  const rel = VENDOR[urlPath] || PAGES[urlPath] || (urlPath.startsWith('/shared/') ? urlPath.slice(1) : 'public' + urlPath);
  const file = path.join(ROOT, rel);
  if (!VENDOR[urlPath] && !ALLOWED.some((d) => file.startsWith(d + path.sep))) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- Instellingen (via omgevingsvariabelen, handig voor tests) ----------
const FIXED_SEED = process.env.TUNNELER_SEED ? Number(process.env.TUNNELER_SEED) >>> 0 : null; // vaste kaart (tests)
const HEARTBEAT_MS = 5000; // zo vaak pingen; wie niet antwoordt, wordt afgesloten
const MAX_MSGS_PER_SEC = 60; // meer berichten van één speler negeren we
const MAX_PAYLOAD = 4 * 1024; // spelers sturen alleen kleine berichten
// Spelregels; de tests zetten roundsToWin lager om een heel spel snel uit te spelen
const GAME = { ...G.GAME, roundsToWin: Number(process.env.TUNNELER_ROUNDS_TO_WIN) || G.GAME.roundsToWin };
// Weerklok: de tests laten het weer sneller lopen (0.05 = twintig keer zo snel)
const WEATHER_SCALE = Number(process.env.TUNNELER_WEATHER_SCALE) || 1;

// ---------- Rooms ----------
// Het spel op / speelt in het potje 'blitzkrieg'; retro (/retro) en de tests in een vast potje per kaart.
const rooms = new Map();
let nextUid = 1; // uniek per verbinding, ook als een plek opnieuw gebruikt wordt

// Potjes:
// - 'blitzkrieg' (de pagina op /): een wachtkamer. De host (wie het langst meedoet) kiest de
//   kaart en de grootte en drukt op start; daarna is het een gewoon spel. Na de winst terug
//   naar de wachtkamer.
// - een kaart-id (retro, carentan, ...): vaste kaart, het spel begint meteen (retro en de tests).
//   size: kaartgrootte (config MAP_SIZES); geldt alleen als het potje nog leeg is.
const LOBBY = 'blitzkrieg';
function getRoom(name, size) {
  if (name !== LOBBY && !Object.hasOwn(G.MAPS, name)) name = 'carentan';
  let room = rooms.get(name);
  if (!room) {
    const lobby = name === LOBBY, mapId = lobby ? G.DEFAULT_MAP : name;
    room = {
      name, lobby, mapId, rules: G.MAPS[mapId], tick: 0, bullets: [], nextBulletId: 1, pendingEvents: [],
      tanks: new Array(G.MAX_PLAYERS).fill(null), host: -1,
    };
    rooms.set(name, room);
    if (lobby) { room.size = G.DEFAULT_SIZE; newWorld(room); }
  }
  if (!room.lobby && !room.tanks.some(Boolean) && room.size !== (G.MAP_SIZES[size] ? size : G.DEFAULT_SIZE)) {
    room.size = G.MAP_SIZES[size] ? size : G.DEFAULT_SIZE;
    newWorld(room);
  }
  return room;
}

// Host: wie van de spelers die er nu zijn het eerst instapte
function hostOf(room) {
  let host = null;
  for (const t of room.tanks) if (t && (!host || t.uid < host.uid)) host = t;
  return host ? host.id : -1;
}

// De host kiest een kaart en grootte: nieuwe kaart voor iedereen. In de wachtkamer wacht die
// op START; tijdens een spel begint er meteen een nieuw spel (ronde 1, scores 0) op de nieuwe kaart.
function configure(room, t, mapId, size) {
  if (!room.lobby || t.id !== hostOf(room)) return;
  if (!Object.hasOwn(G.MAPS, mapId) || mapId === 'retro' || !Object.hasOwn(G.MAP_SIZES, size)) return;
  if (room.tanks.filter(Boolean).length > G.MAP_SIZES[size].maxPlayers) return; // te veel spelers voor deze grootte
  if (mapId === room.mapId && size === room.size) return;
  const old = [room.mapId, room.size], playing = room.phase !== 'lobby';
  room.mapId = mapId;
  room.rules = G.MAPS[mapId];
  room.size = size;
  if (newGame(room)) { if (playing) beginPlay(room, room.pendingEvents); return; }
  // de bases passen niet (te veel spelers voor deze kaartgrootte): terug en melden in het menu
  [room.mapId, room.size] = old;
  room.rules = G.MAPS[room.mapId];
  newGame(room);
  if (playing) beginPlay(room, room.pendingEvents);
  room.pendingEvents.push({ t: 'err', msg: 'De bases passen niet op deze kaartgrootte: kies een grotere kaart.' });
}

// De host start het spel
function startGame(room, t, events) {
  if (!room.lobby || room.phase !== 'lobby' || t.id !== hostOf(room)) return;
  beginPlay(room, events);
}
function beginPlay(room, events) {
  room.phase = 'play';
  room.mapTick = room.roundTick = room.tick; // storm- en weerklok beginnen nu
  events.push({ t: 'n', n: room.round, m0: room.mapTick, r0: room.roundTick });
  Hazards.roundStart(room, events);
}

// Alles wat met de kaart van een potje rekent, zet eerst de kaartmaat van dat potje
function useRoom(room) {
  const { w, h } = G.sizeDims(room.size);
  G.setMapSize(w, h);
}

function newWorld(room) {
  useRoom(room);
  const seed = FIXED_SEED ?? (Math.random() * 2 ** 32) >>> 0;
  // zoveel bases als er spelers op deze kaartgrootte mogen
  try {
    room.world = G.generateMap(seed, room.rules, G.MAP_SIZES[room.size].maxPlayers);
  } catch (err) {
    if (err.message !== 'BASES') throw err;
    return false;
  }
  room.mines = new Set(room.world.mines);
  room.mapTick = room.tick; // begin van deze kaart (mist in de Ardennen, stormklok)
  room.roundTick = room.tick; // begin van de ronde (weer per ronde)
  room.hz = {};
  if (!room.lobby) Hazards.roundStart(room, []); // depots e.d. (staan in het instapbericht)
  room.bullets = [];
  // nieuw spel: ronde 1, scores op 0
  room.round = 1;
  room.phase = room.lobby ? 'lobby' : 'play'; // lobby (wachtkamer) | play | pause (tussen rondes) | over (winnaar in beeld)
  room.phaseEnd = 0;
  room.roundWinner = -1;
  room.winner = -1;
  for (const t of room.tanks) if (t) { t.rounds = 0; t.kills = 0; }
  const kb = (G.rleEncode(room.world.map).length / 1024).toFixed(1);
  const mines = room.rules.mines ? `, ${room.mines.size} mijnen in ${room.world.fields.length} velden` : '';
  console.log(`[${room.name}] nieuwe kaart ${G.W}x${G.H} (${room.size}, seed ${seed}), snapshot ${kb} KB${mines}`);
  return true;
}

function spawn(room, t) {
  const b = room.world.bases[t.id];
  Object.assign(t, {
    x: b.x, y: b.y, dir: 0, alive: true, cooldown: 0, mv: 0, iceBlock: -1, wetTicks: 0, still: 0, buried: false,
    gauge: room.rules.meter?.start ?? 0, slow: G.SPEED_ONE, meterState: {},
    fuel: G.FUEL_MAX, shield: G.SHIELD_MAX, ammo: G.AMMO_MAX,
  });
}

// killerUid = null: dood door een gevaar, het weer of lege brandstof; dat telt voor niemand
function kill(room, t, killerUid, events) {
  t.alive = false;
  G.digStar(room.world, t.x, t.y, G.DEATH_DIG_R);
  events.push({ t: 'k', i: t.id, x: t.x, y: t.y, r: G.DEATH_DIG_R });
  // kill voor de schutter, alleen als die nog meedoet (niet voor een nieuwe speler op zijn plek)
  const killer = killerUid != null && room.tanks.find((o) => o && o.uid === killerUid);
  if (killer && killer !== t) killer.kills++;
}

// Pantser kwijt door een gevaar of het weer (procent van vol): de anderen krijgen een hint,
// en een dood telt voor niemand als kill
function hurt(room, t, pct, events) {
  t.shield = Math.max(0, t.shield - Math.round((pct * G.SHIELD_MAX) / 100));
  events.push({ t: 'hint', x: t.x, y: t.y, i: t.id });
  if (t.shield === 0) kill(room, t, null, events);
}

// ---------- Rondes (§2) ----------
// Er is iemand dood: de ronde is voorbij. Winnaar van de ronde bepalen (2 spelers), kijken of
// het spel gewonnen is, en dan even pauzeren (of de winnaar tonen).
function endRound(room, events) {
  const players = room.tanks.filter(Boolean);
  room.roundWinner = G.roundWinner(players);
  if (room.roundWinner >= 0) room.tanks[room.roundWinner].rounds++;
  room.winner = G.gameWinner(players, GAME);
  room.bullets = [];
  if (room.winner >= 0) {
    room.phase = 'over';
    room.phaseEnd = room.tick + GAME.gameOverSeconds * G.TICK_RATE;
    events.push({ t: 'g', w: room.winner, left: room.phaseEnd - room.tick });
  } else {
    room.phase = 'pause';
    room.phaseEnd = room.tick + GAME.roundPauseSeconds * G.TICK_RATE;
    events.push({ t: 'r', n: room.round, w: room.roundWinner, left: room.phaseEnd - room.tick });
  }
}

// Volgende ronde: iedereen terug naar zijn basis met alles vol; de kaart blijft zoals hij is,
// behalve wat het weer bij deze ronde verandert (dooi, modder, ...)
function newRound(room, events) {
  room.round++;
  room.phase = 'play';
  room.roundWinner = -1;
  room.roundTick = room.tick;
  for (const t of room.tanks) if (t) spawn(room, t);
  events.push({ t: 'n', n: room.round, r0: room.roundTick });
  Hazards.roundStart(room, events);
  for (const { change, stage } of Weather.terrainChangesAt(room.rules, room.round)) {
    const extra = G.terrainChangeExtra(room.world, change, room.world.bases, stage);
    G.applyTerrainChange(room.world, change, extra);
    events.push({ t: 'W', change, extra });
  }
}

// Spel uit: nieuw spel met een nieuwe kaart. Iedereen krijgt een nieuw instapbericht.
function newGame(room) {
  if (!newWorld(room)) return false;
  room.pendingEvents = [];
  const players = room.tanks.filter(Boolean);
  for (const t of players) { spawn(room, t); t.sent = {}; }
  for (const t of players) sendInit(room, t);
  return true;
}

// Volledige snapshot voor één speler: bij het instappen en bij een nieuw spel (nieuwe kaart).
// Daarna alleen nog delta's en gebeurtenissen.
function sendInit(room, t) {
  const players = room.tanks.filter(Boolean);
  const init = {
    t: 'init', you: t.id, k: room.tick, w: G.W, h: G.H, size: room.size,
    map: G.toBase64(G.rleEncode(room.world.map)),
    tanks: players.map((o) => ({ i: o.id, ...(o === t || !Object.keys(o.sent).length ? tankFields(o, players.length) : o.sent) })),
    bullets: room.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, d: b.d })),
    terrain: G.toBase64(G.rleEncode(room.world.terrain)),
    track: G.toBase64(G.rleEncode16(room.world.track)), // exacte sporen, daarna rekent de client zelf mee
    veg: G.toBase64(G.rleEncode16(room.world.veg)), // welke plant waar staat
    vh: [...room.world.vegHp], // treffers die elke plant nog kan hebben
    scar: G.toBase64(G.rleEncode(room.world.scar)), // gaten van weggeschoten planten
    ice: G.toBase64(G.rleEncode(room.world.ice)), // passages per ijsvak (barsten)
    room: room.name,
    mapId: room.mapId, // welke kaart; de instellingen staan in config.js
    lobby: room.lobby, host: hostOf(room),
    lm: room.world.landmarks || [], // herkenningspunten (kerk) in dorpen
    m0: room.mapTick, r0: room.roundTick, wx: WEATHER_SCALE,
    hz: Hazards.snapshot(room), // depots, aangekondigde barrage
    game: gameState(room),
  };
  if (room.rules.mines) init.mines = [...room.mines]; // de velden zelf blijven geheim
  t.ws.send(JSON.stringify(init));
}

// Stand van het spel voor het instapbericht
const gameState = (room) => ({ round: room.round, phase: room.phase, left: Math.max(0, room.phaseEnd - room.tick), w: room.winner, rw: room.roundWinner })

// IJs onder de tank (Leningrad). Rijdt het midden van de tank een nieuw ijsvak in, dan telt
// dat als passage en gooit de server de dobbelsteen; breekt het, dan krijgen alle clients het
// vaknummer en maken ze zelf hetzelfde wak. Staat de tank in het water, dan loopt zijn pantser
// leeg (ICE.sinkDamagePerSecond). Geeft true als de tank daardoor dood is.
const SINK_EVERY = Math.max(1, Math.round(G.TICK_RATE / G.ICE.sinkDamagePerSecond));
function iceStep(room, t, events) {
  const w = room.world, i = t.y * G.W + t.x;
  const b = G.iceBlockAt(t.x, t.y);
  if (b !== t.iceBlock) {
    t.iceBlock = b;
    if (G.isIce(w, i)) {
      const n = w.ice[b] = Math.min(255, w.ice[b] + 1);
      events.push({ t: 'c', b, n, i: t.id });
      if (Math.random() < G.iceBreakChance(n)) { G.breakIce(w, b); events.push({ t: 'w', b, i: t.id }); }
    }
  }
  if (G.waterUnder(w.map, t.x, t.y, t.dir) > 0) {
    if (++t.wetTicks % SINK_EVERY === 0) t.shield = Math.max(0, t.shield - 1);
    if (t.shield === 0) { kill(room, t, null, events); return true; }
  } else t.wetTicks = 0;
  return false;
}

// Velden die naar alle clients gaan. Brandstof als percentage: verandert minder vaak = minder bytes.
// c = score volgens de telwijze van nu (gewonnen rondes bij 2 spelers, anders kills).
function tankFields(t, players) {
  return {
    x: t.x, y: t.y, d: t.dir, a: t.alive ? 1 : 0,
    f: Math.ceil((t.fuel * 100) / G.FUEL_MAX), s: t.shield, m: t.ammo, c: G.score(t, players), b: t.buried ? 1 : 0,
    g: Math.round(t.gauge ?? 0), v: t.slow ?? G.SPEED_ONE, // meter van de kaart (zand, warmte, temperatuur) en snelheidsfactor
  };
}

function step(room) {
  const tick = ++room.tick;
  const events = room.pendingEvents;
  room.pendingEvents = [];
  const w = room.world, map = w.map;
  const live = room.tanks.filter(Boolean);
  if (!live.length) return;
  useRoom(room);
  const dig = G.bulletsDig(room.rules);

  const host = hostOf(room);
  if (host !== room.host) { room.host = host; events.push({ t: 'h', i: host }); }

  // Tussen rondes of na de winst staat alles stil; daarna verder met een nieuwe ronde of spel.
  // In de wachtkamer staat alles stil tot de host start.
  if ((room.phase === 'pause' || room.phase === 'over') && tick >= room.phaseEnd) {
    if (room.phase === 'over') { newGame(room); return; }
    newRound(room, events);
  }
  const playing = room.phase === 'play';
  const deaths = live.filter((t) => !t.alive).length;
  // het weer van nu (zicht rekent elke client zelf uit; hier: sporenwisser en onderduiken)
  const wx = room.wx = Weather.weatherAtTick(room.rules, room.round, tick, room.mapTick, room.roundTick, WEATHER_SCALE);

  // 1. Kogels (een treffer op begroeiing kost die plant een leven; clients zien in het
  // 'x'-bericht dat er een plant staat en doen hetzelfde)
  if (playing) room.bullets = room.bullets.filter((b) => {
    const hit = G.stepBullet(b, map, live, dig);
    if (!hit && Hazards.bulletAt(room, b.x, b.y, events)) { events.push({ t: 'x', id: b.id, x: b.x, y: b.y, r: 0, o: b.owner }); return false; }
    if (!hit) return true;
    Hazards.bulletLanded(room, b.x - G.DIRS[b.d][0], b.y - G.DIRS[b.d][1], events);
    const r = hit.kind === 'dirt' ? G.BULLET_DIG_R : hit.kind === 'tank' && dig ? G.HIT_DIG_R : 0;
    G.digStar(w, b.x, b.y, r);
    if (hit.kind === 'solid') G.hitObstacle(w, b.x, b.y);
    events.push({ t: 'x', id: b.id, x: b.x, y: b.y, r, o: b.owner }); // o: van wie de kogel was
    if (hit.kind === 'tank') {
      Hazards.battleSmoke(room, b.x, b.y, events); // vuurgevecht laat rook achter (Koersk)
      hit.tank.shield = Math.max(0, hit.tank.shield - G.BULLET_DAMAGE);
      if (hit.tank.shield === 0) kill(room, hit.tank, b.ownerUid, events);
    }
    return false;
  });

  // 2. Tanks (een dode tank wacht op de volgende ronde)
  for (const t of live) {
    if (!t.alive || !playing) { t.selfDestruct = false; continue; }
    // Zelfvernietiging: al het pantser weg en dood; telt voor niemand als kill
    if (t.selfDestruct) { t.selfDestruct = false; t.shield = 0; kill(room, t, null, events); continue; }
    if (t.cooldown > 0) t.cooldown--;

    if (map[t.y * G.W + t.x] === G.BASE + t.id) {
      // In eigen basis: bijtanken en repareren, tenzij de kaart dat schaars maakt (refill)
      const refill = room.rules.refill || {};
      if (refill.fuel !== false) t.fuel = Math.min(G.FUEL_MAX, t.fuel + 15);
      if (refill.armor !== false && tick % 4 === 0) t.shield = Math.min(G.SHIELD_MAX, t.shield + 1);
      if (refill.ammo !== false && tick % 6 === 0) t.ammo = Math.min(G.AMMO_MAX, t.ammo + 1);
    } else if (tick % G.IDLE_DRAIN_EVERY === 0) {
      t.fuel--;
    }

    // Rijden met de gedeelde regels (dezelfde die de browser gebruikt om te voorspellen)
    const px = t.x, py = t.y;
    G.moveTank(t, w, live.filter((o) => o !== t && o.alive));
    // Onderduiken (§5.7): 2 seconden stil in een storm = bedekt, tot de tank rijdt of schiet
    if (t.x !== px || t.y !== py || (t.input.fire && t.ammo > 0)) { t.still = 0; t.buried = false; }
    else if (++t.still >= G.BURIAL_TICKS && wx.burial) t.buried = true;
    // meters van de kaart (zand, motorwarmte, motortemperatuur): zie hazards.js
    Hazards.tankStep(room, t, { moved: t.x !== px || t.y !== py, wx }, events, (tank, pct, ev) => hurt(room, tank, pct, ev));
    if (!t.alive) continue;
    // Voor de voorspelling: hoeveel ticks deze invoer (volgnummer) al is toegepast
    if (t.seq !== t.ackSeq) { t.ackSeq = t.seq; t.seqTicks = 0; }
    t.seqTicks++;

    // Mijnen: alles wat onder de tank ligt ontploft
    if (room.mines.size) {
      for (const i of G.minesUnder(room.mines, t.x, t.y, t.dir)) {
        room.mines.delete(i);
        const mx = i % G.W, my = (i / G.W) | 0;
        G.digStar(w, mx, my, G.MINE_DIG_R);
        events.push({ t: 'm', x: mx, y: my, r: G.MINE_DIG_R, i: t.id });
        t.shield = Math.max(0, t.shield - G.MINE_DAMAGE);
      }
      if (t.shield === 0) { kill(room, t, null, events); continue; }
    }

    if (t.input.fire && t.cooldown === 0 && t.ammo > 0) {
      const [fx, fy] = G.DIRS[t.dir];
      const b = { id: room.nextBulletId++, owner: t.id, ownerUid: t.uid, x: t.x + fx * (G.TANK_R + 1), y: t.y + fy * (G.TANK_R + 1), d: t.dir, fresh: true };
      room.bullets.push(b);
      t.ammo--;
      t.cooldown = G.FIRE_COOLDOWN;
      events.push({ t: 'b', id: b.id, x: b.x, y: b.y, d: b.d, i: t.id }); // i: wie schoot (voor de hint)
    }

    if (iceStep(room, t, events)) continue;

    if (t.fuel <= 0) { t.fuel = 0; kill(room, t, null, events); }
  }

  // gevaren en schaarse middelen van deze kaart
  if (playing) Hazards.step(room, tick, events, (t, pct, ev) => hurt(room, t, pct, ev));

  if (playing && live.filter((t) => !t.alive).length > deaths) endRound(room, events);

  // Graaf de tankvorm uit op de huidige plek en richting (clients doen exact hetzelfde)
  for (const t of live) {
    if (!t.alive) continue;
    G.digTank(w, t.x, t.y, t.dir);
    G.touchTank(w, t.x, t.y, t.dir); // bereden tunnels krijgen een vers spoor
  }
  // Sporen vervagen per terreinklasse (tijdens de storm sneller); op 0 loopt een tunnel dicht
  G.fadeStep(w, tick, playing && wx.eraser);

  // 3. Delta-compressie: alleen velden die veranderd zijn sinds de vorige tick
  const p = [];
  for (const t of live) {
    const cur = tankFields(t, live.length);
    const entry = { i: t.id };
    let changed = false;
    for (const k in cur) {
      if (t.sent[k] !== cur[k]) { entry[k] = cur[k]; t.sent[k] = cur[k]; changed = true; }
    }
    if (changed) p.push(entry);
  }

  // Altijd een bericht sturen: het is ook de klok waarop clients kogels laten bewegen.
  // Iedere speler krijgt er een eigen stukje bij (y): de bevestiging voor de voorspelling.
  const msg = { t: 's', k: tick };
  if (p.length) msg.p = p;
  if (events.length) msg.e = events;
  const base = JSON.stringify(msg).slice(0, -1);
  for (const t of live) {
    if (t.ws.readyState !== 1) continue;
    const ack = t.alive ? `,"y":[${t.seq},${t.seqTicks},${t.mv}]` : '';
    t.ws.send(base + ack + '}');
  }
}

// Vaste tijdstap, ook als setTimeout wat uitloopt
const TICK_MS = 1000 / G.TICK_RATE;
let nextTick = performance.now();
function loop() {
  const now = performance.now();
  if (now - nextTick > 1000) nextTick = now; // niet inhalen na een lange pauze
  while (now >= nextTick) {
    for (const room of rooms.values()) step(room);
    nextTick += TICK_MS;
  }
  setTimeout(loop, Math.max(0, nextTick - performance.now()));
}
loop();

// ---------- Netwerk ----------
// Grote berichten (het instapbericht) gaan gecomprimeerd; de kleine tickberichten niet,
// dat kost meer rekenwerk dan het bespaart.
const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD, perMessageDeflate: { threshold: 1024 } });
const clampDir = (v) => Math.max(-1, Math.min(1, v | 0));

// Hartslag: een laptop die in slaapstand gaat, houdt anders minutenlang een tank bezet
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('connection', (ws, req) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  // Fouten van één verbinding (te groot bericht, kapot frame) mogen nooit de hele server
  // laten crashen; ws sluit de verbinding zelf en 'close' ruimt de tank op.
  ws.on('error', (err) => console.log(`verbinding gesloten: ${err.message}`));

  const params = new URL(req.url, 'http://x').searchParams;
  const room = getRoom(params.get('room'), params.get('size'));
  useRoom(room);
  const slot = room.tanks.findIndex((t) => !t);
  if (slot < 0 || slot >= G.MAP_SIZES[room.size].maxPlayers) {
    ws.send(JSON.stringify({ t: 'full' }));
    ws.close();
    return;
  }
  // Eerste speler in een leeg potje: de kaart begint nu (mist, stormklok)
  if (!room.tanks.some(Boolean)) room.mapTick = room.tick;
  const t = { id: slot, uid: nextUid++, ws, input: { dx: 0, dy: 0, fire: false }, seq: 0, ackSeq: 0, seqTicks: 0, rounds: 0, kills: 0, sent: {} };
  spawn(room, t);
  if (room.phase === 'pause' || room.phase === 'over') t.alive = false; // instappen tijdens de pauze: meedoen vanaf de volgende ronde
  room.tanks[slot] = t;
  console.log(`[${room.name}] speler ${slot + 1} verbonden`);
  sendInit(room, t);

  let windowStart = 0, count = 0;
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > MAX_MSGS_PER_SEC) return; // flooden helpt niet
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'in') {
      t.input = { dx: clampDir(msg.dx), dy: clampDir(msg.dy), fire: !!msg.f };
      if (Number.isInteger(msg.q) && msg.q > t.seq) t.seq = msg.q;
    } else if (msg.t === 'cfg') {
      configure(room, t, String(msg.map), String(msg.size));
    } else if (msg.t === 'start') {
      startGame(room, t, room.pendingEvents);
    } else if (msg.t === 'sd') {
      t.selfDestruct = true; // zelfvernietiging (toets K), bij de volgende tick
    }
  });

  ws.on('close', () => {
    room.tanks[slot] = null;
    room.pendingEvents.push({ t: 'l', i: slot });
    console.log(`[${room.name}] speler ${slot + 1} vertrokken`);
    if (!room.tanks.some(Boolean)) { newWorld(room); room.pendingEvents = []; room.host = -1; }
  });
});

// Poort bezet (er draait al een server): een duidelijke melding in plaats van een stacktrace
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Poort ${PORT} is al in gebruik: er draait waarschijnlijk al een server.`);
  console.error(`Stop die eerst, of start op een andere poort, bijv.:  PORT=3001 npm start  (PowerShell: $env:PORT=3001; npm start)`);
  process.exit(1);
});
wss.on('error', () => {}); // dezelfde fout komt ook via de websocket-server binnen; hierboven al gemeld

server.listen(PORT, '0.0.0.0', () => {
  console.log('BLITZKRIEG-server draait (spel op /, retro op /retro):');
  console.log(`  op deze laptop:   http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  andere laptops:   http://${n.address}:${PORT}`);
    }
  }
});
