// Waterplanten (alleen decoratie, alleen weergave): in een smalle strook langs de oever, met vast
// toeval op een rooster, tegen de getekende waterlijn aan. Zomer: waterlelies op het water, oeverplanten op de grond ernaast. Winter:
// ijsbladeren op het ijs, oeverriet langs water en ijs. Geen celtype, geen obstakel, geen zicht.
// Instellingen: WATER_PLANTS (config.js) en look.waterPlants (dichtheid, breedte; 0 = uit).
//
// Waar een tunnel of krater ligt, verdwijnt een oeverplant, maar alleen waar je zicht hebt: op de
// schone kaart (geen zicht) staat hij er gewoon, anders zou een verdwenen plant een spoor verraden.
// Daarom staan planten op gegraven cellen in een eigen laag met het zichtmasker (wit = geen zicht).
// Breekt het ijs (wak), dan verdwijnen de ijsbladeren daar (rebuild).
import * as G from '/shared/game.js';
import { WATER_PLANTS } from '/shared/config.js';
import { Container, Sprite } from 'pixi.js';
import { hash, TILE } from '/render-common.js';

// layer: boven de grondshader; hidden: idem, met het zichtmasker (alleen te zien zonder zicht);
// texture(naam): sprite uit de atlas (objects-view); shore(x, y): > 0 op water of ijs zoals de
// grondshader het tekent (ground-gpu shoreAt)
export function createPlantView({ layer, hidden, game, texture, shore }) {
  let look = null, kinds = null, distWet = null, distDry = null;
  const byCell = new Map(); // celindex -> sprite van een oeverplant (gaat weg bij graven)
  let tiles = [], tx = 0;

  // varianten van een soort in de atlas
  const variants = (name) => {
    const out = [];
    for (let k = 1; texture(`${name}-${String(k).padStart(2, '0')}`); k++) out.push(`${name}-${String(k).padStart(2, '0')}`);
    return out;
  };
  const isWet = (i) => game.map[i] === G.WATER || (game.terrain[i] === G.CLASS.ice && (game.map[i] === G.DIRT || game.map[i] === G.EMPTY));
  // afstand (stappen) tot het dichtstbijzijnde vakje van de andere soort (nat/droog), tot max
  function distances(max) {
    const n = G.W * G.H, wet = new Uint8Array(n).fill(255), dry = new Uint8Array(n).fill(255), qw = [], qd = [];
    for (let i = 0; i < n; i++) if (isWet(i)) { wet[i] = 0; qw.push(i); } else { dry[i] = 0; qd.push(i); }
    for (const [d, q] of [[wet, qw], [dry, qd]]) {
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % G.W;
        if (d[i] >= max) continue;
        for (const j of [x > 0 ? i - 1 : -1, x < G.W - 1 ? i + 1 : -1, i - G.W, i + G.W]) {
          if (j >= 0 && j < n && d[j] === 255) { d[j] = d[i] + 1; q.push(j); }
        }
      }
    }
    return [wet, dry]; // wet: afstand tot water/ijs (voor droge cellen), dry: tot de kant (voor natte)
  }

  // Groepjes: zachte vlekken van look.waterPlants.clump cellen (0..1.5), daartussen open stukken
  function clumpAt(x, y) {
    const k = look.waterPlants.clump, u = x / k, v = y / k, i = Math.floor(u), j = Math.floor(v);
    const c = (a, b) => G.mulberry32(hash(a * 7 + 101, b * 13 + 57))();
    const sx = (u - i) * (u - i) * (3 - 2 * (u - i)), sy = (v - j) * (v - j) * (3 - 2 * (v - j));
    const n = (c(i, j) * (1 - sx) + c(i + 1, j) * sx) * (1 - sy) + (c(i, j + 1) * (1 - sx) + c(i + 1, j + 1) * sx) * sy;
    const t = Math.min(1, Math.max(0, (n - 0.3) / 0.4));
    return t * t * (3 - 2 * t) * 1.5;
  }
  // Dichtstbijzijnde plek op de getekende waterlijn (shore wisselt van teken), tot max cellen ver:
  // {x, y, dx, dy, d} met (dx, dy) de richting van (x0, y0) naar de lijn, of null
  const DIRS16 = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
  function shoreNear(x0, y0, max) {
    const wet0 = shore(x0, y0) > 0;
    for (let t = 0.25; t <= max; t += 0.25) {
      for (const [dx, dy] of DIRS16) {
        if ((shore(x0 + dx * t, y0 + dy * t) > 0) === wet0) continue;
        let a = t - 0.25, b = t; // de lijn ligt tussen a en b: nog twee keer halveren
        for (let n = 0; n < 2; n++) { const m = (a + b) / 2; if ((shore(x0 + dx * m, y0 + dy * m) > 0) === wet0) a = m; else b = m; }
        const d = (a + b) / 2;
        return { x: x0 + dx * d, y: y0 + dy * d, dx, dy, d };
      }
    }
    return null;
  }

  // Wat er op roosterpunt (gx, gy) staat: {name, x, y, s, rot, bank, i} of null. Oeverplanten
  // schuiven naar de getekende waterlijn (shore) en staan er net naast; waterplanten (lelie, ijsblad)
  // blijven dicht bij de kant.
  function pick(gx, gy) {
    const step = WATER_PLANTS.step, rnd = G.mulberry32(hash(Math.round(gx * 23 + 5), Math.round(gy * 29 + 11)));
    const wp = look.waterPlants, x0 = gx + rnd() * step, y0 = gy + rnd() * step, i0 = (y0 | 0) * G.W + (x0 | 0);
    const chance = rnd(), off = rnd(), r = [rnd(), rnd(), rnd()];
    if (!G.inBounds(x0 | 0, y0 | 0)) return null;
    if ((isWet(i0) ? distDry[i0] : distWet[i0]) > wp.reach + 1) return null; // ver van de kant (snel, per cel)
    if (chance >= wp.density * clumpAt(x0, y0)) return null;
    let list = null, bank = false, x = x0, y = y0, i = i0;
    if (shore(x0, y0) > 0) {
      const e = shoreNear(x0, y0, wp.width), c = game.map[i0];
      if (e && isWet(i0) && (c === G.WATER ? kinds.water.onWater : true)) list = kinds.water.v;
    } else {
      const e = shoreNear(x0, y0, wp.reach);
      if (!e) return null;
      const o = wp.offset[0] + off * (wp.offset[1] - wp.offset[0]); // > 0: zoveel cellen op de kant
      x = e.x - e.dx * o; y = e.y - e.dy * o; i = (y | 0) * G.W + (x | 0);
      if (!G.inBounds(x | 0, y | 0)) return null;
      const c = game.map[i];
      if (isWet(i)) list = kinds.bank.v; // met de voet in het water
      else if ((c === G.DIRT || c === G.EMPTY) && game.terrain[i] !== G.CLASS.paved) { list = kinds.bank.v; bank = true; }
    }
    if (!list?.length) return null;
    const s = WATER_PLANTS.scale[0] + r[0] * (WATER_PLANTS.scale[1] - WATER_PLANTS.scale[0]);
    return { name: list[Math.floor(r[1] * list.length)], x, y, s, rot: r[2] * Math.PI * 2, bank, i };
  }

  function buildTile(t) {
    const tile = tiles[t];
    for (const s of tile.list) { if (s.cell !== undefined) byCell.delete(s.cell); s.destroy(); }
    tile.list = [];
    const step = WATER_PLANTS.step, x0 = (t % tx) * TILE, y0 = Math.floor(t / tx) * TILE;
    for (let gy = Math.floor(y0 / step) * step; gy < y0 + TILE; gy += step) {
      for (let gx = Math.floor(x0 / step) * step; gx < x0 + TILE; gx += step) {
        const o = pick(gx, gy);
        if (!o) continue;
        const s = new Sprite(texture(o.name));
        s.anchor.set(0.5); s.position.set(o.x, o.y); s.rotation = o.rot; s.scale.set(o.s / WATER_PLANTS.px);
        if (o.bank) { s.cell = o.i; byCell.set(o.i, s); }
        (o.bank && game.map[o.i] === G.EMPTY ? hidden : layer).addChild(s);
        tile.list.push(s);
      }
    }
  }

  function clear() {
    for (const tile of tiles) for (const s of tile.list) s.destroy();
    tiles = []; byCell.clear();
  }
  function load(lookNow) {
    look = lookNow;
    clear();
    const names = WATER_PLANTS.kinds[game.rules?.style || 'zomer'];
    if (!names || !(look.waterPlants?.density > 0)) return;
    kinds = { water: { v: variants(names.water), onWater: names.onWater }, bank: { v: variants(names.bank) } };
    if (!kinds.water.v.length && !kinds.bank.v.length) return;
    [distWet, distDry] = distances(Math.max(look.waterPlants.width, look.waterPlants.reach) + 2);
    tx = Math.ceil(G.W / TILE);
    const n = tx * Math.ceil(G.H / TILE);
    for (let t = 0; t < n; t++) { tiles.push({ list: [] }); buildTile(t); }
  }
  // Water of ijs veranderde (wak): afstanden en de tegels eromheen opnieuw
  function rebuild([x0, y0, x1, y1]) {
    if (!tiles.length) return;
    [distWet, distDry] = distances(Math.max(look.waterPlants.width, look.waterPlants.reach) + 2);
    const pad = look.waterPlants.reach + WATER_PLANTS.step + 2;
    for (let y = Math.max(0, Math.floor((y0 - pad) / TILE)); y <= Math.min(Math.ceil(G.H / TILE) - 1, Math.floor((y1 + pad) / TILE)); y++) {
      for (let x = Math.max(0, Math.floor((x0 - pad) / TILE)); x <= Math.min(tx - 1, Math.floor((x1 + pad) / TILE)); x++) buildTile(y * tx + x);
    }
  }
  // Een cel werd gegraven of liep dicht: de oeverplant erop naar de laag die alleen zonder zicht te zien is, of terug
  function cellChanged(x, y) {
    const s = byCell.get(y * G.W + x);
    if (!s) return;
    const want = game.map[y * G.W + x] === G.EMPTY ? hidden : layer;
    if (s.parent !== want) want.addChild(s);
  }

  return { load, rebuild, cellChanged, destroy: clear };
}
