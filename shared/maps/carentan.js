// 1944 · Overlord — Carentan. Velden: zie maps/index.js.

export default { // §10.6
  name: 'Carentan 1944', style: 'zomer', header: 'OVERLORD — CARENTAN · JUNI 1944',
  tanks: { A: 'sherman', B: 'panther' },
  desc: {
    setting: 'Juni 1944. D-Day: na de landing in Normandië vechten de geallieerden om het strategische stadje Carentan.',
    terrain: 'Normandisch bocagelandschap met dichte heggen rond de weilanden, moeras en modder langs de dijkweg.',
    weather: 'Ochtendmist in de eerste ronde, daarna wisselend bewolkt met felle regenbuien met onweer die sporen bij het water wissen.',
  },
  terrainPercent: { normal: 46, marsh: 17, vegetation: 15, paved: 8, hard: 7, soft: 6, rock: 1 },
  classes: {
    paved: { label: 'Wegen en dorpsstraten', color: '#8c8a80' },
    hard: { label: 'Dijkweg', color: '#9c8f6c' },
    normal: { label: 'Weilanden', color: '#56702f' },
    soft: { label: 'Modder rond het moeras', color: '#5c4a34' },
    marsh: { label: 'Moeras', color: '#55696c' },
  },
  rocks: { label: 'Rotsen', color: '#8c8a80', size: [0.5, 1] },
  vegetation: { type: 'hedge', pattern: 'bocage', spacing: 7, label: 'Heggen (bocage)', color: '#23381b', groundAfter: 'normal', excludeClasses: ['marsh', 'soft'] },
  features: [
    { type: 'village', at: [0.75, 0.25], size: 0.07, name: 'Carentan', buildings: [5, 7], landmark: 'kerk' },
    { type: 'road', from: [0, 0.72], to: [0.75, 0.25], width: 2, class: 'hard', dikes: { floodplain: 3, width: 0 } }, // dijkweg met moeras ernaast
    { type: 'road', from: [0.75, 0.25], to: [1, 0.3], width: 2 },
    { type: 'road', from: [0.75, 0.25], to: [0.78, 0], width: 2 },
    { type: 'road', from: [0.75, 0.25], to: [0.9, 1], width: 2 },
  ],
  sideRoadZone: [0.5, 0, 1, 1],
  look: { grade: { saturation: -0.05, tint: '#e6f0e0', tintStrength: 0.08 }, noise: { strength: 0.08 } },
  tunnelColor: '#4a3a22',
  weather: [
    { label: 'Ochtendmist', untilRound: 1, effect: { visibility: 4 } },
    { label: 'Wisselend bewolkt', from: { round: 2 }, effect: { visibility: 12 } },
    { label: 'Regenbui', from: { round: 2 }, randomEvery: { min: 30, max: 90 }, duration: 20, effect: { visibility: 8, trackEraser: 'nearWater', rain: { min: 1, max: 1 }, lightning: { every: 7 } } },
  ],
};
