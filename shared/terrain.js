// Wat de kaart verandert, op de server en in de browser precies hetzelfde: graven, sporen en
// vervagen, planten en gebouwen wegschieten, ijs en dooi, en de veranderingen door het weer en
// de gevaren (artillerie, brand, puin, de brug).
import { FELL, T, TRACK_ERASER, BUILDING as BUILDING_CFG } from './config.js';
import { growBox, BASE_H, BASE_W, BUILDING, CLASS, CLASSES, DIRT, DOOR_CLEAR, EMPTY, H, ICE_B, ICE_BH, ICE_BW, MASKS, TICK_RATE, VEG, W, WATER, inBounds, isIce, mulberry32, reachable, trackStage } from './world.js';

// Een kogel raakt (x, y). Is dat een plant of gebouw, dan één treffer minder. Bij 0:
// - een plant wordt een permanent gat (tunnel) in zijn ondergrond, scar = 1 (stronk, takken);
// - een gebouw wordt puin: ongegraven grond van de puinklasse, scar = 2 (puinpatroon).
// Beide vervagen nooit. onFell(x, y) per cel die verandert. Geeft true als het weg is.
export const SCAR_PLANT = 1, SCAR_RUBBLE = 2;
export function hitObstacle(w, x, y, onFell) {
  if (!inBounds(x, y)) return false;
  const i = y * W + x, kind = w.map[i];
  if (kind !== VEG && kind !== BUILDING) return false;
  const id = w.veg[i] - 1;
  if (--w.vegHp[id] > 0) return false;
  const fell = (c) => {
    w.veg[c] = 0;
    w.map[c] = EMPTY;
    w.scar[c] = SCAR_PLANT;
    w.track[c] = CLASSES[w.terrain[c]].track;
    if (onFell) onFell(c % W, (c / W) | 0);
  };
  if (kind === VEG) { // doorgang voor een tank: ook de begroeiing rond de inslag
    const r = FELL.clearRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1 || !inBounds(x + dx, y + dy)) continue;
        const c = (y + dy) * W + x + dx;
        if (w.map[c] === VEG) fell(c);
      }
    }
  }
  for (const c of w.vegCells[id]) {
    if (w.map[c] !== kind) continue;
    w.veg[c] = 0;
    if (kind === VEG) {
      fell(c);
      continue;
    } else {
      w.map[c] = DIRT;
      w.terrain[c] = CLASS[BUILDING_CFG.rubble];
      w.scar[c] = SCAR_RUBBLE;
    }
    if (onFell) onFell(c % W, (c / W) | 0);
  }
  return true;
}

// Vak b en de vakken direct ernaast worden een wak. onChange(x, y) per cel die water wordt.
// Geeft de rechthoek [x0, y0, x1, y1] die veranderd is (of null).
export function breakIce(w, b, onChange) {
  const bx = b % ICE_BW, by = (b / ICE_BW) | 0;
  let box = null;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = bx + dx, cy = by + dy;
    if (cx < 0 || cy < 0 || cx >= ICE_BW || cy >= ICE_BH) continue;
    for (let y = cy * ICE_B; y < Math.min(H, (cy + 1) * ICE_B); y++) {
      for (let x = cx * ICE_B; x < Math.min(W, (cx + 1) * ICE_B); x++) {
        const i = y * W + x;
        if (!isIce(w, i)) continue;
        w.map[i] = WATER;
        box = growBox(box, x, y);
        if (onChange) onChange(x, y);
      }
    }
  }
  return box;
}

// Dooi: al het ijs wordt water, en er komen plassen bij (pools = [[x, y, r], ...] van de server)
export function thaw(w, pools = [], onChange) {
  for (let i = 0; i < w.map.length; i++) {
    if (isIce(w, i)) { w.map[i] = WATER; if (onChange) onChange(i % W, (i / W) | 0); }
  }
  for (const [px, py, r] of pools) {
    for (let y = py - r - 1; y <= py + r + 1; y++) {
      for (let x = px - r - 1; x <= px + r + 1; x++) {
        if (!inBounds(x, y)) continue;
        const i = y * W + x, jag = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 100 / 100;
        if ((w.map[i] === DIRT || w.map[i] === EMPTY) && w.terrain[i] === CLASS.soft && Math.hypot(x - px, y - py) < r + jag - 0.3) {
          w.map[i] = WATER;
          if (onChange) onChange(x, y);
        }
      }
    }
  }
}

// Plekken voor de plassen bij de dooi (alleen de server): op sneeuw, ver van de bases, en nooit
// zo dat een basis onbereikbaar wordt.
export function pickThawPools(w, bases, cfg, rnd = Math.random) {
  const [lo, hi] = cfg.pools, want = lo + Math.floor(rnd() * (hi - lo + 1)), pools = [];
  const after = Uint8Array.from(w.map, (v, i) => (isIce(w, i) ? WATER : v));
  for (let tries = 0; pools.length < want && tries < 60; tries++) {
    const x = Math.round(15 + rnd() * (W - 30)), y = Math.round(12 + rnd() * (H - 24));
    if (w.terrain[y * W + x] !== CLASS.soft || bases.some((b) => Math.hypot(b.x - x, b.y - y) < 30)) continue;
    const test = { map: after.slice(), terrain: w.terrain };
    thaw(test, [[x, y, cfg.poolRadius]]);
    const seen = reachable(test.map, bases[0]);
    if (bases.some((b) => !seen[b.y * W + b.x])) continue;
    after.set(test.map);
    pools.push([x, y, cfg.poolRadius]);
  }
  return pools;
}

// ---------- Sporen ----------
// Elke tunnelcel heeft een spoor (track): hoe zichtbaar hij is. Een tank zet het spoor
// op de beginwaarde van de terreinklasse; elke seconde vervaagt het tot het minimum
// van die klasse. Bereikt het 0, dan loopt de tunnel weer dicht. Server en clients
// doen dit op dezelfde ticks, dus de kaart blijft overal gelijk zonder iets te versturen.
export const FADE_CHECK = TICK_RATE; // één keer per seconde

// Cellen onder een tank krijgen een vers spoor (ook moeras, dat geen tunnel krijgt).
// onChange(x, y): de cel ziet er anders uit.
export function touchTank(w, x, y, dir, onChange) {
  for (const c of MASKS[dir]) {
    const i = (y + c.y) * W + x + c.x;
    const v = w.map[i];
    const cls = CLASSES[w.terrain[i]];
    if (v !== EMPTY && !(v === DIRT && cls.noTunnel)) continue;
    const old = w.track[i];
    w.track[i] = cls.track;
    if (onChange && trackStage(old) !== trackStage(cls.track)) onChange(x + c.x, y + c.y);
  }
}

// erasing: de sporenwisser woedt (true), of alleen bij water ('nearWater': binnen 3 T van
// moeras of water, zie nearWaterMask). Permanente gaten van begroeiing en puin vervagen nooit.
// onFill(x, y): tunnel is dichtgelopen. onStage(x, y): spoor ziet er een stap vager uit.
export function fadeStep(w, tick, erasing, onFill, onStage) {
  if (tick % FADE_CHECK !== 0) return;
  const { map, terrain, track, scar } = w;
  const mask = erasing === 'nearWater' ? nearWaterMask(w) : null;
  for (let i = 0; i < track.length; i++) {
    const v = track[i];
    if (!v || scar[i]) continue;
    const cls = CLASSES[terrain[i]];
    const wipe = erasing && cls.erasable && (!mask || mask[i]);
    const fade = wipe ? cls.fade * TRACK_ERASER.fadeFactor : cls.fade, min = wipe ? 0 : cls.min;
    const nv = Math.max(Math.min(v, min), v - fade);
    if (nv === v) continue;
    track[i] = nv;
    if (nv === 0 && map[i] === EMPTY) {
      map[i] = DIRT;
      if (onFill) onFill(i % W, (i / W) | 0);
    } else if (onStage && trackStage(nv) !== trackStage(v)) onStage(i % W, (i / W) | 0);
  }
}

// Cellen binnen 3 T van moeras of water (regenbui bij Carentan wist alleen daar sporen).
// Eén keer per wereld uitgerekend; bij een terreinverandering opnieuw (w.nearWater = null).
export function nearWaterMask(w) {
  if (w.nearWater) return w.nearWater;
  const m = new Uint8Array(W * H), R = 3 * T;
  const src = [];
  for (let i = 0; i < W * H; i++) if (w.map[i] === WATER || w.terrain[i] === CLASS.marsh) { m[i] = 1; src.push(i); }
  // afstand in stappen (breedte eerst), tot R
  const d = new Uint8Array(W * H).fill(255);
  for (const i of src) d[i] = 0;
  for (let h = 0; h < src.length; h++) {
    const i = src[h], x = i % W;
    if (d[i] >= R) continue;
    for (const j of [x + 1 < W ? i + 1 : -1, x > 0 ? i - 1 : -1, i + W, i - W]) {
      if (j < 0 || j >= W * H || d[j] !== 255) continue;
      d[j] = d[i] + 1; m[j] = 1; src.push(j);
    }
  }
  return (w.nearWater = m);
}

// Artilleriebarrage in het bos (Ardennen): in het vak blijven kapotte boomtoppen liggen
// (scar 3 op de begroeiing). Server en clients doen hetzelfde.
export const SCAR_TREETOPS = 3;
export function markBarrage(w, [x0, y0, x1, y1], onChange) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      if (w.map[i] !== VEG || w.scar[i]) continue;
      w.scar[i] = SCAR_TREETOPS;
      if (onChange) onChange(x, y);
    }
  }
}

// ---------- Kaartveranderingen door gevaren (server en clients doen hetzelfde) ----------
// Artillerie (Oder-front): kraters in het vak; de grond in het vak wordt zacht
export function markArtillery(w, [x0, y0, x1, y1], craters, onChange) {
  for (const [x, y, r] of craters) digStar(w, x, y, r, onChange);
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      if ((w.map[i] === DIRT || w.map[i] === EMPTY) && CLASS.soft !== undefined && w.terrain[i] !== CLASS.soft) {
        w.terrain[i] = CLASS.soft;
        if (onChange) onChange(x, y);
      }
    }
  }
}
// Brand (Koersk): een vak van T x T is uitgebrand: graan wordt verbrande grond, sporen weg
export function burnTile(w, tile, onChange) {
  const tw = Math.ceil(W / T), bx = (tile % tw) * T, by = ((tile / tw) | 0) * T;
  for (let y = by; y < Math.min(H, by + T); y++) {
    for (let x = bx; x < Math.min(W, bx + T); x++) {
      const i = y * W + x;
      if (w.terrain[i] !== CLASS.normal || (w.map[i] !== DIRT && w.map[i] !== EMPTY)) continue;
      w.terrain[i] = CLASS.burnt;
      if (w.map[i] === EMPTY && !w.scar[i]) w.map[i] = DIRT;
      w.track[i] = 0;
      if (onChange) onChange(x, y);
    }
  }
}
export const fireTileAt = (x, y) => ((y / T) | 0) * Math.ceil(W / T) + ((x / T) | 0);
// Instortende gevel (Berlijn): puin (zachte grond met puinpatroon) in het vak; sluit tunnels af
export function collapseRubble(w, [x0, y0, x1, y1], onChange) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      if (w.map[i] !== DIRT && w.map[i] !== EMPTY) continue;
      w.map[i] = DIRT; w.terrain[i] = CLASS.soft ?? w.terrain[i]; w.scar[i] = SCAR_RUBBLE; w.track[i] = 0;
      if (onChange) onChange(x, y);
    }
  }
}
// Gebouw stort helemaal in (na 3 treffers, Berlijn): wordt meteen puin
export function destroyObstacleAt(w, x, y, onFell) {
  const i = y * W + x;
  if (w.map[i] !== BUILDING && w.map[i] !== VEG) return false;
  w.vegHp[w.veg[i] - 1] = 1;
  return hitObstacle(w, x, y, onFell);
}
// Brug (Market Garden): opgeblazen = water met een wrak, aan het begin van de ronde weer heel
export function setBridge(w, cells, blown, onChange) {
  for (const i of cells) {
    w.map[i] = blown ? WATER : DIRT;
    if (!blown) w.terrain[i] = CLASS.paved;
    if (onChange) onChange(i % W, (i / W) | 0);
  }
  w.nearWater = null;
}

// ---------- Terreinveranderingen door het weer (§7) ----------
// change uit de configuratie (weer, effect.terrain); extra = wat de server erbij bepaalde
// (bv. de plassen bij de dooi). Server en clients doen precies hetzelfde. onChange(x, y).
//   {type: 'thaw', pools, poolRadius}: al het ijs wordt water, plus plassen (Leningrad)
//   {type: 'reclass', from: [klassen], to: klasse, keepTracks}: grond verandert van klasse
//     (Barbarossa: modder; Koersk: zwarte aarde wordt moeras). Zonder keepTracks verdwijnen de
//     sporen op de cellen die veranderen (tunnels lopen dicht).
//   {type: 'inundate', valley: [x0, x1], stages}: het water stijgt een fase (Grebbeberg); in
//     fase extra.stage tot stage/stages van de vallei vanaf links: normal wordt marsh, marsh wordt
//     water, behalve wegen en vlak bij de bases (extra.bases). Sporen daar verdwijnen.
export function applyTerrainChange(w, change, extra = {}, onChange) {
  const changed = (i) => { w.track[i] = 0; if (onChange) onChange(i % W, (i / W) | 0); };
  if (change.type === 'thaw') thaw(w, extra.pools || [], onChange);
  else if (change.type === 'inundate') {
    const x0 = Math.round(change.valley[0] * W), x1 = x0 + Math.round(((change.valley[1] - change.valley[0]) * W * Math.min(extra.stage, change.stages)) / change.stages);
    const nearBase = (x, y) => (extra.bases || []).some((b) => Math.abs(x - b.x) < BASE_W / 2 + 3 * T + 2 && Math.abs(y - b.y) < BASE_H / 2 + DOOR_CLEAR + 2);
    for (let y = 0; y < H; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x, cls = w.terrain[i];
        if ((w.map[i] !== DIRT && w.map[i] !== EMPTY) || w.scar[i] || nearBase(x, y)) continue;
        if (cls === CLASS.marsh) { w.map[i] = WATER; changed(i); } else if (cls === CLASS.normal) { w.terrain[i] = CLASS.marsh; w.map[i] = DIRT; changed(i); }
      }
    }
  }
  else if (change.type === 'reclass') {
    const from = new Set(change.from.map((n) => CLASS[n])), to = CLASS[change.to];
    for (let i = 0; i < w.map.length; i++) {
      if (!from.has(w.terrain[i]) || (w.map[i] !== DIRT && w.map[i] !== EMPTY && w.map[i] !== VEG)) continue;
      w.terrain[i] = to;
      if (!change.keepTracks && !w.scar[i] && w.map[i] === EMPTY) { w.map[i] = DIRT; w.track[i] = 0; }
      if (CLASSES[to].noTunnel && w.map[i] === EMPTY && !w.scar[i]) { w.map[i] = DIRT; w.track[i] = 0; }
      if (onChange) onChange(i % W, (i / W) | 0);
    }
  }
  w.nearWater = null;
}
// Wat de server bij een terreinverandering zelf bepaalt (toeval), voor iedereen hetzelfde
export function terrainChangeExtra(w, change, bases, stage = 1) {
  if (change.type === 'thaw') return { pools: pickThawPools(w, bases, change) };
  if (change.type === 'inundate') return { stage, bases: bases.map((b) => ({ x: b.x, y: b.y })) };
  return {};
}

// Alleen zand -> tunnel, dus de volgorde van graven maakt niet uit:
// server en clients komen altijd op dezelfde kaart uit.
// Een verse tunnel krijgt het beginspoor van zijn klasse.
function dig(w, x, y, onDig) {
  if (!inBounds(x, y)) return;
  const i = y * W + x;
  if (w.map[i] !== DIRT) return;
  const cls = CLASSES[w.terrain[i]];
  if (cls.noTunnel) return;
  w.map[i] = EMPTY;
  w.track[i] = cls.track;
  if (onDig) onDig(x, y);
}

export function digTank(w, x, y, dir, onDig) {
  for (const c of MASKS[dir]) dig(w, x + c.x, y + c.y, onDig);
}

// Stervormige krater: een ronde kern met puntige stralen het zand in.
// De vorm hangt alleen af van (x, y, r), dus iedereen graaft exact hetzelfde.
export function digStar(w, cx, cy, r, onDig) {
  if (!r) return;
  const rnd = mulberry32(((cx * 73856093) ^ (cy * 19349663) ^ (r * 83492791)) >>> 0);
  const core = r * 0.38;
  const n = 8 + Math.round(r * 1.1);
  const spikes = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + (rnd() - 0.5) * 0.7) / n) * Math.PI * 2;
    spikes.push({ c: Math.cos(a), s: Math.sin(a), len: r * (0.5 + rnd() * 0.5) });
  }
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      let hit = Math.hypot(x, y) <= core + 0.5;
      for (let k = 0; !hit && k < n; k++) {
        const sp = spikes[k];
        const along = x * sp.c + y * sp.s;
        if (along <= 0 || along > sp.len) continue;
        const perp = Math.abs(-x * sp.s + y * sp.c);
        hit = perp <= 1.4 * (1 - along / sp.len) + 0.4; // taps toe naar de punt
      }
      if (hit) dig(w, cx + x, cy + y, onDig);
    }
  }
}
