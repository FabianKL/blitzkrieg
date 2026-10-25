// Gedeelde wereldweergave voor alle maps (stijlen 1944, 1943, 1942). Hier zit alles wat voor elke
// stijl hetzelfde is: verbinding, kaartschilder, ronde randen van rots/water/begroeiing, sporen,
// minikaart, objectlaag, camera, tanks, deeltjes, storm en meldingen. Een stijl levert alleen
// kleuren, tekeningen en zijn zijbalk.
//
// Tekenen gaat met PixiJS (WebGL) in lagen, zie L in startWorld. De gamestate is de enige bron:
// de weergave leest hem elk frame uit en zet sprites en Graphics klaar. Wat duur is om te tekenen
// (kaart, bomen, bases, tanks) wordt één keer met Canvas 2D getekend en als texture gebruikt;
// van de kaart worden alleen gewijzigde tegels opnieuw geüpload.
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
//   objects: {draw(ctx, x0, y0, x1, y1), over}   eigen laag met bomen e.d. (Canvas 2D, in celmaten); over = boven de tanks
//   afterTile, skipRepaint     doorgegeven aan de kaartschilder
//   clouds, cloudAlpha         soorten rook/stof voor de deeltjes
//   onMap(map), onEvent(e, spawn)
//   drawUnder(g, cam, now)     extra's onder de tanks; g is een Pixi-Graphics in celmaten
//   overlay(cam, now)          canvas dat over het hele speelveld komt (witte mist), of niets
//   drawBase(ctx, base)        Canvas 2D in celmaten, één keer per kaart
//   drawTank(ctx, team, x, y, angle, now)   Canvas 2D in celmaten, zonder schaduw; één keer per
//                              ploeg (tankFrames plaatjes over tankPeriod ms als er iets beweegt)
//   shadow: {color, alpha, dx, dy}   schaduw van tanks en bases (licht van linksboven)
//   tracer: [kleur staart, kleur kop]
//   eraser                     stijl van de storm (zie drawEraser), hud(now) voor de zijbalk
import * as G from '/shared/game.js';
import { BUILDING as BUILDING_CFG, FOG, HINTS, TUNNEL, LOOK } from '/shared/config.js';
import { sightOf, lineOfSight, blocksSight, hintDirection, canHear, searchlightBeams, searchlightAt } from '/shared/vision.js';
import { connect, updateRenderPositions } from '/net.js';
import { touchControls } from '/touch.js';
import { autoDetectRenderer, Container, Graphics, Sprite, ColorMatrixFilter, DisplacementFilter } from 'pixi.js';
import { createNoise2D } from 'simplex-noise';
import { KawaseBlurFilter } from 'pixi-filters';
import {
  hash, vnoise, rgb, pack, cellAt, seenCell, trackMix, showsTunnel, obstacleFields, plantFelled, createObstacleSampler, isDebris,
  eraserInfo, findBases, blurField, createFieldSampler, createMapPainter, createTileCanvases, TILE, camera,
  smoothTankAngles, createOverlay, statusOverlay, showBandwidth,
} from '/render-common.js';
import { TEX, textureOf, drawnTexture, tintOf, rgba, createTileSprites, createParticles, createLabel, spritePool } from '/pixi-scene.js';

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

// Uiterlijk van een kaart: LOOK met wat de kaart overschrijft (grade, noise en light per veld)
function lookFor(rules) {
  const own = rules?.look || {};
  return { ...LOOK, ...own, grade: { ...LOOK.grade, ...own.grade }, noise: { ...LOOK.noise, ...own.noise }, light: { ...LOOK.light, ...own.light } };
}
// Kleurfilter als 5x4-matrix (Pixi ColorMatrixFilter): verzadiging, contrast, helderheid, tint
function gradeMatrix({ saturation, brightness, contrast, tint, tintStrength }) {
  const s = 1 + saturation, lum = [0.3086, 0.6094, 0.082], t = rgb(tint).map((v) => 1 - tintStrength + (tintStrength * v) / 255);
  const m = [];
  for (let c = 0; c < 3; c++) {
    const k = contrast * brightness * t[c];
    const row = lum.map((l, i) => ((1 - s) * l + (i === c ? s : 0)) * k);
    m.push(...row, 0, 0.5 * (1 - contrast) * brightness * t[c]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}
const isNeutral = (g) => !g.saturation && g.brightness === 1 && g.contrast === 1 && !g.tintStrength;
// Getal uit een tekst (kaartnaam): dezelfde grondtextuur voor iedereen op die kaart
const seedOf = (str) => [...str].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

// Barsten in een ijsvak: per vak vaste grillige lijnen (in cellen), per stadium twee meer.
// Elke barst loopt vanuit een punt bij het midden twee kanten op, met een knik per stuk en
// soms een zijtakje. Zelfde vak = zelfde barsten, bij iedereen.
const crackCache = new Map();
function crackLines(b) {
  let cracks = crackCache.get(b);
  if (cracks) return cracks;
  const rnd = G.mulberry32((b * 2654435761) >>> 0), B = G.ICE_B;
  const cx = (b % G.ICE_BW) * B + B / 2, cy = ((b / G.ICE_BW) | 0) * B + B / 2;
  cracks = [];
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, len = B * (0.3 + rnd() * 0.25);
    const x0 = cx + (rnd() - 0.5) * B * 0.4, y0 = cy + (rnd() - 0.5) * B * 0.4;
    const crack = [];
    for (const side of [1, -1]) { // twee armen vanuit het beginpunt
      let x = x0, y = y0, ang = side > 0 ? a : a + Math.PI;
      const arm = [[x, y]];
      for (let s = 0; s < 4; s++) {
        ang += (rnd() - 0.5) * 0.9;
        x += Math.cos(ang) * len / 4; y += Math.sin(ang) * len / 4;
        arm.push([x, y]);
        if (rnd() < 0.3) { // zijtakje
          const ta = ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), tl = len * (0.12 + rnd() * 0.15);
          crack.push({ twig: true, from: arm.length - 1, side, pts: [[x, y], [x + Math.cos(ta) * tl, y + Math.sin(ta) * tl]] });
        }
      }
      crack.push({ side, pts: arm });
    }
    cracks.push(crack);
  }
  crackCache.set(b, cracks);
  return cracks;
}
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const CRACK_MS = 450; // zo lang groeit een nieuwe barst

export function startWorld(style) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  // Lagen van onder naar boven: grond, markeringen, schaduwen, objecten, tanks, kruinen (bomen
  // die over de tanks hangen), effecten, mist. De wereld staat in cellen (de camera schaalt en
  // schuift hem); de UI-laag staat in schermpixels.
  const stage = new Container(), world = stage.addChild(new Container());
  const L = {};
  for (const name of ['ground', 'marks', 'shadows', 'objects', 'tanks', 'canopy', 'effects', 'fog']) L[name] = world.addChild(new Container());
  L.ui = stage.addChild(new Container());
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
  let look = lookFor({}), noise2 = null, hasIce = false;
  // Grondtextuur: een paar lagen simplex-ruis (fbm), -1..1
  function groundNoise(X, Y) {
    const n = look.noise;
    let v = 0, amp = 1, sum = 0, f = 1 / (R * n.scale);
    for (let o = 0; o < n.octaves; o++) { v += amp * noise2(X * f, Y * f); sum += amp; amp *= 0.5; f *= 2; }
    return v / sum;
  }
  // Terreinkleur op pixel (X, Y): de klassekleuren van de vier dichtstbijzijnde cellen, gemengd
  // op een met ruis verschoven plek. Zo lopen grenzen golvend en zacht in elkaar over in
  // plaats van in blokjes per cel.
  const clsColor = (x, y) => pal.cls[game.terrain[Math.min(G.H - 1, Math.max(0, y)) * G.W + Math.min(G.W - 1, Math.max(0, x))]];
  function groundColor(X, Y) {
    const b = look.blend; // breedte van de overgang in cellen
    const wx = X / R - 0.5 + (vnoise(X / 13, Y / 13) - 0.5) * b, wy = Y / R - 0.5 + (vnoise(X / 13 + 71, Y / 13 + 29) - 0.5) * b;
    const x0 = Math.floor(wx), y0 = Math.floor(wy), fx = smoothstep(wx - x0), fy = smoothstep(wy - y0);
    const a = clsColor(x0, y0), q = clsColor(x0 + 1, y0), c = clsColor(x0, y0 + 1), d = clsColor(x0 + 1, y0 + 1);
    const mixc = (k) => (a[k] * (1 - fx) + q[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy;
    const r = mixc(0), g = mixc(1), b2 = mixc(2);
    // vlekken licht en donker, vooral op donkere grond (veen, aarde); sneeuw blijft rustig
    const dark = Math.min(1, Math.max(0.1, 1.15 - (0.3 * r + 0.59 * g + 0.11 * b2) / 255));
    const n = look.noise.strength ? 1 + look.noise.strength * dark * groundNoise(X, Y) : 1;
    return pack(r * n, g * n, b2 * n);
  }
  // IJs: diepe, donkere plekken die vloeiend overgaan in licht ijs, met lange stroomstrepen
  // (de rivier loopt van west naar oost) en wat korrel. Barsten en glinstering staan los
  // daarboven (drawIce), zodat ze kunnen bewegen.
  const ICE_SLOT = 9; // cache-vak (stijlen 0..7, terrein 8)
  const DEEP = [34, 58, 82]; // kleur van diep, donker ijs
  function iceColor(X, Y) {
    const ice = pal.cls[ICE_CLS], f = 1 / (R * 18);
    const deep = 0.5 + 0.5 * (noise2(X * f, Y * f) * 0.7 + noise2(X * f * 2.3 + 40, Y * f * 2.3) * 0.3); // 0..1
    const k = Math.pow(1 - deep, 1.6) * 0.62; // hoeveel donker ijs
    const flow = noise2(X / (R * 40), Y / (R * 2.2)) * 0.035; // lange strepen langs de stroom
    const grain = (((hash(X, Y) & 1023) / 1023) - 0.5) * 0.025;
    const light = 1 + flow + grain + (1 - k) * 0.04;
    return pack(...ice.map((v, i) => (v * (1 - k) + DEEP[i] * k) * light));
  }
  function paintIce() {
    p.cached(ICE_SLOT, iceColor);
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
  let objects = null; // tegelcanvassen (createTileCanvases), alleen als de stijl objecten heeft
  function makeObjects() {
    objects = style.objects ? createTileCanvases(R) : null;
  }
  function buildObjects(box) {
    if (!objects) return;
    const [x0, y0, x1, y1] = box ? [box[0] - OBJ_PAD, box[1] - OBJ_PAD, box[2] + OBJ_PAD + 1, box[3] + OBJ_PAD + 1] : [0, 0, G.W, G.H];
    for (let ty = Math.max(0, Math.floor(y0 / TILE)); ty <= Math.min(objects.TILES_Y - 1, Math.floor((y1 - 1) / TILE)); ty++) {
      for (let tx = Math.max(0, Math.floor(x0 / TILE)); tx <= Math.min(objects.TILES_X - 1, Math.floor((x1 - 1) / TILE)); tx++) {
        // het stuk van de rechthoek in deze tegel, in cellen
        const cx0 = Math.max(x0, tx * TILE), cy0 = Math.max(y0, ty * TILE);
        const cx1 = Math.min(x1, (tx + 1) * TILE), cy1 = Math.min(y1, (ty + 1) * TILE);
        const t = ty * objects.TILES_X + tx, g = objects.get(t).getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.save();
        g.translate(-tx * TILE * R, -ty * TILE * R);
        g.beginPath(); g.rect(cx0 * R, cy0 * R, (cx1 - cx0) * R, (cy1 - cy0) * R); g.clip();
        g.clearRect(cx0 * R, cy0 * R, (cx1 - cx0) * R, (cy1 - cy0) * R);
        g.scale(R, R);
        style.objects.draw(g, cx0 - OBJ_PAD, cy0 - OBJ_PAD, cx1 + OBJ_PAD, cy1 + OBJ_PAD);
        g.restore();
        objects.touch(t);
      }
    }
  }

  // ---------- Effecten ----------
  const particles = createParticles(style.clouds || { smoke: '64, 60, 56' }, style.cloudAlpha || {});
  const ICE_BITS = ['#e8f2fa', '#c6dcea', '#9ebdd2', '#ffffff'];
  const crackGrow = new Map(); // ijsvak -> {from: vorig stadium, t0}: barsten die nog groeien
  // Mondingsvuur: een felle steekvlam voor de loop, vonken en een rookwolkje dat meedrijft
  function muzzle(e) {
    const [dx, dy] = G.DIRS[e.d], n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, dir = Math.atan2(dy, dx);
    const x = e.x - ux * 1.2, y = e.y - uy * 1.2;
    particles.spawn('flash', x, y, 1, { life: 0.09, r0: 2.2, r1: 1 });
    particles.spawn('flash', x + ux * 1.4, y + uy * 1.4, 1, { life: 0.07, r0: 1.4, r1: 0.6 });
    particles.spawn('spark', x, y, 6, { speed: 26, life: 0.18, dir, spread: 0.6, cols: ['#ffd27a', '#ffb347', '#fff0c0'] });
    const cloud = style.clouds?.smoke ? 'smoke' : Object.keys(style.clouds || {})[0];
    if (cloud) particles.spawn(cloud, x + ux, y + uy, 3, { speed: 4, life: 1.1, dir, spread: 0.9, r0: 0.6, r1: 2.6 });
  }
  let shake = 0;
  function onEvent(e) {
    if (e.t === 'x' && e.fell) { // plant of gebouw weg: alleen daar de randen en objecten opnieuw
      plantFelled(fields, game.map, painter, e.box);
      buildObjects(e.box);
    }
    if (e.t === 'x' && e.building && (style.clouds || { smoke: 1 }).smoke) { // stof en brokken van een gebouw
      particles.spawn('smoke', e.x, e.y, e.fell ? 14 : 3, { speed: e.fell ? 5 : 2, life: e.fell ? 2.4 : 1.2, r0: 1, r1: e.fell ? 7 : 3 });
    }
    if (e.t === 'c') { // ijsvak heeft een passage meer: nieuwe barsten groeien, ijs splintert
      const from = G.iceStage(e.n - 1), to = G.iceStage(e.n);
      if (to > from) crackGrow.set(e.b, { from, t0: performance.now() });
      const t = game.tanks.get(e.i);
      if (t && (e.i === game.me || t.seen === 'sharp')) particles.spawn('chunk', t.x, t.y, to > from ? 8 : 3, { speed: 8, life: 0.5, cols: ICE_BITS });
    }
    if (e.t === 'w' && e.box) { // ijs gebroken: waterrand bijwerken, schotsen en spatwater
      const [x0, y0, x1, y1] = e.box;
      blurField(game.map, (c) => c === G.WATER, fields.water, [x0 - 1, y0 - 1, x1 + 1, y1 + 1]);
      painter.markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
      crackGrow.delete(e.b);
      const cx = (e.b % G.ICE_BW) * G.ICE_B + G.ICE_B / 2, cy = ((e.b / G.ICE_BW) | 0) * G.ICE_B + G.ICE_B / 2;
      particles.spawn('chunk', cx, cy, 30, { speed: 14, life: 0.9, cols: ICE_BITS });
      particles.spawn('ring', cx, cy, 1, { life: 0.6, r0: 1, r1: 7 });
      if (style.clouds?.puff) particles.spawn('puff', cx, cy, 6, { speed: 4, life: 1.2, r0: 1, r1: 4 });
      shake = Math.max(shake, 0.3);
    }
    if (e.t === 'b') { // schot: mondingsvuur en rook, alleen als je de schutter ziet
      const t = game.tanks.get(e.i);
      if (t && (e.i === game.me || t.seen === 'sharp')) muzzle(e);
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
    clearTankTextures();
    }
    pal = makePalette(game.rules);
    applyLook(lookFor(game.rules));
    view.colors = pal.hex;
    painter = createMapPainter({ R, paintCell, afterTile: style.afterTile, skipRepaint: style.skipRepaint });
    makeMini();
    miniMe = -1;
    makeObjects();
    crackCache.clear();
    crackGrow.clear();
    hasIce = game.terrain.includes(ICE_CLS);
    rockField = blurField(map, (c) => c === G.ROCK);
    fields = obstacleFields(map);
    bases = findBases(map);
    style.onMap?.(map);
    for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) paintMini(x, y);
    buildObjects();
    groundTiles.use(painter.layer);
    objTiles.use(objects);
    buildBases();
    clearTankTextures();
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
    painter.layer.drawRegion(g, sx, sy, N, N, 0, 0, sw.width, sw.height);
    objects?.drawRegion(g, sx, sy, N, N, 0, 0, sw.width, sw.height);
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

  // ---------- Tekenen (PixiJS) ----------
  // De lagen staan bovenaan (L). Hier de onderdelen per laag; drawWorld zet ze elk frame klaar
  // vanuit de gamestate, daarna tekent Pixi alles in één keer.
  const groundTiles = createTileSprites(L.ground, R, TILE);
  const objectsUnder = L.objects.addChild(new Container()), baseLayer = L.objects.addChild(new Container());
  const objTiles = createTileSprites(style.objects?.over ? L.canopy : objectsUnder, R, TILE, L.shadows.addChild(new Container()));
  const marks = L.marks.addChild(new Graphics());
  const crackG = L.marks.addChild(new Graphics());
  const sparkles = spritePool(L.marks.addChild(new Container()), TEX.sparkle, (s) => { s.anchor.set(0.5); s.blendMode = 'add'; });
  const tankShadows = L.shadows.addChild(new Container()), baseShadows = L.shadows.addChild(new Container());
  const bulletLayer = L.tanks.addChild(new Container()), tankLayer = L.tanks.addChild(new Container());
  const ghosts = spritePool(L.tanks.addChild(new Container()), TEX.soft);
  const buried = L.tanks.addChild(new Graphics());
  const effects = L.effects.addChild(new Graphics());
  L.effects.addChild(particles.layer);
  const smokes = spritePool(L.effects.addChild(new Container()), TEX.soft);
  const sightSprite = L.fog.addChild(new Sprite());
  const visionCanvas = document.createElement('canvas');
  visionCanvas.width = visionCanvas.height = 512;
  const visionSprite = L.fog.addChild(new Sprite(textureOf(visionCanvas)));
  visionSprite.anchor.set(0.5);
  const mirageSprites = spritePool(L.fog.addChild(new Container()), TEX.soft);
  const lights = L.fog.addChild(new Graphics());
  const overlaySprite = L.ui.addChild(new Sprite());
  const eraserG = L.ui.addChild(new Graphics()), eraserLabel = createLabel(L.ui);
  const hintSprites = spritePool(L.ui.addChild(new Container()), TEX.fadeX, (s) => s.anchor.set(0));
  const hintCorners = spritePool(L.ui.addChild(new Container()), TEX.soft);
  const roundLabel = createLabel(L.ui), gaugeG = L.ui.addChild(new Graphics()), gaugeLabel = createLabel(L.ui);
  // Schaduwen: dezelfde vorm in het zwart, iets verschoven (licht van linksboven)
  // Eén lichtbron (look.light) voor tanks, bases, bomen en rotsen; de stijl kiest de kleur
  const SHADOW = { dx: 0, dy: 0, alpha: 0, color: style.shadow?.color ?? 0x000000 };
  const OBJ_SHADOW = 1.4; // bomen en rotsen zijn hoger dan een tank: langere schaduw
  // zachte schaduwranden: de hele schaduwlaag in één keer vervaagd (goedkoper dan per sprite)
  const shadowBlur = new KawaseBlurFilter({ strength: 2, quality: 3 });
  L.shadows.filters = [shadowBlur];
  const gradeFilter = new ColorMatrixFilter();
  // Hittewaas (weer heatHaze): het beeld trilt licht via een verschuivingskaart van ruis die
  // langzaam meedrijft. Alleen aan als het weer het zegt; anders kost hij niets.
  const hazeTex = drawnTexture(256, 256, (g) => {
    const n = createNoise2D(G.mulberry32(7)), img = g.createImageData(256, 256);
    // naadloos: de ruis krijgt alleen sinussen en cosinussen van x en y, dus de randen sluiten aan
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const a = (x / 256) * Math.PI * 2, b = (y / 256) * Math.PI * 2, i = (y * 256 + x) * 4;
        img.data[i] = 128 + 127 * n(Math.cos(a) * 1.5 + Math.sin(b), Math.sin(a) * 1.5 + 7);
        img.data[i + 1] = 128 + 127 * n(Math.cos(b) * 1.5 + 13, Math.sin(b) * 1.5 + Math.cos(a));
        img.data[i + 2] = 128; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  hazeTex.source.style.addressMode = 'repeat';
  const hazeSprite = stage.addChild(new Sprite(hazeTex));
  hazeSprite.renderable = false;
  const hazeFilter = new DisplacementFilter({ sprite: hazeSprite, scale: 0 });
  let filterKey = '';
  // Filters op de wereld: kleurfilter (look.grade) en hittewaas (weer), alleen als ze iets doen
  function updateFilters(now) {
    const haze = !!game.weather?.flags.heatHaze && look.haze > 0;
    const key = `${isNeutral(look.grade)},${haze}`;
    if (key !== filterKey) {
      filterKey = key;
      world.filters = [...(isNeutral(look.grade) ? [] : [gradeFilter]), ...(haze ? [hazeFilter] : [])];
    }
    if (haze) {
      const s = devicePixelRatio || 1;
      hazeFilter.scale.set(look.haze * s, look.haze * s * 0.6);
      hazeSprite.scale.set(3 * s);
      hazeSprite.position.set((now * 0.012 * s) % (256 * 3 * s), (now * 0.03 * s) % (256 * 3 * s)); // drijft omhoog en opzij
    }
  }
  const vignette = L.ui.addChild(new Sprite(drawnTexture(256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  })));
  L.ui.setChildIndex(vignette, 0); // onder de hints en labels
  function applyLook(next) {
    look = next;
    noise2 = createNoise2D(G.mulberry32(seedOf(game.mapId || '')));
    Object.assign(SHADOW, { dx: look.light.dx, dy: look.light.dy, alpha: look.light.alpha });
    objTiles.shadow(SHADOW.dx * OBJ_SHADOW, SHADOW.dy * OBJ_SHADOW, SHADOW.color, SHADOW.alpha);
    for (const s of tankSprites.values()) s.shadow.alpha = SHADOW.alpha;
    gradeFilter.matrix = gradeMatrix(look.grade);
    filterKey = '';
    vignette.alpha = look.vignette;
    shadowBlur.strength = look.light.blur * (devicePixelRatio || 1);
    visionKey = '';
  }

  // Tanks: per ploeg één keer getekend (neus naar rechts) als texture, daarna alleen gedraaid.
  // Een stijl met een bewegend onderdeel (wimpel) heeft tankFrames plaatjes over tankPeriod ms.
  const TANK_PX = 16, TANK_CELLS = 14;
  const tankTex = new Map(); // `${ploeg}|${plaatje}` -> texture
  function tankTexture(id, now) {
    const frames = style.tankFrames || 1, period = style.tankPeriod || 1000;
    const f = frames > 1 ? Math.floor((now / period) * frames) % frames : 0, key = `${id}|${f}`;
    let tex = tankTex.get(key);
    if (!tex) {
      tex = drawnTexture(TANK_CELLS * TANK_PX, TANK_CELLS * TANK_PX, (g) => {
        g.scale(TANK_PX, TANK_PX);
        style.drawTank(g, style.teams[id], TANK_CELLS / 2, TANK_CELLS / 2, 0, (f / frames) * period);
      });
      tankTex.set(key, tex);
    }
    return tex;
  }
  function clearTankTextures() {
    for (const t of tankTex.values()) t.destroy(true);
    tankTex.clear();
  }
  const tankSprites = new Map(); // id -> {body, shadow}
  function tankSprite(id) {
    let s = tankSprites.get(id);
    if (!s) {
      s = { body: tankLayer.addChild(new Sprite()), shadow: tankShadows.addChild(new Sprite()) };
      for (const k of [s.body, s.shadow]) { k.anchor.set(0.5); k.scale.set(1 / TANK_PX); }
      s.shadow.tint = SHADOW.color; s.shadow.alpha = SHADOW.alpha;
      tankSprites.set(id, s);
    }
    return s;
  }

  // Bases: per kaart één keer getekend (de stijl tekent ze in celmaten), met schaduw
  const BASE_PX = 12, BASE_PAD = 5;
  function buildBases() {
    for (const s of baseShadows.removeChildren()) s.destroy();
    for (const s of baseLayer.removeChildren()) s.destroy(true);
    for (const b of bases) {
      if (!b) continue;
      const x0 = b.x0 - BASE_PAD, y0 = b.y0 - BASE_PAD, w = b.x1 - b.x0 + 1 + 2 * BASE_PAD, h = b.y1 - b.y0 + 1 + 2 * BASE_PAD;
      const tex = drawnTexture(w * BASE_PX, h * BASE_PX, (g) => { g.scale(BASE_PX, BASE_PX); g.translate(-x0, -y0); style.drawBase(g, b); });
      const body = baseLayer.addChild(new Sprite(tex)), shadow = baseShadows.addChild(new Sprite(tex));
      body.scale.set(1 / BASE_PX); shadow.scale.set(1 / BASE_PX);
      body.position.set(x0, y0);
      shadow.position.set(x0 + SHADOW.dx * 0.6, y0 + SHADOW.dy * 0.6); // laag: kortere schaduw
      shadow.tint = SHADOW.color; shadow.alpha = SHADOW.alpha * 0.7;
    }
  }
  // de letters op de bases hebben een webfont: opnieuw tekenen zodra dat geladen is
  document.fonts?.ready.then(() => { if (game.map) buildBases(); });

  // Kogel als lichtspoor met een felle kop
  const [tracerTail, tracerHead] = style.tracer || ['rgba(255, 170, 60, 0)', 'rgba(255, 220, 130, 1)'];
  const tracerTex = drawnTexture(64, 4, (g) => {
    const l = g.createLinearGradient(0, 0, 64, 0);
    l.addColorStop(0, tracerTail); l.addColorStop(1, tracerHead);
    g.fillStyle = l; g.fillRect(0, 0, 64, 4);
  });
  const tracers = spritePool(bulletLayer, tracerTex, (s) => s.anchor.set(1, 0.5)), heads = spritePool(bulletLayer, TEX.disc);
  function drawBullets() {
    tracers.begin(); heads.begin();
    for (const b of game.bullets.values()) {
      const [dx, dy] = G.DIRS[b.d], hx = b.rx + 0.5, hy = b.ry + 0.5;
      const t = tracers.next();
      t.position.set(hx, hy); t.rotation = Math.atan2(dy, dx);
      t.scale.set((b.trail * Math.hypot(dx, dy)) / 64, 0.45 / 4);
      const h = heads.next();
      h.tint = 0xfff4cc; h.position.set(hx, hy); h.width = h.height = 0.66;
    }
    tracers.end(); heads.end();
  }

  // Tanks: de eigen altijd, tegenstanders scherp, als schim of helemaal niet (§9)
  function drawTanks(now, cam) {
    const me = eye();
    ghosts.begin();
    buried.clear();
    for (const s of tankSprites.values()) s.body.visible = s.shadow.visible = false;
    for (const [id, t] of game.tanks) {
      if (!t.a || t.rx === undefined || t.ang === undefined) continue;
      const seen = id === game.me || DEBUG ? 'sharp' : me && sightOf(game.map, me, { x: Math.round(t.rx), y: Math.round(t.ry), buried: t.b }, visionRadius(), cam, game.smokes);
      t.seen = seen;
      if (id === game.me && t.b) drawBuried(t);
      else if (seen === 'sharp') {
        const s = tankSprite(id), tex = tankTexture(id, now);
        for (const k of [s.body, s.shadow]) { k.texture = tex; k.rotation = t.ang; k.visible = true; }
        s.body.position.set(t.rx + 0.5, t.ry + 0.5);
        s.shadow.position.set(t.rx + 0.5 + SHADOW.dx, t.ry + 0.5 + SHADOW.dy);
      } else if (seen === 'ghost') drawGhost(ghosts, t.rx + 0.5, t.ry + 0.5);
    }
    ghosts.end();
  }

  function drawWorld(now, dt) {
    updateRenderPositions(game, now + clockOffset); // eigen tank voorspeld, de rest vloeiend uit de buffer
    smoothTankAngles(game, dt);
    if (shake > 0) shake -= dt;
    const self = game.tanks.get(game.me);
    if (self?.s !== undefined) {
      if (lastShield !== null && self.s < lastShield && self.a) shake = Math.max(shake, look.shakeOnHit);
      lastShield = self.s;
    }
    const cam = view.cam = camera(game, canvas, style.viewCells / ZOOM, shake);
    painter.flush(cam);
    world.scale.set(cam.Z);
    world.position.set(-cam.drawX * cam.Z, -cam.drawY * cam.Z);
    groundTiles.sync(cam);
    objTiles.sync(cam);

    marks.clear();
    drawIce(cam, now);
    style.drawUnder?.(marks, cam, now);
    drawLandmarks();
    drawDepots();
    drawObjectsOfHazards(now);
    drawBullets();
    drawTanks(now, cam);

    effects.clear();
    drawBarrage(now);
    drawFires(now);
    drawDust(now);
    particles.update(dt);
    drawSmokes(now);
    drawWeather(cam, now, dt);
    const me = eye(), fogOn = !DEBUG && !!me;
    sightSprite.visible = visionSprite.visible = fogOn;
    mirageSprites.begin();
    if (fogOn) { drawShadows(me, cam); drawFog(me, cam); drawMirages(me, cam, now); }
    mirageSprites.end();
    drawSearchlights(cam);
    drawStyleOverlay(cam, now);
    updateFilters(now);
    vignette.width = canvas.width; vignette.height = canvas.height;
    drawEraser(now);
    drawHints(now);
  }

  // IJs: barsten als lijnen (nieuwe groeien vanuit hun beginpunt) en glinstering die komt en
  // gaat. Alleen voor ijsvakken in beeld; een wak (water) heeft geen barsten meer.
  function drawIce(cam, now) {
    crackG.clear();
    sparkles.begin();
    if (hasIce) {
      const B = G.ICE_B, bx0 = Math.max(0, Math.floor(cam.x / B) - 1), by0 = Math.max(0, Math.floor(cam.y / B) - 1);
      const bx1 = Math.min(G.ICE_BW - 1, Math.ceil((cam.x + cam.w) / B)), by1 = Math.min(G.ICE_BH - 1, Math.ceil((cam.y + cam.h) / B));
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const b = by * G.ICE_BW + bx, st = G.iceStage(game.world.ice[b]);
          if (!st) continue;
          const grow = crackGrow.get(b), p = grow ? easeOut(Math.min(1, (now - grow.t0) / CRACK_MS)) : 1;
          if (grow && p >= 1) crackGrow.delete(b);
          const cracks = crackLines(b);
          for (let k = 0; k < Math.min(st * 2, cracks.length); k++) {
            const part = grow && k >= grow.from * 2 ? p : 1;
            for (const line of cracks[k]) {
              if (line.twig && part < 0.8) continue; // zijtakjes pas als de barst bijna uit is
              const pts = line.pts, n = line.twig ? 1 : (pts.length - 1) * part;
              if (game.map[Math.round(pts[0][1]) * G.W + Math.round(pts[0][0])] === G.WATER) continue;
              for (const [col, alpha, width, off] of [[0x1a3550, 0.5, 0.14, 0], [0xffffff, 0.45, 0.06, -0.08]]) {
                crackG.moveTo(pts[0][0] + off, pts[0][1] + off);
                for (let i = 1; i <= Math.ceil(n); i++) {
                  const f = Math.min(1, n - (i - 1)), [ax, ay] = pts[i - 1], [qx, qy] = pts[i];
                  crackG.lineTo(ax + (qx - ax) * f + off, ay + (qy - ay) * f + off);
                }
                crackG.stroke({ color: col, alpha, width: line.twig ? width * 0.7 : width, cap: 'round', join: 'round' });
              }
            }
          }
        }
      }
    }
    // glinstering: vaste plekken op het ijs (elke 3 cellen een kans) die af en toe oplichten
    if (look.iceShine) {
      for (let gy = Math.floor(cam.y / 3) * 3; gy < cam.y + cam.h; gy += 3) {
        for (let gx = Math.floor(cam.x / 3) * 3; gx < cam.x + cam.w; gx += 3) {
          const h = hash(gx * 7 + 3, gy * 11 + 5);
          if (h % 5) continue;
          const x = gx + (h >>> 8) % 3, y = gy + (h >>> 12) % 3;
          if (!G.inBounds(x, y) || game.terrain[y * G.W + x] !== ICE_CLS || game.map[y * G.W + x] !== G.DIRT) continue;
          const tw = Math.sin(now / (600 + (h >>> 16) % 900) + (h % 628) / 100);
          if (tw < 0.85) continue;
          const s = sparkles.next(), k = (tw - 0.85) / 0.15;
          s.position.set(x + 0.5, y + 0.5); s.width = s.height = 1.2 + k * 0.8;
          s.alpha = k * look.iceShine; s.rotation = (h % 100) / 100;
        }
      }
    }
    sparkles.end();
  }

  // Weer in beeld (look.weather): sneeuw, stof of regen als deeltjes in de wereld. Ze blijven
  // binnen de camera (wat eruit waait, komt aan de andere kant terug); in een storm meer en harder.
  const flakes = [], flakeSprites = spritePool(L.effects.addChild(new Container()), TEX.soft);
  const rainSprites = spritePool(L.effects.addChild(new Container()), TEX.white);
  const WEATHER = {
    snow: { tint: 0xffffff, fall: [5, 4], wind: 1.5, size: [0.35, 0.55], alpha: [0.55, 0.4] },
    dust: { tint: 0xd8c09a, fall: [0.5, 0.5], wind: 7, size: [0.8, 1.4], alpha: [0.18, 0.15] },
    rain: { tint: 0xdfe8f0, fall: [55, 15], wind: 6, size: [0.1, 0], alpha: [0.25, 0.15] },
  };
  const wrap = (v, lo, len) => lo + ((((v - lo) % len) + len) % len);
  function drawWeather(cam, now, dt) {
    const w = WEATHER[look.weather], storm = eraserInfo(game)?.active ? look.stormFactor : 1;
    flakeSprites.begin(); rainSprites.begin();
    const n = w ? Math.round((look.amount * cam.w * cam.h * storm) / 10000) : 0;
    while (flakes.length < n) flakes.push({ x: cam.x + Math.random() * cam.w, y: cam.y + Math.random() * cam.h, z: Math.random(), ph: Math.random() * 6.3 });
    for (let k = 0; k < n; k++) {
      const f = flakes[k], wind = w.wind * storm * (0.6 + f.z);
      const vx = wind + Math.sin(now / 900 + f.ph) * (look.weather === 'snow' ? 1.2 : 0.4), vy = w.fall[0] + w.fall[1] * f.z;
      f.x = wrap(f.x + vx * dt, cam.x - 2, cam.w + 4);
      f.y = wrap(f.y + vy * dt, cam.y - 2, cam.h + 4);
      const s = look.weather === 'rain' ? rainSprites.next() : flakeSprites.next();
      s.tint = w.tint; s.alpha = w.alpha[0] + w.alpha[1] * f.z;
      s.position.set(f.x, f.y);
      if (look.weather === 'rain') { s.rotation = Math.atan2(vy, vx); s.width = 1.5 + f.z * 1.5; s.height = w.size[0]; }
      else s.width = s.height = w.size[0] + w.size[1] * f.z;
    }
    flakeSprites.end(); rainSprites.end();
  }

  // Een eigen stijllaag over het beeld (witte mist): de stijl geeft een canvas terug dat over
  // het hele speelveld wordt uitgerekt, of niets
  let overlayCanvas = null;
  function drawStyleOverlay(cam, now) {
    const c = style.overlay?.(cam, now);
    overlaySprite.visible = !!c;
    if (!c) return;
    if (c !== overlayCanvas || overlaySprite.texture.width !== c.width || overlaySprite.texture.height !== c.height) {
      if (overlayCanvas) overlaySprite.texture.destroy(true);
      overlayCanvas = c;
      overlaySprite.texture = textureOf(c);
    } else overlaySprite.texture.source.update();
    overlaySprite.width = canvas.width; overlaySprite.height = canvas.height;
  }

  // Sporenwisser (storm): waas en waaiende strepen over het hele beeld zolang hij woedt, en een
  // melding bovenin (waarschuwing vooraf, aftellen tijdens). style.eraser: {name, haze, hazeAlpha, streak, banner}
  function drawEraser(now) {
    eraserG.clear();
    const st = style.eraser, info = st && eraserInfo(game);
    if (!info || (!info.active && !info.warn)) { eraserLabel.hide(); return; }
    const W = canvas.width, H = canvas.height, s = devicePixelRatio || 1;
    if (info.active) {
      eraserG.rect(0, 0, W, H).fill({ color: tintOf(st.haze), alpha: st.hazeAlpha });
      for (let i = 0; i < 140; i++) {
        const speed = 0.35 + (i % 7) * 0.08, len = (18 + (i % 5) * 14) * s;
        const x = ((i * 137.3 + now * speed * s) % (W + 200 * s)) - 100 * s;
        const y = ((i * 71.9) % 100) / 100 * H + Math.sin(now / 900 + i) * 12 * s;
        eraserG.moveTo(x, y).lineTo(x + len, y + len * 0.18).stroke({ color: tintOf(st.streak), alpha: 0.45, width: (1 + (i % 3)) * s, cap: 'round' });
      }
    }
    const blink = !info.active && Math.floor(now / 400) % 2; // knipperen tijdens de waarschuwing
    if (st.banner === false || blink) { eraserLabel.hide(); return; }
    const name = st.name || info.label.toUpperCase();
    const txt = info.active ? `${name} — NOG ${info.secs} S` : `${name} OVER ${info.secs} S`;
    eraserLabel.set(txt, { size: 14 * s, pad: 10 * s, h: 26 * s, color: info.active ? 0xffd27a : 0xff8a5a, bg: 0x140e0a, alpha: 0.78 });
    eraserLabel.at((W - eraserLabel.width) / 2, 12 * s);
  }

  // ---------- Zicht (§9) ----------
  // ?debug=alles: alles zichtbaar (alleen op deze computer, voor het ontwikkelen)
  const DEBUG_HOST = ['localhost', '127.0.0.1'].includes(location.hostname);
  const debugParam = (k) => [location.search, window.parent !== window ? window.parent.location.search : ''].map((q) => new URLSearchParams(q).get(k)).find((v) => v);
  const DEBUG = DEBUG_HOST && debugParam('debug') === 'alles';
  // ?zoom=3: dichter op de tank (alleen op deze computer, om details te bekijken)
  const ZOOM = (DEBUG_HOST && Number(debugParam('zoom'))) || 1;
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
  function drawGhost(pool, x, y) {
    const s = pool.next();
    s.tint = 0x0c0c0e; s.alpha = FOG.ghostAlpha;
    s.position.set(x, y); s.width = s.height = 9;
  }
  // Eigen bedekte tank: een hoopje sneeuw of zand met een vage omtrek
  const burial = rgba(style.burialColor || 'rgba(236, 232, 220, 0.9)');
  function drawBuried(t) {
    const x = t.rx + 0.5, y = t.ry + 0.5;
    buried.ellipse(x, y, 4, 3.2).fill(burial);
    buried.save(); buried.translateTransform(x, y); buried.rotateTransform(t.ang || 0);
    buried.ellipse(0, 0, 3.4, 2.4).stroke({ color: 0x282828, alpha: 0.35, width: 0.25 });
    buried.restore();
  }
  // Buiten de zichtstraal steeds vager en donkerder naar de rand van het venster. Het verloop
  // staat op een canvas dat alleen opnieuw getekend wordt als de verhouding verandert.
  let visionKey = '';
  function drawFog(me, cam) {
    const r = visionRadius(), far = Math.max(r + 1, Math.hypot(cam.w, cam.h) / 2 + Math.hypot(me.x + 0.5 - (cam.x + cam.w / 2), me.y + 0.5 - (cam.y + cam.h / 2)));
    const fade = game.weather?.flags.night ? 0.92 : FOG.fade; // 's nachts veel donkerder
    const ratio = Math.round((r / far) * 400) / 400, key = `${ratio},${fade},${look.fogSoft}`;
    if (key !== visionKey) {
      visionKey = key;
      const g = visionCanvas.getContext('2d'), c = visionCanvas.width / 2;
      const grad = g.createRadialGradient(c, c, c * ratio * (1 - look.fogSoft), c, c, c); // zachte rand
      grad.addColorStop(0, 'rgba(8, 8, 10, 0)');
      grad.addColorStop(0.55, `rgba(8, 8, 10, ${fade * 0.6})`);
      grad.addColorStop(1, `rgba(8, 8, 10, ${fade})`);
      g.clearRect(0, 0, 2 * c, 2 * c);
      g.fillStyle = grad; g.fillRect(0, 0, 2 * c, 2 * c);
      visionSprite.texture.source.update();
    }
    visionSprite.position.set(me.x + 0.5, me.y + 0.5);
    visionSprite.width = visionSprite.height = 2 * far;
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
      const resized = shadowCanvas.width !== gw || shadowCanvas.height !== gh;
      if (resized) { shadowCanvas.width = gw; shadowCanvas.height = gh; }
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
      if (resized || !sightSprite.texture.source.resource) {
        if (sightSprite.texture.source.resource) sightSprite.texture.destroy(true);
        sightSprite.texture = textureOf(shadowCanvas);
      } else sightSprite.texture.source.update();
      sightSprite.position.set(x0 - SH / 2, y0 - SH / 2);
      sightSprite.width = gw * SH; sightSprite.height = gh * SH;
    }
  }
  // Rook: blokkeert het zicht zolang hij hangt (game.smokes, van de server)
  function drawSmokes(now) {
    smokes.begin();
    for (const s of game.smokes) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + now / 3000, x = s.x + Math.cos(a) * s.r * 0.4, y = s.y + Math.sin(a * 1.3) * s.r * 0.35;
        const p = smokes.next();
        p.tint = 0x464440; p.alpha = 0.55;
        p.position.set(x, y); p.width = p.height = s.r * 1.5;
      }
    }
    smokes.end();
  }

  // ---------- Richtingshints (§8): gloed aan de rand in één van 8 richtingen ----------
  const hints = [];
  function addHint(x, y) {
    const me = eye();
    if (!me) return;
    hints.push({ dir: hintDirection(x - me.x, y - me.y), t0: performance.now() });
  }
  // zijde: [positie, draaiing, lengte] van het verloop (vol aan de rand, naar binnen weg)
  const HINT_SIDES = (W, H) => [[W, 0, Math.PI / 2, W], [W, H, Math.PI, H], [0, H, -Math.PI / 2, W], [0, 0, 0, H]];
  function drawHints(now) {
    const W = canvas.width, H = canvas.height, d = Math.min(W, H) * 0.16;
    hintSprites.begin(); hintCorners.begin();
    for (let k = hints.length - 1; k >= 0; k--) {
      const age = (now - hints[k].t0) / 1000;
      if (age > HINTS.glowSeconds) { hints.splice(k, 1); continue; }
      const alpha = 0.75 * (age < 0.25 ? age / 0.25 : 1 - (age - 0.25) / (HINTS.glowSeconds - 0.25)); // oplichten en doven
      const dir = hints[k].dir;
      if (dir % 2 === 0) { // een zijde
        const [x, y, rot, len] = HINT_SIDES(W, H)[dir / 2], s = hintSprites.next();
        s.position.set(x, y); s.rotation = rot; s.scale.set(d / 64, len / 4);
        s.tint = 0xff4628; s.alpha = alpha;
      } else { // een hoek
        const [cx, cy] = [[W, 0], [W, H], [0, H], [0, 0]][(dir - 1) / 2], s = hintCorners.next();
        s.position.set(cx, cy); s.width = s.height = d * 4.4;
        s.tint = 0xff4628; s.alpha = alpha;
      }
    }
    hintSprites.end(); hintCorners.end();
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

  // ---------- Renderer en beeldlus ----------
  // Pixi tekent op het canvas #game, in schermpixels (devicePixelRatio zit in de maat zelf).
  let renderer = null, lastFrame = performance.now(), lastShield = null;
  const panel = $('panel');
  const panelSize = () => [Math.max(1, Math.round(panel.clientWidth * (devicePixelRatio || 1))), Math.max(1, Math.round(panel.clientHeight * (devicePixelRatio || 1)))];
  autoDetectRenderer({ canvas, preference: 'webgl', width: panelSize()[0], height: panelSize()[1], resolution: 1, antialias: true, background: style.background })
    .then((r) => {
      renderer = r;
      new ResizeObserver(() => renderer.resize(...panelSize())).observe(panel);
      requestAnimationFrame(frame);
    });

  // ?fps=1 (alleen localhost): beelden per seconde en rekentijd per beeld linksboven
  const FPS = DEBUG_HOST && debugParam('fps'), fpsLabel = FPS ? createLabel(L.ui) : null;
  const fpsStat = { frames: 0, cpu: 0, worst: 0, t0: performance.now(), text: '' };
  function countFrame(now, cpu) {
    fpsStat.frames++; fpsStat.cpu += cpu; fpsStat.worst = Math.max(fpsStat.worst, cpu);
    if (now - fpsStat.t0 >= 1000) {
      const fps = (fpsStat.frames * 1000) / (now - fpsStat.t0);
      fpsStat.text = `${fps.toFixed(0)} FPS · ${(fpsStat.cpu / fpsStat.frames).toFixed(1)} ms (max ${fpsStat.worst.toFixed(1)})`;
      Object.assign(fpsStat, { frames: 0, cpu: 0, worst: 0, t0: now });
      view.fps = fpsStat.text;
    }
    const s = devicePixelRatio || 1;
    fpsLabel.set(fpsStat.text || '…', { size: 12 * s, pad: 8 * s, h: 22 * s });
    fpsLabel.at(8 * s, 8 * s);
  }

  // Meten zonder zichtbaar venster (alleen localhost, blitzView.bench() in de console van de
  // weergave): n beelden direct na elkaar tekenen en telkens wachten tot de videokaart klaar is
  function bench(n = 120) {
    const gl = renderer.gl, px = new Uint8Array(4), times = [];
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      frame(t0, true);
      gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / n;
    return { avg: +avg.toFixed(2), p95: +times[Math.floor(n * 0.95)].toFixed(2), max: +times[n - 1].toFixed(2), tiles: painter?.layer.list.filter(Boolean).length };
  }

  function frame(now, once = false) {
    if (!once) requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    world.visible = L.ui.visible = !!game.map;
    if (game.map) { drawWorld(now, dt); drawRoundLabel(); drawGauge(); drawMinimap(); }
    style.hud?.(now);
    if (game.status === 'playing') gameOverlay();
    renderer.render(stage);
    if (FPS) countFrame(now, performance.now() - t0);
  }

  // Brandstofdepot: een stapel jerrycans; leeg = grijs en omgevallen
  function drawDepots() {
    for (const [x, y, full] of game.depots) {
      for (let k = 0; k < 4; k++) {
        const cx = x - 1.6 + (k % 2) * 1.9, cy = y - 1.4 + Math.floor(k / 2) * 2.1;
        marks.save(); marks.translateTransform(cx, cy);
        if (!full) marks.rotateTransform(0.6 * (k - 1.5));
        marks.rect(-0.8, -1, 1.6, 2).fill(full ? 0x4e6b2a : 0x6a6a64);
        marks.rect(-0.3, -1.3, 0.6, 0.35).fill(full ? 0xc9b26a : 0x9a9a92);
        marks.restore();
      }
    }
  }
  // Aangekondigde barrage: het vak flitst (artillerie) en de boomtoppen trillen (bos, §10.8)
  function drawBarrage(now) {
    const b = game.barrage;
    if (!b) return;
    const [x0, y0, x1, y1] = b.box, p = 0.5 + 0.5 * Math.sin(now / 70);
    if (b.kind === 'art') { // §10.9: het vak licht op
      effects.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xfff0b4, alpha: 0.12 + 0.18 * p });
      return;
    }
    effects.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xff7828, alpha: 0.08 + 0.12 * p });
    // gestippelde rand: streepjes van 1,5 met gaten van 1
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) {
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let t = 0; t < len; t += 2.5) effects.moveTo(ax + ux * t, ay + uy * t).lineTo(ax + ux * Math.min(len, t + 1.5), ay + uy * Math.min(len, t + 1.5));
    }
    effects.stroke({ color: 0xff5a1e, alpha: 0.5 + 0.4 * p, width: 0.5 });
    for (let k = 0; k < 10; k++) { // trillende boomtoppen
      const x = x0 + ((k * 7.3) % (x1 - x0)), y = y0 + ((k * 4.1) % (y1 - y0));
      if (at(Math.round(x), Math.round(y)) !== G.VEG) continue;
      effects.circle(x + Math.sin(now / 40 + k) * 0.6, y, 1.4).fill({ color: 0x1e321e, alpha: 0.5 });
    }
  }

  // Gevaren en schaarse middelen die als ding op de kaart staan
  function drawObjectsOfHazards() {
    if (game.ammoDepot) { // munitiekisten (Grebbeberg)
      const [x, y] = game.ammoDepot;
      for (let k = 0; k < 3; k++) {
        marks.rect(x - 3 + k * 2.2, y - 1, 1.8, 1.4).fill(0x6a5a2a);
        marks.rect(x - 3 + k * 2.2, y - 1, 1.8, 0.35).fill(0xc9a43a);
      }
    }
    for (const c of game.crates) { // krat aan een parachute (Market Garden)
      if (!c) continue;
      const [x, y, kind, full] = c;
      if (full) {
        marks.arc(x, y - 2.5, 2.2, Math.PI, 0).stroke({ color: 0xf0f0e6, alpha: 0.8, width: 0.2 });
        marks.moveTo(x - 2.2, y - 2.5).lineTo(x, y).lineTo(x + 2.2, y - 2.5).stroke({ color: 0xf0f0e6, alpha: 0.8, width: 0.2 });
      }
      marks.rect(x - 1.2, y - 1, 2.4, 2).fill(full ? (kind === 'fuel' ? 0x4e6b2a : 0x8a6a2a) : 0x6a6a64);
    }
    for (const g of game.guns) { // antitankgeschut (Carentan), zichtbaar na het eerste schot
      const col = g.hp > 0 ? 0x4a4a3a : 0x2a2a26;
      marks.save(); marks.translateTransform(g.x, g.y); marks.rotateTransform(g.ang);
      marks.rect(-1.5, -1.2, 3, 2.4).fill(col);
      marks.rect(0, -0.25, g.hp > 0 ? 4 : 2, 0.5).fill(col);
      marks.restore();
    }
    const br = game.bridge;
    if (br?.blown) { // wrak van de brug
      const [x0, y0, x1, y1] = br.box;
      for (let k = 0; k < 6; k++) marks.rect(x0 + ((x1 - x0) * k) / 6, (y0 + y1) / 2 - 1 + ((k % 2) * 2 - 1), (x1 - x0) / 8, 1.2).fill({ color: 0x3c3228, alpha: 0.8 });
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
        effects.circle(fx, fy, 0.8 + 0.5 * f).fill({ color: (255 << 16) | (Math.round(120 + 80 * f) << 8) | 40, alpha: 0.85 });
      }
    }
  }
  // Stofwolk achter tanks die over harde grond rijden (Barbarossa, zomer)
  function drawDust() {
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
  function drawSearchlights() {
    lights.clear();
    const cfg = game.weather?.flags.searchlights;
    if (!cfg) return;
    const half = (cfg.widthT * G.T) / 2;
    for (const b of searchlightBeams(cfg, game.tick - game.mapTick)) {
      const Lb = G.W * 1.3, c = Math.cos(b.ang), s = Math.sin(b.ang);
      lights.poly([
        b.x0 - s * half, b.y0 + c * half,
        b.x0 + c * Lb - s * half * 1.6, b.y0 + s * Lb + c * half * 1.6,
        b.x0 + c * Lb + s * half * 1.6, b.y0 + s * Lb - c * half * 1.6,
        b.x0 + s * half, b.y0 - c * half,
      ]).fill({ color: 0xfffad2, alpha: 0.16 });
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
      drawGhost(mirageSprites, mirages[k].x, mirages[k].y);
    }
  }

  // Herkenningspunt van een dorp: een kruis op het dak van de kerk (zolang die nog staat)
  function drawLandmarks() {
    for (const l of game.landmarks) {
      if (at(Math.round(l.x), Math.round(l.y)) !== G.BUILDING) continue;
      marks.rect(l.x - 0.6, l.y - 3.5, 1.2, 7).rect(l.x - 2.2, l.y - 1.8, 4.4, 1.2).fill({ color: 0x28241e, alpha: 0.85 });
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
    gaugeG.clear();
    const m = game.rules.meter, self = game.tanks.get(game.me);
    if (!m || !self) { gaugeLabel.hide(); return; }
    const s = devicePixelRatio || 1, x = 8 * s, y = canvas.height - 58 * s, w = 180 * s, h = 22 * s, v = (self.g ?? 0) / 100;
    const warn = m.danger !== undefined && (m.low ? self.g <= m.danger : self.g >= m.danger);
    gaugeG.rect(x, y, w, h).fill({ color: 0x100c08, alpha: 0.7 });
    gaugeG.rect(x + 4 * s, y + 4 * s, (w - 8 * s) * v, h - 8 * s).fill(warn ? 0xe0533a : m.color || 0xe0b040);
    gaugeLabel.set(`${m.label.toUpperCase()} ${self.g ?? 0}`, { size: 11 * s, pad: 8 * s, h });
    gaugeLabel.at(x, y);
  }

  // Rondenummer en hoe je wint, linksonder in beeld
  function drawRoundLabel() {
    const goal = G.scoreMode(game.tanks.size) === 'rounds' ? `${G.GAME.roundsToWin} RONDES WINT` : `${G.GAME.killsToWin} KILLS WINT`;
    const s = devicePixelRatio || 1;
    roundLabel.set(`RONDE ${game.game.round} · ${goal}`, { size: 12 * s, pad: 8 * s, h: 22 * s });
    roundLabel.at(8 * s, canvas.height - 30 * s);
  }

  // Wat een stijl nodig heeft voor zijn zijbalk en effecten
  const view = {
    game, canvas,
    cam: { x: 0, y: 0, w: 0, h: 0, Z: 1, drawX: 0, drawY: 0 },
    at,
    get bases() { return bases; },
    colors: pal.hex, // kaartkleuren als #rrggbb (rock, veg, water, tunnel, classes[naam])
    shake(s) { shake = Math.max(shake, s); },
    drawMinimap,
    eraserInfo: () => eraserInfo(game),
    bench: (n) => (DEBUG_HOST && renderer ? bench(n) : null),
  };
  // ingebed: de kaart kan er al zijn voordat deze weergave geladen was. Pas na deze functie,
  // want de stijl heeft zijn view dan nog niet (const view = startWorld(...)).
  if (shell && game.map) queueMicrotask(() => { loadMap(game.map); hooks.onStatus(game.status); });
  if (DEBUG_HOST) window.blitzView = view; // voor bench() in de console
  return view;
}
