# BLITZKRIEG – Tunneler in de Tweede Wereldoorlog (2–4 spelers)

## Starten
```
npm install
npm start
```
Open `http://localhost:3000`. Andere laptops in hetzelfde netwerk openen het adres dat de server
toont (bijv. `http://192.168.1.82:3000`). Sta Node.js toe in de Windows-firewall als daarom gevraagd
wordt. Is poort 3000 bezet, start dan op een andere: `PORT=3001 npm start` (PowerShell:
`$env:PORT=3001; npm start`). Het originele Tunneler staat op `/retro`.

Besturing: pijltjes/WASD = rijden, spatie = schieten, K = zelfvernietiging. Terug in je eigen basis
tank, repareer en herlaad je.

Op een tablet of telefoon (iPad, Android) speel je liggend met je duimen; de knoppen verschijnen bij
de eerste aanraking. Linkerhelft van het veld = zwevende joystick (duim neerzetten en slepen, 8
richtingen), rechterhelft = vuren, het K-rondje bovenin 1 s vasthouden = zelfvernietiging. Staand
krijg je "draai je scherm". Op een telefoon (liggend, lager dan 500 px) is het zijpaneel een kleine
HUD rechtsboven: je tankkaart en de minikaart, zonder legenda. Volledig scherm: de knop ⛶ VOLLEDIG
SCHERM helemaal rechtsboven in de balk (Android zet het scherm dan ook liggend vast), of "Zet op
beginscherm" / "Toevoegen aan startscherm" in de browser: dan opent het spel zonder browserbalken. `/retro` heeft geen
touchbesturing.

Rechts staat op elke map hetzelfde: je tank (zeges en meters), de minikaart (terrein, je eigen basis,
je eigen tank en waar je brandstof (B) of munitie (M) haalt; geen tunnels, andere bases of tanks) en
de legenda van de map. Ook op de kaart zelf staat boven elke volle laadplek (depot, dropping) een
B- of M-badge met een pulserende ring.

## Een spel
- Wie als eerste binnenkomt is de **host**. In de wachtkamer staan bij de host naast de titel de
  **map** (10 maps, chronologisch; maps die nog niet bestaan staan grijs), de **kaartgrootte**
  (klein = 2 spelers, middel, groot, extra groot) en **START**. De anderen zien alleen de titel, die
  meeloopt met wat de host kiest. Na de start ziet ook de host alleen de titel.
- **STOP** (naast volledig scherm, alleen tijdens een spel): drukt de host erop, dan gaat iedereen
  terug naar de wachtkamer en kan de host een andere map of grootte kiezen. Drukt een gast erop, dan
  verlaat die het spel (de rest speelt door) en wordt de knop "opnieuw meedoen". Gaat de host weg,
  dan wordt de volgende speler host.
- Een **ronde** eindigt zodra er een tank dood is; daarna begint iedereen weer in zijn eigen basis
  met alles vol. Bij **2 spelers** wint wie eerst **3 rondes** wint, bij meer spelers wie eerst
  **5 kills** heeft. Een dood door een gevaar telt voor niemand. Daarna terug naar de wachtkamer.
- De kaart blijft het hele spel dezelfde; tunnels en sporen blijven tussen rondes liggen.

## Wat er in het spel zit
- **Terrein**: verhard, hard, normaal, zacht, moeras, doorwaadbare plek, ijs. Hoe zachter, hoe trager
  en hoe duidelijker je tunnel; sporen vervagen per klasse. Rots en water zijn onbegaanbaar.
- **Begroeiing en gebouwen** zijn weg te schieten (begroeiing 1–3 treffers, gebouwen 4, daarna puin).
  Een kogel raakt begroeiing over de hele breedte van je tank, en een plant die omgaat neemt alles
  binnen 4 cellen mee: zo schiet je altijd een doorgang waar je tank door past.
- **Kogels** vliegen over grond en water en stoppen bij een tank, begroeiing, gebouw, rots of geschut.
- **Zicht**: binnen je zichtcirkel (de halve hoogte van het beeld) zie je rondom: tegenstanders en
  hun kogels scherp. Gebouwen, begroeiing, rotsen en rook verbergen overal wat erachter ligt. In je
  kijkboog (130° in je rijrichting) kijk je er net langs: je ziet de rand van het obstakel en een
  tank die half achter een hoek staat. Naast en achter je zie je het obstakel zelf niet, en ook
  niets erlangs. Buiten de cirkel wordt het beeld steeds vager. Daar zie je alleen in je kijkboog
  nog iets: een tank als vage, donkere contour, zonder kleur of kenmerken. Waar je niets kunt
  zien, is het beeld donkerder en zie je geen tunnels, sporen, kraters of ijsbarsten, alleen het
  kale terrein. Met de knop **ZICHT AAN/UIT** in de bovenste balk zet je de mist, schaduw en
  vervaging uit; wat je niet kunt zien, blijft verborgen.
- **Richtingshints**: een gloed aan de rand in één van 8 richtingen bij een schot, een omgeschoten
  plant of krakend ijs van een tegenstander binnen 20 T, en bij grote gebeurtenissen overal. Zie je
  die tegenstander scherp, dan komt er geen hint.
- **Weer** per map, per ronde of op een timer: zichtstraal, stormen die sporen wissen (stilstaan =
  onderduiken), mist, regen, nacht met zoeklichten, en terrein dat verandert (dooi, modder, inundatie).
- **Gevaren en schaarse middelen** per map: zie de tabel hieronder.

| Map | Gevaar | Schaars middel | Weer |
|---|---|---|---|
| 1940 Grebbeberg | – | munitie alleen bij het depot in Rhenen | inundatie vanaf ronde 2, regen in ronde 3, rook |
| 1941 Russische vlakte | – | dubbel brandstof in de modder | zomer met stofspoor; vanaf ronde 3 modder |
| 1942 El Alamein | zandmeter, mijnen | – | hitte met valse contouren; zandstorm elke 90 s |
| 1942 Leningrad | breekbaar ijs | motorwarmte | schemering, sneeuwjacht; dooi in ronde 4 |
| 1943 Koersk | brandend graan | motortemperatuur | zomer met rook; onweer vanaf ronde 3 |
| 1944 Carentan | verborgen antitankgeschut | – | ochtendmist; regenbuien bij het water |
| 1944 Arnhem | de brug kan ontploffen (10% per oversteek, +5% na elke oversteek) | brandstof en munitie via droppings | helder; mist en regen vanaf ronde 3 |
| 1944 Ardennen | barrage in het bos | brandstofdepots | mist; sneeuwstorm elke 90 s |
| 1945 Oder-front | artilleriebarrage | – | nacht met zoeklichten; dageraad vanaf ronde 3 |
| 1945 Berlijn | instortende gevels | pantser wordt niet hersteld | rook, steeds dichter |

**Alle getallen staan in `shared/config.js`**: terreinklassen, maten (T = 5 cellen), zicht, tank,
kogels, mijnen, gebouwen, rondes, hints, netwerk, rook en kaartgroottes. Zie de uitleg bovenaan elk
blok. **Elke kaart (veldslag) staat in een eigen bestand** in `shared/maps/` (`carentan.js`, ...):
het terrein in procenten, de vaste kenmerken (dorpen, rivieren, wegen, ...), het weer, het gevaar,
het schaarse middel en de meter met hun getallen, de kleuren en het uiterlijk van de tanks. De
velden staan uitgelegd bovenaan `shared/maps/index.js`, waar ook het mapmenu staat.

### Afwijkingen van de spec (bewust)
- **Zicht** (§9): in plaats van een vaste zichtstraal van 12 T is de zichtcirkel de halve hoogte van
  het beeld. Het weer houdt zijn waarden in T: 12 T = de volle cirkel, 6 T = de helft, nooit kleiner
  dan 2 tankbreedtes (`VISION`). Rotsen blokkeren het zicht ook. In een kijkboog van 130° in je
  rijrichting kijk je langs de randen van obstakels, naast en achter je niet. Buiten de cirkel zie
  je geen schim maar, alleen in de kijkboog, een contour die naar de rand van het venster
  vervaagt. Kogels van anderen zie je alleen scherp in je zichtveld. Tunnels en sporen zie je
  alleen waar je zicht hebt (de spec laat ze overal zien). Een tegenstander die je scherp ziet,
  geeft geen richtingshint.
- **Percentages en vaste breedtes**: wegen (2 T) schalen niet mee; op een kleine kaart is verhard
  daardoor meer dan 8% (bv. Ardennen ~13%), en dat gaat van de andere klassen af. De test houdt daar
  rekening mee; Ardennen klein heeft daarvoor 1 procentpunt extra marge (`tolerance`).
- **Berlijn met 4 spelers**: de vrije zones rond de bases (~13% van de stad) mogen geen huizen hebben,
  dus ~25% gebouwen in plaats van 30% (ruimere marge in de config). De Spree en het kanaal zijn iets
  smaller (2 en 1,5 T), anders is het water ~12% in plaats van 7%. Er is **geen metro** (op verzoek).
  Op de kleine kaart passen de bases niet tussen de rivieren: ~20% gebouwen (marge 13 in plaats van 8).
- **Krappe kaarten** (Market Garden en Berlijn klein): passen de bases niet volgens alle regels, dan
  wordt eerst de vensterregel versoepeld, daarna de afstand tot de rivier (die buigt dan om de basis
  heen) en pas als laatste de uitrijstrook (tot de 3 T uit de spec).
- **Brug bij Arnhem**: in de spec ontploft de brug altijd na de eerste oversteek. Hier is het een
  kans: 10%, en elke oversteek 5% meer (`chance`/`chanceStep`). De teller loopt door over de rondes
  (de brug zelf is elke ronde weer heel) en begint pas bij een nieuw spel weer bij 10%.
- **Huizen en kerken** staan nooit op een weg of dijk, en in een dorp ook niet pal ertegen.
- **Plassen en rotsen** worden niet afgekapt door de rechthoekige zones (rond de bases, het dorp, een
  park, een gebied): komt een blob daaraan, dan wordt hij kleiner of komt hij ergens anders.
- **Dorpshuizen** tellen niet mee in de percentages; ze gaan van de andere klassen af (ruimere marge).
- **Maten van gebouwen**: de kaartmaker gebruikt de grondvlakken van de getekende gebouwen
  (`BUILDINGS` in config.js): kerk 8×15 (spec: 2T×3T), boerderij 11×10, dorpshuizen 60% woonhuis 6×6
  en 40% rijhuis 12×5 (de helft gedraaid) in plaats van een willekeurige maat van T tot 2T.
- **Koersk**: de Psel (3 T) is maar ~3% water; de rest van de 6% zijn plassen. Er zijn **geen
  loopgraven** (op verzoek): verhard is één zandweg met de brug over de Psel, aangevuld met
  zijwegen vanaf de rand, samen nog steeds ~6%.
- **Leningrad**: bevroren veen is lichter dan in de spec (#8a7e72), anders zijn tunnels niet te zien.
- **Oder-front**: de helling heeft 1 eigen opening; de twee wegen erdoorheen zijn de andere twee.
- **Bossen** liggen minstens 2 cellen uit elkaar (losse bossen); breedte 1–5 T zoals in de spec.
- Gevaren en weer worden in de browser van elke speler verborgen of getoond (geen anti-cheat).

## Testen
```
npm test            # alle tests (testserver met vaste kaart, snelle weerklok, 2 rondes om te winnen;
                    # tests zonder server lopen tegelijk in worker-threads, ~1,5 minuut)
npm test -- ijs     # alleen tests met 'ijs' in de naam
npm run test:gen    # de grote generatietest: elke map 100 keer, 4 groottes, 2/3/4 spelers
npm run test:gen -- ardennen 10   # één map, 10 kaarten per geval
```
Elk acceptatiecriterium uit §12 heeft tests (zie `tests/acceptance.mjs`). Ontwikkelen (alleen op
localhost, in de adresbalk):
- `?debug=alles` toont alle tanks en zet het zicht uit;
- `?zoom=3` zet de camera dichter op je tank (om details te bekijken);
- `?fps=1` toont linksboven de beelden per seconde en de rekentijd per beeld;
- `?kijk=0.5,0.45` zet de camera op die plek van de kaart (fractie van breedte en hoogte) in plaats
  van op je tank, om water, ijs of bruggen te bekijken zonder erheen te rijden (in de console:
  `blitzView.lookAt(0.5, 0.45)`, en `blitzView.lookAt()` terug naar je tank);
- `blitzView.bench()` in de console tekent 120 beelden direct na elkaar en geeft de tijd per beeld,
  ook als het venster niet zichtbaar is (het kan niet sneller meten dan de verversing van het scherm);
- `blitzView.assets()` in de console zegt welke texturen en sprites uit `public/assets/` komen;
  `blitzView.play('explosie', x, y, { size: 14 })` speelt een effect af om het te bekijken.

## Uiterlijk per map (`look`)
Alle maps gebruiken dezelfde weergave (PixiJS); alleen de instellingen verschillen. Die staan in
`shared/config.js` (`LOOK`, de standaard) en in het bestand van de kaart in `shared/maps/`, dat met
`look: { ... }` velden kan overschrijven.
De spelregels kijken er niet naar.

| Veld | Wat |
|---|---|
| `grade` | Kleurfilter over de wereld: `saturation` (-1 grijs .. 1 feller), `brightness`, `contrast` (1 = gelijk), `tint` (`#rrggbb`) met `tintStrength` (0..1). |
| `noise` | Grondtextuur met simplex-ruis: `scale` (cellen per vlek), `strength`, `octaves`. Werkt vooral op donkere grond. |
| `blend` | Breedte van de zachte overgang tussen terreinklassen, in cellen. |
| `ground` | Grondtexturen: `cells` (zoveel cellen beslaat één textuur van 512 px), `tint` (0 = eigen kleur van de textuur, 1 = klassekleur van de kaart), `contrast` (0 = effen, 1 = zoals getekend), `textures` (`{ klasse: naam }`: een andere textuur dan het manifest zegt). |
| `light` | Eén lichtbron voor alle schaduwen: verschuiving `dx`, `dy` (cellen), `alpha`, `blur` (zachte rand). |
| `weather`, `amount` | Deeltjes in beeld: `'snow'`, `'dust'`, `'rain'` of `null`, en hoeveel per 100×100 cellen (in een storm `stormFactor` keer zoveel). |
| `vignette`, `fogSoft` | Donkere hoeken; hoe zacht de rand van je zichtveld inloopt. |
| `water` | Water in de grondshader: `deep` (donkerte in het diepe), `depthCells` (zo ver van de kant is het diep), `shore` (lichter aan de kant), `shine` (glinstering), golven met `waveCells` (maat), `waveSpeed` en `waves` (sterkte). Ook de glans op moeras en doorwaadbare plekken. |
| `ice` | IJs: `depthCells` en `deep` (donker, diep ijs naar het midden), `frost` (witte ijzel), `sheen` (glans), `stress` (donkerder, nat ijs in een vak dat bijna breekt), `crackWidth` en `crackGrow` (barsten dikker per stadium). Met een ijstextuur in het manifest (`ice` per stijl of kaart): `texScale` (maat t.o.v. de grondtextuur) en `texDeep` (donkerder naar het midden). |
| `road` | Wegen (de middellijnen uit de kaartmaker): `verge`, `vergeColor` (`null` = modder in de tunnelkleur) en `vergeAmount` (berm), rijsporen met `ruts`, `rutOffset` en `rutWidth`, `smooth` (afronding van binnenhoeken), `junction` (zo ver van een kruising krijgt de weg weer een richting), `curb` en `curbColor` (stoeprand, ook langs het stadsrooster), `line` (middenstreep). De textuur van de klasse van de weg loopt mee met de bocht. |
| `objects` | Bomen en rotsen als sprites: `rocks` (op zo'n deel van de rots staat een rotsblok). Welke soorten een kaart heeft staat bij `vegetation` in het kaartbestand: `sprites` (`{ struik: 0.65, cactus: 0.35 }`, anders de soort bij `type`) en `palmCoast` (tot zo ver van zee wordt begroeiing een palm). Maten en schaduw in `OBJECTS` (config.js). |
| tanks | Niet in `look`, maar bij `tanks` in het kaartbestand: `sprite` (map in `public/assets/tanks/`) en `paint` (andere schildering, `tank-<paint>.png`). Waar het embleem of nummer op de tank komt en hoe donker ploeg C/D is: `TANK_ART` in config.js. Zonder bestand tekent de stijl de tank. |
| `waterPlants` | Waterplanten: `density` (kans per roosterpunt, 0 = uit) en `width` (breedte van de strook langs de oever). |
| `grain` | Korrel over het beeld (0..1); samen met `grade` en `vignette` in één nabewerkingsfilter. |
| `bridge` | Bruggen als sprite: `kind` (`hout`, `steen`, `staal`: welke tekening uit `public/assets/<stijl>/bridges/`, anders getekend), `land` (zo'n deel van het landhoofd ligt op de oever), `height` (lengte van de schaduw). |
| `iceShine`, `haze`, `shakeOnHit` | Glinstering op ijs, hittewaas (als het weer `heatHaze` heeft), schudden als je geraakt wordt. |

**Een nieuwe map een eigen stijl geven:**
1. Kies in het bestand van de kaart de weergave met `style` (`zomer`, `winter` of `woestijn`). Die
   bepaalt de vormen (bomen, bases, tanks, de textuur over de kaartkleuren) en de opmaak van het
   zijpaneel.
2. Geef de kleuren van het terrein in `classes`, `rocks`, `water`, `vegetation` en `tunnelColor`.
3. Voeg een `look`-blok toe, bijvoorbeeld koud en besneeuwd:
   `look: { grade: { saturation: -0.15, tint: '#d2e2ff', tintStrength: 0.18 }, weather: 'snow', amount: 30 }`.
4. Herstart de server en bekijk de map met `?zoom=2` en `?fps=1`.

Een heel ander soort vormen (bijvoorbeeld een stad in de sneeuw) betekent een nieuwe stijl in
`public/styles/`: een tekenmodule `<naam>.js` (`surface` voor de grondshader, `drawTank`, `drawBase`,
getekende objecten als er geen atlas is; zie de uitleg bovenaan `public/world-view.js`), een map
`public/assets/<naam>/` met texturen en sprites (zie `public/assets/LEESMIJ.md`) en een thema `<naam>.css` (kleuren en randen van het speelveld
en het zijpaneel, op `[data-style="<naam>"]`), plus een `<link>` naar dat thema in `index.html`.

## Opbouw
| Bestand | Wat |
|---|---|
| `shared/config.js` | Alle algemene getallen (terrein, zicht, tank, kogels, netwerk, ...). |
| `shared/maps/` | De kaarten: één bestand per veldslag, `index.js` met het mapmenu en de uitleg van de velden. |
| `shared/game.js` | De ingang voor de spelregels (`import * as G`): geeft alles door uit de bestanden hieronder, plus rondes en score. Server én browser. |
| `shared/world.js` | Kaartmaat, celtypes, terreinklassen, de tankvorm en deterministisch toeval. |
| `shared/terrain.js` | Wat de kaart verandert: graven, sporen en vervagen, wegschieten, ijs en dooi, weer en gevaren. |
| `shared/movement.js` | Rijden, kogels en mijnen. |
| `shared/codec.js` | De kaart over de lijn: run-length encoding en base64. |
| `shared/mapgen.js` | Kaartmaker (§6): bases eerst, dan kenmerken, terrein tot de percentages, controle; ook de retrokaart. |
| `shared/weather.js` | Weerregels per ronde en timer. |
| `shared/vision.js` | Zichtregel (kijkboog, zichtlijn, scherp of contour), richtingshints, zoeklichten. |
| `shared/client-sim.js` | Clientkant zonder browsercode: berichten (tabel `ON` met alle gebeurtenissen), voorspelling, posities. Browser én tests. |
| `hazards.js` | Gevaren, schaarse middelen en meters (alleen server; die gooit de dobbelsteen). |
| `server.js` | Autoritatieve simulatie op 30 ticks/s, wachtkamer en rondes. |
| `public/index.html`, `shell.js` | De spelpagina: titel, menu's, speelveld en zijpaneel. `shell.js` laadt de stijl van de kaart en wisselt hem bij een andere kaart. |
| `public/world-view.js` | Gedeelde wereldweergave (PixiJS): lagen, kaart, zicht, hints, objecten, tanks, weer, `look`. |
| `public/view/` | Delen van de weergave: `side-panel.js` (minikaart, legenda, tankkaart) en `hazards-view.js` (gevaren en laadplekken in beeld: depots, kratten met parachute en het munitiedepot als sprite uit de atlas, anders getekend). |
| `public/view/ground-gpu.js` | De grond op de videokaart: één mesh met een eigen shader (terreinklassen met texturen, tunnels, rots, water, ijs, puin, schone kaart buiten je zicht). |
| `public/view/bridges-view.js` | Bruggen als sprite (begin, herhaald middenstuk, eind) in de richting van de weg, met schaduw; het wrak als de brug bij Arnhem ontploft. |
| `public/view/base-kit.js` | De basis als bouwpakket: muurstukken, hoekpalen, deurposten en spullen uit `public/assets/<stijl>/bases/` op de echte cellen van de basis (maten in `BASE_KIT`). |
| `public/view/buildings-view.js` | Gebouwen in drie stadia (heel, half, puin) als sprite, als hun grondvlak past bij een getekend gebouw (`BUILDINGS` in config.js); anders het dak uit de grondshader. |
| `public/view/plants-view.js` | Waterplanten langs de oever (zomer: waterlelies en oeverplanten, winter: ijsbladeren en riet); alleen decoratie. |
| `public/view/effects-view.js` | Flipbook-effecten (explosie, rook, mondingsvuur, inslagen) uit `public/assets/effects/` en lichtvlekjes bij schoten en explosies. |
| `public/view/roads.js` | Wegenveld voor de shader: de middellijnen gladgemaakt (Chaikin) en per cel de afstand tot de dichtstbijzijnde en de op één na dichtstbijzijnde weg en de plek langs de weg. |
| `public/assets.js`, `public/assets/` | Asset-loader en de sprites en texturen zelf (`manifest.json` zegt wat er is, `LEESMIJ.md` wat wat is). Wat ontbreekt, wordt procedureel of zoals vroeger getekend. |
| `public/pixi-scene.js` | Pixi-hulpjes: vaste texturen, tegelsprites, deeltjes, labels. |
| `public/view/objects-view.js` | Bomen, struiken, heggen, cactussen, palmen, rotsblokken en kraters als sprites uit de atlas van de stijl, per tegel en alleen in beeld; omgeschoten begroeiing als kapotte variant (of weg). |
| `public/render-common.js` | Hulpjes (kleur, ruis, velden), tegelcanvassen voor de getekende objecten als er geen atlas is, camera, gedeelde tekeningen. |
| `public/styles/` | De stijlen: `zomer.js`, `winter.js`, `woestijn.js` (tekenen) met hun thema `.css`, en `view.css` (opbouw van speelveld en zijpaneel). |
| `public/touch.js`, `touch.css` | Touchbesturing (joystick, vuren, K) en de telefoonstand van het speelveld. |
| `public/manifest.webmanifest`, `icon.svg` | Op het beginscherm zetten: volledig scherm, liggend. |
| `public/retro.html`, `client.js` | Het originele Tunneler. |
| `tests/` | `run.mjs`, `tests.mjs`, `maps.mjs`, `acceptance.mjs`, `gen.mjs`, `gen-checks.mjs`, `fingerprint.mjs` (zelfde seed = zelfde kaart), `helpers.mjs`. |

Interne namen die zijn blijven staan: de map-id's, de omgevingsvariabelen `TUNNELER_*` en de
potnaam van retro.

## Waarom het snel en soepel is
- De kaart gaat **één keer** over de lijn: kaart, terrein, sporen, planten en gaten als binaire RLE,
  gecomprimeerd (permessage-deflate; ~27 KB na drie minuten spelen met vier tanks).
  Daarna rekent elke client zelf mee: deterministisch, dus identiek aan de server. Per tick gaan
  alleen gewijzigde tankvelden mee (delta's), ongecomprimeerd.
- **Eigen tank voorspeld**: hij rijdt meteen als je een toets indrukt, met dezelfde regels als de server.
  De server bevestigt per tick hoe ver hij is; afwijkingen worden in ~0,1 s weggewerkt.
- **Buffer tegen haperingen**: andere tanks en kogels worden ~1 tick achter de servertijd getekend,
  op basis van een geschatte serverklok, zodat ze niet springen als berichten in groepjes aankomen.
- **PixiJS (WebGL)**: de weergave tekent in lagen (grond, markeringen, schaduwen, objecten, tanks,
  kruinen, effecten, mist, UI). Wat duur is (kaart, bomen, bases, tanks) wordt één keer getekend en
  daarna alleen verplaatst of gedraaid; ~4 ms per beeld op 1560×1012. De pakketten (`pixi.js`,
  `pixi-filters`, `simplex-noise`) komen via `npm install` en de server geeft ze op `/vendor/`; een
  import map in `index.html` koppelt de namen. Geen build-stap, en het werkt zonder internet.
- **Grond op de videokaart**: de kaart gaat als een paar texturen van 1 pixel per cel naar de
  videokaart (celtype, klasse, sporen, randvelden); een shader rekent per schermpixel uit wat er ligt,
  dus scherp op elke zoomstand. Bij graven worden alleen de veranderde cellen geüpload. Instappen
  kost ~0,2 s in plaats van ~1,5 s (de oude schilder moest eerst alle tegels in beeld schilderen).
- **Objecten als sprites**: bomen en rotsen komen uit één atlas per stijl en staan per tegel van 32×32
  cellen in een container; alleen tegels in beeld worden getekend. Een omgeschoten plant bouwt alleen
  de tegels eromheen opnieuw op.
- **Robuust**: berichten max. 4 KB, max. 60 berichten/s per speler, hartslag elke 5 s ruimt
  verbindingen van slapende laptops op, en een fout in één verbinding laat de server niet crashen.

