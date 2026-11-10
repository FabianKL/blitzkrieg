// Controles op een gegenereerde kaart volgens SPEC-blitzkrieg §6 en acceptatiecriteria 6, 7 en 8.
// Gebruikt door tests.mjs (een paar seeds) en gen.mjs (npm run test:gen, 100 seeds per geval).
import * as G from '../shared/game.js';
import { terrainShares, MARGIN, toleranceOf, villageSize } from '../shared/mapgen.js';
import { VIEW_CELLS } from '../shared/config.js';
import { check } from './helpers.mjs';

// Afstand (in cellen) van elke cel in de vorm tot de dichtstbijzijnde cel erbuiten (chamfer 1/√2)
export function distanceInside(inShape) {
  const W = G.W, H = G.H, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = inShape(i) ? 1e9 : 0;
  const pass = (y0, y1, dy, x0, x1, dx) => {
    for (let y = y0; y !== y1; y += dy) {
      for (let x = x0; x !== x1; x += dx) {
        const i = y * W + x;
        if (!d[i]) continue;
        for (const [ox, oy, c] of [[-dx, 0, 1], [0, -dy, 1], [-dx, -dy, Math.SQRT2], [dx, -dy, Math.SQRT2]]) {
          const nx = x + ox, ny = y + oy;
          const v = nx < 0 || ny < 0 || nx >= W || ny >= H ? c : d[ny * W + nx] + c;
          if (v < d[i]) d[i] = v;
        }
      }
    }
  };
  pass(0, H, 1, 0, W, 1);
  pass(H - 1, -1, -1, W - 1, -1, -1);
  return d;
}

function componentCount(w, matches) {
  const seen = new Uint8Array(w.map.length), queue = new Int32Array(w.map.length);
  let count = 0;
  for (let i = 0; i < w.map.length; i++) {
    if (seen[i] || w.border?.[i] || !matches(i)) continue;
    count++;
    let head = 0, tail = 0;
    queue[tail++] = i; seen[i] = 1;
    while (head < tail) {
      const at = queue[head++], x = at % G.W, y = (at / G.W) | 0;
      for (const n of [y > 0 ? at - G.W : -1, y + 1 < G.H ? at + G.W : -1, x > 0 ? at - 1 : -1, x + 1 < G.W ? at + 1 : -1]) {
        if (n >= 0 && !seen[n] && !w.border?.[n] && matches(n)) { seen[n] = 1; queue[tail++] = n; }
      }
    }
  }
  return count;
}

// Alle controles voor één kaart; geeft een korte samenvatting terug
export function checkGeneratedMap(id, w, players, size) {
  const rules = G.MAPS[id], T = G.T, tag = `${id} ${size} ${players}sp`;
  if (rules.rockEdge) check(w.border?.every((edge, i) => !edge || w.map[i] === G.ROCK), `${tag}: randstrook is niet gevuld met rots`);
  if (rules.terrainClusterClearance?.ice) check(w.zone?.every((protectedCell, i) => !protectedCell || w.terrain[i] !== G.CLASS.ice), `${tag}: ijs ligt in de uitgebreide basiszone of sluit erop aan`);
  if (rules.vegetation?.excludeClasses) {
    const ex = new Set(rules.vegetation.excludeClasses.map((n) => G.CLASS[n]));
    for (let i = 0; i < w.map.length; i++) {
      if (w.map[i] !== G.VEG) continue;
      const x = i % G.W, y = (i / G.W) | 0;
      const buren = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= G.W || ny < 0 || ny >= G.H) return -1;
        return ny * G.W + nx;
      }).filter((ni) => ni >= 0 && w.map[ni] === G.DIRT);
      if (buren.length && buren.every((ni) => ex.has(w.terrain[ni]))) {
        check(false, `${tag}: begroeiing staat op uitgesloten terrein (${rules.vegetation.excludeClasses.join(', ')})`);
        break;
      }
    }
  }
  // percentages (§6.1 stap 4)
  // (overshoot: wegen van vaste breedte zijn op een kleine kaart al meer dan het percentage verhard;
  // dat gaat onvermijdelijk van de andere klassen af, dus de marge wordt zoveel ruimer)
  // unavoidable: klassen die alleen uit kenmerken met een vaste breedte komen (wegen, bevroren
  // rivier, water zonder plassen) kunnen op een andere kaartgrootte niet op hun percentage komen;
  // zoveel mogen ze, en de andere klassen samen, extra afwijken (zie mapgen.js)
  const shares = terrainShares(w), extra = w.overshoot || 0;
  for (const [k, p] of Object.entries(rules.terrainPercent)) {
    const margin = MARGIN + (w.unavoidable?.[k] ?? extra) + toleranceOf(rules) + 0.01;
    check(Math.abs((shares[k] || 0) - p) <= margin, `${tag}: ${k} ${(shares[k] || 0).toFixed(1)}%, verwacht ${p} ± ${margin.toFixed(1)}`);
  }
  if (rules.rocks?.clusters) {
    check(componentCount(w, (i) => w.map[i] === G.ROCK) === rules.rocks.clusters, `${tag}: rotsvelden zijn niet ${rules.rocks.clusters} samenhangende gebieden`);
  }
  for (const [name, count] of Object.entries(rules.terrainClusters || {})) {
    const cls = G.CLASS[name];
    check(componentCount(w, (i) => (w.map[i] === G.DIRT || w.map[i] === G.EMPTY) && w.terrain[i] === cls) === count, `${tag}: ${name} is niet ${count} samenhangende gebieden`);
  }
  // bases (§6.2) — noBases kaarten hebben geen bases
  const expectBases = rules.noBases ? 0 : players;
  check(w.bases.length === expectBases, `${tag}: ${w.bases.length} bases, verwacht ${expectBases}`);
  const hw = G.BASE_W >> 1, hh = G.BASE_H >> 1;
  for (const b of w.bases) {
    for (let y = b.y - hh - 3 * T; y <= b.y + hh + 3 * T; y++) {
      for (let x = b.x - hw - 3 * T; x <= b.x + hw + 3 * T; x++) {
        check(G.inBounds(x, y) && !w.border[y * G.W + x], `${tag}: basis op (${b.x}, ${b.y}) ligt binnen 3 T van de rand`);
        const v = w.map[y * G.W + x];
        check(v === G.DIRT || v === G.EMPTY || v >= G.WALL, `${tag}: celtype ${v} binnen 3 T van basis (${b.x}, ${b.y})`);
      }
    }
    for (const dir of [-1, 1]) { // vrije strook voor de deur
      for (let d = 1; d <= 3 * T; d++) {
        const y = b.y + dir * (hh + d);
        for (let x = b.x - 3; x <= b.x + 3; x++) check(w.map[y * G.W + x] === G.DIRT, `${tag}: deurstrook van basis (${b.x}, ${b.y}) niet vrij`);
      }
    }
  }
  // vensterregel: geen andere basis in je venster vanuit je basis of 3 T eromheen
  if (!w.bases.relaxed) {
    for (const a of w.bases) {
      for (const b of w.bases) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) >= G.BASE_W + 3 * T + VIEW_CELLS.w / 2 || Math.abs(a.y - b.y) >= G.BASE_H + 3 * T + VIEW_CELLS.h / 2;
        check(apart, `${tag}: basis (${b.x}, ${b.y}) is te zien vanuit (${a.x}, ${a.y})`);
      }
    }
  }
  // route tussen elk paar bases (begroeiing, gebouwen, ijs en doorwaadbare plekken tellen als passeerbaar)
  if (w.bases.length) {
    const seen = G.reachable(w.map, w.bases[0]);
    check(w.bases.every((b) => seen[b.y * G.W + b.x]), `${tag}: niet alle bases bereikbaar`);
  }
  // bruggen minstens 3 T breed (de maat langs de rivier; de andere is de oversteek)
  for (const br of w.bridges) {
    if (br.cells < 4 * T * T) continue; // weg over het puntje van een rivier, geen echte brug
    // weg vlak bij het begin of eind van een rivier (het kanaal bij Carentan begint midden op de kaart)
    const ends = w.rivers.flatMap((p) => [p[0], p[p.length - 1]]);
    if (ends.some(([x, y]) => x >= br.x0 - 2 * T && x <= br.x1 + 2 * T && y >= br.y0 - 2 * T && y <= br.y1 + 2 * T)) continue;
    // een brug die een kort stuk water (sloot tussen twee dammen) helemaal bedekt, grenst nergens aan water
    if (!br.list.some((i) => [i + 1, i - 1, i + G.W, i - G.W].some((j) => w.map[j] === G.WATER))) continue;
    check(Math.max(br.x1 - br.x0, br.y1 - br.y0) + 1 >= 3 * T, `${tag}: brug van ${br.x1 - br.x0 + 1}x${br.y1 - br.y0 + 1} cellen`);
  }
  // bossen 1 tot 5 T breed: nergens dikker dan 5 T, en elke boomcel ligt bij een stuk van minstens 1 T
  const type = rules.vegetation?.type;
  if (type === 'pine' || type === 'tree' || type === 'birch') {
    const d = distanceInside((i) => w.map[i] === G.VEG);
    let maxD = 0;
    for (let i = 0; i < d.length; i++) maxD = Math.max(maxD, d[i]);
    check(maxD <= 2.5 * T + 1.5, `${tag}: bos van ${(maxD * 2).toFixed(0)} cellen breed, max 5 T = ${5 * T}`);
  }
  // geen huis of kerk op of pal tegen de weg (zonder stad is verhard altijd weg of dorpsplein)
  if (!(rules.features || []).some((f) => f.type === 'city')) {
    let bad = -1;
    for (let i = 0; i < w.map.length && bad < 0; i++) {
      if (w.map[i] !== G.BUILDING) continue;
      const x = i % G.W, y = (i / G.W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (y + dy) * G.W + x + dx;
        if (w.map[j] !== G.BUILDING && w.terrain[j] === G.CLASS.paved) bad = i;
      }
    }
    check(bad < 0, `${tag}: gebouw tegen de weg bij (${bad % G.W}, ${(bad / G.W) | 0})`);
  }
  // dorp: gebouwen binnen het aantal, rond de opgegeven plek
  // boerderijen (farms) staan los van het dorp en tellen mee in het totaal
  const farmMax = rules.farms ? (typeof rules.farms.count === 'number' ? rules.farms.count : (rules.farms.count?.[tag.split(' ')[1]] ?? rules.farms.count?.groot ?? 3)) : 0;
  const villages = (rules.features || []).filter((f) => f.type === 'village');
  let totalBuildings = 0;
  for (const cells of w.vegCells) if (cells.length && w.map[cells[0]] === G.BUILDING) totalBuildings++;
  const totalMin = villages.reduce((s, f) => s + f.buildings[0], 0);
  const totalMax = villages.reduce((s, f) => s + f.buildings[1], 0) + farmMax;
  if (villages.length) check(totalBuildings >= totalMin && totalBuildings <= totalMax, `${tag}: ${totalBuildings} gebouwen (incl. ${farmMax} boerderijen), verwacht ${totalMin}–${totalMax}`);
  for (const f of villages) {
    if (f.landmark) check(w.landmarks.length >= 1, `${tag}: geen herkenningspunt (${f.landmark}) in ${f.name}`);
  }
  // rivieren op de plek: de route ligt gemiddeld binnen 10% van de opgegeven lijn
  (rules.features || []).filter((f) => f.type === 'river').forEach((f, k) => {
    const path = w.rivers[k];
    const [ax, ay] = [f.from[0] * G.W, f.from[1] * G.H], [bx, by] = [f.to[0] * G.W, f.to[1] * G.H], L = Math.hypot(bx - ax, by - ay);
    const off = path.reduce((s, [x, y]) => s + Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / L, 0) / path.length;
    // (staat een basis noodgedwongen dicht bij de rivier, w.bases.riverRelaxed, dan buigt die eromheen)
    check(off / Math.max(G.W, G.H) < (w.bases.riverRelaxed ? 0.2 : 0.1), `${tag}: rivier ligt gemiddeld ${off.toFixed(0)} cellen naast de opgegeven lijn`);
  });
  return shares;
}
