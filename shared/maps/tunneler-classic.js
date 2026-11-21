// Tunneler-modus: classic. Gouden en rood woestijnzand, grijze rotsen, geen begroeiing, geen weer.

export default {
  name: 'Tunneler (classic)', style: 'tunneler', header: 'TUNNELER — CLASSIC', maxPlayers: 2,
  tanks: { A: 'viper', B: 'kobalt' },
  desc: {
    setting: 'Het klassieke Tunneler. Twee tanks, woestijnzand en grijze rotsen.',
    terrain: 'Gouden zandrimpels en rood woestijnzand; de grijze rotsrand blokkeert.',
    weather: 'Geen weer.',
    special: 'Kogels graven tunnels door het zand; de rotsrand blokkeert.',
  },
  terrainPercent: { normal: 100 },
  classes: {
    normal: { label: 'Woestijnzand', color: '#b06828' },
  },
  features: [],
  rockEdge: true,
  bulletsDig: true,
  minimap: false,
  tunnelColor: '#6e5430',
};
