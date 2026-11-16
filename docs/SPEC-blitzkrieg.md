# Specificatie: Blitzkrieg

Tankspel voor 2–4 spelers in het lokale netwerk of via internet, gebaseerd op Tunneler. Tien
maps uit de Tweede Wereldoorlog, elk met eigen terrein, gevaar, schaars middel en weer. Dit
document is de enige spelspecificatie; de code en tests verwijzen ernaar. De code is leidend
bij afwijkingen.

---

## §1. Overzicht

Spelers graven zich met een tank door de grond en zoeken elkaar. Je ziet een tegenstander pas
als hij binnen je zichtcirkel komt (§7). Daarvoor zoek je hem aan de hand van sporen: tunnels,
bandensporen, barsten in het ijs, weggeschoten begroeiing en puin. Buiten je zichtcirkel kun je
een tank in je kijkboog gewoon zien; daarbuiten krijg je een richtingshint (§8): een gloed aan
de rand van je scherm die alleen een richting aangeeft.

---

## §2. Spel, ronde en winnen

### 2.1 Begrippen

- **Spel:** een reeks rondes op één map, tot er een winnaar is.
- **Ronde:** begint met alle spelers in hun eigen basis; eindigt zodra er een dode is
  (2 spelers), zodra er maar één leeft (3–4 FFA), of beide spelers van een team dood zijn
  (teams).

### 2.2 Winnen

| Modus | Winnaar |
|---|---|
| 2 spelers | Wie als eerste **3 rondes** wint (instelbaar). |
| 3–4 spelers, ieder voor zich | Wie als eerste **3 kills** heeft (instelbaar; dezelfde lobby-instelling als rondes). |
| 4 spelers, teams (2v2) | Het team dat als eerste **3 rondes** wint (instelbaar). |

- **Kill:** jouw treffer brengt een tegenstander op 0 pantser.
- Een dood door een gevaar telt voor niemand als kill.
- Bij 2 spelers: gaan beide tegelijk dood, dan wint niemand de ronde.

### 2.3 Na een dood

Iedereen begint weer in zijn eigen basis met vol pantser, volle brandstof en volle munitie,
tenzij de map iets anders bepaalt. De score blijft over de rondes staan.

### 2.4 De map tijdens een spel

- De kaart wordt **één keer** gegenereerd bij het begin van een spel.
- Tunnels, sporen en kaartveranderingen blijven tussen rondes liggen.
- Uitzondering: de brug bij Market Garden wordt elke ronde hersteld (de ontploffingsteller
  loopt wel door).

---

## §3. Wachtkamer en spelermodus

### 3.1 De host kiest

Wie als eerste binnenkomt is de host. In de wachtkamer kiest de host:

- **Map:** 10 maps in chronologische volgorde. Maps die nog niet bestaan staan grijs.
- **Kaartgrootte:** klein (max. 2 spelers), middel, groot, extra groot.
- **Aantal spelers:** 2, 3 of 4 (begrensd door de kaartgrootte).
- **Modus:** ieder voor zich (FFA) of teams (2v2, alleen bij 4 spelers). Bij teams spawnen
  twee spelers in dezelfde basis.
- **Rondes/kills om te winnen** (dezelfde instelling: standaard 3).
- **Minikaart:** aan of uit. Bij Tunneler-maps standaard uit.
- **Zicht-overlay:** mist, schaduw en vervaging aan of uit (de zichtregel blijft altijd gelden).
- **Stormfrequentie, gevaren, brandstof/schild/munitie-multiplier** (extra lobby-instellingen).

Gasten zien alleen de titel, die meeloopt met wat de host kiest. Na START ziet ook de host
alleen de titel.

### 3.2 STOP-knop

Naast volledig scherm, alleen tijdens een spel:
- **Host:** iedereen terug naar de wachtkamer.
- **Gast:** verlaat het spel, de rest speelt door. De knop wordt "opnieuw meedoen".

### 3.3 Kaartgrootte

| Grootte | Factor t.o.v. middel |
|---|---|
| Klein | 0,75× |
| Middel | 1× |
| Groot | 1,5× |
| Extra groot | 2× |

Posities van vaste kenmerken zijn fracties van de kaart en schalen mee. Breedtes in T (wegen,
bruggen, tunnels, ruimte rond een basis) schalen **niet** mee. Percentages en aantallen blijven
gelijk.

---

## §4. Tanks

### 4.1 Eigenschappen

Alle tanks hebben **exact dezelfde eigenschappen**: snelheid, pantser, brandstof, munitie,
vuursnelheid. Per map verschilt alleen het uiterlijk.

### 4.2 De vijf tanks

| Naam | Land |
|---|---|
| Landsverk L-60 | Nederland |
| T-34/76 | Sovjet-Unie |
| Panther Ausf. G | Duitsland |
| M4A1 Sherman | Verenigde Staten |
| A34 Comet | Verenigd Koninkrijk |

Geen embleem of nummer op de tanksprite. Elke tank ziet er op elke map en in elke stijl
hetzelfde uit: geen aparte winter- of woestijnvariant. Ploeg C en D zijn donkerdere varianten
van A en B.

### 4.3 Tanks per map

| Map | Ploeg A | Ploeg B |
|---|---|---|
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

### 4.4 Weergave

Romp + twee rupsbanden die meeschuiven met het rijden. Bij draaien op de plaats schuiven de
rupsen tegen elkaar in. Geen emblemen of nummers op de tanksprite.

### 4.5 Basis

In je eigen basis vul je pantser, brandstof en munitie aan, tenzij de map iets anders bepaalt
(§10).

### 4.6 Zelfvernietiging

K = zelfvernietiging. De tank is dood; telt voor niemand als kill.

---

## §5. Terrein

### 5.1 Maten

Alle breedtes in **T** = de breedte van een tank (5 cellen).

| Element | Breedte |
|---|---|
| Gegraven tunnel | ca. 1,5 T |
| Weg, straat, dijk | minimaal 2 T |
| Brug | minimaal 3 T |
| Doorwaadbare plek | 3 T |
| Rivier | 3–5 T, tenzij anders vermeld |
| Beek of kanaal | 2–3 T |
| Heg | 1 T |
| Bos | 1–5 T breed; losse bossen minstens 2 cellen uit elkaar |

### 5.2 Terreinklassen

Kernregel: hoe harder de grond, hoe sneller je rijdt en hoe minder spoor. Hoe zachter, hoe
trager en hoe duidelijker de tunnel.

| Klasse | Rijsnelheid | Brandstof | Begin-spoorintensiteit | Vervaging/s | Min. intensiteit |
|---|---|---|---|---|---|
| verhard (weg, brug) | 1,00 | 1 | 0,10 | 0,020 | 0,00 |
| hard (bevroren/droog, dijk) | 0,80 | 2 | 0,35 | 0,008 | 0,10 |
| normaal (gras, graan) | 0,65 | 2 | 0,80 | 0,003 | 0,40 |
| zacht (zand, sneeuw, modder, puin) | 0,45 | 3 | 1,00 | 0,001 | 0,60 |
| moeras | 0,30 | 4 | 0,60 | 0,100 | 0,00 |
| doorwaadbaar | 0,25 | 3 | 0,60 | 0,100 | 0,00 |
| ijs | 1,00 | 1 | alleen barsten | – | – |
| begroeiing | 0 (tot weggeschoten) | – | – | – | – |
| gebouw | 0 (tot kapotgeschoten) | – | – | – | – |
| rots | 0 (onbegaanbaar) | – | – | – | – |
| water | 0 (onbegaanbaar) | – | – | – | – |

**Regels:**

1. Rijsnelheid is een vermenigvuldiger op de maximale tanksnelheid, bij het graven door een
   ongegraven tegel.
2. **Bestaande tunnel:** snelheid 1,00, kost 1 brandstof.
3. **Spoor:** bij het binnenrijden wordt de spoorintensiteit gelijk aan de beginwaarde van de
   klasse. Opnieuw rijden over een tunneltegel zet hem terug.
4. **Vervaging:** de intensiteit daalt per seconde, maar niet onder het minimum, behalve tijdens
   een sporenwisser (§9.2).
5. **Moeras en doorwaadbaar:** geen tunnel, alleen rimpelingen die snel verdwijnen. De tegel
   blijft wat hij was.
6. **Rots en water:** onbegaanbaar, niet te vernietigen. Kogels stoppen op rots maar vliegen
   over water.

### 5.3 Begroeiing

| Type | Schoten nodig |
|---|---|
| den, loof, berk | 2 |
| heg | 3 |
| struik | 1 |

- Bossen staan altijd als samenhangend vlak, nooit los.
- Heggen zijn precies 1 T breed en lopen als een lijn.
- Een weggeschoten plant ruimt alles binnen 4 cellen op (`FELL.clearRadius`), zodat een tank
  erdoor past.
- Boomkruinen zijn 7–10 cellen; ze hangen hoogstens `OBJECTS.overhang` cel over open grond.

### 5.4 Gebouwen

- 4 schoten om kapot te schieten → puin (zacht, berijdbaar).
- Drie stadia: heel, half, puin.
- Huizen zijn groter dan een tank: grondvlakken in `BUILDINGS.footprints` (~1,7× de tekening).
  Woonhuis 10×10, rijhuis 20×8, boerderij 19×17, kerk 14×26 (in een krap dorp dwars).
- Huizen en kerken staan nooit op een weg of dijk; in een dorp ook niet pal ertegen.
- Dorpshuizen tellen niet mee in de terreinpercentages.

### 5.5 Dorpsmodule

Een dorp met een plein of kruispunt, een kerk, 4–8 gebouwen en straten die aansluiten op de
wegen. Standaard ~10% van de kaart. Afwijkingen per map vermeld. Een dorp kan per kaartgrootte
een eigen maat hebben.

### 5.6 IJs

Op elke map met bevroren water (Leningrad: het meer).

1. Rijdt als verhard, geen tunnel, alleen **barsten**.
2. Kans op breken per passage: `min(1, passages × 0,08)`.
3. Barsten zichtbaar in drie stadia: 2, 5 en 8 passages. Ze vervagen niet.
4. **Tank door het ijs:** tegel + aangrenzend ijs wordt wak (water). De tank verliest 2%
   pantser/s, rijdt heel langzaam (0,15), en gaat dood als hij erin blijft.

### 5.7 Onderduiken in een storm

Op maps met sneeuwstorm, zandstorm of sneeuwjacht:

- 2 seconden stilstaan → de tank raakt bedekt.
- De eigen speler ziet de tank verbleekt met de loop die uitsteekt (`BURIAL`).
- Onzichtbaar voor tegenstanders tot hij rijdt of schiet.
- Een bedekte tank kan wel geraakt worden door een schot dat erop komt.

### 5.8 Schieten

- Kogels **graven standaard niet** (`BULLETS.dig` staat uit; per map aan te zetten).
- Een kogel vliegt over grond en water, stopt bij tank, begroeiing, gebouw of rots.
- De krater van een ontploffende tank blijft.

---

## §6. Kaartgeneratie

### 6.1 Volgorde

1. **Bases plaatsen** (6.2).
2. **Vaste kenmerken:** rivieren, wegen, bruggen, dorpen, bijzonderheden.
3. **Terrein invullen** tot de percentages (±3 procentpunt marge), met samenhangende vlakken.
4. **Objecten plaatsen:** gevaren, depots, speciale objecten.
5. **Controleren** (6.4).

Lukt een poging niet, dan probeert de kaartmaker opnieuw met een andere seed.

### 6.2 Bases

- Willekeurig geplaatst; de kaart wordt eromheen gemaakt.
- **Zicht:** vanuit je basis en 3 T eromheen is geen andere basis in je venster.
- **Vrije ruimte:** 3 T zonder water, rots, gebouwen, begroeiing of gevaren.
- **In- en uitgang:** vrije strook van 3 T boven en onder de opening.
- Niet op een dorp, weg of brug. Het terrein onder de basis wordt vrijgemaakt.
- Bij krappe kaarten (Market Garden, Berlijn klein) worden de regels stap voor stap
  versoepeld: eerst de vensterregel, dan de afstand tot de rivier, dan de uitrijstrook
  (minimum 3 T).

### 6.3 Rand van de kaart

Langs de rand een onbegaanbare strook van 2 tankbreedtes (`EDGE.band`, 11 cellen). Het terrein
loopt erin door (spiegelbeeld van het terrein ernaast).

**Uitzondering:** op de Tunneler-kaarten (zomer en winter) is de strook gevuld met rotsblokken
uit de atlas van de stijl. Op andere kaarten niet; op de retrokaart ook.

Tanks, kogels, gebouwen, bases en gevaren blijven buiten de strook (`playable` in `world.js`).
De terreinpercentages gelden voor het speelbare deel. Een kogel stopt aan de binnenrand van de
strook.

### 6.4 Controle

- Route tussen elk paar bases (niet door water of rots; begroeiing, gebouwen, ijs en
  doorwaadbaar tellen als passeerbaar).
- Routes moeten ook na weerveranderingen bestaan.
- Percentages binnen de marge.

### 6.5 Plassen en rotsen

Plassen en rotsen worden niet afgekapt door de rechthoekige zones (rond bases, dorpen,
gebieden): een blob die daaraan komt wordt kleiner of komt ergens anders.

### 6.6 Netwerk

De host kiest een willekeurige seed en stuurt die met de map-id en kaartgrootte. Iedereen
genereert dezelfde kaart. Alle willekeurige gebeurtenissen (ijs, brand, artillerie, droppings,
instortende gevels) worden door de host bepaald en verstuurd.

---

## §7. Zicht

### 7.1 Zichtcirkel

De zichtcirkel is de **halve hoogte van het beeld**. Het weer geeft waarden in T: 12 T = de
volle cirkel, 6 T = de helft. Minimum: 2 tankbreedtes (`VISION`).

### 7.2 Binnen de cirkel

Je ziet rondom. Gebouwen, begroeiing, rotsen en rook verbergen wat erachter ligt.

### 7.3 Kijkboog

In een boog van **130°** in de rijrichting kijk je langs randen: je ziet de rand van het
obstakel en een tank die half achter een hoek staat. Naast en achter je niet — daar zie je het
obstakel zelf ook niet.

### 7.4 Buiten de cirkel

Alleen in de kijkboog: een tank die daar rijdt zie je als een vage contour (50% dekking die
afloopt naar de rand van het venster). Geen richtingshint voor een tegenstander die je scherp
ziet.

### 7.5 Donkere schaduw

Volgt dezelfde regel (`visibleCell`). Waar je geen zicht hebt: geen tunnels, sporen,
ijsbarsten of kraters — alleen het kale terrein (de schone kaart). Bomkraters (artillerie,
ontplofte tank) zie je altijd, ook zonder zicht.

### 7.6 Zicht-overlay

De checkbox ZICHT in de wachtkamer zet mist, schaduw en vervaging uit; de zichtregel zelf
blijft gelden. Tijdens het spelen is er geen zichtknop.

---

## §8. Richtingshints

Een **gloed** aan de rand van het scherm in één van 8 richtingen. Licht op en dooft in
3 seconden. Geeft de richting van de gebeurtenis aan, niet waar de tegenstander heen rijdt.
Een tegenstander die je scherp ziet geeft geen hint.

**Geluiden** (binnen 20 T):
- een tegenstander schiet;
- een tegenstander schiet begroeiing of een gebouw kapot;
- krakend ijs onder een tegenstander (Leningrad).

**Grote gebeurtenissen** (hele kaart):
- gevaar raakt een tegenstander (artillerie, instortende gevel);
- brug ontploft onder een tegenstander (Market Garden);
- tegenstander gevangen in een zoeklicht (Oder-front);
- stofspoor achter een tegenstander (Russische vlakte, zomer), eens per 10 s.

---

## §9. Weer

### 9.1 Weersregels

Elke map heeft een eigen weerbeeld. Het weer begint bij de start van het spel en kan veranderen
op een timer of per ronde (§2.4). Het weer kan drie dingen doen:

1. **Zicht** veranderen (de zichtstraal, §7).
2. **Sporen wissen** (sporenwisser, §9.2).
3. **Terrein** veranderen (ijs smelt, grond wordt modder, water stijgt).

### 9.2 Sporenwisser

Zolang een sporenwisser actief is:
- vervagen sporen op zacht en normaal **10× zo snel** en de minimale intensiteit geldt niet;
- een tunneltegel van zacht of normaal die intensiteit 0 bereikt wordt weer **ongegraven**;
- verhard, hard en permanente gaten (begroeiing, puin) blijven onveranderd.

Sommige sporenwissers werken alleen in een deel van de kaart (zie per map).

### 9.3 Verstuiving

Op maps met sneeuwval of woestijnwind wisselt de sterkte van licht tot zwaar. Tunnels lopen
dicht:

| Sterkte | Vers spoor dicht na |
|---|---|
| Licht | ~2 minuten |
| Zwaar | ~45 seconden |
| Storm (20 s) | ~90% dicht |

Sneeuw doet dat op elke grond even snel. Zand vooral in los zand; rotsige grond en de kustweg
half zo snel.

### 9.4 Regen en onweer

Regen is alleen beeld (druppels, spatten, regengordijnen, donkerder lucht) en verandert niets
aan tunnels, behalve de regenbui bij Carentan die bij het water sporen wist. In Carentan en
Berlijn komen regenstormen met onweer: bliksem die voor iedereen tegelijk flitst.

---

## §10. De tien maps

### Overzicht

| # | Jaar | Map | Gevaar | Schaars middel | Weer |
|---|---|---|---|---|---|
| 1 | 1940 | Grebbeberg | – | munitie alleen bij depot | inundatie, regen |
| 2 | 1941 | Russische vlakte | – | dubbel brandstof in modder | zomer → modder |
| 3 | 1942 | El Alamein | zandmeter, mijnen | – | hitte, woestijnwind, zandstorm |
| 4 | 1942 | Leningrad | breekbaar ijs | motorwarmte | schemering, sneeuw, dooi |
| 5 | 1943 | Koersk | – | motortemperatuur | zomer, rook, onweer |
| 6 | 1944 | Carentan | – | – | ochtendmist, regenstorm |
| 7 | 1944 | Arnhem | brug ontploft | droppings | helder → mist |
| 8 | 1944 | Ardennen | bombardement nabij spelers | brandstofdepots (vast) | mist, sneeuwstorm |
| 9 | 1945 | Oder-front | artilleriebarrage | – | nacht, zoeklichten, dageraad |
| 10 | 1945 | Berlijn | instortende gevels | pantser niet hersteld | rook, regen, onweer |

Gevaren zijn neutraal: ze treffen alle spelers. Een dood door een gevaar telt niet als kill.
Gevaren en weer worden alleen in de browser verborgen (geen anti-cheat nodig).

---

### 10.1 Grebbeberg (mei 1940)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| normaal | 34 | weilanden |
| zacht | 17 | natte klei in de vallei |
| hard | 10 | droge grond op de heuvel |
| begroeiing (loof) | 22 | loofbossen op de heuvel |
| moeras | 7 | drassige stroken langs sloten |
| rots | 2 | rotsen op de heuvelflank |
| verhard | 8 | wegen en het dorp |

Bij de start geen open water; water ontstaat pas door de inundatie.

**Bijzonderheden:**
- De **vallei** (laag land) bovenaan tot ~55% van de hoogte; daaronder de **heuvel** met bossen.
  In de onbegaanbare randstrook zit een rivier (bron van het inundatiewater); bij de start geen
  open water in het speelbare deel.
- **Dorpen:** Rhenen op (0,35; 0,7) en Achterberg op (0,65; 0,7).
- Weg van de vallei naar Rhenen en verder over de heuvel.

**Gevaar:** geen.

**Schaars middel — munitie:** munitie wordt **niet** in de basis aangevuld, alleen bij het
munitiedepot in Rhenen. Elke ronde begint met volle munitie.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1 | Helder, zicht 12 T |
| Vanaf ronde 2, per ronde | Inundatie: water stijgt een fase de vallei in. Normaal → moeras → water. De heuvel en de weg blijven droog. |
| Ronde 3 | Regen, zicht 8 T |

**Tanks:** A = Landsverk, B = Panther.

---

### 10.2 Russische vlakte (zomer–herfst 1941)

**Terrein (zomer):**

| Klasse | % | Wat |
|---|---|---|
| hard | 55 | droge, harde vlakte |
| normaal | 15 | akkers |
| zacht | 5 | zandige plekken |
| begroeiing (berk) | 12 | berkenbossen |
| verhard | 6 | zandwegen en dorp |
| rots | 4 | rotsblokken |
| water | 3 | kleine plassen |

**Bijzonderheden:**
- **Rivier** verticaal door het midden (x 0,5), breedte 3, 2 bruggen, met doorwaadbare plekken.
- **Twee zandwegen** horizontaal op ~35% en ~70% van de hoogte.
- Boerderijen langs de wegen (2–5, afhankelijk van de kaartgrootte).

**Gevaar:** geen.

**Schaars middel — brandstof:** gewoon aanvullen in de basis, maar in het modderseizoen
dubbel brandstofverbruik op zacht en moeras.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1–2 | Zomer, zicht 10 T. Stofspoor op hard terrein (2 s), geeft hint per 10 s. |
| Vanaf ronde 3 | Modder: hard, normaal en verhard worden zacht. Zicht 8 T. Geen stofspoor. |

**Tanks:** A = T-34, B = Panther.

---

### 10.3 El Alamein (oktober 1942)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| zacht | 47 | woestijnzand |
| hard | 28 | rotsige grond (geen sporen, geen tunnels) |
| verhard | 5 | kustweg |
| rots | 5 | rotsplateaus |
| water | 10 | de zee |
| begroeiing (struik) | 5 | dorre struiken |

**Bijzonderheden:**
- De zee langs de bovenrand (~10% van de hoogte). De kustweg direct eronder.
- 4–6 rotsplateaus. Rotsige grond in stroken verspreid.
- Geen dorp.

**Gevaar — zandmeter:** te lang door zand rijden beschadigt de tank.
- Zandmeter (0–100), zichtbaar op de tankkaart.
- +2 per zachte tegel, −5 per harde of verharde tegel.
- Boven 60: 1% pantserverlies per extra zachte tegel.
- Bij 100: 30% langzamer tot de meter onder 60 is.

**Mijnen:** onzichtbaar (keuze van de eigenaar).

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Effect |
|---|---|
| Hele spel | Hitte, zicht 10 T. Wisselende woestijnwind (verstuiving). |
| Elke 45–120 s (willekeurig), 30 s lang | Zandstorm: zicht 2 T, sporenwisser, onderduiken. |

**Tanks:** A = Comet, B = Panther.

---

### 10.4 Leningrad (winter 1942)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| zacht | 25 | sneeuw op aarde |
| ijs | 40 | het bevroren meer |
| begroeiing (berk) | 20 | berkenbossen |
| verhard | 4 | wegen |
| moeras | 3 | drassige plekken |
| rots | 3 | steile oever |
| water | 5 | wakken in het ijs |

**Bijzonderheden:**
- Een groot **bevroren meer** (ovaal, zwaartepunt op ~65% van de breedte, ~50% van de hoogte),
  ongeveer ⅔ van de kaart.
- Steile oever (`rots`, 1 T) rondom het meer met 4 openingen van 3 T.
- Geen brug; het ijs is de oversteek.
- 2 kleine wakken.

**Gevaar — breekbaar ijs:** zie §5.6.

**Schaars middel — motorwarmte:**
- Warmtemeter (0–100), zichtbaar op de tankkaart.
- Stilstaan of langzaam rijden (< 30%): −5/s.
- Gewoon rijden of in de basis: +10/s.
- Bij 0: motor bevroren, 4 s nodig om op snelheid te komen.
- Vervalt bij de dooi (ronde 4).

**Weer:**

| Wanneer | Effect |
|---|---|
| Elke ronde | Schemering: zicht van 12 T naar 6 T na 3 minuten. Wisselende sneeuwval (verstuiving). |
| Elke 45–120 s (willekeurig), 20 s, tot de dooi | Sneeuwjacht: zicht 2 T, sporenwisser, onderduiken. |
| Ronde 2 | IJs wordt broos: 2× de breakkans. |
| Ronde 3 | IJs kraakt: 4× de breakkans. |
| Vanaf ronde 4 | Dooi: ijs → water. 4–6 extra plassen. Geen sneeuwjacht, geen motorwarmte. |

**Tanks:** A = T-34, B = Panther.

---

### 10.5 Koersk (juli 1943)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| normaal | 45 | graanvelden |
| hard | 15 | droge steppe |
| zacht | 12 | zwarte aarde |
| verhard | 6 | zandweg |
| rots | 8 | balka's (ravijnen) |
| begroeiing (loof) | 8 | bosjes |
| water | 6 | de Psel (~3% rivier, rest plassen) |

**Bijzonderheden:**
- De **Psel** diagonaal door de rechterbovenhoek, 3 T breed. 1 brug.
- **Geen loopgraven:** verhard is één zandweg met de brug over de Psel, aangevuld met zijwegen
  vanaf de rand.
- 2–3 balka's (ravijnen, `rots`).
- Geen dorp.

**Gevaar:** geen. De graanbrand is geschrapt (keuze van de eigenaar).

**Schaars middel — motortemperatuur:**
- Temperatuurmeter (0–100), zichtbaar op de tankkaart.
- Snel rijden (> 80%): +4/s.
- Langzamer of stilstaan: −6/s. In de basis: −20/s.
- Bij 100: max. 40% snelheid tot de meter onder 50 is.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1–2 | Zomerhitte, zicht 12 T. Branden en rook (rookvlek bij vuur, 20 s). |
| Vanaf ronde 3 | Onweer: branden doven, schoten steken graan nog aan met 3% kans. Zwarte aarde → moeras. Zicht 8 T. |

**Tanks:** A = T-34, B = Panther.

---

### 10.6 Carentan (juni 1944)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| normaal | 46 | weilanden |
| moeras | 17 | moeras |
| begroeiing (heg) | 15 | heggen (bocage) |
| verhard | 8 | wegen en dorpsstraten |
| hard | 7 | dijkweg |
| zacht | 6 | modder |
| rots | 1 | rotsen |

**Bijzonderheden:**
- **Heggen** (1 T breed) vormen een raster van kleine weilanden: de bocage. Lange lijnen met
  gaten van 2 T.
- **Moeras** in de linkeronderhoek (~25% van de kaart).
- **Dijkweg** over het moeras naar het dorp, met 1 brug.
- **Dorp:** Carentan in de rechterbovenhoek (0,75; 0,25), omgeven door de bocage.

**Gevaar:** geen.

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1 | Ochtendmist, zicht 4 T |
| Vanaf ronde 2 | Wisselend bewolkt, zicht 12 T |
| Vanaf ronde 2, elke 30–90 s (willekeurig), 20 s | Regenstorm met onweer: zicht 8 T, sporenwisser bij het water |

**Tanks:** A = Sherman, B = Panther.

---

### 10.7 Arnhem (september 1944)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| normaal | 45 | polders |
| zacht | 12 | natte klei |
| hard | 10 | dijken |
| water | 12 | de Rijn en de Waal |
| verhard | 8 | wegen, bruggen en stad |
| begroeiing (loof) | 10 | bomenrijen en boomgaarden |
| rots | 1 | rotsen |

**Bijzonderheden:**
- **Twee rivieren** verticaal: de Rijn op x 0,35 en de Waal op x 0,65, beide 3 T breed, met
  bruggen bij de wegen en doorwaadbare plekken.
- Dijken langs beide oevers.
- Sloten in een raster door de polders met dammen.
- **Dorp:** Arnhem, aan het noordelijke bruggenhoofd.
- **Geen vaste bases** (`noBases`): spelers spawnen op een willekeurige plek.

**Gevaar — de brug ontploft:** kans per oversteek 10%, +5% per eerdere oversteek
(`chance`/`chanceStep`). De teller loopt door over de rondes; de brug is elke ronde weer heel.
De tank verliest 40% pantser. De explosie geeft een hint aan iedereen.

**Schaars middel — droppings:** munitie, brandstof en pantser worden **niet** in de basis
aangevuld. Elke 30 s vallen 3 kratten met munitie of brandstof op willekeurige plekken. Wie
eroverheen rijdt krijgt de inhoud. De droppings gaan het hele spel door (ook in de mist). Elke
ronde begint met volle munitie en brandstof.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1, 2, 4, 5, … | Helder, zicht 12 T. Droppings. Rook boven de stad. |
| Ronde 3, 6, 9, … | Mist en regen, zicht 8 T. Droppings blijven. |

**Tanks:** A = Comet, B = Panther.

---

### 10.8 Ardennen (december 1944)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| zacht | 49 | verse sneeuw |
| hard | 5 | bevroren grond |
| begroeiing (den) | 30 | dennenbossen |
| verhard | 8 | bosweggen en Bastogne |
| rots | 2 | rotsblokken |

**Bijzonderheden:**
- **Dorp:** Bastogne in het midden (0,5; 0,5), groter dan standaard (~1/6 van de kaart). Plein
  met kerk, 6–8 huizen.
- **5 bosweggen** komen samen in Bastogne naar de rand.

**Gevaar — bombardement nabij spelers:** de server kiest een levende tank en plaatst een
6 T × 6 T vak op maximaal 3 T afstand. 1 s waarschuwing, daarna 3–5 s opeenvolgende
inslagen (rode flits + rook). Drie niveaus:

| Niveau | Kans | Pantserschade | Inslagen |
|---|---|---|---|
| licht | 3/6 | 10% | 3 |
| gemiddeld | 2/6 | 20% | 6 |
| zwaar | 1/6 | 30% | 10 |

De automatische timer versnelt: 20 → 18 → 15 → 12 → 10 s (minimum). Kapotte bomen als
permanent spoor. Een inslag velt de dennen eromheen. De host kan met **B** een extra barrage starten (telt niet mee
voor de versnelling). Met **O** forceert de host een storm van 20 s (op elke map).

**Schaars middel — brandstofdepots:** 3 vaste, onuitputtelijke depots met minimaal 5 T
afstand onderling. De depots blijven op dezelfde plek tussen rondes. In de basis wordt geen
brandstof aangevuld: de depots zijn de enige bron.

**Weer:**

| Wanneer | Effect |
|---|---|
| Hele spel | Pulserende mist: 60 s dicht (zicht 2 T), 30 s helder (zicht 12 T), herhalend. |
| Elke 45–120 s (willekeurig), 20 s | Sneeuwstorm: zicht 2 T, sporenwisser, onderduiken. Wisselende sneeuwval (verstuiving). |

**Tanks:** A = Sherman, B = Panther.

---

### 10.9 Oder-front (april 1945)

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| zacht | 28 | natte aarde in het dal |
| moeras | 15 | moeras in het dal |
| hard | 20 | heuvelrug |
| normaal | 15 | akkers |
| rots | 7 | steile helling |
| begroeiing (loof) | 5 | bosjes op de heuvel |
| water | 6 | de Oder |
| verhard | 4 | wegen |

**Bijzonderheden:**
- De **Oder** verticaal op x 0,65 (bij het midden, niet aan de rand).
- Het **Oderdal** (moeras en natte aarde) in de rechterhelft.
- De **heuvelrug** in het linkerderde, met een steile helling (`rots`) met openingen van 2 T
  (1 eigen opening, 2 wegen erdoorheen).
- Geen dorp.

**Gevaar — artilleriebarrage:** elke 60 s licht een willekeurig vak van 3×3 T op. Na 3 s
beschoten: 30% pantser. Daarna kraters (zacht).

**Schaars middel:** geen. Standaardregels.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1–2 | Nacht, zicht 4 T. 3 **zoeklichten** in een Lissajous-patroon over de hele kaart (strook 4 T). In een bundel: sporen op volle intensiteit, zicht 12 T. Tank in een bundel: hint voor iedereen. |
| Vanaf ronde 3 | Dageraad, zicht 8 T. Zoeklichten uit. |

**Tanks:** A = T-34, B = Panther.

---

### 10.10 Berlijn (april–mei 1945)

> **Let op:** deze map is nog in ontwikkeling (`hidden: true`) en niet kiesbaar in het menu.

**Terrein:**

| Klasse | % | Wat |
|---|---|---|
| verhard | 30 | straten en pleinen |
| gebouw | 30 | huizenblokken (~25% bij 4 spelers, ~20% klein) |
| zacht | 15 | puin |
| normaal | 8 | parken |
| begroeiing (loof) | 5 | parkbomen |
| water | 7 | de Spree en het Landwehrkanaal |
| rots | 5 | betonnen bunkers |

**Geen metro** (geschrapt).

**Indeling van de kaart:**

De hele kaart is stad: een raster van huizenblokken (blokken van 8–12 cellen) met straten van
2 T (`type: 'city'`). Standaard gebouwen, geen segmenten.

- **Spree:** rivier op y 0,35, 2 T breed. 2 bruggen.
- **Landwehrkanaal:** op y 0,70, 1,5 T breed. 2 bruggen.
- **Tiergarten:** park op (0,3; 0,5), maat 0,15 van de kaart.

**Gevaar — instortende gevels:**
- Direct naast een gebouw: 5% kans/s → 10% pantser.
- Tegen een gebouw rijden: gevel stort zeker in → 25% pantser.
- Gebouw met 3 treffers stort na 3 s helemaal in: 25% pantser op aangrenzende cellen.
- Puin kan een straat afsluiten; geeft een hint.

**Schaars middel — pantser:** pantser wordt tijdens een ronde **niet** hersteld, ook niet in
de basis. Brandstof en munitie gewoon aanvullen.

**Weer:**

| Wanneer | Effect |
|---|---|
| Ronde 1 | Rook boven de stad, zicht 12 T |
| Ronde 2 | Dichtere rook, zicht 8 T |
| Vanaf ronde 3 | Dikke rook en regen met onweersbuien, zicht 6 T |
| Hele spel | Stof na instorting blokkeert 10 s het zicht |

**Tanks:** A = T-34, B = Panther.

---

## §11. Besturing

### 11.1 Toetsenbord

Pijltjes of WASD = rijden, spatie = schieten, K = zelfvernietiging, 9 = inzoomen,
0 = uitzoomen. In je eigen basis: repareren en herladen.

**Host-commando's (alleen op de Ardennen):**
- **B** = extra bombardement nabij een speler (telt niet mee voor de automatische versnelling).
- **O** = geforceerde sneeuwstorm (20 s).
- **N** = dag/nacht wisselen (alle spelers).
- **[** / **]** = zon-/maanstand roteren (8 stappen, alle spelers).

**Host-commando op elke map:**
- **,** / **.** = maximumsnelheid van alle tanks omlaag / omhoog (stappen van 10%, 50–200%).
  De stand staat kort in beeld bij alle spelers; een nieuw spel begint op 100%.

**Per speler:**
- **M** = lokale atmosferische mist aan/uit (alleen op je eigen scherm).

### 11.2 Touch (tablet en telefoon)

Alleen liggend (staand: "draai je scherm"). Linkerhelft = zwevende joystick (8 richtingen),
rechterhelft = vuren, K-rondje bovenin 1 s vasthouden = zelfvernietiging. Op een telefoon
(liggend, < 500 px): het zijpaneel wordt een kleine HUD rechtsboven.

---

## §12. Zijpaneel en minikaart

Het zijpaneel is op elke map hetzelfde: de tankkaart (plaatje, naam, land, zeges en meters),
dan de minikaart, dan de legenda. Verder niets.

**Minikaart:** alleen je eigen tank, je eigen basis, het terrein en brandstof/munitie. Geen
tunnels, sporen, andere bases of andere tanks. Tijdens zand- en sneeuwstormen tijdelijk
verborgen. De host kan de minikaart in de wachtkamer uitzetten; bij Tunneler-maps standaard
uit.

---

## §13. Effecten verraden niets

Mondingsvuur, splinters, flipbook-effecten, lichtvlekjes en kogels van anderen: alleen als je
ze scherp ziet. Waterplanten die op een tunnel verdwijnen: alleen waar je zicht hebt. Geluiden
lopen via de richtingshints.
