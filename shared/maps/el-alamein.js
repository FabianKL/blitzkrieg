// 1942 · Lightfoot — El Alamein. Velden: zie maps/index.js.

export default { // §10.3
  name: 'El Alamein 1942', style: 'woestijn', header: 'LIGHTFOOT — EL ALAMEIN · OKTOBER 1942',
  tanks: { A: 'comet', B: 'panther' },
  desc: {
    setting: 'Oktober 1942. Operatie Lightfoot: Montgomery doorbreekt Rommels stellingen bij El Alamein in de Noord-Afrikaanse woestijn.',
    terrain: 'Woestijnzand met rotsplateaus, een kustweg langs de Middellandse Zee en palmen langs de kust.',
    weather: 'Verzengende hitte veroorzaakt luchtspiegelingen. Korte maar hevige zandstormen bouwen langzaam op en beperken het zicht drastisch.',
    special: 'De zandmeter loopt op in het losse zand en vreet aan je pantser. Onzichtbare mijnen liggen verborgen in het woestijnzand.',
  },
  // hard en soft naast elkaar in de noise-verdeling → aaneengesloten rotsige grond
  terrainPercent: { hard: 28, soft: 47, paved: 5, rock: 5, water: 10, vegetation: 5 },
  terrainOverride: { hard: { track: 0, noTunnel: true } }, // geen sporen/tunnels op rotsige grond
  noiseScale: 35,
  classes: {
    paved: { label: 'Kustweg', color: '#a89c84' },
    hard: { label: 'Rotsige grond', color: '#b39a6a' },
    soft: { label: 'Woestijnzand', color: '#d8bc80' },
  },
  rocks: { label: 'Rotsplateaus', color: '#9a9a96', size: [2, 4] },
  water: { label: 'Zee', color: '#2f5f7a' },
  vegetation: { type: 'shrub', label: 'Dorre struiken', color: '#6e6a3c', groundAfter: 'soft', sprites: { struik: 0.65, cactus: 0.35 }, palmCoast: 12 },
  noPonds: true,
  features: [
    { type: 'sea', side: 'north', depth: 0.13 },
    // kustweg horizontaal, minstens 1T van de zee (de weg-marge in mapgen.js beschermt dit)
    { type: 'road', from: [0, 0.17], to: [1, 0.17], width: 2, bridges: false },
  ],
  // mijnen alleen in woestijnzand (soft)
  mines: true, mineClass: 'soft',
  meter: { type: 'sand', label: 'Zandmeter', danger: 60, color: '#d8a040', soft: 2, firm: -5, armorPct: 1, slow: 0.7 },
  look: { grade: { saturation: -0.12, contrast: 1.05, tint: '#ffd9a0', tintStrength: 0.18 }, noise: { scale: 12, strength: 0.12 }, weather: 'sand', amount: 14, vignette: 0.35, road: { ruts: 0.3, vergeAmount: 0.25, vergeColor: '#a8875a' } },
  tunnelColor: '#6e5430',
  weather: [
    { label: 'Hitte', effect: { visibility: 10, heatHaze: true, mirages: true } },
    // constante woestijnwind die wisselt van licht tot stevig
    { label: 'Woestijnwind', effect: { drift: { min: 0.15, max: 0.6, period: 30, ground: { soft: 1, hard: 0.5, paved: 0.5 } } } },
    { label: 'Zandstorm', randomEvery: { min: 45, max: 120 }, duration: 30, effect: {
      visibility: 2, trackEraser: true, burial: true, hidesMinimap: true,
      drift: { min: 0, max: 1, rampSeconds: 10, ground: { soft: 1, hard: 0.5, paved: 0.5 } },
    } },
  ],
};
