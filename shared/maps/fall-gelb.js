// 1940 · Fall Gelb — Grebbeberg. Velden: zie maps/index.js.

export default { // §10.1
  name: 'Grebbeberg 1940', style: 'zomer', header: 'FALL GELB — GREBBEBERG · MEI 1940',
  tanks: { A: { name: 'LANDSVERK', hull: '#6a7158', mark: 'triangle' }, B: { name: 'PANZER II', hull: '#4f5356', mark: 'number', number: '211' } },
  terrainPercent: { normal: 39, soft: 17, hard: 10, vegetation: 15, marsh: 7, rock: 4, paved: 8 },
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
  noPonds: true, // bij de start geen open water
  features: [
    { type: 'area', name: 'vallei', rect: [0, 0, 0.55, 1], classes: { normal: 50, soft: 34, marsh: 16 } },
    { type: 'area', name: 'heuvel', rect: [0.55, 0, 1, 1], classes: { hard: 40, normal: 60 } },
    { type: 'village', at: [0.65, 0.75], size: 0.07, name: 'Rhenen', buildings: [4, 6], landmark: 'kerk', depot: 'ammo' },
    { type: 'road', from: [0, 0.45], to: [0.65, 0.75], width: 2 },
    { type: 'road', from: [0.65, 0.75], to: [1, 0.35], width: 2 },
  ],
  refill: { ammo: false }, // munitie alleen bij het depot in Rhenen
  scarce: { type: 'ammoDepot', perSecond: 5, radiusT: 2.5 }, // munitie per seconde binnen radiusT van het depot
  look: { grade: { saturation: 0.05, tint: '#fff2d8', tintStrength: 0.08 }, noise: { strength: 0.08 } },
  tunnelColor: '#4a3a22',
  weather: [
    { label: 'Inundatie', from: { round: 2 }, everyRound: true, untilRound: 4, effect: { terrain: { type: 'inundate', valley: [0, 0.55], stages: 3 } } },
    { label: 'Regen', from: { round: 3 }, untilRound: 3, effect: { visibility: 8 } },
    { label: 'Rook van brandende boerderijen', effect: { farmSmoke: true } },
  ],
};
