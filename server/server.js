// Autoritatieve Tunneler-server: draait de echte simulatie op 30 ticks/sec,
// ontvangt alleen input van spelers en stuurt delta's + gebeurtenissen terug.
// Er zijn meerdere "rooms" (aparte potjes), elk met hun eigen kaart en regels.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createAuth } from './auth.js';
import * as G from '../shared/game.js';
import * as Weather from '../shared/weather.js';
import * as Hazards from './hazards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const auth = createAuth();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8',
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
// worden door de spelpagina ingeladen.
const PAGES = {
  '/': 'public/index.html',
  '/retro': 'public/retro.html',
};
const server = http.createServer((req, res) => {
  if (auth.handleHttp(req, res)) return;
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { urlPath = '/'; }
  // een nul-byte in het pad laat fs.readFile meteen een fout gooien (niet via de callback)
  if (urlPath.includes('\0')) { res.writeHead(404); res.end(); return; }
  const rel = VENDOR[urlPath] || PAGES[urlPath] || (urlPath.startsWith('/shared/') ? urlPath.slice(1) : 'public' + urlPath);
  const file = path.join(ROOT, rel);
  if (!VENDOR[urlPath] && !ALLOWED.some((d) => file.startsWith(d + path.sep))) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---------- Instellingen (via omgevingsvariabelen, handig voor tests) ----------
const FIXED_SEED = process.env.TUNNELER_SEED ? Number(process.env.TUNNELER_SEED) >>> 0 : null; // vaste kaart (tests)
const { heartbeatMs: HEARTBEAT_MS, maxMsgsPerSec: MAX_MSGS_PER_SEC, maxPayload: MAX_PAYLOAD } = G.NET; // zie config.js
// Spelregels; de tests zetten roundsToWin lager om een heel spel snel uit te spelen
const GAME = { ...G.GAME, roundsToWin: Number(process.env.TUNNELER_ROUNDS_TO_WIN) || G.GAME.roundsToWin };
// Weerklok: de tests laten het weer sneller lopen (0.05 = twintig keer zo snel)
const WEATHER_SCALE = Number(process.env.TUNNELER_WEATHER_SCALE) || 1;

// Effectieve maxima voor brandstof, pantser en munitie (lobby-instellingen)
const effectiveMax = (room) => G.effectiveMax(room.settings);

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
      rounds: GAME.roundsToWin,
      settings: { ...G.DEFAULT_SETTINGS, minimap: G.minimapOn(G.MAPS[mapId]) ? 1 : 0 },
      playerCount: G.MAX_PLAYERS, gameMode: 'ffa',
    };
    rooms.set(name, room);
    if (lobby) { room.size = G.DEFAULT_SIZE; newWorld(room); }
  }
  const wanted = Object.hasOwn(G.MAP_SIZES, size) ? size : G.DEFAULT_SIZE;
  if (!room.lobby && !room.tanks.some(Boolean) && room.size !== wanted) {
    room.size = wanted;
    room.playerCount = Math.min(room.playerCount, G.MAP_SIZES[wanted].maxPlayers);
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

// De host kiest een kaart en grootte: nieuwe kaart voor iedereen, die op START wacht.
// Alleen in de wachtkamer; tijdens een spel drukt de host eerst op STOP.
function configure(room, t, msg) {
  if (!room.lobby || room.phase !== 'lobby' || t.id !== hostOf(room)) return;
  const mapId = String(msg.map ?? room.mapId);
  const size = String(msg.size ?? room.size);
  if (!Object.hasOwn(G.MAPS, mapId) || mapId === 'retro' || !Object.hasOwn(G.MAP_SIZES, size)) return;
  // playerCount en gameMode
  const rules = G.MAPS[mapId];
  const maxForSize = G.MAP_SIZES[size].maxPlayers;
  const maxForMap = rules?.maxPlayers ?? G.MAX_PLAYERS;
  const maxPlayers = Math.min(maxForSize, maxForMap);
  let pc = Number(msg.playerCount) || maxPlayers;
  if (![2, 3, 4].includes(pc)) pc = maxPlayers;
  pc = Math.min(pc, maxPlayers);
  let gm = String(msg.gameMode ?? room.gameMode);
  if (gm !== 'ffa' && gm !== 'teams') gm = 'ffa';
  if (gm === 'teams' && pc !== 4) gm = 'ffa';
  // een speler op een slot >= het nieuwe aantal: wijziging weigeren
  if (room.tanks.some((t, i) => t && i >= pc)) return;
  if (mapId !== room.mapId) room.settings.minimap = G.minimapOn(rules) ? 1 : 0;
  const prev = { mapId: room.mapId, rules: room.rules, size: room.size, playerCount: room.playerCount, gameMode: room.gameMode };
  room.playerCount = pc;
  room.gameMode = gm;
  // rondes
  const rounds = Number(msg.rounds);
  if (G.ROUND_OPTIONS.includes(rounds)) room.rounds = rounds;
  // instellingen (valideer elke waarde tegen de opties in LOBBY_SETTINGS)
  if (msg.settings && typeof msg.settings === 'object') {
    for (const [k, v] of Object.entries(msg.settings)) {
      const def = G.LOBBY_SETTINGS[k];
      if (def && def.options.some(([val]) => val === v)) room.settings[k] = v;
    }
  }
  // kaart of grootte veranderd, of een ander aantal bases nodig (speleraantal, teams): nieuwe wereld.
  // Anders staan er te veel bases op de kaart, of te weinig voor wie nog instapt.
  const otherBases = !rules.noBases && room.world.bases.length !== basesNeeded(room);
  if (mapId !== room.mapId || size !== room.size || otherBases) {
    Object.assign(room, { mapId, rules: G.MAPS[mapId], size });
    const made = makeWorld(room);
    if (made) { newGame(room, made); return; }
    Object.assign(room, prev);
    useRoom(room);
    room.pendingEvents.push({ t: 'err', msg: 'De bases passen niet op deze kaartgrootte: kies een grotere kaart.' });
    return;
  }
  // alleen rondes, instellingen of speleraantal veranderd: iedereen bijwerken
  for (const o of room.tanks) if (o) sendInit(room, o);
}

// De host start het spel
function startGame(room, t, events) {
  if (!room.lobby || room.phase !== 'lobby' || t.id !== hostOf(room)) return;
  // Geen lege bases: staan er meer bases op de kaart dan er spelers zijn, dan eerst een nieuwe
  // kaart voor wie er nu is (in de wachtkamer is de kaart nog niet te zien). Passen de bases
  // niet, dan blijft de kaart zoals hij was.
  const need = room.gameMode === 'teams' ? 2 : Math.max(2, room.tanks.findLastIndex(Boolean) + 1);
  if (!room.rules.noBases && room.world.bases.length > need) {
    const made = makeWorld(room, need);
    if (made) { newGame(room, made); events = room.pendingEvents; }
  }
  beginPlay(room, events);
}
function beginPlay(room, events) {
  room.phase = 'play';
  for (const t of room.tanks) if (t) spawn(room, t); // met de effectieve maxima van de lobby-instellingen
  room.mapTick = room.roundTick = room.tick; // storm- en weerklok beginnen nu
  // De telwijze (rondes of kills) ligt nu vast voor het hele spel: het ingestelde speleraantal, of
  // minder als er bij START minder spelers zijn. Wie later instapt of weggaat, verandert hem niet.
  room.scorePlayers = Math.min(room.playerCount, Math.max(2, room.tanks.findLastIndex(Boolean) + 1));
  events.push({ t: 'n', n: room.round, m0: room.mapTick, r0: room.roundTick, sp: room.scorePlayers });
  Hazards.roundStart(room, events);
  // het instapbericht ging uit vóór roundStart: brug, munitiedepot e.d. alsnog meesturen
  events.push({ t: 'hz', hz: Hazards.snapshot(room) });
}
// Met hoeveel spelers telt de score: vast sinds START (wachtkamer), anders wie er nu is (retro, tests)
const scorePlayers = (room) => room.scorePlayers ?? room.tanks.filter(Boolean).length;
// De host stopt het spel: iedereen terug naar de wachtkamer, op dezelfde kaart (nieuw spel)
function stopGame(room, t) {
  if (!room.lobby || room.phase === 'lobby' || t.id !== hostOf(room)) return;
  newGame(room);
}

// Alles wat met de kaart van een potje rekent, zet eerst de kaartmaat van dat potje
function useRoom(room) {
  const { w, h } = G.sizeDims(room.size);
  G.setMapSize(w, h, G.edgeBand(room.rules));
  G.applyTerrainOverrides(room.rules);
}

// Zoveel bases heeft de kaart van dit potje nodig: één per team, of één per speler
const basesNeeded = (room) => (room.gameMode === 'teams' ? 2 : room.playerCount);

// Een nieuwe kaart voor dit potje: { world, seed }, of null als de bases niet passen (te veel
// spelers voor deze kaartgrootte). Het potje zelf verandert nog niet.
function makeWorld(room, bases = basesNeeded(room)) {
  useRoom(room);
  const seed = FIXED_SEED ?? (Math.random() * 2 ** 32) >>> 0;
  try {
    return { world: G.generateMap(seed, room.rules, bases), seed };
  } catch (err) {
    if (err.message !== 'BASES') throw err;
    return null;
  }
}

// Nieuwe kaart (made, of een nieuw gemaakte) en nieuw spel: ronde 1, scores op 0
function newWorld(room, made = makeWorld(room)) {
  if (!made) return false;
  const { seed } = made;
  room.world = made.world;
  room.mines = new Set(room.world.mines);
  room.mapTick = room.tick; // begin van deze kaart (mist in de Ardennen, stormklok)
  room.roundTick = room.tick; // begin van de ronde (weer per ronde)
  room.hz = {};
  room.forcedStorm = null;
  room.scorePlayers = null; // de telwijze wordt bij START opnieuw vastgelegd
  room.fogOff = false;
  room.night = false;
  room.lightStep = null;
  setSpeed(room, G.SPEED.start);
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
  const max = effectiveMax(room);
  let x, y;
  // geen basis voor deze speler (kaart zonder bases, of de kaart heeft er te weinig): willekeurige plek
  const base = room.rules.noBases ? null : room.world.bases[G.baseIndex(t.id, room.gameMode)];
  if (!base) {
    // willekeurige plek waar de hele tank vrij staat (niet in bos, huis, rots of water), in het
    // grote begaanbare gebied, liefst ver van andere tanks. Lukt dat laatste niet, dan de laatste
    // goede plek die gevonden is.
    const w = room.world, minDist = G.SPAWN.minDistT * G.T, area = spawnArea(w);
    for (let tries = 0, found = false; tries < G.SPAWN.tries; tries++) {
      const cx = Math.floor(Math.random() * G.W), cy = Math.floor(Math.random() * G.H);
      if (!area[cy * G.W + cx] || G.waterUnder(w.map, cx, cy, 0) !== 0) continue;
      if (!found) { x = cx; y = cy; found = true; }
      if (room.tanks.some((o) => o?.alive && o !== t && Math.hypot(o.x - cx, o.y - cy) < minDist)) continue;
      x = cx; y = cy;
      break;
    }
    if (x === undefined) [x, y] = firstCell(area); // vrijwel onmogelijk: dan de eerste cel van het gebied
  } else {
    x = base.x; y = base.y;
  }
  Object.assign(t, {
    x, y, dir: 0, alive: true, cooldown: 0, mv: 0, sp: 0, wasMoving: false, iceBlock: -1, wetTicks: 0, iceStayTicks: 0, still: 0, buried: false,
    gauge: room.rules.meter?.start ?? 0, slow: G.SPEED_ONE, meterState: {},
    fuel: max.fuel, shield: max.shield, ammo: max.ammo,
  });
}

// Het grootste gebied waar een tank kan rijden (rots, water en muren blokkeren; bos en huizen kun je
// wegschieten): daar mag een tank zonder basis beginnen. Eén keer per kaart uitgerekend.
function spawnArea(w) {
  if (w.spawnArea) return w.spawnArea;
  let best = null, bestN = -1;
  const tried = new Uint8Array(w.map.length);
  for (let i = 0, n = 0; i < w.map.length && n < G.SPAWN.areaTries; i++) {
    const x = i % G.W, y = (i / G.W) | 0;
    if (tried[i] || !G.playable(x, y) || G.waterUnder(w.map, x, y, 0) !== 0) continue;
    const seen = G.reachable(w.map, { x, y });
    let count = 0;
    for (let k = 0; k < seen.length; k++) if (seen[k]) { tried[k] = 1; count++; }
    tried[i] = 1; n++;
    if (count > bestN) { best = seen; bestN = count; }
    if (count * 2 > w.map.length) break; // meer dan de halve kaart: dit is het
  }
  return (w.spawnArea = best || new Uint8Array(w.map.length));
}
function firstCell(area) {
  const i = Math.max(0, area.indexOf(1));
  return [i % G.W, (i / G.W) | 0];
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
  t.shield = Math.max(0, t.shield - Math.round((pct * effectiveMax(room).shield) / 100));
  events.push({ t: 'hint', x: t.x, y: t.y, i: t.id });
  if (t.shield === 0) kill(room, t, null, events);
}

// ---------- Rondes (§2) ----------
// Er is iemand dood: de ronde is voorbij. Winnaar van de ronde bepalen (2 spelers), kijken of
// het spel gewonnen is, en dan even pauzeren (of de winnaar tonen).
function endRound(room, events) {
  const players = room.tanks.filter(Boolean);
  room.roundWinner = G.roundWinner(players, room.gameMode);
  if (room.roundWinner >= 0) {
    if (room.gameMode === 'teams') {
      const winTeam = room.roundWinner % 2;
      for (const t of room.tanks) if (t && t.id % 2 === winTeam) t.rounds++;
    } else {
      room.tanks[room.roundWinner].rounds++;
    }
  }
  room.winner = G.gameWinner(players, { ...GAME, roundsToWin: room.rounds }, room.gameMode, scorePlayers(room));
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
function newGame(room, made) {
  if (!newWorld(room, made)) return false;
  room.pendingEvents = [];
  const players = room.tanks.filter(Boolean);
  for (const t of players) { spawn(room, t); t.sent = {}; }
  for (const t of players) sendInit(room, t);
  return true;
}

// ---------- Host-commando's tijdens het spel ----------
function forceStorm(room) {
  room.forcedStorm = { end: room.tick + Math.round(G.FORCED_STORM.seconds * G.TICK_RATE) };
  room.pendingEvents.push({ t: 'fs', end: room.forcedStorm.end });
}
function applyForcedStorm(room, tick) {
  if (!room.forcedStorm || tick >= room.forcedStorm.end) { room.forcedStorm = null; return; }
  Weather.forceStorm(room.wx, room.rules.style, (room.forcedStorm.end - tick) / G.TICK_RATE);
}
function toggleNight(room) {
  room.night = !room.night;
  room.pendingEvents.push({ t: 'dn', n: room.night ? 1 : 0 });
}
function stepLight(room, dir) {
  if (dir !== -1 && dir !== 1) return;
  room.lightStep = ((room.lightStep ?? 3) + dir + 8) % 8; // standaard stap 3 (ZO)
  room.pendingEvents.push({ t: 'la', s: room.lightStep });
}
// Maximumsnelheid van alle tanks (, en .): de gedeelde rijregels lezen world.speedMul
function setSpeed(room, pct) {
  room.speedPct = pct;
  room.world.speedMul = G.speedMul(pct);
}
function stepSpeed(room, dir) {
  if (dir !== -1 && dir !== 1) return;
  setSpeed(room, Math.max(G.SPEED.min, Math.min(G.SPEED.max, room.speedPct + dir * G.SPEED.step)));
  // ook op de grens een bericht: de host ziet dan dat hij niet verder kan
  room.pendingEvents.push({ t: 'sp', p: room.speedPct });
}
function toggleFog(room) {
  room.fogOff = !room.fogOff;
  room.pendingEvents.push({ t: 'mf', off: room.fogOff ? 1 : 0 });
}

// Volledige snapshot voor één speler: bij het instappen en bij een nieuw spel (nieuwe kaart).
// Daarna alleen nog delta's en gebeurtenissen.
function sendInit(room, t) {
  const players = room.tanks.filter(Boolean);
  const max = effectiveMax(room);
  const init = {
    t: 'init', you: t.id, k: room.tick, w: G.W, h: G.H, size: room.size,
    map: G.toBase64(G.rleEncode(room.world.map)),
    tanks: players.map((o) => ({ i: o.id, ...(o === t || !Object.keys(o.sent).length ? tankFields(o, scorePlayers(room), max.fuel, room.gameMode) : o.sent) })),
    bullets: room.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, d: b.d, i: b.owner })),
    terrain: G.toBase64(G.rleEncode(room.world.terrain)),
    track: G.toBase64(G.rleEncode16(room.world.track)), // exacte sporen, daarna rekent de client zelf mee
    veg: G.toBase64(G.rleEncode16(room.world.veg)), // welke plant waar staat
    vh: [...room.world.vegHp], // treffers die elke plant nog kan hebben
    scar: G.toBase64(G.rleEncode(room.world.scar)), // gaten van weggeschoten planten
    ice: G.toBase64(G.rleEncode(room.world.ice)), // passages per ijsvak (barsten)
    room: room.name,
    mapId: room.mapId, // welke kaart; de instellingen staan in config.js
    lobby: room.lobby, host: hostOf(room),
    names: room.tanks.filter(Boolean).map((o) => ({ i: o.id, name: o.name || '' })),
    rounds: room.rounds, settings: room.settings, max,
    playerCount: room.playerCount, gameMode: room.gameMode, sp: room.scorePlayers ?? null,
    lm: room.world.landmarks || [], // herkenningspunten (kerk) in dorpen
    // middellijnen van de wegen (alleen voor de weergave): punten op 0,1 cel, breedte, klasse
    rd: (room.world.roads || []).map((r) => ({ p: r.path.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), w: r.width, c: r.class })),
    // bruggen (alleen voor de weergave): middellijn a..z, breedte, over ijs, en de cellen als reeksen [begin, lengte]
    br: (room.world.bridges || []).filter((b) => b.a).map(bridgeMsg),
    m0: room.mapTick, r0: room.roundTick, wx: WEATHER_SCALE,
    hz: Hazards.snapshot(room), // depots, aangekondigde barrage
    game: gameState(room),
    dn: room.night ? 1 : 0,
    la: room.lightStep,
    fs: room.forcedStorm ? { end: room.forcedStorm.end } : null,
    mf: room.fogOff ? 1 : 0,
    sp: room.speedPct,
  };
  if (room.rules.mines) init.mines = [...room.mines]; // de velden zelf blijven geheim
  t.ws.send(JSON.stringify(init));
}

// Brug voor het instapbericht: getallen op 0,1 cel, cellen als reeksen opeenvolgende indexen
function bridgeMsg(b) {
  const r1 = (v) => Math.round(v * 10) / 10, runs = [];
  for (const i of [...b.list].sort((p, q) => p - q)) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === i) last[1]++; else runs.push([i, 1]);
  }
  return { a: b.a.map(r1), z: b.z.map(r1), w: r1(b.w), ice: b.ice, runs };
}

// Stand van het spel voor het instapbericht
const gameState = (room) => ({ round: room.round, phase: room.phase, left: Math.max(0, room.phaseEnd - room.tick), w: room.winner, rw: room.roundWinner })

// IJs onder de tank (Leningrad). Rijdt het midden van de tank een nieuw ijsvak in, dan telt
// dat als passage en gooit de server de dobbelsteen; breekt het, dan krijgen alle clients het
// vaknummer en maken ze zelf hetzelfde wak. Staat de tank in het water, dan loopt zijn pantser
// leeg (ICE.sinkDamagePerSecond). Geeft true als de tank daardoor dood is.
//
// Met iceSlowBreak (Leningrad): op volle snelheid breekt het ijs niet. Stilstaan of langzaam
// rijden geeft een kans per seconde; de barstteller loopt altijd door (visuele feedback).
const SINK_EVERY = Math.max(1, Math.round(G.TICK_RATE / G.ICE.sinkDamagePerSecond));
const ICE_SLOW_THRESHOLD = Math.round(G.ICE.slowThreshold * G.SPEED_ONE);
function isSlowOnIce(t, moved) {
  if (!moved) return true;
  return (t.slow ?? G.SPEED_ONE) < ICE_SLOW_THRESHOLD;
}
function iceStep(room, t, moved, events) {
  const w = room.world, i = t.y * G.W + t.x;
  const b = G.iceBlockAt(t.x, t.y);
  const slowBreak = room.rules.iceSlowBreak;
  const mul = room.wx?.flags?.iceBreakMul || 1;

  // Blokwisseling: passage ophogen + barstevent; breekrol alleen als langzaam (of altijd zonder iceSlowBreak)
  if (b !== t.iceBlock) {
    t.iceBlock = b;
    t.iceStayTicks = 0;
    if (G.isIce(w, i)) {
      const n = w.ice[b] = Math.min(255, w.ice[b] + 1);
      events.push({ t: 'c', b, n, i: t.id });
      if (!slowBreak || isSlowOnIce(t, moved)) {
        if (Math.random() < G.iceBreakChance(n, (room.rules.iceBreak ?? G.ICE.breakPerPass) * mul)) {
          G.breakIce(w, b); events.push({ t: 'w', b, i: t.id });
        }
      }
    }
  }

  // Per-tick check: langzaam of stilstaand op ijs → kans per seconde (iceSlowBreak × weerbonus)
  if (slowBreak && G.isIce(w, i) && isSlowOnIce(t, moved)) {
    t.iceStayTicks++;
    if (Math.random() < slowBreak / G.TICK_RATE * mul) {
      const n = w.ice[b] = Math.min(255, (w.ice[b] || 0) + 1);
      events.push({ t: 'c', b, n, i: t.id });
      G.breakIce(w, b); events.push({ t: 'w', b, i: t.id });
    }
  } else {
    t.iceStayTicks = 0;
  }

  if (G.waterUnder(w.map, t.x, t.y, t.dir) > 0) {
    if (++t.wetTicks % SINK_EVERY === 0) t.shield = Math.max(0, t.shield - 1);
    if (t.shield === 0) { kill(room, t, null, events); return true; }
  } else t.wetTicks = 0;
  return false;
}

// Velden die naar alle clients gaan. Brandstof als percentage: verandert minder vaak = minder bytes.
// c = score volgens de telwijze van nu (gewonnen rondes bij 2 spelers, anders kills).
function tankFields(t, players, fuelMax, gameMode) {
  return {
    x: t.x, y: t.y, d: t.dir, a: t.alive ? 1 : 0,
    f: Math.ceil((t.fuel * 100) / fuelMax), s: t.shield, m: t.ammo, c: G.score(t, players, gameMode), b: t.buried ? 1 : 0,
    g: Math.round(t.gauge ?? 0), v: t.slow ?? G.SPEED_ONE,
  };
}

// Eén tick van een potje: kogels, tanks, gevaren, graven en vervagen, en dan het tickbericht
function step(room) {
  const tick = ++room.tick;
  const events = room.pendingEvents;
  room.pendingEvents = [];
  const live = room.tanks.filter(Boolean);
  if (!live.length) return;
  useRoom(room);

  const host = hostOf(room);
  if (host !== room.host) { room.host = host; events.push({ t: 'h', i: host }); }

  // Tussen rondes of na de winst staat alles stil; daarna verder met een nieuwe ronde of spel.
  // In de wachtkamer staat alles stil tot de host start.
  if ((room.phase === 'pause' || room.phase === 'over') && tick >= room.phaseEnd) {
    if (room.phase === 'over') { newGame(room); return; }
    newRound(room, events);
  }
  const playing = room.phase === 'play';
  if (playing) {
    const deaths = live.filter((t) => !t.alive).length;
    // het weer van nu (zicht rekent elke client zelf uit; hier: sporenwisser en onderduiken)
    // de instelling Storm geldt alleen voor de terugkerende stormen; de client rekent hetzelfde uit
    room.wx = Weather.weatherAtTick(room.rules, room.round, tick, room.mapTick, room.roundTick, WEATHER_SCALE, room.settings?.stormFreq ?? 1);
    applyForcedStorm(room, tick);
    stepBullets(room, live, events);
    for (const t of live) stepTank(room, t, live, events);
    // gevaren en schaarse middelen van deze kaart
    if (room.settings?.hazards !== 0) Hazards.step(room, tick, events, (t, pct, ev) => hurt(room, t, pct, ev));
    if (live.filter((t) => !t.alive).length > deaths) {
      // winner vóór de rondepunten: kijkt of iemand het spel al gewonnen heeft;
      // endRound() kent het rondepunt toe en herberekent de definitieve winnaar.
      const winner = G.gameWinner(live, { ...GAME, roundsToWin: room.rounds }, room.gameMode, scorePlayers(room));
      // teams: ook als beide teams tegelijk sneuvelen (bombardement) is de ronde voorbij, zonder winnaar
      const roundDone = room.gameMode === 'teams'
        ? G.roundWinner(live, 'teams') >= 0 || !live.some((t) => t.alive)
        : live.filter((t) => t.alive).length <= 1 || winner >= 0;
      if (roundDone) endRound(room, events);
    }
  } else for (const t of live) t.selfDestruct = false;

  // Graaf de tankvorm uit op de huidige plek en richting (clients doen exact hetzelfde)
  for (const t of live) {
    if (!t.alive) continue;
    G.digTank(room.world, t.x, t.y, t.dir);
    G.touchTank(room.world, t.x, t.y, t.dir); // bereden tunnels krijgen een vers spoor
  }
  // Sporen vervagen per terreinklasse (tijdens de storm en bij sneeuwval sneller); op 0 loopt een tunnel dicht
  G.fadeStep(room.world, tick, playing && (room.wx.driftRate || room.wx.eraser), undefined, undefined, room.wx?.driftGround); // verstuiving eerst: de storm dekt toe

  sendTick(room, live, events);
}

// Kogels (een treffer op begroeiing kost die plant een leven; clients zien in het
// 'x'-bericht dat er een plant staat en doen hetzelfde)
function stepBullets(room, live, events) {
  const w = room.world, dig = G.bulletsDig(room.rules);
  room.bullets = room.bullets.filter((b) => {
    const hit = G.stepBullet(b, w.map, live, dig);
    if (!hit) return true;
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
}

// Eén tank: bijvullen, rijden, onderduiken, meters, mijnen, schieten, ijs en brandstof.
// Een dode tank wacht op de volgende ronde.
function stepTank(room, t, live, events) {
  if (!t.alive) { t.selfDestruct = false; return; }
  // Zelfvernietiging: al het pantser weg en dood; telt voor niemand als kill
  if (t.selfDestruct) { t.selfDestruct = false; t.shield = 0; kill(room, t, null, events); return; }
  const w = room.world, tick = room.tick, wx = room.wx;
  if (t.cooldown > 0) t.cooldown--;

  const max = effectiveMax(room);
  if (w.map[t.y * G.W + t.x] === G.BASE + G.baseIndex(t.id, room.gameMode)) { // bij teams: de basis van je team
    const refill = room.rules.refill || {};
    if (refill.fuel !== false) t.fuel = Math.min(max.fuel, t.fuel + G.REFILL.fuel);
    if (refill.armor !== false && tick % G.REFILL.armorEvery === 0) t.shield = Math.min(max.shield, t.shield + 1);
    if (refill.ammo !== false && tick % G.REFILL.ammoEvery === 0) t.ammo = Math.min(max.ammo, t.ammo + 1);
  } else if (tick % G.IDLE_DRAIN_EVERY === 0) {
    t.fuel--;
  }

  // Rijden met de gedeelde regels (dezelfde die de browser gebruikt om te voorspellen)
  const px = t.x, py = t.y;
  const steps = G.moveTank(t, w, live.filter((o) => o !== t && o.alive));
  // Bij een lagere maximumsnelheid slaat de rijklok ticks over: dat telt niet als stilstaan
  // (ijs, meters, onderduiken) zolang de tank reed en de speler blijft sturen
  const moved = steps ? t.x !== px || t.y !== py : t.wasMoving && !!(t.input.dx || t.input.dy);
  t.wasMoving = moved;
  // Onderduiken (§5.7): 2 seconden stil in een storm = bedekt, tot de tank rijdt of schiet
  if (moved || (t.input.fire && t.ammo > 0)) { t.still = 0; t.buried = false; }
  else if (++t.still >= G.BURIAL_TICKS && wx.burial) t.buried = true;
  // meters van de kaart (zand, motorwarmte, motortemperatuur): zie server/hazards.js
  Hazards.tankStep(room, t, { moved, wx }, events, (tank, pct, ev) => hurt(room, tank, pct, ev));
  if (!t.alive) return;
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
    if (t.shield === 0) { kill(room, t, null, events); return; }
  }

  if (t.input.fire && t.cooldown === 0 && t.ammo > 0) {
    const [fx, fy] = G.DIRS[t.dir];
    const b = { id: room.nextBulletId++, owner: t.id, ownerUid: t.uid, x: t.x + fx * (G.TANK_R + 1), y: t.y + fy * (G.TANK_R + 1), d: t.dir, fresh: true };
    room.bullets.push(b);
    t.ammo--;
    t.cooldown = G.FIRE_COOLDOWN;
    events.push({ t: 'b', id: b.id, x: b.x, y: b.y, d: b.d, i: t.id }); // i: wie schoot (voor de hint)
  }

  if (iceStep(room, t, moved, events)) return;

  if (t.fuel <= 0) { t.fuel = 0; kill(room, t, null, events); }
}

// Het tickbericht. Delta-compressie: alleen tankvelden die veranderd zijn sinds de vorige tick.
// Altijd een bericht sturen: het is ook de klok waarop clients kogels laten bewegen.
// Iedere speler krijgt er een eigen stukje bij (y): de bevestiging voor de voorspelling.
function sendTick(room, live, events) {
  const p = [];
  for (const t of live) {
    const cur = tankFields(t, scorePlayers(room), effectiveMax(room).fuel, room.gameMode);
    const entry = { i: t.id };
    let changed = false;
    for (const k in cur) {
      if (t.sent[k] !== cur[k]) { entry[k] = cur[k]; t.sent[k] = cur[k]; changed = true; }
    }
    if (changed) p.push(entry);
  }
  const msg = { t: 's', k: room.tick };
  if (p.length) msg.p = p;
  if (events.length) msg.e = events;
  const base = JSON.stringify(msg).slice(0, -1);
  for (const t of live) {
    if (t.ws.readyState !== 1) continue;
    const ack = t.alive ? `,"y":[${t.seq},${t.seqTicks},${t.mv},${t.sp || 0}]` : '';
    t.ws.send(base + ack + '}');
  }
}

// Vangnet: een fout in één tick of één bericht mag niet de hele server (en alle spellen) stoppen.
// De fout komt in het log; herhaalt hij zich elke tick, dan alleen de eerste paar keer en daarna
// af en toe, zodat het log niet volloopt.
function guard(room, what, fn) {
  try { fn(); } catch (err) {
    const n = room.errors = (room.errors || 0) + 1;
    if (n <= G.NET.errorLogFirst || n % G.NET.errorLogEvery === 0) console.error(`[${room.name}] fout in ${what} (${n}x):`, err);
  }
}

// Vaste tijdstap, ook als setTimeout wat uitloopt
const TICK_MS = 1000 / G.TICK_RATE;
let nextTick = performance.now();
function loop() {
  const now = performance.now();
  if (now - nextTick > 1000) nextTick = now; // niet inhalen na een lange pauze
  while (now >= nextTick) {
    for (const room of rooms.values()) guard(room, 'tick', () => step(room));
    nextTick += TICK_MS;
  }
  setTimeout(loop, Math.max(0, nextTick - performance.now()));
}
loop();

// ---------- Netwerk ----------
// Grote berichten (het instapbericht) gaan gecomprimeerd; de kleine tickberichten niet,
// dat kost meer rekenwerk dan het bespaart.
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: { threshold: 1024 } });
server.on('upgrade', (req, socket, head) => {
  if (!auth.authorizeUpgrade(req, socket)) return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
const clampDir = (v) => Math.max(-1, Math.min(1, v | 0));

// Hartslag: een laptop die in slaapstand gaat, houdt anders minutenlang een tank bezet
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.sessionExpires && Date.now() >= ws.sessionExpires) {
      ws.close(1008, 'Sessie verlopen: meld je opnieuw aan.');
      continue;
    }
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('connection', (ws, req) => {
  ws.alive = true;
  ws.sessionExpires = auth.expiresAt(req);
  ws.on('pong', () => { ws.alive = true; });
  // Fouten van één verbinding (te groot bericht, kapot frame) mogen nooit de hele server
  // laten crashen; ws sluit de verbinding zelf en 'close' ruimt de tank op.
  ws.on('error', (err) => console.log(`verbinding gesloten: ${err.message}`));

  const params = new URL(req.url, 'http://x').searchParams;
  const room = getRoom(params.get('room'), params.get('size'));
  useRoom(room);
  const slot = room.tanks.findIndex((t) => !t);
  // tijdens een spel kan alleen wie een basis heeft erbij (de kaart heeft er zoveel als er bij START waren)
  const noBase = room.phase !== 'lobby' && !room.rules.noBases && !room.world.bases[G.baseIndex(slot, room.gameMode)];
  if (slot < 0 || slot >= room.playerCount || noBase) {
    ws.send(JSON.stringify({ t: 'full' }));
    ws.close();
    return;
  }
  // Eerste speler in een leeg potje: de kaart begint nu (mist, stormklok)
  if (!room.tanks.some(Boolean)) room.mapTick = room.tick;
  const t = { id: slot, uid: nextUid++, ws, input: { dx: 0, dy: 0, fire: false }, seq: 0, ackSeq: 0, seqTicks: 0, rounds: 0, kills: 0, sent: {}, name: String(params.get('name') || '').slice(0, 20) };
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
    if (!msg || typeof msg !== 'object') return; // geldige JSON, maar geen bericht (null, een getal)
    guard(room, 'bericht', () => handle(msg));
  });
  function handle(msg) {
    useRoom(room); // start, stop en de host-commando's rekenen met de kaart van dit potje
    if (msg.t === 'in') {
      t.input = { dx: clampDir(msg.dx), dy: clampDir(msg.dy), fire: !!msg.f };
      if (Number.isInteger(msg.q) && msg.q > t.seq) t.seq = msg.q;
    } else if (msg.t === 'cfg') {
      configure(room, t, msg);
    } else if (msg.t === 'naam') {
      t.name = String(msg.name || '').slice(0, 20);
      room.pendingEvents.push({ t: 'nm', i: t.id, name: t.name });
    } else if (msg.t === 'start') {
      startGame(room, t, room.pendingEvents);
    } else if (msg.t === 'stop') {
      stopGame(room, t);
    } else if (msg.t === 'sd') {
      t.selfDestruct = true; // zelfvernietiging (toets K), bij de volgende tick
    } else if (msg.t === 'cmd') {
      if (t.id !== hostOf(room) || room.phase !== 'play') return;
      if (msg.cmd === 'barrage') Hazards.hostBarrage(room, room.pendingEvents);
      else if (msg.cmd === 'storm') forceStorm(room);
      else if (msg.cmd === 'night') toggleNight(room);
      else if (msg.cmd === 'light') stepLight(room, msg.dir);
      else if (msg.cmd === 'fog') toggleFog(room);
      else if (msg.cmd === 'speed') stepSpeed(room, msg.dir);
    }
  }

  ws.on('close', () => {
    room.tanks[slot] = null;
    room.pendingEvents.push({ t: 'l', i: slot });
    console.log(`[${room.name}] speler ${slot + 1} vertrokken`);
    if (!room.tanks.some(Boolean)) guard(room, 'opruimen', () => { newWorld(room); room.pendingEvents = []; room.host = -1; });
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
