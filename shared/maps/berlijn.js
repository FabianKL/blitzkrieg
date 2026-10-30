// 1945 · Val van Berlijn — Berlijn. Velden: zie maps/index.js.
import { T_T34 } from './common.js';

export default { // §10.10
  name: 'Berlijn 1945', style: 'zomer', header: 'VAL VAN BERLIJN — BERLIJN · APRIL 1945',
  tanks: { A: T_T34, B: { name: 'PANZER IV', hull: '#5a5e60', mark: 'number', number: '503', sprite: 'panzer4' } },
  terrainPercent: { paved: 30, building: 30, soft: 15, normal: 8, vegetation: 5, water: 7, rock: 5 },
  classes: {
    paved: { label: 'Straten en pleinen', color: '#7a7670' },
    soft: { label: 'Puin', color: '#9a8f80' },
    normal: { label: 'Parken', color: '#4a5a3a' },
  },
  buildings: { color: '#8c8a86' },
  rocks: { label: 'Betonnen bunkers', color: '#6c6c68', size: [0.6, 1.2] },
  water: { label: 'Spree en Landwehrkanaal', color: '#2a3a44' },
  vegetation: { type: 'tree', label: 'Parkbomen', color: '#3a4a2a', groundAfter: 'normal', in: 'park' },
  noPonds: true,
  features: [
    // spec: Spree 3 T en kanaal 2 T, maar dan is het water ~12% in plaats van 7%; daarom iets smaller
    { type: 'river', from: [0, 0.35], to: [1, 0.35], width: 2, bridges: 2, wiggle: 0.03 }, // Spree
    { type: 'river', from: [0, 0.7], to: [1, 0.7], width: 1.5, bridges: 2, wiggle: 0.03 }, // Landwehrkanaal
    { type: 'park', at: [0.3, 0.5], size: 0.15, name: 'Tiergarten' },
    { type: 'city', block: [8, 12], street: 2 },
  ],
  // De beschermde zones rond 4 bases (3 T vrij, §6.2) beslaan ~13% van de stad en daar mogen geen
  // huizen staan; met 4 spelers haalt Berlijn daardoor ~25% gebouwen. Op de kleine kaart passen de
  // bases niet tussen de rivieren en nemen ze nog meer van de stad (~20% gebouwen). Ruimere marge (procentpunt).
  tolerance: { klein: 13, default: 8 },
  hazard: { type: 'facades', chancePerSecond: 0.05, armorLoss: 10, rammingLoss: 25, collapseAfterHits: 3, collapseSeconds: 3, collapseLoss: 25, dustSeconds: 10 },
  refill: { armor: false }, // pantser wordt tijdens een ronde niet hersteld
  // straten: stoeprand langs het rooster
  look: { grade: { saturation: -0.3, contrast: 1.05, tint: '#e8e0d8', tintStrength: 0.1 }, weather: 'dust', amount: 5, vignette: 0.32, road: { curb: 0.22 } },
  tunnelColor: '#2a2420',
  weather: [
    { label: 'Rook boven de stad', untilRound: 1, effect: { visibility: 12 } },
    { label: 'Dichtere rook', from: { round: 2 }, untilRound: 2, effect: { visibility: 8 } },
    { label: 'Dikke rook en regen', from: { round: 3 }, effect: { visibility: 6 } }, // geen metro (op verzoek)
  ],
};
