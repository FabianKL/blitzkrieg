// Gedeelde wereldweergave voor de gedetailleerde versies (1944, 1943, 1942, Koersk, Leningrad). Hier zit alles wat voor elke stijl hetzelfde is: verbinding, kaartschilder,
// ronde randen van rots/water/begroeiing, sporen, minikaart, objectlaag, camera, tanks,
// deeltjes, storm en meldingen. Een stijl levert alleen kleuren, tekeningen en zijn zijbalk.
//
// De kleuren van terrein, tunnels, rots, water en begroeiing komen uit de kaartconfiguratie
// (config.js); een stijl legt er zijn eigen textuur overheen (p.ground() en p.shade(), zie onder).
// Normaal draait een weergave ingebed (iframe) in de spelpagina op /: die heeft de verbinding,
// de menu's en de titel, en geeft de berichten door (window.parent.blitz). Los geopend (bv.
// /1944.html?kaart=koersk) maakt hij zelf verbinding: ?kaart=<id>, anders style.room.
// Teams: style.teamLook(spec, i) maakt van het tankuiterlijk uit de config (G.teamsFor) de
// velden die de stijl tekent; style.onTeams() na een wissel (caches leeg).
//
// Een stijl is een object met (alles behalve de kleuren is optioneel):
//   room, viewCells, background, teams, fullText (melding als het potje vol is)
//   ground, tunnel, rock, water, veg, base   kleur per pixel: (p) => zet p.r/p.g/p.b (zie hieronder)
//   ice, wak, building         ijs, wakken en gebouwen (anders de standaard hieronder)
// Kaartgrootte: ?grootte=klein|middel|groot|extragroot (geldt als het potje nog leeg is).
// De minikaart staat aan of uit via DISPLAY.minimap in config.js (of minimap per kaart);
// staat hij uit, dan verdwijnen het canvas en alles met data-minimap op de pagina.
//   mini(c, x, y)              kleur [r, g, b] van een cel op de minikaart
//   objects: {draw(octx, x0, y0, x1, y1), over}   eigen laag met bomen e.d. in celmaten; over = boven de tanks
//   afterTile, skipRepaint     doorgegeven aan de kaartschilder
//   clouds, cloudAlpha         soorten rook/stof voor de deeltjes
//   onMap(map), onEvent(e, spawn), drawUnder(ctx, cam, now), drawOver(ctx, cam, now)
//   drawBase(ctx, base), drawTank(ctx, team, x, y, angle, now), tracer: [kleur staart, kleur kop]
//   eraser                     stijl van de storm (zie drawEraser), hud(now) voor de zijbalk
import * as G from '/shared/game.js';
import { BUILDING as BUILDING_CFG, FOG, HINTS, TUNNEL } from '/shared/config.js';
import { sightOf, lineOfSight, blocksSight, hintDirection, canHear, searchlightBeams, searchlightAt } from '/shared/vision.js';
import { connect, updateRenderPositions } from '/net.js';
import { touchControls } from '/touch.js';
import {
  hash, vnoise, rgb, pack, cellAt, seenCell, trackMix, showsTunnel, obstacleFields, plantFelled, createObstacleSampler, isDebris,
  drawEraser, eraserInfo, findBases, blurField, createFieldSampler, createMapPainter, fitCanvas, camera,
  smoothTankAngles, visibleCells, drawTracer, createParticles, createOverlay, statusOverlay, showBandwidth,
} from '/render-common.js';

export const R = 6; // pixels per cel in de kaarttextuur
const OBJ_PAD = 4; // zo ver steekt het grootste object (boom, rotsblok) buiten zijn cel uit
const GROUND_SLOT = 8; // cache-vak voor de terreinkleur (stijlen gebruiken 0..7)
const ICE_CLS = G.CLASS.ice;
const smoothstep = (t) => t * t * (3 - 2 * t);

// Kleuren van de kaart als [r, g, b]; wat de kaart niet opgeeft, krijgt een neutrale kleur
const FALLBACK = { tunnel: '#2e2418', water: '#1f3440', rock: '#8d9196', veg: '#36502a' };
function makePalette(rules) {
  const hex = {
    tunnel: rules.tunnelColor || FALLBACK.tunnel, water: rules.water?.color || FALLBACK.water,
    rock: rules.rocks?.color || FALLBACK.rock, veg: rules.vegetation?.color || FALLBACK.veg, classes: {},
    building: rules.buildings?.color || BUILDING_CFG.color,
  };
  const named = Object.values(rules.classes || {}).find((c) => c.color)?.color || '#8a7a5a';
  for (const n of G.CLASS_NAMES) hex.classes[n] = rules.classes?.[n]?.color || named;
  return {
    hex,
    cls: G.CLASS_NAMES.map((n) => rgb(hex.classes[n])),
    tunnel: rgb(hex.tunnel), water: rgb(hex.water), rock: rgb(hex.rock), veg: rgb(hex.veg), building: rgb(hex.building),
  };
}

// Barsten in een ijsvak: per vak vaste lijnen (in pixels), per stadium twee meer
const crackCache = new Map();
function crackLines(b) {
  let segs = crackCache.get(b);
  if (segs) return segs;
  const rnd = G.mulberry32((b * 2654435761) >>> 0), B = G.ICE_B * R;
  const cx = (b % G.ICE_BW) * B + B / 2, cy = ((b / G.ICE_BW) | 0) * B + B / 2;
  segs = [];
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, len = B * (0.3 + rnd() * 0.25);
    const x0 = cx + (rnd() - 0.5) * B * 0.4, y0 = cy + (rnd() - 0.5) * B * 0.4;
    segs.push([x0, y0, Math.cos(a), Math.sin(a), len]);
  }
  crackCache.set(b, segs);
  return segs;
}

export function startWorld(style) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let game = null;
  let bases = [], rockField = null, fields = null;
  const rocks = createFieldSampler(R), obs = createObstacleSampler(R);
  const at = (x, y) => cellAt(game.map, x, y);
  const seen = (x, y) => seenCell(game, x, y);

  // ---------- Kaarttextuur ----------
  // Per pixel bepaalt de weergave wát er ligt (met ronde randen en vage sporen); de stijl
  // kiest alleen de kleur. p is één hergebruikt object, dus geen geheugen per pixel:
  //   x, y (cel), u, v (pixel in de cel), X, Y (pixel op de kaart), idx (celindex), cls (terreinklasse)
  //   own (celtype), c (wat deze pixel toont), nT/nB/nL/nR (buren zoals de weergave ze ziet)
  //   h (pixelhash), n (0..1), j (-8..7) voor korrel, base (basisnummer of -1)
  //   rockF/rockThr: rotsveld en drempel (rand = net boven de drempel), waterThr, vegThr
  //   set(r, g, b), packed(0xRRGGBB), cached(slot, fn), cachedValue(slot, fn), shade(k), debris()
  //   ground(): terreinkleur van de kaart, met zachte overgangen tussen de klassen
  //   tunnelBase(), waterBase(), rockBase(), vegBase(): kleur van de kaart voor dat soort cel
  //   waterF(), vegF(), rockAt(du, dv): veldwaarden voor randen en schaduw
  const p = {
    x: 0, y: 0, u: 0, v: 0, X: 0, Y: 0, idx: 0, cls: 0, own: 0, c: 0, nT: 0, nB: 0, nL: 0, nR: 0,
    h: 0, n: 0, j: 0, base: -1, rockF: 0, rockThr: 0.5, waterThr: 0.5, vegThr: 0.5, r: 0, g: 0, b: 0,
    get bases() { return bases; },
    set(r, g, b) { p.r = r; p.g = g; p.b = b; },
    packed(c) { p.r = (c >> 16) & 255; p.g = (c >> 8) & 255; p.b = c & 255; },
    cached(slot, fn) { p.packed(painter.cache(slot, p.X, p.Y, fn)); },
    cachedValue: (slot, fn) => painter.cache(slot, p.X, p.Y, fn),
    shade(k) { p.r *= k; p.g *= k; p.b *= k; },
    ground() { p.packed(painter.cache(GROUND_SLOT, p.X, p.Y, groundColor)); },
    tunnelBase() { p.set(...pal.tunnel); },
    waterBase() { p.set(...pal.water); },
    rockBase() { p.set(...pal.rock); },
    vegBase() { p.set(...pal.veg); },
    debris: () => isDebris(game, p.idx, p.h),
    waterF: () => obs.water.sample(p.u, p.v),
    vegF: () => obs.veg.sample(p.u, p.v),
    rockAt: (du, dv) => rocks.sample(p.u + du, p.v + dv),
  };
  let pal = makePalette({});
  // Terreinkleur op pixel (X, Y): de klassekleuren van de vier dichtstbijzijnde cellen, gemengd
  // op een met ruis verschoven plek. Zo lopen grenzen golvend en zacht in elkaar over in
  // plaats van in blokjes per cel.
  const clsColor = (x, y) => pal.cls[game.terrain[Math.min(G.H - 1, Math.max(0, y)) * G.W + Math.min(G.W - 1, Math.max(0, x))]];
  function groundColor(X, Y) {
    const wx = X / R - 0.5 + (vnoise(X / 13, Y / 13) - 0.5) * 2.2, wy = Y / R - 0.5 + (vnoise(X / 13 + 71, Y / 13 + 29) - 0.5) * 2.2;
    const x0 = Math.floor(wx), y0 = Math.floor(wy), fx = smoothstep(wx - x0), fy = smoothstep(wy - y0);
    const a = clsColor(x0, y0), b = clsColor(x0 + 1, y0), c = clsColor(x0, y0 + 1), d = clsColor(x0 + 1, y0 + 1);
    const mixc = (k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy;
    return pack(mixc(0), mixc(1), mixc(2));
  }
  // IJs: terreinkleur met lichte strepen en glinstering, plus barsten per vak
  function crackAt() {
    const st = G.iceStage(game.world.ice[G.iceBlockAt(p.x, p.y)]);
    if (!st) return false;
    const segs = crackLines(G.iceBlockAt(p.x, p.y)), px = p.X + 0.5, py = p.Y + 0.5;
    for (let k = 0; k < st * 2; k++) {
      const [x0, y0, dx, dy, len] = segs[k];
      const along = (px - x0) * dx + (py - y0) * dy;
      if (along >= -len && along <= len && Math.abs(-(px - x0) * dy + (py - y0) * dx) < 0.75) return true;
    }
    return false;
  }
  function paintIce() {
    p.ground();
    const s = Math.sin(p.X * 0.05 + p.Y * 0.35 + vnoise(p.X / 40, p.Y / 40) * 5);
    p.shade(1 + s * 0.035 + (p.n - 0.5) * 0.03);
    if (p.n > 0.993) p.set(248, 252, 255);
    if (crackAt()) p.shade(0.55);
  }
  // Wak: open water met ijsschotsen en een gebroken ijsrand
  function paintWak() {
    const ice = pal.cls[ICE_CLS];
    if (p.waterF() < p.waterThr + 0.1) { p.set(...ice); p.shade(1.08 + (p.n - 0.5) * 0.06); return; }
    const f = vnoise(p.X / 4.5, p.Y / 4.5);
    if (f > 0.7) { p.set(...ice); p.shade(f < 0.73 ? 0.7 : 0.95 + (p.n - 0.5) * 0.05); return; }
    p.waterBase();
    const k = Math.sin(p.X * 0.4 + p.Y * 0.15) * 4 + (p.n - 0.5) * 6;
    p.r += k; p.g += k; p.b += k;
  }

  // Gebouw: grijs dak met pannenrijen, donkere rand en een lichte nok in het midden
  function paintBuilding() {
    p.set(...pal.building);
    const edge = (p.u === 0 && p.nL !== G.BUILDING) || (p.u === R - 1 && p.nR !== G.BUILDING) ||
      (p.v === 0 && p.nT !== G.BUILDING) || (p.v === R - 1 && p.nB !== G.BUILDING);
    if (edge) { p.shade(0.5); return; }
    p.shade((p.Y % 3 === 0 ? 0.82 : 1) * (0.96 + p.n * 0.08) * (p.X % 9 === 0 ? 0.9 : 1));
  }
  // Puin van een kapotgeschoten gebouw: grijze brokken die nooit vervagen
  function rubble() {
    if ((p.h >>> 8) % 100 >= 38) return;
    p.set(...pal.building);
    p.shade(0.6 + p.n * 0.55);
  }

  const colorOf = [];
  colorOf[G.DIRT] = style.ground; colorOf[G.EMPTY] = style.tunnel; colorOf[G.ROCK] = style.rock;
  colorOf[G.WATER] = style.water; colorOf[G.VEG] = style.veg; colorOf[G.BUILDING] = style.building || paintBuilding;

  function paintCell(x, y, setPx) {
    const own = at(x, y), idx = y * G.W + x;
    p.x = x; p.y = y; p.idx = idx; p.own = own; p.cls = game.terrain[idx];
    p.nT = seen(x, y - 1); p.nB = seen(x, y + 1); p.nL = seen(x - 1, y); p.nR = seen(x + 1, y);
    p.base = own >= G.BASE ? own - G.BASE : own >= G.WALL && own < G.BASE ? own - G.WALL : -1;
    rocks.load(rockField, x, y);
    obs.load(fields, x, y, own, p.nT, p.nB, p.nL, p.nR);
    // in een echte rots/water/plantcel een lagere drempel, zodat losse cellen niet verdwijnen
    const thr = p.rockThr = own === G.ROCK ? 0.34 : 0.5;
    p.waterThr = own === G.WATER ? 0.34 : 0.5;
    p.vegThr = own === G.VEG ? 0.34 : 0.5;
    const tm = own === G.EMPTY ? trackMix(game, idx) : 0; // 1 = vers spoor, helemaal tunnel
    for (let v = 0; v < R; v++) {
      for (let u = 0; u < R; u++) {
        const X = x * R + u, Y = y * R + v, h = hash(X, Y);
        p.u = u; p.v = v; p.X = X; p.Y = Y; p.h = h;
        p.n = (h & 1023) / 1023; p.j = ((h >>> 10) & 15) - 8;
        const f = p.rockF = rocks.sample(u, v);
        let c = own;
        if (f >= thr) c = G.ROCK;
        else if (own === G.ROCK) {
          // afgeronde hoek van een rotscel: neem het terrein van de buur aan die kant
          const side = u < R / 2 ? p.nL : p.nR, vert = v < R / 2 ? p.nT : p.nB;
          c = side !== G.ROCK ? side : vert !== G.ROCK ? vert : G.DIRT;
        }
        c = obs.pick(u, v, c); // water en begroeiing met ronde randen
        if (c === G.EMPTY && !showsTunnel(h, tm)) c = G.DIRT; // vaag spoor: hier nog terrein
        p.c = c;
        if (p.cls === ICE_CLS && c === G.DIRT) (style.ice || paintIce)(p);
        else if (p.cls === ICE_CLS && c === G.WATER) (style.wak || paintWak)(p);
        else (colorOf[c] || style.base)(p); // muur en vloer van de bases: style.base
        if ((c === G.DIRT || c === G.EMPTY) && game.world.scar[idx] === G.SCAR_RUBBLE) rubble();
        setPx(X, Y, p.r, p.g, p.b);
      }
    }
  }

  // Kaartschilder, minikaart en objectlaag hebben de maat van de kaart: ze worden bij elke
  // nieuwe kaart opnieuw gemaakt (zie loadMap), want de kaartgrootte kan verschillen.
  let painter = null;

  // ---------- Minikaart: 1 pixel per cel, bijgewerkt per veranderde cel ----------
  // Een kaart om te navigeren, op elke map hetzelfde (canvas #mini op de pagina): het terrein in
  // de kleuren van de kaart (zoals de legenda), je eigen basis, je eigen tank en de plekken waar
  // je brandstof of munitie haalt. Geen tunnels of sporen (van niemand), geen andere bases en
  // geen andere tanks: wat gegraven is, toont gewoon het terrein eronder.
  let miniBase = null, minctx = null, miniImg = null;
  let miniDirty = false, lastMini = 0;
  const miniCanvas = $('mini'), miniCtx = miniCanvas?.getContext('2d');
  function makeMini() {
    miniBase = document.createElement('canvas');
    miniBase.width = G.W;
    miniBase.height = G.H;
    minctx = miniBase.getContext('2d');
    miniImg = minctx.createImageData(G.W, G.H);
  }
  const lighten = (c, k) => c.map((v) => v + (255 - v) * k);
  const MINI_TEAM = ['#2fd04a', '#2f7fe8', '#e8352b', '#f2b51c']; // als de stijl geen minikleur heeft
  const miniColor = (id) => style.teams[id]?.mini || MINI_TEAM[id] || '#ffffff';
  function paintMini(x, y) {
    if (!miniCanvas || !G.minimapOn(game.rules)) return;
    const c = at(x, y), idx = y * G.W + x, i = idx * 4;
    const own = c === G.BASE + game.me || c === G.WALL + game.me;
    let col;
    if (own) col = c === G.WALL + game.me ? rgb(miniColor(game.me)) : [240, 236, 222]; // muur in je ploegkleur
    else if (c === G.ROCK) col = pal.rock;
    else if (c === G.WATER) col = pal.water;
    else if (c === G.VEG) col = (hash(x, y) % 3 ? pal.veg : lighten(pal.veg, 0.12));
    else if (c === G.BUILDING) col = pal.building;
    else { // grond (ook tunnels en andermans basis): de terreinklasse, met wat korrel
      const k = 0.94 + (hash(x, y) % 100) / 1000;
      col = pal.cls[game.terrain[idx]].map((v) => v * k);
    }
    miniImg.data[i] = col[0]; miniImg.data[i + 1] = col[1]; miniImg.data[i + 2] = col[2]; miniImg.data[i + 3] = 255;
    miniDirty = true;
  }
  // Je eigen basis opnieuw kleuren (na het instappen weet je pas welke van jou is)
  let miniMe = -1;
  function paintOwnBase() {
    if (miniMe === game.me) return;
    miniMe = game.me;
    for (const b of bases) if (b) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) paintMini(x, y);
  }
  const MINI_ICON = { fuel: '#e0b02a', ammo: '#d8572e' };
  function drawMinimap() {
    const now = performance.now();
    if (!miniCanvas || !game.map || now - lastMini < 100) return;
    lastMini = now;
    const on = G.minimapOn(game.rules);
    if (miniCanvas.hidden === on) {
      miniCanvas.hidden = !on;
      for (const el of document.querySelectorAll('[data-minimap]')) el.hidden = !on;
    }
    if (!on) return;
    paintOwnBase();
    const g = miniCtx, opt = style.minimap || {};
    if (miniDirty) { minctx.putImageData(miniImg, 0, 0); miniDirty = false; }
    const sx = g.canvas.width / G.W, sy = g.canvas.height / G.H, px = 1 / sx; // px: één schermpixel in cellen
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.imageSmoothingEnabled = opt.smooth ?? true;
    g.drawImage(miniBase, 0, 0);
    opt.overlay?.(g);
    // brandstof en munitie: depots (Ardennen), munitiedepot (Fall Gelb), droppings (Market Garden)
    const icon = (x, y, kind) => {
      const r = 4 * px;
      g.fillStyle = 'rgba(0, 0, 0, 0.75)'; g.fillRect(x - r - px, y - r - px, 2 * r + 2 * px, 2 * r + 2 * px);
      g.fillStyle = MINI_ICON[kind]; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      g.fillStyle = 'rgba(0, 0, 0, 0.8)'; // B of M in het vakje
      g.font = `bold ${7 * px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(kind === 'fuel' ? 'B' : 'M', x, y + 0.4 * px);
    };
    for (const [x, y, full] of game.depots) if (full) icon(x, y, 'fuel');
    if (game.ammoDepot) icon(game.ammoDepot[0], game.ammoDepot[1], 'ammo');
    for (const c of game.crates) if (c && c[3]) icon(c[0], c[1], c[2]);
    // je eigen basis: een ring eromheen, zodat je hem altijd terugvindt
    const mine = bases[game.me];
    if (mine) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2 * px;
      g.strokeRect(mine.x0 - 3 * px, mine.y0 - 3 * px, mine.x1 - mine.x0 + 1 + 6 * px, mine.y1 - mine.y0 + 1 + 6 * px);
    }
    // wat je in beeld hebt, en je eigen tank (alleen die van jou)
    g.strokeStyle = opt.rect || 'rgba(255, 255, 255, 0.8)'; g.lineWidth = 1.5 * px;
    g.strokeRect(view.cam.x, view.cam.y, view.cam.w, view.cam.h);
    const self = game.tanks.get(game.me);
    if (self?.a && self.rx !== undefined) {
      g.fillStyle = '#000'; g.fillRect(self.rx - 5 * px, self.ry - 5 * px, 10 * px, 10 * px);
      g.fillStyle = miniColor(game.me); g.fillRect(self.rx - 3.5 * px, self.ry - 3.5 * px, 7 * px, 7 * px);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- Objectlaag (bomen, rotsblokken, struikjes) ----------
  // box = [x0, y0, x1, y1] in cellen: alleen dat stuk opnieuw tekenen (na een omgeschoten
  // plant), anders de hele kaart. Objecten die over de rand hangen, worden mee getekend maar
  // afgeknipt, zodat het precies zo uitkomt als bij de hele kaart.
  let objCanvas = null, octx = null;
  function makeObjects() {
    if (!style.objects) return;
    objCanvas = document.createElement('canvas');
    objCanvas.width = G.W * R;
    objCanvas.height = G.H * R;
    octx = objCanvas.getContext('2d');
  }
  function buildObjects(box) {
    if (!octx) return;
    const [x0, y0, x1, y1] = box ? [box[0] - OBJ_PAD, box[1] - OBJ_PAD, box[2] + OBJ_PAD + 1, box[3] + OBJ_PAD + 1] : [0, 0, G.W, G.H];
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.save();
    octx.beginPath(); octx.rect(x0 * R, y0 * R, (x1 - x0) * R, (y1 - y0) * R); octx.clip();
    octx.clearRect(x0 * R, y0 * R, (x1 - x0) * R, (y1 - y0) * R);
    octx.setTransform(R, 0, 0, R, 0, 0);
    style.objects.draw(octx, x0 - OBJ_PAD, y0 - OBJ_PAD, x1 + OBJ_PAD, y1 + OBJ_PAD);
    octx.restore();
  }

  // ---------- Effecten ----------
  const particles = createParticles(style.clouds || { smoke: '64, 60, 56' }, style.cloudAlpha || {});
  let shake = 0;
  function onEvent(e) {
    if (e.t === 'x' && e.fell) { // plant of gebouw weg: alleen daar de randen en objecten opnieuw
      plantFelled(fields, game.map, painter, e.box);
      buildObjects(e.box);
    }
    if (e.t === 'x' && e.building && (style.clouds || { smoke: 1 }).smoke) { // stof en brokken van een gebouw
      particles.spawn('smoke', e.x, e.y, e.fell ? 14 : 3, { speed: e.fell ? 5 : 2, life: e.fell ? 2.4 : 1.2, r0: 1, r1: e.fell ? 7 : 3 });
    }
    if (e.t === 'c') { // ijsvak heeft een passage meer: barsten opnieuw tekenen
      const bx = (e.b % G.ICE_BW) * G.ICE_B, by = ((e.b / G.ICE_BW) | 0) * G.ICE_B;
      painter.markRect(bx, by, bx + G.ICE_B - 1, by + G.ICE_B - 1);
    }
    if (e.t === 'w' && e.box) { // ijs gebroken: waterrand bijwerken
      const [x0, y0, x1, y1] = e.box;
      blurField(game.map, (c) => c === G.WATER, fields.water, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
      painter.markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      shake = Math.max(shake, 0.2);
    }
    if (e.t === 'W') loadMap(game.map); // het weer veranderde het terrein: alles opnieuw
    if (e.t === 'bridge') { // brug ontploft of hersteld
      const [x0, y0, x1, y1] = game.bridge?.box || [0, 0, 0, 0];
      blurField(game.map, (c) => c === G.WATER, fields.water, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
      painter.markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      if (e.blown) { particles.spawn('flash', e.x, e.y, 1, { life: 0.4, r0: 3, r1: 12 }); shake = Math.max(shake, 0.5); }
    }
    if (e.t === 'fb' && e.fell) { plantFelled(fields, game.map, painter, e.box); buildObjects(e.box); }
    if (e.t === 'fc') painter.markRect(e.box[0] - 1, e.box[1] - 1, e.box[2] + 1, e.box[3] + 1);
    if (e.t === 'gun' && e.tx !== undefined) { particles.spawn('flash', e.x, e.y, 1, { life: 0.2, r0: 1, r1: 3 }); }
    if (e.t === 'zb') { // barrage: inslagen en kapotte boomtoppen
      const [x0, y0, x1, y1] = e.box;
      painter.markRect(x0, y0, x1, y1);
      buildObjects(e.box);
      for (let k = 0; k < 8; k++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
        particles.spawn('flash', x, y, 1, { life: 0.3, r0: 1.5, r1: 5 });
        if ((style.clouds || { smoke: 1 }).smoke) particles.spawn('smoke', x, y, 3, { speed: 3, life: 2, r0: 1, r1: 5 });
      }
      shake = Math.max(shake, 0.3);
    }
    hintFor(e);
    if (e.t === 'k') {
      const self = game.tanks.get(game.me);
      if (self && Math.hypot(self.x - e.x, self.y - e.y) < style.viewCells / 2) shake = Math.max(shake, 0.35);
    }
    style.onEvent?.(e, particles.spawn);
  }

  // ---------- Verbinding ----------
  const setOverlay = createOverlay($('overlay'));
  function loadMap(map) {
    G.setMapSize(game.mapW, game.mapH); // deze module kan een eigen kopie van game.js hebben (iframe)
    const specs = G.teamsFor(game.rules);
    if (specs && style.teamLook) {
      specs.forEach((spec, i) => { style.teams[i] = style.teamLook(spec, i); });
      style.onTeams?.();
    }
    pal = makePalette(game.rules);
    view.colors = pal.hex;
    painter = createMapPainter({ R, paintCell, afterTile: style.afterTile, skipRepaint: style.skipRepaint });
    makeMini();
    miniMe = -1;
    makeObjects();
    crackCache.clear();
    rockField = blurField(map, (c) => c === G.ROCK);
    fields = obstacleFields(map);
    bases = findBases(map);
    style.onMap?.(map);
    for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) paintMini(x, y);
    buildObjects();
    buildLegend();
  }

  // ---------- Legenda (rechts): welke kleur is welk terrein ----------
  // Per kaart opgebouwd uit wat er echt ligt, met de namen uit de kaartinstellingen. Het
  // kleurvakje is een uitsnede van de getekende kaart zelf (met objecten), zodat het er precies
  // zo uitziet als in het spel; ligt iets (nog) niet op de kaart, dan de kleur uit de instellingen.
  const CLASS_LABEL = { paved: 'Verhard', hard: 'Harde grond', normal: 'Grond', soft: 'Zachte grond', marsh: 'Moeras', ford: 'Doorwaadbare plek', ice: 'IJs', burnt: 'Verbrande grond', retro: 'Zand' };
  function buildLegend() {
    const box = $('legend');
    if (!box) return;
    const rules = game.rules || {}, map = game.map, terrain = game.world.terrain;
    const counts = new Map();
    const kindAt = (i) => {
      const v = map[i];
      if (v === G.DIRT) return 'c' + terrain[i];
      return v === G.ROCK ? 'rock' : v === G.WATER ? 'water' : v === G.VEG ? 'veg' : v === G.BUILDING ? 'building' : null;
    };
    for (let i = 0; i < map.length; i++) { const k = kindAt(i); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
    const pct = (s) => `${Math.round(s * 100)}%`; // rijsnelheid (100% = over een weg)
    const rows = [];
    // terreinklassen: eerst in de volgorde van de kaartinstellingen, dan wat er verder ligt
    const names = [...Object.keys(rules.classes || {}), ...G.CLASS_NAMES].filter((n, i, a) => a.indexOf(n) === i);
    for (const n of names) {
      const c = G.CLASS[n], cfg = rules.classes?.[n];
      if (!counts.get('c' + c) && !cfg?.later) continue;
      const cls = G.CLASSES[c];
      rows.push({ kind: 'c' + c, color: pal.hex.classes[n], label: cfg?.label || CLASS_LABEL[n] || n,
        note: cls.noTunnel ? `${pct(cls.speed / G.SPEED_ONE)} · geen tunnel` : pct(cls.speed / G.SPEED_ONE) });
    }
    const extra = [
      ['veg', pal.hex.veg, rules.vegetation?.label || 'Begroeiing', 'wegschieten'],
      ['building', pal.hex.building, rules.buildings?.label || 'Gebouwen', 'wegschieten'],
      ['rock', pal.hex.rock, rules.rocks?.label || 'Rots', 'blokkeert'],
      ['water', pal.hex.water, rules.water?.label || 'Water', 'geen doorgang'],
    ];
    for (const [kind, color, label, note] of extra) if (counts.get(kind)) rows.push({ kind, color, label, note });
    rows.push({ kind: null, color: pal.hex.tunnel, label: 'Tunnel en spoor', note: pct(TUNNEL.speed) });
    // brandstof en munitie halen (zo staan ze op de minikaart: B en M)
    const scarce = rules.scarce?.type;
    if (scarce === 'fuelDepots' || scarce === 'airDrops') rows.push({ icon: 'fuel', label: scarce === 'airDrops' ? 'Dropping: brandstof' : 'Brandstofdepot', note: 'minikaart B' });
    if (scarce === 'ammoDepot' || scarce === 'airDrops') rows.push({ icon: 'ammo', label: scarce === 'airDrops' ? 'Dropping: munitie' : 'Munitiedepot', note: 'minikaart M' });
    box.replaceChildren(...rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      const sw = document.createElement('canvas');
      sw.className = 'legend-swatch';
      sw.width = sw.height = 4 * R;
      if (r.icon) paintIcon(sw, r.icon); else paintSwatch(sw, r.kind, r.color, kindAt);
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = r.label;
      const note = document.createElement('span');
      note.className = 'legend-note';
      note.textContent = r.note;
      row.append(sw, name, note);
      return row;
    }));
  }
  // Het B- of M-vakje zoals op de minikaart
  function paintIcon(sw, kind) {
    const g = sw.getContext('2d'), n = sw.width;
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.fillStyle = MINI_ICON[kind]; g.fillRect(2, 2, n - 4, n - 4);
    g.fillStyle = 'rgba(0, 0, 0, 0.85)'; g.font = `bold ${Math.round(n * 0.6)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind === 'fuel' ? 'B' : 'M', n / 2, n / 2 + 1);
  }
  // Uitsnede van 4x4 cellen waar alleen dit soort terrein ligt (of een effen vlak): liefst
  // midden in een vlak (6x6 gelijk, het middelste stuk), anders 4x4 (heggen, smalle wegen),
  // anders rond een klein stukje (losse struik); de plek die het dichtst bij het midden ligt
  function paintSwatch(sw, kind, color, kindAt) {
    const g = sw.getContext('2d'), N = 4;
    g.fillStyle = color;
    g.fillRect(0, 0, sw.width, sw.height);
    if (!kind) return;
    const same = (x0, y0, n) => {
      for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) if (kindAt(y * G.W + x) !== kind) return false;
      return true;
    };
    let spot = null;
    for (const n of [N + 2, N, 2]) {
      let best = Infinity;
      for (let y0 = 1; y0 + n < G.H; y0 += 2) {
        for (let x0 = 1; x0 + n < G.W; x0 += 2) {
          if (kindAt(y0 * G.W + x0) !== kind) continue;
          const d = Math.hypot(x0 - G.W / 2, y0 - G.H / 2);
          if (d < best && x0 + (n - N) / 2 >= 0 && y0 + (n - N) / 2 >= 0 && same(x0, y0, n)) { best = d; spot = [x0 + (n - N) / 2, y0 + (n - N) / 2]; }
        }
      }
      if (spot) break;
    }
    if (!spot) return;
    const [sx, sy] = spot;
    painter.flush({ x: sx, y: sy, w: N, h: N }); // zorgt dat dat stuk kaart geschilderd is
    g.drawImage(painter.canvas, sx * R, sy * R, N * R, N * R, 0, 0, sw.width, sw.height);
    if (objCanvas) g.drawImage(objCanvas, sx * R, sy * R, N * R, N * R, 0, 0, sw.width, sw.height);
  }
  const hooks = {
    onMap: loadMap,
    onDig: (x, y) => { painter.markDig(x, y); paintMini(x, y); mapVersion++; },
    onEvent,
    onStatus: statusOverlay(setOverlay, style.fullText || 'alle vier de tanks zijn al bemand'),
  };
  const shell = window.parent !== window ? window.parent.blitz : null;
  // Ingebed: de verbinding (en de voorspelling) loopt in de buitenpagina, met de klok van die
  // pagina. performance.now() telt per document vanaf het laden, en dit venster is later geladen
  // (bij elke kaartwissel opnieuw): zonder dit verschil sprong je tank bij elke toetsaanslag.
  let clockOffset = 0;
  if (shell) {
    clockOffset = performance.timeOrigin - window.parent.performance.timeOrigin;
    document.body.classList.add('embed');
    game = shell.game;
    shell.setHooks(hooks);
    // toetsen gaan naar het venster met de focus: doorgeven aan de verbinding van de spelpagina
    for (const type of ['keydown', 'keyup', 'blur']) addEventListener(type, game.key);
  } else {
    const query = new URLSearchParams(location.search);
    game = connect(hooks, { room: query.get('kaart') || style.room, size: query.get('grootte') });
  }
  if ($('net')) showBandwidth(game, $('net'));
  touchControls($('panel'), game);

  // ---------- Tekenen ----------
  fitCanvas(canvas, $('panel'));
  let lastFrame = performance.now();
  const [tracerTail, tracerHead] = style.tracer || ['rgba(255, 170, 60, 0)', 'rgba(255, 220, 130, 1)'];

  function drawWorld(now, dt) {
    updateRenderPositions(game, now + clockOffset); // eigen tank voorspeld, de rest vloeiend uit de buffer
    smoothTankAngles(game, dt);
    if (shake > 0) shake -= dt;
    const cam = view.cam = camera(game, canvas, style.viewCells, shake);
    painter.flush(cam);

    ctx.setTransform(cam.Z, 0, 0, cam.Z, -cam.drawX * cam.Z, -cam.drawY * cam.Z);
    ctx.imageSmoothingEnabled = true;
    const { sx, sy, sw, sh } = visibleCells(cam);
    ctx.drawImage(painter.canvas, sx * R, sy * R, sw * R, sh * R, sx, sy, sw, sh);
    if (objCanvas && !style.objects.over) ctx.drawImage(objCanvas, sx * R, sy * R, sw * R, sh * R, sx, sy, sw, sh);
    style.drawUnder?.(ctx, cam, now);
    drawLandmarks();
    drawDepots();
    drawObjectsOfHazards(now);

    for (const b of bases) {
      if (b && b.x1 + 3 >= cam.x && b.x0 - 3 <= cam.x + cam.w && b.y1 + 3 >= cam.y && b.y0 - 3 <= cam.y + cam.h) style.drawBase(ctx, b);
    }
    for (const b of game.bullets.values()) drawTracer(ctx, b, tracerTail, tracerHead);
    // tanks: de eigen altijd, tegenstanders scherp, als schim of helemaal niet (§9)
    const me = eye();
    for (const [id, t] of game.tanks) {
      if (!t.a || t.rx === undefined || t.ang === undefined) continue;
      const seen = id === game.me || DEBUG ? 'sharp' : me && sightOf(game.map, me, { x: Math.round(t.rx), y: Math.round(t.ry), buried: t.b }, visionRadius(), cam, game.smokes);
      t.seen = seen;
      if (id === game.me && t.b) drawBuried(t);
      else if (seen === 'sharp') style.drawTank(ctx, style.teams[id], t.rx + 0.5, t.ry + 0.5, t.ang, now);
      else if (seen === 'ghost') drawGhost(t.rx + 0.5, t.ry + 0.5);
    }
    // objecten boven de tanks: takken hangen over tunnels en tanks heen
    if (objCanvas && style.objects.over) ctx.drawImage(objCanvas, sx * R, sy * R, sw * R, sh * R, sx, sy, sw, sh);

    drawBarrage(now);
    drawFires(now);
    drawDust(now);
    particles.draw(ctx, dt);
    drawSmokes(now);
    if (!DEBUG && me) { drawShadows(me, cam); drawFog(me, cam); drawMirages(me, cam, now); }
    drawSearchlights(cam);
    style.drawOver?.(ctx, cam, now);
    if (style.eraser) drawEraser(ctx, canvas, eraserInfo(game), now, style.eraser);
    drawHints(now);
  }

  // ---------- Zicht (§9) ----------
  // ?debug=alles: alles zichtbaar (alleen op deze computer, voor het ontwikkelen)
  const DEBUG = ['localhost', '127.0.0.1'].includes(location.hostname) &&
    [location.search, window.parent !== window ? window.parent.location.search : ''].some((q) => new URLSearchParams(q).get('debug') === 'alles');
  // zichtstraal in cellen; het weer (game.vision, in T) kan hem kleiner maken
  const visionRadius = () => {
    const cfg = game.weather?.flags.searchlights, me = eye();
    // in een zoeklicht zie je verder (§10.9)
    if (cfg && me && searchlightAt(cfg, game.tick - game.mapTick, me.x, me.y)) return G.visionCells(cfg.visibility);
    return G.visionCells(game.vision ?? G.VISION.defaultT);
  };
  // waar kijk je vandaan: je eigen tank (of het midden van het beeld als je dood bent)
  function eye() {
    const self = game.tanks.get(game.me);
    if (self && self.a && self.rx !== undefined) return { x: Math.round(self.rx), y: Math.round(self.ry) };
    return null;
  }
  // Schim: een vage donkere vlek zonder details en zonder richting van de loop
  function drawGhost(x, y) {
    const g = ctx.createRadialGradient(x, y, 0.5, x, y, 4.5);
    g.addColorStop(0, `rgba(12, 12, 14, ${FOG.ghostAlpha})`);
    g.addColorStop(1, 'rgba(12, 12, 14, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  // Eigen bedekte tank: een hoopje sneeuw of zand met een vage omtrek
  function drawBuried(t) {
    const x = t.rx + 0.5, y = t.ry + 0.5;
    ctx.fillStyle = style.burialColor || 'rgba(236, 232, 220, 0.9)';
    ctx.beginPath(); ctx.ellipse(x, y, 4, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40, 40, 40, 0.35)'; ctx.lineWidth = 0.25;
    ctx.beginPath(); ctx.ellipse(x, y, 3.4, 2.4, t.ang || 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Buiten de zichtstraal steeds vager en donkerder naar de rand van het venster
  function drawFog(me, cam) {
    const r = visionRadius(), far = Math.hypot(cam.w, cam.h) / 2 + Math.hypot(me.x + 0.5 - (cam.x + cam.w / 2), me.y + 0.5 - (cam.y + cam.h / 2));
    const g = ctx.createRadialGradient(me.x + 0.5, me.y + 0.5, r, me.x + 0.5, me.y + 0.5, Math.max(r + 1, far));
    const fade = game.weather?.flags.night ? 0.92 : FOG.fade; // 's nachts veel donkerder
    g.addColorStop(0, 'rgba(8, 8, 10, 0)');
    g.addColorStop(0.55, `rgba(8, 8, 10, ${fade * 0.6})`);
    g.addColorStop(1, `rgba(8, 8, 10, ${fade})`);
    ctx.fillStyle = g;
    ctx.fillRect(cam.x - 2, cam.y - 2, cam.w + 4, cam.h + 4);
  }
  // Achter gebouwen en begroeiing wordt het terrein donkerder: per 2 cellen een straal vanaf
  // je tank; opnieuw uitgerekend als je verplaatst of de kaart verandert
  const SH = 2, shadowCanvas = document.createElement('canvas'), shctx = shadowCanvas.getContext('2d');
  let shadowKey = '', shadowAt = 0, mapVersion = 0;
  function drawShadows(me, cam) {
    const x0 = Math.floor(cam.x / SH) * SH, y0 = Math.floor(cam.y / SH) * SH;
    const gw = Math.ceil(cam.w / SH) + 2, gh = Math.ceil(cam.h / SH) + 2;
    const key = `${me.x},${me.y},${x0},${y0},${gw},${gh},${mapVersion}`;
    const now = performance.now();
    if (key !== shadowKey && now - shadowAt > 80) {
      shadowKey = key; shadowAt = now;
      if (shadowCanvas.width !== gw || shadowCanvas.height !== gh) { shadowCanvas.width = gw; shadowCanvas.height = gh; }
      const img = shctx.createImageData(gw, gh), a = Math.round(FOG.shadow * 255);
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const tx = x0 + i * SH + 1, ty = y0 + j * SH + 1;
          const n = Math.max(Math.abs(tx - me.x), Math.abs(ty - me.y));
          for (let s = 3; s < n - 1; s++) { // het blokkerende ding zelf blijft licht
            const cx = Math.round(me.x + ((tx - me.x) * s) / n), cy = Math.round(me.y + ((ty - me.y) * s) / n);
            if (G.inBounds(cx, cy) && blocksSight(game.map[cy * G.W + cx])) { img.data[(j * gw + i) * 4 + 3] = a; break; }
          }
        }
      }
      shctx.putImageData(img, 0, 0);
      shadowCanvas.x0 = x0; shadowCanvas.y0 = y0;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadowCanvas, shadowCanvas.x0 - SH / 2, shadowCanvas.y0 - SH / 2, shadowCanvas.width * SH, shadowCanvas.height * SH);
  }
  // Rook: blokkeert het zicht zolang hij hangt (game.smokes, van de server)
  function drawSmokes(now) {
    for (const s of game.smokes) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + now / 3000, x = s.x + Math.cos(a) * s.r * 0.4, y = s.y + Math.sin(a * 1.3) * s.r * 0.35;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 0.75);
        g.addColorStop(0, 'rgba(70, 68, 64, 0.55)');
        g.addColorStop(1, 'rgba(70, 68, 64, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, s.r * 0.75, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---------- Richtingshints (§8): gloed aan de rand in één van 8 richtingen ----------
  const hints = [];
  function addHint(x, y) {
    const me = eye();
    if (!me) return;
    hints.push({ dir: hintDirection(x - me.x, y - me.y), t0: performance.now() });
  }
  function drawHints(now) {
    const W = canvas.width, H = canvas.height, d = Math.min(W, H) * 0.16;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = hints.length - 1; k >= 0; k--) {
      const age = (now - hints[k].t0) / 1000;
      if (age > HINTS.glowSeconds) { hints.splice(k, 1); continue; }
      const alpha = 0.75 * (age < 0.25 ? age / 0.25 : 1 - (age - 0.25) / (HINTS.glowSeconds - 0.25)); // oplichten en doven
      const dir = hints[k].dir, col = (a) => `rgba(255, 70, 40, ${a})`;
      let g;
      if (dir % 2 === 0) { // een zijde
        const [x0, y0, x1, y1] = [[0, 0, 0, d], [W, 0, W - d, 0], [0, H, 0, H - d], [0, 0, d, 0]][dir / 2];
        g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, col(alpha)); g.addColorStop(1, col(0));
        ctx.fillStyle = g;
        if (dir === 0) ctx.fillRect(0, 0, W, d); else if (dir === 2) ctx.fillRect(W - d, 0, d, H); else if (dir === 4) ctx.fillRect(0, H - d, W, d); else ctx.fillRect(0, 0, d, H);
      } else { // een hoek
        const [cx, cy] = [[W, 0], [W, H], [0, H], [0, 0]][(dir - 1) / 2];
        g = ctx.createRadialGradient(cx, cy, 0, cx, cy, d * 2.2);
        g.addColorStop(0, col(alpha)); g.addColorStop(1, col(0));
        ctx.fillStyle = g;
        ctx.fillRect(cx ? W - d * 2.2 : 0, cy ? H - d * 2.2 : 0, d * 2.2, d * 2.2);
      }
    }
  }
  // Welke gebeurtenissen geven een hint? Geluiden van een tegenstander binnen gehoorafstand,
  // grote gebeurtenissen (e.t === 'hint') overal.
  function hintFor(e) {
    const me = eye();
    if (!me || DEBUG) return;
    if (e.t === 'b' && e.i !== game.me && canHear(me, e.x, e.y)) addHint(e.x, e.y); // schot
    else if (e.t === 'x' && e.fell && e.o !== game.me && canHear(me, e.x, e.y)) addHint(e.x, e.y); // begroeiing/gebouw kapot
    else if (e.t === 'c' && e.i !== game.me) { // ijs kraakt onder een tegenstander
      const t = game.tanks.get(e.i);
      if (t && canHear(me, t.x, t.y)) addHint(t.x, t.y);
    } else if (e.t === 'hint' && e.i !== game.me) addHint(e.x, e.y); // groot: overal te zien
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (game.map) { drawWorld(now, dt); drawRoundLabel(); drawGauge(); drawMinimap(); }
    style.hud?.(now);
    if (game.status === 'playing') gameOverlay();
  }

  // Brandstofdepot: een stapel jerrycans; leeg = grijs en omgevallen
  function drawDepots() {
    for (const [x, y, full] of game.depots) {
      for (let k = 0; k < 4; k++) {
        const cx = x - 1.6 + (k % 2) * 1.9, cy = y - 1.4 + Math.floor(k / 2) * 2.1;
        ctx.fillStyle = full ? '#4e6b2a' : '#6a6a64';
        ctx.save(); ctx.translate(cx, cy); if (!full) ctx.rotate(0.6 * (k - 1.5));
        ctx.fillRect(-0.8, -1, 1.6, 2);
        ctx.fillStyle = full ? '#c9b26a' : '#9a9a92'; ctx.fillRect(-0.3, -1.3, 0.6, 0.35);
        ctx.restore();
      }
    }
  }
  // Aangekondigde barrage: het vak flitst (artillerie) en de boomtoppen trillen (bos, §10.8)
  function drawBarrage(now) {
    const b = game.barrage;
    if (!b) return;
    const [x0, y0, x1, y1] = b.box, p = 0.5 + 0.5 * Math.sin(now / 70);
    if (b.kind === 'art') { // §10.9: het vak licht op
      ctx.fillStyle = `rgba(255, 240, 180, ${0.12 + 0.18 * p})`;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    ctx.fillStyle = `rgba(255, 120, 40, ${0.08 + 0.12 * p})`;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = `rgba(255, 90, 30, ${0.5 + 0.4 * p})`; ctx.lineWidth = 0.5;
    ctx.setLineDash([1.5, 1]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
    for (let k = 0; k < 10; k++) { // trillende boomtoppen
      const x = x0 + ((k * 7.3) % (x1 - x0)), y = y0 + ((k * 4.1) % (y1 - y0));
      if (at(Math.round(x), Math.round(y)) !== G.VEG) continue;
      ctx.fillStyle = 'rgba(30, 50, 30, 0.5)';
      ctx.beginPath(); ctx.arc(x + Math.sin(now / 40 + k) * 0.6, y, 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Gevaren en schaarse middelen die als ding op de kaart staan
  function drawObjectsOfHazards(now) {
    if (game.ammoDepot) { // munitiekisten (Grebbeberg)
      const [x, y] = game.ammoDepot;
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#6a5a2a'; ctx.fillRect(x - 3 + k * 2.2, y - 1, 1.8, 1.4);
        ctx.fillStyle = '#c9a43a'; ctx.fillRect(x - 3 + k * 2.2, y - 1, 1.8, 0.35);
      }
    }
    for (const c of game.crates) { // krat aan een parachute (Market Garden)
      if (!c) continue;
      const [x, y, kind, full] = c;
      if (full) {
        ctx.strokeStyle = 'rgba(240, 240, 230, 0.8)'; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.arc(x, y - 2.5, 2.2, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2.2, y - 2.5); ctx.lineTo(x, y); ctx.lineTo(x + 2.2, y - 2.5); ctx.stroke();
      }
      ctx.fillStyle = full ? (kind === 'fuel' ? '#4e6b2a' : '#8a6a2a') : '#6a6a64';
      ctx.fillRect(x - 1.2, y - 1, 2.4, 2);
    }
    for (const g of game.guns) { // antitankgeschut (Carentan), zichtbaar na het eerste schot
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ang);
      ctx.fillStyle = g.hp > 0 ? '#4a4a3a' : '#2a2a26';
      ctx.fillRect(-1.5, -1.2, 3, 2.4);
      ctx.fillRect(0, -0.25, g.hp > 0 ? 4 : 2, 0.5);
      ctx.restore();
    }
    const br = game.bridge;
    if (br?.blown) { // wrak van de brug
      const [x0, y0, x1, y1] = br.box;
      ctx.fillStyle = 'rgba(60, 50, 40, 0.8)';
      for (let k = 0; k < 6; k++) ctx.fillRect(x0 + ((x1 - x0) * k) / 6, (y0 + y1) / 2 - 1 + ((k % 2) * 2 - 1), (x1 - x0) / 8, 1.2);
    }
  }
  // Brandend graan (Koersk): vlammen op de brandende vakken
  function drawFires(now) {
    if (!game.fires.size) return;
    const tw = Math.ceil(G.W / G.T);
    for (const tile of game.fires) {
      const x = (tile % tw) * G.T, y = ((tile / tw) | 0) * G.T;
      for (let k = 0; k < 4; k++) {
        const fx = x + 1 + ((k * 1.7) % 3.5), fy = y + 1 + ((k * 2.3) % 3.5), f = 0.6 + 0.4 * Math.sin(now / 90 + k * 1.9 + tile);
        ctx.fillStyle = `rgba(255, ${120 + 80 * f}, 40, 0.85)`;
        ctx.beginPath(); ctx.arc(fx, fy, 0.8 + 0.5 * f, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // Stofwolk achter tanks die over harde grond rijden (Barbarossa, zomer)
  function drawDust(now) {
    if (!game.weather?.flags.dust) return;
    for (const [id, t] of game.tanks) {
      if (!t.a || t.rx === undefined || (id !== game.me && t.seen !== 'sharp')) continue;
      const cls = G.CLASSES[game.terrain[Math.round(t.ry) * G.W + Math.round(t.rx)]]?.name;
      if (cls !== 'hard' || Math.abs(t.rx - (t.dustX ?? t.rx)) + Math.abs(t.ry - (t.dustY ?? t.ry)) < 0.01) { t.dustX = t.rx; t.dustY = t.ry; continue; }
      t.dustX = t.rx; t.dustY = t.ry;
      if (Math.random() < 0.4) particles.spawn('smoke', t.rx, t.ry, 1, { speed: 1, life: 2, r0: 1, r1: 3.5 });
    }
  }
  // Zoeklichten (Oder-front): bundels vanaf de rechterrand; daarin is alles licht
  function drawSearchlights(cam) {
    const cfg = game.weather?.flags.searchlights;
    if (!cfg) return;
    const half = (cfg.widthT * G.T) / 2;
    for (const b of searchlightBeams(cfg, game.tick - game.mapTick)) {
      const L = G.W * 1.3, c = Math.cos(b.ang), s = Math.sin(b.ang);
      ctx.fillStyle = 'rgba(255, 250, 210, 0.16)';
      ctx.beginPath();
      ctx.moveTo(b.x0 - s * half, b.y0 + c * half);
      ctx.lineTo(b.x0 + c * L - s * half * 1.6, b.y0 + s * L + c * half * 1.6);
      ctx.lineTo(b.x0 + c * L + s * half * 1.6, b.y0 + s * L - c * half * 1.6);
      ctx.lineTo(b.x0 + s * half, b.y0 - c * half);
      ctx.fill();
    }
  }
  // Woestijnhallucinaties (El Alamein): buiten je zichtstraal soms een valse schim; per speler
  // anders en niet gesynchroniseerd (§6.4)
  const mirages = [];
  let nextMirage = 0;
  function drawMirages(me, cam, now) {
    if (!game.weather?.flags.mirages) return;
    if (!nextMirage) nextMirage = now + 15000 * Math.random();
    if (now > nextMirage) {
      nextMirage = now + 15000 * (0.5 + Math.random()); // gemiddeld eens per 15 s
      const r = visionRadius(), a = Math.random() * Math.PI * 2, d = r + 6 + Math.random() * Math.max(4, Math.min(cam.w, cam.h) / 2 - r - 6);
      mirages.push({ x: me.x + Math.cos(a) * d, y: me.y + Math.sin(a) * d, until: now + 2000 + Math.random() * 2000 });
    }
    for (let k = mirages.length - 1; k >= 0; k--) {
      if (now > mirages[k].until) { mirages.splice(k, 1); continue; }
      drawGhost(mirages[k].x, mirages[k].y);
    }
  }

  // Herkenningspunt van een dorp: een kruis op het dak van de kerk (zolang die nog staat)
  function drawLandmarks() {
    for (const l of game.landmarks) {
      if (at(Math.round(l.x), Math.round(l.y)) !== G.BUILDING) continue;
      ctx.fillStyle = 'rgba(40, 36, 30, 0.85)';
      ctx.fillRect(l.x - 0.6, l.y - 3.5, 1.2, 7);
      ctx.fillRect(l.x - 2.2, l.y - 1.8, 4.4, 1.2);
    }
  }

  // ---------- Ronde en score (§2) ----------
  const nameOf = (id) => style.teams[id]?.name || `SPELER ${id + 1}`;
  function gameOverlay() {
    const g = game.game, self = game.tanks.get(game.me);
    const secs = Math.max(0, Math.ceil((g.until - game.tick) / G.TICK_RATE));
    if (g.phase === 'lobby') {
      setOverlay('WACHTKAMER', game.me === game.host ? 'jij bent de host: kies bovenin een kaart en grootte en druk op START' : 'wachten tot de host het spel start…');
    } else if (g.phase === 'over') setOverlay(`${g.w === game.me ? 'GEWONNEN' : 'WINNAAR: ' + nameOf(g.w)}`, `nieuw spel met een nieuwe kaart over ${secs} s`);
    else if (g.phase === 'pause') {
      const who = g.rw < 0 ? (game.tanks.size > 2 ? 'ronde voorbij' : 'niemand wint de ronde') : `${nameOf(g.rw)} wint de ronde`;
      setOverlay(`RONDE ${g.round + 1}`, `${who} · iedereen terug naar de basis over ${secs} s`);
    } else setOverlay(self && self.a === 0 ? 'UITGESCHAKELD' : '', 'wacht op de volgende ronde…');
  }
  // Meter van de kaart (zand, motorwarmte, temperatuur) boven het rondelabel
  function drawGauge() {
    const m = game.rules.meter, self = game.tanks.get(game.me);
    if (!m || !self) return;
    const s = devicePixelRatio || 1, x = 8 * s, y = canvas.height - 58 * s, w = 180 * s, h = 22 * s, v = (self.g ?? 0) / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(16, 12, 8, 0.7)'; ctx.fillRect(x, y, w, h);
    const warn = m.danger !== undefined && (m.low ? self.g <= m.danger : self.g >= m.danger);
    ctx.fillStyle = warn ? '#e0533a' : m.color || '#e0b040';
    ctx.fillRect(x + 4 * s, y + 4 * s, (w - 8 * s) * v, h - 8 * s);
    ctx.fillStyle = '#f0e6c8'; ctx.font = `bold ${11 * s}px monospace`; ctx.textBaseline = 'middle';
    ctx.fillText(`${m.label.toUpperCase()} ${self.g ?? 0}`, x + 8 * s, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // Rondenummer en hoe je wint, linksonder in beeld
  function drawRoundLabel() {
    const players = game.tanks.size;
    const goal = G.scoreMode(players) === 'rounds' ? `${G.GAME.roundsToWin} RONDES WINT` : `${G.GAME.killsToWin} KILLS WINT`;
    const txt = `RONDE ${game.game.round} · ${goal}`, s = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `bold ${12 * s}px monospace`;
    const w = ctx.measureText(txt).width + 16 * s;
    ctx.fillStyle = 'rgba(16, 12, 8, 0.7)';
    ctx.fillRect(8 * s, canvas.height - 30 * s, w, 22 * s);
    ctx.fillStyle = '#f0e6c8';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 16 * s, canvas.height - 19 * s);
    ctx.textBaseline = 'alphabetic';
  }
  requestAnimationFrame(frame);

  // Wat een stijl nodig heeft voor zijn zijbalk en effecten
  const view = {
    game, canvas, ctx,
    cam: { x: 0, y: 0, w: 0, h: 0, Z: 1, drawX: 0, drawY: 0 },
    at,
    get bases() { return bases; },
    colors: pal.hex, // kaartkleuren als #rrggbb (rock, veg, water, tunnel, classes[naam])
    shake(s) { shake = Math.max(shake, s); },
    drawMinimap,
    eraserInfo: () => eraserInfo(game),
  };
  // ingebed: de kaart kan er al zijn voordat deze weergave geladen was. Pas na deze functie,
  // want de stijl heeft zijn view dan nog niet (const view = startWorld(...)).
  if (shell && game.map) queueMicrotask(() => { loadMap(game.map); hooks.onStatus(game.status); });
  return view;
}
