// 1940 · Fall Gelb — Grebbeberg. Velden: zie maps/index.js.

export default { // §10.1
  name: 'Grebbeberg 1940', style: 'zomer', header: 'FALL GELB — GREBBEBERG · MEI 1940',
  tanks: { A: 'landsverk', B: 'panther' },
  desc: {
    setting: 'Mei 1940. De Duitse invasie van Nederland begint. Bij de Grebbeberg verdedigt het Nederlandse leger de Grebbelinie tegen een overmacht.',
    terrain: 'Weilanden in de vallei, een beboste heuvel centraal, en de rivier aan de bovenrand. Het inundatiewater stijgt vanuit de rivier richting de heuvel.',
    weather: 'Vanaf ronde 2 stijgt het inundatiewater in de vallei. In ronde 3 maakt regen het zicht slechter.',
    special: 'Munitie alleen bij het depot in Rhenen. Het stijgende water maakt de vallei steeds moeilijker begaanbaar — maar over de heuvel ben je sneller.',
  },
  terrainPercent: { normal: 34, soft: 17, hard: 10, vegetation: 22, marsh: 7, rock: 2, paved: 8 },
  tolerance: { klein: 5, default: 6 },
  classes: {
    paved: { label: 'Wegen en het dorp', color: '#c8b48a' },
    hard: { label: 'Droge grond op de heuvel', color: '#9c9462' },
    normal: { label: 'Weilanden', color: '#6d8a3a' },
    soft: { label: 'Natte klei', color: '#6f6446' },
    marsh: { label: 'Drassig', color: '#5c7360' },
  },
  rocks: { label: 'Rotsen op de heuvelflank', color: '#9a9890', in: 'heuvel', size: [0.5, 1.4] },
  water: { label: 'Inundatiewater', color: '#3d5f6f' },
  vegetation: { type: 'tree', label: 'Loofbossen', color: '#2f4a24', groundAfter: 'hard', in: 'heuvel' },
  noPonds: true,
  features: [
    // vallei bovenaan (waar het inundatiewater stijgt), heuvel centraal onderaan
    { type: 'area', name: 'vallei', rect: [0, 0, 1, 0.55], classes: { normal: 50, soft: 34, marsh: 16 } },
    { type: 'area', name: 'heuvel', rect: [0.1, 0.5, 0.9, 1], classes: { hard: 20, normal: 80 } },
    // rivier in de onbegaanbare bovenrand (bron van het inundatiewater, 2T breed)
    { type: 'river', from: [0, 0.01], to: [1, 0.01], width: 2, bridges: false, inEdge: true },
    { type: 'village', at: [0.35, 0.7], size: 0.07, name: 'Rhenen', buildings: [4, 6], landmark: 'kerk', depot: 'ammo' },
    { type: 'village', at: [0.65, 0.7], size: 0.05, name: 'Achterberg', buildings: [2, 4], depot: 'ammo' },
    // weg van vallei naar het dorp op de heuvel, en een weg over de heuvel
    { type: 'road', from: [0.5, 0.1], to: [0.35, 0.7], width: 2 },
    { type: 'road', from: [0.2, 0.8], to: [0.8, 0.8], width: 2 },
  ],
  refill: { ammo: false },
  scarce: { type: 'ammoDepot', perSecond: 5, radiusT: 2.5 },
  look: { grade: { saturation: 0.05, tint: '#fff2d8', tintStrength: 0.08 }, noise: { strength: 0.08 } },
  tunnelColor: '#4a3a22',
  weather: [
    // inundatie: y-gebaseerd, water stijgt vanuit de rivier (boven) richting de heuvel (onder)
    { label: 'Inundatie', from: { round: 2 }, everyRound: true, untilRound: 4, effect: { terrain: { type: 'inundate', direction: 'south', from: 0, to: 0.55, stages: 4 } } },
    { label: 'Regen', from: { round: 3 }, untilRound: 3, effect: { visibility: 8, rain: { min: 0.2, max: 0.6, period: 25 } } },
  ],
};
