// Kaartmaker volgens SPEC-blitzkrieg §6, voor kaarten met features in de configuratie.
// Volgorde: bases eerst (willekeurig, met beschermde zone), dan de vaste kenmerken (dorpen,
// rivieren, wegen met bruggen), dan het terrein invullen tot de percentages, en controleren.
// Alles is deterministisch uit de seed: server en clients maken dezelfde kaart.
// (Wordt aangeroepen vanuit game.js; gebruik hier geen game.js-waarden buiten functies.)
import {
  W, H, T, EMPTY as EMPTY_CELL, DIRT, ROCK, WATER, VEG, BUILDING, WALL, CLASS, CLASSES, VEGETATION, BUILDING_HP,
  BASE_W, BASE_H, DOOR_CLEAR, ICE_BW, ICE_BH, MAP_SIZES, sizeDims, inBounds, mulberry32, makeNoise, makeBorder,
  drawBases, connectBases, ensureThawRoute, addMines, indexVeg, applyTerrainChange,
} from './game.js';
import { VIEW_CELLS } from './config.js';
import { terrainChangesAt } from './weather.js';

const ATTEMPTS = 8; // zo vaak opnieuw als de percentages niet binnen de marge komen
export const MARGIN = 3; // procentpunt (§6.1)
// Extra marge van een kaart (procentpunt): een getal, of per kaartgrootte { klein: 12, default: 8 }
export const toleranceOf = (rules) => typeof rules.tolerance === 'object' ? rules.tolerance[sizeName()] ?? rules.tolerance.default ?? 0 : rules.tolerance || 0;

export function generateFeatureMap(seed, rules, players) {
  let best = null;
  // (ligt bij de beste poging nog een rivier of dorp verkeerd, dan nog een paar keer extra)
  // (passen de bases bij één poging niet, dan de volgende; BASES alleen als het nooit lukt)
  let error = null;
  for (let attempt = 0; attempt < ATTEMPTS || (attempt < 3 * ATTEMPTS && (!best || best.deviation >= 100)); attempt++) {
    let m;
    try { m = tryMap((seed + attempt * 0x9e3779b1) >>> 0, rules, players); } catch (err) { if (err.message !== 'BASES') throw err; error = err; continue; }
    if (!best || m.deviation < best.deviation) best = m;
    if (m.deviation <= MARGIN + m.overshoot + toleranceOf(rules)) break; // beter kan niet (zie unavoidable in tryMap)
  }
  if (!best) throw error;
  return best;
}

// Aandeel van elke categorie in procenten van het speelbare deel (zonder de rotsrand en de bases):
// rock, water, vegetation, building, en per terreinklasse de rest.
export function terrainShares(w) {
  const count = {};
  let total = 0;
  for (let i = 0; i < w.map.length; i++) {
    if (w.border?.[i]) continue;
    const v = w.map[i];
    if (v >= WALL) continue;
    const cat = v === ROCK ? 'rock' : v === WATER ? 'water' : v === VEG ? 'vegetation' : v === BUILDING ? 'building' : CLASSES[w.terrain[i]].name;
    count[cat] = (count[cat] || 0) + 1;
    total++;
  }
  const out = {};
  for (const k in count) out[k] = (count[k] * 100) / total;
  return out;
}
const deviationOf = (shares, pct) => Math.max(0, ...Object.entries(pct).map(([k, p]) => Math.abs((shares[k] || 0) - p)));

function tryMap(seed, rules, players) {
  const rnd = mulberry32(seed), noise = makeNoise(seed ^ 0x5bd1e995);
  const N = W * H;
  const map = new Uint8Array(N).fill(DIRT);
  // in een stad mag de rest ook verhard worden (pleinen), anders alleen via wegen
  const city = (rules.features || []).some((f) => f.type === 'city');
  const groundClasses = Object.keys(rules.terrainPercent).filter((k) => CLASS[k] !== undefined && (k !== 'paved' || city));
  const terrain = new Uint8Array(N).fill(CLASS[groundClasses.find((k) => k !== 'paved')] ?? 0);
  const veg = new Uint16Array(N);
  const vegHp = [];
  const fixedClass = new Uint8Array(N); // 1 = klasse gezet door een kenmerk (weg, ijs, dijk, ...)
  const isBorder = makeBorder(map, noise);
  const border = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (map[i] === ROCK) border[i] = 1;
  const features = rules.features || [];
  const of = (type) => features.filter((f) => f.type === type);
  const pt = (f) => [Math.round(f[0] * (W - 1)), Math.round(f[1] * (H - 1))];
  const size = sizeName();
  const perSize = (v) => (typeof v === 'object' && v ? v[size] ?? v.middel : v);

  // ---------- 1. Bases (§6.2) ----------
  const villages = of('village').map((f) => villageRect(f, rnd));
  const parks = of('park').map((f) => villageRect(f, rnd));
  const rivers = of('river');
  const bases = placeBases(players, rnd, isBorder, [...villages, ...parks], rivers, pt, rules); // niet in een dorp of park
  const zone = protectedZone(bases);

  // ---------- 2. Vaste kenmerken ----------
  // het dorp zelf (een ellips in het dorpsvak): daar geen bos, rotsen of plassen
  const villageMask = new Uint8Array(N);
  for (const v of villages) {
    const rx = (v.x1 - v.x0) * 0.42, ry = (v.y1 - v.y0) * 0.42;
    for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) if (inBounds(x, y) && ((x - v.cx) / rx) ** 2 + ((y - v.cy) / ry) ** 2 <= 1) villageMask[y * W + x] = 1;
  }
  const setClass = (i, cls) => { map[i] = DIRT; terrain[i] = CLASS[cls]; fixedClass[i] = 1; };
  const setPaved = (i) => setClass(i, 'paved');
  const open = (i) => !border[i] && !zone[i];
  // gebieden met een eigen terreinmix (vallei, heuvel, moeras, ...)
  const areas = of('area').map((f) => ({ f, x0: Math.round(f.rect[0] * W), y0: Math.round(f.rect[1] * H), x1: Math.round(f.rect[2] * W), y1: Math.round(f.rect[3] * H) }));
  const areaOf = (name) => areas.find((a) => a.f.name === name);
  const inArea = (a, i) => { const x = i % W, y = (i / W) | 0; return x >= a.x0 && x < a.x1 && y >= a.y0 && y < a.y1; };
  // dorpsplein
  for (const v of villages) if (v.f.layout !== 'row') disk(v.cx, v.cy, 1.6 * T, (i) => { if (open(i)) setPaved(i); });
  // zee langs een rand, met een golvende kust
  for (const f of of('sea')) {
    for (let x = 0; x < W; x++) {
      const depth = Math.round(f.depth * H + (noise(x / 40, 777) - 0.5) * 10 + (noise(x / 9, 778) - 0.5) * 3);
      for (let y = 0; y < depth; y++) { const i = (f.side === 'south' ? H - 1 - y : y) * W + x; if (!zone[i]) map[i] = WATER; }
    }
  }
  // rivieren, beken en kanalen (buigen om de beschermde zones heen)
  const riverCells = [];
  rivers.forEach((f, k) => {
    const width = f.width * T, half = width / 2;
    const path = routePath(pt(f.from), pt(f.to), zone, half + 2 + (f.dikes ? (f.dikes.floodplain + f.dikes.width) * T : 0), noise, 300 + k, f.wiggle ?? 0.12);
    const mine = [];
    stroke(path, half, (i) => {
      if (border[i] || zone[i] || villageMask[i]) return;
      if (f.frozen) setClass(i, 'ice'); else { map[i] = WATER; fixedClass[i] = 1; }
      mine.push(i);
    });
    // steile oever (rots) aan één kant, met openingen (Leningrad)
    if (f.bank) {
      const gaps = spread(rnd, f.bank.openings, 0.08, 0.92);
      const sgn = f.bank.side === 'north' ? -1 : 1, th = Math.max(1, Math.round(f.bank.thickness * T));
      for (const [px, py] of densify(path)) {
        const u = px / W;
        if (gaps.some((g) => Math.abs(u - g) * W < (f.bank.openingWidth * T) / 2)) continue;
        for (let d = Math.ceil(half) + 1; d <= Math.ceil(half) + th; d++) {
          const i = Math.round(py + sgn * d) * W + Math.round(px);
          if (inBounds(Math.round(px), Math.round(py + sgn * d)) && open(i) && map[i] === DIRT && !fixedClass[i]) map[i] = ROCK;
        }
      }
    }
    // dijken langs beide oevers met uiterwaarden ertussen (Market Garden)
    if (f.dikes) {
      const fp = f.dikes.floodplain * T, dw = f.dikes.width * T;
      for (const [px, py] of densify(path)) {
        for (const sgn of [-1, 1]) {
          for (let d = Math.ceil(half) + 1; d <= half + fp + dw; d++) {
            const x = Math.round(px), y = Math.round(py + sgn * d), i = y * W + x;
            if (!inBounds(x, y) || !open(i) || map[i] !== DIRT || fixedClass[i]) continue;
            setClass(i, d <= half + fp ? 'marsh' : 'hard');
          }
        }
      }
    }
    // wakken in het ijs
    for (let n = 0; n < (f.holes || 0); n++) {
      const p = path[Math.floor(path.length * (0.15 + rnd() * 0.7))], r = T * (2 + rnd()); // ~2% van de kaart
      disk(p[0], p[1] + (rnd() - 0.5) * half, r, (i) => { if (terrain[i] === CLASS.ice && map[i] === DIRT) map[i] = WATER; });
    }
    riverCells.push({ f, path, cells: mine });
  });
  // rotsruggen en ravijnen: een lijn van rots met openingen (balka's, steile helling)
  of('ridge').forEach((f, k) => {
    const path = routePath(pt(f.from), pt(f.to), zone, (f.width * T) / 2 + 2, noise, 500 + k, f.wiggle ?? 0.3);
    const pts = densify(path), gaps = spread(rnd, f.openings || 0, 0.1, 0.9).map((g) => Math.floor(g * pts.length));
    pts.forEach(([px, py], s) => {
      if (gaps.some((g) => Math.abs(s - g) < ((f.openingWidth || 3) * T) / 2)) return;
      disk(px, py, (f.width * T) / 2, (i) => { if (open(i) && map[i] === DIRT && !fixedClass[i]) map[i] = ROCK; });
    });
  });
  // stad (Berlijn): straten in een raster, huizenblokken ertussen; parken blijven open
  const parkMask = new Uint8Array(N);
  for (const p of parks) for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (inBounds(x, y)) parkMask[y * W + x] = 1;
  const blocks = [];
  for (const f of of('city')) {
    const street = f.street * T, [bmin, bmax] = f.block;
    const lines = (len) => { const out = []; for (let p = 4; p < len; p += street + Math.round((bmin + rnd() * (bmax - bmin)) * T)) out.push(p); return out; };
    const xs = lines(W), ys = lines(H);
    for (const x0 of xs) for (let y = 0; y < H; y++) for (let x = x0; x < x0 + street; x++) { const i = y * W + x; if (inBounds(x, y) && open(i) && map[i] === DIRT && !parkMask[i]) setPaved(i); }
    for (const y0 of ys) for (let x = 0; x < W; x++) for (let y = y0; y < y0 + street; y++) { const i = y * W + x; if (inBounds(x, y) && open(i) && map[i] === DIRT && !parkMask[i]) setPaved(i); }
    for (let a = 0; a < xs.length; a++) for (let b = 0; b < ys.length; b++) {
      const bx0 = xs[a] + street, by0 = ys[b] + street, bx1 = (xs[a + 1] ?? W) - 1, by1 = (ys[b + 1] ?? H) - 1;
      if (bx1 - bx0 > T && by1 - by0 > T) blocks.push([bx0, by0, bx1, by1]);
    }
  }
  // wegen (en loopgraven: zigzag); over water komt een brug van minstens 3 T breed
  const bridgeCells = new Uint8Array(N);
  const bridgeAt = (i) => {
    bridgeCells[i] = 1;
    disk(i % W, (i / W) | 0, 1.5 * T, (j) => { if (map[j] === WATER || (terrain[j] === CLASS.ice && fixedClass[j])) { setPaved(j); bridgeCells[j] = 1; } });
  };
  of('road').forEach((f, k) => {
    const width = f.width * T;
    let path = routePath(pt(f.from), pt(f.to), zone, width / 2 + 1 + (f.zigzag || 0) * T, noise, 700 + k, 0.1);
    if (f.zigzag) path = zigzag(densify(path), f.zigzag * T, 6 * T);
    stroke(path, width / 2, (i) => {
      if (!open(i)) return;
      if (map[i] === WATER || (terrain[i] === CLASS.ice && fixedClass[i])) { if (f.bridges === false) return; bridgeAt(i); }
      if (map[i] === BUILDING) return;
      setClass(i, f.class || 'paved');
    });
  });
  // vaste aantallen bruggen zonder weg (Berlijn: de stad heeft anders bij elke straat een brug)
  for (const r of riverCells) {
    if (typeof r.f.bridges !== 'number') continue;
    const have = components(bridgeCells).filter((b) => r.cells.some((c) => b.x0 <= c % W && c % W <= b.x1 && b.y0 <= ((c / W) | 0) && ((c / W) | 0) <= b.y1)).length;
    const pts = densify(r.path);
    for (const g of spread(rnd, Math.max(0, r.f.bridges - have), 0.15, 0.85)) {
      const s = Math.floor(g * pts.length), [px, py] = pts[s], [qx, qy] = pts[Math.min(pts.length - 1, s + 3)];
      const dx = qx - px, dy = qy - py, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, reach = r.f.width * T / 2 + 2 * T;
      stroke([[px - nx * reach, py - ny * reach], [px + nx * reach, py + ny * reach]], 1.5 * T, (i) => {
        if (!open(i)) return;
        if (map[i] === WATER) { setPaved(i); bridgeCells[i] = 1; } else if (map[i] === DIRT && rules.features.some((f) => f.type === 'city')) setPaved(i);
      });
    }
  }
  // Wegen hebben een vaste breedte in T, dus op een grote kaart halen ze het percentage verhard
  // niet: dan komen er zijwegen bij, van de rand naar het dichtstbijzijnde stuk weg.
  const roadWidth = (of('road')[0]?.width || 2) * T;
  if (of('road').length && !of('road').every((f) => f.zigzag)) {
    let P0 = 0, paved = 0;
    for (let i = 0; i < N; i++) if (!border[i]) { P0++; if (terrain[i] === CLASS.paved && fixedClass[i]) paved++; }
    const want = (((rules.terrainPercent.paved || 0) - 1) / 100) * P0;
    for (let k = 0; paved < want && k < 12; k++) {
      const side = Math.floor(rnd() * 4), u = 0.1 + rnd() * 0.8;
      const a = pt([[u, 0], [u, 1], [0, u], [1, u]][side]);
      let best = null, bd = Infinity;
      for (let i = 0; i < N; i += 7) {
        if (terrain[i] !== CLASS.paved || !fixedClass[i] || bridgeCells[i]) continue;
        const d = Math.hypot((i % W) - a[0], ((i / W) | 0) - a[1]);
        if (d < bd) { bd = d; best = [i % W, (i / W) | 0]; }
      }
      if (!best || bd < 6 * T) continue;
      stroke(routePath(a, best, zone, roadWidth / 2 + 1, noise, 900 + k, 0.1), roadWidth / 2, (i) => {
        if (!open(i) || map[i] === WATER || map[i] === BUILDING || map[i] === ROCK || (terrain[i] === CLASS.ice && fixedClass[i])) return;
        if (!(terrain[i] === CLASS.paved && fixedClass[i])) paved++;
        setPaved(i);
      });
    }
  }
  // doorwaadbare plekken (3 T lang), niet bij een brug
  for (const r of riverCells) {
    const want = perSize(r.f.fords) || 0;
    for (let n = 0, tries = 0; n < want && tries < 80; tries++) {
      const p = r.path[Math.floor(r.path.length * (0.1 + rnd() * 0.8))];
      let near = false;
      disk(p[0], p[1], 5 * T, (j) => { if (bridgeCells[j] || terrain[j] === CLASS.ford) near = true; });
      if (near) continue;
      disk(p[0], p[1], 1.5 * T + r.f.width * T / 2, (j) => {
        if (map[j] === WATER && Math.hypot((j % W) - p[0], ((j / W) | 0) - p[1]) <= Math.max(1.5 * T, r.f.width * T / 2 + 1)) setClass(j, 'ford');
      });
      n++;
    }
  }
  // sloten in een raster (water, 1 T breed) met dammen van 2 T (Market Garden)
  for (const f of of('ditches')) {
    const [x0, y0, x1, y1] = [f.rect[0] * W, f.rect[1] * H, f.rect[2] * W, f.rect[3] * H].map(Math.round), sp = f.spacing * T;
    const ditch = (x, y, k) => { const i = y * W + x; if (inBounds(x, y) && open(i) && map[i] === DIRT && !fixedClass[i] && k % (f.damsEvery * sp) >= 2 * T) map[i] = WATER; };
    for (let x = x0 + sp; x < x1; x += sp) for (let y = y0; y < y1; y++) for (let d = 0; d < T; d++) ditch(x + d, y, y - y0 + Math.round(x * 7.3));
    for (let y = y0 + sp; y < y1; y += sp) for (let x = x0; x < x1; x++) for (let d = 0; d < T; d++) ditch(x, y + d, x - x0 + Math.round(y * 5.1));
  }
  // dorpen: kerk aan het plein en huizen langs de straten (of een rij boerderijen langs de weg)
  const landmarks = [];
  for (const v of villages) {
    const [lo, hi] = v.f.buildings || [4, 8];
    if (v.f.layout === 'row') { // rij boerderijen langs de weg door het dorp
      const want = lo + Math.floor(rnd() * (hi - lo + 1));
      const bw = Math.round(2.2 * T);
      for (let n = 0, x = Math.round(v.cx - (want * (bw + T)) / 2), tries = 0; n < want && tries < 200 && x < W - bw; tries++, x += 2) {
        const sgn = n % 2 ? 1 : -1; // om en om aan beide kanten van de weg
        // de weg zoeken (hoogstens 20 cellen onder het midden), dan naar de rand ervan
        let y = Math.max(1, v.cy - 40);
        while (y < Math.min(H - 2, v.cy + 40) && terrain[y * W + x] !== CLASS.paved) y++;
        if (terrain[y * W + x] !== CLASS.paved) continue;
        while (y > 0 && y < H - 1 && terrain[y * W + x] === CLASS.paved) y += sgn;
        if (placeBuilding(x, sgn < 0 ? y - 2 * T - 1 : y + 2, bw, 2 * T)) { n++; x += bw + T - 2; }
      }
      continue;
    }
    const streets = countIn(v, (i) => terrain[i] === CLASS.paved && fixedClass[i]) > 2 * Math.PI * (1.6 * T) ** 2;
    if (!streets) { // geen wegen naar dit dorp: zelf straten van 2 T vanaf het plein
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        stroke([[v.cx, v.cy], [Math.round(v.cx + dx * (v.x1 - v.cx)), Math.round(v.cy + dy * (v.y1 - v.cy))]], T, (i) => { if (open(i) && map[i] !== WATER) setPaved(i); });
      }
    }
    // kerk (herkenningspunt) aan een schuine kant van het plein, niet op een straat
    let church = false;
    for (const [sx, sy, off] of [1, 2, 3].flatMap((k) => [[1, -1], [-1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a, b, Math.round(1.6 * T) + 2 + (k - 1) * T]))) {
      if (church) break;
      const x0 = sx > 0 ? v.cx + off : v.cx - off - 2 * T, y0 = sy > 0 ? v.cy + off : v.cy - off - 3 * T;
      if (placeBuilding(x0, y0, 2 * T, 3 * T)) {
        landmarks.push({ kind: v.f.landmark || 'kerk', x: x0 + T, y: y0 + 1.5 * T });
        church = true;
      }
    }
    const want = lo + Math.floor(rnd() * (hi - lo + 1)) - (church ? 1 : 0);
    for (let n = 0, tries = 0; n < want && tries < 600; tries++) {
      const bw = Math.round(T * (1 + rnd())), bh = Math.round(T * (1 + rnd()));
      const x0 = Math.round(v.x0 + rnd() * (v.x1 - v.x0 - bw)), y0 = Math.round(v.y0 + rnd() * (v.y1 - v.y0 - bh));
      if (Math.hypot(x0 + bw / 2 - v.cx, y0 + bh / 2 - v.cy) < 2.5 * T) continue;
      if (!nearPaved(x0, y0, bw, bh, T)) continue; // aan een straat
      if (placeBuilding(x0, y0, bw, bh)) n++;
    }
  }
  function placeBuilding(x0, y0, bw, bh, gap = 2) {
    for (let y = y0 - gap; y < y0 + bh + gap; y++) {
      for (let x = x0 - gap; x < x0 + bw + gap; x++) {
        if (!inBounds(x, y)) return false;
        const i = y * W + x, inside = x >= x0 && x < x0 + bw && y >= y0 && y < y0 + bh;
        if (map[i] === BUILDING || zone[i] || border[i]) return false; // ruimte tussen huizen
        if (inside && (map[i] !== DIRT || terrain[i] === CLASS.paved)) return false;
      }
    }
    const id = vegHp.length + 1;
    vegHp.push(BUILDING_HP);
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) { const i = y * W + x; map[i] = BUILDING; veg[i] = id; terrain[i] = CLASS.soft ?? terrain[i]; fixedClass[i] = 1; }
    return true;
  }
  function nearPaved(x0, y0, bw, bh, d) {
    for (let y = y0 - d; y < y0 + bh + d; y++) {
      for (let x = x0 - d; x < x0 + bw + d; x++) if (inBounds(x, y) && terrain[y * W + x] === CLASS.paved && fixedClass[y * W + x]) return true;
    }
    return false;
  }

  // ---------- 3. Terrein invullen tot de percentages (§6.1 stap 4) ----------
  const pct = rules.terrainPercent;
  let P = 0, featurePaved = 0;
  for (let i = 0; i < N; i++) if (!border[i]) { P++; if (terrain[i] === CLASS.paved && fixedClass[i]) featurePaved++; }
  const target = (k) => ((pct[k] || 0) / 100) * P;
  const have = { rock: 0, water: 0, vegetation: 0, building: 0 };
  for (let i = 0; i < N; i++) {
    if (border[i]) continue;
    if (map[i] === ROCK) have.rock++; else if (map[i] === WATER) have.water++; else if (map[i] === VEG) have.vegetation++; else if (map[i] === BUILDING) have.building++;
  }
  // vrij: hier mag nog iets komen (geen kenmerk, geen dorp, geen beschermde zone)
  const free = (i) => map[i] === DIRT && !fixedClass[i] && !zone[i] && !villageMask[i] && !border[i];
  const freeIn = (name) => { const a = name && areaOf(name); return a ? (i) => free(i) && inArea(a, i) : free; };
  // huizen in de blokken van de stad: per blok een raster van panden met smalle gangetjes,
  // blok voor blok in willekeurige volgorde, tot het percentage gebouwen
  const order = blocks.map((b, k) => [rnd(), k]).sort((a, b) => a[0] - b[0]).map(([, k]) => blocks[k]);
  for (const [bx0, by0, bx1, by1] of order) {
    if (have.building >= target('building')) break;
    // het blok precies verdelen in panden van ~3,5 T met een gangetje van 1 cel ertussen
    const nx = Math.max(1, Math.round((bx1 - bx0 + 1) / (3.5 * T))), ny = Math.max(1, Math.round((by1 - by0 + 1) / (3.5 * T)));
    const lw = Math.floor((bx1 - bx0 + 2) / nx) - 1, lh = Math.floor((by1 - by0 + 2) / ny) - 1;
    for (let y0 = by0; y0 + lh <= by1 + 1; y0 += lh + 1) {
      for (let x0 = bx0; x0 + lw <= bx1 + 1; x0 += lw + 1) {
        if (have.building >= target('building') || rnd() < 0.02) continue; // af en toe een open plek (puin)
        let ok = true;
        for (let y = y0; y < y0 + lh && ok; y++) for (let x = x0; x < x0 + lw && ok; x++) ok = !parkMask[y * W + x];
        if (ok && placeBuilding(x0, y0, lw, lh, 1)) have.building += lw * lh;
      }
    }
  }
  const blobs = (cell, key, want, rMin, rMax, salt, ok) => {
    for (let tries = 0; have[key] < want && tries < 6000; tries++) {
      const cx = Math.floor(rnd() * W), cy = Math.floor(rnd() * H);
      if (!ok(cy * W + cx)) continue;
      const r = rMin + rnd() * (rMax - rMin);
      disk(cx, cy, r * 1.4, (i) => {
        const x = i % W, y = (i / W) | 0;
        if (ok(i) && Math.hypot(x - cx, y - cy) < r * (0.7 + noise(x / 4 + salt, y / 4) * 0.6)) { map[i] = cell; have[key]++; }
      });
    }
  };
  const rk = rules.rocks || {};
  blobs(ROCK, 'rock', target('rock'), (rk.size?.[0] ?? 0.6) * T, (rk.size?.[1] ?? 2) * T, 11, freeIn(rk.in));
  if (!rules.noPonds) blobs(WATER, 'water', target('water'), 0.8 * T, 2 * T, 53, (i) => free(i) && !parkMask[i]);
  const vcfg = rules.vegetation;
  if (vcfg && pct.vegetation) {
    const pattern = vcfg.pattern || (vcfg.type === 'hedge' ? 'hedges' : vcfg.type === 'shrub' ? 'shrubs' : 'forest');
    const kind = { hedges: addHedges, bocage: addBocage, rows: addHedges, shrubs: addShrubs, forest: addForests }[pattern];
    const vfree = vcfg.in === 'park' ? (i) => free(i) && parkMask[i] : freeIn(vcfg.in);
    const a = vcfg.in === 'park' ? parks[0] : vcfg.in && areaOf(vcfg.in);
    kind({ map, terrain, veg, vegHp, rnd, free: vfree, rect: a && [a.x0, a.y0, a.x1, a.y1], target: target('vegetation') - have.vegetation, ground: CLASS[vcfg.groundAfter], hp: VEGETATION[vcfg.type].hp, spacing: vcfg.spacing });
  }
  // de rest: samenhangende vlakken per klasse (ruis); eerst de gebieden met hun eigen mix
  for (const a of areas) fillClasses(map, terrain, fixedClass, border, Object.keys(a.f.classes), a.f.classes, null, seed + 17, (i) => inArea(a, i));
  for (const p of parks) for (let i = 0; i < N; i++) if (parkMask[i] && map[i] === DIRT && !fixedClass[i] && CLASS.normal !== undefined) { terrain[i] = CLASS.normal; fixedClass[i] = 1; }
  fillClasses(map, terrain, fixedClass, border, groundClasses, pct, P, seed);

  // ---------- 4. Bases tekenen, verbinden en objecten ----------
  drawBases(map, veg, bases, isBorder, noise);
  connectBases(map, bases, isBorder);
  ensureWeatherRoutes(map, terrain, bases, isBorder, rules);
  const { fields, mines } = rules.mines ? addMines(map, bases, rnd, Math.max(2, Math.round((8 * W * H) / 100000))) : { fields: [], mines: [] };

  const w = {
    map, terrain, track: new Uint16Array(N), veg, vegHp: Uint8Array.from(vegHp), scar: new Uint8Array(N),
    ice: new Uint8Array(ICE_BW * ICE_BH),
  };
  indexVeg(w);
  const result = {
    ...w, bases, fields, mines, border, landmarks, bridges: components(bridgeCells), zone, rivers: riverCells.map((r) => r.path),
    villages: villages.map((v) => ({ name: v.f.name, x: v.cx, y: v.cy, depot: v.f.depot }))
  };
  // Onvermijdelijke afwijking: kenmerken met een vaste breedte in T (§6.0) schalen niet mee met
  // de kaart. Verhard (wegen; niet in een stad) kan op een kleine kaart te veel zijn, ijs (een
  // bevroren rivier) en water zonder plassen op een grote kaart te weinig. Zoveel procentpunt
  // als die buiten de marge vallen, mogen de andere klassen samen ook afwijken.
  const shares = terrainShares(result);
  const fixedOnly = ['ice', ...(rules.noPonds ? ['water'] : []), ...(city ? [] : ['paved'])].filter((k) => pct[k] !== undefined);
  result.unavoidable = {};
  for (const k of fixedOnly) {
    const off = Math.abs((shares[k] || 0) - pct[k]) - MARGIN;
    if (off > 0) result.unavoidable[k] = off;
  }
  // categorieën zonder percentage (de huizen van een dorp) gaan ook van de andere klassen af
  const unplanned = Object.entries(shares).filter(([k]) => pct[k] === undefined).reduce((a, [, v]) => a + v, 0);
  result.overshoot = Object.values(result.unavoidable).reduce((a, b) => a + b, 0) + unplanned;
  result.deviation = deviationOf(shares, pct) + (misplaced(result, rules) ? 100 : 0);
  return result;
}

// Ligt een rivier of dorp niet op zijn plek (rivier gemiddeld > 8% van de lijn, dorp zonder kerk,
// met te weinig of te veel huizen, of met de huizen buiten het dorpsvak)? Dan telt deze poging als slecht en wint een andere.
function misplaced(w, rules) {
  const feats = rules.features || [];
  const riverOff = feats.filter((f) => f.type === 'river').some((f, k) => {
    const path = w.rivers[k], [ax, ay] = [f.from[0] * W, f.from[1] * H], [bx, by] = [f.to[0] * W, f.to[1] * H], L = Math.hypot(bx - ax, by - ay);
    const off = path.reduce((s, [x, y]) => s + Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / L, 0) / path.length;
    return off / Math.max(W, H) >= (w.bases.riverRelaxed ? 0.18 : 0.08);
  });
  if (riverOff) return true; // (bij krap geplaatste bases mag de rivier wat verder om de basis heen buigen)
  for (const f of feats.filter((g) => g.type === 'village')) {
    if (f.landmark && !w.landmarks.length) return true;
    let n = 0, sx = 0, sy = 0;
    for (const cells of w.vegCells) {
      if (!cells.length || w.map[cells[0]] !== BUILDING) continue;
      n++; sx += cells[0] % W; sy += (cells[0] / W) | 0;
    }
    const r = Math.sqrt(f.size) / 2, [lo, hi] = f.buildings || [0, Infinity];
    if (n < lo || n > hi || Math.abs(sx / n / W - f.at[0]) >= r || Math.abs(sy / n / H - f.at[1]) >= r) return true;
  }
  return false;
}

// Welke kaartgrootte is dit (uit de huidige W)?
function sizeName() {
  let best = 'middel', bd = Infinity;
  for (const k of Object.keys(MAP_SIZES)) { const d = Math.abs(sizeDims(k).w - W); if (d < bd) { bd = d; best = k; } }
  return best;
}
// n punten verspreid tussen a en b (fracties), met wat toeval maar niet op elkaar
function spread(rnd, n, a, b) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(a + ((k + 0.25 + rnd() * 0.5) / n) * (b - a));
  return out;
}
// punten om de cel (een route uit routePath heeft punten om de 4 cellen)
function densify(path) {
  const out = [];
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, ay] = path[k], [bx, by] = path[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let s = 0; s < n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  out.push(path[path.length - 1]);
  return out;
}
// zigzag: punten opzij schuiven in een zaagtand (loopgraven)
function zigzag(pts, amp, period) {
  return pts.map(([x, y], s) => {
    const [qx, qy] = pts[Math.min(pts.length - 1, s + 2)], [px, py] = pts[Math.max(0, s - 2)];
    const dx = qx - px, dy = qy - py, L = Math.hypot(dx, dy) || 1, off = (Math.abs(((s / period) % 2) - 1) - 0.5) * 2 * amp;
    return [x - (dy / L) * off, y + (dx / L) * off];
  });
}

// Weer dat het terrein verandert (dooi, modder, overstroming): ook daarna moeten de bases elkaar
// kunnen bereiken. Op een kopie alle veranderingen doen; lukt het niet, dan wordt de doorgang
// die connectBases graaft een dam van harde grond.
function ensureWeatherRoutes(map, terrain, bases, isBorder, rules) {
  ensureThawRoute(map, terrain, bases, isBorder);
  // alle rondes nadoen (de inundatie stijgt elke ronde verder); de dooi doet ensureThawRoute
  const w = { map: map.slice(), terrain: terrain.slice(), track: new Uint16Array(map.length), scar: new Uint8Array(map.length), veg: new Uint16Array(map.length) };
  let any = false;
  for (let round = 2; round <= 8; round++) {
    for (const { change, stage } of terrainChangesAt(rules, round)) {
      if (change.type === 'thaw') continue;
      applyTerrainChange(w, change, { stage, bases });
      any = true;
    }
  }
  if (!any) return;
  const before = w.map.slice();
  connectBases(w.map, bases, isBorder);
  for (let i = 0; i < map.length; i++) {
    if (w.map[i] === before[i]) continue;
    if (map[i] === ROCK || map[i] === WATER) map[i] = DIRT;
    if (CLASS.hard !== undefined) terrain[i] = CLASS.hard; // dam die niet verandert
  }
}

// ---------- Bases ----------
// Willekeurig, minstens 3 T van de rand, niet op een dorp of rivier, en zo ver uit elkaar dat
// je vanuit je basis (of 3 T eromheen) geen andere basis in je venster ziet (VIEW_CELLS).
function placeBases(n, rnd, isBorder, villages, rivers, pt, rules) {
  const hw = BASE_W >> 1, hh = BASE_H >> 1, pad = 3 * T;
  const mx = hw + pad + 14, my = hh + pad + 4; // rand van rots tot 13 dik
  const sepX = BASE_W + pad + VIEW_CELLS.w / 2, sepY = BASE_H + pad + VIEW_CELLS.h / 2;
  const blocked = (x, y, k = 1, kr = 1) => {
    // de hele rand van basis + 3 T (en de deurstroken) moet vrij van de rotsrand zijn
    for (let px = x - hw - pad; px <= x + hw + pad; px++) if (isBorder(px, y - hh - pad) || isBorder(px, y + hh + pad)) return true;
    for (let py = y - hh - pad; py <= y + hh + pad; py++) if (isBorder(x - hw - pad, py) || isBorder(x + hw + pad, py)) return true;
    // uitrijstroken: liefst de hele trechter vrij van de rotsrand, in krappe gevallen 3 T (de spec)
    const strip = kr >= 0.6 ? DOOR_CLEAR : pad;
    for (let px = x - 8; px <= x + 8; px += 2) if (isBorder(px, y - hh - strip - 1) || isBorder(px, y + hh + strip + 1)) return true;
    if (villages.some((v) => x + hw + pad > v.x0 && x - hw - pad < v.x1 && y + hh + DOOR_CLEAR > v.y0 && y - hh - DOOR_CLEAR < v.y1)) return true;
    for (const f of rivers) { // afstand tot de rechte lijn van de rivier (plus dijken)
      const [ax, ay] = pt(f.from), [bx, by] = pt(f.to), L = Math.hypot(bx - ax, by - ay);
      const d = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / L;
      const extra = f.dikes ? (f.dikes.floodplain + f.dikes.width) * T : f.bank ? f.bank.thickness * T : 0;
      if (d < f.width * T / 2 + extra + (Math.max(hw, hh) + pad + 4) * kr) return true; // basis + 3 T + deurstrook vrij (de rivier buigt verder om de zone heen)
    }
    for (const f of (rules.features || []).filter((g) => g.type === 'sea')) { // niet in of vlak bij de zee
      const depth = f.depth * H + 12;
      if (f.side === 'south' ? y + hh + DOOR_CLEAR > H - depth - pad : y - hh - DOOR_CLEAR < depth + pad) return true;
    }
    return false;
  };
  // §10.7: bases verdeeld over beide kanten van een rivier (om en om)
  const across = rules.basesAcross !== undefined ? rivers[rules.basesAcross] : null;
  const sideOk = (i, y) => {
    if (!across) return true;
    const ry = pt(across.from)[1];
    return i % 2 === 0 ? y < ry : y > ry;
  };
  for (let relax = 0; relax < 11; relax++) {
    // lukt het niet, dan iets minder streng (en dat melden): eerst de afstand tussen de bases,
    // pas daarna die tot de rivier (anders moet de rivier ver om de basis heen buigen)
    const k = Math.max(0.3, 1 - relax * 0.1), kr = relax < 4 ? 1 : 1 - (relax - 3) * 0.1;
    for (let restart = 0; restart < 20; restart++) {
      const bases = [];
      for (let i = 0; i < n; i++) {
        let ok = false;
        for (let tries = 0; tries < 50 && !ok; tries++) {
          const x = Math.round(mx + rnd() * (W - 2 * mx)), y = Math.round(my + rnd() * (H - 2 * my));
          if (blocked(x, y, k, kr) || !sideOk(i, y)) continue;
          if (bases.some((b) => Math.abs(b.x - x) < sepX * k && Math.abs(b.y - y) < sepY * k)) continue;
          bases.push({ x, y });
          ok = true;
        }
        if (!ok) break;
      }
      if (bases.length === n) { if (relax) { bases.relaxed = k; bases.riverRelaxed = kr < 1; bases.doorRelaxed = kr < 0.6; } return bases; }
    }
  }
  throw new Error('BASES'); // te veel spelers voor deze kaartgrootte
}

// Beschermde zone (§6.1): de basis plus 3 T, en de vrije stroken voor de deuren
function protectedZone(bases) {
  const zone = new Uint8Array(W * H), hw = BASE_W >> 1, hh = BASE_H >> 1, pad = 3 * T;
  for (const b of bases) {
    for (let y = b.y - hh - pad; y <= b.y + hh + pad; y++) for (let x = b.x - hw - pad; x <= b.x + hw + pad; x++) if (inBounds(x, y)) zone[y * W + x] = 1;
    for (let y = b.y - hh - DOOR_CLEAR - 2; y <= b.y + hh + DOOR_CLEAR + 2; y++) {
      for (let x = b.x - 2 * T; x <= b.x + 2 * T; x++) if (inBounds(x, y)) zone[y * W + x] = 1;
    }
  }
  return zone;
}

// ---------- Kenmerken ----------
function villageRect(f, rnd) {
  const cx = Math.round((f.at[0] + (rnd() - 0.5) * 0.04) * (W - 1)), cy = Math.round((f.at[1] + (rnd() - 0.5) * 0.04) * (H - 1));
  const hx = Math.round((Math.sqrt(f.size) * W) / 2), hy = Math.round((Math.sqrt(f.size) * H) / 2);
  return { f, cx, cy, x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy };
}
function countIn(v, test) {
  let n = 0;
  for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) if (inBounds(x, y) && test(y * W + x)) n++;
  return n;
}

// Route van a naar b over een grof rooster (4 cellen), om de beschermde zone heen (met marge),
// met een beetje ruis zodat hij natuurlijk slingert. Geeft punten in cellen.
function routePath(a, b, zone, margin, noise, salt, wiggle) {
  const C = 4, gw = Math.ceil(W / C), gh = Math.ceil(H / C), M = Math.ceil(margin / C);
  const blocked = new Uint8Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (zone[y * W + x]) {
    const gx = (x / C) | 0, gy = (y / C) | 0;
    for (let j = -M; j <= M; j++) for (let i = -M; i <= M; i++) {
      const nx = gx + i, ny = gy + j;
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) blocked[ny * gw + nx] = 1;
    }
  }
  const node = ([x, y]) => Math.min(gh - 1, Math.max(0, (y / C) | 0)) * gw + Math.min(gw - 1, Math.max(0, (x / C) | 0));
  const s = node(a), g = node(b);
  blocked[s] = blocked[g] = 0;
  const dist = new Float64Array(gw * gh).fill(Infinity), prev = new Int32Array(gw * gh).fill(-1);
  const heap = [[0, s]];
  dist[s] = 0;
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [d, i] = pop();
    if (i === g) break;
    if (d > dist[i]) continue;
    const x = i % gw, y = (i / gw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const ni = ny * gw + nx;
      if (blocked[ni]) continue;
      const step = (dx && dy ? Math.SQRT2 : 1) * (1 + noise(nx / 7 + salt, ny / 7) * wiggle * 4);
      if (d + step < dist[ni]) { dist[ni] = d + step; prev[ni] = i; push(d + step, ni); }
    }
  }
  const pts = [];
  for (let i = g; i >= 0; i = prev[i]) pts.push([(i % gw) * C + C / 2, ((i / gw) | 0) * C + C / 2]);
  if (pts.length < 2) return [a, b];
  pts.reverse();
  pts[0] = a; pts[pts.length - 1] = b;
  // gladstrijken
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 1; k < pts.length - 1; k++) pts[k] = [(pts[k - 1][0] + pts[k][0] * 2 + pts[k + 1][0]) / 4, (pts[k - 1][1] + pts[k][1] * 2 + pts[k + 1][1]) / 4];
  }
  return pts;
}

// Alle cellen binnen r van de lijn door de punten
function stroke(pts, r, fn) {
  const seen = new Uint8Array(W * H);
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let s = 0; s <= n; s++) disk(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n, r, (i) => { if (!seen[i]) { seen[i] = 1; fn(i); } });
  }
}
function disk(cx, cy, r, fn) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (inBounds(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) fn(y * W + x);
    }
  }
}
function components(mask) {
  const seen = new Uint8Array(W * H), out = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < mask.length && mask[j] && !seen[j]) { seen[j] = 1; q.push(j); }
    }
    out.push({ x0, y0, x1, y1, cells: q.length, list: q });
  }
  return out;
}

// ---------- Begroeiing (§5.3) ----------
// Bos (den, loofboom, berk): slingerende stroken van 1 tot 5 T breed die elkaar niet raken
// en niet over zichzelf heen vouwen. Elk vak van 1 T is één boom (eigen treffers).
function addForests(o) {
  const { map, rnd, free } = o;
  const forest = new Int32Array(W * H); // bosnummer per cel
  let placed = 0, fid = 0;
  const [rx0, ry0, rx1, ry1] = o.rect || [0, 0, W, H]; // begin binnen het gebied (heuvel, park)
  for (let tries = 0; placed < o.target && tries < 40000; tries++) {
    let x = rx0 + rnd() * (rx1 - rx0), y = ry0 + rnd() * (ry1 - ry0), ang = rnd() * Math.PI * 2, r = T * (0.6 + rnd() * 1.6);
    if (!free(Math.floor(y) * W + Math.floor(x))) continue;
    fid++;
    const stamps = [], steps = 10 + Math.floor(rnd() * 60);
    for (let s = 0; s < steps && placed < o.target; s++) {
      // past het hele rondje hier? vrij, en geen ander bos binnen 2 cellen (losse bossen)
      let ok = true;
      disk(x, y, r + 2, (i) => {
        if (!ok) return;
        const inner = (i % W - x) ** 2 + (((i / W) | 0) - y) ** 2 <= r * r;
        if (forest[i] && forest[i] !== fid) ok = false;
        else if (inner && !forest[i] && !free(i)) ok = false;
      });
      if (!ok || stamps.some((p, k) => k < stamps.length - 2 && Math.hypot(p[0] - x, p[1] - y) < p[2] + r)) break; // niet vouwen
      disk(x, y, r, (i) => { if (!forest[i]) { forest[i] = fid; placed++; } });
      stamps.push([x, y, r]);
      ang += (rnd() - 0.5) * 0.5;
      r = Math.min(2.5 * T, Math.max(0.6 * T, r + (rnd() - 0.5) * 2));
      x += Math.cos(ang) * r * 0.8; y += Math.sin(ang) * r * 0.8;
    }
  }
  plantBlocks(o, (i) => forest[i] > 0);
}
// Heggen: precies 1 T breed, lange rechte lijnen met hoeken en af en toe een gat van 2 T
function addHedges(o) {
  const { rnd, free } = o;
  const hedge = new Uint8Array(W * H);
  let placed = 0;
  for (let tries = 0; placed < o.target && tries < 3000; tries++) {
    let x = Math.floor(rnd() * W / T) * T, y = Math.floor(rnd() * H / T) * T;
    let [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
    for (let leg = 0; leg < 3; leg++) {
      const len = 4 + Math.floor(rnd() * 14);
      for (let s = 0; s < len; s++, x += dx * T, y += dy * T) {
        if (rnd() < 0.08) { x += dx * T; y += dy * T; s++; continue; } // gat van 2 T
        let ok = true;
        for (let j = 0; j < T && ok; j++) for (let i = 0; i < T && ok; i++) ok = inBounds(x + i, y + j) && free((y + j) * W + x + i);
        if (!ok) { s = len; leg = 3; break; }
        for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { hedge[(y + j) * W + x + i] = 1; placed++; }
      }
      [dx, dy] = rnd() < 0.5 ? [dy, -dx] : [-dy, dx]; // hoek van 90 graden
    }
  }
  plantBlocks(o, (i) => hedge[i] === 1);
}
// Bocage (Carentan): een raster van heggen van 1 T rond kleine weilanden, met gaten van 2 T
function addBocage(o) {
  const { rnd, free } = o, sp = (o.spacing || 7) * T;
  const hedge = new Uint8Array(W * H);
  const ox = Math.floor(rnd() * sp), oy = Math.floor(rnd() * sp);
  const line = (horiz, c) => {
    let gapLeft = 0;
    for (let s = 0; s < (horiz ? W : H); s++) {
      if (gapLeft > 0) { gapLeft--; continue; }
      if (s % T === 0 && rnd() < 0.06) { gapLeft = 2 * T - 1; continue; } // gat van 2 T
      for (let d = 0; d < T; d++) {
        const x = horiz ? s : c + d, y = horiz ? c + d : s, i = y * W + x;
        if (inBounds(x, y) && free(i)) hedge[i] = 1;
      }
    }
  };
  for (let y = oy; y < H; y += sp + Math.floor(rnd() * 2 * T)) line(true, y);
  for (let x = ox; x < W; x += sp + Math.floor(rnd() * 2 * T)) line(false, x);
  // niet meer dan het percentage: lijnstukken weghalen tot het klopt
  let n = hedge.reduce((a, v) => a + v, 0);
  for (let tries = 0; n > o.target * 1.02 && tries < 20000; tries++) {
    const i = Math.floor(rnd() * W * H);
    if (!hedge[i]) continue;
    const bx = Math.floor((i % W) / T) * T, by = Math.floor(((i / W) | 0) / T) * T;
    for (let y = by; y < by + T; y++) for (let x = bx; x < bx + T; x++) if (inBounds(x, y) && hedge[y * W + x]) { hedge[y * W + x] = 0; n--; }
  }
  plantBlocks(o, (i) => hedge[i] === 1);
}

// Struiken: groepjes van 1 tot 3 struiken van 1 T, samen hoogstens 3 T groot
function addShrubs(o) {
  const { rnd, free } = o;
  const shrub = new Uint8Array(W * H);
  let placed = 0;
  for (let tries = 0; placed < o.target && tries < 6000; tries++) {
    const gx = Math.floor(rnd() * W / T) * T, gy = Math.floor(rnd() * H / T) * T, n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const x = gx + (k === 1 ? T : 0), y = gy + (k === 2 ? T : 0);
      let ok = true;
      for (let j = -T; j < 2 * T && ok; j++) for (let i = -T; i < 2 * T && ok; i++) {
        const inside = i >= 0 && i < T && j >= 0 && j < T;
        ok = inBounds(x + i, y + j) && (inside ? free((y + j) * W + x + i) : !shrub[(y + j) * W + x + i] || (Math.abs(x + i - gx) < 2 * T && Math.abs(y + j - gy) < 2 * T));
      }
      if (!ok) continue;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if ((i - T / 2 + 0.5) ** 2 + (j - T / 2 + 0.5) ** 2 <= (T / 2) ** 2 + 1) { shrub[(y + j) * W + x + i] = 1; placed++; }
    }
  }
  plantBlocks(o, (i) => shrub[i] === 1);
}
// Planten maken: elk vak van T x T cellen binnen de vorm is één plant
function plantBlocks(o, inShape) {
  const ids = new Map();
  for (let i = 0; i < W * H; i++) {
    if (!inShape(i)) continue;
    const key = (((i / W) | 0) / T | 0) * 10000 + ((i % W) / T | 0);
    let id = ids.get(key);
    if (!id) { o.vegHp.push(o.hp); id = o.vegHp.length; ids.set(key, id); }
    o.map[i] = VEG; o.veg[i] = id; o.terrain[i] = o.ground;
  }
}

// ---------- Klassen ----------
// De overgebleven cellen krijgen een klasse via ruis (samenhangende vlakken), met grenzen zo
// gekozen dat elke klasse zijn percentage haalt (plus wat kenmerken al aan die klasse gaven).
// Met inside (een gebied): alleen die cellen, verdeeld naar de verhoudingen in pct (P = null);
// ze krijgen een vaste klasse, zodat de verdeling over de rest van de kaart ze meetelt.
function fillClasses(map, terrain, fixedClass, border, classes, pct, P, seed, inside) {
  const noise = makeNoise(seed ^ 0x27d4eb2f);
  const open = [];
  const have = {};
  for (let i = 0; i < map.length; i++) {
    if (border[i] || map[i] >= WALL || (inside && !inside(i))) continue;
    if (map[i] === DIRT && !fixedClass[i]) { open.push(i); continue; }
    if (map[i] === DIRT || map[i] === EMPTY_CELL) { const n = CLASSES[terrain[i]].name; have[n] = (have[n] || 0) + 1; }
  }
  const sum = classes.reduce((a, k) => a + (pct[k] || 0), 0) || 1;
  const want = classes.map((k) => (P === null ? ((pct[k] || 0) / sum) * open.length : Math.max(0, ((pct[k] || 0) / 100) * P - (have[k] || 0))));
  const total = want.reduce((a, b) => a + b, 0) || 1;
  const val = open.map((i) => { const x = i % W, y = (i / W) | 0; return noise(x / 22, y / 22) * 0.75 + noise(x / 7 + 50, y / 7) * 0.25; });
  const order = open.map((_, k) => k).sort((a, b) => val[a] - val[b]);
  let k = 0, acc = 0;
  for (let c = 0; c < classes.length; c++) {
    acc += want[c];
    const end = c === classes.length - 1 ? order.length : Math.round((acc / total) * order.length);
    for (; k < end; k++) { terrain[open[order[k]]] = CLASS[classes[c]]; if (inside) fixedClass[open[order[k]]] = 1; }
  }
}
