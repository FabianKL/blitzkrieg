// 1944 · Overlord — Carentan. Velden: zie maps/index.js.
import { T_SHERMAN } from './common.js';

export default { // §10.6
  name: 'Carentan 1944', style: 'zomer', header: 'OVERLORD — CARENTAN · JUNI 1944',
  tanks: { A: { ...T_SHERMAN, camo: '#3e4a26' }, B: { name: 'PANZER IV', hull: '#b49a52', mark: 'number', number: '615', camo: '#4d5a2e', sprite: 'panzer4', paint: 'camo' } },
  terrainPercent: { normal: 40, marsh: 15, vegetation: 15, paved: 8, hard: 7, soft: 5, water: 6, rock: 4 },
  classes: {
    paved: { label: 'Wegen en dorpsstraten', color: '#8c8a80' },
    hard: { label: 'Dijkweg', color: '#9c8f6c' },
    normal: { label: 'Weilanden', color: '#56702f' },
    soft: { label: 'Modder rond het moeras', color: '#5c4a34' },
    marsh: { label: 'Moeras', color: '#55696c' },
  },
  rocks: { label: 'Rotsen', color: '#8c8a80', size: [0.5, 1] },
  // de Douve en het kanaal hebben een vaste breedte; op een grote kaart vullen plassen de 6% water aan
  water: { label: 'Douve, kanaal en plassen', color: '#1f3440' },
  vegetation: { type: 'hedge', pattern: 'bocage', spacing: 7, label: 'Heggen (bocage)', color: '#23381b', groundAfter: 'normal' },
  features: [
    { type: 'area', name: 'moeras', rect: [0, 0.5, 0.5, 1], classes: { marsh: 60, soft: 22, normal: 18 } },
    { type: 'river', from: [0, 0.92], to: [0.6, 0.92], width: 3, bridges: 'atRoads', wiggle: 0.05 }, // de Douve
    { type: 'river', from: [0.25, 0.5], to: [0.25, 1], width: 2, bridges: 'atRoads', wiggle: 0.04 }, // kanaal
    { type: 'village', at: [0.75, 0.25], size: 0.07, name: 'Carentan', buildings: [5, 7], landmark: 'kerk' },
    { type: 'road', from: [0, 0.72], to: [0.75, 0.25], width: 2, class: 'hard' }, // dijkweg over het moeras
    { type: 'road', from: [0.75, 0.25], to: [1, 0.3], width: 2 },
    { type: 'road', from: [0.75, 0.25], to: [0.78, 0], width: 2 },
    { type: 'road', from: [0.75, 0.25], to: [0.9, 1], width: 2 },
  ],
  hazard: { type: 'atGuns', count: 2, coneDegrees: 45, rangeT: 10, everySeconds: 4, armorLoss: 25, hp: 4 },
  look: { grade: { saturation: -0.05, tint: '#e6f0e0', tintStrength: 0.08 }, noise: { strength: 0.08 }, weather: 'rain', amount: 8 },
  tunnelColor: '#4a3a22',
  weather: [
    { label: 'Ochtendmist', untilRound: 1, effect: { visibility: 4 } },
    { label: 'Wisselend bewolkt', from: { round: 2 }, effect: { visibility: 12 } },
    { label: 'Regenbui', from: { round: 2 }, every: 120, duration: 20, effect: { visibility: 8, trackEraser: 'nearWater' } },
  ],
};
