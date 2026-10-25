# Specificatie: Blitzkrieg — spelregels, maps, terrein en weer

Dit document beschrijft de uitbreiding van het bestaande Tunneler-spel naar **Blitzkrieg**: tien maps uit de Tweede Wereldoorlog, elk met eigen terrein, een eigen gevaar, een eigen schaars middel en een eigen weerbeeld. Het vervangt de eerdere terreinspecificatie (`SPEC-terrein.md`). Waar die twee verschillen, geldt dit document.

Bouw voort op de bestaande code (tegels, rendering, netwerk, tanks). Bedenk geen nieuwe architectuur als dat niet nodig is. Alle getallen in dit document horen in configuratiebestanden, zodat ze tijdens het testen makkelijk aan te passen zijn.

---

## 0. Kern van het spel (niet veranderen)

Blitzkrieg blijft Tunneler. Spelers graven zich met een tank door de grond en zoeken elkaar. Je ziet een tegenstander pas scherp als hij binnen je zichtstraal komt (hoofdstuk 9). Daarvoor zoek je hem aan de hand van zijn sporen: tunnels, bandensporen, barsten in het ijs, weggeschoten begroeiing, puin. Buiten je zichtstraal zie je hem hooguit als een vage **schim**, of krijg je een **richtingshint** (hoofdstuk 8): een oplichtende gloed aan de rand van je scherm die alleen een richting aangeeft.

---

## 1. Naam

- Hernoem het spel overal in de interface van "Tunneler" naar **"BLITZKRIEG"**: titelbalk, kopregel in het spel, starttekst, paginatitel.
- Interne code- en bestandsnamen mogen blijven als hernoemen veel risico geeft. Zeg dan welke namen je hebt laten staan.

---

## 2. Spel, ronde en winnen

### 2.1 Begrippen

- **Spel:** een reeks rondes op één map, tot er een winnaar is.
- **Ronde:** begint met alle spelers in hun eigen basis en eindigt zodra er een speler dood is.

### 2.2 Winnen

| Aantal spelers | Winnaar van het spel |
| --- | --- |
| 2 | Wie als eerste **3 rondes** heeft gewonnen. Je wint een ronde als je tegenstander dood is en jij als enige over bent. |
| Meer dan 2 | Wie als eerste **5 kills** heeft. |

- **Kill:** jouw treffer zorgt ervoor dat een tegenstander geen pantser meer heeft.
- **Geen pantser = dood**, ook als dat door een gevaar of weer komt. Een dood door een gevaar telt niet als kill voor iemand.
- Bij 2 spelers: gaan beide spelers tegelijk dood, dan wint niemand de ronde.

### 2.3 Na een dood

- Gaat een speler dood, dan eindigt de ronde en begint **iedereen weer in zijn eigen basis**.
- Aan het begin van elke ronde heeft iedereen **vol pantser, volle brandstof en volle munitie**, tenzij de map iets anders bepaalt (hoofdstuk 10).
- De score (gewonnen rondes of kills) blijft over de rondes heen staan.

### 2.4 De map tijdens een spel

- De kaart wordt **één keer** gegenereerd bij het begin van een spel en blijft het hele spel dezelfde. Ook de basisposities blijven gelijk.
- Wat er tijdens een ronde op de kaart verandert (gegraven tunnels, weggeschoten begroeiing, puin, gebroken ijs, veranderingen door het weer), blijft ook in de volgende ronde staan, tenzij de map iets anders bepaalt. Zie open vraag 1.
- Uitzondering: bruggen bij Market Garden worden aan het begin van elke ronde hersteld (10.7).

### 2.5 Weer en rondes

- Het weer (hoofdstuk 7) begint bij de start van het **spel** en loopt over de rondes heen door.
- Een weersverandering kan afhangen van een **timer** (seconden sinds het begin van het spel of van de ronde) of van het **rondenummer** (bijvoorbeeld "vanaf ronde 3").
- Het kan dus gebeuren dat er twee rondes gespeeld zijn voordat een weersverandering begint.

---

## 3. Mapkeuze en kaartgrootte

- Bovenaan het scherm komen twee **pull-down menu's**: de map en de kaartgrootte.
- **Mapmenu:** alle maps in chronologische volgorde, zoals in de tabel in hoofdstuk 10. Weergave per regel: `jaar · missie — map`, bijvoorbeeld `1944 · Wacht am Rhein — Ardennen`.
- **Kaartgrootte:** klein, middel, groot, extra groot (zie 6.0). Standaard: middel.
- De menu's zijn bruikbaar voordat een spel start. Tijdens een spel zijn ze zichtbaar, maar uitgeschakeld.
- De speler die het spel aanmaakt (host) kiest. De andere spelers zien de keuze, maar kunnen die niet wijzigen.
- De titelregel in het spel toont de missie en map, bijvoorbeeld `BLITZKRIEG — WACHT AM RHEIN — ARDENNEN · DECEMBER 1944`.
- Het scherm toont ook de score en het rondenummer.

---

## 4. Tanks

- Alle tanks hebben **exact dezelfde eigenschappen**: snelheid, pantser, brandstof, munitie, vuursnelheid.
- Per map verschilt alleen het uiterlijk (sprite en naam op het rapportkaartje).
- **Basis:** in je eigen basis vul je pantser, brandstof en munitie aan, tenzij de map iets anders bepaalt.

---

## 5. Terreinsysteem

### 5.1 Maten

Alle breedtes worden uitgedrukt in **T = de breedte van een tank**.

| Element | Breedte |
| --- | --- |
| Gegraven tunnel | ca. 1,5 T (de bestaande tunnelbreedte aanhouden als die al vastligt) |
| Weg, straat, dijk | minimaal 2 T |
| Brug | minimaal 3 T breed, zodat je er makkelijk overheen rijdt |
| Doorwaadbare plek | 3 T breed |
| Rivier | 3 tot 5 T, tenzij anders vermeld |
| Beek of kanaal | 2 tot 3 T |
| Heg | precies 1 T |
| Bos | op elk punt 1 tot 5 T breed |

### 5.2 Terreinklassen

Kernregel: **hoe harder de grond, hoe sneller je rijdt en hoe minder spoor je achterlaat. Hoe zachter de grond, hoe trager je rijdt en hoe duidelijker je tunnel.**

| Klasse (`id`) | Rijsnelheid op ongegraven tegel | Brandstof per tegel | Begin-intensiteit spoor | Vervaging per seconde | Minimale intensiteit |
| --- | --- | --- | --- | --- | --- |
| `paved` (verhard: weg, straat, brug) | 1.00 | 1 | 0.10 | 0.020 | 0.00 |
| `hard` (bevroren/droge grond, dijk) | 0.80 | 2 | 0.35 | 0.008 | 0.10 |
| `normal` (gras, graan, aarde) | 0.65 | 2 | 0.80 | 0.003 | 0.40 |
| `soft` (zand, sneeuw, modder, puin) | 0.45 | 3 | 1.00 | 0.001 | 0.60 |
| `marsh` (drassig) | 0.30 | 4 | 0.60 | 0.100 | 0.00 |
| `ford` (doorwaadbare plek) | 0.25 | 3 | 0.60 | 0.100 | 0.00 |
| `ice` (bevroren rivier of meer) | 1.00 | 1 | zie 5.6 | – | – |
| `vegetation` (begroeiing) | 0 tot weggeschoten | – | – | – | – |
| `building` (gebouw) | 0 tot kapotgeschoten | – | – | – | – |
| `rock` (onbegaanbaar, grijs) | 0 | – | – | – | – |
| `water` (onbegaanbaar, donkerblauw) | 0 | – | – | – | – |

**Regels:**

1. Rijsnelheid is een vermenigvuldiger op de maximale tanksnelheid en geldt voor graven door een ongegraven tegel.
2. **Bestaande tunnel:** rijden door een tunneltegel gaat altijd op snelheid 1.00 en kost 1 brandstof.
3. **Spoor:** bij binnenrijden wordt `trackIntensity` gelijk aan de begin-intensiteit van de klasse. Opnieuw rijden over een tunneltegel zet hem terug op de begin-intensiteit.
4. **Vervaging:** `trackIntensity` daalt elke seconde met de vervagingswaarde, maar niet onder de minimale intensiteit, behalve tijdens een sporenwisser (7.2).
5. **`marsh` en `ford`** krijgen geen tunnel, alleen rimpelingen die snel verdwijnen. De tegel blijft wat hij was.
6. **`rock` en `water`** zijn onbegaanbaar en niet te vernietigen. Rotsen zijn grijs, water is donkerblauw. Kogels stoppen op rotsen, maar vliegen over water heen (5.8).
7. **Weergave van sporen:** meng de terreinkleur met de tunnelkleur van de map, naar verhouding van `trackIntensity`. Eigen en vreemde sporen zien er hetzelfde uit.

### 5.3 Begroeiing

| Type | Schoten nodig |
| --- | --- |
| `pine` dennenboom | 2 |
| `tree` loofboom, bosje, boomgaard | 2 |
| `birch` berk | 2 |
| `hedge` heg | 3 |
| `shrub` dorre struik | 1 |

- **Bossen:** `pine`, `tree` en `birch` staan nooit los, maar vormen altijd een **bos**: een samenhangend vlak dat op elk punt minimaal 1 T en maximaal 5 T breed is. Een map met veel begroeiing krijgt dus meerdere bossen, geen één groot blok.
- **Heggen:** een `hedge` is altijd precies **1 T breed** en loopt als een lijn, recht of met hoeken.
- **Struiken:** `shrub` staan in kleine groepjes van 1 tot 3 T.
- Bij 0 levenspunten wordt de tegel de ondergrondklasse uit de mapconfiguratie.
- Er blijft een **permanent gat** zichtbaar (stronk, takken). Dat vervaagt nooit, ook niet door een sporenwisser.
- Een tank kan niet door begroeiing graven; eerst schieten. Elk schot kost munitie.

### 5.4 Gebouwen

- Grijze blokken met een dak- of muurtextuur, zodat ze herkenbaar anders zijn dan rotsen.
- Kapot te schieten in **4 schoten**. Daarna wordt de tegel `soft` (puin) met een permanent zichtbaar puinpatroon.
- Het kapotschieten van een gebouw geeft een richtingshint aan wie binnen gehoorafstand is (hoofdstuk 8).

### 5.5 Dorpsmodule

Een dorp is een vaste module die op een opgegeven plek wordt neergezet:

- een plein of kruispunt in het midden met één herkenningspunt (kerk, waterput, plein);
- 4 tot 8 gebouwen;
- straten (`paved`, minimaal 2 T breed) die aansluiten op de wegen van de map;
- eventueel tuinmuren of heggen als begroeiing aan de rand.

Standaardgrootte: ongeveer 10% van de kaart. Afwijkingen staan per map vermeld.

### 5.6 IJs

IJs kan op **elke map** voorkomen als bevroren rivier of bevroren meer. De mapconfiguratie bepaalt of een rivier of meer bevroren is (`"frozen": true`). In de huidige maps is dat de Neva bij Leningrad.

1. Rijdt als `paved`, maar maakt geen tunnel en laat **geen bandensporen** achter. Het enige spoor op ijs zijn **barsten**.
2. Elke ijstegel houdt `passCount` bij.
3. Bij elke passage is de kans dat het ijs breekt `min(1, passCount × 0.08)`.
4. Barsten worden zichtbaar in drie stadia: vanaf 2, 5 en 8 passages. Ze vervagen niet.
5. **Breekt het ijs onder een tank,** dan worden de tegel en de direct aangrenzende ijstegels een wak (`water`). De tank zakt erin en:
   - verliest zolang hij in het wak staat **2% pantser per seconde**;
   - kan nog wel rijden, maar heel langzaam (snelheid 0.15), en alleen naar een tegel die geen water is;
   - stopt met pantser verliezen zodra hij op een tegel staat die geen water is;
   - blijft hij in het wak, dan loopt het pantser leeg tot 0 en is hij dood.
6. Op de plek van een wak blijft een open gat met ijsschotsen zichtbaar.

### 5.7 Onderduiken in een storm

Alleen bij maps waarvan het weer een sneeuwstorm, zandstorm of sneeuwjacht heeft (zie de mapbeschrijving):

- Staat een tank tijdens de storm **2 seconden stil**, dan raakt hij bedekt onder de sneeuw of het zand.
- Een bedekte tank is **onzichtbaar voor de tegenstanders**, ook binnen hun zichtstraal, en geeft geen schim. Voor de eigen speler wordt hij getekend als een hoopje sneeuw of zand met een vage omtrek.
- De tank blijft bedekt tot hij gaat rijden of schiet, ook als de storm al voorbij is.
- Een bedekte tank kan wel geraakt worden door een schot dat er toevallig op komt.

### 5.8 Schieten

- Een kogel vliegt **over de grond heen**. Hij graaft niet: zand, sneeuw, aarde en andere grond blijven onveranderd.
- Een kogel vliegt rechtdoor **over de hele kaart**, ook over water, tot hij iets raakt of de kaartrand bereikt.
- Een kogel stopt bij: een tank, `vegetation`, `building`, `rock`, of een object zoals geschut.
- Raakt een kogel begroeiing of een gebouw, dan gaat er een levenspunt af (5.3 en 5.4).
- Je kunt een tegenstander dus raken zonder dat er een tunnel tussen jullie ligt.

---

## 6. Kaartgeneratie

De kaart wordt bij het begin van een spel gegenereerd volgens de mapbeschrijving: vaste kenmerken plus willekeurig ingevuld terrein. Daarna blijft hij het hele spel dezelfde (2.4).

### 6.0 Kaartgrootte

| Grootte | Breedte en hoogte ten opzichte van middel |
| --- | --- |
| Klein | 0,75× |
| Middel | 1× (de huidige kaartgrootte) |
| Groot | 1,5× |
| Extra groot | 2× |

- Posities van vaste kenmerken zijn fracties van de kaart en schalen dus mee.
- Breedtes in T (wegen, bruggen, rivieren, tunnels, de ruimte rond een base) schalen **niet** mee.
- Aantallen (bruggen, gebouwen per dorp, geschut) blijven gelijk, tenzij de map iets anders bepaalt. Percentages blijven gelijk.

### 6.1 Volgorde

De bases komen **eerst**; daarna wordt de kaart eromheen gemaakt.

1. **Bases plaatsen** (6.2). Houd daarbij rekening met de plekken waar vaste kenmerken komen (rivieren, dorpen, de stad), zodat een base daar niet op terechtkomt. Leg rond elke base een **beschermde zone**: de base zelf plus 3 T vrije ruimte en de vrije stroken boven en onder de opening.
2. **Vaste kenmerken plaatsen:** rivieren, beken, meren, wegen, bruggen, doorwaadbare plekken, dorpen, heuvels en andere bijzonderheden uit de mapbeschrijving. Posities staan als fracties van de kaart: `(0,0)` is linksboven, `(1,1)` rechtsonder. Licht variëren (±5%) mag, zodat geen twee kaarten precies gelijk zijn. Een kenmerk mag nooit een beschermde zone in. Schuif het zo nodig op (tot ±10%) of buig een rivier of weg om de zone heen.
3. **Bruggen:** op elk punt waar een weg water kruist, komt een brug van minimaal 3 T breed. Het aantal bruggen per water staat in de mapbeschrijving.
4. **Terrein invullen:** vul de rest van de kaart met de terreinklassen tot de percentages uit de mapbeschrijving zijn bereikt, met een marge van ±3 procentpunt. Gebruik samenhangende vlakken (bijvoorbeeld via ruis of groeiende blobs), geen losse tegels. Begroeiing volgt de vormregels uit 5.3. Percentages gelden voor de hele kaart, inclusief de vaste kenmerken.
5. **Objecten plaatsen:** gevaren, depots en speciale objecten uit de mapbeschrijving, buiten de beschermde zones.
6. **Controleren** (6.3).

### 6.2 Bases

- Elke speler krijgt een base. Bases worden **willekeurig** geplaatst, zodat je niet steeds dezelfde kant op hoeft te zoeken.
- **Minimale afstand:** je mag een andere base nooit kunnen zien vanuit je eigen base of als je er vlak omheen rijdt. Concreet: voor elke positie van je tank in je eigen base of binnen 3 T eromheen ligt elke andere base **helemaal buiten je venster**, inclusief de vage rand. Gebruik de grootte van het venster zoals die in het spel is. Dit geldt voor elk paar bases.
- **Vrije ruimte:** rond de hele base ligt een rand van minimaal **3 T** zonder `water`, `rock`, `building`, `vegetation`, gevaren of objecten. Alleen graafbaar terrein of `paved` is daar toegestaan.
- **In- en uitgang:** de openingen aan de boven- en onderkant zijn altijd vrij. Recht boven en recht onder de opening ligt een vrije strook van minimaal 3 T diep, zodat je de base makkelijk in en uit rijdt.
- Een base staat dus ook minimaal 3 T van de kaartrand.
- Een base staat niet op een dorp, weg of brug. Het terrein onder de base wordt vrijgemaakt.
- Mapspecifieke regels (bijvoorbeeld bases aan weerszijden van een rivier) staan in de mapbeschrijving.
- Lukt plaatsing na 50 pogingen niet, kies dan opnieuw. Lukt het ook dan niet (bijvoorbeeld te veel spelers op een kleine kaart), meld dat in het menu en vraag om een grotere kaart.

### 6.3 Controle

- Er moet tussen elk paar bases een route zijn die niet door `water` of `rock` gaat. `vegetation`, `building`, `ice` en `ford` tellen als passeerbaar.
- Voor maps waar het weer terrein verandert (Grebbeberg, Barbarossa, Leningrad, Koersk, Val van Berlijn): de route moet ook na alle veranderingen nog bestaan.
- Percentages binnen de marge. Zo niet: opnieuw genereren.

### 6.4 Netwerk

- De host kiest een willekeurige `seed` en stuurt die met de map-id en de kaartgrootte naar de andere spelers. Iedereen genereert dezelfde kaart uit dezelfde seed.
- Alle willekeurige gebeurtenissen tijdens het spel (ijs dat breekt, brand die overslaat, artillerievakken, droppings, depots, instortende gevels) worden door de host bepaald en verstuurd.
- Kaartwijzigingen, weer, score en rondenummer lopen bij iedereen gelijk.
- Uitzondering: woestijnhallucinaties bij El Alamein zijn per speler verschillend en worden niet gesynchroniseerd.

---

## 7. Weer

Elke map heeft een eigen **weerbeeld**. Het weer begint bij de start van het spel en kan veranderen op een timer of per ronde (2.5). Het weer kan drie dingen doen:

1. **Zicht** veranderen (de zichtstraal, hoofdstuk 9).
2. **Sporen wissen** (een sporenwisser, 7.2).
3. **Terrein** veranderen (bijvoorbeeld ijs dat smelt of grond die modder wordt).

### 7.1 Weersregels in de configuratie

Een weerregel heeft:

- `from`: vanaf wanneer hij geldt, als rondenummer (`{"round": 3}`) of als tijd (`{"secondsInGame": 300}` of `{"secondsInRound": 0}`);
- `every` en `duration` (optioneel): voor terugkerend weer, zoals een storm elke 90 seconden voor 20 seconden;
- het effect: zichtstraal, sporenwisser, onderduiken, terreinverandering.

### 7.2 Sporenwisser

Zolang een sporenwisser actief is:

- vervagen sporen op `soft` en `normal` **10× zo snel** en geldt de minimale intensiteit niet;
- wordt een tunneltegel van `soft` of `normal` die intensiteit 0 bereikt weer **ongegraven**, zodat hij opnieuw gegraven moet worden;
- blijven `paved`, `hard` en permanente gaten (begroeiing, puin) onveranderd.

Sommige sporenwissers werken alleen in een deel van de kaart, zie de mapbeschrijving.

---

## 8. Richtingshints

- Bij bepaalde gebeurtenissen licht de rand van je venster op met een **gloed** in de richting van de tegenstander.
- Alleen **8 richtingen**: boven, rechtsboven, rechts, rechtsonder, onder, linksonder, links, linksboven. De gloed bedekt het betreffende deel van de rand (een zijde of een hoek). Geen exacte plek, geen afstand.
- **Duur:** de gloed licht op en dooft in 3 seconden. Hij geeft de richting van de plek van de gebeurtenis aan, niet waar de tegenstander daarna heen rijdt.

**Geluiden** geven alleen een hint als de tegenstander binnen **20 T** van jou is (gehoorafstand):

- een tegenstander schiet;
- een tegenstander schiet begroeiing of een gebouw kapot;
- het ijs kraakt onder een tegenstander (Leningrad).

**Grote gebeurtenissen** geven over de hele kaart een hint:

- een gevaar raakt een tegenstander (geschut, artillerie, instortende gevel);
- een brug ontploft onder een tegenstander (Market Garden);
- een tegenstander wordt gevangen in een zoeklicht (Seelower Hoogten);
- het stofspoor achter een tegenstander (Barbarossa, zomer), eens per 10 seconden.

---

## 9. Fog of war en zicht

### 9.1 Basisregel

- In je venster zie je **het terrein en de sporen**: tunnels, barsten, gaten, puin.
- Een **tegenstander** zie je scherp als hij binnen je **zichtstraal** staat én er een vrije zichtlijn is.
- **Zichtstraal:** standaard **12 T** rond je tank. Binnen die straal is alles scherp.
- **Buiten de zichtstraal** wordt het beeld naar de rand van het venster toe steeds vager en donkerder. Terrein en sporen zijn daar nog vaag te herkennen. De uiterste rand van het venster is zeer vaag.
- **Schim:** staat een tegenstander buiten je zichtstraal maar wel in je venster, en is er een vrije zichtlijn, dan zie je een **schim**: een vage, donkere vlek zonder details en zonder richting van de loop. Een bedekte tank (5.7) geeft geen schim.
- **Zichtlijn:** `building` en `vegetation` blokkeren het zicht. Ligt er een gebouw of begroeiing tussen jou en een tegenstander, dan zie je hem niet, ook geen schim. Het terrein achter een gebouw of begroeiing wordt donkerder getekend.
- **Rook** blokkeert de zichtlijn ook zolang hij er hangt.

### 9.2 Weer en zicht

Het weer verkleint de zichtstraal (zie per map). Gelden er meerdere waarden tegelijk, neem dan de kleinste.

---

## 10. De maps

| # | Jaar | Missie | Map | Map-id |
| --- | --- | --- | --- | --- |
| 1 | 1940 | Fall Gelb | Grebbeberg | `fall-gelb` |
| 2 | 1941 | Barbarossa | Russische vlakte | `barbarossa` |
| 3 | 1942 | Lightfoot | El Alamein | `el-alamein` |
| 4 | 1942 | Beleg van Leningrad | Leningrad | `leningrad` |
| 5 | 1943 | Zitadelle | Koersk | `koersk` |
| 6 | 1944 | Overlord | Carentan | `carentan` |
| 7 | 1944 | Market Garden | Arnhem | `market-garden` |
| 8 | 1944 | Wacht am Rhein | Ardennen | `ardennen` |
| 9 | 1945 | Seelower Hoogten | Oder-front | `seelow` |
| 10 | 1945 | Val van Berlijn | Berlijn | `berlijn` |

### Overzicht: gevaar, schaars middel en weer

| Map | Gevaar | Schaars middel | Weer |
| --- | --- | --- | --- |
| Grebbeberg | – | Munitie (alleen bij het depot in Rhenen) | Vanaf ronde 2 stijgt het water elke ronde; ronde 3 regen |
| Barbarossa | – | Brandstof (dubbel verbruik in modder) | Ronde 1–2 zomer; vanaf ronde 3 modderseizoen |
| El Alamein | Zand dat je tank beschadigt | – | Hitte met hallucinaties; zandstorm elke 90 s |
| Leningrad | Breekbaar ijs | Motorwarmte | Sneeuwjacht elke 90 s; schemering per ronde; vanaf ronde 4 dooi |
| Koersk | Brandend graan | Motorkoeling | Zomerhitte en rook; ronde 3 onweer |
| Carentan | Verborgen antitankgeschut | – | Ronde 1 ochtendmist; daarna regenbuien |
| Market Garden | Brug die ontploft | Munitie en brandstof via droppings | Ronde 1–2 helder; vanaf ronde 3 mist en regen, geen droppings |
| Ardennen | Artilleriebarrage in het bos | Brandstofdepots, elke ronde ergens anders | Mist per ronde; sneeuwstorm elke 90 s; vanaf ronde 3 opklaring |
| Seelower Hoogten | Artilleriebarrage | – | Ronde 1–2 nacht met zoeklichten; vanaf ronde 3 dageraad |
| Val van Berlijn | Instortende gevels | Pantser (niet te herstellen) | Rook elke ronde dichter; ronde 3 regen en overstroming |

**Gevaren** zijn neutraal: ze treffen alle spelers. Een gevaar is altijd herkenbaar (vooraf zichtbaar of met een korte waarschuwing), tenzij de map iets anders zegt. Een dood door een gevaar telt niet als kill.

**Schaarse middelen:** waar "–" staat, gelden de standaardregels: in je basis vul je pantser, brandstof en munitie aan.

---

### 10.1 Fall Gelb — Grebbeberg (mei 1940)

**Sfeer:** lente, fris groen, rookpluimen in de verte. Palet: lentegroen `#6d8a3a`, bosgroen `#2f4a24`, inundatiewater `#3d5f6f`, beton `#9a9890`, zandweg `#c8b48a`. Tunnelkleur `#4a3a22`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `normal` | 39 | Weilanden |
| `soft` | 17 | Natte klei in de vallei |
| `hard` | 10 | Droge grond op de heuvel |
| `vegetation` (`tree`) | 15 | Loofbossen op de heuvel; ondergrond `hard` |
| `marsh` | 7 | Drassige stroken langs sloten |
| `rock` | 4 | Rotsen op de heuvelflank |
| `paved` | 8 | Wegen en het dorp |

Bij de start is er geen open water. Water ontstaat pas door de inundatie.

**Bijzonderheden:**

- Er loopt **geen rivier** over de kaart.
- De **vallei** (laag land) beslaat de linkerhelft, tot ongeveer 55% van links. Rechts daarvan ligt de **heuvel** met loofbossen.
- **Dorp:** de rand van Rhenen, aan de voet van de heuvel rond (0.65, 0.75).
- Een weg loopt van de linkerrand door de vallei naar het dorp en over de heuvel naar de rechterrand.

**Gevaar:** geen.

**Schaars middel — munitie:** munitie wordt **niet** in de basis aangevuld, alleen bij het munitiedepot in Rhenen. Elke ronde begint met volle munitie.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1 | Lente, helder | Zichtstraal 12 T |
| Vanaf ronde 2, elke ronde | Inundatie | Het water stijgt een fase: in ronde 2, 3 en 4 schuift het telkens een derde verder de vallei in, beginnend bij de linkerrand. `normal` wordt `marsh`, `marsh` wordt `water`. Sporen op tegels die veranderen, verdwijnen. De heuvel blijft droog en de weg door de vallei blijft begaanbaar. |
| Ronde 3 | Regen | Zichtstraal 8 T |
| Hele spel | Rook van brandende boerderijen | Donkere rookvlekken drijven over de vallei en blokkeren het zicht |

**Tanks:** ploeg A grijsgroene pantserwagen met oranje driehoek (Nederland); ploeg B donkergrijze lichte tank, alleen een nummer.

---

### 10.2 Barbarossa — Russische vlakte (zomer tot herfst 1941)

**Sfeer:** eindeloze vlakte, eerst zomers en stoffig, later grauw en modderig. Palet zomer: droog geel `#c2a868`, berk `#e8e4d8`, groen `#5f7a3a`; herfst: modder `#5a4632`. Tunnelkleur `#3e3022`.

**Terrein (zomer):**

| Klasse | % | Hier |
| --- | --- | --- |
| `hard` | 55 | Droge, harde vlakte |
| `normal` | 15 | Akkers |
| `soft` | 5 | Zandige plekken |
| `vegetation` (`birch`) | 12 | Berkenbossen; ondergrond `normal` |
| `paved` | 6 | Zandwegen en dorp |
| `rock` | 4 | Rotsblokken |
| `water` | 3 | Kleine plassen |

**Bijzonderheden:**

- Eén **zandweg** loopt horizontaal over de kaart op ongeveer 50% van de hoogte.
- **Dorp:** een rij van 5 houten boerderijtjes langs die zandweg, in het midden. Geen kruispunt.

**Gevaar:** geen.

**Schaars middel — brandstof:** in de basis vul je brandstof gewoon aan, maar zodra het modderseizoen begint, verbruik je op `soft` en `marsh` **dubbel** zoveel brandstof.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1–2 | Zomer | Zichtstraal 10 T met hittetrilling. Een tank die over `hard` rijdt, laat 2 seconden een stofwolk achter; dat geeft tegenstanders een richtingshint (eens per 10 seconden). |
| Vanaf ronde 3 | Herfstregen, modderseizoen | Aan het begin van ronde 3 worden alle `hard`- en `normal`-tegels `soft`. Zichtstraal 8 T. Geen stofspoor meer. Bestaande sporen blijven. |

**Tanks:** ploeg A groene Sovjettank met rode ster; ploeg B grijze Duitse tank, alleen een nummer.

---

### 10.3 Lightfoot — El Alamein (oktober 1942)

**Sfeer:** verblindend licht, hitte. Palet: zand `#d8bc80`, gegraven zand `#8f6c3a`, rotsige grond `#b39a6a`, rots `#9a9a96`, zee `#2f5f7a`. Tunnelkleur `#6e5430`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `soft` | 50 | Woestijnzand |
| `hard` | 20 | Rotsige grond |
| `paved` | 5 | Kustweg |
| `rock` | 10 | Rotsplateaus |
| `water` | 10 | De zee |
| `vegetation` (`shrub`) | 5 | Dorre struiken; ondergrond `soft` |

**Bijzonderheden:**

- De **zee** ligt langs de hele bovenrand, ongeveer 10% van de hoogte.
- De **kustweg** loopt direct onder de zee van links naar rechts.
- 4 tot 6 **rotsplateaus** verspreid over de kaart.
- De **rotsige grond** (`hard`) ligt in stroken en vlakken verspreid, zodat er altijd een route is waarop je regelmatig van het zand af kunt.
- Geen dorp.

**Gevaar — zand:** te lang door zand rijden beschadigt je tank, waardoor je steeds naar harde grond of de weg moet.

- Elke tank heeft een **zandmeter** (0 tot 100), zichtbaar op het rapportkaartje.
- Elke tegel `soft` die je graaft of berijdt: +2.
- Elke tegel `hard` of `paved`: −5.
- Boven 60 verlies je per extra `soft`-tegel 1% pantser.
- Bij 100 rijdt de tank bovendien 30% langzamer tot de meter weer onder 60 is.

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Hele spel | Hitte | Zichtstraal 10 T; de buitenste ring van het venster trilt. **Woestijnhallucinaties:** in het deel van je venster buiten je zichtstraal verschijnt gemiddeld eens per 15 seconden een **valse schim** die er precies uitziet als die van een tegenstander. Hij blijft 2 tot 4 seconden staan en laat geen sporen achter. Valse schimmen zijn per speler verschillend. |
| Elke 90 seconden, 20 seconden lang | Zandstorm | Zichtstraal 4 T. Sporenwisser. Onderduiken (5.7). |

**Tanks:** ploeg A Britse tank in lichte zandkleur met grijsblauwe hoekige camouflage; ploeg B zandgele Duitse tank, alleen een nummer.

---

### 10.4 Beleg van Leningrad — Leningrad (winter 1942)

**Sfeer:** bitterkoud, kort daglicht, blauwige schemering. Palet: ijs `#a9c7d6`, sneeuw `#e6ecef`, water `#1e2e38`, veen `#4a3a2e`, rots `#8a8f94`. Tunnelkleur `#3a2f27`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `soft` | 46 | Sneeuw op aarde |
| `hard` | 15 | Bevroren veen |
| `ice` | 12 | De bevroren Neva |
| `rock` | 8 | Steile oever en ruïnes |
| `vegetation` (`birch`) | 12 | Berkenbossen; ondergrond `soft` |
| `paved` | 5 | Weg en brug |
| `water` | 2 | Wakken in het ijs |

**Bijzonderheden:**

- De **Neva** loopt horizontaal over de kaart op ongeveer 45% van de hoogte, 5 T breed, bevroren (`ice`).
- Langs de noordoever een **steile oever** (`rock`, 1 T dik) over de hele lengte, met 3 openingen van 3 T breed waar je de rivier op kunt.
- **1 brug** over de Neva, op ongeveer 70% van links, met een weg die aan beide kanten doorloopt.
- **Ruïnes:** 3 tot 4 groepjes gebroken muren (`rock`) ten zuiden van de rivier.
- 2 kleine wakken (`water`) in het ijs.

**Gevaar — ijs:** zie 5.6.

**Schaars middel — motorwarmte:**

- Elke tank heeft een **warmtemeter** (0 tot 100), zichtbaar op het rapportkaartje.
- Stilstaan of langzaam rijden (onder 30% van de maximale snelheid): −5 per seconde.
- Gewoon rijden of in de eigen basis staan: +10 per seconde.
- Bij 0 is de motor **bevroren**: de tank komt maar heel langzaam op gang. Hij heeft 4 seconden nodig om op normale snelheid te komen, in plaats van direct. In die tijd is hij een makkelijk doelwit.
- Vanaf de dooi vervalt deze regel.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Elke ronde | Winterschemering | Zichtstraal van 12 T aan het begin van de ronde naar 6 T na 3 minuten |
| Elke 90 seconden, 20 seconden lang, tot de dooi | Sneeuwjacht | Zichtstraal 4 T. Sporenwisser. Onderduiken (5.7). |
| Vanaf ronde 4 | Dooi | Aan het begin van ronde 4 wordt alle `ice` `water`. De brug blijft de enige oversteek. Er ontstaan 4 tot 6 extra plassen (`water`, elk ongeveer 2×2 T) op `soft`-terrein. Geen sneeuwjacht en geen motorwarmte meer. |

**Tanks:** ploeg A groene Sovjettank met witte wintervlekken en rode ster; ploeg B donkergrijze Duitse tank, alleen een nummer.

---

### 10.5 Zitadelle — Koersk (juli 1943)

**Sfeer:** heet, stoffig, fel zonlicht. Palet: graan `#b89a4a`, zwarte aarde `#3e3022`, steppe `#a89060`, rots `#8d8f8c`, rivier `#3d5a66`. Tunnelkleur `#2e2418`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `normal` | 45 | Graanvelden |
| `hard` | 15 | Droge steppe |
| `soft` | 12 | Zwarte aarde |
| `paved` | 6 | Loopgraven |
| `rock` | 8 | Balka's (ravijnen) |
| `vegetation` (`tree`) | 8 | Bosjes; ondergrond `normal` |
| `water` | 6 | De Psel |

**Bijzonderheden:**

- De rivier de **Psel** loopt diagonaal door de rechterbovenhoek, van ongeveer (0.6, 0) naar (1, 0.4), 3 T breed. **1 brug**.
- **Loopgraven:** 3 zigzaggende lijnen van elk ongeveer een halve kaartbreedte, 2 T breed. Ze zijn snel en laten weinig spoor achter, maar zijn voor iedereen zichtbaar.
- **Balka's:** 2 tot 3 lange, smalle ravijnen (`rock`) die je moet omrijden.
- Geen dorp.

**Gevaar — brandend graan:**

- Een schot dat op `normal` (graan) landt, heeft 10% kans het graan aan te steken. Daarnaast ontstaat zolang het zomer is elke 2 minuten op een willekeurige plek een brand.
- Vuur verspreidt zich elke seconde naar 1 aangrenzende `normal`-tegel, in de windrichting van dat spel, en dooft na 15 seconden.
- Een tank in een brandende tegel verliest 5% pantser per seconde.
- Verbrande tegels worden `hard` met een zwarte kleur. Bestaande sporen daarop verdwijnen, maar **nieuwe sporen op verbrande grond krijgen intensiteit 1.0**: ze vallen juist extra op.

**Schaars middel — motorkoeling:**

- Elke tank heeft een **temperatuurmeter** (0 tot 100), zichtbaar op het rapportkaartje.
- Rijden op meer dan 80% van de maximale snelheid: +4 per seconde. In een brandende tegel: +15 per seconde.
- Langzamer rijden of stilstaan: −6 per seconde. In de eigen basis: −20 per seconde.
- Bij 100 is de motor oververhit: maximaal 40% snelheid tot de meter onder 50 is.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1–2 | Zomerhitte | Zichtstraal 12 T. Branden en rook: elk vuurgevecht en elke brand laat een rookvlek achter die 20 seconden blijft hangen en het zicht blokkeert. |
| Vanaf ronde 3 | Onweer | Alle branden doven en er ontstaan geen spontane branden meer; schoten kunnen nog wel graan aansteken, met 3% kans. De rook trekt weg. Alle zwarte aarde (`soft`) wordt `marsh`. Zichtstraal 8 T. |

**Tanks:** ploeg A groene Sovjettank met rode ster; ploeg B zandgele Duitse tank met bruine en groene strepen, alleen een nummer.

---

### 10.6 Overlord — Carentan (juni 1944)

**Sfeer:** groen, vochtig, bewolkt met zon die doorbreekt. Palet: weide `#56702f`, heg `#23381b`, moeras `#55696c`, steen `#8c8a80`, water `#1f3440`. Tunnelkleur `#4a3a22`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `normal` | 40 | Weilanden |
| `marsh` | 15 | Moeras |
| `vegetation` (`hedge`) | 15 | Heggen; ondergrond `normal` |
| `paved` | 8 | Wegen en dorpsstraten |
| `hard` | 7 | Dijkweg |
| `soft` | 5 | Modder rond het moeras |
| `water` | 6 | Rivier en kanaal |
| `rock` | 4 | Rotsen |

**Bijzonderheden:**

- **Heggen** (1 T breed) vormen een raster van kleine weilanden: de bocage. Lange rechte lijnen met gaten van 2 T op willekeurige plekken.
- Het **moeras** ligt in de linkeronderhoek, ongeveer een kwart van de kaart.
- De **rivier** (Douve) loopt langs de onderrand van links naar ongeveer 60%, 3 T breed.
- Een **kanaal** loopt verticaal door het moeras, 2 T breed.
- Een **dijkweg** (`hard`, 2 T breed) loopt van de linkerrand dwars over het moeras naar het dorp. Waar de dijkweg het kanaal kruist: **1 brug**.
- **Dorp:** Carentan, in de rechterbovenhoek rond (0.75, 0.25): stenen huizen rond een kruispunt met een kerk. Het dorp is **aan alle kanten omgeven door de bocage**: wie het dorp in of uit wil, moet door het heggenraster, via een gat of een weg.

**Gevaar — verborgen antitankgeschut:** 2 stukken geschut achter een heg, onzichtbaar tot ze vuren (een uitzondering op de regel dat een gevaar altijd herkenbaar is). Schootsveld: kegel van 45° en 10 T lang. Ze vuren eens per 4 seconden op een tank in hun schootsveld, 25% pantser per treffer. Na het eerste schot zichtbaar en uit te schakelen met 4 treffers. Uitgeschakeld geschut blijft het hele spel uitgeschakeld.

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1 | Ochtendmist | Zichtstraal 4 T |
| Vanaf ronde 2 | Wisselend bewolkt | Zichtstraal 12 T |
| Vanaf ronde 2, elke 2 minuten, 20 seconden lang | Regenbui | Zichtstraal 8 T. Sporenwisser, maar alleen op tegels binnen 3 T van moeras of water. |

**Tanks:** ploeg A olijfgroene Amerikaanse tank met witte ster en takken als camouflage; ploeg B gele Duitse tank met groene en bruine vlekken, alleen een nummer.

---

### 10.7 Market Garden — Arnhem (september 1944)

**Sfeer:** nazomer, Hollands polderlandschap, rook boven de stad. Palet: gras `#6a8a3a`, klei `#6b5a3e`, dijk `#9a8a5a`, rivier `#3a5a6a`, baksteen `#8a5a46`. Tunnelkleur `#4a3a22`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `normal` | 40 | Polders |
| `soft` | 12 | Natte klei |
| `hard` | 10 | Dijken |
| `water` | 12 | De Rijn en sloten |
| `paved` | 8 | Wegen, brug en stad |
| `vegetation` (`tree`) | 10 | Bomenrijen en boomgaarden; ondergrond `normal` |
| `marsh` | 5 | Uiterwaarden |
| `rock` | 3 | Rotsen |

**Bijzonderheden:**

- De **Rijn** loopt horizontaal over de hele kaart op ongeveer 40% van de hoogte, 5 T breed.
- **1 brug** over de Rijn, ongeveer in het midden, minimaal 3 T breed.
- **Doorwaadbare plekken** (`ford`, 3 T breed) door de Rijn: klein 1, middel 2, groot en extra groot 3. Ze liggen verspreid langs de rivier, niet bij de brug.
- Langs beide oevers een **dijk** (`hard`, 2 T breed) over de hele lengte, met uiterwaarden (`marsh`) tussen dijk en rivier.
- **Sloten** (`water`, 1 T breed) in een raster door de polders ten zuiden van de rivier, met dammen (`normal`) van 2 T om de paar sloten.
- **Dorp:** Arnhem, aan het noordelijke bruggenhoofd.
- **Bases:** bij 2 spelers altijd één base ten noorden en één ten zuiden van de Rijn. Bij meer spelers verdeeld over beide kanten.

**Gevaar — de brug ontploft:**

- Zodra een tank over de brug rijdt, ontploft hij. De tank verliest 40% pantser, maar haalt de overkant.
- Daarna is de brug de rest van de ronde onbegaanbaar (`water`, met een zichtbaar wrak).
- Aan het begin van de volgende ronde is de brug weer heel.
- De explosie geeft alle andere spelers een richtingshint.

**Schaars middel — munitie en brandstof via droppings:**

- Munitie en brandstof worden **niet** in de basis aangevuld. Pantser wel.
- Elke 30 seconden valt er een krat aan een parachute op een willekeurige plek op de kaart, met munitie of brandstof. De krat is te zien zodra hij in je venster valt. Wie eroverheen rijdt, krijgt de inhoud.
- Kratten kunnen ook vlak bij een tegenstander of zijn basis vallen.
- Elke ronde begint met volle munitie en brandstof.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1–2 | Helder | Zichtstraal 12 T. Droppings. Rook boven de stad: rond het dorp drijven rookvlekken die het zicht blokkeren. |
| Vanaf ronde 3 | Mist en regen | Zichtstraal 8 T. **Geen droppings meer**: alleen de kratten die al liggen. |

**Tanks:** ploeg A olijfgroene Britse tank met witte ster; ploeg B grijze Duitse tank, alleen een nummer.

---

### 10.8 Wacht am Rhein — Ardennen (december 1944)

**Sfeer:** koud, stil, grijs licht. Palet: sneeuw `#dfe6ea`, ijsblauw `#9cc3e0`, dennengroen `#1f3a2a`, hout `#6a4a2c`, rots `#8d9196`, beek `#1e3a4a`. Tunnelkleur `#2b2118`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `soft` | 52 | Verse sneeuw |
| `hard` | 12 | Bevroren grond |
| `vegetation` (`pine`) | 18 | Dennenbossen; ondergrond `soft` |
| `paved` | 8 | Bosweggen en Bastogne |
| `rock` | 6 | Rotsblokken |
| `water` | 4 | Bergbeek |

**Bijzonderheden:**

- **Dorp: Bastogne** in het midden van de kaart, rond (0.5, 0.5). Groter dan de standaardmodule: ongeveer een zesde van de kaart. Een plein met kerk en 6 tot 8 huizen langs de uitvalswegen.
- **5 bosweggen** komen samen in Bastogne en lopen naar de rand: west, noord, oost, zuidwest en zuidoost. Elke weg minimaal 2 T breed.
- Een **bergbeek** loopt horizontaal over de zuidkant van de kaart, op ongeveer 80% van de hoogte, 2 T breed.
- **2 bruggen** over de beek: waar de zuidwestelijke en de zuidoostelijke weg de beek kruisen.

**Gevaar — artilleriebarrage in het bos:**

- Elke 20 seconden wordt een willekeurig stuk bos van ongeveer 6×6 T beschoten.
- 2 seconden van tevoren is het gebied te herkennen aan een fluitend geluid en trillende boomtoppen.
- Granaten ontploffen in de boomtoppen. Een tank in of direct naast (binnen 1 T van) bos in dat gebied verliest 15% pantser.
- Er blijven kapotte boomtoppen liggen als permanent spoor.

**Schaars middel — brandstofdepots:**

- In de basis vul je brandstof gewoon aan, maar de basis ligt vaak ver weg.
- Elke ronde liggen er **2 brandstofdepots** op een **nieuwe willekeurige plek**. Op groot en extra groot: 3.
- Elk depot heeft één vulling. Wie hem gebruikt, maakt het depot leeg; een leeg depot blijft zichtbaar.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1–2, aan het begin van elke ronde | Dichte mist | Zichtstraal 2 T, die in 2 minuten optrekt naar 12 T |
| Elke 90 seconden, 20 seconden lang | Sneeuwstorm | Zichtstraal 4 T. Sporenwisser. Onderduiken (5.7). |
| Vanaf ronde 3 | Opklaring | Geen mist meer; de sneeuwstormen blijven |

**Tanks:** ploeg A olijfgroene Amerikaanse tank met witte ster en witte wintervlekken; ploeg B witgekalkte Duitse tank, alleen nummer 332.

---

### 10.9 Seelower Hoogten — Oder-front (april 1945)

**Sfeer:** nacht, koud, zoeklichten en lichtflitsen. Palet (donker): moeras `#2e3a36`, aarde `#3a3026`, heuvel `#4a4238`, rots `#5a5c5e`, water `#18242c`. Tunnelkleur `#1a1410`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `soft` | 30 | Natte aarde in het Oderdal |
| `marsh` | 15 | Moeras in het dal |
| `hard` | 20 | Heuvelrug |
| `normal` | 10 | Akkers |
| `rock` | 10 | Steile helling |
| `vegetation` (`tree`) | 5 | Bosjes op de heuvel; ondergrond `hard` |
| `water` | 6 | De Oder en een kanaal |
| `paved` | 4 | Wegen |

**Bijzonderheden:**

- De **Oder** loopt verticaal langs de rechterrand, ongeveer 8% van de breedte.
- Het **Oderdal** (moeras en natte aarde) beslaat de rechterhelft.
- De **heuvelrug** beslaat het linkerderde. Op de grens loopt een **steile helling** (`rock`) van boven naar beneden, met 3 openingen van 3 T breed.
- Een **kanaal** loopt verticaal door het midden van het dal, 2 T breed, met **2 bruggen**.
- Geen dorp.

**Gevaar — artilleriebarrage:** elke 60 seconden licht een willekeurig vak van 6×6 T op de kaart op. Na 3 seconden wordt het beschoten: een tank in dat vak verliest 30% pantser. Daarna liggen er kraters (`soft`).

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1–2 | Nacht met zoeklichten | Zichtstraal 4 T. **Zoeklichten:** 3 bundels vanaf de rechterrand zwaaien heen en weer over de kaart (elke bundel een strook van 4 T breed, één zwaai per 12 seconden). Waar een bundel langskomt, worden alle **sporen** 1 seconde lang op volle intensiteit getekend, voor iedereen. In een bundel is je zichtstraal 12 T. Wordt de tank van een tegenstander gevangen in een bundel, dan krijg je een **richtingshint**, waar je ook bent. De tank zelf wordt niet zichtbaar, tenzij hij binnen je zichtstraal staat. |
| Vanaf ronde 3 | Dageraad | Zichtstraal 8 T. De zoeklichten gaan uit. |

**Tanks:** ploeg A groene Sovjettank met rode ster; ploeg B grijze Duitse tank, alleen een nummer.

---

### 10.10 Val van Berlijn — Berlijn (april–mei 1945)

**Sfeer:** stad in puin, rook, stof. Palet: straat `#7a7670`, gebouw `#8c8a86`, puin `#9a8f80`, park `#4a5a3a`, water `#2a3a44`. Tunnelkleur `#2a2420`.

**Terrein:**

| Klasse | % | Hier |
| --- | --- | --- |
| `paved` | 30 | Straten en pleinen |
| `building` | 30 | Huizenblokken |
| `soft` | 15 | Puin |
| `normal` | 8 | Parken |
| `vegetation` (`tree`) | 5 | Parkbomen; ondergrond `normal` |
| `water` | 7 | De Spree en het Landwehrkanaal |
| `rock` | 5 | Betonnen bunkers |

**Bijzonderheden:**

- De hele kaart is **stad**: een raster van huizenblokken met straten van minimaal 2 T breed. Geen dorpsmodule.
- De **Spree** loopt horizontaal op ongeveer 35% van de hoogte, 3 T breed, met **2 bruggen**.
- Het **Landwehrkanaal** loopt horizontaal op ongeveer 70% van de hoogte, 2 T breed, met **2 bruggen**.
- **1 park** (Tiergarten) van ongeveer 15% van de kaart, links van het midden.
- **Metro:** een vooraf gegraven tunnelnetwerk van 2 lijnen (één horizontaal, één verticaal) met **4 stations**. Metrotunnels zijn voor iedereen zichtbaar als gestippelde lijnen, rijden op volle snelheid zonder brandstofkosten en laten geen nieuwe sporen achter. Je kunt alleen in en uit bij een station. Wie de metro verlaat, graaft vanaf het station een nieuwe tunnel; stations zijn dus de plek om te bewaken.

**Gevaar — instortende gevels:**

- Wie op een tegel direct naast een gebouw rijdt of staat, heeft elke seconde **5% kans** dat er een gevel naar beneden komt: 10% pantser.
- Wie **tegen een gebouw aan rijdt**, laat de gevel zeker instorten: 25% pantser.
- Een gebouw dat 3 treffers heeft gehad, stort na 3 seconden helemaal in. Een tank op een aangrenzende tegel verliest 25% pantser.
- Een instorting laat puin (`soft`) achter dat een straat of tunnel kan afsluiten, en geeft een richtingshint.

**Schaars middel — pantser:** pantser wordt tijdens een ronde **niet** hersteld, ook niet in de basis. Aan het begin van elke ronde heeft iedereen weer vol pantser. Brandstof en munitie vul je gewoon aan in de basis.

**Weer:**

| Wanneer | Weer | Effect |
| --- | --- | --- |
| Ronde 1 | Rook boven de stad | Zichtstraal 12 T |
| Ronde 2 | Dichtere rook | Zichtstraal 8 T |
| Vanaf ronde 3 | Dikke rook en regen | Zichtstraal 6 T. Aan het begin van ronde 3 loopt de horizontale metrolijn onder water: die lijn wordt `water` (onbegaanbaar). |
| Hele spel | Stof | Na een instorting hangt er 10 seconden een stofwolk die het zicht blokkeert |

**Tanks:** ploeg A groene Sovjettank met rode ster; ploeg B grijze Duitse tank, alleen een nummer.

---

## 11. Mapconfiguratie

Elke map is een configuratiebestand. Voorbeeld (verkort):

```json
{
  "id": "ardennen",
  "year": 1944,
  "mission": "Wacht am Rhein",
  "name": "Ardennen",
  "header": "BLITZKRIEG — WACHT AM RHEIN — ARDENNEN · DECEMBER 1944",
  "terrainPercent": { "soft": 52, "hard": 12, "vegetation": 18, "paved": 8, "rock": 6, "water": 4 },
  "vegetationType": "pine",
  "vegetationGround": "soft",
  "colors": { "soft": "#dfe6ea", "hard": "#bccfda", "paved": "#9b9184", "rock": "#8d9196", "water": "#1e3a4a", "tunnel": "#2b2118" },
  "features": [
    { "type": "village", "at": [0.5, 0.5], "size": 0.17, "name": "Bastogne" },
    { "type": "road", "from": [0.5, 0.5], "to": [0.0, 0.5], "width": 2 },
    { "type": "road", "from": [0.5, 0.5], "to": [0.5, 0.0], "width": 2 },
    { "type": "road", "from": [0.5, 0.5], "to": [1.0, 0.5], "width": 2 },
    { "type": "road", "from": [0.5, 0.5], "to": [0.15, 1.0], "width": 2 },
    { "type": "road", "from": [0.5, 0.5], "to": [0.85, 1.0], "width": 2 },
    { "type": "river", "from": [0.0, 0.8], "to": [1.0, 0.8], "width": 2, "frozen": false, "bridges": "atRoads" }
  ],
  "hazard": { "type": "forestBarrage", "everySeconds": 20, "area": 6, "warningSeconds": 2, "armorLoss": 0.15 },
  "scarce": { "type": "fuelDepots", "count": { "small": 2, "medium": 2, "large": 3, "xlarge": 3 }, "relocateEachRound": true, "fillsPerDepot": 1 },
  "weather": [
    { "from": { "secondsInRound": 0 }, "untilRound": 2, "effect": { "visibility": { "start": 2, "end": 12, "overSeconds": 120 } } },
    { "from": { "secondsInGame": 0 }, "every": 90, "duration": 20, "effect": { "visibility": 4, "trackEraser": true, "burial": true } },
    { "from": { "round": 3 }, "effect": { "fog": false } }
  ],
  "tanks": { "A": "sherman-winter", "B": "kingtiger-white-332" }
}
```

---

## 12. Acceptatiecriteria

1. Het spel heet overal **BLITZKRIEG**.
2. Bovenaan staan een pull-down menu met de 10 maps in chronologische volgorde en een menu voor de kaartgrootte. De keuzes van de host worden naar de andere spelers gestuurd.
3. Bij 2 spelers wint wie als eerste 3 rondes wint; bij meer spelers wie als eerste 5 kills heeft. Na elke dood begint iedereen weer in zijn basis, met vol pantser, brandstof en munitie.
4. De kaart wordt één keer per spel gegenereerd en blijft het hele spel dezelfde.
5. Alle tanks hebben dezelfde eigenschappen; alleen het uiterlijk verschilt per map.
6. Per map komen de terreinpercentages binnen ±3 procentpunt uit, en alle vaste kenmerken staan op de beschreven plek, op elke kaartgrootte.
7. Wegen zijn minimaal 2 T, bruggen minimaal 3 T, heggen 1 T en bossen tussen 1 en 5 T breed.
8. Bases worden als eerste geplaatst, willekeurig, en de kaart wordt eromheen gemaakt. Vanuit je eigen base en binnen 3 T eromheen is geen andere base in je venster te zien. Rond elke base ligt 3 T vrije ruimte met een vrije in- en uitgang aan boven- en onderkant. Er is altijd een route tussen elk paar bases, ook na veranderingen door het weer.
9. Hard terrein geeft lichte sporen, zacht terrein duidelijke tunnels; sporen vervagen volgens de tabel. Op ijs zijn alleen barsten te zien.
10. Kogels vliegen over de grond en over water heen, graven niet, en stoppen pas bij een tank, begroeiing, gebouw, rots of object.
11. Bij een sneeuwstorm, zandstorm of sneeuwjacht raakt een tank die 2 seconden stilstaat bedekt en is hij onzichtbaar voor tegenstanders tot hij rijdt of schiet.
12. Zakt een tank door het ijs, dan verliest hij langzaam pantser, kan hij heel langzaam uit het wak rijden, en gaat hij dood als hij erin blijft.
13. Een tegenstander is alleen scherp zichtbaar binnen de zichtstraal bij een vrije zichtlijn; daarbuiten in je venster als schim. Gebouwen, begroeiing en rook blokkeren het zicht. Bij El Alamein verschijnen valse schimmen.
14. Elke map heeft het gevaar, het schaarse middel en het weer zoals beschreven, en het weer verandert op de juiste ronde of timer.
15. Richtingshints verschijnen als gloed aan de rand van het scherm in een van 8 richtingen; geluiden alleen binnen 20 T.
16. Iedereen ziet op elk moment dezelfde kaarttoestand, hetzelfde weer, dezelfde score en hetzelfde rondenummer.

## 13. Testen

- Unittests: snelheid en brandstof per klasse, vervaging van sporen, sporenwisser, onderduiken na 2 seconden, levenspunten van begroeiing en gebouwen, kogelbaan, kans op breken van ijs en pantserverlies in een wak, de meters (zand, warmte, temperatuur), basisplaatsing (afstand, vrije ruimte, in- en uitgang), zichtlijn, zichtstraal en schim, gehoorafstand van hints, routecontrole, score en einde van een spel.
- Weertest: speel per map een spel van 5 rondes met een snelle klok en controleer dat elke weersverandering op de juiste ronde of tijd begint.
- Generatietest: genereer elke map 100 keer met verschillende seeds, op alle vier de kaartgroottes en met 2, 3 en 4 spelers, en controleer percentages, bruggen, doorwaadbare plekken, bases en routes.
- Een debugoptie om de hele kaart zichtbaar te maken (alleen in ontwikkeling).

## 14. Bouwvolgorde (voorstel)

1. Hernoemen, mapmenu en kaartgrootte.
2. Spel- en rondelogica met score.
3. Terreinklassen, sporen en vervaging.
4. Kaartgeneratie met basisplaatsing, eerst voor de Ardennen.
5. Begroeiing, gebouwen en dorpsmodule.
6. Fog of war, schim en richtingshints.
7. Het weersysteem, met gevaar en schaars middel voor de Ardennen.
8. De overige maps één voor één.

## 15. Open vragen (eerst navragen of de voorgestelde keuze aanhouden)

1. **Sporen tussen rondes:** de map blijft het hele spel dezelfde. Blijven de tunnels en sporen van een vorige ronde ook liggen? Voorstel: ja, maar dan ken je vanaf ronde 2 al veel routes van je tegenstander. Alternatief: tunnels worden aan het begin van elke ronde weer dichtgemaakt, terwijl blijvende veranderingen (weggeschoten bos, puin, gebroken ijs, weer) wel blijven.
2. **Aantal spelers:** wat is het maximum? En op welke kaartgrootte past dat nog, gezien de regel dat je geen andere base mag kunnen zien?
3. **Mapkeuze:** mag alleen de host de map en de grootte kiezen?
4. **Gehoorafstand en kaartgrootte:** blijft 20 T gelijk op een extra grote kaart?
5. **Meer dan 2 spelers en ploegen:** het uiterlijk van de tanks gaat uit van ploeg A en B. Hoe zien de tanks eruit bij meer spelers?
