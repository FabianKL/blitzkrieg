// 1945 · Val van Berlijn — Berlijn. Velden: zie maps/index.js.

export default { // §10.10
  name: 'Berlijn 1945', style: 'zomer', header: 'VAL VAN BERLIJN — BERLIJN · APRIL 1945',
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'April 1945. De val van Berlijn: het Rode Leger vecht zich straat voor straat door de brandende hoofdstad van het Derde Rijk.',
    terrain: 'Verwoeste straten en pleinen, de Spree en het Landwehrkanaal, puinhopen, betonnen bunkers en de Tiergarten als groene oase.',
    weather: 'Dichte rook hangt boven de stad en wordt elke ronde dikker, tot het zicht bijna verdwijnt. In ronde 3 regent het, met onweersbuien.',
    special: 'Instortende gevels: gebouwen storten in na herhaalde treffers en begraven alles eronder. Pantser wordt niet hersteld tijdens een ronde.',
  },
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
  look: { grade: { saturation: -0.3, contrast: 1.05, tint: '#e8e0d8', tintStrength: 0.1 }, weather: 'dust', amount: 5, vignette: 0.32, road: { curb: 0.22 }, bridge: { kind: 'staal' }, objects: { rocks: 0.35, rockGround: false } }, // bunkers: betonplaten met brokken
  tunnelColor: '#2a2420',
  weather: [
    { label: 'Rook boven de stad', untilRound: 1, effect: { visibility: 12 } },
    { label: 'Dichtere rook', from: { round: 2 }, untilRound: 2, effect: { visibility: 8 } },
    { label: 'Dikke rook en regen', from: { round: 3 }, effect: { visibility: 6, rain: { min: 0.3, max: 0.7, period: 20 } } },
    { label: 'Onweer', from: { round: 3 }, every: 90, duration: 20, effect: { rain: { min: 1, max: 1 }, lightning: { every: 7 } } }, // geen metro (op verzoek)
  ],
};
