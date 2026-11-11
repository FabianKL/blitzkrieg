// Tests per map (SPEC-blitzkrieg §10, §13): het weer over 5 rondes met een snelle klok, de
// routes na elke terreinverandering, en de gevaren, schaarse middelen en meters.
import { G, check } from './helpers.mjs';
import * as Wx from '../shared/weather.js';
import * as Hz from '../server/hazards.js';
import { terrainShares } from '../shared/mapgen.js';

// Nagebootst potje voor server/hazards.js (draait anders op de server)
export function fakeRoom(id, size = 'middel', seed = 4242) {
  const { w, h } = G.sizeDims(size);
  G.setMapSize(w, h);
  const world = G.generateMap(seed, G.MAPS[id], G.MAP_SIZES[size].maxPlayers);
  const base = world.bases[0];
  const startX = base ? base.x : Math.round(w / 2), startY = base ? base.y : Math.round(h / 2);
  const tank = { id: 0, alive: true, x: startX, y: startY, dir: 0, shield: G.SHIELD_MAX, fuel: 1000, ammo: 10, gauge: G.MAPS[id].meter?.start ?? 0, slow: G.SPEED_ONE, meterState: {}, input: { dx: 0, dy: 0 } };
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
  'el-alamein': [[1, 10, 10, { vis: 10, flag: 'mirages' }], [2, 75, 30, { vis: 2, eraser: true, burial: true }]],
  leningrad: [[1, 10, 0, { vis: 12 }], [1, 150, 150, { vis: 7 }], [3, 75, 75, { vis: 2, eraser: true }], [5, 75, 0, { vis: 12, eraser: false, flag: 'thawed' }]],
  koersk: [[1, 10, 10, { vis: 12, flag: 'fires' }], [3, 400, 10, { vis: 8, flag: 'thunder' }]],
  carentan: [[1, 10, 10, { vis: 4 }], [2, 300, 10, { vis: 12 }], [2, 350, 50, { vis: 8, eraser: 'nearWater' }]],
  'market-garden': [[1, 10, 10, { vis: 12 }], [3, 400, 10, { vis: 8 }]],
  ardennen: [[1, 0, 0, { vis: 2 }], [3, 10, 10, { vis: null, noflag: 'fog' }]],
  seelow: [[1, 10, 10, { vis: 4, flag: 'searchlights' }], [3, 400, 10, { vis: 8, noflag: 'searchlights' }]],
  berlijn: [[1, 10, 10, { vis: 12 }], [2, 300, 10, { vis: 8 }], [3, 500, 10, { vis: 6 }], [5, 900, 10, { vis: 6 }]],
};
// Terreinveranderingen per ronde (ronde -> aantal)
const CHANGES = { 'fall-gelb': { 2: 1, 3: 1, 4: 1, 5: 0 }, barbarossa: { 3: 1, 4: 0 }, leningrad: { 5: 1 }, koersk: { 3: 1 } };

export const mapTests = [
  {
    name: 'Tunneler zomer en winter: terreinpercentages en kapot te schieten bomen',
    run() {
      try {
        G.setMapSize(...Object.values(G.sizeDims('middel')));
        const zomer = G.MAPS['tunneler-zomer'], winter = G.MAPS['tunneler-winter'];
        check(zomer.minimap === false && winter.minimap === false, 'Tunneler: minimap staat standaard aan');
        check(!G.minimapOn(zomer) && !G.minimapOn(winter), 'Tunneler: minimap is zichtbaar ondanks de kaartstandaard');
        check(G.minimapOn(zomer, 1) && G.minimapOn(winter, 1), 'Tunneler: minimap kan niet via de lobby worden aangezet');
        check(!G.minimapOn(G.MAPS.ardennen, 0), 'minimap kan niet via de lobby worden uitgezet');
        check(zomer.terrainPercent.normal === 75 && zomer.terrainPercent.vegetation === 25, 'zomer: weiland- of bospercentage wijkt af');
        check(winter.terrainPercent.soft === 85 && winter.terrainPercent.vegetation === 15, 'winter: sneeuwgrond- of bospercentage wijkt af');
        check(JSON.stringify(zomer.vegetation.sprites) === JSON.stringify({ berk: 10, loof: 10, den: 5 }), 'zomer: bomenmix wijkt af');
        check(JSON.stringify(winter.vegetation.sprites) === JSON.stringify({ den: 15 }), 'winter: dennenaandeel wijkt af');
        check(!zomer.terrainPercent.rock && !zomer.rocks && !winter.terrainPercent.ice && !winter.terrainClusters?.ice, 'Tunneler: rotsvelden of ijsplaten zijn nog ingesteld');
        check(zomer.rockEdge === true && winter.rockEdge === true, 'Tunneler: rotsrand is niet ingesteld');
        for (const [id, rules] of [['tunneler-zomer', zomer], ['tunneler-winter', winter]]) {
          const world = G.generateMap(4242, rules, 2), shares = terrainShares(world);
          check(world.border.every((edge, i) => !edge || world.map[i] === G.ROCK), `${id}: randstrook bestaat niet uit rots`);
          check(world.border.every((edge, i) => edge || world.map[i] !== G.ROCK), `${id}: rots staat binnen de speelbare map`);
          if (id === 'tunneler-winter') check(world.border.every((edge, i) => edge || world.terrain[i] !== G.CLASS.ice), 'winter: ijs ligt binnen de speelbare map');
          for (const [kind, percent] of Object.entries(rules.terrainPercent)) {
            check(Math.abs((shares[kind] || 0) - percent) <= 3.1, `${id}: ${kind} ${(shares[kind] || 0).toFixed(1)}%, verwacht ${percent}%`);
          }
          const i = world.map.findIndex((cell) => cell === G.VEG);
          check(i >= 0, `${id}: geen bomen geplaatst`);
          check(world.vegHp[world.veg[i] - 1] === G.VEGETATION.pine.hp, `${id}: bomen hebben geen dennen-levensduur`);
          check(!G.hitObstacle(world, i % G.W, (i / G.W) | 0), `${id}: boom gaat neer na één treffer`);
          check(G.hitObstacle(world, i % G.W, (i / G.W) | 0) && world.map[i] === G.EMPTY, `${id}: boom is niet kapot te schieten`);
        }
      } finally { G.applyTerrainOverrides(null); G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return 'open speelbaar terrein met zomerbos of winterdennen, zonder rotsvelden of ijsplaten; rotsblokken alleen langs de rand';
    },
  },
  {
    name: 'minikaart verdwijnt tijdens zand- en sneeuwstormen',
    run() {
      for (const id of ['el-alamein', 'ardennen', 'leningrad']) {
        const map = G.MAPS[id];
        check(!Wx.weatherAt(map, 1, 0, 0).flags.hidesMinimap, `${id}: minikaart al verborgen buiten de storm`);
        let stormFound = false;
        for (let t = 0; t <= 180; t++) {
          const weather = Wx.weatherAt(map, 1, t, t);
          if (!weather.burial) continue;
          check(weather.flags.hidesMinimap, `${id}: minikaart niet verborgen tijdens de storm`);
          stormFound = true;
          break;
        }
        check(stormFound, `${id}: geen storm gevonden voor de test`);
      }
      return 'minikaart zichtbaar buiten en verborgen tijdens zand- en sneeuwstormen';
    },
  },
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
            if (room.world.bases.length) {
              const seen = G.reachable(room.world.map, room.world.bases[0]);
              check(room.world.bases.every((b) => seen[b.y * G.W + b.x]), `${id} ronde ${round}: bases onbereikbaar na het weer`);
            }
          }
          out.push(id);
        }
      } finally { G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS); }
      return `${out.length} maps, weer en routes over 5 rondes`;
    },
  },
  {
    name: 'gevaren: brandend graan, ontploffende brug, artillerie, instortende gevels',
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
        // Market Garden: over de brug = kans op ontploffing (10%, +5% per oversteek), brug weg tot de volgende ronde
        room = fakeRoom('market-garden'); t = room.tanks[0]; ev = [];
        Hz.roundStart(room, ev);
        const br = room.hz.bridge;
        check(br && br.cells.length, 'geen brug');
        const cross = (k) => {
          t.x = (br.box[0] + br.box[2]) >> 1; t.y = (br.box[1] + br.box[3]) >> 1;
          Hz.step(room, k, ev, hurt);
          t.y = br.box[3] + 6;
          Hz.step(room, k + 1, ev, hurt);
        };
        withRandom(0.12, () => cross(1)); // 0,12 ≥ 10%: houdt
        check(!br.blown && t.shield === 100, 'brug ontplofte al bij de eerste oversteek');
        withRandom(0.12, () => cross(3)); // 0,12 < 15%: weg
        check(br.blown && t.shield === 60 && room.world.map[br.cells[0]] === G.WATER, 'brug ontplofte niet bij de tweede oversteek');
        Hz.roundStart(room, ev);
        check(!br.blown && room.world.map[br.cells[0]] !== G.WATER, 'brug niet hersteld bij de nieuwe ronde');
        withRandom(0.19, () => cross(5)); // teller loopt door: 20% bij de derde oversteek
        check(br.blown && room.hz.crossings === 3, `teller liep niet door over de ronde (${room.hz.crossings})`);
        out.push('brug');
        // Oder-front: vak licht op, 3 s later -30% en kraters
        room = fakeRoom('seelow'); t = room.tanks[0]; ev = [];
        // zoeklicht-triggering uitzetten: deze test gaat over de vaste 60 s-timer
        const slSave = room.wx.flags.searchlights;
        room.wx.flags.searchlights = null;
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
        check(room.rules.refill.ammo === false && room.hz.ammoDepots?.length, 'geen munitiedepot');
        [t.x, t.y] = room.hz.ammoDepots[0]; t.ammo = 0;
        for (let k = 0; k < 60; k++) Hz.step(room, k, ev, hurt);
        check(t.ammo > 5, 'geen munitie bij het depot');
        out.push('munitiedepot');
        // Market Garden: elke 30 s een krat, wie erover rijdt krijgt de inhoud; drops vallen altijd (always)
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
        check(room.hz.crates.length > n, 'droppings vallen niet in ronde 3 (always)');
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
