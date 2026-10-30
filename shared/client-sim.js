// De spelkant van een client, zonder browsercode: berichten van de server verwerken,
// je eigen tank voorspellen en bepalen waar alles getekend moet worden.
// Wordt gebruikt door de browser (public/net.js) én door de tests (tests/),
// zodat de tests precies dezelfde logica controleren als wat spelers draaien.
import * as G from './game.js';
import * as Weather from './weather.js';

const TICK_MS = 1000 / G.TICK_RATE;
// buffer voor andere tanks, interpolatie, voorspelling en correcties: zie NET in config.js
const { renderDelay: RENDER_DELAY, histLen: HIST_LEN, maxPred: MAX_PRED, smoothMs: SMOOTH_MS } = G.NET;

export function createState() {
  return {
    map: null,
    terrain: null, // terreinklasse per cel
    track: null, // spoor per cel (G.TRACK_ONE = vers)
    world: null, // {map, terrain, track, veg, vegHp, scar} voor de gedeelde regels
    rules: {}, // kaartinstellingen van dit potje (config.js)
    me: -1,
    tanks: new Map(), // id -> {x, y, d, a, f, s, m, c, hist: [{k, x, y}]}
    bullets: new Map(), // id -> {x, y, d, sx, sy, sk}  (sk = tick waarop hij is afgevuurd)
    mines: new Set(), // celindexen van mijnen die nog liggen
    mapTick: 0, // tick waarop deze kaart begon (ook de stormklok)
    // stand van het spel: ronde, fase (play | pause | over), winnaar van het spel (w) en van de
    // laatste ronde (rw, -1 = niemand), en tot welke tick de pauze of het winnaarsbeeld duurt
    game: { round: 1, phase: 'play', w: -1, rw: -1, until: 0 },
    mapId: null, // welke kaart (config MAPS)
    mapW: G.W, mapH: G.H, // kaartmaat van dit potje
    lobby: false, // potje met wachtkamer (de spelpagina op /)
    host: -1, // speler die de kaart kiest en start
    landmarks: [], // herkenningspunten in dorpen: {kind, x, y}
    roads: [], // middellijnen van de wegen (weergave): {p: [[x, y], ...], w: breedte, c: klasse}
    bridges: [], // bruggen (weergave): {a, z: middellijn, w: breedte, ice, runs: [[cel, aantal], ...]}
    message: null, // melding van de server voor in het menu
    smokes: [], // rookvlekken die het zicht blokkeren: {x, y, r, until}
    depots: [], // brandstofdepots: [x, y, vol]
    barrage: null, // aangekondigde (artillerie)barrage: {box, at, kind}
    fires: new Set(), // brandende vakken (Koersk)
    guns: [], // zichtbaar antitankgeschut (Carentan): {k, x, y, ang, hp}
    crates: [], // droppings (Market Garden): [x, y, soort, vol]
    bridge: null, // de brug die kan ontploffen (Market Garden): {box, cells, blown}
    ammoDepot: null, // munitiedepot (Grebbeberg): [x, y]
    vision: null, // zichtstraal in T volgens het weer (null = standaard)
    roundTick: 0, // tick waarop deze ronde begon (weer per ronde)
    weatherScale: 1, // de tests laten het weer sneller lopen
    weather: null, // weer van nu (shared/weather.js weatherAt)
    tick: 0, // laatst verwerkte server-tick
    clockOffset: null, // aankomsttijd - tick * TICK_MS, de "snelste" schatting
    input: { dx: 0, dy: 0, fire: 0 },
    inputSeq: 0, // volgnummer van de laatst verstuurde invoer
    pred: null, // voorspelling van je eigen tank
  };
}

// ---------- Berichten van de server ----------

// Gevaren en schaarse middelen uit een snapshot (instapbericht, of bij de start vanuit de wachtkamer)
function applyHz(state, hz = {}) {
  state.depots = hz.depots || [];
  state.barrage = hz.barrage || null;
  state.fires = new Set(hz.fires || []);
  state.guns = hz.guns || [];
  state.crates = hz.crates || [];
  state.bridge = hz.bridge || null;
  state.ammoDepot = hz.ammoDepot || null;
}

export function applyInit(state, msg, hooks = {}, now = 0) {
  state.me = msg.you;
  state.mapW = msg.w ?? G.BASE_W_CELLS;
  state.mapH = msg.h ?? G.BASE_H_CELLS;
  G.setMapSize(state.mapW, state.mapH, G.edgeBand(G.MAPS[msg.mapId ?? msg.room])); // kaartgrootte (en onbegaanbare rand) van dit potje
  state.size = msg.size;
  state.mapId = msg.mapId ?? msg.room;
  state.lobby = !!msg.lobby;
  state.host = msg.host ?? -1;
  state.landmarks = msg.lm || [];
  state.roads = msg.rd || [];
  state.bridges = msg.br || [];
  applyHz(state, msg.hz);
  const n = G.W * G.H;
  const decode = (b64) => G.rleDecode(G.fromBase64(b64), n);
  const decode16 = (b64) => G.rleDecode16(G.fromBase64(b64), n);
  state.map = decode(msg.map);
  state.terrain = decode(msg.terrain);
  state.track = decode16(msg.track);
  state.world = {
    map: state.map, terrain: state.terrain, track: state.track,
    veg: decode16(msg.veg), vegHp: Uint8Array.from(msg.vh), scar: decode(msg.scar),
    ice: msg.ice ? G.rleDecode(G.fromBase64(msg.ice), G.ICE_BW * G.ICE_BH) : new Uint8Array(G.ICE_BW * G.ICE_BH),
  };
  G.indexVeg(state.world);
  state.rules = G.MAPS[state.mapId] || {};
  state.tick = msg.k;
  // ook bij een nieuw spel (nieuwe kaart): alles van het vorige spel vergeten
  state.tanks.clear();
  state.bullets.clear();
  const gs = msg.game || {};
  state.game = { round: gs.round ?? 1, phase: gs.phase ?? 'play', w: gs.w ?? -1, rw: gs.rw ?? -1, until: msg.k + (gs.left ?? 0) };
  for (const t of msg.tanks) state.tanks.set(t.i, { ...t, hist: t.x === undefined ? [] : [{ k: msg.k, x: t.x, y: t.y }] });
  for (const b of msg.bullets) state.bullets.set(b.id, { ...b, sx: b.x, sy: b.y, sk: msg.k });
  state.mines = new Set(msg.mines || []);
  state.mapTick = msg.m0 ?? msg.k;
  state.roundTick = msg.r0 ?? state.mapTick;
  state.weatherScale = msg.wx ?? 1;
  updateWeather(state);
  updateClock(state, msg.k, now);
  resetPrediction(state, now);
  hooks.onMap?.(state.map);
}

// Elke server-tick: zelfde volgorde als op de server
export function applyState(state, msg, hooks = {}, now = 0) {
  if (!state.map) return;
  const { world, tanks, bullets } = state;
  const tick = msg.k;
  state.tick = tick;
  const changed = (x, y) => hooks.onDig?.(x, y); // cel ziet er anders uit: weergave tekent hem opnieuw
  updateClock(state, tick, now);

  // 1. Kogels één tick verder (geen botsingen: als hij inslaat zit dat in de events)
  for (const b of bullets.values()) {
    const [dx, dy] = G.DIRS[b.d];
    b.x += dx * G.BULLET_SPEED; b.y += dy * G.BULLET_SPEED;
  }

  // 2. Gebeurtenissen (zie ON hieronder)
  const ctx = { tick, changed, newRound: false };
  for (const e of msg.e || []) {
    ON[e.t]?.(state, e, ctx);
    hooks.onEvent?.(e);
  }
  const newRound = ctx.newRound;

  if (state.smokes.length) state.smokes = state.smokes.filter((s) => s.until > tick);

  // 3. Tank-delta's toepassen en posities bijhouden voor de interpolatie
  let meRespawned = newRound;
  for (const u of msg.p || []) {
    let t = tanks.get(u.i);
    if (!t) { t = { hist: [] }; tanks.set(u.i, t); }
    const wasAlive = t.a;
    Object.assign(t, u);
    if ((!wasAlive && t.a) || newRound) {
      t.hist = []; // respawn: niet vanaf de oude plek laten glijden
      if (u.i === state.me) meRespawned = true;
    }
    if ('x' in u || 'y' in u || !t.hist.length) {
      t.hist.push({ k: tick, x: t.x, y: t.y });
      if (t.hist.length > HIST_LEN) t.hist.shift();
    }
  }

  // 4. Graven met de tankvorm, net als de server
  for (const t of tanks.values()) {
    if (!t.a) continue;
    G.digTank(world, t.x, t.y, t.d, changed);
    G.touchTank(world, t.x, t.y, t.d, changed);
  }

  // 5. Weer bijwerken en sporen vervagen (zelfde ticks en hetzelfde weer als de server)
  updateWeather(state);
  G.fadeStep(world, tick, state.game.phase === 'play' && state.weather.eraser, changed, changed);

  // 6. Voorspelling bijwerken met de bevestiging van de server
  const self = tanks.get(state.me);
  if (!self || !self.a) state.pred = null;
  else if (meRespawned || !state.pred) resetPrediction(state, now);
  else if (msg.y) reconcile(state, msg.y);
}

// ---------- Gebeurtenissen van de server ----------
// Elk tickbericht ('s') kan een lijst gebeurtenissen hebben (e). De codes zijn kort, want ze gaan
// 30 keer per seconde over de lijn. Per code wat de client met de kaart en de stand doet; de
// weergave krijgt elke gebeurtenis daarna ook (hooks.onEvent), bv. voor effecten en hints.
// Codes zonder eigen werk hier: 'hint' (groot geluid: richtingshint, {x, y, i, kind}).
// c = { tick, changed(x, y): cel ziet er anders uit, newRound: wordt true bij 'n' }
const ON = {
  // kogel ingeslagen {id, x, y, r: krater, o: van wie}. Op een plant of gebouw: één treffer
  // minder (zoals op de server); de weergave ziet aan e.veg/e.building en e.fell wat er
  // geraakt of omgegaan is, en aan e.box waar
  x(state, e, c) {
    state.bullets.delete(e.id);
    G.digStar(state.world, e.x, e.y, e.r, c.changed);
    const hitCell = G.inBounds(e.x, e.y) ? state.world.map[e.y * G.W + e.x] : -1;
    if (hitCell !== G.VEG && hitCell !== G.BUILDING) return;
    if (hitCell === G.VEG) e.veg = true; else e.building = true;
    const box = G.growBox(null, e.x, e.y);
    e.fell = G.hitObstacle(state.world, e.x, e.y, (x, y) => { G.growBox(box, x, y); c.changed(x, y); });
    if (e.fell) e.box = box;
  },
  k(state, e, c) { G.digStar(state.world, e.x, e.y, e.r, c.changed); }, // tank ontploft {i, x, y, r}
  m(state, e, c) { // mijn ontploft {x, y, r, i}
    state.mines.delete(e.y * G.W + e.x);
    G.digStar(state.world, e.x, e.y, e.r, c.changed);
  },
  b(state, e, c) { // schot {id, x, y, d, i: van wie (eigen kogels altijd te zien)}
    state.bullets.set(e.id, { x: e.x, y: e.y, d: e.d, i: e.i, sx: e.x, sy: e.y, sk: c.tick });
  },
  l(state, e) { state.tanks.delete(e.i); }, // speler vertrokken
  r(state, e, c) { // ronde voorbij {n, w: winnaar, left: ticks pauze}
    Object.assign(state.game, { phase: 'pause', rw: e.w, until: c.tick + e.left });
    state.bullets.clear();
  },
  g(state, e, c) { // spel gewonnen {w, left}
    Object.assign(state.game, { phase: 'over', w: e.w, until: c.tick + e.left });
    state.bullets.clear();
  },
  n(state, e, c) { // nieuwe ronde (of start vanuit de wachtkamer): iedereen in zijn basis
    Object.assign(state.game, { phase: 'play', round: e.n, rw: -1 });
    if (e.m0 !== undefined) state.mapTick = e.m0; // spel gestart: storm- en weerklok beginnen nu
    if (e.r0 !== undefined) state.roundTick = e.r0;
    c.newRound = true;
  },
  hz(state, e) { applyHz(state, e.hz); }, // spel gestart vanuit de wachtkamer: brug, munitiedepot e.d.
  h(state, e) { state.host = e.i; }, // andere host (de vorige is weg)
  z(state, e) { state.barrage = { box: e.box, at: e.at, kind: e.kind }; }, // (artillerie)barrage aangekondigd
  zb(state, e, c) { // inslag: kraters (artillerie) of kapotte boomtoppen (bos)
    if (e.craters) G.markArtillery(state.world, e.box, e.craters, c.changed); else G.markBarrage(state.world, e.box, c.changed);
    state.barrage = null;
  },
  fi(state, e) { state.fires.add(e.tile); }, // brand
  fo(state, e, c) { // uitgebrand: verbrande grond
    state.fires.delete(e.tile);
    G.burnTile(state.world, e.tile, c.changed);
  },
  gun(state, e) { // geschut vuurt (en is nu zichtbaar) of is geraakt
    const g = state.guns.find((o) => o.k === e.k);
    if (g) g.hp = e.hp; else state.guns.push({ k: e.k, x: e.x, y: e.y, ang: e.ang, hp: e.hp });
  },
  bridge(state, e, c) { // brug ontploft of hersteld
    if (!state.bridge) return;
    G.setBridge(state.world, state.bridge.cells, e.blown, c.changed);
    state.bridge.blown = e.blown;
  },
  drop(state, e) { state.crates[e.k] = e.c; }, // krat aan een parachute
  dropu(state, e) { if (state.crates[e.k]) state.crates[e.k][3] = 0; }, // krat opgepakt
  fc(state, e, c) { G.collapseRubble(state.world, e.box, c.changed); }, // gevel ingestort: puin
  fb(state, e, c) { // gebouw helemaal ingestort
    const box = e.box = G.growBox(null, e.x, e.y);
    e.fell = G.destroyObstacleAt(state.world, e.x, e.y, (x, y) => { G.growBox(box, x, y); c.changed(x, y); });
    e.building = true;
  },
  dep(state, e) { state.depots = e.list; }, // depots voor deze ronde
  depu(state, e) { if (state.depots[e.k]) state.depots[e.k][2] = 0; }, // depot leeg
  smoke(state, e, c) { // rookvlek die het zicht blokkeert {x, y, r, s: seconden}
    state.smokes.push({ x: e.x, y: e.y, r: e.r, until: c.tick + Math.round(e.s * G.TICK_RATE) });
  },
  err(state, e, c) { // melding (bv. bases passen niet op deze kaartgrootte)
    state.message = { text: e.msg, until: c.tick + G.NET.messageSeconds * G.TICK_RATE };
  },
  c(state, e) { state.world.ice[e.b] = e.n; }, // passage over een ijsvak (barsten)
  w(state, e, c) { e.box = G.breakIce(state.world, e.b, c.changed); }, // ijs gebroken: wak (de server gooide de dobbelsteen)
  W(state, e, c) { G.applyTerrainChange(state.world, e.change, e.extra, c.changed); }, // het weer verandert het terrein
};

// ---------- Klok: waar staat de server nu, gezien vanaf deze computer ----------
// We onthouden de snelste aankomst (laagste vertraging); trage pakketjes tellen
// daardoor nauwelijks mee en haperingen van het netwerk worden weggefilterd.
function updateClock(state, tick, now) {
  const sample = now - tick * TICK_MS;
  if (state.clockOffset === null || sample < state.clockOffset) state.clockOffset = sample;
  else state.clockOffset += (sample - state.clockOffset) * 0.01;
}

export function renderTick(state, now) {
  if (state.clockOffset === null) return state.tick;
  const t = (now - state.clockOffset) / TICK_MS - RENDER_DELAY;
  return Math.max(state.tick - 3, Math.min(state.tick, t));
}

// ---------- Je eigen tank voorspellen ----------
// Je tank rijdt meteen als je een toets indrukt, met dezelfde regels als de server
// (G.moveTank). Elke voorspelde tick wordt bewaard met het volgnummer van de invoer
// en hoeveelste tick met die invoer het is. De server stuurt terug hoe ver hij is
// (y = [volgnummer, aantal ticks, mv]); wij nemen zijn positie over en spelen
// de nog niet bevestigde ticks opnieuw af.

// Nieuwe invoer van het toetsenbord: geeft het volgnummer terug om mee te sturen
export function setInput(state, dx, dy, fire) {
  state.inputSeq++;
  state.input = { dx, dy, fire };
  return state.inputSeq;
}

function resetPrediction(state, now) {
  const self = state.tanks.get(state.me);
  if (!self || !self.a || self.x === undefined) { state.pred = null; return; }
  state.pred = {
    x: self.x, y: self.y, dir: self.d, mv: 0,
    px: self.x, py: self.y, // vorige voorspelde positie (voor vloeiend tekenen)
    offX: 0, offY: 0, // nog weg te werken correctie
    log: [], // onbevestigde ticks: {seq, n, dx, dy}
    lastStep: now,
  };
}

function others(state) {
  const out = [];
  for (const [id, t] of state.tanks) if (id !== state.me && t.a && t.x !== undefined) out.push(t);
  return out;
}

function simTank(state, from, input) {
  const self = state.tanks.get(state.me);
  if (state.game.phase !== 'play') return { ...from }; // tussen rondes staat alles stil
  const t = { x: from.x, y: from.y, dir: from.dir, mv: from.mv, fuel: self.f > 0 ? 1e9 : 0, input, slow: self.v };
  G.moveTank(t, state.world, others(state));
  return t;
}

// Eén lokale tick vooruit met de huidige invoer
export function predictStep(state) {
  const p = state.pred;
  if (!p) return;
  const last = p.log[p.log.length - 1];
  const n = last && last.seq === state.inputSeq ? last.n + 1 : 1;
  p.log.push({ seq: state.inputSeq, n, dx: state.input.dx, dy: state.input.dy });
  if (p.log.length > MAX_PRED) p.log.shift();
  const t = simTank(state, p, { dx: state.input.dx, dy: state.input.dy });
  p.px = p.x; p.py = p.y;
  p.x = t.x; p.y = t.y; p.dir = t.dir; p.mv = t.mv;
}

function reconcile(state, [seq, n, mv]) {
  const p = state.pred;
  const self = state.tanks.get(state.me);
  // bevestigde ticks weggooien
  while (p.log.length && (p.log[0].seq < seq || (p.log[0].seq === seq && p.log[0].n <= n))) p.log.shift();
  // vanaf de serverpositie de rest opnieuw afspelen
  let s = { x: self.x, y: self.y, dir: self.d, mv: mv | 0 };
  for (const e of p.log) s = simTank(state, s, { dx: e.dx, dy: e.dy });
  if (s.x !== p.x || s.y !== p.y) {
    // verschil zichtbaar wegwerken in plaats van te verspringen (bij grote sprongen: direct)
    const ex = p.x - s.x, ey = p.y - s.y;
    if (Math.abs(ex) + Math.abs(ey) < 6) { p.offX += ex; p.offY += ey; }
    p.px = s.x; p.py = s.y;
  }
  p.x = s.x; p.y = s.y; p.dir = s.dir; p.mv = s.mv;
}

// Laat de voorspelling meelopen met de tijd (30 ticks per seconde, zoals de server)
export function advancePrediction(state, now) {
  const p = state.pred;
  if (!p) return;
  if (now - p.lastStep > 10 * TICK_MS) p.lastStep = now - TICK_MS; // na een pauze niet inhalen
  if (now < p.lastStep - TICK_MS) p.lastStep = now; // klok liep terug (andere tijdbron): niet wachten
  while (now - p.lastStep >= TICK_MS) {
    predictStep(state);
    p.lastStep += TICK_MS;
  }
}

// ---------- Waar wordt alles getekend ----------
// Zet per tank rx, ry (positie) en rd (richting), en per kogel rx, ry en trail (lengte spoor).
let lastRender = 0;
export function updateRenderPositions(state, now) {
  const rt = renderTick(state, now);
  const dt = Math.min(0.1, (now - lastRender) / 1000);
  lastRender = now;
  advancePrediction(state, now);

  for (const [id, t] of state.tanks) {
    if (t.x === undefined) continue;
    const p = id === state.me ? state.pred : null;
    if (p) {
      const a = Math.max(0, Math.min(1, (now - p.lastStep) / TICK_MS)); // nooit voorbij de stap tekenen
      const k = Math.exp((-dt * 1000) / SMOOTH_MS);
      p.offX *= k; p.offY *= k;
      t.rx = p.px + (p.x - p.px) * a + p.offX;
      t.ry = p.py + (p.y - p.py) * a + p.offY;
      t.rd = p.dir;
      continue;
    }
    t.rd = t.d;
    const h = t.hist;
    if (!h.length) { t.rx = t.x; t.ry = t.y; continue; }
    // zoek de laatste stap die bij rt al begonnen is
    let i = h.length - 1;
    while (i > 0 && h[i].k - 1 > rt) i--;
    const cur = h[i], prev = h[i - 1];
    if (!prev || rt >= cur.k || Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 3) {
      const e = rt >= cur.k || !prev ? cur : prev;
      t.rx = e.x; t.ry = e.y;
    } else {
      const a = Math.max(0, rt - (cur.k - 1)); // de stap gebeurde tussen tick k-1 en k
      t.rx = prev.x + (cur.x - prev.x) * a;
      t.ry = prev.y + (cur.y - prev.y) * a;
    }
  }

  for (const b of state.bullets.values()) {
    const [dx, dy] = G.DIRS[b.d];
    const steps = Math.max(0, rt - b.sk) * G.BULLET_SPEED;
    b.rx = b.sx + dx * steps;
    b.ry = b.sy + dy * steps;
    b.trail = Math.min(3, steps); // spoor achter de kogel, niet langer dan wat hij gevlogen heeft
  }
}

// Het weer van nu, zelfde klok als de server. In de wachtkamer nog geen weer.
function updateWeather(state) {
  const lobby = state.game.phase === 'lobby';
  state.weather = lobby ? Weather.weatherAt(null, 1, 0, 0) : Weather.weatherAtTick(state.rules, state.game.round, state.tick, state.mapTick, state.roundTick, state.weatherScale);
  state.vision = state.weather.visibility;
}

// Storm van nu voor in beeld: null (geen) of {label, active, warn, secs} met secs = seconden
// tot hij begint (of, als hij woedt, tot hij stopt).
export function eraserInfo(state) {
  return state.weather?.storm || null;
}

// Hoe zichtbaar is het spoor van een cel: 0 = niets, 1 = vers en volledig tunnelkleur.
// In TRACK_STAGES stappen, zodat de weergave alleen bij een stapwissel hoeft te hertekenen.
export function trackMix(state, i) {
  if (!state.track) return 0;
  return G.trackStage(state.track[i]) / (G.TRACK_STAGES - 1);
}
