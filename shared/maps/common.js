// Wat meerdere kaarten delen: de terugkerende storm.

// Terugkerende storm (§7): willekeurig interval 45–120 s, 20 s lang; sporenwisser en onderduiken, zichtstraal 2 T
export const storm = (label, extra = {}) => ({ label, from: { secondsInGame: 0 }, randomEvery: { min: 45, max: 120 }, duration: 20, effect: { visibility: 2, trackEraser: true, burial: true }, ...extra });
