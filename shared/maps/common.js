// Wat meerdere kaarten delen: de terugkerende storm en tanks die op meer kaarten rijden.

// Terugkerende storm (§7): elke 90 s, 20 s lang; sporenwisser en onderduiken, zichtstraal 4 T
export const storm = (label, extra = {}) => ({ label, from: { secondsInGame: 0 }, every: 90, duration: 20, effect: { visibility: 4, trackEraser: true, burial: true }, ...extra });

// Tanks per kaart (§4): alle tanks zijn gelijk, alleen het uiterlijk verschilt. Ploeg A en B
// uit de spec; bij 3 of 4 spelers rijden C en D als variant van A en B (ander nummer, iets
// donkerder). mark: 'star' (witte ster), 'redstar', 'number' (alleen een nummer), 'roundel'.
// winter: witte vlekken; camo: kleur van de camouflagevlekken (voor de getekende tank).
// sprite: tekening in public/assets/tanks/<sprite>/tank.png, paint: andere schildering
// (tank-<paint>.png, bijv. 'winter'); zonder bestand tekent de stijl de tank zelf.
export const T_SHERMAN = { name: 'SHERMAN', hull: '#55602f', mark: 'star', sprite: 'sherman' };
export const T_T34 = { name: 'T-34', hull: '#45573a', mark: 'redstar', sprite: 't34' };
