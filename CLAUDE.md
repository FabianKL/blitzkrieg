# BLITZKRIEG — werkafspraken voor Claude

Tankspel voor 2–4 spelers in het lokale netwerk, gebaseerd op het oude Tunneler, met 10 WO II-maps.
De eigenaar speelt het met vrienden (die niet cheaten). **Lees eerst `README.md`**: spelregels,
maps, starten, testen, bestandsoverzicht en de bewuste afwijkingen van de spec staan daar.

**De oorspronkelijke specificatie staat in `docs/SPEC-blitzkrieg.md`** (hoofdstukken §0–§15; de
code en tests verwijzen ernaar, bv. "§6.2"). Waar het spel ervan afwijkt, gelden in deze volgorde:
1. de keuzes hieronder;
2. de afwijkingen in `README.md`;
3. de spec.

Zo is de metro in Berlijn (§10.10) geschrapt. De open vragen in §15 zijn beantwoord (zie de keuzes):
- tunnels blijven liggen;
- max. 4 spelers, klein = 2;
- alleen de host kiest;
- gehoord blijft 20 T;
- tank C/D zijn varianten van A/B.

## Taal en stijl
- Alles in het **Nederlands**: commentaar, teksten in het spel, testnamen, commitberichten, en je
  antwoorden aan de eigenaar.
- Code zonder build-stap: ES-modules, Node + `ws` op de server, vanille JS en PixiJS in de browser.
  Toegestane pakketten in de browser: `pixi.js` (8), `pixi-filters`, `simplex-noise`; de server geeft
  ze op `/vendor/` (vaste lijst in `server.js`) en de stijlpagina's hebben een import map. Geen andere
  frameworks of pakketten zonder overleg.
- Sluit aan bij de omringende code: korte functies, commentaar dat uitlegt *waarom*.
- **Alle getallen horen in `shared/config.js`**, niet als losse waarden in de code.

## Architectuur in het kort
- **De server is de baas** (`server.js`, 30 ticks/s). De browser rekent dezelfde regels mee
  (`shared/game.js`, `shared/client-sim.js`). Alles in `shared/` draait op server én client en moet
  **deterministisch** zijn: geen `Math.random()`, geen tijd, alleen gegevens die beide kanten hebben.
  Toeval (gevaren, droppings, kaartseed) zit op de server (`hazards.js`) en gaat als gebeurtenis mee.
- **Kaartgrootte is live**: `G.W`/`G.H` zijn `let`-exports die `setMapSize` verandert. De server doet
  `useRoom(room)` voordat hij met een kaart werkt. In de browser zet `loadMap` de maat.
- **Spelpagina = shell + iframe**: `public/index.html` + `shell.js` houden de verbinding en de menu's.
  De stijlpagina (`1944.html` zomer, `1943.html` winter, `1942.html` woestijn) draait in een iframe en
  gebruikt `window.parent.blitz.game`. Let op: **twee documenten, twee klokken**. `performance.now()`
  verschilt tussen shell en iframe. Daarom rekent `world-view.js` met `clockOffset`; zonder die
  omrekening sprong de eigen tank bij elke toetsaanslag.
- **Weergave**: `public/world-view.js` doet alles wat de stijlen gemeen hebben: kaartschilder per
  tegel, zicht en mist, hints, objecten, de minikaart en de legenda. Tekenen gaat met **PixiJS** in
  lagen (`L` in `startWorld`); de gamestate is de enige bron, de weergave leest hem elk frame uit.
  Kaart- en objecttegels, bases en tanks worden met Canvas 2D één keer getekend en als texture
  gebruikt. Een stijl (`1942/1943/1944.js`) levert alleen kleuren per pixel, tanks (zonder schaduw),
  bases, effecten en de tankkaart.
- **Uiterlijk per map**: `LOOK` en `look` per map in `shared/config.js` (kleurfilter, grondtextuur,
  weerdeeltjes, lichtbron, vignet, ijs). Alleen voor de weergave; zie README "Uiterlijk per map".
- **Effecten verraden niets**: mondingsvuur, splinters en kogels van anderen alleen als je ze scherp
  ziet; geluiden lopen via de richtingshints. Effecten mogen `Math.random()` gebruiken (alleen browser).
- **Kaartmaker**: `shared/mapgen.js` plaatst eerst de bases, dan de vaste kenmerken, en vult daarna
  het terrein tot de percentages. Lukt een poging niet, dan probeert hij het opnieuw met een andere
  seed. Bij krappe kaarten worden de regels stap voor stap versoepeld: eerst de vensterregel, dan de
  afstand tot de rivier, dan de uitrijstrook.

## Keuzes van de eigenaar (niet terugdraaien zonder te vragen)
- Tunnels en sporen blijven tussen rondes liggen. De kaart blijft het hele spel dezelfde.
- Kaartgrootte klein = alleen 2 spelers. De host kiest map en grootte, **alleen in de wachtkamer**:
  de dropdowns en START staan dan naast de titel. Gasten zien altijd de titel, de host na de start ook.
- **STOP** (naast volledig scherm): host → iedereen terug naar de wachtkamer (nieuw spel); gast →
  verlaat het spel, de rest speelt door. De link naar `/retro` staat niet meer op de spelpagina.
- Brug bij Market Garden: kans per oversteek 10% + 5% per eerdere oversteek, teller loopt door over
  de rondes (`hazard.chance`/`chanceStep`).
- Kogels **graven standaard niet** (`BULLETS.dig`, per map aan te zetten; retro graaft wel). De krater
  van een ontploffende tank blijft.
- Zicht (`VISION`, regel in `shared/vision.js`):
  - de zichtcirkel is de halve hoogte van het beeld; het weer (in T) maakt hem kleiner, met als
    minimum 2 tankbreedtes;
  - binnen de cirkel zie je rondom; gebouwen, begroeiing, rotsen en rook verbergen overal wat
    erachter ligt;
  - in een kijkboog van 130° in de rijrichting kijk je langs randen (de rand zelf en een tank half
    achter een hoek zie je); naast en achter je niet, en daar zie je het obstakel zelf ook niet;
  - buiten de cirkel zie je alleen in de kijkboog iets: een vage contour zonder kleur (geen schim);
  - de donkere schaduw volgt precies dezelfde regel (`visibleCell`);
  - waar je geen zicht hebt, zie je geen tunnels, sporen, kraters of ijsbarsten: daar ligt de
    schone kaart (`L.clean`, met masker) over de grond;
  - de knop ZICHT AAN/UIT in de bovenste balk (`blitz.visionOverlay`) zet mist, schaduw en
    vervaging uit; de zichtregel blijft gelden;
  - een tegenstander die je scherp ziet, geeft geen hint;
  - gehoord binnen 20 T.
- Tanks zijn per map alleen anders van **uiterlijk**; de eigenschappen zijn overal gelijk.
- Mijnen bij El Alamein zijn onzichtbaar. Gevaren en weer worden alleen in de browser verborgen
  (geen anti-cheat nodig).
- **Geen metrotunnels in Berlijn.** Geen aparte pagina's per map: alles via de spelpagina.
- Een weggeschoten plant ruimt alles binnen 4 cellen op (`FELL.clearRadius`), zodat een tank erdoor past.
- K = zelfvernietiging: dood, telt voor niemand als kill.
- De minikaart staat aan via `DISPLAY.minimap` (per map te overschrijven). Er staat alleen je eigen
  tank, je eigen basis, het terrein en brandstof/munitie op: geen tunnels, sporen, andere bases of
  andere tanks.
- **Zijpaneel is op elke map hetzelfde:** je tankkaart (zonder "jij"), dan de minikaart, dan de
  legenda. Verder niets. Uitzondering: op een liggende telefoon (`pointer: coarse` en hoogte ≤ 500 px)
  wordt het een kleine HUD rechtsboven (tankkaart + minikaart, geen legenda), via `touch.css`.
- **Touchbesturing** (iPad en Android, `public/touch.js`): zwevende joystick op de linkerhelft,
  vuren op de rechterhelft, K = vasthouden. Alleen liggend (staand: "draai je scherm"). Alleen op de
  spelpagina, niet op `/retro`. Touch is een tweede invoerbron in `net.js` (`game.touch`), de server
  merkt er niets van. Getallen in `TOUCH` (config.js).

## Werken en testen
- `npm start` draait op poort 3000; dat gebruikt de eigenaar zelf. Previews in Claude Code draaien op
  **poort 3100** (`.claude/launch.json`, die staat niet in git: zie hieronder). Gebruik nooit poort
  3000 voor je eigen server.
- `npm test` draait alle tests met een eigen testserver (vaste seed, snelle weerklok). Draai je twee
  runs tegelijk, zet dan `TEST_PORT=39xx`. `npm test -- woord` draait alleen tests met dat woord in de naam.
- `npm run test:gen -- <map> <aantal>` is de grote generatietest (duurt lang; draai die op de achtergrond).
- Na een wijziging aan de kaartmaker: draai minstens `npm run test:gen -- "" 10` (alle maps, 10 seeds).
- Verander je iets aan wat de speler ziet, controleer het dan in de browser (preview op 3100).
  Herstart de previewserver na wijzigingen aan `server.js`, `hazards.js` of `shared/`; voor alleen
  `public/` is herladen genoeg.
- `?debug=alles` (alleen localhost) laat alle tanks zien en zet het zicht uit; `?zoom=3` zet de camera
  dichterbij, `?fps=1` toont fps en rekentijd. In een verborgen previewvenster tekent de browser bijna
  niet: meet dan met `blitzView.bench()` in het iframe.
- Omgevingsvariabelen heten nog `TUNNELER_SEED`, `TUNNELER_ROUNDS_TO_WIN` en `TUNNELER_WEATHER_SCALE`.

`.claude/launch.json` (niet in git) voor de preview:
```json
{ "version": "0.0.1", "configurations": [ { "name": "blitzkrieg", "runtimeExecutable": "node",
  "runtimeArgs": ["server.js"], "env": { "PORT": "3100" }, "port": 3100 } ] }
```

## Git
- Repo: https://github.com/FabianKL/blitzkrieg, branch `main`.
- Commit alleen als de eigenaar daarom vraagt. Commitberichten in het Nederlands.
- Houd `README.md` en dit bestand bij als er iets verandert aan spelregels, keuzes of de werkwijze.
