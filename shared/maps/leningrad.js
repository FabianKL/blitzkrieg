// 1942 · Beleg van Leningrad — Leningrad. Velden: zie maps/index.js.
import { storm } from './common.js';

export default { // §10.4
  name: 'Leningrad 1942', style: 'winter', header: 'BELEG VAN LENINGRAD — LENINGRAD · WINTER 1942',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Winter 1942. De Sovjet-Unie probeert het beleg van Leningrad te doorbreken over het ijs van de bevroren Neva.',
    terrain: 'Besneeuwde oevers met berkenbossen en een breed bevroren meer centraal op de kaart.',
    weather: 'Korte winterdagen met dalend zicht. Sneeuwval wisselt van licht tot zwaar. Vanaf ronde 4 begint de dooi.',
    special: 'De motorwarmte zakt als je stilstaat — bij nul bevriest de motor. Blijf rijden! De dooi laat het ijs smelten en maakt plassen.',
  },
  terrainPercent: { soft: 48, hard: 15, ice: 12, rock: 8, vegetation: 12, paved: 5 },
  classes: {
    paved: { label: 'Weg en brug', color: '#9a978f' },
    hard: { label: 'Bevroren veen', color: '#8a7e72' },
    soft: { label: 'Sneeuw op aarde', color: '#e6ecef' },
    ice: { label: 'Bevroren meer', color: '#a9c7d6' },
  },
  rocks: { label: 'Steile oever en ruïnes', color: '#8a8f94', in: 'zuid', size: [0.6, 1.4] },
  water: { label: 'Open water', color: '#1e2e38' },
  vegetation: { type: 'birch', label: 'Berkenbossen', color: '#7d8a74', groundAfter: 'soft' },
  noPonds: true,
  // ijs breekt bijna niet
  iceBreak: 0.02,
  features: [
    // één aaneengesloten bevroren meer centraal (geen losse vijvers of wakken)
    { type: 'lake', cx: 0.5, cy: 0.45, rx: 0.30, ry: 0.22, frozen: true, irregular: true,
      bank: { side: 'north', thickness: 1, openings: 3, openingWidth: 3 } },
    { type: 'area', name: 'zuid', rect: [0, 0.65, 1, 1], classes: { soft: 75, hard: 25 } },
    // weg met brug over het meer
    { type: 'road', from: [0.5, 0], to: [0.5, 1], width: 2 },
  ],
  meter: { type: 'heat', label: 'Motorwarmte', start: 100, danger: 0, low: true, color: '#e08a40', warm: 10, cool: -5, idleBelow: 0.3, rampSeconds: 4, rampFrom: 0.1 },
  look: { light: { dx: 0.5, dy: 0.65, alpha: 0.32, blur: 3 }, grade: { saturation: -0.18, brightness: 0.97, contrast: 1.06, tint: '#d2e2ff', tintStrength: 0.18 }, noise: { scale: 6, strength: 0.3, octaves: 4 }, blend: 3.5, weather: 'snow', amount: 40, vignette: 0.28, fogSoft: 0.25, iceShine: 0.8, shakeOnHit: 0.3, road: { vergeColor: '#f2f6fa', vergeAmount: 0.55 }, bridge: { kind: 'hout' }, objects: { rocks: 1 } },
  tunnelColor: '#3a2f27',
  weather: [
    { label: 'Winterschemering', from: { secondsInRound: 0 }, effect: { visibility: { start: 12, end: 6, overSeconds: 180 } } },
    { label: 'Sneeuwval', untilRound: 4, effect: { drift: { min: 0.15, max: 0.8, period: 30 } } },
    storm('Sneeuwjacht', { untilRound: 4 }),
    { label: 'Ijs wordt broos', from: { round: 3 }, untilRound: 3, effect: { iceBreakMul: 2 } },
    { label: 'Ijs kraakt', from: { round: 4 }, untilRound: 4, effect: { iceBreakMul: 4 } },
    { label: 'Dooi', from: { round: 5 }, effect: { terrain: { type: 'thaw', pools: [4, 6], poolRadius: 5 }, thawed: true } },
  ],
};
