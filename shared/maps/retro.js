// Het originele Tunneler (/retro): één terreinklasse, losse rotsen, en kogels graven.

export default {
  name: 'Tunneler',
  desc: {
    setting: 'Het originele Tunneler. Twee tanks, één terrein, losse rotsen — en kogels graven tunnels.',
    terrain: 'Eenvormige ondergrond met verspreide rotsblokken.',
    weather: 'Geen weer.',
    special: 'Kogels graven standaard: schiet je een pad door de rots.',
  },
  classes: { retro: { share: 1 } }, rocks: { count: 70, min: 3, max: 12 }, bulletsDig: true,
};
