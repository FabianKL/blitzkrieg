// Bomen, struiken, heggen, cactussen, palmen, rotsblokken en kraters als losse sprites uit de atlas
// van de stijl (public/assets/<stijl>/objects.json + .png, 32 px per cel). Alleen weergave: wat een
// cel is (begroeiing, rots) en wat er gebeurt als hij omgaat, beslist het spel.
//
// Plaatsing zoals de getekende objecten: op een vast rooster (OBJECTS.step, of lowStep op een kaart
// met alleen lage begroeiing) met vast toeval per
// roosterpunt (soort, variant, draaiing, schaal), dus bij iedereen hetzelfde en per tegel opnieuw
// op te bouwen. Per tegel van 32 x 32 cellen een container: alleen tegels in beeld worden getekend.
// Hoge dingen (bomen, palmen) staan boven de tanks (kruinen), lage eronder; schaduwen met dezelfde
// texture in de schaduwlaag (look.light).
//
// Omgeschoten begroeiing (scar 1) toont <soort>-kapot-NN als die er is (manifest: felled.kapot);
// soorten zonder kapotte variant verdwijnen helemaal (de grondshader tekent daar gewoon grond).
// Na een barrage (scar 3) staat er de kapotte variant (of een kleinere boom).
// Kraters (krater-NN) van een ontplofte tank of artillerie liggen in een eigen laag zonder
// zichtmasker: altijd te zien (de tunnel eronder niet).
// Ontbreekt de atlas of een soort, dan geeft load() false en tekent de stijl de oude objecten.
import * as G from '/shared/game.js';
import { OBJECTS } from '/shared/config.js';
import { Container, Sprite, Texture, ImageSource, Spritesheet } from 'pixi.js';
import { hash, TILE } from '/render-common.js';
import { loadManifest, loadImage, has, report } from '/assets.js';

const PX = 32; // pixels per cel in de sprites
const DEPTH_MAX = 8; // dieper in een bos telt als even diep (de grootste kruin past dan altijd)
const KIND = { pine: 'den', tree: 'loof', hedge: 'heg', shrub: 'struik', birch: 'berk' }; // vegetation.type -> sprite

// under/over: containers onder en boven de tanks, shadows: schaduwlaag, craters: container in de
// laag met het omgekeerde zichtmasker, shadowColor: kleur van de schaduw
export function createObjectView({ under, over, shadows, craters, game, shadowColor }) {
  let sheet = null, sheetStyle = '', look = null, active = false;
  let kinds = null, coast = null; // soorten met hun aandeel, afstand tot zee (palmen)
  let tiles = []; // per tegel {under, over, shadow, list: [{name, x, y, s, rot}]}
  let tx = 0, ty = 0;

  // Atlas van de stijl, één keer geladen
  async function loadSheet(style) {
    if (style === sheetStyle) return sheet;
    sheetStyle = style; sheet = null;
    const m = await loadManifest(), json = m?.atlases?.[style];
    if (!json || !has(m, json.replace(/\.json$/, '.png'))) return null;
    const [data, img] = await Promise.all([fetch('/assets/' + json).then((r) => (r.ok ? r.json() : null)).catch(() => null), loadImage(m, json.replace(/\.json$/, '.png'))]);
    if (!data || !img || sheetStyle !== style) return null;
    const source = new ImageSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear' });
    const s = new Spritesheet(new Texture({ source }), data);
    await s.parse();
    sheet = { textures: s.textures, felled: new Set((m.felled?.kapot || []).map((k) => k.split('/').pop() + '|' + (k.includes('/') ? k.split('/')[0] : '*'))) };
    return sheet;
  }
  // varianten van een soort in de atlas: ['loof-01', 'loof-02', ...] (onthouden per atlas)
  const variantCache = new Map();
  const variants = (name) => {
    const key = `${sheetStyle}|${name}`;
    if (!variantCache.has(key)) variantCache.set(key, Object.keys(sheet.textures).filter((k) => k.startsWith(name + '-') && k.length === name.length + 3 && /-\d\d$/.test(k)).sort());
    return variantCache.get(key);
  };
  const hasKapot = (kind) => sheet.felled.has(`${kind}|*`) || sheet.felled.has(`${kind}|${sheetStyle}`);

  // Welke soorten deze kaart gebruikt: vegetation.sprites ({soort: aandeel}) of de soort uit vegetation.type
  function kindsFor(rules) {
    const v = rules.vegetation || {}, own = v.sprites || { [KIND[v.type] || 'loof']: 1 };
    const list = Object.entries(own).map(([name, share]) => ({ name, share, v: variants(name), kapot: hasKapot(name) ? variants(`${name}-kapot`) : [] }));
    if (v.palmCoast) list.palm = { name: 'palm', v: variants('palm'), kapot: hasKapot('palm') ? variants('palm-kapot') : [] };
    return list;
  }
  // Afstand (stappen, breedte eerst) tot het water, tot `max`: voor de palmen aan de kust
  function coastField(max) {
    const d = new Uint8Array(G.W * G.H).fill(255), q = [];
    for (let i = 0; i < G.W * G.H; i++) if (game.map[i] === G.WATER) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % G.W;
      if (d[i] >= max) continue;
      for (const j of [x > 0 ? i - 1 : -1, x < G.W - 1 ? i + 1 : -1, i - G.W, i + G.W]) {
        if (j >= 0 && j < d.length && d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    return d;
  }

  // Hoe diep een cel in zijn bos of rotsveld ligt: stappen (breedte eerst) tot de eerste cel van
  // een andere soort, tot max. Een kruin mag maar OBJECTS.overhang cellen over de rand hangen: hij
  // staat boven de tanks en zou anders een tank op open grond verbergen.
  function depthField(max) {
    const d = new Uint8Array(G.W * G.H), q = [], kindOf = (i) => {
      const c = game.map[i];
      return c === G.ROCK ? 1 : c === G.VEG ? 2 : 0; // een omgeschoten plant is open: daar mag geen kruin overheen
    };
    for (let i = 0; i < G.W * G.H; i++) {
      const k = kindOf(i), x = i % G.W;
      if (!k) continue;
      const edge = [x > 0 ? i - 1 : -1, x < G.W - 1 ? i + 1 : -1, i - G.W, i + G.W].some((j) => j < 0 || j >= d.length || kindOf(j) !== k);
      d[i] = edge ? 1 : 255;
      if (edge) q.push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % G.W;
      if (d[i] >= max) continue;
      for (const j of [x > 0 ? i - 1 : -1, x < G.W - 1 ? i + 1 : -1, i - G.W, i + G.W]) {
        if (j >= 0 && j < d.length && d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    return d;
  }
  // Grootste schaal waarbij sprite `name` binnen zijn bos of rotsveld blijft (plus de overhang)
  function fitScale(name, i) {
    const tex = sheet.textures[name], cells = (tex?.width ?? 6 * PX) / PX;
    return Math.max(OBJECTS.minScale, ((Math.min(depth[i], 254) - 0.5 + OBJECTS.overhang) * 2) / (cells * OBJECTS.crown));
  }

  // Rotsblok op roosterpunt (gx, gy) van het rotsrooster (OBJECTS.rockStep): liggen de blokken op de
  // gewone grond (look.objects.rockGround), dan moet elk stukje rots er een hebben, ook een klein
  // plekje: anders lijkt een plek waar je niet door kunt gewoon gras
  function pickRock(gx, gy) {
    const rnd = G.mulberry32(hash(Math.round(gx * 13 + 91), Math.round(gy * 41 + 17))), st = OBJECTS.rockStep;
    const x = gx + rnd() * st, y = gy + rnd() * st, i = (y | 0) * G.W + (x | 0);
    if (!G.inBounds(x | 0, y | 0) || game.map[i] !== G.ROCK) return null;
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), v = variants('rots'), name = v[Math.floor(r2 * v.length)];
    if (!v.length || r1 >= look.objects.rocks) return null;
    return { name, x, y, s: Math.min(lerp(OBJECTS.scale.rots, r4), fitScale(name, i)), rot: (r3 - 0.5) * 2 * OBJECTS.turn, top: false, h: OBJECTS.height.low };
  }

  // Wat er op roosterpunt (gx, gy) staat: {name, x, y, s, rot, top} of null
  function pick(gx, gy) {
    const rnd = G.mulberry32(hash(Math.round(gx * 31 + 7), Math.round(gy * 17 + 3)));
    const x = gx + rnd() * step, y = gy + rnd() * step, i = (y | 0) * G.W + (x | 0);
    if (!G.inBounds(x | 0, y | 0)) return null;
    const c = game.map[i], scar = game.world.scar[i], r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    const rot = (r3 - 0.5) * 2 * OBJECTS.turn;
    if (c === G.ROCK) {
      if (look.objects.rockGround) return null; // die staan op het rotsrooster (pickRock)
      if (r1 >= look.objects.rocks) return null;
      const v = variants('rots'), name = v[Math.floor(r2 * v.length)];
      return v.length ? { name, x, y, s: Math.min(lerp(OBJECTS.scale.rots, r4), fitScale(name, i)), rot, top: false, h: OBJECTS.height.low } : null;
    }
    const felled = scar === G.SCAR_PLANT && c !== G.VEG, tops = scar === G.SCAR_TREETOPS;
    if (c !== G.VEG && !felled) return null;
    // soort: palm aan de kust, anders volgens de aandelen
    let kind = kinds.palm && coast[i] <= game.rules.vegetation.palmCoast ? kinds.palm : null;
    if (!kind) {
      let acc = 0;
      const total = kinds.reduce((a, k) => a + k.share, 0);
      for (const k of kinds) { acc += k.share / total; if (r1 < acc) { kind = k; break; } }
      kind ||= kinds[kinds.length - 1];
    }
    const want = lerp(OBJECTS.scale[kind.name] || [0.8, 1.05], r4), tall = OBJECTS.tall.includes(kind.name);
    if (felled || tops) {
      const name = kind.kapot.length ? kind.kapot[Math.floor(r2 * kind.kapot.length)] : kind.v[Math.floor(r2 * kind.v.length)];
      if (kind.kapot.length) return { name, x, y, s: want, rot, top: false, h: OBJECTS.height.low }; // ligt onder de tanks
      if (felled) return null; // verdwijnt helemaal: daar ligt gewoon grond
      return { name, x, y, s: Math.min(want * 0.55, fitScale(name, i)), rot, top: tall, h: OBJECTS.height.low }; // kapotte top: kleiner
    }
    const name = kind.v[Math.floor(r2 * kind.v.length)];
    return { name, x, y, s: Math.min(want, fitScale(name, i)), rot, top: tall, h: tall ? OBJECTS.height.tall : OBJECTS.height.low };
  }
  let depth = null, step = OBJECTS.step;
  const lerp = ([a, b], t) => a + (b - a) * t;

  // Eén tegel (opnieuw) opbouwen
  function buildTile(t) {
    const tile = tiles[t];
    for (const c of [tile.under, tile.over, tile.shadow]) for (const s of c.removeChildren()) s.destroy();
    tile.list = [];
    const x0 = (t % tx) * TILE, y0 = Math.floor(t / tx) * TILE;
    // roosterpunten waarvan het object (met toeval tot één stap verder) in deze tegel kan vallen;
    // zelfde rooster als op de hele kaart, zodat een tegel er na opnieuw opbouwen hetzelfde uitziet.
    // Twee roosters: begroeiing (en rots op een plaat) en, als ze op de grond liggen, rotsblokken.
    const grids = look.objects.rockGround ? [[step, pick], [OBJECTS.rockStep, pickRock]] : [[step, pick]];
    for (const [st, at] of grids) for (let gy = Math.floor((y0 - st) / st) * st; gy < y0 + TILE; gy += st) {
      for (let gx = Math.floor((x0 - st) / st) * st; gx < x0 + TILE; gx += st) {
        if (gx < 0 || gy < 0) continue;
        const o = at(gx, gy);
        if (!o || (o.x | 0) < x0 || (o.x | 0) >= x0 + TILE || (o.y | 0) < y0 || (o.y | 0) >= y0 + TILE) continue;
        const tex = sheet.textures[o.name];
        if (!tex) continue;
        tile.list.push(o);
        for (const shadow of [true, false]) {
          const s = new Sprite(tex);
          s.anchor.set(0.5);
          s.scale.set(o.s / PX);
          s.rotation = o.rot;
          if (shadow) {
            s.position.set(o.x + look.light.dx * o.h, o.y + look.light.dy * o.h);
            s.tint = shadowColor; s.alpha = look.light.alpha;
            tile.shadow.addChild(s);
          } else {
            s.position.set(o.x, o.y);
            (o.top ? tile.over : tile.under).addChild(s);
          }
        }
      }
    }
    // laag eerst, van boven naar beneden: wat lager op het scherm staat, staat ervoor
    for (const c of [tile.under, tile.over]) c.children.sort((a, b) => a.y - b.y);
  }

  function clear() {
    for (const tile of tiles) for (const c of [tile.under, tile.over, tile.shadow]) c.destroy({ children: true });
    tiles = [];
    for (const c of craters.removeChildren()) c.destroy();
  }

  // Nieuwe kaart. Geeft true als de sprites er zijn, false als de stijl zijn eigen objecten tekent.
  async function load(lookNow) {
    look = lookNow;
    clear();
    active = false;
    const style = game.rules?.style || 'zomer', map = game.map;
    if (!await loadSheet(style) || game.map !== map) { report.objects = 'getekend (geen atlas)'; return false; }
    kinds = kindsFor(game.rules || {});
    const missing = [...kinds, ...(kinds.palm ? [kinds.palm] : [])].filter((k) => !k.v.length).map((k) => k.name);
    if (missing.length) { report.objects = `getekend (niet in de atlas: ${missing.join(', ')})`; return false; }
    report.objects = { soorten: kinds.map((k) => k.name).concat(kinds.palm ? ['palm (kust)'] : []), kapot: kinds.filter((k) => k.kapot.length).map((k) => k.name) };
    coast = kinds.palm ? coastField(game.rules.vegetation.palmCoast + 1) : null;
    depth = depthField(DEPTH_MAX);
    // alleen lage begroeiing (heggen, struiken): fijner rooster, anders worden het losse plukjes
    step = [...kinds, ...(kinds.palm ? [kinds.palm] : [])].some((k) => OBJECTS.tall.includes(k.name)) ? OBJECTS.step : OBJECTS.lowStep;
    tx = Math.ceil(G.W / TILE);
    const n = tx * Math.ceil(G.H / TILE);
    for (let t = 0; t < n; t++) {
      tiles.push({ under: under.addChild(new Container()), over: over.addChild(new Container()), shadow: shadows.addChild(new Container()), list: [] });
      buildTile(t);
    }
    active = true;
    return true;
  }

  // Een stuk kaart veranderde (plant om, barrage): de tegels eromheen opnieuw
  function rebuild([x0, y0, x1, y1]) {
    if (!active) return;
    depth = depthField(DEPTH_MAX); // een omgeschoten plant maakt de rand van het bos anders
    const pad = step + DEPTH_MAX;
    for (let y = Math.max(0, Math.floor((y0 - pad) / TILE)); y <= Math.min(Math.ceil(G.H / TILE) - 1, Math.floor((y1 + pad) / TILE)); y++) {
      for (let x = Math.max(0, Math.floor((x0 - pad) / TILE)); x <= Math.min(tx - 1, Math.floor((x1 + pad) / TILE)); x++) buildTile(y * tx + x);
    }
  }
  // Alleen tegels in beeld (met een rand voor wat erover hangt)
  function update(cam) {
    if (!active) return;
    const pad = 4;
    tiles.forEach((tile, t) => {
      const x0 = (t % tx) * TILE, y0 = Math.floor(t / tx) * TILE;
      const on = x0 < cam.x + cam.w + pad && x0 + TILE > cam.x - pad && y0 < cam.y + cam.h + pad && y0 + TILE > cam.y - pad;
      tile.under.visible = tile.over.visible = tile.shadow.visible = on;
    });
  }
  // Krater (x, y, straal in cellen): een sprite in de kraterlaag (altijd te zien)
  function addCrater(x, y, r) {
    if (!active) return;
    const v = variants('krater');
    if (!v.length) return;
    const h = hash(Math.round(x * 13), Math.round(y * 7)), s = new Sprite(sheet.textures[v[h % v.length]]);
    s.anchor.set(0.5);
    s.position.set(x + 0.5, y + 0.5);
    s.scale.set((2 * r * OBJECTS.craterSize) / s.texture.width);
    s.rotation = ((h >>> 8) % 628) / 100;
    craters.addChild(s);
  }
  // Legenda: de sprites die in een stuk kaart staan, op een canvas (zoals createTileCanvases.drawRegion)
  function drawRegion(g, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (!active) return;
    const k = dw / sw;
    for (const tile of tiles) {
      for (const o of tile.list) {
        if (o.x < sx - 3 || o.x > sx + sw + 3 || o.y < sy - 3 || o.y > sy + sh + 3) continue;
        const tex = sheet.textures[o.name], f = tex.frame, img = tex.source.resource, size = (o.s * f.width) / PX * k;
        g.save();
        g.beginPath(); g.rect(dx, dy, dw, dh); g.clip();
        g.translate(dx + (o.x - sx) * k, dy + (o.y - sy) * k); g.rotate(o.rot);
        g.drawImage(img, f.x, f.y, f.width, f.height, -size / 2, -size / 2, size, (size * f.height) / f.width);
        g.restore();
      }
    }
  }

  return {
    load, rebuild, update, addCrater, drawRegion, destroy: clear,
    texture: (name) => sheet?.textures[name] ?? null, // ook voor depots en kratten (hazards-view)
    get active() { return active; },
    // soorten die bij omschieten helemaal verdwijnen (geen kapotte variant): de grond toont dan geen gat
    get vanishOnFell() { return active && [...kinds, kinds.palm].filter(Boolean).every((k) => !k.kapot.length); },
  };
}
