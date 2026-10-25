// Gedeelde spellogica: deze code draait identiek op de server én in de browser.
// Daardoor rekenen beide precies hetzelfde (graven, kogels, kraters) en hoeft de
// kaart nooit per frame over het netwerk.
import {
  FELL, GAME, T, MAP_SIZES, DEFAULT_SIZE, VISION, DISPLAY, BULLETS, BUILDING as BUILDING_CFG, MAP_MENU, DEFAULT_MAP,
  TUNNEL, TERRAIN, VEGETATION, TRACK_ERASER, ICE, MAPS, TOUCH,
} from './config.js';
import { generateFeatureMap } from './mapgen.js';

export { MAPS, VEGETATION, ICE, GAME, T, MAP_SIZES, DEFAULT_SIZE, VISION, MAP_MENU, DEFAULT_MAP, TOUCH };

// Uiterlijk van de 4 tanks op een kaart (§4): ploeg A en B uit de config, C en D als variant.
// Alleen het uiterlijk; alle tanks rijden, schieten en incasseren precies hetzelfde.
export function teamsFor(rules) {
  const t = rules?.tanks;
  if (!t) return null;
  const variant = (spec) => ({ ...spec, name: `${spec.name} II`, variant: true, number: spec.number && String(Number(spec.number) + 100) });
  return [t.A, t.B, variant(t.A), variant(t.B)];
}

// ---------- Kaartmaat ----------
// W en H zijn de maat van de kaart waar nu mee gerekend wordt. Ze veranderen met setMapSize:
// de browser doet dat bij het instappen, de server voor elk potje voordat hij ermee rekent
// (potjes kunnen een andere grootte hebben). Alles draait in één draad, dus dat is veilig.
// Andere modules lezen G.W en G.H en zien de nieuwe waarde vanzelf.
export const BASE_W_CELLS = 400, BASE_H_CELLS = 250; // middel
export let W = BASE_W_CELLS; // kaartbreedte in cellen
export let H = BASE_H_CELLS; // kaarthoogte in cellen
export function sizeDims(size) {
  const f = (MAP_SIZES[size] || MAP_SIZES[DEFAULT_SIZE]).factor;
  return { w: Math.round(BASE_W_CELLS * f), h: Math.round(BASE_H_CELLS * f) };
}
export function setMapSize(w, h) {
  W = w; H = h;
  ICE_BW = Math.ceil(W / ICE_B); ICE_BH = Math.ceil(H / ICE_B);
}

// ---------- Spel en rondes (§2) ----------
// Telwijze: bij hoogstens 2 spelers gewonnen rondes, daarboven kills
export const scoreMode = (players) => (players <= 2 ? 'rounds' : 'kills');
// Score die iedereen ziet, volgens de telwijze van nu
export const score = (t, players) => (scoreMode(players) === 'rounds' ? t.rounds : t.kills);

// Wie wint de ronde die net eindigt? players = [{id, alive}]. Alleen bij precies 2 spelers:
// wie als enige nog leeft. Tegelijk dood, of meer spelers (dan tellen kills): niemand (-1).
export function roundWinner(players) {
  if (players.length !== 2) return -1;
  const alive = players.filter((t) => t.alive);
  return alive.length === 1 ? alive[0].id : -1;
}

// Heeft iemand het spel gewonnen? players = [{id, rounds, kills}]. Geeft id of -1.
export function gameWinner(players, cfg = GAME) {
  const mode = scoreMode(players.length);
  const best = players.find((t) => (mode === 'rounds' ? t.rounds >= cfg.roundsToWin : t.kills >= cfg.killsToWin));
  return best ? best.id : -1;
}

// Zichtcirkel in cellen: de halve hoogte van het beeld (viewH in cellen), kleiner gemaakt door
// het weer (inT, in T zoals de spec; VISION.defaultT = vol), nooit kleiner dan minRadius
export const minRadius = () => VISION.minTanks * T; // een tank is T breed (zie de maattest)
export const visionRadius = (viewH, inT = VISION.defaultT) => Math.max(minRadius(), (viewH / 2) * Math.min(1, inT / VISION.defaultT));
// Regels die een kaart kan overschrijven
export const bulletsDig = (rules) => rules?.bulletsDig ?? BULLETS.dig;
export const minimapOn = (rules) => rules?.minimap ?? DISPLAY.minimap;
export const TICK_RATE = 30; // simulatiestappen per seconde
export const MAX_PLAYERS = 4;

// Celtypes in de kaart (1 byte per cel)
export const EMPTY = 0; // uitgegraven tunnel
export const DIRT = 1; // zand
export const ROCK = 2; // rots, onverwoestbaar
export const WATER = 3; // water, onbegaanbaar
export const VEG = 4; // begroeiing: onbegaanbaar, maar weg te schieten
export const BUILDING = 5; // gebouw: onbegaanbaar, na BUILDING_CFG.hp treffers puin
export const WALL = 6; // WALL + spelernummer = muur van die basis (6..9)
export const BASE = 10; // BASE + spelernummer = vloer van die basis (10..13)

export const TANK_R = 3; // tank past in 7x7 cellen (middelpunt ± 3)

export const FUEL_MAX = 3000;
export const SHIELD_MAX = 100;
export const AMMO_MAX = 50;
export const IDLE_DRAIN_EVERY = 10; // buiten de basis: 1 brandstof per N ticks
export const BULLET_SPEED = 3; // cellen per tick
export const BULLET_DAMAGE = 10;
export const BULLET_DIG_R = 4; // krater bij inslag in zand
export const HIT_DIG_R = 3; // krater bij treffer op een tank
export const DEATH_DIG_R = 12; // krater als een tank ontploft
export const MINE_DAMAGE = 15; // schade als je over een mijn rijdt
export const MINE_DIG_R = 2; // krater van een mijn
export const FIRE_COOLDOWN = 4; // ticks tussen schoten

export const BASE_W = 23; // buitenmaat basis incl. muur
export const BASE_H = 19;
export const DOOR_HALF = 3; // deuropening van 7 breed
export const DOOR_CLEAR = 22; // zo ver vóór elke deur ligt geen rots (uitrijstrook)

export const COLORS = ['#3cdc3c', '#3c5cff', '#ffa020', '#ff40c0'];

// 8 richtingen, 0 = noord, met de klok mee
export const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export function dirIndex(dx, dy) {
  return DIRS.findIndex(([x, y]) => x === dx && y === dy);
}
// Joystick: verschuiving van de duim (x, y; y omlaag) als fractie van de stickstraal → een van
// de 8 richtingen als [dx, dy], of [0, 0] binnen de dode zone. Elke richting krijgt 45°.
export function stickDirection(x, y) {
  if (Math.hypot(x, y) < TOUCH.deadZone) return [0, 0];
  const sector = (Math.round(Math.atan2(x, -y) / (Math.PI / 4)) + 8) % 8;
  return DIRS[sector].slice();
}

export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const isSolid = (c) => c >= ROCK && c < BASE; // rots, water, begroeiing, gebouw, muur
export const BUILDING_HP = BUILDING_CFG.hp;
export const BURIAL_TICKS = Math.round(TRACK_ERASER.burialSeconds * TICK_RATE);

// ---------- Terreinklassen (getallen in config.js) ----------
// Naast de kaart (gegraven of niet) heeft elke cel een terreinklasse. Alles wordt
// omgerekend naar gehele getallen, zodat server en clients exact hetzelfde rekenen.
// Een "wereld" w = {map, terrain, track, veg, vegHp, scar}: kaart, klasse per cel, spoor per
// cel, welke plant er staat (nummer + 1), treffers die elke plant nog kan hebben, en de
// permanente gaten van weggeschoten planten.
export const TRACK_ONE = 65535; // spoor 1.0 (track is een Uint16Array)
export const TRACK_STAGES = 16; // zoveel zichtbare stappen; de weergave hertekent alleen bij een wissel
const STAGE_SHIFT = 12; // track >> 12 = stap 0..15
const SPEED_ONE = 256; // snelheid 1.0 (een stap per tick)
export const CLASS_NAMES = Object.keys(TERRAIN);
export const CLASS = Object.fromEntries(CLASS_NAMES.map((n, i) => [n, i]));
export const CLASSES = CLASS_NAMES.map((name) => {
  const c = TERRAIN[name];
  const u16 = (v) => Math.round(v * TRACK_ONE);
  return {
    name, speed: Math.round(c.speed * SPEED_ONE), fuel: c.fuel,
    track: u16(c.track), fade: u16(c.fade), min: u16(c.min), noTunnel: !!c.noTunnel, erasable: !!c.erasable,
  };
});
export const TUNNEL_COST = { speed: Math.round(TUNNEL.speed * SPEED_ONE), fuel: TUNNEL.fuel };
export const trackStage = (v) => v >> STAGE_SHIFT;

// ---------- Tankvorm per richting ----------
// Een gedraaide rechthoek van 5 breed en 7 lang. Dezelfde vorm wordt gebruikt
// om te botsen, te graven en (op de client) om de sprite te tekenen, zodat
// schuine tunnels echte schuine banen worden.
export const TANK_LEN = 3.3; // halve lengte
export const TANK_WID = 2.6; // halve breedte
export const MASKS = DIRS.map(([dx, dy]) => {
  const n = Math.hypot(dx, dy), fx = dx / n, fy = dy / n;
  const cells = [];
  for (let y = -TANK_R; y <= TANK_R; y++) {
    for (let x = -TANK_R; x <= TANK_R; x++) {
      const along = x * fx + y * fy;
      const perp = -x * fy + y * fx;
      if (Math.abs(along) <= TANK_LEN && Math.abs(perp) <= TANK_WID) cells.push({ x, y, along, perp });
    }
  }
  return cells;
});
const MASK_HIT = MASKS.map((cells) => {
  const m = new Uint8Array(49);
  for (const c of cells) m[(c.y + TANK_R) * 7 + c.x + TANK_R] = 1;
  return m;
});
export function tankCovers(t, x, y) {
  const dx = x - t.x, dy = y - t.y;
  if (Math.abs(dx) > TANK_R || Math.abs(dy) > TANK_R) return false;
  return MASK_HIT[t.dir ?? t.d][(dy + TANK_R) * 7 + dx + TANK_R] === 1;
}

// ---------- Kaart ----------
// Deterministische random: dezelfde seed geeft overal dezelfde uitkomst
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Zachte ruis (0..1) voor natuurlijke vormen: willekeurige waarden op een rooster,
// vloeiend gemengd. Zelfde seed = zelfde ruis.
export function makeNoise(seed) {
  const h = (i, j) => {
    let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

const BASE_SPOTS = [[0.18, 0.25], [0.82, 0.75], [0.82, 0.25], [0.18, 0.75]];

// Kaart maken. players = aantal bases (zoveel spelers als de kaartgrootte toelaat).
// Kaarten met features (het formaat uit §11) gaan via de kaartmaker in mapgen.js; zonder features
// is het de retrokaart: één terreinklasse, losse rotsblokken, een rotsrand en de bases.
export function generateMap(seed, opts = {}, players = MAX_PLAYERS) {
  if (opts.features) return generateFeatureMap(seed, opts, players);
  const rnd = mulberry32(seed);
  const noise = makeNoise(seed ^ 0x5bd1e995);
  const map = new Uint8Array(W * H).fill(DIRT);
  const terrain = new Uint8Array(W * H).fill(CLASS[Object.keys(opts.classes || { normal: 1 })[0]]);
  // het aantal rotsen in de configuratie geldt voor middel; op andere groottes naar verhouding
  const rk = opts.rocks || {}, count = Math.round((rk.count || 0) * (W * H) / (BASE_W_CELLS * BASE_H_CELLS));
  for (let i = 0; i < count; i++) {
    const cx = rnd() * W, cy = rnd() * H, r = rk.min + rnd() * (rk.max - rk.min);
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (inBounds(x, y) && Math.hypot(x - cx, y - cy) < r + (rnd() - 0.5) * 2.5) map[y * W + x] = ROCK; // gekartelde rand
      }
    }
  }
  const isBorder = makeBorder(map, noise);
  const bases = BASE_SPOTS.slice(0, players).map(([fx, fy]) => ({
    x: Math.round(fx * W + (rnd() - 0.5) * 30),
    y: Math.round(fy * H + (rnd() - 0.5) * 20),
  }));
  const veg = new Uint16Array(W * H);
  drawBases(map, veg, bases, isBorder, noise);
  connectBases(map, bases, isBorder);
  const w = { map, terrain, track: new Uint16Array(W * H), veg, vegHp: new Uint8Array(0), scar: new Uint8Array(W * H), ice: new Uint8Array(ICE_BW * ICE_BH) };
  indexVeg(w);
  return { ...w, bases, fields: [], mines: [] };
}

// ---------- Bouwstenen voor de kaartmakers ----------
// Rand van rots: een rotswand van wisselende dikte (4 tot ~13 cellen), met grote golven en
// kleine hapjes, zodat de rand van de kaart geen rechte lijn is. Minstens 4 dik, zodat hij ook
// zichtbaar is als de camera niet helemaal tegen de rand staat. Geeft isBorder(x, y).
export function makeBorder(map, noise) {
  const edge = (u, side) => 4 + noise(u / 11, side * 97) * 7 + noise(u / 3, side * 97 + 41) * 2;
  // de randdikte per rij en kolom één keer uitrekenen (de kaartmaker vraagt het heel vaak)
  const left = Float32Array.from({ length: H }, (_, y) => edge(y, 0)), right = Float32Array.from({ length: H }, (_, y) => edge(y, 1));
  const top = Float32Array.from({ length: W }, (_, x) => edge(x, 2)), bottom = Float32Array.from({ length: W }, (_, x) => edge(x, 3));
  const isBorder = (x, y) => x < 0 || y < 0 || x >= W || y >= H || x < left[y] || W - 1 - x < right[y] || y < top[x] || H - 1 - y < bottom[x];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isBorder(x, y)) map[y * W + x] = ROCK;
    }
  }
  return isBorder;
}

// Bases tekenen: dunne muur in spelerskleur, opening boven en onder, eromheen vrijgemaakt
export function drawBases(map, veg, bases, isBorder, noise) {
  const obstacle = (v) => v === ROCK || v === WATER || v === VEG || v === BUILDING;
  const clear = (i) => { map[i] = DIRT; veg[i] = 0; };
  bases.forEach((b, i) => {
    const x0 = b.x - (BASE_W >> 1), y0 = b.y - (BASE_H >> 1);
    // Rots, water en planten rond de basis weghalen in een golvende, afgeronde vorm (geen
    // rechthoek, anders worden ze in de buurt recht afgesneden). Minstens 5 cellen vrij.
    for (let y = y0 - 14; y < y0 + BASE_H + 14; y++) {
      for (let x = x0 - 14; x < x0 + BASE_W + 14; x++) {
        if (!inBounds(x, y) || !obstacle(map[y * W + x]) || isBorder(x, y)) continue;
        const dx = Math.max(x0 - x, 0, x - (x0 + BASE_W - 1)), dy = Math.max(y0 - y, 0, y - (y0 + BASE_H - 1));
        if (Math.hypot(dx, dy) < 5 + noise(x / 5, y / 5) * 7) clear(y * W + x);
      }
    }
    // Vrije uitrijstrook voor beide deuren: een trechter die naar buiten breder wordt,
    // zodat je de basis uit kunt rijden en kunt draaien zonder meteen ergens tegen te botsen.
    for (const [doorY, dir] of [[y0, -1], [y0 + BASE_H - 1, 1]]) {
      for (let d = 1; d <= DOOR_CLEAR; d++) {
        const y = doorY + dir * d;
        const half = 7 + d * 0.45 + noise(b.x / 4 + d / 5, doorY / 4) * 3; // golvende zijkanten
        for (let x = Math.floor(b.x - half - 2); x <= b.x + half + 2; x++) {
          if (!inBounds(x, y) || !obstacle(map[y * W + x]) || isBorder(x, y)) continue;
          if (Math.abs(x - b.x) < half + noise(x / 3, y / 3) * 1.5) clear(y * W + x);
        }
      }
    }
    for (let y = y0; y < y0 + BASE_H; y++) {
      for (let x = x0; x < x0 + BASE_W; x++) {
        const edgeX = x === x0 || x === x0 + BASE_W - 1;
        const edgeY = y === y0 || y === y0 + BASE_H - 1;
        const door = edgeY && !edgeX && Math.abs(x - b.x) <= DOOR_HALF;
        map[y * W + x] = (edgeX || edgeY) && !door ? WALL + i : BASE + i;
        veg[y * W + x] = 0;
      }
    }
  });

}

// Bevroren rivier: de bases moeten elkaar ook na de dooi nog kunnen bereiken (via de brug).
// Lukt dat niet, dan wordt de doorgang die connectBases graaft een dam van harde grond.
export function ensureThawRoute(map, terrain, bases, isBorder) {
  if (CLASS.ice !== undefined && terrain.includes(CLASS.ice)) {
    const thawed = Uint8Array.from(map, (v, i) => (v === DIRT && terrain[i] === CLASS.ice ? WATER : v));
    connectBases(thawed, bases, isBorder);
    for (let i = 0; i < map.length; i++) {
      if (thawed[i] !== DIRT) continue;
      if (map[i] === ROCK || map[i] === WATER) map[i] = DIRT;
      if (terrain[i] === CLASS.ice) terrain[i] = CLASS.hard;
    }
  }
}


// Mijnenvelden: ellipsen ver van de bases, met losse mijnen in het zand. Mijnen zijn geen
// celtype: je graaft er gewoon doorheen.
export function addMines(map, bases, rnd, count) {
  const fields = [], mines = [];
  for (let tries = 0; fields.length < count && tries < 40 * count; tries++) {
    const f = {
      x: Math.round(20 + rnd() * (W - 40)), y: Math.round(15 + rnd() * (H - 30)),
      rx: Math.round(12 + rnd() * 16), ry: Math.round(8 + rnd() * 10),
    };
    if (bases.some((b) => Math.hypot((b.x - f.x) / (f.rx + 24), (b.y - f.y) / (f.ry + 20)) < 1)) continue;
    if (fields.some((o) => Math.hypot(o.x - f.x, o.y - f.y) < (o.rx + f.rx) * 0.8)) continue;
    fields.push(f);
  }
  const taken = new Set();
  for (const f of fields) {
    for (let y = f.y - f.ry; y <= f.y + f.ry; y++) {
      for (let x = f.x - f.rx; x <= f.x + f.rx; x++) {
        if (!inBounds(x, y) || ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 > 1) continue;
        if (map[y * W + x] !== DIRT || rnd() > 0.035) continue;
        let near = false; // minstens 2 cellen tussen mijnen
        for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2; i++) if (taken.has((y + j) * W + x + i)) { near = true; break; }
        if (near) continue;
        taken.add(y * W + x);
        mines.push(y * W + x);
      }
    }
  }
  return { fields, mines };
}

// Kunnen alle bases elkaar bereiken? Rots, water en muren blokkeren, begroeiing en gebouwen
// niet (die kun je wegschieten). Zo niet, dan een doorgang graven naar de eerste basis.
export function reachable(map, from) {
  const blocked = new Int32Array((W + 1) * (H + 1)); // optelsom van blokkerende cellen
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = map[y * W + x];
      const b = isSolid(v) && v !== VEG && v !== BUILDING ? 1 : 0;
      blocked[(y + 1) * (W + 1) + x + 1] = b + blocked[y * (W + 1) + x + 1] + blocked[(y + 1) * (W + 1) + x] - blocked[y * (W + 1) + x];
    }
  }
  const fits = (x, y) => {
    if (x < TANK_R || y < TANK_R || x >= W - TANK_R || y >= H - TANK_R) return false;
    const x0 = x - TANK_R, y0 = y - TANK_R, x1 = x + TANK_R + 1, y1 = y + TANK_R + 1;
    return blocked[y1 * (W + 1) + x1] - blocked[y0 * (W + 1) + x1] - blocked[y1 * (W + 1) + x0] + blocked[y0 * (W + 1) + x0] === 0;
  };
  const seen = new Uint8Array(W * H);
  const q = [from.y * W + from.x];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * W + nx;
      if (!seen[ni] && fits(nx, ny)) { seen[ni] = 1; q.push(ni); }
    }
  }
  return seen;
}

export function connectBases(map, bases, isBorder) {
  for (let tries = 0; tries < 4; tries++) {
    const seen = reachable(map, bases[0]);
    const lost = bases.filter((b) => !seen[b.y * W + b.x]);
    if (!lost.length) return;
    for (const b of lost) {
      const n = Math.ceil(Math.hypot(bases[0].x - b.x, bases[0].y - b.y));
      for (let s = 0; s <= n; s++) {
        const cx = Math.round(b.x + ((bases[0].x - b.x) * s) / n), cy = Math.round(b.y + ((bases[0].y - b.y) * s) / n);
        for (let y = cy - 5; y <= cy + 5; y++) {
          for (let x = cx - 5; x <= cx + 5; x++) {
            if (!inBounds(x, y) || isBorder(x, y)) continue;
            const v = map[y * W + x];
            if (v === ROCK || v === WATER) map[y * W + x] = DIRT;
          }
        }
      }
    }
  }
}

// ---------- Begroeiing en gebouwen wegschieten ----------
// Planten en gebouwen delen één nummering (w.veg = nummer + 1, w.vegHp = treffers over).
// Per nummer de lijst van zijn cellen (ook op de client na het instappen opgebouwd)
export function indexVeg(w) {
  w.vegCells = Array.from(w.vegHp, () => []);
  for (let i = 0; i < w.veg.length; i++) if (w.veg[i]) w.vegCells[w.veg[i] - 1].push(i);
}

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

// ---------- IJs ----------
// Het ijs is verdeeld in vakken van ICE.block cellen. w.ice[vak] = aantal passages (max 255).
// De server gooit de dobbelsteen en stuurt het resultaat; breakIce en thaw doen op server en
// clients precies hetzelfde met de kaart.
export const ICE_B = ICE.block;
export let ICE_BW = Math.ceil(W / ICE_B), ICE_BH = Math.ceil(H / ICE_B); // bijgewerkt door setMapSize
export const iceBlockAt = (x, y) => ((y / ICE_B) | 0) * ICE_BW + ((x / ICE_B) | 0);
export const isIce = (w, i) => w.map[i] === DIRT && w.terrain[i] === CLASS.ice;
export const iceStage = (n) => ICE.crackStages.reduce((s, at) => s + (n >= at ? 1 : 0), 0); // 0..3
export const iceBreakChance = (passes) => Math.min(1, passes * ICE.breakPerPass);

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
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
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

// Welke mijnen liggen onder de tankvorm op (x, y) in richting dir?
export function minesUnder(mines, x, y, dir) {
  const hit = [];
  for (const c of MASKS[dir]) {
    const i = (y + c.y) * W + x + c.x;
    if (mines.has(i)) hit.push(i);
  }
  return hit;
}

// ---------- Rijden ----------
// Eén tick rijden met de ingedrukte richting. Gedeeld zodat de browser je eigen tank
// kan voorspellen met exact dezelfde regels als de server.
// t: {x, y, dir, mv, fuel, input: {dx, dy}}; others: andere levende tanks {x, y}.
// mv telt op tot een hele stap: door traag terrein rijdt een tank niet elke tick.
const overlaps = (x, y, o) => Math.abs(x - o.x) <= 2 * TANK_R && Math.abs(y - o.y) <= 2 * TANK_R;
function tankBlocked(t, nx, ny, others) {
  // Zitten tanks al in elkaar (bv. na respawn), laat ze dan uit elkaar rijden
  return others.some((o) => overlaps(nx, ny, o) && !overlaps(t.x, t.y, o));
}

export { SPEED_ONE };
export function moveTank(t, w, others) {
  const { dx, dy } = t.input;
  if (!dx && !dy) return;
  if (waterUnder(w.map, t.x, t.y, t.dir) > 0) { moveWet(t, w, others); return; }
  // Draaien mag alleen als de nieuwe stand niet in rots, muur of begroeiing steekt. Past de
  // gedraaide tank net niet (een boom of rots vlak naast je), dan schuift hij 1 of 2 cellen op
  // naar een plek waar hij wel past, liefst in de stuurrichting. Zo kun je niet klem komen te zitten.
  const nd = dirIndex(dx, dy);
  if (nd !== t.dir && probeFootprint(w.map, t.x, t.y, nd) === FP_BLOCKED) {
    const spot = turnNudge(t, w, nd, dx, dy, others);
    if (!spot || t.fuel <= 0) return;
    t.x = spot[0]; t.y = spot[1]; t.dir = nd; t.mv = 0;
    t.fuel -= TUNNEL_COST.fuel;
    return;
  }
  t.dir = nd;
  if (t.fuel <= 0) return;
  const options = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]]; // schuif langs muren
  for (const [mx, my] of options) {
    const nx = t.x + mx, ny = t.y + my;
    const cost = stepCost(w, nx, ny, t.dir);
    if (!cost || tankBlocked(t, nx, ny, others)) continue;
    // t.slow: snelheidsfactor door een meter (oververhit, bevroren motor, zand), SPEED_ONE = normaal
    const speed = t.slow !== undefined && t.slow < SPEED_ONE ? Math.round((cost.speed * t.slow) / SPEED_ONE) : cost.speed;
    if (speed < SPEED_ONE) {
      t.mv = (t.mv || 0) + speed;
      if (t.mv < SPEED_ONE) return; // nog niet ver genoeg gegraven voor een hele stap
      t.mv -= SPEED_ONE;
    } else t.mv = 0;
    t.x = nx; t.y = ny;
    t.fuel -= cost.fuel;
    return;
  }
}

// Dichtstbijzijnde plek (1 of 2 cellen verder) waar de tank in richting nd past; eerst in de
// stuurrichting, dan de andere richtingen. null = nergens.
const NUDGES = [1, 2].flatMap((s) => DIRS.map(([x, y]) => [x * s, y * s]));
function turnNudge(t, w, nd, dx, dy, others) {
  const order = [[dx, dy], [dx * 2, dy * 2], ...NUDGES];
  for (const [ox, oy] of order) {
    const nx = t.x + ox, ny = t.y + oy;
    if (probeFootprint(w.map, nx, ny, nd) === FP_BLOCKED || tankBlocked(t, nx, ny, others)) continue;
    if (waterUnder(w.map, nx, ny, nd) > 0) continue; // niet het water in schuiven
    return [nx, ny];
  }
  return null;
}

// Hoeveel watercellen liggen onder de tankvorm? -1 = er zit rots, een muur of begroeiing onder.
export function waterUnder(map, cx, cy, dir) {
  let n = 0;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!inBounds(x, y)) return -1;
    const v = map[y * W + x];
    if (v === WATER) n++;
    else if (isSolid(v)) return -1;
  }
  return n;
}

// In een wak gezakt: heel langzaam, en alleen een kant op waar niet meer water onder de tank
// komt (eruit, of langs de rand), zodat je niet zwemmend een rivier oversteekt.
export const WET_SPEED = Math.round(ICE.sinkSpeed * SPEED_ONE);
function moveWet(t, w, others) {
  const { dx, dy } = t.input;
  const nd = dirIndex(dx, dy);
  const wet = waterUnder(w.map, t.x, t.y, t.dir);
  if (nd !== t.dir) {
    const nw = waterUnder(w.map, t.x, t.y, nd);
    if (nw < 0 || nw > wet) return;
    t.dir = nd;
  }
  if (t.fuel <= 0) return;
  const options = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
  for (const [mx, my] of options) {
    const nx = t.x + mx, ny = t.y + my;
    const nw = waterUnder(w.map, nx, ny, t.dir);
    if (nw < 0 || nw > wet || tankBlocked(t, nx, ny, others)) continue;
    t.mv = (t.mv || 0) + WET_SPEED;
    if (t.mv < SPEED_ONE) return;
    t.mv -= SPEED_ONE;
    t.x = nx; t.y = ny;
    t.fuel -= TUNNEL_COST.fuel;
    return;
  }
}

// Wat zit er onder de tankvorm op (cx, cy) in richting dir?
export const FP_CLEAR = 0, FP_DIRT = 1, FP_BLOCKED = 2;
export function probeFootprint(map, cx, cy, dir) {
  let dirt = false;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!inBounds(x, y)) return FP_BLOCKED;
    const v = map[y * W + x];
    if (isSolid(v)) return FP_BLOCKED;
    if (v === DIRT) dirt = true;
  }
  return dirt ? FP_DIRT : FP_CLEAR;
}

// Wat kost een stap naar (cx, cy)? null = geblokkeerd. Door een bestaande tunnel TUNNEL_COST;
// moet er gegraven worden, dan telt de traagste klasse onder de nieuwe tankvorm.
export function stepCost(w, cx, cy, dir) {
  let worst = null;
  for (const c of MASKS[dir]) {
    const x = cx + c.x, y = cy + c.y;
    if (!inBounds(x, y)) return null;
    const v = w.map[y * W + x];
    if (isSolid(v)) return null;
    if (v === DIRT) {
      const cls = CLASSES[w.terrain[y * W + x]];
      if (!worst || cls.speed < worst.speed) worst = cls;
    }
  }
  return worst || TUNNEL_COST;
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

// ---------- Kogels ----------
// Een kogel vliegt over grond en water heen en stopt bij een tank, begroeiing, gebouw, rots of
// muur (§5.8). Met dig (bulletsDig, retro) stopt hij ook in de grond en graaft daar een krater.
// Begroeiing en gebouwen raakt een kogel over de hele breedte van een tank (2 cellen naar
// weerszijden): alles wat je tank tegenhoudt, kun je wegschieten. De kogel staat dan op de
// geraakte cel (b.x, b.y), zodat server en clients dezelfde plant raken.
const SWEEP = Math.floor(TANK_WID);
function bulletCheck(b, map, tanks, dig) {
  if (!inBounds(b.x, b.y)) return { kind: 'solid' };
  const c = map[b.y * W + b.x];
  if (isSolid(c) && c !== WATER) return { kind: 'solid' };
  for (const t of tanks) {
    if (t.alive && t.id !== b.owner && tankCovers(t, b.x, b.y)) return { kind: 'tank', tank: t };
  }
  const [px, py] = DIRS[(b.d + 2) % 8]; // dwars op de vliegrichting
  for (let k = 1; k <= SWEEP; k++) {
    for (const sgn of [1, -1]) {
      const x = b.x + px * k * sgn, y = b.y + py * k * sgn;
      if (!inBounds(x, y)) continue;
      const v = map[y * W + x];
      if (v === VEG || v === BUILDING) { b.x = x; b.y = y; return { kind: 'solid' }; }
    }
  }
  if (dig && c === DIRT) return { kind: 'dirt' };
  return null;
}

// Beweeg een kogel één tick. Geeft null terug of waar hij op insloeg.
export function stepBullet(b, map, tanks, dig = false) {
  if (b.fresh) {
    b.fresh = false;
    const hit = bulletCheck(b, map, tanks, dig);
    if (hit) return hit;
  }
  const [dx, dy] = DIRS[b.d];
  for (let s = 0; s < BULLET_SPEED; s++) {
    b.x += dx; b.y += dy;
    const hit = bulletCheck(b, map, tanks, dig);
    if (hit) return hit;
  }
  return null;
}

// ---------- Run-length encoding voor de eenmalige kaart-snapshot ----------
export function rleEncode(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return Uint8Array.from(out);
}

// 16-bit lagen (spoor, plantnummers) als bytes: paren [waarde, aantal] van elk 2 bytes,
// little-endian, zodat het overal hetzelfde leest
export function rleEncode16(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let n = 1;
    while (i + n < arr.length && arr[i + n] === arr[i] && n < 65535) n++;
    out.push(arr[i], n);
    i += n;
  }
  const bytes = new Uint8Array(out.length * 2);
  const view = new DataView(bytes.buffer);
  out.forEach((v, k) => view.setUint16(k * 2, v, true));
  return bytes;
}

export function rleDecode16(bytes, len) {
  const out = new Uint16Array(len);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    const v = view.getUint16(i, true), n = view.getUint16(i + 2, true);
    out.fill(v, p, p + n);
    p += n;
  }
  return out;
}

// Bytes <-> base64 (om binaire lagen in het JSON-instapbericht mee te sturen)
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function rleDecode(rle, len) {
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) {
    out.fill(rle[i], p, p + rle[i + 1]);
    p += rle[i + 1];
  }
  return out;
}
