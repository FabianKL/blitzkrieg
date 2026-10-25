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

Rechts staat op elke map hetzelfde: je tank (zeges en meters), de minikaart (terrein, je eigen basis,
je eigen tank en waar je brandstof (B) of munitie (M) haalt; geen tunnels, andere bases of tanks) en
de legenda van de map.

## Een spel
- Wie als eerste binnenkomt is de **host**. Die kiest bovenin de **map** (10 maps, chronologisch; maps
  die nog niet bestaan staan grijs) en de **kaartgrootte** (klein = 2 spelers, middel, groot,
  extra groot) en drukt op **START**. De anderen zien de keuze maar kunnen niets veranderen. Kiest de
  host tijdens een spel een andere map of grootte, dan begint meteen een nieuw spel op die kaart
  (handig om te testen). Gaat de host weg, dan wordt de volgende speler host.
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
- **Zicht**: binnen je zichtstraal zie je tegenstanders scherp, daarbuiten in je venster als vage schim;
  gebouwen, begroeiing en rook blokkeren het zicht (en het terrein erachter is donkerder).
- **Richtingshints**: een gloed aan de rand in één van 8 richtingen bij een schot, een omgeschoten
  plant of krakend ijs van een tegenstander binnen 20 T, en bij grote gebeurtenissen overal.
- **Weer** per map, per ronde of op een timer: zichtstraal, stormen die sporen wissen (stilstaan =
  onderduiken), mist, regen, nacht met zoeklichten, en terrein dat verandert (dooi, modder, inundatie).
- **Gevaren en schaarse middelen** per map: zie de tabel hieronder.

| Map | Gevaar | Schaars middel | Weer |
|---|---|---|---|
| 1940 Grebbeberg | – | munitie alleen bij het depot in Rhenen | inundatie vanaf ronde 2, regen in ronde 3, rook |
| 1941 Russische vlakte | – | dubbel brandstof in de modder | zomer met stofspoor; vanaf ronde 3 modder |
| 1942 El Alamein | zandmeter, mijnen | – | hitte met valse schimmen; zandstorm elke 90 s |
| 1942 Leningrad | breekbaar ijs | motorwarmte | schemering, sneeuwjacht; dooi in ronde 4 |
| 1943 Koersk | brandend graan | motortemperatuur | zomer met rook; onweer vanaf ronde 3 |
| 1944 Carentan | verborgen antitankgeschut | – | ochtendmist; regenbuien bij het water |
| 1944 Arnhem | de brug ontploft | brandstof en munitie via droppings | helder; mist en regen vanaf ronde 3 |
| 1944 Ardennen | barrage in het bos | brandstofdepots | mist; sneeuwstorm elke 90 s |
| 1945 Oder-front | artilleriebarrage | – | nacht met zoeklichten; dageraad vanaf ronde 3 |
| 1945 Berlijn | instortende gevels | pantser wordt niet hersteld | rook, steeds dichter |

**Alle getallen staan in `shared/config.js`**: terreinklassen, maten (T = 5 cellen), zicht, kogels,
gebouwen, rondes, hints, kaartgroottes en per map het terrein in procenten, de vaste kenmerken
(dorpen, rivieren, wegen, ...), het weer, het gevaar, het schaarse middel en het uiterlijk van de
tanks. Zie de uitleg bovenaan elk blok.

### Afwijkingen van de spec (bewust)
- **Zicht**: de zichtstralen uit de spec zijn met 0,4 vermenigvuldigd (`VISION.scale`), zodat ze in
  het venster passen: 12 T = 24 cellen.
- **Percentages en vaste breedtes**: wegen (2 T) schalen niet mee; op een kleine kaart is verhard
  daardoor meer dan 8% (bv. Ardennen ~13%), en dat gaat van de andere klassen af. De test houdt daar
  rekening mee.
- **Berlijn met 4 spelers**: de vrije zones rond de bases (~13% van de stad) mogen geen huizen hebben,
  dus ~25% gebouwen in plaats van 30% (ruimere marge in de config). De Spree en het kanaal zijn iets
  smaller (2 en 1,5 T), anders is het water ~12% in plaats van 7%. Er is **geen metro** (op verzoek).
  Op de kleine kaart passen de bases niet tussen de rivieren: ~20% gebouwen (marge 13 in plaats van 8).
- **Krappe kaarten** (Market Garden en Berlijn klein): passen de bases niet volgens alle regels, dan
  wordt eerst de vensterregel versoepeld, daarna de afstand tot de rivier (die buigt dan om de basis
  heen) en pas als laatste de uitrijstrook (tot de 3 T uit de spec).
- **Dorpshuizen** tellen niet mee in de percentages; ze gaan van de andere klassen af (ruimere marge).
- **Koersk**: de Psel (3 T) is maar ~3% water; de rest van de 6% zijn plassen.
- **Leningrad**: bevroren veen is lichter dan in de spec (#8a7e72), anders zijn tunnels niet te zien.
- **Oder-front**: de helling heeft 1 eigen opening; de twee wegen erdoorheen zijn de andere twee.
- **Bossen** liggen minstens 2 cellen uit elkaar (losse bossen); breedte 1–5 T zoals in de spec.
- Gevaren en weer worden in de browser van elke speler verborgen of getoond (geen anti-cheat).

## Testen
```
npm test            # alle tests (testserver met vaste kaart, snelle weerklok, 2 rondes om te winnen)
npm test -- ijs     # alleen tests met 'ijs' in de naam
npm run test:gen    # de grote generatietest: elke map 100 keer, 4 groottes, 2/3/4 spelers
npm run test:gen -- ardennen 10   # één map, 10 kaarten per geval
```
Elk acceptatiecriterium uit §12 heeft tests (zie `tests/acceptance.mjs`). Ontwikkelen:
`?debug=alles` in de adresbalk (alleen op localhost) toont alle tanks en zet het zicht uit.

## Opbouw
| Bestand | Wat |
|---|---|
| `shared/config.js` | Alle getallen en de 10 maps. |
| `shared/game.js` | Spelregels: terrein, rijden, graven, sporen, kogels, ijs, terreinveranderingen, rondes. Server én browser. |
| `shared/mapgen.js` | Kaartmaker (§6): bases eerst, dan kenmerken, terrein tot de percentages, controle. |
| `shared/weather.js` | Weerregels per ronde en timer. |
| `shared/vision.js` | Zichtlijn, schim, richtingshints, zoeklichten. |
| `shared/client-sim.js` | Clientkant zonder browsercode: berichten, voorspelling, posities. Browser én tests. |
| `hazards.js` | Gevaren, schaarse middelen en meters (alleen server; die gooit de dobbelsteen). |
| `server.js` | Autoritatieve simulatie op 30 ticks/s, wachtkamer en rondes. |
| `public/index.html`, `shell.js` | De spelpagina: titel, menu's, en de weergave in een iframe. |
| `public/world-view.js` | Gedeelde wereldweergave: kaart, zicht, hints, objecten, weer. |
| `public/1944.js`, `1943.js`, `1942.js` + `.html` | Stijlen zomer, winter en woestijn. |
| `public/retro.html`, `client.js` | Het originele Tunneler. |
| `tests/` | `run.mjs`, `tests.mjs`, `maps.mjs`, `acceptance.mjs`, `gen.mjs`, `gen-checks.mjs`, `helpers.mjs`. |

Interne namen die zijn blijven staan: de map-id's, de stijlbestanden `1944/1943/1942`, de
omgevingsvariabelen `TUNNELER_*` en de potnaam van retro.

## Waarom het snel en soepel is
- De kaart gaat **één keer** over de lijn: kaart, terrein, sporen, planten en gaten als binaire RLE,
  gecomprimeerd (permessage-deflate; ~27 KB na drie minuten spelen met vier tanks).
  Daarna rekent elke client zelf mee: deterministisch, dus identiek aan de server. Per tick gaan
  alleen gewijzigde tankvelden mee (delta's), ongecomprimeerd.
- **Eigen tank voorspeld**: hij rijdt meteen als je een toets indrukt, met dezelfde regels als de server.
  De server bevestigt per tick hoe ver hij is; afwijkingen worden in ~0,1 s weggewerkt.
- **Buffer tegen haperingen**: andere tanks en kogels worden ~1 tick achter de servertijd getekend,
  op basis van een geschatte serverklok, zodat ze niet springen als berichten in groepjes aankomen.
- **Kaartschilder per tegel**: een tegel (32×32 cellen) wordt pas geschilderd als hij in beeld komt;
  dure ruiskleuren worden per pixel onthouden, zodat graven/vervagen alleen nog opzoeken is. Pixels en
  kleurgeheugen bestaan alleen voor de 48 laatst geziene tegels (`?tiles=8` in de adresbalk om dat te
  testen). Een omgeschoten plant werkt alleen het stukje kaart eromheen bij.
- **Robuust**: berichten max. 4 KB, max. 60 berichten/s per speler, hartslag elke 5 s ruimt
  verbindingen van slapende laptops op, en een fout in één verbinding laat de server niet crashen.

