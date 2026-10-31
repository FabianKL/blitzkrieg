# Sprites voor Blitzkrieg

Gemaakt uit `input/`: uitgesneden, op maat gezet (32 px per cel) en per stijl gebundeld.
`manifest.json` bevat alle bestanden met hun maat, de maten van gebouwen, tanks en bruggen,
en welke grondtextuur bij welke terreinklasse hoort (per stijl, met uitzonderingen per map).
De code die dit gebruikt, bouwt Claude Code met `opdracht-claude-code-graphics.md`.
Zolang een bestand ontbreekt, tekent het spel het oude object.

## Mappen

| Map | Inhoud |
| --- | --- |
| `<stijl>/objects/` | losse sprites: bomen, struiken, rotsen, waterplanten, kraters, kratten, parachute, brandstofdepot (`brandstof-vol`, `brandstof-leeg`), munitiedepot (`zomer/objects/munitie-depot`, 320×96 = 10 × 3 cellen) |
| `<stijl>/objects.png` + `.json` | dezelfde sprites als atlas (PixiJS JSON) — gebruik deze in het spel |
| `<stijl>/buildings/` | `<naam>-heel`, `-half`, `-puin`; vult precies het grondvlak |
| `<stijl>/bases/` | `muur` (naadloos, 64 px hoog), `hoek`, `deurpost`, `spul-NN` |
| `<stijl>/bridges/` | `<soort>-begin`, `-midden`, `-eind`, `<soort>-wrak`; hoogte 384 px = brugbreedte |
| `<stijl>/terrain/` | naadloze grondtexturen 512×512 (jpg) |
| `tanks/<naam>/` | `tank.png` (complete tank), `romp.png` (zonder rupsen), beide 448×448, neus naar rechts, draaipunt = midden; `rups.png` (naadloze rupsstrook) en `tank.json` (maten) |
| `effects/` | frames + PixiJS-spritesheet (`animations`) |

Stijlen: `zomer`, `winter`, `woestijn`.

## Grondvlakken van gebouwen (cellen)

`kerk` 8 × 15 · `boerderij` 11 × 10 · `huis-woon` 6 × 6 · `huis-rij` 12 × 5.
Kerk en huizenrij wijken af van de eerste opdracht (10 × 15 en 9 × 5), omdat de getekende
gebouwen smaller en langer zijn. Anders worden ze te veel uitgerekt.

## Tanks

Vijf tanks, op elke map hetzelfde (`docs/SPEC-tanks.md`). Gemaakt met `node tools/maak-tanks.mjs`
uit de vellen in `input/tanks/` (bovenaan de complete tank, daaronder de romp, onderaan de rupsstrook).

| Map | Uit `input/tanks/` | Tank |
| --- | --- | --- |
| `landsverk` | `Landsverk.png` | Landsverk L-60 (Nederland) |
| `t34` | `t34.png` | T-34/76 (Sovjet-Unie) |
| `panther` | `panter.png` | Panther Ausf. G (Duitsland) |
| `sherman` | `sherman.png` | M4A1 Sherman (Verenigde Staten) |
| `comet` | `comet.png` | A34 Comet (Verenigd Koninkrijk) |

De rupsen zijn 7,6 cel lang; de breedte volgt de tekening. `tank.json` geeft per rups de
middenlijn (`y`), breedte en begin/eind (`x0`, `x1`) in cellen vanaf het draaipunt, en de lengte
van één schakel (`linkCells`).

## Omgeschoten begroeiing

Een kapotte versie is er voor loofbomen, winterdennen, winterberken, struiken, cactussen en palmen
(`<soort>-kapot-NN`). Zomerdennen, zomerberken en heggen hebben er bewust geen: die verdwijnen
helemaal en daar ligt dan gewoon terrein.

## Nog niet gemaakt

- Optioneel: ijstextuur.
