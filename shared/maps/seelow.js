// 1945 · Seelower Hoogten — Oder-front. Velden: zie maps/index.js.
import { T_T34 } from './common.js';

export default { // §10.9
  name: 'Oder-front 1945', style: 'zomer', header: 'SEELOWER HOOGTEN — ODER-FRONT · APRIL 1945',
  tanks: { A: T_T34, B: { name: 'PANTHER', hull: '#5a5e60', mark: 'number', number: '401' } },
  terrainPercent: { soft: 30, marsh: 15, hard: 20, normal: 10, rock: 10, vegetation: 5, water: 6, paved: 4 },
  classes: {
    paved: { label: 'Wegen', color: '#5a5650' },
    hard: { label: 'Heuvelrug', color: '#4a4238' },
    normal: { label: 'Akkers', color: '#3e4a30' },
    soft: { label: 'Natte aarde', color: '#3a3026' },
    marsh: { label: 'Moeras', color: '#2e3a36' },
  },
  rocks: { label: 'Steile helling', color: '#5a5c5e', in: 'heuvelrug', size: [0.6, 1.5] },
  water: { label: 'De Oder en een kanaal', color: '#18242c' },
  vegetation: { type: 'tree', label: 'Bosjes op de heuvel', color: '#2a3a26', groundAfter: 'hard', in: 'heuvelrug' },
  noPonds: true,
  features: [
    { type: 'area', name: 'heuvelrug', rect: [0, 0, 0.33, 1], classes: { hard: 80, normal: 20 } },
    { type: 'area', name: 'dal', rect: [0.5, 0, 1, 1], classes: { soft: 63, marsh: 37 } }, // minder moeras: op grote kaarten neemt de rivier minder van het dal in
    { type: 'river', from: [0.96, 0], to: [0.96, 1], width: 4, bridges: false, wiggle: 0.03 }, // de Oder
    { type: 'river', from: [0.72, 0], to: [0.72, 1], width: 2, bridges: 'atRoads', wiggle: 0.04 }, // kanaal
    { type: 'ridge', from: [0.33, 0], to: [0.33, 1], width: 2, openings: 1, openingWidth: 3, wiggle: 0.15 }, // helling
    { type: 'road', from: [0.3, 0.3], to: [0.88, 0.3], width: 2 },
    { type: 'road', from: [0.3, 0.72], to: [0.88, 0.72], width: 2 },
  ],
  hazard: { type: 'artillery', everySeconds: 60, area: 6, warningSeconds: 3, armorLoss: 30 },
  // brug: staal over het kanaal
  look: { grade: { saturation: -0.15, brightness: 0.92, tint: '#c8d0e8', tintStrength: 0.12 }, vignette: 0.32, bridge: { kind: 'staal' } },
  tunnelColor: '#1a1410',
  weather: [
    { label: 'Nacht met zoeklichten', untilRound: 2, effect: { visibility: 4, night: true, searchlights: { beams: 3, widthT: 4, sweepSeconds: 12, visibility: 12 } } },
    { label: 'Dageraad', from: { round: 3 }, effect: { visibility: 8 } },
  ],
};
