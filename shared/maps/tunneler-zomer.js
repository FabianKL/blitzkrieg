// Tunneler-modus: zomerstijl. Simpel terrein, rotsrand, kogels graven.

export default {
  name: 'Tunneler (zomer)', style: 'zomer', header: 'TUNNELER — ZOMER', maxPlayers: 2,
  tanks: { A: 'sherman', B: 'panther' },
  desc: {
    setting: 'Tunneler in de zomerstijl. Twee tanks, weilanden, een rotsrand — en kogels graven tunnels.',
    terrain: 'Weilanden met een onregelmatige rotsrand.',
    weather: 'Geen weer.',
    special: 'Kogels graven standaard: schiet je een pad door de rots.',
  },
  terrainPercent: { normal: 100 },
  classes: {
    normal: { label: 'Weilanden', color: '#56702f' },
  },
  rocks: { label: 'Rotsen', color: '#8c8a80', edge: true },
  features: [],
  bulletsDig: true,
  tunnelColor: '#4a3a22',
};
