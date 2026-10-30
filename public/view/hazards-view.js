// Gevaren en schaarse middelen als ding op de kaart (§10): laadplekken, depots, barrage, kratten,
// geschut, de opgeblazen brug, brand, stof, zoeklichten, luchtspiegelingen en herkenningspunten.
// v = { game, at(x, y), Pixi-lagen en pools uit world-view.js, drawContour, visionRadius, pal,
// bridgeSprites (true: de bruggen zijn sprites, ook het wrak), texture(naam) (sprite uit de atlas
// van de stijl, of null), props (container voor die sprites), seesSharp(x, y) }.
// Depots, het munitiedepot, kratten en parachutes zijn sprites als de atlas ze heeft (PROPS),
// anders getekend.
import * as G from '/shared/game.js';
import { searchlightBeams, sightAt, contourAlpha } from '/shared/vision.js';
import { pack, REFILL_COLORS } from '/render-common.js';
import { PROPS } from '/shared/config.js';
import { spritePool } from '/pixi-scene.js';

export function createHazardView(v) {
  const { game, at, marks, effects, lights, badges, badgeRings, badgeTex, particles, mirageSprites, drawContour, visionRadius } = v;
  const props = spritePool(v.props, undefined, (s) => s.anchor.set(0.5));
  // sprite uit de atlas op (x, y), size = schaal (1 = getekende maat), of false als die er niet is
  function prop(name, x, y, size = 1, alpha = 1, rot = 0) {
    const tex = v.texture(name);
    if (!tex) return false;
    const s = props.next();
    s.texture = tex; s.position.set(x, y); s.scale.set(size / PROPS.px); s.alpha = alpha; s.rotation = rot;
    return true;
  }
  const dropped = new Map(); // krat -> tijd waarop hij in beeld neerkwam (parachute zakt)

  // Waar je brandstof of munitie laadt: een badge met B of M en een zacht pulserende ring.
  // Alleen volle plekken; de mist erboven verbergt ze buiten je zicht, net als het ding zelf.
  function drawRefillMarkers(now) {
    badges.begin();
    badgeRings.clear();
    const p = 0.5 + 0.5 * Math.sin(now / 300);
    const marker = (x, y, kind) => {
      badgeRings.circle(x, y, 4 + 1.5 * p).stroke({ color: REFILL_COLORS[kind], alpha: 0.35 + 0.35 * (1 - p), width: 0.5 });
      const s = badges.next();
      s.texture = badgeTex[kind];
      s.width = s.height = 3.2;
      s.position.set(x, y - 5.5);
    };
    for (const [x, y, full] of game.depots) if (full) marker(x, y, 'fuel');
    if (game.ammoDepot) marker(game.ammoDepot[0], game.ammoDepot[1] + 0.5, 'ammo');
    for (const c of game.crates) if (c && c[3]) marker(c[0], c[1], c[2]);
    badges.end();
  }
  // Brandstofdepot: een stapel jerrycans; leeg = grijs en omgevallen
  function drawDepots() {
    props.begin();
    for (const [x, y, full] of game.depots) {
      if (prop(full ? 'brandstof-vol' : 'brandstof-leeg', x, y)) continue;
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
    if (game.ammoDepot && !prop('munitie-depot', game.ammoDepot[0], game.ammoDepot[1])) { // munitiekisten (Grebbeberg)
      const [x, y] = game.ammoDepot;
      for (let k = 0; k < 3; k++) {
        marks.rect(x - 3 + k * 2.2, y - 1, 1.8, 1.4).fill(0x6a5a2a);
        marks.rect(x - 3 + k * 2.2, y - 1, 1.8, 0.35).fill(0xc9a43a);
      }
    }
    const now = performance.now();
    game.crates.forEach((c, k) => { // krat aan een parachute (Market Garden)
      if (!c) return;
      const [x, y, kind, full] = c;
      if (prop(full ? (kind === 'fuel' ? 'krat-brandstof' : 'krat-munitie') : 'krat-leeg', x, y)) {
        if (!full) return;
        const p = Math.min(1, (now - (dropped.get(k) ?? 0)) / PROPS.dropMs); // zakt neer: van groot en vaag naar normaal
        prop('parachute', x + PROPS.parachute[0], y + PROPS.parachute[1], 1.6 - 0.6 * p, p);
        return;
      }
      if (full) {
        // eerst moveTo: anders trekt Pixi een lijn vanaf het eind van het vorige pad (witte strepen)
        marks.moveTo(x - 2.2, y - 2.5).arc(x, y - 2.5, 2.2, Math.PI, 0).stroke({ color: 0xf0f0e6, alpha: 0.8, width: 0.2 });
        marks.moveTo(x - 2.2, y - 2.5).lineTo(x, y).lineTo(x + 2.2, y - 2.5).stroke({ color: 0xf0f0e6, alpha: 0.8, width: 0.2 });
      }
      marks.rect(x - 1.2, y - 1, 2.4, 2).fill(full ? (kind === 'fuel' ? 0x4e6b2a : 0x8a6a2a) : 0x6a6a64);
    });
    props.end();
    for (const g of game.guns) { // antitankgeschut (Carentan), zichtbaar na het eerste schot
      const col = g.hp > 0 ? 0x4a4a3a : 0x2a2a26;
      marks.save(); marks.translateTransform(g.x, g.y); marks.rotateTransform(g.ang);
      marks.rect(-1.5, -1.2, 3, 2.4).fill(col);
      marks.rect(0, -0.25, g.hp > 0 ? 4 : 2, 0.5).fill(col);
      marks.restore();
    }
    if (game.bridge?.blown && !v.bridgeSprites) drawBridgeWreck(game.bridge.box); // met sprites tekent bridges-view het wrak
  }
  // Opgeblazen brug: brokken beton en geknakte liggers in het water, met water ertussen.
  // De vorm volgt uit een hash van de plek, zodat iedereen hetzelfde wrak ziet.
  const bridgeGrey = (k) => pack(...v.pal.bridge.map((c) => c * k)); // brokken in de kleur van de brug
  function drawBridgeWreck([x0, y0, x1, y1]) {
    const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const step = 2.6;
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const gx = Math.round(x * 10), gy = Math.round(y * 10);
        if (hash(gx, gy, 0) < 0.38) continue; // hier alleen water
        const cx = x + (hash(gx, gy, 1) - 0.5) * 1.2, cy = y + (hash(gx, gy, 2) - 0.5) * 1.2;
        const r = 0.8 + hash(gx, gy, 3) * 0.9, rot = hash(gx, gy, 4) * Math.PI * 2, n = 5 + Math.floor(hash(gx, gy, 5) * 2);
        const pts = [];
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * Math.PI * 2, d = r * (0.6 + 0.4 * hash(gx, gy, 6 + k));
          pts.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        }
        marks.poly(pts.map((c, k) => c + (k % 2 ? 0.35 : 0.25))).fill({ color: 0x14202a, alpha: 0.45 }); // schaduw op het water
        marks.poly(pts).fill(bridgeGrey(0.72 + Math.floor(hash(gx, gy, 12) * 3) * 0.1)).stroke({ color: bridgeGrey(0.4), width: 0.2 });
      }
    }
    // een paar liggers die schuin uit het water steken
    for (let k = 0; k < 3; k++) {
      const hx = x0 + (x1 - x0) * (0.2 + 0.3 * k + (hash(x0, y0, 20 + k) - 0.5) * 0.15), hy = y0 + (y1 - y0) * hash(x0, y0, 30 + k);
      marks.save(); marks.translateTransform(hx, hy); marks.rotateTransform((hash(x0, y0, 40 + k) - 0.5) * 1.6);
      marks.rect(-2.2, -0.35, 4.4, 0.7).fill(bridgeGrey(0.5));
      marks.restore();
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
  // Woestijnhallucinaties (El Alamein): buiten je zichtcirkel soms een valse contour, ergens waar
  // een echte ook zou kunnen staan (in je kijkboog, vrije zichtlijn); per speler anders en niet
  // gesynchroniseerd (§6.4)
  const mirages = [];
  let nextMirage = 0;
  function drawMirages(me, cam, now) {
    if (!game.weather?.flags.mirages) return;
    if (!nextMirage) nextMirage = now + 15000 * Math.random();
    const r = visionRadius(), far = Math.hypot(cam.w, cam.h) / 2;
    if (now > nextMirage) {
      nextMirage = now + 15000 * (0.5 + Math.random()); // gemiddeld eens per 15 s
      const half = (G.VISION.coneDegrees / 2) * (Math.PI / 180), a = (me.ang || 0) + (Math.random() * 2 - 1) * half;
      const d = r + 4 + Math.random() * Math.max(4, far * 0.8 - r - 4);
      const x = Math.round(me.x + Math.cos(a) * d), y = Math.round(me.y + Math.sin(a) * d);
      if (G.inBounds(x, y) && sightAt(game.map, me, x, y, { radius: r, view: cam, smokes: game.smokes }) === 'contour') {
        mirages.push({ x, y, ang: Math.floor(Math.random() * 8) * (Math.PI / 4), until: now + 2000 + Math.random() * 2000 });
      }
    }
    for (let k = mirages.length - 1; k >= 0; k--) {
      const m = mirages[k];
      if (now > m.until) { mirages.splice(k, 1); continue; }
      drawContour(mirageSprites, m.x + 0.5, m.y + 0.5, m.ang, contourAlpha(Math.hypot(m.x - me.x, m.y - me.y), r, far));
    }
  }

  // Herkenningspunt van een dorp: een kruis op het dak van de kerk (zolang die nog staat)
  function drawLandmarks() {
    for (const l of game.landmarks) {
      if (at(Math.round(l.x), Math.round(l.y)) !== G.BUILDING) continue;
      marks.rect(l.x - 0.6, l.y - 3.5, 1.2, 7).rect(l.x - 2.2, l.y - 1.8, 4.4, 1.2).fill({ color: 0x28241e, alpha: 0.85 });
    }
  }

  // Nieuwe dropping (parachute zakt, alleen in beeld) en een laadplek die leeg raakt (stofwolkje)
  function onEvent(e) {
    if (e.t === 'drop' && e.c && v.seesSharp(e.c[0], e.c[1])) dropped.set(e.k, performance.now());
    const spot = e.t === 'depu' ? game.depots[e.k] : e.t === 'dropu' ? game.crates[e.k] : null;
    if (spot && v.seesSharp(spot[0], spot[1])) particles.spawn('smoke', spot[0], spot[1], 6, { speed: 3, life: 1.2, r0: 0.8, r1: 3.5 });
  }

  return { onEvent, drawRefillMarkers, drawDepots, drawBarrage, drawObjects: drawObjectsOfHazards, drawFires, drawDust, drawSearchlights, drawMirages, drawLandmarks };
}
