// 1945 · Seelower Hoogten — Oder-front. Velden: zie maps/index.js.

export default { // §10.9
  name: 'Oder-front 1945', style: 'zomer', header: 'SEELOWER HOOGTEN — ODER-FRONT · APRIL 1945',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'April 1945. De slag om de Seelower Hoogten: het Rode Leger bestormt de laatste verdedigingslinie voor Berlijn.',
    terrain: 'Een steile heuvelrug in het westen, akkers met boerderijen, en een smalle kronkelende rivier.',
    weather: 'De slag begint in het donker met verblindende zoeklichten. Vanaf ronde 3 breekt de dageraad aan.',
    special: 'Zoeklichten verraden je positie: binnen 1 seconde volgt een artilleriebombardement. De heuvelrug biedt dekking maar beperkt je routes.',
  },
  // meer akkers (15%), minder rotsen; wegen lopen de heuvel op
  terrainPercent: { soft: 28, marsh: 15, hard: 20, normal: 15, rock: 7, vegetation: 5, water: 6, paved: 4 },
  noiseScale: 35,
  farms: { count: { klein: 1, middel: 2, groot: 3 }, class: 'normal' },
  classes: {
    paved: { label: 'Wegen', color: '#5a5650' },
    hard: { label: 'Heuvelrug', color: '#4a4238' },
    normal: { label: 'Akkers', color: '#3e4a30' },
    soft: { label: 'Natte aarde', color: '#3a3026' },
    marsh: { label: 'Moeras', color: '#2e3a36' },
  },
  rocks: { label: 'Steile helling', color: '#5a5c5e', in: 'heuvelrug', size: [0.6, 1.5] },
  water: { label: 'De Oder', color: '#18242c' },
  vegetation: { type: 'tree', label: 'Bosjes op de heuvel', color: '#2a3a26', groundAfter: 'hard', in: 'heuvelrug' },
  noPonds: true,
  features: [
    { type: 'area', name: 'heuvelrug', rect: [0, 0, 0.33, 1], classes: { hard: 80, normal: 20 } },
    { type: 'area', name: 'dal', rect: [0.5, 0, 1, 1], classes: { soft: 63, marsh: 37 } },
    // één smalle kronkelende rivier van boven naar beneden
    { type: 'river', from: [0.65, 0], to: [0.65, 1], width: 2, bridges: 'atRoads', wiggle: 0.14 },
    // helling met meer openingen zodat rotsen niet volledig blokkeren
    { type: 'ridge', from: [0.33, 0], to: [0.33, 1], width: 2, openings: 3, openingWidth: 2, wiggle: 0.3 },
    // wegen lopen door de heuvel heen (van links naar rechts)
    { type: 'road', from: [0.1, 0.3], to: [0.88, 0.3], width: 2 },
    { type: 'road', from: [0.1, 0.72], to: [0.88, 0.72], width: 2 },
  ],
  // zoeklicht triggert artillerie; daarnaast standaard elke 60 s een willekeurig bombardement
  hazard: { type: 'artillery', everySeconds: 60, warningSeconds: 3, armorLoss: 30, area: 3,
    searchlightDelay: 1 },
  look: { grade: { saturation: -0.15, brightness: 0.92, tint: '#c8d0e8', tintStrength: 0.12 }, vignette: 0.32, bridge: { kind: 'staal' } },
  tunnelColor: '#1a1410',
  weather: [
    { label: 'Nacht met zoeklichten', untilRound: 2, effect: { visibility: 4, night: true, searchlights: { beams: 3, lengthT: 4, widthT: 3, sweepSeconds: 12, visibility: 12, stickSeconds: 1 } } },
    { label: 'Dageraad', from: { round: 3 }, effect: { visibility: 8 } },
  ],
};
