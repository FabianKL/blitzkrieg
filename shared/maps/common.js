// Wat meerdere kaarten delen: de terugkerende storm.

// Terugkerende storm (§7): elke 90 s, 20 s lang; sporenwisser en onderduiken, zichtstraal 4 T
export const storm = (label, extra = {}) => ({ label, from: { secondsInGame: 0 }, every: 90, duration: 20, effect: { visibility: 4, trackEraser: true, burial: true }, ...extra });
