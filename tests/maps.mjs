// Tests per map (SPEC-blitzkrieg §10, §13): het weer over 5 rondes met een snelle klok, de
// routes na elke terreinverandering, en de gevaren, schaarse middelen en meters.
import { G, check } from './helpers.mjs';
import * as Wx from '../shared/weather.js';
import * as Hz from '../hazards.js';

// Nagebootst potje voor hazards.js (draait anders op de server)
export function fakeRoom(id, size = 'middel', seed = 4242) {
  const { w, h } = G.sizeDims(size);
  G.setMapSize(w, h);
  const world = G.generateMap(seed, G.MAPS[id], G.MAP_SIZES[size].maxPlayers);
  const tank = { id: 0, alive: true, x: world.bases[0].x, y: world.bases[0].y, dir: 0, shield: G.SHIELD_MAX, fuel: 1000, ammo: 10, gauge: G.MAPS[id].meter?.start ?? 0, slow: G.SPEED_ONE, meterState: {}, input: { dx: 0, dy: 0 } };
  const room = { rules: G.MAPS[id], world, size, tick: 0, mapTick: 0, roundTick: 0, round: 1, tanks: [tank, null, null, null], hz: {} };
  room.wx = Wx.weatherAt(room.rules, 1, 0, 0);
  return room;
}
const hurt = (t, pct, ev) => { t.shield -= (pct * G.SHIELD_MAX) / 100; ev.push({ t: 'hint', i: t.id }); };
// tank op een plek met dit soort terrein zetten
function placeOn(room, t, test) {
  const w = room.world;
  for (let i = 0; i < w.map.length; i++) {
    const x = i % G.W, y = (i / G.W) | 0;
    if (x < 20 || y < 20 || x > G.W - 20 || y > G.H - 20 || !test(i)) continue;
    if (w.bases.some((b) => Math.hypot(b.x - x, b.y - y) < 40)) continue;
    t.x = x; t.y = y;
    return true;
  }
  return false;
}
function withRandom(v, fn) {
  const r = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = r; }
}

// Wat het weer per map moet doen: [ronde, seconden in het spel, seconden in de ronde, verwachting]
const WEATHER = {
  'fall-gelb': [[1, 10, 10, { vis: null }], [3, 400, 10, { vis: 8 }], [4, 600, 10, { vis: null }]],
  barbarossa: [[1, 10, 10, { vis: 10, flag: 'dust' }], [2, 300, 10, { vis: 10 }], [3, 500, 10, { vis: 8, flag: 'mud' }]],
  'el-alamein': [[1, 10, 10, { vis: 10, flag: 'mirages' }], [2, 75, 30, { vis: 4, eraser: true, burial: true }]],
  leningrad: [[1, 10, 0, { vis: 12 }], [1, 190, 180, { vis: 6 }], [3, 75, 75, { vis: 4, eraser: true }], [4, 75, 0, { vis: 12, eraser: false, flag: 'thawed' }]],
  koersk: [[1, 10, 10, { vis: 12, flag: 'fires' }], [3, 400, 10, { vis: 8, flag: 'thunder' }]],
  carentan: [[1, 10, 10, { vis: 4 }], [2, 300, 10, { vis: 12 }], [2, 410, 110, { vis: 8, eraser: 'nearWater' }]],
  'market-garden': [[1, 10, 10, { vis: 12, flag: 'drops' }], [3, 400, 10, { vis: 8, noflag: 'drops' }]],
  ardennen: [[1, 0, 0, { vis: 2 }], [3, 10, 10, { vis: null, noflag: 'fog' }]],
  seelow: [[1, 10, 10, { vis: 4, flag: 'searchlights' }], [3, 400, 10, { vis: 8, noflag: 'searchlights' }]],
  berlijn: [[1, 10, 10, { vis: 12 }], [2, 300, 10, { vis: 8 }], [3, 500, 10, { vis: 6 }], [5, 900, 10, { vis: 6 }]],
};
// Terreinveranderingen per ronde (ronde -> aantal)
const CHANGES = { 'fall-gelb': { 2: 1, 3: 1, 4: 1, 5: 0 }, barbarossa: { 3: 1, 4: 0 }, leningrad: { 4: 1 }, koersk: { 3: 1 } };

export const mapTests = [
  {
    name: 'weer per map: 5 rondes met een snelle klok, en na elke terreinverandering een route tussen de bases (§6.3, §13)',
    async run() {
      const out = [];
      try {
        for (const [id, cases] of Object.entries(WEATHER)) {
          for (const [round, tGame, tRound, want] of cases) {
            for (const scale of [1, 0.05]) { // ook met de snelle klok van de tests
              const wx = Wx.weatherAt(G.MAPS[id], round, tGame * scale, tRound * scale, scale);
              const tag = `${id} ronde ${round} (${tGame} s${scale < 1 ? ', snel' : ''})`;
              check(wx.visibility === want.vis || (typeof want.vis === 'number' && Math.abs(wx.visibility - want.vis) < 0.01), `${tag}: zicht ${wx.visibility}, verwacht ${want.vis}`);
              if (want.eraser !== undefined) check(wx.eraser === want.eraser, `${tag}: sporenwisser ${wx.eraser}`);
              if (want.burial) check(wx.burial, `${tag}: geen onderduiken`);
              if (want.flag) check(wx.flags[want.flag], `${tag}: ${want.flag} ontbreekt`);
              if (want.noflag) check(!wx.flags[want.noflag], `${tag}: ${want.noflag} hoort er niet meer bij`);
            }
          }
          // het terrein verandert op de juiste rondes; de bases blijven elkaar bereiken
          const room = fakeRoom(id);
          for (let round = 1; round <= 5; round++) {
            const changes = Wx.terrainChangesAt(G.MAPS[id], round);
            const want = CHANGES[id]?.[round] ?? 0;
            check(changes.length === want, `${id} ronde ${round}: ${changes.length} terreinveranderingen, verwacht ${want}`);
            for (const { change, stage } of changes) G.applyTerrainChange(room.world, change, G.terrainChangeExtra(room.world, change, room.world.bases, stage));
            const seen = G.reachable(room.world.map, room.world.bases[0]);
            check(room.world.bases.every((b) => seen[b.y * G.W + b.x]), `${id} ronde ${round}: bases onbereikbaar na het weer`);
          }
          out.push(id);
        }
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return `${out.length} maps, weer en routes over 5 rondes`;
    },
  },
  {
    name: 'gevaren: brandend graan, antitankgeschut, ontploffende brug, artillerie, instortende gevels',
    async run() {
      const out = [];
      try {
        // Koersk: schot op graan steekt aan, vuur springt met de wind mee, wie erin staat verliest pantser, daarna verbrand
        let room = fakeRoom('koersk'), t = room.tanks[0], ev = [];
        Hz.roundStart(room, ev);
        check(placeOn(room, t, (i) => room.world.terrain[i] === G.CLASS.normal && room.world.map[i] === G.DIRT), 'geen graan');
        withRandom(0, () => Hz.bulletLanded(room, t.x, t.y, ev));
        check(ev.some((e) => e.t === 'fi'), 'schot op graan stak niets aan');
        for (let k = 1; k <= 16 * G.TICK_RATE; k++) { room.tick = k; Hz.step(room, k, ev, hurt); }
        check(t.shield < G.SHIELD_MAX, 'geen schade in het vuur');
        check(room.world.terrain.includes(G.CLASS.burnt), 'niets verbrand na 15 s');
        out.push(`graanbrand (${ev.filter((e) => e.t === 'fi').length} vakken)`);
        // Carentan: geschut vuurt pas als je in het schootsveld komt, is daarna zichtbaar en met 4 treffers uit
        room = fakeRoom('carentan'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        const g = room.hz.guns[0];
        check(g && !Hz.snapshot(room).guns.length, 'geschut niet verborgen');
        t.x = Math.round(g.x + Math.cos(g.ang) * 30); t.y = Math.round(g.y + Math.sin(g.ang) * 30);
        for (let k = 1; k <= 5 * G.TICK_RATE; k++) Hz.step(room, k, ev, hurt);
        check(ev.some((e) => e.t === 'gun') && t.shield === 75, `geschut trof niet (pantser ${t.shield})`);
        for (let k = 0; k < 4; k++) check(Hz.bulletAt(room, g.x, g.y, ev), 'kogel raakte het geschut niet');
        const before = t.shield;
        for (let k = 0; k < 10 * G.TICK_RATE; k++) Hz.step(room, 200 + k, ev, hurt);
        check(t.shield === before, 'uitgeschakeld geschut schoot nog');
        out.push('geschut');
        // Market Garden: over de brug = ontploffing, brug weg tot de volgende ronde
        room = fakeRoom('market-garden'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        const br = room.hz.bridge;
        check(br && br.cells.length, 'geen brug');
        t.x = (br.box[0] + br.box[2]) >> 1; t.y = (br.box[1] + br.box[3]) >> 1;
        Hz.step(room, 1, ev, hurt);
        t.y = br.box[3] + 6;
        Hz.step(room, 2, ev, hurt);
        check(br.blown && t.shield === 60 && room.world.map[br.cells[0]] === G.WATER, 'brug ontplofte niet');
        Hz.roundStart(room, ev);
        check(!br.blown && room.world.map[br.cells[0]] !== G.WATER, 'brug niet hersteld bij de nieuwe ronde');
        out.push('brug');
        // Oder-front: vak licht op, 3 s later -30% en kraters
        room = fakeRoom('seelow'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        for (let k = 1; k <= 60 * G.TICK_RATE && !ev.some((e) => e.t === 'z'); k++) Hz.step(room, k, ev, hurt);
        const z = ev.find((e) => e.t === 'z');
        check(z && z.at - 60 * G.TICK_RATE === 3 * G.TICK_RATE, 'artillerie niet na 60 s met 3 s waarschuwing');
        t.x = (z.box[0] + z.box[2]) >> 1; t.y = (z.box[1] + z.box[3]) >> 1;
        for (let k = 60 * G.TICK_RATE + 1; k <= z.at; k++) Hz.step(room, k, ev, hurt);
        check(t.shield === 70 && ev.some((e) => e.t === 'zb' && e.craters), 'artillerie: geen -30% of geen kraters');
        out.push('artillerie');
        // Berlijn: naast een gebouw kans op een vallende gevel; tegen een gebouw aan rijden = zeker
        room = fakeRoom('berlijn'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        check(placeOn(room, t, (i) => room.world.map[i] === G.DIRT && room.world.map[i + G.TANK_R + 1] === G.BUILDING), 'geen plek naast een gebouw');
        t.dir = 2; t.input = { dx: 1, dy: 0 }; t.still = 10;
        Hz.step(room, G.TICK_RATE, ev, hurt);
        check(t.shield === 75 && ev.some((e) => e.t === 'fc') && ev.some((e) => e.t === 'smoke'), `tegen een gebouw rijden: pantser ${t.shield}`);
        // gebouw met 3 treffers stort na 3 s helemaal in
        const id = room.world.vegCells.findIndex((c) => c.length && room.world.map[c[0]] === G.BUILDING);
        const c0 = room.world.vegCells[id][0];
        for (let k = 0; k < 3; k++) G.hitObstacle(room.world, c0 % G.W, (c0 / G.W) | 0);
        for (let k = 1; k <= 4 * G.TICK_RATE; k++) Hz.step(room, 1000 + k, ev, hurt);
        check(room.world.map[c0] !== G.BUILDING && ev.some((e) => e.t === 'fb'), 'gebouw met 3 treffers stortte niet in');
        out.push('gevels');
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return out.join(', ');
    },
  },
  {
    name: 'schaarse middelen en meters: munitiedepot, droppings, modder, stofspoor, zand, motorwarmte, motortemperatuur',
    async run() {
      const out = [];
      try {
        // Grebbeberg: munitie alleen bij het depot in Rhenen
        let room = fakeRoom('fall-gelb'), t = room.tanks[0], ev = [];
        Hz.roundStart(room, ev);
        check(room.rules.refill.ammo === false && room.hz.ammoDepot, 'geen munitiedepot');
        [t.x, t.y] = room.hz.ammoDepot; t.ammo = 0;
        for (let k = 0; k < 60; k++) Hz.step(room, k, ev, hurt);
        check(t.ammo > 5, 'geen munitie bij het depot');
        out.push('munitiedepot');
        // Market Garden: elke 30 s een krat, wie erover rijdt krijgt de inhoud; vanaf ronde 3 geen droppings
        room = fakeRoom('market-garden'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        for (let k = 1; k <= 30 * G.TICK_RATE; k++) Hz.step(room, k, ev, hurt);
        const drop = ev.find((e) => e.t === 'drop');
        check(drop, 'geen krat na 30 s');
        [t.x, t.y] = drop.c; t.fuel = 0; t.ammo = 0;
        Hz.step(room, 30 * G.TICK_RATE + 1, ev, hurt);
        check(t.fuel > 0 || t.ammo > 0, 'krat leverde niets');
        room.wx = Wx.weatherAt(room.rules, 3, 400, 10);
        const n = room.hz.crates.length;
        for (let k = 1; k <= 31 * G.TICK_RATE; k++) Hz.step(room, 2000 + k, ev, hurt);
        check(room.hz.crates.length === n, 'droppings in ronde 3');
        out.push('droppings');
        // Barbarossa: stofspoor op hard (hint, eens per 10 s); modder: dubbel brandstof op zacht
        room = fakeRoom('barbarossa'); t = room.tanks[0]; ev = [];
        check(placeOn(room, t, (i) => room.world.terrain[i] === G.CLASS.hard && room.world.map[i] === G.DIRT), 'geen harde grond');
        for (let k = 0; k < 12 * G.TICK_RATE; k++) { room.tick = k; Hz.tankStep(room, t, { moved: true }, ev, hurt); }
        check(ev.filter((e) => e.kind === 'dust').length === 2, `stofspoor gaf ${ev.filter((e) => e.kind === 'dust').length} hints in 12 s, verwacht 2`);
        room.wx = Wx.weatherAt(room.rules, 3, 400, 10);
        placeOn(room, t, (i) => room.world.terrain[i] === G.CLASS.soft && room.world.map[i] === G.DIRT);
        const f0 = t.fuel;
        Hz.tankStep(room, t, { moved: true }, ev, hurt);
        check(f0 - t.fuel === G.CLASSES[G.CLASS.soft].fuel, 'modder kost niet dubbel brandstof');
        out.push('stofspoor en modder');
        // El Alamein: zandmeter
        room = fakeRoom('el-alamein'); t = room.tanks[0]; ev = [];
        placeOn(room, t, (i) => room.world.terrain[i] === G.CLASS.soft && room.world.map[i] === G.DIRT);
        for (let k = 0; k < 60 * G.T; k++) Hz.tankStep(room, t, { moved: true }, ev, hurt);
        check(t.gauge === 100 && t.slow < G.SPEED_ONE && t.shield < G.SHIELD_MAX, `zandmeter ${t.gauge}, snelheid ${t.slow}, pantser ${t.shield}`);
        placeOn(room, t, (i) => room.world.terrain[i] === G.CLASS.hard && room.world.map[i] === G.DIRT);
        for (let k = 0; k < 10 * G.T; k++) Hz.tankStep(room, t, { moved: true }, ev, hurt);
        check(t.gauge === 50 && t.slow === G.SPEED_ONE, `zandmeter na hard ${t.gauge}`);
        out.push('zand');
        // Leningrad: stilstaan koelt de motor af tot hij bevriest; daarna 4 s om op gang te komen
        room = fakeRoom('leningrad'); t = room.tanks[0]; ev = [];
        placeOn(room, t, (i) => room.world.map[i] === G.DIRT);
        for (let k = 1; k <= 21 * G.TICK_RATE; k++) { room.tick = k; Hz.tankStep(room, t, { moved: false }, ev, hurt); }
        check(t.gauge === 0 && t.meterState.frozen, `motorwarmte ${t.gauge} na 20 s stil`);
        t.input = { dx: 1, dy: 0 };
        room.tick++; Hz.tankStep(room, t, { moved: false }, ev, hurt);
        check(t.slow < G.SPEED_ONE / 5, 'bevroren motor kwam meteen op gang');
        out.push('motorwarmte');
        // Koersk: hard rijden warmt op tot oververhit (40%), in de basis koelt het snel af
        room = fakeRoom('koersk'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        placeOn(room, t, (i) => room.world.map[i] === G.DIRT);
        for (let k = 1; k <= 30 * G.TICK_RATE; k++) { room.tick = k; Hz.tankStep(room, t, { moved: true }, ev, hurt); }
        check(t.gauge === 100 && t.slow === Math.round(0.4 * G.SPEED_ONE), `motortemperatuur ${t.gauge}, snelheid ${t.slow}`);
        [t.x, t.y] = [room.world.bases[0].x, room.world.bases[0].y];
        for (let k = 1; k <= 3 * G.TICK_RATE; k++) { room.tick = 2000 + k; Hz.tankStep(room, t, { moved: false }, ev, hurt); }
        check(t.gauge === 40 && t.slow === G.SPEED_ONE, `na 3 s in de basis ${t.gauge}`);
        out.push('motortemperatuur');
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return out.join(', ');
    },
  },
];
