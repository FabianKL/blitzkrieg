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
  ze op `/vendor/` (vaste lijst in `server.js`) en `index.html` heeft een import map. Geen andere
  frameworks of pakketten zonder overleg.
- Sluit aan bij de omringende code: korte functies, commentaar dat uitlegt *waarom*.
- **Alle getallen horen in `shared/config.js`**, niet als losse waarden in de code. Getallen die bij
  één kaart horen (gevaar, schaars middel, meter, weer) staan in het bestand van die kaart in
  `shared/maps/`.

## Architectuur in het kort
- **De server is de baas** (`server.js`, 30 ticks/s). De browser rekent dezelfde regels mee
  (`shared/game.js` geeft door uit `world.js`, `terrain.js`, `movement.js`, `codec.js`, `mapgen.js`;
  `shared/client-sim.js` verwerkt de berichten). Alles in `shared/` draait op server én client en moet
  **deterministisch** zijn: geen `Math.random()`, geen tijd, alleen gegevens die beide kanten hebben.
  Toeval (gevaren, droppings, kaartseed) zit op de server (`hazards.js`) en gaat als gebeurtenis mee.
- **Kaartgrootte is live**: `G.W`/`G.H` zijn `let`-exports die `setMapSize` verandert. De server doet
  `useRoom(room)` voordat hij met een kaart werkt. In de browser zet `loadMap` de maat.
- **Eén spelpagina**: `public/index.html` + `shell.js` houden de verbinding, de menu's, het speelveld
  en het zijpaneel. De stijl van de kaart (`style` in het kaartbestand: zomer, winter, woestijn) is
  een tekenmodule `public/styles/<stijl>.js` met een thema `<stijl>.css` (op `body[data-style]`).
  Bij een kaart met een andere stijl ruimt `shell.js` de weergave op (`view.destroy()`: beeldlus,
  renderer, WebGL-context) en start hij de nieuwe op een nieuw canvas. Geen iframe meer.
- **Weergave**: `public/world-view.js` doet alles wat de stijlen gemeen hebben: zicht en mist,
  hints en tanks. De grond tekent `public/view/ground-gpu.js` op de videokaart (één mesh met een eigen
  shader en texturen van 1 pixel per cel), bomen en rotsen `public/view/objects-view.js` (sprites uit
  de atlas van de stijl), bruggen `public/view/bridges-view.js`; het zijpaneel (minikaart, legenda, tankkaart) staat
  in `public/view/side-panel.js`, gevaren en laadplekken in beeld in `public/view/hazards-view.js`. Tekenen gaat met **PixiJS** in
  lagen (`L` in `startWorld`); de gamestate is de enige bron, de weergave leest hem elk frame uit.
  Bases en tanks (en de getekende objecten als er geen atlas is) worden met Canvas 2D één keer
  getekend en als texture gebruikt. Een stijl levert alleen `surface` (details van de grond), tanks
  (zonder schaduw), bases, effecten en
  een korte tekst in het speelveld (`label`); de tankkaart zit in `world-view.js`.
- **Uiterlijk per map**: `LOOK` in `shared/config.js` en `look` in het kaartbestand (kleurfilter, grondtextuur,
  weerdeeltjes, lichtbron, vignet, ijs). Alleen voor de weergave; zie README "Uiterlijk per map".
- **Assets**: sprites en texturen staan in `public/assets/` (`manifest.json` is de bron, `LEESMIJ.md`
  zegt wat er is). `public/assets.js` laadt alleen wat in het manifest staat; ontbreekt iets, dan
  tekent de weergave het procedureel of zoals vroeger. De opdracht voor de graphics staat in
  `docs/opdracht-claude-code-graphics.md` (fases 0–8).
- **Effecten verraden niets**: mondingsvuur, splinters, flipbook-effecten, lichtvlekjes en kogels van
  anderen alleen als je ze scherp ziet; waterplanten die op een tunnel verdwijnen alleen waar je zicht hebt; geluiden lopen via de richtingshints. Effecten mogen `Math.random()` gebruiken (alleen browser).
- **Wegen**: de kaartmaker geeft de middellijnen mee (`roads`, alleen weergave; de cellen blijven de
  echte weg) en de server stuurt ze in het instapbericht (`rd`). `public/view/roads.js` maakt er een
  veld van voor de grondshader. Bruggen idem (`bridges` met middellijn, breedte en cellen; `br` in
  het instapbericht): `public/view/bridges-view.js` legt er sprites op, het water loopt eronder door.
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
- **Geen loopgraven bij Koersk** (en geen zigzag-optie in de kaartmaker): één zandweg met de brug.
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
- `npm test` draait alle tests met een eigen testserver (vaste seed, snelle weerklok); tests zonder
  server (`run()` zonder poort) lopen tegelijk in worker-threads. Draai je twee
  runs tegelijk, zet dan `TEST_PORT=39xx`. `npm test -- woord` draait alleen tests met dat woord in de naam.
- `npm run test:gen -- <map> <aantal>` is de grote generatietest (duurt lang; draai die op de achtergrond).
- Na een wijziging aan de kaartmaker: draai minstens `npm run test:gen -- "" 10` (alle maps, 10 seeds).
  De test "kaart-vingerafdruk" bewaakt dat dezelfde seed dezelfde kaart geeft; verander je de kaarten
  bewust, werk dan de verwachting bij met `node tests/fingerprint.mjs --write`.
- Verander je iets aan wat de speler ziet, controleer het dan in de browser (preview op 3100).
  Herstart de previewserver na wijzigingen aan `server.js`, `hazards.js` of `shared/`; voor alleen
  `public/` is herladen genoeg.
- `?debug=alles` (alleen localhost) laat alle tanks zien en zet het zicht uit; `?zoom=3` zet de camera
  dichterbij, `?fps=1` toont fps en rekentijd. In een verborgen previewvenster tekent de browser bijna
  niet: meet dan met `blitzView.bench()` in de console.
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
