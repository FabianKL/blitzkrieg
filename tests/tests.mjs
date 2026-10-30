// De tests zelf. Elke test krijgt de poort van een draaiende testserver.
import { G, Sim, sleep, check, connectBot, mapDiff, waitFor, nextStep } from './helpers.mjs';
import { checkGeneratedMap } from './gen-checks.mjs';
import * as V from '../shared/vision.js';
import * as Wx from '../shared/weather.js';
import * as Hz from '../hazards.js';
import { mapTests } from './maps.mjs';
import { acceptanceTest } from './acceptance.mjs';
import { fingerprints, expectedFingerprints } from './fingerprint.mjs';

const MAP_IDS = Object.keys(G.MAPS);
const countEmpty = (map) => map.reduce((n, v) => n + (v === G.EMPTY ? 1 : 0), 0);

// Rijdt een bot een paar seconden in een richting (tunnels graven)
async function drive(bot, dx, dy, ms) {
  bot.input(dx, dy);
  await sleep(ms);
  bot.input(0, 0);
}

// Kaart zonder server: overal ongegraven terrein van één klasse
function testWorld(cls) {
  const n = G.W * G.H;
  return {
    map: new Uint8Array(n).fill(G.DIRT), terrain: new Uint8Array(n).fill(G.CLASS[cls]), track: new Uint16Array(n),
    veg: new Uint16Array(n), vegHp: new Uint8Array(0), scar: new Uint8Array(n), ice: new Uint8Array(G.ICE_BW * G.ICE_BH),
  };
}

// Een tank ticks lang horizontaal laten rijden met de gedeelde regels (zoals de server)
function simDrive(w, dx, ticks, from = { x: 50, y: 100 }) {
  const t = { x: from.x, y: from.y, dir: G.dirIndex(dx, 0), mv: 0, fuel: 1e6, input: { dx, dy: 0 } };
  G.digTank(w, t.x, t.y, t.dir);
  let steps = 0;
  for (let k = 0; k < ticks; k++) {
    const x = t.x;
    G.moveTank(t, w, []);
    if (t.x !== x) steps++;
    G.digTank(w, t.x, t.y, t.dir);
    G.touchTank(w, t.x, t.y, t.dir);
  }
  return { x: t.x, y: t.y, steps, fuelUsed: 1e6 - t.fuel };
}

// Bot A jaagt op bot B en schiet tot B dood is (of na ms). B komt A een eind tegemoet.
// Vrije schootslijn van A naar B (kogels gaan over grond en water, niet door rots, begroeiing,
// gebouwen of muren)
function lineClear(map, A, B) {
  const n = Math.max(Math.abs(B.x - A.x), Math.abs(B.y - A.y)), sx = Math.sign(B.x - A.x), sy = Math.sign(B.y - A.y);
  for (let k = 4; k < n - 3; k++) {
    const v = map[(A.y + sy * k) * G.W + A.x + sx * k];
    if (v === G.ROCK || v === G.VEG || v === G.BUILDING || v >= G.WALL) return false;
  }
  return true;
}

async function fightUntilKill(a, b, ms = 60000) {
  let killed = false;
  const from = a.events.length;
  const t0 = Date.now();
  let lastPos = '', still = 0, unstick = 0; // vastgelopen bot: even een andere kant op
  while (Date.now() - t0 < ms && !killed) {
    const A = a.me, B = a.state.tanks.get(b.state.me);
    const pos = A ? `${A.x},${A.y}` : '';
    still = pos === lastPos ? still + 1 : 0;
    lastPos = pos;
    if (unstick > 0) { unstick--; await sleep(66); continue; }
    if (A?.a && B?.a && still > 15 && !((B.x === A.x || B.y === A.y))) {
      const [ux, uy] = [[0, 1], [0, -1], [1, 0], [-1, 0]][(Math.random() * 4) | 0];
      a.input(ux, uy, 0);
      unstick = 6;
      still = 0;
      continue;
    }
    if (A?.a && B?.a) {
      // B komt A tegemoet tot ze dichtbij zijn (anders duurt het rijden te lang), en wacht dan
      if (Math.hypot(A.x - B.x, A.y - B.y) > 40) {
        const [bx, by] = nextStep(b.state.map, b.me, (x, y) => Math.hypot(x - A.x, y - A.y) <= 40);
        b.input(bx, by);
      } else b.input(0, 0);
      const dx = B.x - A.x, dy = B.y - A.y;
      if ((dx === 0 || dy === 0) && Math.max(Math.abs(dx), Math.abs(dy)) < 60 && lineClear(a.state.map, A, B)) a.input(Math.sign(dx), Math.sign(dy), 1);
      else {
        const [mx, my] = nextStep(a.state.map, A, (x, y) => Math.max(Math.abs(x - B.x), Math.abs(y - B.y)) <= 8 && (x === B.x || y === B.y) && lineClear(a.state.map, { x, y }, B));
        a.input(mx, my, 0);
      }
    }
    killed = a.events.slice(from).some((e) => e.t === 'k' && e.i === b.state.me);
    await sleep(66);
  }
  a.input(0, 0);
  b.input(0, 0);
  return killed;
}

// Gebouw van 5x5 cellen op (cx, cy) in een testwereld, als nummer 1
function addTestBuilding(w, cx, cy) {
  w.vegHp = Uint8Array.of(G.BUILDING_HP);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) { w.map[y * G.W + x] = G.BUILDING; w.veg[y * G.W + x] = 1; }
  G.indexVeg(w);
}

// Kogel afvuren in een testwereld tot hij ergens op stuit (of na 400 ticks nergens)
function fireTest(w, from, d, dig, tanks = []) {
  const b = { x: from.x, y: from.y, d, owner: -1, fresh: true };
  for (let k = 0; k < 400; k++) {
    const hit = G.stepBullet(b, w.map, tanks, dig);
    if (hit) return { ...hit, x: b.x, y: b.y };
  }
  return null;
}

// Nagebootst potje voor de gevaren (hazards.js draait anders op de server)
function fakeRoom(id, size = 'middel') {
  const { w, h } = G.sizeDims(size);
  G.setMapSize(w, h);
  const world = G.generateMap(4242, G.MAPS[id], G.MAP_SIZES[size].maxPlayers);
  const tank = { id: 0, alive: true, x: world.bases[0].x, y: world.bases[0].y, dir: 0, shield: G.SHIELD_MAX, fuel: 10 };
  return { rules: G.MAPS[id], world, size, tick: 0, tanks: [tank, null, null, null], hz: {} };
}

export const tests = [
  ...mapTests,
  {
    name: 'touch: joystick geeft 8 richtingen, dode zone in het midden',
    async run() {
      const dz = G.TOUCH.deadZone;
      const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
      check(eq(G.stickDirection(0, 0), [0, 0]), 'stilstaande duim rijdt');
      check(eq(G.stickDirection(dz * 0.9, 0), [0, 0]), 'binnen de dode zone rijdt de tank');
      check(eq(G.stickDirection(dz * 1.1, 0), [1, 0]), 'net buiten de dode zone rijdt de tank niet');
      // elke richting van DIRS, ook op ±20° ernaast (binnen de 45° van die richting)
      for (const [dx, dy] of G.DIRS) {
        const a = Math.atan2(dy, dx);
        for (const off of [0, 0.35, -0.35]) {
          const got = G.stickDirection(Math.cos(a + off), Math.sin(a + off));
          check(eq(got, [dx, dy]), `hoek naar (${dx}, ${dy}) ${off ? 'met afwijking ' : ''}gaf (${got})`);
        }
      }
      // grens tussen noord en noordoost ligt op 22,5°
      const b = Math.PI / 8;
      check(eq(G.stickDirection(Math.sin(b - 0.02), -Math.cos(b - 0.02)), [0, -1]), 'net voor 22,5° is niet noord');
      check(eq(G.stickDirection(Math.sin(b + 0.02), -Math.cos(b + 0.02)), [1, -1]), 'net na 22,5° is niet noordoost');
      return '8 richtingen, dode zone en sectorgrenzen kloppen';
    },
  },
  {
    name: 'draaien naast een boom of rots: de tank schuift op en zit nooit klem',
    async run() {
      const out = [];
      // tank rechtop met een boom er direct links naast; naar rechts draaien moet lukken
      for (const [label, side] of [['boom links', -1], ['boom rechts', 1]]) {
        const w = testWorld('normal');
        const t = { x: 100, y: 100, dir: G.dirIndex(0, -1), mv: 0, fuel: 1e6, input: { dx: -side, dy: 0 } };
        for (let y = 90; y <= 110; y++) for (let x = 0; x < 3; x++) w.map[y * G.W + t.x + side * (3 + x)] = G.VEG;
        check(G.probeFootprint(w.map, t.x, t.y, G.dirIndex(-side, 0)) === G.FP_BLOCKED, `${label}: testopzet klopt niet (draaien kon al)`);
        for (let k = 0; k < 5 && t.dir !== G.dirIndex(-side, 0); k++) G.moveTank(t, w, []);
        check(t.dir === G.dirIndex(-side, 0), `${label}: tank kon niet draaien`);
        check(G.probeFootprint(w.map, t.x, t.y, t.dir) !== G.FP_BLOCKED, `${label}: tank staat in de boom`);
        out.push(`${label}: ${Math.abs(t.x - 100)} cel opgeschoven`);
      }
      // schuin tussen bomen (zoals in een bos): rechtop draaien lukt
      const w = testWorld('normal');
      for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) if (Math.abs(x - 100) > 4 && Math.abs(y - 100) < 30) w.map[y * G.W + x] = G.VEG;
      const t = { x: 100, y: 100, dir: G.dirIndex(1, -1), mv: 0, fuel: 1e6, input: { dx: 0, dy: -1 } };
      for (let k = 0; k < 30; k++) G.moveTank(t, w, []);
      check(t.dir === G.dirIndex(0, -1) && t.y < 100, `schuin in een gang: tank kwam niet vooruit (${t.x}, ${t.y}, richting ${t.dir})`);
      // opschuiven gaat niet door een dikke rij bomen heen: dwars in een gang van 5 breed past hij niet
      const v = testWorld('normal');
      for (let y = 0; y < G.H; y++) for (let x = 103; x < 115; x++) v.map[y * G.W + x] = G.VEG;
      for (let y = 0; y < G.H; y++) for (let x = 86; x < 98; x++) v.map[y * G.W + x] = G.VEG;
      const u = { x: 100, y: 100, dir: G.dirIndex(0, -1), mv: 0, fuel: 1e6, input: { dx: 1, dy: 0 } };
      for (let k = 0; k < 10; k++) G.moveTank(u, v, []);
      check(u.dir === G.dirIndex(0, -1) && u.x === 100, 'tank draaide in een gang waar hij dwars niet past');
      out.push('schuin in een gang rechtop gedraaid; dwars in een te smalle gang blijft hij staan');
      return out.join('; ');
    },
  },
  {
    name: 'zelfvernietiging (K): pantser weg, dood, de ander wint de ronde',
    async run(port) {
      const a = await connectBot(port, 'barbarossa');
      const b = await connectBot(port, 'barbarossa');
      await waitFor(() => a.state.game.phase === 'play' && a.me?.a, 4000);
      a.send({ t: 'sd' });
      await waitFor(() => a.events.some((e) => e.t === 'k' && e.i === a.state.me), 2000);
      check(a.events.some((e) => e.t === 'k' && e.i === a.state.me), 'geen dood na zelfvernietiging');
      check(a.me.s === 0 || !a.me.a, `pantser ${a.me.s} na zelfvernietiging`);
      await waitFor(() => a.events.some((e) => e.t === 'r'), 2000);
      check(a.events.some((e) => e.t === 'r'), 'ronde niet voorbij');
      const r = a.events.find((e) => e.t === 'r');
      check(r.w === b.state.me, `ronde gewonnen door ${r.w}, verwacht de ander (${b.state.me})`);
      for (const x of [a, b]) x.close();
      return 'K: dood, de ander wint de ronde';
    },
  },
  {
    name: 'begroeiing wegschieten maakt een doorgang waar een tank door past (recht en schuin)',
    async run() {
      const out = [];
      for (const [dx, dy] of [[1, 0], [1, 1], [0, 1]]) {
        // een bos van 40x40 cellen, in vakken van 1 T (elk een plant met 2 treffers)
        const w = testWorld('soft');
        const hp = [];
        for (let y = 80; y < 120; y++) for (let x = 120; x < 160; x++) {
          const key = ((y / G.T) | 0) * 1000 + ((x / G.T) | 0);
          if (!hp[key]) hp[key] = hp.filter(Boolean).length + 1;
          w.map[y * G.W + x] = G.VEG; w.veg[y * G.W + x] = hp[key];
        }
        w.vegHp = new Uint8Array(hp.filter(Boolean).length).fill(2);
        G.indexVeg(w);
        // tank voor het bos schiet steeds rechtdoor tot er een gang is, en rijdt dan verder
        const d = G.dirIndex(dx, dy);
        const t = { x: 100, y: 100 - (dy && !dx ? 30 : 0) - (dx && dy ? 20 : 0), dir: d, mv: 0, fuel: 1e6, input: { dx, dy } };
        if (dx === 0) t.x = 140;
        let shots = 0;
        for (let tick = 0; tick < 3000 && shots < 200; tick++) {
          const x0 = t.x, y0 = t.y;
          G.moveTank(t, w, []);
          G.digTank(w, t.x, t.y, t.dir);
          if (t.x === x0 && t.y === y0) { // vast: schieten
            const b = { x: t.x + dx * (G.TANK_R + 1), y: t.y + dy * (G.TANK_R + 1), d, owner: -1, fresh: true };
            for (let k = 0; k < 100; k++) { const hit = G.stepBullet(b, w.map, []); if (hit) { if (hit.kind === 'solid') G.hitObstacle(w, b.x, b.y); break; } }
            shots++;
          }
          if ((dx && t.x > 165) || (!dx && t.y > 125)) break;
        }
        check((dx && t.x > 165) || (!dx && t.y > 125), `richting ${dx},${dy}: tank kwam niet door het bos (${shots} schoten, staat op ${t.x},${t.y})`);
        out.push(`${['recht', 'schuin', 'omlaag'][out.length]} ${shots} schoten`);
      }
      return `door 40 cellen bos: ${out.join(', ')}`;
    },
  },
  {
    name: 'gevaren en schaarse middelen (Ardennen): barrage met waarschuwing in het bos, brandstofdepots per ronde',
    async run() {
      try {
        const room = fakeRoom('ardennen'), t = room.tanks[0], events = [];
        const hurt = (tank, pct, ev) => { tank.shield -= (pct * G.SHIELD_MAX) / 100; ev.push({ t: 'hint', i: tank.id }); };
        Hz.roundStart(room, events);
        const dep = events.find((e) => e.t === 'dep');
        check(dep?.list.length === 2, `${dep?.list.length} depots op middel, verwacht 2`);
        // depot: erover rijden = voltanken, daarna leeg
        [t.x, t.y] = dep.list[0];
        Hz.step(room, 1, events, hurt);
        check(t.fuel === G.FUEL_MAX && dep.list[0][2] === 0 && events.some((e) => e.t === 'depu'), 'depot tankte niet vol of bleef vol');
        t.fuel = 10;
        Hz.step(room, 2, events, hurt);
        check(t.fuel === 10, 'leeg depot tankte nog');
        // barrage: na 20 s aangekondigd, 2 s later inslag; wie bij het bos in het vak staat verliest 15%
        let tick = 3;
        for (; tick < 25 * G.TICK_RATE && !events.some((e) => e.t === 'z'); tick++) Hz.step(room, tick, events, hurt);
        const z = events.find((e) => e.t === 'z');
        check(z && Math.abs(tick - 20 * G.TICK_RATE) <= 2, `barrage aangekondigd na ${tick} ticks, verwacht 20 s`);
        check(z.at - tick === 2 * G.TICK_RATE - 1 || z.at - tick === 2 * G.TICK_RATE, 'waarschuwing niet 2 s van tevoren');
        // tank naast het bos in het vak zetten
        const [x0, y0, x1, y1] = z.box;
        let spot = null;
        for (let y = y0; y <= y1 && !spot; y++) for (let x = x0; x <= x1 && !spot; x++) if (room.world.map[y * G.W + x] === G.VEG) spot = [x, y];
        [t.x, t.y] = spot;
        for (; tick <= z.at; tick++) Hz.step(room, tick, events, hurt);
        check(t.shield === G.SHIELD_MAX * 0.85, `pantser ${t.shield} na de barrage, verwacht 85`);
        check(events.some((e) => e.t === 'zb') && events.some((e) => e.t === 'hint'), 'geen inslag of geen hint');
        check(room.world.scar.some((v) => v === G.SCAR_TREETOPS), 'geen kapotte boomtoppen');
        // nieuwe ronde: depots op een nieuwe plek
        const before = JSON.stringify(dep.list);
        Hz.roundStart(room, events);
        check(JSON.stringify(events.filter((e) => e.t === 'dep').pop().list) !== before, 'depots niet verplaatst');
        const big = fakeRoom('ardennen', 'groot'), ev2 = [];
        Hz.roundStart(big, ev2);
        check(ev2.find((e) => e.t === 'dep').list.length === 3, 'niet 3 depots op groot');
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return 'barrage elke 20 s, 2 s waarschuwing, -15% bij het bos; 2 depots (3 op groot), één vulling, elke ronde nieuw';
    },
  },
  {
    name: 'weer: regels per ronde en timer, kleinste zichtstraal, mist die optrekt, regen alleen bij water',
    async run() {
      const A = G.MAPS.ardennen;
      // Ardennen §10.8: mist 2 → 12 T in 2 minuten (ronde 1 en 2), storm elke 90 s 20 s lang, vanaf ronde 3 opklaring
      check(Wx.weatherAt(A, 1, 0, 0).visibility === 2, 'mist begint niet op 2 T');
      check(Math.abs(Wx.weatherAt(A, 1, 60, 60).visibility - 7) < 0.01, 'mist na 60 s niet op 7 T');
      check(Wx.weatherAt(A, 2, 400, 130).visibility === 12 || Wx.weatherAt(A, 2, 400, 130).visibility === null, 'mist niet opgetrokken na 2 minuten');
      check(Wx.weatherAt(A, 1, 75, 75).visibility === 4 && Wx.weatherAt(A, 1, 75, 75).burial, 'storm: kleinste zichtstraal (4 T) en onderduiken');
      check(Wx.weatherAt(A, 2, 200, 0).flags.fog && !Wx.weatherAt(A, 3, 200, 0).flags.fog, 'opklaring vanaf ronde 3');
      // terugkerend weer vanaf een ronde, en een sporenwisser alleen bij water
      const rules = { weather: [{ label: 'Regenbui', from: { round: 2 }, every: 120, duration: 20, effect: { visibility: 8, trackEraser: 'nearWater' } }] };
      check(!Wx.weatherAt(rules, 1, 110, 110).eraser, 'regen in ronde 1');
      check(Wx.weatherAt(rules, 2, 500, 110).eraser === 'nearWater' && !Wx.weatherAt(rules, 2, 500, 50).eraser, 'regenbui niet op 100–120 s in ronde 2');
      check(Wx.weatherAt(rules, 2, 500, 45, 0.5).visibility === null && Wx.weatherAt(rules, 2, 500, 55, 0.5).visibility === 8, 'snelle klok klopt niet');
      const w = testWorld('soft');
      for (let x = 100; x < 110; x++) w.map[100 * G.W + x] = G.WATER;
      simDrive(w, 1, 80, { x: 120, y: 100 }); // tunnel vlak bij het water
      simDrive(w, 1, 80, { x: 250, y: 100 }); // en een ver weg
      for (let s = 1; s <= 120; s++) G.fadeStep(w, s * G.FADE_CHECK, 'nearWater');
      check(w.map[100 * G.W + 118] === G.DIRT && w.map[100 * G.W + 255] === G.EMPTY, 'regenbui wiste sporen ver van het water (of niet bij het water)');
      return 'mist 2→12 T, storm 4 T, opklaring ronde 3, regen alleen binnen 3 T van water';
    },
  },
  {
    name: 'onderduiken: 2 s stil in de storm = bedekt en onzichtbaar, tot rijden of schieten',
    async run(port) {
      const a = await connectBot(port, 'el-alamein');
      const b = await connectBot(port, 'el-alamein');
      // testserver: weer 20x zo snel, dus elke 4,5 s een storm van 1 s; even wachten op een storm
      await waitFor(() => a.state.weather?.burial, 8000);
      check(a.state.weather?.burial, 'geen storm met onderduiken');
      await waitFor(() => b.state.tanks.get(a.state.me)?.b === 1, 3000);
      check(b.state.tanks.get(a.state.me)?.b === 1, 'stilstaande tank niet bedekt in de storm');
      await drive(a, 0, 1, 500);
      await sleep(200);
      check(b.state.tanks.get(a.state.me)?.b === 0, 'bedekte tank bleef bedekt na rijden');
      for (const x of [a, b]) x.close();
      return 'bedekt na 2 s stil in de storm, weer zichtbaar na rijden';
    },
  },
  {
    name: 'zicht: zichtcirkel rondom, obstakels en rook overal, langs randen kijken alleen in de kijkboog, contour, 8 richtingen, gehoorafstand',
    async run() {
      const w = testWorld('soft'), map = w.map;
      // kijkt naar rechts (ang 0); venster 140 x 96 rond de tank, dus cirkel 48 cellen
      const me = { x: 100, y: 100, ang: 0 }, view = { x: 30, y: 52, w: 140, h: 96 }, r = G.visionRadius(view.h);
      const opts = { radius: r, view }, smoke = (x) => [{ x, y: 101, r: 3 }];
      check(r === 48, `zichtcirkel ${r}, verwacht de halve hoogte van het venster (48)`);
      check(V.sightOf(map, me, { x: 100 + r - 2, y: 100 }, opts) === 'sharp', 'binnen de cirkel niet scherp');
      check(V.sightOf(map, me, { x: 100 + r + 10, y: 100 }, opts) === 'contour', 'buiten de cirkel in de boog geen contour');
      check(V.sightOf(map, me, { x: 100 + 90, y: 100 }, opts) === null, 'buiten het venster toch iets te zien');
      check(V.sightOf(map, me, { x: 110, y: 100, buried: true }, opts) === null, 'bedekte tank te zien');
      // binnen de cirkel rondom; buiten de cirkel alleen in de kijkboog van 130 graden
      const at = (deg, d) => ({ x: Math.round(100 + Math.cos((deg * Math.PI) / 180) * d), y: Math.round(100 + Math.sin((deg * Math.PI) / 180) * d) });
      check(V.sightOf(map, me, at(70, 30), opts) === 'sharp' && V.sightOf(map, me, at(180, 30), opts) === 'sharp', 'binnen de cirkel niet rondom te zien');
      check(V.sightOf(map, me, at(60, r + 6), opts) === 'contour', 'buiten de cirkel, 60 graden opzij (in de boog), geen contour');
      check(V.sightOf(map, me, at(70, r + 6), opts) === null && V.sightOf(map, me, at(180, r + 6), opts) === null, 'buiten de cirkel en de boog toch iets te zien');
      // obstakels en rook verbergen overal wat erachter ligt, voor en achter je
      const put = (x, cell) => { map[100 * G.W + x] = cell; };
      for (const [cell, name] of [[G.BUILDING, 'gebouw'], [G.VEG, 'begroeiing'], [G.ROCK, 'rots']]) {
        put(108, cell); put(92, cell);
        check(V.sightOf(map, me, { x: 115, y: 100 }, opts) === null, `${name} in de boog blokkeert het zicht niet`);
        check(V.sightOf(map, me, { x: 85, y: 100 }, opts) === null, `${name} achter je blokkeert het zicht niet`);
        check(!V.visibleCell(map, me, 115, 100, r) && !V.visibleCell(map, me, 85, 100, r), `${name}: de schaduw volgt de zichtregel niet`);
        // in de boog zie je het obstakel zelf (de rand), achter je niet
        check(V.visibleCell(map, me, 108, 100, r) && !V.visibleCell(map, me, 92, 100, r), `${name}: zicht op het obstakel zelf klopt niet`);
        // net langs een hoek kijken (obstakel vlak voor de tank): in de boog wel, achter je niet
        put(108, G.DIRT); put(92, G.DIRT); put(112, cell); put(88, cell);
        check(V.sightOf(map, me, { x: 115, y: 100 }, opts) === 'sharp', `${name}: in de boog niet langs de hoek te zien`);
        check(V.sightOf(map, me, { x: 85, y: 100 }, opts) === null, `${name}: achter je toch langs de hoek te zien`);
        put(112, G.DIRT); put(88, G.DIRT);
      }
      put(108, G.WATER); put(92, G.WATER);
      check(V.sightOf(map, me, { x: 115, y: 100 }, opts) === 'sharp' && V.sightOf(map, me, { x: 85, y: 100 }, opts) === 'sharp', 'water blokkeert het zicht');
      check(V.sightOf(map, me, { x: 115, y: 100 }, { ...opts, smokes: smoke(108) }) === null, 'rook in de boog blokkeert het zicht niet');
      check(V.sightOf(map, me, { x: 85, y: 100 }, { ...opts, smokes: smoke(92) }) === null, 'rook achter je blokkeert het zicht niet');
      check(!V.visibleCell(map, me, 115, 100, r, smoke(108)), 'rook: de schaduw volgt de zichtregel niet');
      check(!V.visibleCell(map, me, 40, 100, r) && V.visibleCell(map, me, 70, 100, r), 'schaduw achter je, buiten de cirkel, klopt niet');
      // weer maakt de cirkel kleiner (in T, 12 T = vol), nooit kleiner dan 2 tankbreedtes
      check(G.visionRadius(96, 6) === 24 && G.visionRadius(96, 2) === G.minRadius() && G.visionRadius(96, 20) === 48, 'weer en zichtcirkel kloppen niet');
      check(V.contourAlpha(r, r, 80) > V.contourAlpha(70, r, 80) && V.contourAlpha(80, r, 80) === 0, 'contour wordt niet vager naar de rand');
      const dirs = [[0, -5], [5, -5], [5, 0], [5, 5], [0, 5], [-5, 5], [-5, 0], [-5, -5]].map(([dx, dy]) => V.hintDirection(dx, dy)).join('');
      check(dirs === '01234567', `richtingen ${dirs}, verwacht 01234567`);
      check(V.canHear(me, 100 + 20 * G.T, 100) && !V.canHear(me, 100 + 20 * G.T + 1, 100), 'gehoorafstand is niet 20 T');
      // hints: alleen voor wat je niet scherp ziet; eigen geluiden en buiten gehoor niet
      const ctx = (seen) => ({ me, self: 0, seenOf: () => seen, posOf: () => ({ x: 150, y: 100 }) });
      const shot = { t: 'b', x: 150, y: 100, i: 1 };
      check(V.hintSource(shot, ctx('sharp')) === null, 'hint voor een schot dat je ziet');
      check(V.hintSource(shot, ctx('contour')) && V.hintSource(shot, ctx(null)), 'geen hint voor een schot buiten je zichtcirkel');
      check(V.hintSource({ ...shot, i: 0 }, ctx(null)) === null, 'hint voor je eigen schot');
      check(V.hintSource({ ...shot, x: 100 + 20 * G.T + 5 }, ctx(null)) === null, 'hint voor een schot buiten gehoorafstand');
      check(V.hintSource({ t: 'x', fell: true, x: 150, y: 100, o: 1 }, ctx(null)) && !V.hintSource({ t: 'x', x: 150, y: 100, o: 1 }, ctx(null)), 'begroeiing kapot: hint klopt niet');
      check(V.hintSource({ t: 'c', i: 1 }, ctx(null)), 'geen hint voor krakend ijs');
      check(V.hintSource({ t: 'hint', x: 900, y: 900, i: 1 }, ctx(null)) && !V.hintSource({ t: 'hint', x: 900, y: 900, i: 1 }, ctx('sharp')), 'grote gebeurtenis: hint klopt niet');
      check(V.hintSource(shot, { ...ctx(null), me: null }) === null, 'hint terwijl je dood bent');
      return `zichtcirkel ${r} cellen (halve vensterhoogte, minstens ${G.minRadius()}), boog ${G.VISION.coneDegrees} graden, gehoor ${V.hearingCells()} cellen`;
    },
  },
  {
    name: 'kaartmaker (§6): percentages, bases, vensterregel, bruggen, bossen, dorp, routes (kort; volledig: npm run test:gen)',
    async run() {
      const out = [];
      try {
        for (const id of Object.keys(G.MAPS).filter((k) => G.MAPS[k].features)) {
          for (const [size, players] of [['klein', 2], ['middel', 4], ['groot', 3]]) {
            const { w, h } = G.sizeDims(size);
            G.setMapSize(w, h);
            for (let seed = 1; seed <= 3; seed++) checkGeneratedMap(id, G.generateMap(seed * 31337, G.MAPS[id], players), players, size);
          }
          out.push(id);
        }
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return `${out.join(', ')}: klein/middel/groot, elk 3 kaarten goed`;
    },
  },
  {
    name: 'wachtkamer: host kiest kaart en grootte, anderen niet, start; tijdens het spel niet kiezen; host STOP = terug naar de wachtkamer; gast weg = rest speelt door; host gaat weg → volgende is host',
    async run(port) {
      const a = await connectBot(port, 'blitzkrieg');
      const b = await connectBot(port, 'blitzkrieg');
      await sleep(200);
      check(a.state.lobby && a.state.game.phase === 'lobby', `fase ${a.state.game.phase}, verwacht wachtkamer`);
      check(a.state.host === a.state.me && b.state.host === a.state.me, `host is ${a.state.host}, verwacht A`);
      check(a.state.mapId === G.DEFAULT_MAP, `begint op ${a.state.mapId}`);
      // in de wachtkamer staat alles stil
      const x0 = a.me.x, y0 = a.me.y;
      await drive(a, 0, 1, 600);
      check(a.me.x === x0 && a.me.y === y0, 'tank reed in de wachtkamer');
      // B is geen host: zijn keuze wordt genegeerd
      b.send({ t: 'cfg', map: 'carentan', size: 'middel' });
      await sleep(400);
      check(a.state.mapId === G.DEFAULT_MAP, 'niet-host kon de kaart kiezen');
      // nog niet gebouwde kaart: genegeerd
      a.send({ t: 'cfg', map: 'bestaat-niet', size: 'middel' });
      await sleep(400);
      check(a.state.mapId === G.DEFAULT_MAP, 'kaart die niet bestaat werd gekozen');
      // host kiest: iedereen krijgt de nieuwe kaart en grootte
      a.send({ t: 'cfg', map: 'el-alamein', size: 'klein' });
      await waitFor(() => b.state.mapId === 'el-alamein', 3000);
      check(b.state.mapId === 'el-alamein' && b.state.size === 'klein' && G.W === 300, `B ziet ${b.state.mapId} ${b.state.size}`);
      check(mapDiff(a.state.map, b.state.map) === 0, 'kaarten van A en B verschillen');
      // klein = 2 spelers: een derde kan er niet bij
      const c = await connectBot(port, 'blitzkrieg').catch(() => null);
      check(!c, 'derde speler kon instappen op een kleine kaart');
      // start: spel loopt, menu's dicht
      b.send({ t: 'start' });
      await sleep(300);
      check(a.state.game.phase === 'lobby', 'niet-host kon starten');
      a.send({ t: 'start' });
      await waitFor(() => b.state.game.phase === 'play', 2000);
      check(b.state.game.phase === 'play', `na start fase ${b.state.game.phase}`);
      // brug, munitiedepot e.d. komen na de start alsnog mee (het instapbericht was al weg)
      check(b.events.some((e) => e.t === 'hz'), 'geen hz-gebeurtenis bij de start');
      // tijdens het spel kiezen: genegeerd, ook voor de host (eerst STOP)
      b.send({ t: 'cfg', map: 'ardennen', size: 'middel' });
      a.send({ t: 'cfg', map: 'carentan', size: 'middel' });
      await sleep(400);
      check(b.state.mapId === 'el-alamein' && b.state.game.phase === 'play', `kaart wisselde tijdens het spel: ${b.state.mapId} ${b.state.game.phase}`);
      // gast STOP doet niets, host STOP: iedereen terug naar de wachtkamer
      b.send({ t: 'stop' });
      await sleep(300);
      check(a.state.game.phase === 'play', 'gast kon het spel stoppen');
      a.send({ t: 'stop' });
      await waitFor(() => b.state.game.phase === 'lobby', 3000);
      check(a.state.game.phase === 'lobby' && b.state.game.phase === 'lobby', `na STOP fase ${b.state.game.phase}`);
      // nu kan de host weer kiezen
      a.send({ t: 'cfg', map: 'carentan', size: 'middel' });
      await waitFor(() => b.state.mapId === 'carentan', 4000);
      check(b.state.mapId === 'carentan' && b.state.size === 'middel' && b.state.game.phase === 'lobby', `na STOP kiezen: ${b.state.mapId} ${b.state.size} ${b.state.game.phase}`);
      check(mapDiff(a.state.map, b.state.map) === 0, 'na kiezen: kaarten verschillen');
      // gast stapt uit tijdens het spel: de anderen spelen door
      const c2 = await connectBot(port, 'blitzkrieg');
      await sleep(200);
      a.send({ t: 'start' });
      await waitFor(() => c2.state.game.phase === 'play', 2000);
      c2.close();
      await waitFor(() => !a.state.tanks.has(c2.state.me), 2000);
      check(a.state.game.phase === 'play' && !a.state.tanks.has(c2.state.me), 'na vertrek van een gast: spel stopte of tank bleef staan');
      // host gaat weg: B wordt host
      a.close();
      await waitFor(() => b.state.host === b.state.me, 2000);
      check(b.state.host === b.state.me, `host na vertrek ${b.state.host}, verwacht B`);
      b.close();
      return 'alleen de host kiest (in de wachtkamer) en start, STOP = wachtkamer, kleine kaart max 2, host gaat over';
    },
  },
  {
    name: 'wachtkamer: na START komen brug (Market Garden) en munitiedepot (Fall Gelb) alsnog naar de browser',
    async run(port) {
      const a = await connectBot(port, 'blitzkrieg');
      await sleep(200);
      const out = [];
      for (const [map, ok] of [['market-garden', (hz) => hz.bridge?.cells.length > 0], ['fall-gelb', (hz) => Array.isArray(hz.ammoDepot)]]) {
        a.send({ t: 'cfg', map, size: 'middel' });
        await waitFor(() => a.state.mapId === map, 4000);
        a.events.length = 0;
        a.send({ t: 'start' });
        await waitFor(() => a.events.some((e) => e.t === 'hz'), 2000);
        const e = a.events.find((x) => x.t === 'hz');
        check(e && ok(e.hz), `${map}: geen hz met brug/depot na START`);
        check(map !== 'market-garden' || a.state.bridge?.cells.length, 'browser kent de brug niet');
        check(map !== 'fall-gelb' || a.state.ammoDepot, 'browser kent het munitiedepot niet');
        a.send({ t: 'stop' });
        await waitFor(() => a.state.game.phase === 'lobby', 3000);
        out.push(map);
      }
      a.close();
      return out.join(', ');
    },
  },
  {
    name: 'tanks: per kaart alleen een ander uiterlijk, 4 varianten, eigenschappen overal gelijk',
    async run() {
      const LOOK = new Set(['name', 'hull', 'mark', 'number', 'camo', 'winter', 'sprite', 'paint']); // alleen uiterlijk (sprite, paint: tekening)
      const out = [];
      for (const [id, rules] of Object.entries(G.MAPS)) {
        if (id === 'retro') continue;
        check(rules.tanks?.A && rules.tanks?.B, `${id}: geen ploeg A en B`);
        for (const spec of Object.values(rules.tanks)) {
          for (const k of Object.keys(spec)) check(LOOK.has(k), `${id}: tank heeft eigenschap ${k} (alleen uiterlijk mag per kaart)`);
        }
        const teams = G.teamsFor(rules);
        check(teams.length === 4 && new Set(teams.map((t) => t.name)).size === 4, `${id}: 4 verschillende tanks`);
        check(rules.header && rules.style, `${id}: titel of weergave ontbreekt`);
        out.push(`${id}: ${teams[0].name}/${teams[1].name}`);
      }
      check(G.MAP_MENU.length === 10 && G.MAP_MENU.every((m, i) => i === 0 || m.year >= G.MAP_MENU[i - 1].year), 'menu: 10 maps chronologisch');
      return out.join(', ');
    },
  },
  {
    name: 'rondes: winnaar van een ronde en van het spel (2 spelers rondes, meer spelers kills)',
    async run() {
      const p = (id, alive) => ({ id, alive });
      check(G.roundWinner([p(0, true), p(1, false)]) === 0, 'wie overblijft wint de ronde');
      check(G.roundWinner([p(0, false), p(1, false)]) === -1, 'tegelijk dood: niemand wint');
      check(G.roundWinner([p(0, true), p(1, true), p(2, false)]) === -1, 'bij 3 spelers wint niemand een ronde (kills tellen)');
      const s = (id, rounds, kills) => ({ id, rounds, kills });
      const cfg = { roundsToWin: 3, killsToWin: 5 };
      check(G.gameWinner([s(0, 2, 9), s(1, 1, 0)], cfg) === -1, '2 spelers: kills tellen niet');
      check(G.gameWinner([s(0, 3, 0), s(1, 1, 0)], cfg) === 0, '2 spelers: 3 rondes wint');
      check(G.gameWinner([s(0, 9, 4), s(1, 0, 3), s(2, 0, 0)], cfg) === -1, '3 spelers: rondes tellen niet');
      check(G.gameWinner([s(0, 0, 4), s(1, 0, 5), s(2, 0, 0)], cfg) === 1, '3 spelers: 5 kills wint');
      check(G.score({ rounds: 2, kills: 7 }, 2) === 2 && G.score({ rounds: 2, kills: 7 }, 4) === 7, 'score volgt de telwijze');
      return `2 spelers: ${G.GAME.roundsToWin} rondes, meer: ${G.GAME.killsToWin} kills; tegelijk dood = niemand`;
    },
  },
  {
    name: 'ronde en spel via de server: dood → iedereen terug in de basis, kaart blijft; winst → nieuw spel',
    async run(port) {
      const a = await connectBot(port, 'barbarossa');
      const b = await connectBot(port, 'barbarossa');
      await drive(b, 0, 1, 1500); // B graaft een stukje, zodat er tunnels liggen
      check(await fightUntilKill(a, b), 'ronde 1: A kon B niet vernietigen');
      await waitFor(() => a.events.some((e) => e.t === 'r'), 2000);
      const r = a.events.find((e) => e.t === 'r');
      check(r && r.w === a.state.me, `ronde gewonnen door ${r?.w}, verwacht A (${a.state.me})`);
      const tunnels = countEmpty(a.state.map);
      await waitFor(() => a.state.game.round === 2, 6000);
      await sleep(300);
      check(a.state.game.round === 2 && b.state.game.round === 2, `rondenummer A ${a.state.game.round}, B ${b.state.game.round}`);
      for (const bot of [a, b]) {
        const me = bot.me, map = bot.state.map;
        check(me.a === 1 && map[me.y * G.W + me.x] === G.BASE + bot.state.me, `tank ${bot.state.me} staat niet in zijn basis`);
        check(me.s === G.SHIELD_MAX && me.f === 100 && me.m === G.AMMO_MAX, `tank ${bot.state.me} niet vol: ${me.s}/${me.f}/${me.m}`);
      }
      check(a.me.c === 1 && a.state.tanks.get(b.state.me).c === 0, `score A ${a.me.c}, B ${a.state.tanks.get(b.state.me).c}`);
      // sporen vervagen vanzelf (per klasse), maar de kaart wordt niet opnieuw gestuurd
      const n2 = a.events.find((e) => e.t === 'n' && e.n === 2);
      check(n2 && n2.m0 === undefined && countEmpty(a.state.map) >= tunnels / 2, `tunnels van ronde 1 zijn weg (${countEmpty(a.state.map)} van ${tunnels})`);
      check(mapDiff(a.state.map, b.state.map) === 0, 'kaart van A en B verschillen in ronde 2');
      // tweede kill: A heeft 2 rondes = gewonnen (testserver: roundsToWin 2)
      check(await fightUntilKill(a, b), 'ronde 2: A kon B niet vernietigen');
      await waitFor(() => a.events.some((e) => e.t === 'g'), 2000);
      const g = a.events.find((e) => e.t === 'g');
      check(g && g.w === a.state.me && a.state.game.phase === 'over', `spel gewonnen door ${g?.w}`);
      // daarna een nieuw spel: nieuw instapbericht, ronde 1, scores 0, verse kaart
      await waitFor(() => a.state.game.phase === 'play' && a.state.game.round === 1, 12000);
      await sleep(300);
      check(a.state.game.round === 1 && a.me.c === 0, `nieuw spel: ronde ${a.state.game.round}, score ${a.me.c}`);
      check(countEmpty(a.state.map) < tunnels, 'nieuw spel heeft de tunnels van het oude');
      for (const x of [a, b]) x.close();
      return `ronde 1 → 2 met tunnels, spel gewonnen na 2 rondes, daarna ronde 1 op een verse kaart`;
    },
  },
  {
    name: 'maten: T, kleinste zichtcirkel en kaartgroottes (alle kaarten op elke grootte, bases bereikbaar)',
    async run() {
      const width = Math.max(...G.MASKS[2].map((c) => c.y)) - Math.min(...G.MASKS[2].map((c) => c.y)) + 1;
      check(width === G.T, `tank is ${width} cellen breed, T = ${G.T}`);
      check(G.minRadius() === G.VISION.minTanks * width, 'kleinste zichtcirkel is niet het aantal tankbreedtes uit de config');
      const out = [];
      try {
        for (const size of Object.keys(G.MAP_SIZES)) {
          const { w, h } = G.sizeDims(size);
          G.setMapSize(w, h);
          check(w === Math.round(400 * G.MAP_SIZES[size].factor), `${size}: breedte ${w}`);
          for (const id of MAP_IDS) {
            for (let seed = 1; seed <= 3; seed++) {
              const m = G.generateMap(seed * 7717, G.MAPS[id], G.MAP_SIZES[size].maxPlayers);
              check(m.map.length === w * h, `${size} ${id}: kaart van ${m.map.length} cellen`);
              const seen = G.reachable(m.map, m.bases[0]);
              check(m.bases.every((b) => seen[b.y * w + b.x]), `${size} ${id} seed ${seed}: basis onbereikbaar`);
            }
          }
          out.push(`${size} ${w}x${h}`);
        }
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return `T = ${G.T} cellen, kleinste zichtcirkel ${G.minRadius()} cellen; ${out.join(', ')}`;
    },
  },
  {
    name: 'kaartgrootte via de server: klein heeft plaats voor 2 spelers',
    async run(port) {
      const a = await connectBot(port, 'carentan&size=klein');
      const b = await connectBot(port, 'carentan&size=klein');
      await sleep(200);
      check(a.state.size === 'klein' && G.W === 300, `potje is ${a.state.size}, kaart ${G.W} breed`);
      const c = await connectBot(port, 'carentan').catch(() => null); // krijgt 'vol' in plaats van een kaart
      check(!c, 'derde speler kon instappen op een kleine kaart');
      for (const x of [a, b]) x.close();
      await sleep(400);
      const d = await connectBot(port); // leeg potje zonder grootte: weer middel
      await sleep(200);
      check(d.state.size === 'middel' && G.W === 400, `na leeglopen ${d.state.size}, kaart ${G.W} breed`);
      d.close();
      return 'klein = 300x188 voor 2 spelers, daarna weer middel';
    },
  },
  {
    name: 'kogels: over grond en water, stoppen bij rots, plant, gebouw en tank; graven alleen met bulletsDig',
    async run() {
      const w = testWorld('soft');
      const row = 100 * G.W;
      for (let x = 80; x < 90; x++) w.map[row + x] = G.WATER;
      w.map[row + 150] = G.ROCK;
      let hit = fireTest(w, { x: 50, y: 100 }, 2, false);
      check(hit?.kind === 'solid' && hit.x === 150, `kogel stopte bij ${hit?.x} (${hit?.kind}), verwacht rots op 150`);
      check(countEmpty(w.map) === 0, 'kogel heeft gegraven');
      hit = fireTest(w, { x: 50, y: 100 }, 2, true);
      check(hit?.kind === 'dirt' && hit.x <= 53, `met bulletsDig stopte hij bij ${hit?.x} (${hit?.kind}), verwacht meteen in de grond`);
      addTestBuilding(w, 120, 100);
      hit = fireTest(w, { x: 50, y: 100 }, 2, false);
      check(hit?.kind === 'solid' && hit.x === 118, `kogel stopte bij ${hit?.x}, verwacht gebouw op 118`);
      const tank = { id: 9, alive: true, x: 100, y: 100, dir: 0 };
      hit = fireTest(w, { x: 50, y: 100 }, 2, false, [tank]);
      check(hit?.kind === 'tank', `kogel raakte ${hit?.kind}, verwacht de tank`);
      check(G.bulletsDig(G.MAPS.retro) && !G.bulletsDig(G.MAPS.carentan), 'retro graaft, de rest niet');
      return 'over water heen, stopt bij rots, gebouw en tank, graaft alleen in retro';
    },
  },
  {
    name: 'gebouwen: 4 treffers, dan puin (zacht, vervaagt nooit), tellen als passeerbaar',
    async run() {
      const w = testWorld('normal');
      addTestBuilding(w, 100, 100);
      const i = 100 * G.W + 100;
      check(G.isSolid(G.BUILDING), 'gebouw is niet onbegaanbaar');
      check(G.reachable(w.map, { x: 60, y: 100 })[i - 9], 'gebouw blokkeert de routecontrole');
      for (let k = 1; k < G.BUILDING_HP; k++) check(!G.hitObstacle(w, 100, 100) && w.map[i] === G.BUILDING, `gebouw weg na ${k} treffer(s)`);
      check(G.hitObstacle(w, 100, 100), `gebouw niet weg na ${G.BUILDING_HP} treffers`);
      check(w.map[i] === G.DIRT && w.terrain[i] === G.CLASS.soft && w.scar[i] === G.SCAR_RUBBLE, 'puin is geen zachte grond met puinpatroon');
      // erdoor graven en dan eindeloos vervagen, ook in de storm: het puinspoor blijft
      simDrive(w, 1, 80, { x: 90, y: 100 });
      check(w.map[i] === G.EMPTY, 'tank kon niet door het puin graven');
      const before = w.track[i];
      for (let s = 1; s <= 300; s++) G.fadeStep(w, s * G.FADE_CHECK, true);
      check(w.map[i] === G.EMPTY && w.track[i] === before, 'puin vervaagde');
      return `weg na ${G.BUILDING_HP} treffers, puin blijft`;
    },
  },
  {
    name: 'kaart: vrije uitrijstrook voor elke basisdeur en alle bases bereikbaar (300 kaarten)',
    async run() {
      let checked = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const w = G.generateMap(seed * 7919, G.MAPS[MAP_IDS[seed % MAP_IDS.length]]);
        const seen = G.reachable(w.map, w.bases[0]);
        for (const b of w.bases) check(seen[b.y * G.W + b.x], `seed ${seed * 7919}: basis (${b.x}, ${b.y}) niet bereikbaar vanaf basis 1`);
        for (const b of w.bases) {
          const y0 = b.y - (G.BASE_H >> 1);
          for (const [doorY, dir] of [[y0, -1], [y0 + G.BASE_H - 1, 1]]) {
            // (alleen als het echt niet anders kon, w.bases.doorRelaxed, is de strook 3 T: de spec)
            for (let d = 1; d <= (w.bases.doorRelaxed ? 3 * G.T : G.DOOR_CLEAR); d++) {
              for (let x = b.x - 7; x <= b.x + 7; x++) {
                const y = doorY + dir * d;
                check(!G.isSolid(w.map[y * G.W + x]), `seed ${seed * 7919}: rots/muur op (${x}, ${y}), ${d} cellen voor een deur`);
              }
            }
            checked++;
          }
        }
      }
      return `${checked} deuren: overal ${G.DOOR_CLEAR} cellen ver en 15 breed vrij, alle bases bereikbaar`;
    },
  },
  {
    name: 'kaarten: elke kaart heeft de klassen, het water en de begroeiing uit zijn configuratie (20 kaarten elk)',
    async run() {
      const out = [];
      for (const id of MAP_IDS) {
        const cfg = G.MAPS[id];
        const sum = { cls: new Array(G.CLASS_NAMES.length).fill(0), water: 0, veg: 0, n: 0 };
        for (let seed = 1; seed <= 20; seed++) {
          const w = G.generateMap(seed * 104729, cfg);
          for (let i = 0; i < w.map.length; i++) {
            if (w.map[i] === G.DIRT || w.map[i] === G.EMPTY) sum.cls[w.terrain[i]]++;
            if (w.map[i] === G.WATER) sum.water++;
          }
          for (let k = 0; k < w.vegHp.length; k++) {
            if (!w.vegCells[k].length) continue;
            if (w.map[w.vegCells[k][0]] === G.BUILDING) { // gebouw
              check(w.vegHp[k] === G.BUILDING_HP, `${id}: gebouw met ${w.vegHp[k]} levens, verwacht ${G.BUILDING_HP}`);
              sum.buildings = (sum.buildings || 0) + 1;
              continue;
            }
            check(w.vegHp[k] === G.VEGETATION[cfg.vegetation.type].hp, `${id}: plant met ${w.vegHp[k]} levens, verwacht ${G.VEGETATION[cfg.vegetation.type].hp}`);
            sum.veg++;
          }
          sum.n++;
        }
        // alleen klassen die de kaart noemt; elke genoemde klasse komt ook echt voor
        for (const [name, i] of Object.entries(G.CLASS)) {
          const named = name in cfg.classes && !cfg.classes[name].later; // later: ontstaat pas in het spel (brand, onweer)
          check(named || sum.cls[i] === 0, `${id}: klasse ${name} komt voor maar staat niet in de configuratie`);
          check(!named || sum.cls[i] > 0, `${id}: klasse ${name} staat in de configuratie maar komt niet voor`);
        }
        const wantWater = cfg.terrainPercent?.water || cfg.features?.some((f) => f.type === 'river' && !f.frozen);
        check(!wantWater === !sum.water, `${id}: ${sum.water} watercellen, ${wantWater ? 'wel' : 'geen'} water verwacht`);
        check(!cfg.vegetation === !sum.veg, `${id}: ${sum.veg} planten`);
        const wantBuildings = cfg.terrainPercent?.building || cfg.features?.some((f) => f.type === 'village');
        check(!wantBuildings === !sum.buildings, `${id}: ${sum.buildings || 0} gebouwen`);
        out.push(`${id}: ${(sum.water / sum.n) | 0} water, ${(sum.veg / sum.n) | 0} planten`);
      }
      return out.join('; ');
    },
  },
  {
    name: 'gevecht: treffers, vernietiging, punt voor de schutter, kaarten gelijk',
    async run(port) {
      const a = await connectBot(port, 'barbarossa'); // open vlakte: de bots kunnen elkaar vinden
      const b = await connectBot(port, 'barbarossa');
      const killed = await fightUntilKill(a, b);
      a.input(0, 0);
      check(killed, 'bot A heeft bot B niet kunnen vernietigen');
      await sleep(300);
      check(a.me.c === 1, `schutter heeft ${a.me.c} punt(en), verwacht 1`);
      const c = await connectBot(port, 'barbarossa');
      await sleep(300);
      check(mapDiff(a.state.map, b.state.map) === 0, 'kaart van A en B verschillen');
      check(mapDiff(a.state.map, c.state.map) === 0, 'kaart van A en later ingestapte C verschillen');
      for (const x of [a, b, c]) x.close();
      return `${a.events.filter((e) => e.t === 'x').length} inslagen, 1 vernietigd`;
    },
  },
  {
    name: 'voorspelling: eigen tank loopt voor en komt precies op de serverpositie uit',
    async run(port) {
      const a = await connectBot(port);
      let maxLead = 0, maxErr = 0;
      const sample = () => {
        Sim.advancePrediction(a.state, performance.now());
        const p = a.state.pred, me = a.me;
        if (p && me) {
          maxLead = Math.max(maxLead, p.y - me.y);
          maxErr = Math.max(maxErr, Math.abs(p.x - me.x) + Math.abs(p.y - me.y));
        }
      };
      a.input(0, 1); // naar beneden de basis uit, door het zand
      for (let t = 0; t < 2000; t += 10) { sample(); await sleep(10); }
      a.input(0, 0);
      for (let t = 0; t < 700; t += 10) { sample(); await sleep(10); }
      const p = a.state.pred, me = a.me;
      check(a.acks > 0, 'server stuurt geen bevestigingen');
      check(p && p.x === me.x && p.y === me.y, `voorspelling (${p?.x},${p?.y}) eindigt niet op server (${me.x},${me.y})`);
      check(maxLead >= 1, 'voorspelde tank liep nooit voor op de server');
      check(maxErr <= 6, `voorspelling week ${maxErr} cellen af`);
      a.close();
      return `voorsprong tot ${maxLead} cel(len), eindpositie gelijk`;
    },
  },
  {
    name: 'mijnen: ontploffen, kosten pantser, gelijk voor laat instappende speler',
    async run(port) {
      const a = await connectBot(port, 'el-alamein');
      const start = a.me;
      // dichtstbijzijnde mijn waar de tank ook echt kan komen (niet ingesloten door rots)
      const nearMine = (m) => (x, y) => Math.abs(x - m.x) <= 2 && Math.abs(y - m.y) <= 2;
      const mine = [...a.state.mines].map((i) => ({ x: i % G.W, y: (i / G.W) | 0 }))
        .sort((p, q) => Math.hypot(p.x - start.x, p.y - start.y) - Math.hypot(q.x - start.x, q.y - start.y))
        .slice(0, 40).find((m) => nextStep(a.state.map, start, nearMine(m)).some((v) => v !== 0));
      check(mine, 'geen bereikbare mijn gevonden');
      const hit = () => a.events.some((e) => e.t === 'm' && e.i === a.state.me);
      const t0 = Date.now();
      while (Date.now() - t0 < 40000 && !hit()) {
        const [dx, dy] = nextStep(a.state.map, a.me, nearMine(mine));
        a.input(dx, dy);
        await sleep(66);
      }
      a.input(0, 0);
      check(hit(), 'bot heeft geen mijn geraakt');
      await sleep(300);
      const n = a.events.filter((e) => e.t === 'm' && e.i === a.state.me).length;
      check(a.me.s === G.SHIELD_MAX - n * G.MINE_DAMAGE, `pantser ${a.me.s}, verwacht ${G.SHIELD_MAX - n * G.MINE_DAMAGE} na ${n} mijn(en)`);
      const c = await connectBot(port, 'el-alamein');
      await sleep(300);
      check(mapDiff(a.state.map, c.state.map) === 0, 'kaarten verschillen');
      check(a.state.mines.size === c.state.mines.size && [...a.state.mines].every((i) => c.state.mines.has(i)), 'mijnen verschillen');
      a.close(); c.close();
      return `${n} mijn(en) geraakt, pantser ${a.me.s}`;
    },
  },
  {
    name: 'vloeiend rijden: tekenen met een andere klok dan de voorspelling springt niet',
    async run(port) {
      const a = await connectBot(port, 'barbarossa');
      // de voorspelling loopt op klok A, het tekenen op klok B = A - 3 s (bv. een trage tab)
      let max = 0, prev = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 3000) {
        const k = ((Date.now() - t0) / 400) | 0;
        a.input(...[[1, 0], [0, 1], [-1, 0], [0, -1]][k % 4]); // telkens een toets (zoals sturen)
        Sim.updateRenderPositions(a.state, performance.now() - 3000);
        const me = a.me;
        if (prev && me.rx !== undefined) max = Math.max(max, Math.hypot(me.rx - prev[0], me.ry - prev[1]));
        prev = [me.rx, me.ry];
        await sleep(16);
      }
      a.input(0, 0);
      a.close();
      check(max < 2.5, `tank sprong ${max.toFixed(1)} cellen in één beeld`);
      return `grootste stap per beeld ${max.toFixed(2)} cellen`;
    },
  },
  {
    name: 'terrein: rijsnelheid en brandstof per klasse, tunnel altijd volle snelheid',
    async run() {
      const out = [];
      for (const name of G.CLASS_NAMES) {
        const cls = G.CLASSES[G.CLASS[name]];
        if (cls.noTunnel) continue; // moeras: zie de spoortest
        const w = testWorld(name);
        const t = simDrive(w, 1, 300);
        const expect = (300 * cls.speed) / 256;
        check(Math.abs(t.steps - expect) <= 1, `${name}: ${t.steps} stappen in 300 ticks, verwacht ~${expect.toFixed(1)}`);
        check(t.fuelUsed === t.steps * cls.fuel, `${name}: ${t.fuelUsed} brandstof voor ${t.steps} stappen, verwacht ${cls.fuel} per stap`);
        // terug door de eigen tunnel: elke tick een stap, 1 brandstof per stap
        const back = simDrive(w, -1, 100, t);
        check(back.steps === 100, `${name}: terug door de tunnel ${back.steps} stappen in 100 ticks, verwacht 100`);
        check(back.fuelUsed === 100 * G.TUNNEL_COST.fuel, `${name}: tunnel kostte ${back.fuelUsed} brandstof`);
        out.push(`${name} ${t.steps}`);
      }
      for (const name of ['marsh', 'ford']) { // geen tunnel: elke stap opnieuw traag
        const r = simDrive(testWorld(name), 1, 300), cls = G.CLASSES[G.CLASS[name]];
        check(Math.abs(r.steps - (300 * cls.speed) / 256) <= 1, `${name}: ${r.steps} stappen`);
        check(r.fuelUsed === r.steps * cls.fuel, `${name}: ${r.fuelUsed} brandstof voor ${r.steps} stappen`);
        out.push(`${name} ${r.steps}`);
      }
      return `stappen in 300 ticks: ${out.join(', ')}`;
    },
  },
  {
    name: 'sporen: beginwaarde, vervagen tot het minimum, dichtlopen op 0, moeras zonder tunnel',
    async run() {
      const out = [];
      for (const name of G.CLASS_NAMES) {
        const cls = G.CLASSES[G.CLASS[name]];
        const w = testWorld(name);
        simDrive(w, 1, 120);
        const i = 100 * G.W + 55; // ver achter de tank
        check(w.track[i] === cls.track, `${name}: spoor ${w.track[i]}, verwacht beginwaarde ${cls.track}`);
        check((w.map[i] === G.EMPTY) === !cls.noTunnel, `${name}: tunnel ${w.map[i] === G.EMPTY ? 'wel' : 'niet'} gegraven`);
        let closedAt = null;
        for (let s = 1; s <= 600; s++) {
          G.fadeStep(w, s * G.FADE_CHECK);
          if (s === 60) {
            const expect = Math.max(cls.min, cls.track - 60 * cls.fade);
            check(w.track[i] === expect, `${name}: na 60 s spoor ${w.track[i]}, verwacht ${expect}`);
          }
          if (closedAt === null && w.map[i] === G.DIRT && !cls.noTunnel) closedAt = s;
        }
        if (cls.min === 0 && !cls.noTunnel) check(closedAt === Math.ceil(cls.track / cls.fade), `${name}: tunnel dicht na ${closedAt} s, verwacht ${Math.ceil(cls.track / cls.fade)}`);
        else check(closedAt === null, `${name}: tunnel liep dicht terwijl het minimum ${cls.min} is`);
        out.push(`${name} ${closedAt === null ? 'blijft' : `dicht na ${closedAt} s`}`);
      }
      return out.join(', ');
    },
  },
  {
    name: 'sporen en terrein gelijk voor laat instappende speler',
    async run(port) {
      const a = await connectBot(port);
      await drive(a, 0, 1, 2500);
      await drive(a, 1, 0, 1500);
      await sleep(1200); // minstens één keer vervagen
      const c = await connectBot(port);
      await drive(a, -1, 0, 1000);
      const same = () => a.state.tick === c.state.tick && mapDiff(a.state.map, c.state.map) === 0
        && mapDiff(a.state.track, c.state.track) === 0;
      check(await waitFor(same, 3000, 5), `kaart/sporen verschillen: ${mapDiff(a.state.map, c.state.map)} cellen, ${mapDiff(a.state.track, c.state.track)} sporen`);
      check(mapDiff(a.state.terrain, c.state.terrain) === 0, 'terreinlaag verschilt');
      check(c.ws.extensions.includes('permessage-deflate'), 'instapbericht niet gecomprimeerd (permessage-deflate staat uit)');
      const dug = countEmpty(a.state.map);
      check(dug > 100, `te weinig gegraven (${dug})`);
      a.close(); c.close();
      return `${dug} tunnelcellen, sporen cel voor cel gelijk`;
    },
  },
  {
    name: 'rots, water en begroeiing: onbegaanbaar, kogels stoppen (niet op water), plant weg na het juiste aantal treffers',
    async run() {
      const w = G.generateMap(12345, G.MAPS.ardennen);
      const cfg = G.MAPS.ardennen.vegetation;
      const out = [];
      for (const type of [G.ROCK, G.WATER, G.VEG]) {
        // een cel van dit type midden in de kaart: tank kan er niet in, kogel stopt erop
        let i = w.map.findIndex((v, k) => v === type && k % G.W > 20 && k % G.W < G.W - 20 && k / G.W > 20 && k / G.W < G.H - 20);
        check(i >= 0, `geen cel van type ${type}`);
        const x = i % G.W, y = (i / G.W) | 0;
        check(G.stepCost(w, x, y, 0) === null, `tank kan in type ${type} rijden`);
        // kogels stoppen op rots en planten, maar vliegen over water heen (§5.8)
        const b = { x: x - 1, y, d: 2, fresh: false }, hit = G.stepBullet(b, w.map, []);
        if (type === G.WATER) check(hit === null || b.x > x, 'kogel stopte op water');
        else check(hit?.kind === 'solid', `kogel stopte niet op type ${type}`);
      }
      // een plant: hp - 1 treffers niets, de laatste maakt een permanent gat in de ondergrond
      const id = w.vegCells.findIndex((c) => c.length > 5 && w.map[c[0]] === G.VEG); // een plant, geen gebouw
      const cells = w.vegCells[id], [first] = cells;
      const hp = G.VEGETATION[cfg.type].hp;
      check(w.vegHp[id] === hp, `plant heeft ${w.vegHp[id]} levens, verwacht ${hp}`);
      for (let k = 1; k < hp; k++) check(!G.hitObstacle(w, first % G.W, (first / G.W) | 0) && w.map[first] === G.VEG, `plant weg na ${k} treffer(s)`);
      check(G.hitObstacle(w, first % G.W, (first / G.W) | 0), `plant niet weg na ${hp} treffers`);
      for (const c of cells) {
        check(w.map[c] === G.EMPTY && w.scar[c] === 1, 'plantcel is geen gat geworden');
        check(w.terrain[c] === G.CLASS[cfg.groundAfter], 'verkeerde ondergrond na wegschieten');
      }
      // het gat vervaagt nooit, ook niet in de storm
      const before = w.track[first];
      for (let s = 1; s <= 300; s++) G.fadeStep(w, s * G.FADE_CHECK, true);
      check(w.track[first] === before && w.map[first] === G.EMPTY, 'gat van een plant vervaagde');
      out.push(`plant van ${cells.length} cellen weg na ${hp} treffers`);
      return out.join(', ');
    },
  },
  {
    name: 'sporenwisser: klok, sneller vervagen op zacht/normaal, tunnels lopen dicht, rest onveranderd',
    async run() {
      const cfg = G.MAPS.ardennen.weather.find((r) => r.every);
      const every = cfg.every * G.TICK_RATE, dur = cfg.duration * G.TICK_RATE;
      const at = (k) => Wx.weatherAtTick(G.MAPS.ardennen, 3, 1000 + k, 1000, 1000);
      let active = 0, firstActive = -1;
      for (let k = 0; k < every; k++) {
        if (at(k).eraser) { active++; if (firstActive < 0) firstActive = k; }
      }
      check(active === dur && firstActive === every - dur, `storm ${active} ticks vanaf ${firstActive}, verwacht ${dur} vanaf ${every - dur}`);
      check(at(every - dur - 1).storm?.warn && !at(every - dur - 200).storm, 'waarschuwing klopt niet');
      const out = [];
      for (const name of ['paved', 'hard', 'normal', 'soft']) {
        const cls = G.CLASSES[G.CLASS[name]];
        const w = testWorld(name);
        simDrive(w, 1, 120);
        const i = 100 * G.W + 55;
        let closedAt = null;
        for (let s = 1; s <= 200 && closedAt === null; s++) {
          G.fadeStep(w, s * G.FADE_CHECK, true);
          if (w.map[i] === G.DIRT) closedAt = s;
        }
        if (cls.erasable) {
          const expect = Math.ceil(cls.track / (cls.fade * 10));
          check(closedAt === expect, `${name}: in de storm dicht na ${closedAt} s, verwacht ${expect}`);
        } else {
          const calm = testWorld(name);
          simDrive(calm, 1, 120);
          for (let s = 1; s <= 200; s++) G.fadeStep(calm, s * G.FADE_CHECK, false);
          check(calm.track[i] === w.track[i] && calm.map[i] === w.map[i], `${name}: storm veranderde dit spoor`);
        }
        out.push(`${name} ${closedAt === null ? 'blijft' : `dicht na ${closedAt} s`}`);
      }
      return `storm ${cfg.duration} s per ${cfg.every} s; ${out.join(', ')}`;
    },
  },
  {
    name: 'ijs: rijdt als een weg zonder spoor, barsten, breken, wak en eruit kruipen',
    async run() {
      const out = [];
      // rijden over ijs: volle snelheid, geen tunnel, geen spoor
      const w = testWorld('ice');
      const r = simDrive(w, 1, 300);
      check(r.steps === 300, `ijs: ${r.steps} stappen in 300 ticks, verwacht 300 (als een weg)`);
      check(countEmpty(w.map) === 0 && w.track.every((v) => v === 0), 'ijs kreeg een tunnel of spoor');
      // kans en barststadia
      check(G.iceBreakChance(1) === G.ICE.breakPerPass && G.iceBreakChance(100) === 1, 'breekkans klopt niet');
      const stages = [0, 1, 2, 4, 5, 7, 8, 20].map(G.iceStage).join('');
      check(stages === '00112233', `barststadia ${stages}, verwacht 00112233 (vanaf 2, 5 en 8)`);
      // breken: het vak en de vakken ernaast worden water, verder niets
      const b = G.iceBlockAt(100, 100);
      const box = G.breakIce(w, b);
      let water = 0;
      for (let i = 0; i < w.map.length; i++) if (w.map[i] === G.WATER) water++;
      check(water === 5 * G.ICE_B * G.ICE_B, `wak van ${water} cellen, verwacht ${5 * G.ICE_B * G.ICE_B} (vak + 4 buren)`);
      check(box && box[2] - box[0] === 3 * G.ICE_B - 1, 'rechthoek van het wak klopt niet');
      // gewone grond wordt nooit een wak
      const dry = testWorld('soft');
      check(G.breakIce(dry, b) === null, 'breakIce veranderde grond die geen ijs is');
      // in het wak: heel langzaam, alleen eruit, niet dieper erin; vanaf het droge kom je er niet in
      const cx = (b % G.ICE_BW) * G.ICE_B + 3, cy = ((b / G.ICE_BW) | 0) * G.ICE_B + 3;
      const t = { x: cx, y: cy, dir: G.dirIndex(1, 0), mv: 0, fuel: 1e6, input: { dx: 1, dy: 0 } };
      let ticks = 0;
      while (G.waterUnder(w.map, t.x, t.y, t.dir) > 0 && ticks < 3000) { G.moveTank(t, w, []); ticks++; }
      const dist = t.x - cx;
      check(ticks < 3000, 'tank kwam niet uit het wak');
      const expect = Math.round(dist / G.ICE.sinkSpeed);
      check(Math.abs(ticks - expect) <= 8, `${dist} cellen uit het wak in ${ticks} ticks, verwacht ~${expect} (snelheid ${G.ICE.sinkSpeed})`);
      const back = { ...t, input: { dx: -1, dy: 0 } };
      for (let k = 0; k < 200; k++) G.moveTank(back, w, []);
      check(G.waterUnder(w.map, back.x, back.y, back.dir) === 0, 'droge tank reed het wak in');
      const deeper = { x: cx + 6, y: cy, dir: G.dirIndex(1, 0), mv: 0, fuel: 1e6, input: { dx: 1, dy: 0 } };
      const wet0 = G.waterUnder(w.map, deeper.x, deeper.y, deeper.dir);
      deeper.input = { dx: -1, dy: 0 };
      for (let k = 0; k < 400; k++) G.moveTank(deeper, w, []);
      check(G.waterUnder(w.map, deeper.x, deeper.y, deeper.dir) <= wet0, 'tank reed dieper het wak in');
      out.push(`wak van ${water} cellen, ${dist} cellen eruit in ${(ticks / G.TICK_RATE).toFixed(1)} s`);
      return out.join(', ');
    },
  },
  {
    name: 'Leningrad: bevroren Neva met brug, dooi en plassen, bases blijven bereikbaar (20 kaarten)',
    async run() {
      const cfg = G.MAPS.leningrad;
      let bridges = 0, pools = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const w = G.generateMap(seed * 7919, cfg);
        const ice = w.terrain.reduce((n, c, i) => n + (G.isIce(w, i) ? 1 : 0), 0);
        check(ice > G.W * 10, `seed ${seed}: maar ${ice} ijscellen`);
        // dooi met plassen van de server: elke basis nog bereikbaar
        const change = cfg.weather.find((r) => r.effect?.terrain?.type === 'thaw').effect.terrain;
        const p = G.pickThawPools(w, w.bases, change, G.mulberry32(seed));
        G.applyTerrainChange(w, change, { pools: p });
        pools += p.length;
        check(!w.terrain.some((c, i) => G.isIce(w, i)), `seed ${seed}: ijs over na de dooi`);
        const seen = G.reachable(w.map, w.bases[0]);
        check(w.bases.every((b) => seen[b.y * G.W + b.x]), `seed ${seed}: basis onbereikbaar na de dooi`);
        if (w.bridges.length) bridges++; // de brug over de Neva
      }
      check(bridges === 20, `brug op ${bridges} van de 20 kaarten`);
      // na de dooi geen sneeuwjacht meer
      check(Wx.terrainChangesAt(cfg, 4).length === 1 && Wx.terrainChangesAt(cfg, 3).length === 0, 'dooi niet bij het begin van ronde 4');
      check(Wx.weatherAt(cfg, 3, 85, 85).eraser && !Wx.weatherAt(cfg, 4, 85, 85).eraser, 'sneeuwjacht gaat door na de dooi');
      return `20 kaarten met brug, gemiddeld ${(pools / 20).toFixed(1)} plassen bij de dooi`;
    },
  },
  {
    name: 'begroeiing wegschieten via de server, gelijk voor laat instappende speler',
    async run(port) {
      const a = await connectBot(port);
      const fell = () => a.events.some((e) => e.t === 'x' && e.fell);
      // dichtstbijzijnde plant; ga er op dezelfde rij naast staan en schiet erop
      const plants = a.state.world.vegCells.map((c) => c[0]).filter((c) => c !== undefined)
        .map((c) => ({ x: c % G.W, y: (c / G.W) | 0 }))
        .sort((p, q) => Math.hypot(p.x - a.me.x, p.y - a.me.y) - Math.hypot(q.x - a.me.x, q.y - a.me.y));
      const spot = (p) => (x, y) => y === p.y && x < p.x - 8 && x > p.x - 20;
      const target = plants.slice(0, 30).find((p) => nextStep(a.state.map, a.me, spot(p)).some((v) => v !== 0));
      check(target, 'geen bereikbare plant gevonden');
      const t0 = Date.now();
      while (Date.now() - t0 < 40000 && !fell()) {
        const me = a.me;
        if (spot(target)(me.x, me.y)) a.input(1, 0, 1); // naar rechts kijken en schieten
        else { const [dx, dy] = nextStep(a.state.map, me, spot(target)); a.input(dx, dy, 0); }
        await sleep(66);
      }
      a.input(0, 0);
      check(fell(), 'plant is niet omgegaan');
      const c = await connectBot(port);
      const same = () => a.state.tick === c.state.tick && mapDiff(a.state.map, c.state.map) === 0
        && mapDiff(a.state.world.scar, c.state.world.scar) === 0 && mapDiff(a.state.world.vegHp, c.state.world.vegHp) === 0;
      check(await waitFor(same, 3000, 5), 'kaart, gaten of plantlevens verschillen voor laat instappende speler');
      a.close(); c.close();
      const hits = a.events.filter((e) => e.t === 'x' && e.veg).length;
      return `plant bij (${target.x}, ${target.y}) om na ${hits} treffer(s)`;
    },
  },
  {
    name: 'robuustheid: te grote berichten, flooden en een dode verbinding',
    async run(port) {
      // te groot bericht: server sluit de verbinding (1009 = bericht te groot)
      const big = await connectBot(port);
      big.ws.send('x'.repeat(10 * 1024));
      check(await waitFor(() => big.closed, 3000), 'verbinding bleef open na een bericht van 10 KB');
      check(big.closeCode === 1009, `sluitcode ${big.closeCode}, verwacht 1009`);

      // flooden: van 100 berichten in één keer telt de server er maar 60
      const flood = await connectBot(port);
      for (let q = 1; q <= 100; q++) flood.send({ t: 'in', dx: 0, dy: 0, f: 0, q });
      await sleep(400);
      check(flood.lastAck && flood.lastAck[0] === 60, `server verwerkte invoer t/m ${flood.lastAck?.[0]}, verwacht 60`);
      flood.close();

      // dode verbinding (antwoordt niet op ping): na hooguit 2 hartslagen afgesloten
      const dead = await connectBot(port, 'carentan', { autoPong: false });
      check(await waitFor(() => dead.closed, 12000, 200), 'dode verbinding werd niet afgesloten');
      return 'groot bericht geweigerd, flood begrensd, dode verbinding opgeruimd';
    },
  },
  {
    name: 'kaart-vingerafdruk: zelfde seed geeft dezelfde kaart als in tests/fingerprint.json',
    run: async () => {
      const got = fingerprints(), want = expectedFingerprints();
      const diff = Object.keys(want).filter((k) => got[k] !== want[k]);
      check(!diff.length, `andere kaart bij ${diff.slice(0, 5).join(', ')}${diff.length > 5 ? ' …' : ''} (bewust? node tests/fingerprint.mjs --write)`);
      return `${Object.keys(want).length} kaarten gelijk`;
    },
  },
];
tests.push(acceptanceTest(tests));
