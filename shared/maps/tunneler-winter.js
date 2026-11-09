// Tunneler-modus: winterstijl. Dennenbos op sneeuwgrond en rotsbloksprites langs de rand.

export default {
  name: 'Tunneler (winter)', style: 'winter', header: 'TUNNELER — WINTER', maxPlayers: 2,
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Tunneler in de winterstijl. Twee tanks, sneeuwgrond en dennenbossen — en kogels graven tunnels.',
    terrain: 'Sneeuwgrond en 15% dennenbos; alleen langs de rand liggen rotsblokken.',
    weather: 'Lichte sneeuwval.',
    special: 'Kogels graven tunnels door de sneeuw; de rotsrand blokkeert de doorgang.',
  },
  terrainPercent: { soft: 85, vegetation: 15 },
  classes: {
    soft: { label: 'Sneeuwgrond', color: '#8a9a9e' },
  },
  vegetation: {
    type: 'pine', label: 'Dennenbossen', color: '#1f3a2a', groundAfter: 'soft',
    sprites: { den: 15 },
  },
  features: [],
  rockEdge: true,
  bulletsDig: true,
  minimap: false,
  tunnelColor: '#1a1410',
  look: { grade: { saturation: -0.2, brightness: 0.95, tint: '#d8e4f0', tintStrength: 0.15 } },
  weather: [
    { label: 'Sneeuwval', effect: { visibility: 10, snow: { min: 0.1, max: 0.3, period: 30 } } },
  ],
};
