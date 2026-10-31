# Opdracht: graphics van Blitzkrieg naar een hoger niveau

Lees eerst `CLAUDE.md`, `README.md` en de relevante delen van `docs/SPEC-blitzkrieg.md`. Alle
werkafspraken daaruit gelden (Nederlands, geen nieuwe pakketten, getallen in `shared/config.js`,
`shared/` deterministisch, preview op poort 3100, nooit poort 3000).

## Doel
Het spel draait al op PixiJS 8 met lagen, tegelsprites en `LOOK` per map. Wat nu niet mooi is:
- Grond, water en ijs worden per pixel op de CPU geschilderd met `R = 6` pixels per cel en
  daarna 2,5× of meer opgerekt (wazig, korrelig; water ziet eruit als ruis).
- Bomen, rotsen en gebouwen staan in dezelfde opgerekte tegels.
- Wegen zijn alleen een terreinkleur; bruggen hebben geen eigen uiterlijk (behalve het wrak).
- Tanks en bases zijn in code getekend; er is geen manier om getekende sprites te gebruiken.

Doel: **scherp op elke zoomstand, mooier, en minstens zo snel als nu**. Gameplay, spelregels,
netwerk en zichtregel veranderen niet. Twijfel je of iets gameplay raakt: vraag het.

## De sprites staan al klaar
In `public/assets/` staan de sprites al, met `manifest.json` (alle bestanden met maat, de
grondvlakken, tankmaten, brugschaal en welke grondtextuur bij welke klasse hoort per stijl en per
map) en `LEESMIJ.md` (wat er is en wat nog ontbreekt). Gebruik het manifest als bron; wat ontbreekt
valt terug op de huidige tekening. Let op: de code is sinds deze opdracht geschreven is verplaatst
(`public/styles/`, `public/view/`, `shared/maps/`); zoek de genoemde functies op hun naam.

## Werkwijze
- **Begin met analyse en een plan; wacht op mijn akkoord** voordat je code verandert.
- Werk in fases (hieronder). Na elke fase is het spel speelbaar, draait `npm test` groen en
  controleer je het in de browser (preview 3100, `?zoom=3`, `?fps=1`). Meet met
  `blitzView.bench()` vóór en na elke fase en zet de cijfers in je samenvatting.
- Maak na elke fase een commit (Nederlands bericht). Ik geef hiermee toestemming om per fase te
  committen; niet pushen.
- Houd de oude weergave beschikbaar achter `?oud=1` tot ik fase 1–4 heb goedgekeurd, zodat ik kan
  vergelijken. Daarna mag de oude CPU-schilder weg (behalve wat minikaart en legenda nog nodig hebben).
- Werk eerst alles uit op **Leningrad** (winter); daarna de andere stijlen.
- Werk `README.md` en `CLAUDE.md` bij (architectuur, "Uiterlijk per map", assets).

## Fase 0 — Loopgraven verwijderen (gameplay, eerst je voorstel aan mij)
Ik wil de loopgraven uit het spel. Ze bestaan alleen op Koersk: drie wegen met `zigzag: 1.5`
(`shared/config.js`, de label van verhard is daar 'Loopgraven').
- Haal de drie zigzagwegen bij Koersk weg en verwijder de `zigzag`-optie helemaal uit de
  kaartmaker (`shared/mapgen.js`: `zigzag()`, de extra marge in `routePath`, de uitzondering bij
  het aanvullen van verharding) en uit `shared/game.js` (de zaagtand in de oude generator), plus
  de uitleg in `config.js`, tests en README.
- **Let op:** de eerste loopgraaf is nu de enige weg over de Psel, en de rivier heeft
  `bridges: 'atRoads'`. Zonder die weg verdwijnt de brug. Stel voor hoe je de oversteek houdt,
  bijvoorbeeld: één gewone zandweg (geen zigzag) langs dezelfde route met de brug erin, of
  doorwaadbare plekken. Verhard op Koersk heet dan 'Zandweg'. Klopt het percentage verhard
  (`terrainPercent.paved: 6`) daarna nog niet, stel dan een nieuwe waarde voor.
- Na de wijziging: `npm test` en `npm run test:gen -- koersk 10`.
- Doe dit vóór fase 3, zodat de wegen-shader geen loopgraafsoort nodig heeft.

## Fase 1 — Terreinkaart + grondshader
- Maak per kaart een **terreinkaart-texture van 1 pixel per cel** (RGBA): celtype, terreinklasse,
  tunnel/spoor-sterkte, kras (`scar`: puin, kraters, ijsbarst). Bij graven, vervagen en schade
  werk je alleen de veranderde cellen bij (geen hele tegels meer uploaden).
- Schrijf een **eigen Pixi-shader** (Mesh of Filter op een quad die de wereld bedekt) die per
  schermpixel:
  - per terreinklasse een naadloze textuur uit een **terreinatlas** kiest, in wereldcoördinaten;
  - zachte overgangen maakt tussen klassen en rond rots/water/begroeiing (zoals `blurField` en
    `LOOK.blend` nu doen; bilinear sample van een afstands- of mengveld);
  - tunnels, sporen (sterkte), kraters en puin tekent;
  - de `LOOK`-instellingen gebruikt (noise, kleurfilter blijft in de nabewerking).
- **Aanpak per klasse** (de bestandsnamen in `terrain/` volgen het promptdocument; leg per map
  in `config.js` vast welke textuur bij welke klasse hoort, met de huidige klassekleur als tint):
  - verhard, hard, normaal, zacht: naadloze textuur + procedurele ruis tegen herhaling;
  - moeras: textuur + glinstering en rimpels in de shader;
  - doorwaadbaar: ondiepe variant van de watershader (lichter, stenen onder het oppervlak), geen textuur;
  - ijs: procedureel in de shader (barsten uit de spelgegevens), optioneel een korreltextuur;
  - verbrand: textuur + overgang in de shader die vanuit het vuur uitbreidt;
  - rots: `rots.png` als ondergrond in de rotscellen, met de rotsblok-sprites (fase 5) erop;
  - water: volledig procedureel (fase 2), geen textuur.
- **Terreinatlas**: als er bestanden staan in `public/assets/<stijl>/terrain/<naam>.jpg`
  (512×512, naadloos), gebruik die. Anders genereer je bij het laden een procedurele vervanger met
  `simplex-noise` op een canvas, zodat alles werkt zonder bestanden.
- **De schone kaart en het zicht moeten blijven werken**: waar je geen zicht hebt, zie je geen
  tunnels, sporen, kraters of barsten (nu `L.clean` met masker). Bouw dit in de shader in (twee
  toestanden + het bestaande zichtmasker), of houd een tweede pass; kies wat het snelst is.
- De minikaart en legenda gebruiken nu de tegelcanvassen (`drawRegion`). Zorg dat die blijven
  werken (bijv. een kleine CPU-versie van 1 px per cel alleen voor de minikaart).

## Fase 2 — Water en ijs
- Water in dezelfde shader: donkere diepte naar het midden, lichtere oever, langzaam bewegende
  golfjes via een getekende of procedurele normal map, subtiele glinstering (`LOOK.iceShine`).
- Ijs: helder blauwwit met diepte, barsten uit de bestaande ijsbarst-gegevens; bij bijna breken
  meer en grotere barsten. Wakken (`paintWak`) als donker water met schotsranden.
- Getallen (golfsnelheid, kleuren, glinstering) per map in `LOOK`.

## Fase 3 — Wegen (afstandsveld, geen sprites per kruising)
- Laat `shared/mapgen.js` de **middellijnen van de wegen** meegeven in de kaartgegevens, zoals de
  rivieren (`roads: [{ path, width, class }]`). Deterministisch; de cellen veranderen niet.
- In de browser: maak de lijnen glad (Chaikin, 2–3 rondes; alleen voor de weergave) en reken bij
  `loadMap` per cel uit: `d1` = afstand tot dichtstbijzijnde weg, `d2` = afstand tot de op één na
  dichtstbijzijnde weg, en de lengtecoördinaat langs de dichtstbijzijnde weg. Sla op in één
  RGBA-texture van 1 px per cel (bilinear filtering).
- In de grondshader:
  - rijbaan, stoeprand/berm en modderrand als functie van `d1`; afgeronde binnenhoeken met een
    smooth min van `d1` en `d2`;
  - oppervlak zonder richting (asfalt, grind, zand) in wereldcoördinaten;
  - onderdelen met richting (kasseirijen, middenstreep) via de lengtecoördinaat, en die vervagen
    waar `d2` klein is (kruispunt, T-splitsing), zodat er geen naden ontstaan;
  - rijsporen als twee lijnen op vaste afstand van het midden (alleen `d1`);
  - het rechte stadsrooster (Berlijn) volledig in wereldcoördinaten.
- Wegsoorten: kasseien (dorp), asfalt (stad), zandweg (dijkweg, woestijn, Koersk). Geen loopgraven (zie fase 0).
  Instellingen per map in `LOOK.road` (breedte berm/stoeprand, sterkte sporen, soort).

## Fase 4 — Bruggen
- Elke brug (`bridges` uit de kaartmaker) wordt een eigen sprite in `L.objects`, onder de tanks,
  gedraaid in de richting van de weg erover (uit de middellijn, niet uit het vakje).
- Opbouw uit drie delen (begin, herhaalbaar middenstuk, eind) of `NineSliceSprite`, zodat elke
  lengte past. Schaduw op het water via het bestaande lichtsysteem; water loopt onder de brug door.
- Staten heel → beschadigd → opgeblazen. De opgeblazen versie vervangt `drawBridgeWreck`; gebruik
  de gebeurtenis `e.t === 'bridge'` voor stof, splinters en een plons. Bij Market Garden mag
  schade zichtbaar oplopen per oversteek, zolang het niets verraadt wat de speler niet al weet.
- Zonder bestanden in `public/assets/<stijl>/bridges/` teken je een procedurele vervanger.
- Een brug blijft geen obstakel voor het zicht.

## Fase 5 — Sprites voor bomen, rotsen en begroeiing
- Laad per stijl (`zomer`, `winter`, `woestijn`) een atlas `public/assets/<stijl>/objects.json` +
  `objects.png` (Free Texture Packer, formaat Pixi.js). Sprites zijn getekend op **32 px per cel**.
  Namen (het aantal varianten per soort is vrij: neem alles wat in de atlas staat):
  `den-NN`, `berk-NN`, `loof-NN`, `heg-NN`, `struik-NN`, `cactus-NN`, `palm-NN`,
  `rots-NN`, `krater-NN` en `<soort>-kapot-NN`. Canvasmaten: bomen en palmen 192×192,
  struik/heg/cactus 128×128, rots 160×160, draaipunt in het midden.
- Welke soorten een map gebruikt, staat in `config.js` (bijv. `vegetation.sprites: ['struik', 'cactus']`
  met een verhouding). Cactus is gewoon begroeiing, net als een struik.
- **Palmen bij El Alamein, dicht bij de kust:** begroeiing binnen een strook langs de zee
  (breedte in `config.js`, bijv. `vegetation.palmCoast: 12` cellen vanaf het water) krijgt een
  `palm`-sprite, verder landinwaarts `struik` of `cactus`. Dat is alleen een keuze van het plaatje
  (vast toeval, deterministisch uit de kaart), geen nieuwe regel: een palm gedraagt zich als de
  struik die er nu staat. Een omgeschoten palm toont `palm-kapot-NN`.
  Staan er daardoor (bijna) geen palmen, omdat de kaartmaker weinig begroeiing aan de kust zet?
  Stel dan voor hoe de kaartmaker meer begroeiing in die strook kan zetten (dat verandert de kaart,
  dus eerst mijn akkoord).
- Kraters (`krater-NN`): leg ze als sprite op de plek van een blijvende krater (onder de tanks,
  alleen zichtbaar waar je zicht hebt, net als de huidige kraters).
- Plaats ze met het bestaande rooster en vaste toeval uit `drawObjects` (variant, draaiing,
  schaal), maar als losse sprites in plaats van in de tegelcanvassen. Gebruik een snelle opzet
  (bijv. `ParticleContainer` of containers per tegel met culling), getest met duizenden bomen.
- Schaduwen via het bestaande systeem (zelfde texture, `look.light`), niet in de tekening.
- **Omgeschoten begroeiing** (kies op stijl en soort; staat ook in `manifest.json` onder `felled`):
  - met kapotte variant: loofboom (`loof-kapot`), winterden (`winter/den-kapot`), winterberk
    (`winter/berk-kapot`), struik, cactus en palm. Toon een willekeurige `-kapot-NN` (vast toeval),
    met splinters; `SCAR_TREETOPS` toont ook de kapotte variant;
  - **zonder kapotte variant: zomerden, zomerberk en heg.** Die verdwijnen helemaal: geen sprite,
    geen stronk, geen splinters of puinpatroon op de grond. Op die plek tekent de weergave gewoon
    terrein: de grondtextuur van de klasse die er na het omschieten ligt (`groundAfter`), zonder
    tunnelrand. Dit is alleen weergave: wat het spel met de cel doet (doorgang voor een tank,
    `FELL.clearRadius`) verandert niet. Denk je dat dit wel een spelregel raakt, vraag het mij.
  - Een korte stofwolk met wat blaadjes bij het omvallen mag bij alle soorten.
- Optioneel: licht wiegen in de wind (shader of kleine rotatie), alleen als het niets kost.
- **Ontbreekt een atlas of een naam, val dan terug op de huidige getekende objecten.** Zo kan ik
  sprites per soort vervangen.

## Fase 6 — Tanks
- Per tanktype een map `public/assets/tanks/<naam>/` met `tank.png` en optioneel varianten
  (`tank-winter.png`, `tank-camo.png`, `tank-woestijn.png`). Namen: `landsverk`, `panzer2`,
  `t34`, `panzer3`, `crusader`, `panzer4`, `tiger`, `sherman`, `cromwell`, `koenigstiger`,
  `panther`. Voeg in `config.js` per map een veld toe dat zegt welke sprite en variant (bijv.
  `sprite: 't34', variant: 'winter'`), naast de bestaande `hull`/`camo`/`winter`.
- Canvas 448×448, 32 px per cel, neus naar rechts, draaipunt = midden van het canvas = midden van
  de romp (zie `sjabloon-tank.png`).
- Emblemen en nummers (`mark`, `number`) blijven door de code getekend, als aparte sprite die
  meedraait, op een positie per tanktype (in config). Ploeg C/D: donkerdere tint, zoals nu.
- Optioneel bewegende rupsen: als er `tank-romp.png` en een gedeelde `tanks/rups.png`
  (256×48, naadloos) zijn, teken dan twee `TilingSprite`-rupsen waarvan de textuur meeschuift met
  de rijsnelheid, met de romp erboven.
- Gebruik mipmaps of een vooraf verkleinde versie, zodat een draaiende tank niet flikkert.
- Zonder bestand: terugvallen op de huidige `drawTank`.

## Fase 7 — De basis als bouwpakket
- Per stijl in `public/assets/<stijl>/bases/`: `muur.png` (256×64, links-rechts naadloos),
  `hoek.png` (96×96), `deurpost.png` (96×96) en `spul-01..06.png` (96×96).
- Bouw de muur op de echte cellen van de basis op (`BASE_W`, `BASE_H`, `DOOR_HALF` uit
  `shared/game.js`): muurstukken herhaald langs de muurcellen, hoekpalen op de hoeken, deurposten
  naast beide deuren, spullen binnen langs de muur met vast toeval. Zie `sjabloon-basis.png`.
- Vloer blijft procedureel. Ploegkleur van de basis zoals nu.
- Zonder bestanden: terugvallen op de huidige `drawBase`.

## Fase 7a — Gebouwen en dorpen in drie stadia
- Sprites per stijl in `public/assets/<stijl>/buildings/` (zomer en winter; de woestijn heeft geen
  dorpen). Per gebouw drie losse stadia: `<naam>-heel`, `<naam>-half`, `<naam>-puin`, op 32 px per
  cel, die precies het grondvlak vullen. Deze gebouwen zijn er, elk in een zomer- en een
  winterversie:
  | naam | grondvlak (cellen) | waar |
  | --- | --- | --- |
  | `kerk` | 8 × 15 | landmark van het dorp (de winterkerk is een ander ontwerp, zelfde grondvlak) |
  | `boerderij` | 11 × 10 | rij boerderijen (`layout: 'row'`) en losse gebouwen buiten dorpen |
  | `huis-woon` | 6 × 6 | huizen in dorpen |
  | `huis-rij` | 12 × 5 | huizen in dorpen (ook gedraaid als 5 × 12) |
- Er is **geen molen en geen schuur**: voeg geen nieuwe landmark toe; `landmark` blijft `'kerk'`.
- Stadium uit `world.vegHp` van dat gebouw (de browser heeft die al): 4–3 = heel, 2–1 = half,
  0 = puin. Bij overgang naar een nieuw stadium: stofwolk, stenen en splinters (alleen als het in
  je zicht ligt). Het puin vervangt het huidige puinpatroon (`SCAR_RUBBLE`) op die cellen; het blijft
  berijdbaar zoals nu.
- Kies de stijlmap op de stijl van de map (`style: 'zomer'` of `'winter'`).
- **Kaartmaker (verandert de kaart, dus graag eerst je voorstel aan mij):** de huizen in dorpen
  krijgen nu een willekeurige maat van T tot 2T. Laat de kaartmaker in plaats daarvan kiezen uit
  `huis-woon` (6 × 6) en `huis-rij` (12 × 5 of 5 × 12), zodat elk huis precies op een sprite past;
  stel een verhouding voor (bijv. 60% woonhuis, 40% rij). De kerk wordt 8 × 15 (nu 2T × 3T = 10 × 15). De rij
  boerderijen gebruikt `boerderij` (nu 2,2T × 2T = 11 × 10, dat klopt al). Alle maten in
  `config.js`. Draai daarna `npm run test:gen -- "" 10`.
- Gedraaide gebouwen: draai de sprite mee (het licht van linksboven draait dan mee; acceptabel).
- Losse gebouwen buiten dorpen (`addBuildings`) en het stadsrooster van Berlijn: gebruik de
  huizen-sprites alleen als het grondvlak past, anders blijft de huidige tekening.
- Zonder bestanden: terugvallen op de huidige tekening.

## Fase 7b — Brandstof en munitie op de kaart
- Vervang de getekende depots en kratten (`drawDepots`, `drawObjectsOfHazards`) door sprites:
  - brandstofdepot: per stijl `<stijl>/objects/brandstof-vol` en `brandstof-leeg` (192×192),
    er is een winter- en een zomerversie. Kies de sprite op de stijl van de map, zodat elke map
    met `scarce: { type: 'fuelDepots' }` het juiste depot krijgt;
  - munitiedepot (Grebbeberg): `zomer/objects/munitie-depot` (320×96 = 10 × 3 cellen, liggend),
    gecentreerd op `game.ammoDepot`; het raakt niet leeg, dus één versie;
  - droppings (Market Garden): `zomer/objects/krat-brandstof`, `krat-munitie`, `krat-leeg`
    (128×128) en `parachute` (192×192), die naast een volle krat ligt en verdwijnt als hij leeg is.
- De B/M-badge met pulserende ring (`drawRefillMarkers`) blijft zoals hij is.
- Bij leeg worden: korte stofwolk. Bij een nieuwe dropping: de parachute zakt in een halve seconde
  neer (schalen + alpha), alleen als de plek in je zicht ligt.
- Zonder bestanden: terugvallen op de huidige tekening.

## Waterplanten op zomer- en wintermaps (alleen decoratie)
- Alleen op zomer- en wintermaps, **niet in de woestijn**. Geen oase: El Alamein blijft `noPonds: true`.
- Sprites (96×96), per soort een plek:
  - zomer: `waterlelie-NN` op water (`WATER`), dicht bij de oever; `oeverplant-NN` op grond (`DIRT`)
    direct langs het water;
  - winter: `ijsblad-NN` op ijs en bevroren water (ijsklasse); `oeverriet-NN` op grond langs het
    water of ijs.
- Puur weergave: geen celtype, geen obstakel, blokkeert geen zicht, verandert niets aan de kaart.
  Plaats ze in de browser met vast toeval (`hash`) in een smalle strook langs de oever. Dichtheid en
  breedte per map in `config.js` (bijv. `look.waterPlants`, 0 = uit).
- Oeverplanten in de grondlaag (onder sporen en tanks); waar een tunnel of krater ligt, verdwijnen
  ze. Waterlelies en ijsbladeren boven de water/ijs-shader, onder kogels en tanks; breekt het ijs
  (wak), dan verdwijnen de ijsbladeren daar. Op de schone kaart (geen zicht) staan ze er gewoon.

## Fase 8 — Effecten en nabewerking
- Ondersteun **flipbook-effecten** (spritesheets met frames) naast de bestaande deeltjes:
  explosie, rookwolk, mondingsvuur, opspattende sneeuw/zand. Bestanden in
  `public/assets/effects/`; zonder bestand de huidige deeltjes.
- Klein additief lichtvlekje op de grond bij schoten en explosies (alleen als het effect zichtbaar
  mag zijn volgens de regel "effecten verraden niets").
- Voeg kleurfilter, vignet en korrel samen in **één eigen filter** in plaats van meerdere
  `world.filters` na elkaar. Reken mist/vervaging op halve resolutie als dat niet zichtbaar
  slechter is.

## Asset-loader (geldt voor fase 4–8)
- Eén module (bijv. `public/assets.js`) die per stijl laadt wat er is, ontbrekende bestanden
  stilletjes overslaat (geen fout in de console behalve één regel per ontbrekende map) en per
  onderdeel zegt of er een sprite is of dat de oude tekening gebruikt wordt.
- De server levert `public/assets/` al (staat onder `public`); controleer dat `.png`, `.webp` en
  `.json` het goede content-type krijgen.
- Laden gebeurt vóór de eerste ronde begint; geen haperingen tijdens het spelen.

## Eindsamenvatting
Geef per fase: wat er veranderd is, de meetcijfers (fps, rekentijd per frame, geheugen van de
texturen), wat er nog op mijn sprites wacht, en hoe ik een nieuwe sprite of nieuwe map-stijl toevoeg.
