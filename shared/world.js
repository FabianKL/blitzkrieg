// De wereld waar alle regels mee rekenen: kaartmaat, celtypes, terreinklassen, de tankvorm en
// deterministisch toeval. Geen spelregels; die staan in terrain.js en movement.js.
// Draait identiek op de server en in de browser.
import { BULLETS, DEFAULT_SIZE, DISPLAY, EDGE, GAME, ICE, MAP_SIZES, MINES, NET, T, TANK, TERRAIN, TRACK_ERASER, TUNNEL, VISION, BUILDING as BUILDING_CFG } from './config.js';

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
// band: breedte van de onbegaanbare rand (EDGE.band; 0 = de hele kaart, retro met zijn rotsrand)
export function setMapSize(w, h, band = 0) {
  W = w; H = h; BAND = band;
  ICE_BW = Math.ceil(W / ICE_B); ICE_BH = Math.ceil(H / ICE_B);
}
// Rand van de kaart (§9 van docs/spec-grafische-reparaties.md): het terrein loopt door tot de rand,
// maar een strook van BAND cellen is onbegaanbaar; tanks, kogels en gevaren blijven erbuiten.
export let BAND = 0;
export const edgeBand = (rules) => (rules?.features ? EDGE.band : 0);
export const playable = (x, y) => x >= BAND && y >= BAND && x < W - BAND && y < H - BAND;

// Zichtcirkel in cellen: de halve hoogte van het beeld (viewH in cellen), kleiner gemaakt door
// het weer (inT, in T zoals de spec; VISION.defaultT = vol), nooit kleiner dan minRadius
export const minRadius = () => VISION.minTanks * T; // een tank is T breed (zie de maattest)
export const visionRadius = (viewH, inT = VISION.defaultT) => Math.max(minRadius(), (viewH / 2) * Math.min(1, inT / VISION.defaultT));
// Regels die een kaart kan overschrijven
export const bulletsDig = (rules) => rules?.bulletsDig ?? BULLETS.dig;
export const minimapOn = (rules) => rules?.minimap ?? DISPLAY.minimap;
export const TICK_RATE = NET.tickRate; // simulatiestappen per seconde
export const MAX_PLAYERS = GAME.maxPlayers;

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

// Korte namen voor de getallen uit config.js (TANK, BULLETS, MINES)
export const FUEL_MAX = TANK.fuelMax, SHIELD_MAX = TANK.shieldMax, AMMO_MAX = TANK.ammoMax;
export const IDLE_DRAIN_EVERY = TANK.idleDrainEvery, FIRE_COOLDOWN = TANK.fireCooldown, DEATH_DIG_R = TANK.deathDigR;
export const BULLET_SPEED = BULLETS.speed, BULLET_DAMAGE = BULLETS.damage, BULLET_DIG_R = BULLETS.digR, HIT_DIG_R = BULLETS.hitDigR;
export const MINE_DAMAGE = MINES.damage, MINE_DIG_R = MINES.digR;

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


// Rechthoek [x0, y0, x1, y1] die (x, y) omvat: null = nieuwe rechthoek van die ene cel
export function growBox(box, x, y) {
  if (!box) return [x, y, x, y];
  box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
  box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  return box;
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
export const SPEED_ONE = 256; // snelheid 1.0 (een stap per tick)
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

// Welke cellen kan een tank vanaf from bereiken? Rots, water en muren blokkeren, begroeiing en
// gebouwen niet (die kun je wegschieten). Geeft een Uint8Array met 1 voor elke bereikbare cel.
// band: zoveel cellen langs de rand zijn onbegaanbaar (standaard die van dit potje, BAND; de
// kaartmaker geeft hem zelf mee, zodat dezelfde seed overal dezelfde kaart geeft)
export function reachable(map, from, band = BAND) {
  const blocked = new Int32Array((W + 1) * (H + 1)); // optelsom van blokkerende cellen
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = map[y * W + x];
      const b = isSolid(v) && v !== VEG && v !== BUILDING ? 1 : 0;
      blocked[(y + 1) * (W + 1) + x + 1] = b + blocked[y * (W + 1) + x + 1] + blocked[(y + 1) * (W + 1) + x] - blocked[y * (W + 1) + x];
    }
  }
  const fits = (x, y) => {
    const m = band + TANK_R;
    if (x < m || y < m || x >= W - m || y >= H - m) return false;
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

// ---------- Begroeiing en gebouwen ----------
// Planten en gebouwen delen één nummering (w.veg = nummer + 1, w.vegHp = treffers over).
// Per nummer de lijst van zijn cellen (ook op de client na het instappen opgebouwd)
export function indexVeg(w) {
  w.vegCells = Array.from(w.vegHp, () => []);
  for (let i = 0; i < w.veg.length; i++) if (w.veg[i]) w.vegCells[w.veg[i] - 1].push(i);
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
