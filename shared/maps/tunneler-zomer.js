// Tunneler-modus: zomerstijl. Gemengd bos, open weilanden en rotsbloksprites langs de rand.

export default {
  name: 'Tunneler (zomer)', style: 'zomer', header: 'TUNNELER — ZOMER', maxPlayers: 2,
  tanks: { A: 'sherman', B: 'panther' },
  desc: {
    setting: 'Tunneler in de zomerstijl. Twee tanks, weilanden en gemengde bossen — en kogels graven tunnels.',
    terrain: 'Weilanden en 25% gemengd bos; alleen langs de rand liggen rotsblokken.',
    weather: 'Geen weer.',
    special: 'Kogels graven standaard tunnels door de grond; alleen de rotsrand blokkeert de doorgang.',
  },
  terrainPercent: { normal: 75, vegetation: 25 },
  classes: {
    normal: { label: 'Weilanden', color: '#56702f' },
  },
  vegetation: {
    type: 'pine', label: 'Berken, loof- en dennenbossen', color: '#3f5a2a', groundAfter: 'normal',
    sprites: { berk: 10, loof: 10, den: 5 },
  },
  features: [],
  rockEdge: true,
  bulletsDig: true,
  minimap: false,
  tunnelColor: '#4a3a22',
};
