# Specificatie: nieuwe tanks met bewegende rupsbanden

Lees eerst `CLAUDE.md`. Alle werkafspraken gelden (Nederlands, getallen in `shared/config.js`,
`shared/` deterministisch, preview op poort 3100, nooit 3000). Deze specificatie **vervangt fase 6
(Tanks)** in `docs/opdracht-claude-code-graphics.md`.

## Doel
Het spel krijgt vijf tanks, één per land, elk opgebouwd uit een romp en twee rupsbanden die
meebewegen met het rijden. Alle oude tanksprites verdwijnen. Er is geen verschil tussen zomer,
winter en woestijn: elke tank ziet er op elke map hetzelfde uit.

| Map | Tank | Land |
| --- | --- | --- |
| `landsverk` | Landsverk L-60 | Nederland |
| `t34` | T-34/76 | Sovjet-Unie |
| `panther` | Panther Ausf. G (Panzer V) | Duitsland |
| `sherman` | M4A1 Sherman | Verenigde Staten |
| `comet` | A34 Comet | Verenigd Koninkrijk |

De eigenschappen van tanks blijven overal gelijk (keuze van de eigenaar): dit is alleen uiterlijk.

## 1. Oude tanksprites verwijderen
- Verwijder in `public/assets/tanks/` de mappen `panzer2`, `panzer3`, `panzer4`, `tiger`,
  `crusader`, `cromwell` en `koenigstiger`.
- Verwijder in `t34`, `sherman`, `panther` en `landsverk` alle varianten: `tank-winter.png`,
  `tank-camo.png`, `tank-woestijn.png`. Wat overblijft, is de nieuwe set (zie 2).
- Haal ze uit `public/assets/manifest.json` en `public/assets/LEESMIJ.md`.
- Verwijder in `config.js` en de stijlen alles wat alleen voor de oude tanks bestond: `winter: true`
  op tanks, `camo`-varianten per map, `T_SHERMAN`/`T_T34`-varianten met andere verf, en de
  tanknamen PANZER II/III/IV, TIGER, KÖNIGSTIGER, CRUSADER, CROMWELL.
- De getekende `drawTank` per stijl blijft alleen als terugval wanneer een sprite ontbreekt.

## 2. Bestanden per tank
Per tank in `public/assets/tanks/<naam>/` (Claude levert deze aan uit `input/tanks/`):

| Bestand | Inhoud |
| --- | --- |
| `tank.png` | complete tank met rupsen, 448×448 — voor de tankkaart, de schaduw, de vage contour en als terugval |
| `romp.png` | romp, toren en loop zonder rupsen, 448×448, exact dezelfde plek en maat als `tank.png` |
| `rups.png` | naadloze rupsstrook, liggend, herhaalt van links naar rechts |
| `tank.json` | maten, zie hieronder |

Alle plaatjes: 32 px per cel, neus naar rechts, draaipunt = midden van het canvas = midden van de
romp, romp + rupsen 7,6 cel lang.

`tank.json` (waarden in cellen, ten opzichte van het draaipunt; Claude meet ze bij het aanleveren):
```json
{
  "name": "T-34", "nation": "SU",
  "tracks": [
    { "y": -1.9, "width": 1.2, "x0": -3.8, "x1": 3.8 },
    { "y":  1.9, "width": 1.2, "x0": -3.8, "x1": 3.8 }
  ],
  "linkCells": 0.55
}
```
- `tracks`: middenlijn (`y`), breedte en begin/eind van elke rups;
- `linkCells`: lengte van één schakel, voor de snelheid waarmee de strook schuift.

## 3. Tekenen
- Per tank één container die meedraait, van onder naar boven: twee `TilingSprite`-rupsen
  (`rups.png`, geplaatst en geschaald volgens `tank.json`), daarboven `romp.png`. De spatborden en
  schorten van de romp vallen zo vanzelf over de rupsen.
- Schaduw en vage contour (zicht buiten de cirkel) gebruiken `tank.png`, zoals nu.
- Ploeg C en D: donkerdere tint van A en B, zoals nu (op romp en rupsen).
- Emblemen en nummers (`mark`, `number`) blijven door de code getekend, als aparte sprite boven de
  romp die meedraait. Positie per tank in `config.js`.
- Texturen met mipmaps of vooraf verkleind, zodat een draaiende tank niet flikkert.
- Laden vóór de eerste ronde, zoals de andere sprites.

## 4. Bewegende rupsen
- Per tank per frame: de afgelegde afstand in de rijrichting = verplaatsing van de getekende positie
  (`rx`, `ry`) geprojecteerd op de huidige hoek. Beide rupsen schuiven die afstand op
  (`tilePosition.x`), omgerekend via `linkCells`. Vooruit en achteruit schuiven tegengesteld.
- Draaien zonder te rijden (`smoothTankAngles`): de rupsen schuiven tegen elkaar in, links vooruit
  en rechts achteruit of andersom, evenredig met de draaihoek × halve tankbreedte.
- Stilstaan: de rupsen staan stil. Dood of in de basis: geen beweging.
- Dit geldt voor alle tanks die je scherp ziet (ook tegenstanders). Het is alleen weergave en
  verraadt niets wat je niet al ziet. Geen `Math.random()`, geen invloed op `shared/`.
- Rijdt de tank door ongegraven grond (graven), dan schuiven de rupsen even snel als hij rijdt; geen
  extra effect nodig.

## 5. Tanks per map (in `config.js`; graag even laten controleren door de eigenaar)
| Map | A (bondgenoot) | B (Duitsland) |
| --- | --- | --- |
| Grebbeberg | Landsverk | Panther |
| Russische vlakte | T-34 | Panther |
| El Alamein | Comet | Panther |
| Leningrad | T-34 | Panther |
| Koersk | T-34 | Panther |
| Carentan | Sherman | Panther |
| Arnhem | Comet | Panther |
| Ardennen | Sherman | Panther |
| Oder-front | T-34 | Panther |
| Berlijn | T-34 | Panther |

Leg per map alleen de tank vast (`tanks: { A: 'comet', B: 'panther' }`); naam, land, emblem en
minikaartkleur komen uit één lijst met de vijf tanks in `config.js`. Emblemen: Landsverk oranje
driehoek, T-34 rode ster, Panther nummer, Sherman witte ster, Comet roundel.

## 6. Tankkaart (zijpaneel)
De tankkaart toont `tank.png` in plaats van de getekende tank, met de naam en het land van de
nieuwe tank. Verder verandert er niets aan het zijpaneel.

## Werkwijze en testen
- Begin met analyse en een plan, wacht op akkoord van de eigenaar.
- Ontbreken de nieuwe bestanden van een tank nog, gebruik dan `tank.png` zonder bewegende rupsen,
  en anders de getekende `drawTank`.
- `npm test` moet groen blijven. Controleer in de browser (preview 3100, `?zoom=3`): rijden vooruit,
  achteruit, draaien op de plaats, vier spelers (tint C/D), schaduw, contour buiten de cirkel.
  Meet met `blitzView.bench()` vóór en na.
- Werk `README.md`, `CLAUDE.md`, `LEESMIJ.md` en `manifest.json` bij. Commit alleen als de
  eigenaar daarom vraagt.
