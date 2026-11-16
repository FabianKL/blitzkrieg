// Controles op een gegenereerde kaart volgens SPEC-blitzkrieg §6 en acceptatiecriteria 6, 7 en 8.
// Gebruikt door tests.mjs (een paar seeds) en gen.mjs (npm run test:gen, 100 seeds per geval).
import * as G from '../shared/game.js';
import { terrainShares, MARGIN, toleranceOf, villageSize } from '../shared/mapgen.js';
import { BUILDINGS, VIEW_CELLS } from '../shared/config.js';
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
  // de middellijn van een weg (voor de weergave) ligt nooit op water: daar hoort een brug te liggen,
  // of de weg loopt eromheen. Behalve bij een weg die bewust geen brug krijgt (bridges: false).
  if (!(rules.features || []).some((f) => f.type === 'road' && f.bridges === false)) {
    for (const r of w.roads || []) {
      for (let k = 0; k < r.path.length - 1; k++) {
        const [ax, ay] = r.path[k], [bx, by] = r.path[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay)) || 1;
        for (let s = 0; s <= n; s++) {
          const x = Math.round(ax + ((bx - ax) * s) / n), y = Math.round(ay + ((by - ay) * s) / n);
          if (!G.inBounds(x, y) || w.border?.[y * G.W + x]) continue;
          check(w.map[y * G.W + x] !== G.WATER, `${tag}: weg loopt bij (${x}, ${y}) over water zonder brug`);
        }
      }
    }
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
  if (!(rules.features || []).some((f) => f.type === 'city' || (f.type === 'village' && f.layout === 'roadside'))) {
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
  if (id === 'ardennen') {
    const village = w.villages[0], cfg = villages[0], centerX = Math.round(cfg.at[0] * (G.W - 1)), centerY = Math.round(cfg.at[1] * (G.H - 1));
    check(village.x === centerX && village.y === centerY, `${tag}: Bastogne ligt niet exact midden op de kaart`);
    const roadFeatures = (rules.features || []).filter((f) => f.type === 'road');
    check(roadFeatures.length === 5, `${tag}: verwacht vijf wegen`);
    roadFeatures.forEach((_, i) => {
      const path = w.roads[i]?.path || [];
      const endpointDistance = Math.min(
        Math.hypot(path[0]?.[0] - centerX, path[0]?.[1] - centerY),
        Math.hypot(path.at(-1)?.[0] - centerX, path.at(-1)?.[1] - centerY),
      );
      check(endpointDistance < 1, `${tag}: weg ${i + 1} komt niet op het centrale kruispunt uit`);
    });

    let rows = 0, detached = 0, churchBox = null;
    const rowByRoadSide = new Map();
    for (const cells of w.vegCells) {
      if (!cells.length || w.map[cells[0]] !== G.BUILDING) continue;
      const xs = cells.map((i) => i % G.W), ys = cells.map((i) => (i / G.W) | 0);
      const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      const width = box.x1 - box.x0 + 1, height = box.y1 - box.y0 + 1;
      if (Math.abs(cells.length - BUILDINGS.footprints['huis-rij'][0] * BUILDINGS.footprints['huis-rij'][1]) <= 24) {
        rows++;
        const cx = xs.reduce((sum, x) => sum + x + 0.5, 0) / cells.length;
        const cy = ys.reduce((sum, y) => sum + y + 0.5, 0) / cells.length;
        let cxx = 0, cyy = 0, cxy = 0;
        for (let k = 0; k < cells.length; k++) {
          const dx = xs[k] + 0.5 - cx, dy = ys[k] + 0.5 - cy;
          cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
        }
        const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
        const roads = w.roads.map((road, i) => {
          const [[ax, ay], [bx, by]] = road.path, dx = bx - ax, dy = by - ay, lengthSq = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lengthSq));
          return { i, dx, dy, distance: Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy)) };
        }).sort((a, b) => a.distance - b.distance);
        const road = roads[0], roadAngle = Math.atan2(road.dy, road.dx);
        const angleDiff = Math.abs(Math.atan2(Math.sin(angle - roadAngle), Math.cos(angle - roadAngle)));
        check(angleDiff < 0.12 || Math.abs(angleDiff - Math.PI) < 0.12, `${tag}: huizenrij draait niet mee met de weg (${angleDiff.toFixed(2)} rad)`);
        check(road.distance <= roadFeatures[road.i].width * T / 2 + BUILDINGS.footprints['huis-rij'][1] / 2 + 2, `${tag}: huizenrij staat te ver van de weg (${road.distance.toFixed(1)} cellen)`);
        const feature = roadFeatures[road.i], center = [centerX, centerY];
        const fromCenter = Math.hypot(Math.round(feature.from[0] * (G.W - 1)) - center[0], Math.round(feature.from[1] * (G.H - 1)) - center[1]) < 1;
        const outer = fromCenter ? feature.to : feature.from;
        const dx = Math.round(outer[0] * (G.W - 1)) - centerX, dy = Math.round(outer[1] * (G.H - 1)) - centerY;
        const side = Math.sign(dx * (cy - centerY) - dy * (cx - centerX));
        const key = `${road.i}/${side}`;
        rowByRoadSide.set(key, (rowByRoadSide.get(key) || 0) + 1);
      } else if (Math.abs(cells.length - BUILDINGS.footprints['huis-woon'][0] * BUILDINGS.footprints['huis-woon'][1]) <= 12) {
        detached++;
      } else if (width === BUILDINGS.footprints.kerk[0] && height === BUILDINGS.footprints.kerk[1]) {
        churchBox = box;
      } else if (height === BUILDINGS.footprints.kerk[0] && width === BUILDINGS.footprints.kerk[1]) {
        churchBox = box;
      }
    }
    check(rows === roadFeatures.length * 4, `${tag}: ${rows} huizenrijen, verwacht ${roadFeatures.length * 4}`);
    for (let road = 0; road < roadFeatures.length; road++) {
      check(rowByRoadSide.get(`${road}/-1`) === 2, `${tag}: weg ${road + 1} heeft niet twee blokken aan zijde -1`);
      check(rowByRoadSide.get(`${road}/1`) === 2, `${tag}: weg ${road + 1} heeft niet twee blokken aan zijde 1`);
    }
    check(detached >= cfg.looseHouses.min && detached <= cfg.looseHouses.max, `${tag}: ${detached} losse huizen, verwacht ${cfg.looseHouses.min}–${cfg.looseHouses.max}`);
    const church = w.landmarks.find((landmark) => landmark.kind === 'kerk');
    const churchDistance = churchBox && Math.hypot(Math.max(churchBox.x0 - centerX, 0, centerX - churchBox.x1), Math.max(churchBox.y0 - centerY, 0, centerY - churchBox.y1));
    check(church && churchDistance < 3 * G.T, `${tag}: kerk ligt niet aan het kruispunt`);
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
