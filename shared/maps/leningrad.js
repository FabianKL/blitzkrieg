// 1942 · Beleg van Leningrad — Leningrad. Velden: zie maps/index.js.
import { storm, T_T34 } from './common.js';

export default { // §10.4
  name: 'Leningrad 1942', style: 'winter', header: 'BELEG VAN LENINGRAD — LENINGRAD · WINTER 1942',
  tanks: { A: { ...T_T34, winter: true }, B: { name: 'PANZER IV', hull: '#4f5458', mark: 'number', number: '211' } },
  terrainPercent: { soft: 46, hard: 15, ice: 12, rock: 8, vegetation: 12, paved: 5, water: 2 },
  classes: {
    paved: { label: 'Weg en brug', color: '#9a978f' },
    hard: { label: 'Bevroren veen', color: '#8a7e72' }, // spec: #4a3a2e, maar dan zie je tunnels niet
    soft: { label: 'Sneeuw op aarde', color: '#e6ecef' },
    ice: { label: 'Bevroren Neva', color: '#a9c7d6' },
  },
  rocks: { label: 'Steile oever en ruïnes', color: '#8a8f94', in: 'zuid', size: [0.6, 1.4] },
  water: { label: 'Wakken', color: '#1e2e38' },
  vegetation: { type: 'birch', label: 'Berkenbossen', color: '#7d8a74', groundAfter: 'soft' },
  noPonds: true,
  features: [
    { type: 'river', from: [0, 0.45], to: [1, 0.45], width: 5, frozen: true, holes: 2, wiggle: 0.04, bank: { side: 'north', thickness: 1, openings: 3, openingWidth: 3 } },
    { type: 'road', from: [0.7, 0], to: [0.7, 1], width: 2 },
    { type: 'area', name: 'zuid', rect: [0, 0.56, 1, 1], classes: { soft: 75, hard: 25 } },
  ],
  // per seconde warm (rijden of in de basis) of cool (stil of langzamer dan idleBelow van de topsnelheid);
  // bij 0 bevroren: in rampSeconds van rampFrom naar volle snelheid
  meter: { type: 'heat', label: 'Motorwarmte', start: 100, danger: 0, low: true, color: '#e08a40', warm: 10, cool: -5, idleBelow: 0.3, rampSeconds: 4, rampFrom: 0.1 },
  // wegen: opgeschoven sneeuw in de berm
  look: { light: { dx: 0.5, dy: 0.65, alpha: 0.32, blur: 3 }, grade: { saturation: -0.18, brightness: 0.97, contrast: 1.06, tint: '#d2e2ff', tintStrength: 0.18 }, noise: { scale: 6, strength: 0.3, octaves: 4 }, blend: 3.5, weather: 'snow', amount: 40, vignette: 0.28, fogSoft: 0.25, iceShine: 0.8, shakeOnHit: 0.3 , road: { vergeColor: '#f2f6fa', vergeAmount: 0.55 } },
  tunnelColor: '#3a2f27',
  weather: [
    { label: 'Winterschemering', from: { secondsInRound: 0 }, effect: { visibility: { start: 12, end: 6, overSeconds: 180 } } },
    storm('Sneeuwjacht', { untilRound: 3 }),
    { label: 'Dooi', from: { round: 4 }, effect: { terrain: { type: 'thaw', pools: [4, 6], poolRadius: 5 }, thawed: true } },
  ],
};
