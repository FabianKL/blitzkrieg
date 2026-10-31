# Open punten

Lijst met nog te nemen beslissingen, nieuwe features, nodige aanpassingen en bugs. Haal een punt weg
(of verplaats het naar `README.md`/`CLAUDE.md`) zodra het besloten of gedaan is.

## Beslissingen

### Valse contouren bij El Alamein
De vage contour van een tank buiten je zichtcirkel verdwijnt (keuze bij de nieuwe tanks,
`docs/SPEC-tanks.md`): een tank die je in de kijkboog ziet, wordt gewoon getekend. De valse contouren
van de woestijnhallucinaties (`public/view/hazards-view.js`, "Woestijnhallucinaties") zijn
dan meteen als nep te herkennen, want echte tanks zijn geen contour meer. Mogelijkheden:
- schrappen (ook uit README, de kaarttabel en `tests/acceptance.mjs` punt 13);
- als volledige "luchtspiegeling"-tank tekenen (een nep-tank die er echt uitziet en weer verdwijnt).

### Hints voor tanks buiten de cirkel
Een tegenstander die je scherp ziet, geeft geen richtingshint. Een tank buiten de cirkel in de
kijkboog gaf als contour wel een hint. Als je die tank straks gewoon ziet: dan ook geen hint meer?
(Voorstel: ja.)

## Verbeteren

### Ingesneeuwde / ondergestoven tank
De tank kan ondergesneeuwd of ondergestoven raken op drie maps. Dat zijn alle maps met een
terugkerende storm met `burial: true` (`storm()` in `shared/maps/common.js`):

1. **Ardennen**: sneeuwstorm (stijl winter, `burialColor: '#eef3f8'` = sneeuw).
2. **Leningrad**: sneeuwjacht (stijl winter, zelfde sneeuwkleur; alleen tot ronde 3).
3. **El Alamein**: zandstorm (stijl woestijn, `burialColor: '#d9be8a'` = zand).

De weergave staat in `public/world-view.js` (`drawBuried`, de hoop `drift`; getallen in `BURIAL` in
`shared/config.js`). Wat er precies beter moet, is nog te bepalen. Let op: bij de nieuwe tanks
wordt de tank een container (romp + rupsen). De tint van de ingesneeuwde tank moet dan op de
container komen.

### Sporen en tunnels
De eigenaar is niet tevreden over hoe de sporen en tunnels er nu uitzien. Wat er precies anders
moet, is nog te bepalen. Ze worden getekend door de grondshader (`public/view/ground-gpu.js`) en de
`surface` van de stijl (bijv. de donkere rand langs tunnels in zomer, de sneeuwlip in winter).
Getallen staan in `shared/config.js` (bijv. `track` per terreinklasse).

### Retro-spel verwijderen
Het hele retro-spel moet uit de code. Daar hoort bij:
- de pagina `public/retro.html` met `public/client.js`;
- de kaart `shared/maps/retro.js` en de vermelding in `shared/maps/index.js`;
- de route en uitzonderingen in `server.js`;
- de retro-uitzonderingen in `shared/` (`config.js`, `mapgen.js`, `world.js`, `movement.js`; bijv.
  "retro graaft wel" bij `BULLETS.dig`) en in `public/view/side-panel.js`;
- de tests (`tests/tests.mjs`, `tests/acceptance.mjs`, de retro-vingerafdrukken in
  `tests/fingerprint.json`);
- de vermeldingen in `README.md`, `CLAUDE.md` en `docs/spec-grafische-reparaties.md`.

Controleer daarna met `npm test` en `npm run test:gen -- "" 10` dat de andere kaarten niet veranderen.

## Nieuwe features

### Nieuwe tanks met bewegende rupsbanden
Spec: `docs/SPEC-tanks.md`. Het plan is goedgekeurd, maar er is nog niets gebouwd.

## Bugs

(nog geen)
