// 1944 · Market Garden — Arnhem. Velden: zie maps/index.js.

export default { // §10.7
  name: 'Arnhem 1944', style: 'zomer', header: 'MARKET GARDEN — ARNHEM · SEPTEMBER 1944',
  tanks: { A: 'comet', B: 'panther' },
  desc: {
    setting: 'September 1944. Operatie Market Garden: een gewaagde luchtlanding om de brug bij Arnhem te veroveren — "a bridge too far".',
    terrain: 'Hollands polderlandschap met boomgaarden, twee brede rivieren met dijken en uiterwaarden, en het stadje Arnhem.',
    weather: 'Helder weer met luchtlandingen in de eerste rondes. Daarna mist en regen.',
    special: 'De brug kan instorten bij elke oversteek — de kans groeit. Geen brandstof of munitie bij de basis: wacht op geallieerde luchtdroppings.',
  },
  // nauwelijks rotsen, vlak land; geen losse marsh (komt van de dijken)
  terrainPercent: { normal: 45, soft: 12, hard: 10, water: 12, paved: 8, vegetation: 10, rock: 1 },
  classes: {
    paved: { label: 'Wegen, brug en stad', color: '#8a7a6a' },
    hard: { label: 'Dijken', color: '#9a8a5a' },
    normal: { label: 'Polders', color: '#6a8a3a' },
    soft: { label: 'Natte klei', color: '#6b5a3e' },
    marsh: { label: 'Uiterwaarden', color: '#5f7258' },
    ford: { label: 'Doorwaadbare plek', color: '#6f8288' },
  },
  rocks: { label: 'Rotsen', color: '#8a8580', size: [0.5, 1] },
  water: { label: 'De Rijn en de Waal', color: '#3a5a6a' },
  vegetation: { type: 'tree', pattern: 'rows', label: 'Bomenrijen en boomgaarden', color: '#3f5a2a', groundAfter: 'normal' },
  noPonds: true, // al het water komt van de twee rivieren
  noBases: true,
  features: [
    // twee verticale rivieren: rivier-uiterwaard-dijk-polder aan beide kanten
    { type: 'river', from: [0.35, 0], to: [0.35, 1], width: 3, bridges: 'atRoads', wiggle: 0.03,
      fords: { klein: 1, middel: 2, groot: 3, extragroot: 3 },
      dikes: { floodplain: 1, width: 1 } },
    { type: 'river', from: [0.65, 0], to: [0.65, 1], width: 3, bridges: 'atRoads', wiggle: 0.03,
      fords: { klein: 1, middel: 2, groot: 3, extragroot: 3 },
      dikes: { floodplain: 1, width: 1 } },
    { type: 'road', from: [0.5, 0], to: [0.5, 1], width: 2 },
    { type: 'road', from: [0, 0.5], to: [1, 0.5], width: 2 },
    { type: 'village', at: [0.8, 0.3], size: { klein: 0.14, middel: 0.09 }, name: 'Arnhem', buildings: [4, 8], landmark: 'kerk' },
  ],
  hazard: { type: 'bridgeBlast', armorLoss: 40, chance: 0.1, chanceStep: 0.05 },
  scarce: { type: 'airDrops', everySeconds: 30, fuel: 0.4, ammo: 25, always: true },
  refill: { fuel: false, ammo: false, armor: false },
  look: { noise: { strength: 0.08 }, bridge: { kind: 'staal' } },
  tunnelColor: '#4a3a22',
  weather: [
    { label: 'Helder', roundPattern: [1, 1, 0], effect: { visibility: 12, citySmoke: true } },
    { label: 'Mist en regen', roundPattern: [0, 0, 1], effect: { visibility: 8, rain: { min: 0.2, max: 0.6, period: 25 } } },
  ],
};
