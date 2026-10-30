// 1941 · Barbarossa — Russische vlakte. Velden: zie maps/index.js.
import { T_T34 } from './common.js';

export default { // §10.2
  name: 'Russische vlakte 1941', style: 'zomer', header: 'BARBAROSSA — RUSSISCHE VLAKTE · ZOMER 1941',
  tanks: { A: T_T34, B: { name: 'PANZER III', hull: '#5a5e60', mark: 'number', number: '311', sprite: 'panzer3' } },
  terrainPercent: { hard: 55, normal: 15, soft: 5, vegetation: 12, paved: 6, rock: 4, water: 3 },
  classes: {
    paved: { label: 'Zandweg en dorp', color: '#b89c6a' },
    hard: { label: 'Droge, harde vlakte', color: '#c2a868' },
    normal: { label: 'Akkers', color: '#8f8a48' },
    soft: { label: 'Zandige plekken (later modder)', color: '#5a4632' },
  },
  rocks: { label: 'Rotsblokken', color: '#8d8a80' },
  water: { label: 'Kleine plassen', color: '#4a6a6a' },
  vegetation: { type: 'birch', label: 'Berkenbossen', color: '#5f7a3a', groundAfter: 'normal' },
  features: [
    { type: 'road', from: [0, 0.5], to: [1, 0.5], width: 2 },
    { type: 'village', at: [0.5, 0.5], size: 0.05, name: 'Dorp', layout: 'row', buildings: [5, 5] },
  ],
  look: { grade: { saturation: -0.05, tint: '#ffe6b8', tintStrength: 0.12 }, noise: { strength: 0.1 }, weather: 'dust', amount: 6 },
  tunnelColor: '#3e3022',
  weather: [
    { label: 'Zomer', untilRound: 2, effect: { visibility: 10, heatHaze: true, dust: true } },
    { label: 'Modderseizoen', from: { round: 3 }, effect: { visibility: 8, mud: true, terrain: { type: 'reclass', from: ['hard', 'normal'], to: 'soft', keepTracks: true } } },
  ],
};
