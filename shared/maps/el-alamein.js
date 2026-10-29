// 1942 · Lightfoot — El Alamein. Velden: zie maps/index.js.
import { storm } from './common.js';

export default { // §10.3
  name: 'El Alamein 1942', style: 'woestijn', header: 'LIGHTFOOT — EL ALAMEIN · OKTOBER 1942',
  tanks: { A: { name: 'CRUSADER', hull: '#c9b07a', mark: 'roundel', camo: '#7d8a8e' }, B: { name: 'PANZER III', hull: '#c2ac72', mark: 'number', number: '412' } },
  terrainPercent: { soft: 50, hard: 20, paved: 5, rock: 10, water: 10, vegetation: 5 },
  classes: {
    paved: { label: 'Kustweg', color: '#a89c84' },
    hard: { label: 'Rotsige grond', color: '#b39a6a' },
    soft: { label: 'Woestijnzand', color: '#d8bc80' },
  },
  rocks: { label: 'Rotsplateaus', color: '#9a9a96', size: [3.5, 6] },
  water: { label: 'Zee', color: '#2f5f7a' },
  vegetation: { type: 'shrub', label: 'Dorre struiken', color: '#6e6a3c', groundAfter: 'soft' },
  noPonds: true,
  features: [
    { type: 'sea', side: 'north', depth: 0.13 }, // ~10% van het speelbare deel (zonder de rotsrand)
    { type: 'road', from: [0, 0.17], to: [1, 0.17], width: 2, bridges: false },
  ],
  // per vak (T) zand +soft, op hard/verhard firm; boven danger armorPct% pantser per vak zand, bij 100 snelheid slow
  meter: { type: 'sand', label: 'Zandmeter', danger: 60, color: '#d8a040', soft: 2, firm: -5, armorPct: 1, slow: 0.7 },
  // kustweg: duidelijke rijsporen, weinig berm
  look: { grade: { saturation: -0.12, contrast: 1.05, tint: '#ffd9a0', tintStrength: 0.18 }, noise: { scale: 12, strength: 0.12 }, weather: 'dust', amount: 14, vignette: 0.35 , road: { ruts: 0.3, vergeAmount: 0.2 } },
  tunnelColor: '#6e5430',
  weather: [
    { label: 'Hitte', effect: { visibility: 10, heatHaze: true, mirages: true } },
    storm('Zandstorm'),
  ],
  mines: true,
};
