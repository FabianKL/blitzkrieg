// 1942 · Beleg van Leningrad — Leningrad. Velden: zie maps/index.js.
import { storm } from './common.js';

export default { // §10.4
  name: 'Leningrad 1942', style: 'winter', header: 'BELEG VAN LENINGRAD — LENINGRAD · WINTER 1942',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Winter 1942. De Sovjet-Unie probeert het beleg van Leningrad te doorbreken over het ijs van de bevroren Neva.',
    terrain: 'Een breed bevroren meer van rechts tot voorbij het midden. Links dicht berkenbos met één weg erdoor. Sneeuwvlaktes boven en onder.',
    weather: 'Korte winterdagen met dalend zicht. Sneeuwval wisselt van licht tot zwaar. Vanaf ronde 4 begint de dooi.',
    special: 'Snel over het ijs of langzaam door het bos? Het ijs kan breken! De motorwarmte zakt als je stilstaat; bij nul bevriest de motor.',
  },
  terrainPercent: { soft: 25, hard: 0, ice: 40, rock: 3, vegetation: 20, paved: 4, marsh: 3 },
  tolerance: { klein: 5, default: 5 },
  classes: {
    paved: { label: 'Pad', color: '#9a978f' },
    hard: { label: 'Bevroren grond', color: '#8a7e72' },
    soft: { label: 'Sneeuw op aarde', color: '#e6ecef' },
    ice: { label: 'Bevroren meer', color: '#a9c7d6' },
    marsh: { label: 'Drassig veen', color: '#6a7a6a' },
  },
  rocks: { label: 'Steile oever', color: '#8a8f94', size: [0.5, 1.0] },
  water: { label: 'Open water', color: '#1e2e38' },
  vegetation: { type: 'birch', label: 'Berken en dennen', color: '#5a6e50', groundAfter: 'soft', spacing: 2 },
  noPonds: true,
  iceBreak: 0.02,
  features: [
    // breed bevroren meer: van rechts tot voorbij het midden (2/3 van de kaart)
    { type: 'lake', cx: 0.65, cy: 0.5, rx: 0.33, ry: 0.42, frozen: true, irregular: true,
      bank: { thickness: 0.5, openings: 4, openingWidth: 3 } },
    // dicht bos in het linker derde
    { type: 'area', name: 'bos', rect: [0.02, 0.1, 0.32, 0.9], classes: { soft: 100 } },
    // één weg door het bos van boven naar beneden
    { type: 'road', from: [0.17, 0.05], to: [0.17, 0.95], width: 2 },
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
