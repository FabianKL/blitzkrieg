# Spec: grafische reparaties (rotsrand, berm, mist, rook en waterlijn)

Dingen die in het spel niet goed uitzien sinds de foto-texturen (fases 3–7 van
`docs/opdracht-claude-code-graphics.md`). De witte ring in de mist en de rand om de rook hebben één
oorzaak (§1). De rotsrand en de berm zijn instellingen die bij de oude, effen kleuren pasten en nu te
hard zijn (§2, §3). §4 is optioneel. §5 maakt de waterlijn grillig en zet de oeverplanten ertegenaan.
§6–§8 zijn voorstellen: grotere huizen (verandert de kaarten), een mooiere ingesneeuwde tank, en
grotere bomen en rotsblokken. §9 haalt de rotsrand om de kaart weg (verandert de kaarten).

Volgorde van werken: eerst §1 (een echte bug, één regel), dan pas §2 en §3 beoordelen. Een deel van
wat er nu "hard" uitziet, kan door §1 komen.

---

## §1 Bug: canvas-texturen worden verkeerd geüpload (witte ring in de mist, rand om de rook)

### Wat de speler ziet
- **Ardennen, ochtendmist:** om je tank zit een dichte **witte ring**. Het hoort een open plek te zijn
  die naar buiten toe zacht in de mist overloopt.
- **Rookvlekken** (brandende boerderij, stadsrook, rook van een gevecht, stof van een ingestort
  gebouw): elke vlek bestaat uit 5 cirkels met een **lichte rand en een harde cirkelgrens**. Ze horen
  donkergrijs te zijn en naar de rand weg te vagen.
- Waarschijnlijk ook: sneeuwvlokken en de hoekgloed van de richtingshints (zelfde texture
  `TEX.soft`), en elk ander canvas met een verloop naar doorzichtig.

### Oorzaak
`upload()` in `public/view/ground-gpu.js` (rond regel 648) stuurt veranderde cellen zelf naar de
videokaart met `texSubImage2D`. Daarvoor zet hij `gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL` op `false`, maar
hij zet die waarde daarna **niet terug**. De andere instellingen (`UNPACK_ROW_LENGTH`, `SKIP_*`, de
gebonden texture) herstelt hij wel.

PixiJS (8.22) onthoudt deze instelling zelf (`GlTextureSystem._premultiplyAlpha`) en zet hem alleen
opnieuw als die volgens zijn eigen administratie anders moet. Pixi denkt dus nog steeds dat de
instelling aan staat. Het volgende canvas met `alphaMode` `premultiply-alpha-on-upload` (de standaard
van `CanvasSource`) gaat daardoor **zonder** voorvermenigvuldiging naar de videokaart, maar wordt wel
gemengd alsof het voorvermenigvuldigd is. Bijna doorzichtige pixels tellen dan met hun volle kleur
mee: het verloop licht op (wit bij de mist, grijs bij de rook) in plaats van te vervagen. Alleen waar
de alfa precies 0 is, blijft het beeld schoon (canvas 2D bewaart daar geen kleur). Dat geeft de harde
grens.

### Wijziging
In `upload()` de oude waarde bewaren en na het uploaden terugzetten, net als de rest:

```js
const premul = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
// ... texSubImage2D ...
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
```

Zoek ook naar andere plekken in `public/` die zelf `gl.pixelStorei` aanroepen. Nu is `upload()` de
enige.

### Controle (preview op 3100)
- Ardennen, begin van ronde 1: een zachte open plek rond je tank, geen ring.
- Een rookvlek (Ardennen of Berlijn: stadsrook; of een gebouw laten instorten): donkere, zachte
  wolk zonder lichte rand.
- Winterkaart met sneeuw: vlokken zonder harde rand.
- Een richtingshint in een hoek: rode gloed zonder ring.
- Tunnels graven (dat roept `upload()` aan) en daarna opnieuw kijken: het moet goed blijven.

---

## §2 Rotsen: de donkere omlijning is te hard

### Wat de speler ziet
Om elk rotsveld loopt een **zwart lijntje**, als de contour van een strip.

### Oorzaak
Dit is bewust zo gemaakt. `rockAt()` in `public/view/ground-gpu.js` (rond regel 259) maakt de rots in
een smalle strook langs de rand donkerder:

```glsl
if (f < thr + 0.07) return col * uMode.z;   // uMode.z = surface.rock.edge
```

De strook is hard afgekapt (geen verloop) en flink donker:

| stijl    | `rock.edge` | effect        |
|----------|-------------|---------------|
| zomer    | 0.44        | 56% donkerder |
| winter   | 0.62        | 38% donkerder |
| woestijn | 0.55        | 45% donkerder |
| standaard (`SURFACE` in ground-gpu.js) | 0.5 | |

Op de oude, effen rotskleur gaf dat diepte. Op de lichte steentextuur valt het weg als een lijn.

### Wijziging
1. Van de harde drempel een verloop maken: vlak aan de rand het donkerst, over ongeveer
   0,1–0,15 in het veld naar 1 (`mix(col * edge, col, smoothstep(thr, thr + 0.12, f))`). Dan wordt
   het een schaduwrand in plaats van een lijn.
2. `rock.edge` per stijl lichter maken (richting 0,75–0,85). Stel de waarde pas af in de browser,
   na §1.
3. Het lichte randje linksboven (`rock.light`, de tweede regel van `rockAt`) op dezelfde manier
   beoordelen; ook dat is een harde stap.

Getallen blijven in de stijl (`surface.rock`) en in `SURFACE`; voeg zo nodig een veld toe (bv.
`rock.width` voor de breedte van het verloop) in plaats van een losse waarde in de shader.

### Controle
Zomer (rotsvelden tussen gras), winter en woestijn: de rand van een rotsveld moet als een zachte
schaduw of rand lezen, niet als een getekende lijn. Losse rotscellen mogen niet verdwijnen.

---

## §3 Wegen: de berm ziet eruit als een lijntje

### Wat de speler ziet
Langs de rand van elke weg (zandweg in de woestijn, kasseien in de zomer, weg op de sneeuw) loopt een
**donker lijntje** tussen de weg en de grond ernaast. (De twee donkere lijnen bínnen een zandweg
zijn de rijsporen; die zijn goed.)

### Oorzaak
Waarschijnlijk geen naad tussen texturen, maar de **berm**. `roadAt()` in `public/view/ground-gpu.js`
(rond regel 235) kleurt de grond naast de rijbaan:

```glsl
float verge = (1.0 - smoothstep(0.0, uRoadA.y, d)) * uRoadA.z * (0.75 + 0.5 * nz(p * 1.7));
col = mix(col, uCol[COL.verge].rgb, clamp(verge, 0.0, 1.0));
```

- De berm is het sterkst **direct** naast de rijbaan (`d = 0`), en `smoothstep` loopt daar vlak: over
  ongeveer een halve cel blijft hij bijna even sterk, en pas daarna vervaagt hij.
- De standaard bermkleur is de tunnelkleur (`LOOK.road.vergeColor: null`): donkere modder. Dat valt
  het meest op tegen licht zand (El Alamein, `vergeAmount: 0.2`) en tegen sneeuw op winterkaarten
  zonder eigen `vergeColor` (Ardennen en Leningrad hebben wit `#f2f6fa`, de andere niet).
- Standaard: `LOOK.road` = `verge: 1.4` cellen, `vergeAmount: 0.35`.

Samen met de scherpe rand van de rijbaan (`smoothstep(-aa, aa, d)`) leest dat als een getekend
lijntje.

**Eerst controleren:** met `vergeAmount: 0` (tijdelijk, in het kaartbestand of in `LOOK`) moet het
lijntje weg zijn. Zo niet, dan zit de oorzaak ergens anders (bv. de mipmap of `textureGrad` van de
weg-texture langs de rand) en geldt de rest van §3 niet.

### Wijziging
1. Het profiel van de berm omdraaien: niet het sterkst vlak naast de rijbaan, maar na een klein stukje
   opkomen en daarna langzaam wegvagen. Of de berm al bínnen de rand van de rijbaan laten beginnen,
   zodat weg en berm in elkaar overlopen in plaats van een strook ernaast te vormen.
2. De berm breder (bv. 2–3 cellen) en zwakker maken, met meer ruis langs de rand, zodat het een vlek
   wordt en geen lijn.
3. Een bermkleur per stijl in plaats van overal modder: zand iets donkerder in de woestijn, wit of
   vuil grijs op sneeuw, modder in de zomer. Dat kan via `look.road.vergeColor` in de kaartbestanden
   of als standaard per stijl.

Alle nieuwe getallen in `LOOK.road` (config.js) of in `look.road` van de kaart, en beschrijf ze in het
commentaar boven `LOOK`.

### Controle
El Alamein (zandweg op zand), een zomerkaart met kasseien, een winterkaart zonder eigen
`vergeColor`: geen lijn langs de weg. Kruisingen en bochten moeten er nog net zo uitzien; rijsporen
blijven.

---

## §4 Optioneel: rook als sprite

`public/assets/effects/rook.png` met spritesheet `rook.json` (animatie `rook`, 8 beelden) staat al in
de assets maar wordt nog nergens gebruikt. Rookvlekken (`drawSmokes` in `public/world-view.js`) en de
rookdeeltjes (`createParticles` in `public/pixi-scene.js`, nu `TEX.disc`: een volle cirkel met een
harde rand) kunnen die gebruiken. Doe dit na §1, en alleen als de rook er dan nog te kaal uitziet.
Volgens de regels van de assets: ontbreekt de sprite, dan tekenen zoals nu.

---

## §5 Waterlijn natuurlijker, planten tegen de waterlijn

### Wat de speler ziet
- De rand van water en ijs (bv. de bevroren rivier in Leningrad) is een **strakke, gladde lijn**, als
  met een liniaal getrokken. Een echte oever is grillig: kleine inhammen, uitstulpingen, hier en daar
  een zandplaat of een ijsrand die uitloopt.
- De **oeverplanten** (zomer: `oeverplant`, winter: `oeverriet`) liggen los verspreid over een strook
  tot 3 cellen van het water, en een paar staan in het water of op het ijs. Ze moeten **tegen de
  waterlijn** aan staan, als een rand begroeiing langs de oever.

### Oorzaak
- **Waterlijn:** de grondshader tekent de oever op de drempel van een vervaagd veld (`uFields` g =
  water, `track.a` = ijs; `waterAt()` en `iceAt()` in `public/view/ground-gpu.js`). Het vervagen
  maakt elke celrand rond en glad. Een rivier is in de kaartmaker een band met vaste breedte langs een
  pad (`routePath`, `wiggle` per kaart; Leningrad `0.04`). Er zit dus nergens kleinschalige
  grilligheid in de oever.
- **Planten:** `pick()` in `public/view/plants-view.js` kiest op een rooster (`WATER_PLANTS.step` =
  2) met kans `look.waterPlants.density` (0,35) een punt. Op een droge cel komt een oeverplant als die
  binnen `look.waterPlants.width` (3) stappen van water of ijs ligt, gelijk verdeeld over die hele
  strook. De afstand wordt per cel geteld (4 buren), niet vanaf de getekende lijn. Die ligt door het
  vervagen en de drempel ergens anders dan de celgrens. Planten die op het water lijken te staan,
  zijn de `water`-soort (ijsblad, waterlelie) of oeverplanten op een droge cel waar de getekende
  waterlijn overheen loopt.

### Wijziging
1. **Grillige waterlijn (alleen weergave).** Verschuif in de shader de drempel (of de plek waar het
   water- en ijsveld wordt gelezen) met ruis op twee schalen: grof (ongeveer 4–8 cellen, inhammen en
   uitstulpingen) en fijn (ongeveer 1 cel, rafelig). Gebruik de bestaande ruistextuur (`nz`/`fbm`).
   - **Grens:** hoogstens ongeveer één cel naar binnen of buiten. De cellen blijven de echte oever
     (waar een tank rijdt of zinkt), en de getekende lijn mag daar niet zichtbaar van afwijken.
   - Hetzelfde voor ijs en wak, en voor de modderige oeverstrook (`bank`) die met de lijn meeloopt.
   - Doorwaadbare plekken en bruggen niet verstoren.
   - Nieuwe getallen in `LOOK.water` (bv. `edgeNoise`, `edgeScale`) en per kaart in `look.water`.
     Leningrad en de andere ijskaarten mogen een andere waarde krijgen dan zomerkaarten.
2. **Planten op de getekende lijn.** Plaats oeverplanten op de waterlijn zoals de shader hem tekent,
   niet op de celafstand:
   - Reken in `plants-view.js` dezelfde randfunctie uit als de shader (zelfde vervaagde veld, zelfde
     drempel, zelfde ruis). De ruistextuur wordt in JS gemaakt, dus die kan ook in JS worden gelezen.
     Zet die functie op één plek, zodat shader en planten niet uit elkaar lopen.
   - Schuif elk kandidaatpunt langs het verloop van het veld naar de lijn toe, en dan een klein stukje
     de kant op: oeverplanten meestal 0–0,6 cel aan de droge kant, af en toe net in het water (riet
     staat met de voet in het water). Geen oeverplanten verder dan ongeveer 1 cel van de lijn.
   - Dichter langs de lijn, in groepjes met open stukken ertussen (ruis op de kans), in plaats van
     gelijk verspreid. Bijvoorbeeld een kleinere `step` langs de oever en `density` per groepje.
   - De `water`-soort (waterlelie, ijsblad) blijft op het water of ijs, maar ook dichter bij de kant:
     in de eerste 1–2 cellen vanaf de lijn.
   - Wat nu al werkt, blijft gelijk: geen obstakel en geen zicht; bij graven naar de laag `hidden`
     (`cellChanged`); bij een wak opnieuw opbouwen (`rebuild`).
   - Getallen in `WATER_PLANTS` en `look.waterPlants` (bv. `offset`, `clump`), met uitleg in het
     commentaar boven `LOOK`.

De kaartmaker verandert niet: dezelfde seed geeft dezelfde cellen (vingerafdruk gelijk). Wil de
eigenaar ook grilliger rivieren in de cellen zelf (`wiggle`, of een rafelige oeverband in
`mapgen.js`), dan is dat een aparte keuze: daarmee verandert de kaart en moet de vingerafdruk worden
bijgewerkt.

### Controle
Leningrad (bevroren rivier), Ardennen, een zomerkaart met rivier of meer (Market Garden, Carentan):
- de oever is grillig, maar valt nog zichtbaar samen met waar je echt in het water rijdt;
- de oeverplanten staan in een rand tegen de lijn, met groepjes en open stukken, niet los op de
  sneeuw of het gras en niet midden op het water;
- een wak schieten in het ijs: planten en rand worden goed opnieuw opgebouwd;
- `blitzView.bench()`: de shader mag niet merkbaar trager worden.

---

## §6 Huizen groter (voorstel)

### Wat de speler ziet
Een tank is net zo groot als een woonhuis, en bijna zo breed als een rijhuis. Dat klopt niet:
een huis hoort duidelijk groter te zijn dan een tank.

### Hoe het nu zit
- Tank: `TANK_LEN` 3,3 en `TANK_WID` 2,6 (halve maten, `shared/world.js`), dus ongeveer **6,6 × 5,2
  cellen**. Op die maat is 1 cel ongeveer 1 meter (een Tiger is zonder kanon ongeveer 6,3 m lang).
- Gebouwen: `BUILDINGS.footprints` in `shared/config.js`, in cellen:

  | gebouw    | nu      | echt (ongeveer)        |
  |-----------|---------|------------------------|
  | huis-woon | 6 × 6   | 9–10 m × 9–10 m        |
  | huis-rij  | 12 × 5  | 3–4 huizen: 20 × 8 m   |
  | boerderij | 11 × 10 | 20 × 15 m              |
  | kerk      | 8 × 15  | 14 × 28 m              |

- De kaartmaker zet precies dat grondvlak neer en `public/view/buildings-view.js` legt er de sprite
  op die bij dat grondvlak hoort (`match(w, h)`), met schaal `1 / BUILDINGS.px` (32 pixels per cel).
  De sprites zijn precies grondvlak × 32 pixels (huis-woon 192 × 192, kerk 256 × 480).
- De blokken van de stad (Berlijn, ongeveer 3,5 T = 17 cellen per pand) zijn al groter en hebben
  geen sprite; die vallen hierbuiten.

### Voorstel
Alle grondvlakken ongeveer **× 1,7**, afgerond op hele cellen:

| gebouw    | nieuw   |
|-----------|---------|
| huis-woon | 10 × 10 |
| huis-rij  | 20 × 8  |
| boerderij | 19 × 17 |
| kerk      | 14 × 26 |

1. **Config:** `BUILDINGS.footprints` aanpassen; `BUILDINGS.height` (schaduw) mee × 1,7.
2. **Weergave:** in `buildings-view.js` de sprite op het grondvlak schalen (`width`/`height` =
   grondvlak, rekening houdend met `turned`) in plaats van met `1 / BUILDINGS.px`. Dan hoeven de
   sprites niet opnieuw gemaakt te worden. Ze worden ongeveer 19 pixels per cel. Op de normale zoom
   (80 cellen per beeldhoogte, ongeveer 11 schermpixels per cel) is dat nog scherp genoeg. Een kleine
   vervorming door het afronden (rijhuis 384/20 tegen 160/8) is acceptabel; anders de nieuwe maten zo
   kiezen dat de verhouding precies klopt.
3. **Kaartmaker:** de dorpen moeten de grotere huizen nog kwijt kunnen:
   - `size` van de dorpen in de kaartbestanden groter (ongeveer × 1,7–2 in oppervlak), of `buildings`
     ([min, max]) lager;
   - de vrije ruimte rond de kerk en het plein (`1.6 * T`, `2.5 * T`) en de rij boerderijen in
     Barbarossa (`layout: 'row'`, ruimte tussen de boerderijen) nakijken;
   - bases mogen nog steeds niet in een dorp; kijk of die op kleine kaarten nog passen.
4. **Spel:** een gebouw heeft 4 treffers (`BUILDING.hp`), los van de maat. Een groter huis is dus
   niet sterker, maar wel meer dekking en meer puin. Zo laten, tenzij de eigenaar anders wil.

Dit verandert de kaarten: vingerafdruk bijwerken (`node tests/fingerprint.mjs --write`) en
`npm run test:gen -- "" 10` draaien.

**Alternatief** als de dorpen niet groter mogen: een kleinere factor (× 1,4: huis-woon 8 × 8) of
alleen de woonhuizen en rijhuizen groter maken. De tanks kleiner maken raakt de spelregels (zicht,
botsingen, tunnels) en valt daarom af.

### Controle
Ardennen (Bastogne), Carentan, Market Garden en Barbarossa: huizen duidelijk groter dan een tank,
dorpen niet overvol, alle gebouwen met een sprite (geen dak uit de grondshader omdat het grondvlak
niet past), schaduw op de goede plek.

---

## §7 Ingesneeuwde tank (voorstel)

### Wat de speler ziet
Staat je eigen tank onder de sneeuw (`t.b`), dan zie je alleen een **egale witgrijze ellips** met een
dun grijs randje. Er is niets van de tank te zien, het ligt als een plakje op de grond en het lijkt
niet op sneeuw.

### Hoe het nu zit
`drawBuried()` in `public/world-view.js` (rond regel 948) tekent in plaats van de tank een ellips van
4 × 3,2 cellen in `style.burialColor` (standaard `rgba(236, 232, 220, 0.9)`), plus een ellips als
omtrek in de rijrichting. Alleen voor je eigen tank; anderen zien je dan niet (de zichtregel kijkt naar
`buried`).

### Voorstel
Teken de tank zelf, en leg er sneeuw over, zodat je ziet dat het jouw tank is die is ingesneeuwd:
1. **Tank eronder:** de gewone tanksprite, wat verbleekt (lichtere tint, minder contrast).
2. **Sneeuwdek erover:** een eigen sprite per stijl (`<stijl>/effects/sneeuwdek.png`, woestijn:
   `zanddek.png`) van ongeveer tankmaat, in de rijrichting gedraaid: een hoop met een zachte,
   onregelmatige rand en wat licht en schaduw (de kant van `look.light` lichter, de andere kant met
   een zachte schaduw op de grond). Zo is het een hoop sneeuw in plaats van een plat vlak.
   - De loop en het bovenste deel van de toren steken er een beetje uit. Doe dat met een masker, of
     door de sneeuwlaag daar doorzichtig te maken.
   - Geen sprite in de assets: procedureel tekenen met Canvas 2D (een paar overlappende, zachte
     vlekken met ruis aan de rand en een verloop van licht naar schaduw), net als bij de andere
     getekende dingen. Niet meer met een harde ellips.
3. **Opbouw:** laat het dek in ongeveer een seconde aangroeien als de tank ingesneeuwd raakt, en
   wegvallen (een paar sneeuwdeeltjes, `particles.spawn('puff', …)`) als hij weer gaat rijden of
   schiet. Dat geeft de speler meteen terugkoppeling.
4. **Getallen:** maat, verbleking, tijd van aangroeien en hoeveel er uitsteekt in een nieuw blok
   `BURIAL` in `shared/config.js`; de kleur blijft `style.burialColor` (zomer of woestijn: zand of
   stof).

Alleen weergave: de regel wie wat ziet (`sightOf` met `buried`) verandert niet. Het blijft alleen voor
je eigen tank.

### Controle
Ardennen of Leningrad: tank laten insneeuwen. Je ziet een hoop sneeuw in de vorm van je tank, met
wat tank erdoor; bij wegrijden valt de sneeuw eraf. Op een andere kaart waar je bedekt kunt raken: de
kleur van die stijl. Een tegenstander ziet je nog steeds niet.

---

## §8 Bomen en rotsblokken groter (voorstel)

### Wat de speler ziet
Een boom is kleiner dan een tank; een bos ziet eruit als struikgewas. Rotsblokken zijn kiezels naast
een tank.

### Hoe het nu zit
- Tank: ongeveer 6,6 × 5,2 cellen (zie §6; 1 cel is ongeveer 1 m).
- `public/view/objects-view.js` zet sprites uit de atlas van de stijl op een rooster
  (`OBJECTS.step` = 2,5 cellen) met 32 pixels per cel. Boomsprites (den, loof, berk) zijn
  192 × 192 pixels = 6 cellen, rotsblok 160 × 160 = 5 cellen, heg 128 = 4 cellen.
- Met `OBJECTS.scale` (config.js) wordt een boom 3,7–5,9 cellen breed, een rotsblok 2,5–4,3
  cellen. Een echte boomkruin is 8–12 m, een flink rotsblok 3–5 m.

### Voorstel
1. **Schaal** in `OBJECTS.scale`:

   | soort                  | nu          | nieuw       | breedte (cellen) |
   |------------------------|-------------|-------------|------------------|
   | den, loof, berk, palm  | 0,62–0,98   | 1,1–1,6     | 7–10             |
   | struik, heg, cactus    | 0,5–0,9     | 0,8–1,2     | 3–5              |
   | rots                   | 0,5–0,85    | 0,75–1,2    | 4–6              |

   De sprites worden dan ongeveer 20 pixels per cel. Op de normale zoom (ongeveer 11 schermpixels per
   cel) is dat nog scherp.
2. **Rooster mee:** grotere bomen op het oude rooster van 2,5 cellen worden een groene brij. Een
   eigen `step` voor hoge soorten (ongeveer 4–5 cellen) en de lage soorten (struiken) ertussen, zodat
   een bos uit duidelijke kruinen bestaat met hier en daar een struik.
3. **Niet over de rand van het bos heen:** hoge kruinen staan **boven** de tanks (`over`). Een grote
   kruin die over de rand van de begroeiing hangt, zou een tank op open grond verbergen terwijl het
   spel zegt dat hij zichtbaar is. Daarom:
   - bij het plaatsen de afstand tot de rand van de begroeiing meenemen (afstandsveld zoals in
     `plants-view.js`): grote bomen alleen waar de kruin binnen de begroeiing past, plus hoogstens
     ongeveer 1 cel overhang; aan de rand kleinere bomen en struiken (die liggen onder de tanks);
   - hetzelfde voor rotsblokken op de rand van een rotsveld (die liggen al onder de tanks, maar mogen
     geen open grond lijken te blokkeren).
4. **Omgeschoten bomen** (`-kapot`, `FELL.clearRadius` = 4 cellen): een kruin van 10 cellen is groter
   dan wat er wordt opgeruimd. Kijk of de kapotte boom en de vrijgekomen plek nog kloppen, en of de
   boom eromheen niet over de nieuwe doorgang heen hangt (dan na het omschieten de tegel opnieuw
   opbouwen, net als nu).
5. **Schaduw:** `OBJECTS.height.tall` (1,4) mee omhoog, ongeveer evenredig met de schaal.

Alleen weergave: de cellen (wat begroeiing of rots is, wat het zicht blokkeert) blijven hetzelfde,
dus de kaarten veranderen niet.

### Controle
Een zomerkaart met bos, Ardennen (dennen), El Alamein (rotsblokken): bomen duidelijk groter dan een
tank. Een tank die net naast een bos op open grond staat, is niet verborgen onder een kruin. Een boom
omschieten: de doorgang is te zien. `blitzView.bench()`: niet merkbaar trager (minder, maar grotere
sprites).

---

## §9 Geen rotsrand om de kaart: de kaart is gewoon een rechthoek (wens van de eigenaar)

### Wat de speler ziet
Om de hele kaart ligt een golvende rand van rots (4–13 cellen dik). De eigenaar wil dat het terrein
gewoon doorloopt: de kaart is een rechthoek zonder afscheiding van rots.

**Keuze van de eigenaar:** langs de hele rand ligt een **onbegaanbare strook van 2 tanks breed**. Het
terrein loopt daar gewoon door (gras, bos, water, weg: wat de kaartmaker er neerlegt), maar wordt
naar buiten toe snel donkerder: helder aan de binnenkant van de strook, **helemaal zwart** aan de
buitenrand van de kaart. Zo lijkt het alsof er nog meer land is, maar je kunt er niet in.

### Hoe het nu zit
- `makeBorder()` in `shared/mapgen.js` (rond regel 868) maakt alle cellen binnen een golvende
  randdikte (`4 + ruis·7 + ruis·2` cellen) tot `ROCK`. De kaartmaker bewaart ze in `border` en houdt
  er overal rekening mee: geen kenmerken, gebouwen, bases of gevaren op de rand, en de rand telt niet
  mee voor de terreinpercentages (`P`).
- `border` gaat mee in de wereld (`w.border`) en wordt gebruikt in `hazards.js` (rond regel 292,
  droppings niet op de rand) en in de telling van de kaartmaker (rond regel 40).
- Buiten de kaart houdt het spel tanks en kogels al tegen: `inBounds()` in `shared/movement.js`
  (rijden: geblokkeerd; kogel: `solid`). De rotsrand is dus niet nodig om de kaart dicht te houden.

### Wijziging
1. **Strookbreedte:** een nieuw getal in `shared/config.js`, bv. `EDGE = { band: 11 }`: 2 tanks breed
   (tankbreedte 2 × `TANK_WID` = 5,2 cellen, dus ongeveer 10–11 cellen). De strook ligt **binnen** de
   kaart (`G.W` × `G.H` blijft de hele kaart, inclusief strook), zodat de grond er gewoon getekend
   kan worden met dezelfde shader en objecten.
2. **Spelregel (shared, deterministisch):** een functie `playable(x, y)` in `shared/world.js`: binnen
   de kaart en niet in de strook. Gebruik die waar nu `inBounds()` de kaart dichthoudt:
   - rijden en graven (`shared/movement.js`): een tank kan geen cel in de strook bezetten (zijn hele
     voetafdruk, `tankCovers`, moet speelbaar zijn);
   - kogels: stoppen aan de binnenrand van de strook (zoals nu aan de kaartrand: `solid`);
   - gevaren en droppings (`hazards.js`), depots en kratten: alleen op speelbare cellen;
   - zicht mag wel de strook in (dat hoort bij de illusie), maar er staat nooit iets dat je moet
     zien.
   `inBounds()` zelf blijft wat hij is (de hele kaart), voor tekenen en arrays.
3. **Kaartmaker:** `makeBorder()` geen rots meer laten zetten. `border` wordt de strook plus een
   kleine marge erbinnen:
   - in de strook gewoon terrein, plassen, rotsvelden, begroeiing, en de rivieren en wegen die er
     doorheen naar de rand lopen, zodat het land echt lijkt door te lopen. **Geen** bases, gebouwen,
     dorpen, bruggen, depots of andere dingen die iets betekenen voor het spel;
   - de terreinpercentages (`P`) tellen alleen het speelbare deel; de strook vult de kaartmaker met
     hetzelfde terrein als ernaast (zelfde ruis, zelfde klassen), zodat er geen naad is;
   - bases: minimaal 3 T van de **binnenrand** van de strook (spec §6.4). Kijk of de afstandsregel
     tussen bases op kleine kaarten nog werkt: het speelbare deel is ongeveer even groot als nu
     binnen de rotsrand (strook 11 tegen rots 4–13 cellen).
   - routes en bereikbaarheid (spec §6.5) alleen over speelbare cellen.
4. **Donker naar de rand (alleen weergave):** over alles in de strook (grond, sporen, objecten,
   kruinen, water, weer) een verloop van **helder** aan de binnenrand naar **helemaal zwart** aan de
   buitenrand. Snel donkerder: bv. `1 - smoothstep(0, band, afstand tot de buitenrand)` met een
   kromme die het eerste stuk al flink donkerder maakt (een getal in `EDGE`, bv. `curve`).
   - Eén laag boven de wereld (onder de mist en de UI): vier verlopen langs de zijden en de hoeken
     (Pixi-sprites met een verloop, of een kleine shader), in wereldcoördinaten zodat hij met de
     camera meeschuift. Niet per laag apart.
   - Geen harde lijn of rand op de binnenrand: het verloop begint daar zacht.
   - De camera mag gewoon tot over de rand schuiven (je tank blijft in het midden); buiten de kaart
     is het zwart, en dat sluit naadloos aan op de zwarte buitenrand.
   - De vervaagde velden in de grondshader (`clampCell`, rond regel 145) mogen aan de buitenrand een
     rotsveld afronden; dat valt in het zwart weg.
5. **Minikaart:** alleen het speelbare deel, of de strook ook donker. Geen rotsrand meer.
6. **Retro** (`/retro`): kijk of die dezelfde kaartmaker gebruikt. Zo ja, dan daar de rotsrand
   houden (Tunneler had hem ook), bv. met een optie `rules.border` per map.

Dit verandert alle kaarten: vingerafdruk bijwerken (`node tests/fingerprint.mjs --write`),
`npm run test:gen -- "" 10` draaien, en README (kaartmaker, spelregels) en CLAUDE.md bijwerken.

### Controle
Elke stijl (zomer, winter, woestijn) en een kleine kaart:
- geen rotsrand; het terrein loopt door de strook heen en wordt snel donkerder, aan de buitenrand
  helemaal zwart, zonder zichtbare lijn op de binnenrand;
- je kunt de strook niet in rijden of graven (ook niet schuin of met de neus); een kogel stopt aan de
  binnenrand van de strook;
- in de strook staan geen bases, gebouwen, kratten of gevaren; wegen en rivieren lopen er wel
  doorheen naar de rand;
- de camera aan de rand: zwart buiten de kaart, naadloos;
- tests: een test die rijdt en schiet tegen de strook (`npm test`).

---

## Na afloop
- `npm test`. Alleen §6 en §9 veranderen de kaartmaker; zonder die twee hoort de vingerafdruk gelijk
  te blijven. Doe §6 en §9 samen of direct na elkaar, zodat de kaarten maar één keer veranderen.
- README "Uiterlijk per map" bijwerken als `LOOK.road` of `surface.rock` nieuwe velden krijgt.
