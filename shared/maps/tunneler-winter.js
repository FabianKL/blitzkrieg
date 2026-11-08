// Tunneler-modus: winterstijl. Simpel terrein, rotsrand, kogels graven, lichte sneeuwval.

export default {
  name: 'Tunneler (winter)', style: 'winter', header: 'TUNNELER — WINTER', maxPlayers: 2,
  tanks: { A: 't34', B: 'panther' },
  desc: {
    setting: 'Tunneler in de winterstijl. Twee tanks, bevroren grond, een rotsrand — en kogels graven tunnels.',
    terrain: 'Zachte wintergrond met een onregelmatige rotsrand.',
    weather: 'Lichte sneeuwval.',
    special: 'Kogels graven standaard: schiet je een pad door de rots.',
  },
  terrainPercent: { soft: 100 },
  classes: {
    soft: { label: 'Bevroren grond', color: '#8a9a9e' },
  },
  rocks: { label: 'Rotsen', color: '#5a5c5e', edge: true },
  features: [],
  bulletsDig: true,
  tunnelColor: '#1a1410',
  look: { grade: { saturation: -0.2, brightness: 0.95, tint: '#d8e4f0', tintStrength: 0.15 } },
  weather: [
    { label: 'Sneeuwval', effect: { visibility: 10, snow: { min: 0.1, max: 0.3, period: 30 } } },
  ],
};
