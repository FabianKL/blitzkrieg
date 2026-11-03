// 1941 · Barbarossa — Russische vlakte. Velden: zie maps/index.js.

export default { // §10.2
  name: 'Russische vlakte 1941', style: 'zomer', header: 'BARBAROSSA — RUSSISCHE VLAKTE · ZOMER 1941',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Zomer 1941. Operatie Barbarossa: de Duitse Wehrmacht valt de Sovjet-Unie binnen over de eindeloze Russische vlakte.',
    terrain: 'Open, droge steppe met akkers, berkenbossen en een zandweg door een klein dorp.',
    weather: 'Hittegolven met stofwolken in de eerste rondes. Daarna breekt het modderseizoen aan: de harde grond wordt drassig.',
    special: 'Het modderseizoen verandert het slagveld: droge vlakte en akkers worden zachte modder die je tank vertraagt.',
  },
  // volgorde: soft en normal gescheiden door hard, zodat akkers en zandige plekken niet grenzen
  terrainPercent: { normal: 15, vegetation: 12, hard: 55, soft: 5, paved: 6, rock: 4, water: 3 },
  noiseScale: 40, // grotere aaneengesloten vlakken (akkers, steppe)
  farms: { count: { klein: 2, middel: 4, groot: 5 }, class: 'normal' },
  classes: {
    paved: { label: 'Zandweg en dorp', color: '#b89c6a' },
    hard: { label: 'Droge, harde vlakte', color: '#c2a868' },
    normal: { label: 'Akkers', color: '#8f8a48' },
    soft: { label: 'Zandige plekken (later modder)', color: '#5a4632' },
  },
  rocks: { label: 'Rotsblokken', color: '#8d8a80' },
  water: { label: 'Plassen en meren', color: '#4a6a6a' },
  vegetation: { type: 'birch', label: 'Berkenbossen', color: '#5f7a3a', groundAfter: 'normal' },
  noPonds: true,
  features: [
    { type: 'road', from: [0, 0.5], to: [1, 0.5], width: 2 },
    { type: 'village', at: [0.5, 0.5], size: 0.07, name: 'Dorp', layout: 'row', buildings: [3, 5] },
    // 2-3 aaneengesloten waterlichamen (korte brede rivierlijnen)
    { type: 'river', from: [0.2, 0.25], to: [0.35, 0.55], width: 3, bridges: false, wiggle: 0.06 },
    { type: 'river', from: [0.7, 0.4], to: [0.85, 0.7], width: 3, bridges: false, wiggle: 0.06 },
  ],
  look: { grade: { saturation: -0.05, tint: '#ffe6b8', tintStrength: 0.12 }, noise: { strength: 0.1 }, weather: 'dust', amount: 6 },
  tunnelColor: '#3e3022',
  weather: [
    { label: 'Zomer', untilRound: 2, effect: { visibility: 10, heatHaze: true, dust: true } },
    // de zandweg wordt ook modder in het modderseizoen
    { label: 'Modderseizoen', from: { round: 3 }, effect: { visibility: 8, mud: true, terrain: { type: 'reclass', from: ['hard', 'normal', 'paved'], to: 'soft', keepTracks: true } } },
  ],
};
