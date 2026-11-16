// 1944 · Wacht am Rhein — Ardennen. Velden: zie maps/index.js.
import { storm } from './common.js';

export default { // §10.8
  name: 'Ardennen 1944', style: 'winter', header: 'WACHT AM RHEIN — ARDENNEN · DECEMBER 1944',
  tanks: { A: 'sherman', B: 'panther' },
  desc: {
    setting: 'December 1944. Het Ardennenoffensief: de laatste grote Duitse aanval door de besneeuwde Belgische bossen rond Bastogne.',
    terrain: 'Dichte dennenbossen, besneeuwde wegen die uitwaaieren vanuit Bastogne. Bijna alleen sneeuw en bos.',
    weather: 'Dichte mist die langzaam optrekt, sneeuwval die wisselt van licht tot zwaar, en sneeuwstormen.',
    special: 'Artilleriebombardementen in drie zwaartegraden: licht, gemiddeld en zwaar. Dennenbomen worden verwoest door inslagen. Brandstofdepots zijn je enige bron.',
  },
  // weinig bevroren grond (5%), veel sneeuw; weinig rotsen, veel bos; geen water
  terrainPercent: { soft: 49, hard: 5, vegetation: 30, paved: 8, rock: 2, water: 0 },
  tolerance: { klein: 1, default: 0, groot: 2, extragroot: 4 },
  classes: {
    paved: { label: 'Bosweg en Bastogne', color: '#9b9184' },
    hard: { label: 'Bevroren grond', color: '#bccfda' },
    soft: { label: 'Verse sneeuw', color: '#dfe6ea' },
  },
  rocks: { label: 'Rotsblokken', color: '#8d9196' },
  vegetation: { type: 'pine', label: 'Dennenbossen', color: '#1f3a2a', groundAfter: 'soft' },
  features: [
    { type: 'village', at: [0.5, 0.5], size: 0.25, name: 'Bastogne', layout: 'roadside',
      roadsideRows: { blocks: 2, distanceT: 3.2, blockGapCells: 0, sideSearchCells: 3, alongAttempts: 20, alongStepCells: 3 },
      looseHouses: { min: 2, max: 4, minDistanceT: 5, maxDistanceT: 8, attempts: 1200 },
      buildings: [23, 25], landmark: 'kerk' },
    { type: 'road', from: [0.5, 0.5], to: [0, 0.5], width: 2, straight: true },
    { type: 'road', from: [0.5, 0.5], to: [0.5, 0], width: 2, straight: true },
    { type: 'road', from: [0.5, 0.5], to: [1, 0.5], width: 2, straight: true },
    { type: 'road', from: [0.5, 0.5], to: [0.15, 1], width: 2, straight: true },
    { type: 'road', from: [0.5, 0.5], to: [0.85, 1], width: 2, straight: true },
  ],
  look: { grade: { saturation: -0.12, contrast: 1.04, tint: '#d4e2ff', tintStrength: 0.15 }, noise: { scale: 8, strength: 0.1 }, blend: 3, weather: 'snow', amount: 25, vignette: 0.25, fogSoft: 0.2, road: { vergeColor: '#f2f6fa', vergeAmount: 0.55 }, bridge: { kind: 'hout' }, objects: { rocks: 1 } },
  tunnelColor: '#2b2118',
  weather: [
    { label: 'Dichte mist', from: { secondsInRound: 0 }, untilRound: 2, effect: { visibility: { pulse: { thick: 2, clear: 12, thickSeconds: 60, clearSeconds: 30 } }, fog: true } },
    { label: 'Sneeuwval', effect: { drift: { min: 0.15, max: 0.8, period: 30 } } },
    storm('Sneeuwstorm'),
  ],
  hazard: {
    type: 'bombardment', areaT: 6, durationSeconds: 3, warningSeconds: 1, destroysPine: true,
    nearPlayer: true, nearOffsetT: 3, intervals: [20, 18, 15, 12, 10],
    levels: {
      licht:     { weight: 3, armorLoss: 10, impacts: 3 },
      gemiddeld: { weight: 2, armorLoss: 20, impacts: 6 },
      zwaar:     { weight: 1, armorLoss: 30, impacts: 10 },
    },
  },
  scarce: { type: 'fuelDepots', count: 3, fromBase: 40, apart: 25, reach: 4, infinite: true, fixed: true },
  refill: { fuel: false }, // brandstof alleen bij de depots, niet in de basis
};
