// 1944 · Market Garden — Arnhem. Velden: zie maps/index.js.

export default { // §10.7
  name: 'Arnhem 1944', style: 'zomer', header: 'MARKET GARDEN — ARNHEM · SEPTEMBER 1944',
  tanks: { A: { name: 'CROMWELL', hull: '#55602f', mark: 'star' }, B: { name: 'PANZER IV', hull: '#5a5e60', mark: 'number', number: '722' } },
  terrainPercent: { normal: 40, soft: 12, hard: 10, water: 12, paved: 8, vegetation: 10, marsh: 5, rock: 3 },
  classes: {
    paved: { label: 'Wegen, brug en stad', color: '#8a7a6a' },
    hard: { label: 'Dijken', color: '#9a8a5a' },
    normal: { label: 'Polders', color: '#6a8a3a' },
    soft: { label: 'Natte klei', color: '#6b5a3e' },
    marsh: { label: 'Uiterwaarden', color: '#5f7258' },
    ford: { label: 'Doorwaadbare plek', color: '#6f8288' },
  },
  rocks: { label: 'Rotsen', color: '#8a8580', size: [0.5, 1] },
  water: { label: 'De Rijn en sloten', color: '#3a5a6a' },
  vegetation: { type: 'tree', pattern: 'rows', label: 'Bomenrijen en boomgaarden', color: '#3f5a2a', groundAfter: 'normal' },
  basesAcross: 0, // bases om en om ten noorden en ten zuiden van de Rijn
  features: [
    { type: 'river', from: [0, 0.4], to: [1, 0.4], width: 5, bridges: 'atRoads', wiggle: 0.03, fords: { klein: 1, middel: 2, groot: 3, extragroot: 3 }, dikes: { floodplain: 1, width: 2 } },
    { type: 'road', from: [0.5, 0], to: [0.5, 1], width: 2 },
    { type: 'village', at: [0.5, 0.24], size: 0.05, name: 'Arnhem', buildings: [5, 8], landmark: 'kerk' },
    { type: 'ditches', rect: [0, 0.56, 1, 1], spacing: 24, damsEvery: 1 },
  ],
  hazard: { type: 'bridgeBlast', armorLoss: 40, chance: 0.1, chanceStep: 0.05 }, // kans per oversteek, +5% na elke oversteek
  scarce: { type: 'airDrops', everySeconds: 30, fuel: 0.4, ammo: 25 },
  refill: { fuel: false, ammo: false },
  look: { noise: { strength: 0.08 } },
  tunnelColor: '#4a3a22',
  weather: [
    { label: 'Helder', untilRound: 2, effect: { visibility: 12, drops: true, citySmoke: true } },
    { label: 'Mist en regen', from: { round: 3 }, effect: { visibility: 8 } },
  ],
};
