// 1943 · Zitadelle — Koersk. Velden: zie maps/index.js.

export default { // §10.5
  name: 'Koersk 1943', style: 'zomer', header: 'ZITADELLE — KOERSK · JULI 1943',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Juli 1943. Operatie Zitadelle: de grootste tankslag uit de geschiedenis op de Russische steppe bij Koersk.',
    terrain: 'Graanvelden en droge steppe, doorsneden door de rivier de Psel, met heuvelruggen als natuurlijke barrières.',
    weather: 'Zomerhitte met slagveldnevel. Vanaf ronde 3 breekt onweer los: de modder verandert het terrein.',
    special: 'Graanbranden! Schoten en onweer kunnen het graan laten ontvlammen. Het vuur verspreidt zich met de wind en oververhit je motor.',
  },
  // volgorde: soft en rock naast elkaar (lage noise), normal aan het andere uiteinde → zwarte aarde bij rotsen
  terrainPercent: { soft: 12, rock: 8, hard: 15, normal: 45, paved: 6, vegetation: 8, water: 6 },
  noiseScale: 35,
  classes: {
    paved: { label: 'Zandweg', color: '#7a6448' },
    hard: { label: 'Droge steppe', color: '#a89060' },
    normal: { label: 'Graanvelden', color: '#b89a4a' },
    soft: { label: 'Zwarte aarde', color: '#3e3022' },
    marsh: { label: 'Modder (na het onweer)', color: '#4c5440', later: true },
    burnt: { label: 'Verbrand graan', color: '#1c1a17', later: true },
  },
  rocks: { label: "Balka's", color: '#8d8f8c', size: [0.5, 1.2] },
  water: { label: 'De Psel', color: '#3d5a66' },
  vegetation: { type: 'tree', label: 'Bosjes', color: '#3f5a2a', groundAfter: 'normal' },
  noPonds: true, // al het water komt van de rivier
  features: [
    { type: 'river', from: [0.6, 0], to: [1, 0.4], width: 3, bridges: 'atRoads' },
    { type: 'road', from: [0.45, 0.3], to: [0.95, 0.1], width: 2 },
    { type: 'ridge', from: [0.05, 0.42], to: [0.45, 0.66], width: 1.5, openings: 2, wiggle: 0.5 },
    { type: 'ridge', from: [0.55, 0.92], to: [0.95, 0.7], width: 1.5, openings: 2, wiggle: 0.5 },
  ],
  hazard: { type: 'grainFire', shotChance: 0.1, stormShotChance: 0.03, everySeconds: 120, spreadSeconds: 1, burnSeconds: 15, armorPerSecond: 5, wind: true },
  meter: { type: 'temp', label: 'Motortemperatuur', danger: 100, color: '#e0603a', fire: 15, base: -20, fast: 4, idle: -6, fastAbove: 0.8, coolTo: 50, hotSlow: 0.4 },
  look: { grade: { saturation: 0.05, tint: '#ffe8c0', tintStrength: 0.1 }, noise: { strength: 0.08 } },
  tunnelColor: '#2e2418',
  weather: [
    { label: 'Zomerhitte', untilRound: 2, effect: { visibility: 12, fires: true, battleSmoke: true } },
    { label: 'Onweer', from: { round: 3 }, effect: { visibility: 8, thunder: true, rain: { min: 0.3, max: 0.8, period: 25 }, terrain: { type: 'reclass', from: ['soft'], to: 'marsh' } } },
  ],
};
