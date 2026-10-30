// 1944 · Wacht am Rhein — Ardennen. Velden: zie maps/index.js.
import { storm, T_SHERMAN } from './common.js';

export default { // §10.8
  name: 'Ardennen 1944', style: 'winter', header: 'WACHT AM RHEIN — ARDENNEN · DECEMBER 1944',
  tanks: { A: { ...T_SHERMAN, winter: true, paint: 'winter' }, B: { name: 'KÖNIGSTIGER', hull: '#d8d6cc', mark: 'number', number: '332', sprite: 'koenigstiger' } },
  terrainPercent: { soft: 52, hard: 12, vegetation: 18, paved: 8, rock: 6, water: 4 },
  tolerance: { klein: 1, default: 0 }, // klein: wegen (vaste breedte) zijn ~14% verhard, dat gaat van de sneeuw af
  classes: {
    paved: { label: 'Bosweg en Bastogne', color: '#9b9184' },
    hard: { label: 'Bevroren grond', color: '#bccfda' },
    soft: { label: 'Verse sneeuw', color: '#dfe6ea' },
  },
  rocks: { label: 'Rotsblokken', color: '#8d9196' },
  water: { label: 'Bergbeek', color: '#1e3a4a' },
  vegetation: { type: 'pine', label: 'Dennenbossen', color: '#1f3a2a', groundAfter: 'soft' },
  features: [
    { type: 'village', at: [0.5, 0.5], size: 0.17, name: 'Bastogne', buildings: [6, 8], landmark: 'kerk' },
    { type: 'road', from: [0.5, 0.5], to: [0, 0.5], width: 2 },
    { type: 'road', from: [0.5, 0.5], to: [0.5, 0], width: 2 },
    { type: 'road', from: [0.5, 0.5], to: [1, 0.5], width: 2 },
    { type: 'road', from: [0.5, 0.5], to: [0.15, 1], width: 2 },
    { type: 'road', from: [0.5, 0.5], to: [0.85, 1], width: 2 },
    { type: 'river', from: [0, 0.8], to: [1, 0.8], width: 2, bridges: 'atRoads' },
  ],
  // wegen: opgeschoven sneeuw in de berm; brug: hout; rotsblokken op alle rots
  look: { grade: { saturation: -0.12, contrast: 1.04, tint: '#d4e2ff', tintStrength: 0.15 }, noise: { scale: 8, strength: 0.1 }, blend: 3, weather: 'snow', amount: 25, vignette: 0.25, fogSoft: 0.2, road: { vergeColor: '#f2f6fa', vergeAmount: 0.55 }, bridge: { kind: 'hout' }, objects: { rocks: 1 } },
  tunnelColor: '#2b2118',
  weather: [
    { label: 'Dichte mist', from: { secondsInRound: 0 }, untilRound: 2, effect: { visibility: { start: 2, end: 12, overSeconds: 120 }, fog: true } },
    storm('Sneeuwstorm'),
  ],
  hazard: { type: 'forestBarrage', everySeconds: 20, area: 6, warningSeconds: 2, armorLoss: 15 },
  // depots per kaartgrootte, minstens fromBase cellen van een basis en apart van elkaar; oppakken binnen reach cellen
  scarce: { type: 'fuelDepots', count: { klein: 2, middel: 2, groot: 3, extragroot: 3 }, fromBase: 40, apart: 60, reach: 4 },
};
