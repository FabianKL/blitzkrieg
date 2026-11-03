# Map Berlijn 1945: ontwerp, regels en prompts

Berlijn wordt een **straatgevecht**. Aan het begin is de stad een doolhof van huizenblokken: je ziet
weinig en kunt alleen door de straten. Hoe meer er kapotgeschoten wordt, hoe verder je kijkt en hoe
meer routes er ontstaan, dwars door blokken en binnenplaatsen heen. Vier iconische gebouwen maken
de stad herkenbaar en geven richting.

Dit document is voor twee lezers: **Claude Code** (hoofdstuk 1–5, de bouw) en **jij** (hoofdstuk 6,
de ChatGPT-prompts). Lees ook `CLAUDE.md` en `docs/SPEC-fortificaties.md` (barricades).

## 1. Indeling van de kaart

Coördinaten zijn fracties van de kaart (0–1), zoals in `shared/maps/berlijn.js`. Noord is boven.
De vier bases staan op de vaste plekken (0,18/0,82 × 0,25/0,75).

```
y 0.00 ┌──────────────────────────────────────────────────────┐
       │ blokken                                              │
y 0.15 │≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ Spree ≈≈║Moltkebrug║≈≈≈≈≈║≈≈≈≈≈≈≈≈│
       │  [basis A]            ┌────────┐           [basis C]  │
y 0.24 │  blokken              │RIJKSDAG│    blokken           │
       ├────────────────┐      └────────┘     │                │
       │  TIERGARTEN    │                     │Wilhelmstr.     │
y 0.50 │   [FLAKTOREN]  ║TOR║═══ Unter den Linden ═════════════│
       │                │                     │  ┌─────────┐   │
       ├────────────────┘     blokken         │  │KANSELARIJ│  │
y 0.75 │  [basis D]                           │  └─────────┘ [basis B]
y 0.88 │≈≈≈≈≈≈≈║≈≈≈≈≈≈≈≈≈ Landwehrkanaal ≈≈≈≈≈║≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈│
       │ blokken                                              │
y 1.00 └──────────────────────────────────────────────────────┘
       x 0     0.38 0.42                 0.60                1
```

| Element | Plek | Maat (cellen) | Rol |
| --- | --- | --- | --- |
| **Spree** | rivier op y 0,15, 2 T breed | – | water; twee bruggen: **Moltkebrug** (x 0,44) en één bij x 0,72 |
| **Landwehrkanaal** | rivier op y 0,88, 1,5 T breed | – | water; twee bruggen (x 0,30 en 0,60) |
| **Rijksdag** | midden x 0,45, y 0,24, net zuid van de Moltkebrug | 30 × 20 | iconisch gebouw, 6 segmenten |
| **Tiergarten** | x 0,03–0,38, y 0,30–0,70 | – | park met verbrande bomen, kraters; open terrein |
| **Flaktoren Zoo** | midden in de Tiergarten (0,18; 0,50) | 24 × 24 | blokkade, onverwoestbaar |
| **Brandenburger Tor** | x 0,40, y 0,50, oost-west georiënteerd: de doorgangen lopen west-oost | 8 × 48 (smal, lang noord-zuid) | 6 pijlers, 5 doorgangen van 7–8 cellen |
| **Unter den Linden** | boulevard y 0,50 van de Tor naar de oostrand, 3 T breed | – | brede straat met een middenstrook van (kapotte) lindebomen |
| **Wilhelmstraße** | straat x 0,60, van de Spree tot het kanaal, 2 T | – | noord-zuidas |
| **Rijkskanselarij** | oostkant van de Wilhelmstraße, midden y 0,64 | 40 × 10 | iconisch gebouw, 4 segmenten, lengte langs de straat |
| **Huizenblokken** | de rest | blokken van ca. 26 × 26 | gesloten blokken van segmenten rond een binnenplaats |
| **Barricades** | 6 kruispunten (zie fortificaties) | 10 × 3 | versperring |

**Vast en willekeurig.** Rivieren, bruggen, de vier iconische gebouwen, Tiergarten, Unter den Linden
en de Wilhelmstraße staan op vaste plekken (`features` met `fixed: true`). Het stratenrooster en de
blokken daartussen maakt de kaartmaker zoals nu met de kaartseed. Wijk alleen van de vaste plekken
af als iets niet past op de kaartgrootte `klein`; stel dan een oplossing voor (bijvoorbeeld de
flaktoren weglaten op klein).

## 2. Huizenblokken uit segmenten

Een blok is geen los gebouw meer maar een **ring van segmenten** rond een binnenplaats:

```
┌────┬──────┬──────┬────┐
│hoek│recht │recht │hoek│     hoek: 8 × 8 cellen
├────┘      binnen-  └────┤     recht: 10 × 8 cellen (gevel aan de straat, 8 diep)
│recht       plaats  recht│     binnenplaats: puin, kleine schuurtjes, een boom
├────┐               ┌────┤
│hoek│recht │recht │hoek│
└────┴──────┴──────┴────┘
```

- Elk segment is een eigen gebouw met eigen `hp` (`BERLIN.segmentHp`, voorstel 4).
- De binnenplaats is begaanbaar, maar alleen bereikbaar als er een segment kapot is. Zo schiet je
  een eigen route door de stad.
- Blokgrootte: 2–3 segmenten per zijde, afhankelijk van het rooster (`city.block` in config).
- Segmenten draaien mee: de gevel wijst altijd naar de straat.
- Ongeveer 1 op de 6 segmenten begint al als `half` of `puin` (de stad is al gebombardeerd); vast
  toeval uit de kaartseed.

## 3. Regels: hoe verwoesting de stad opent

Alleen voor Berlijn (`rules.ruins` in `berlijn.js`), zodat de andere maps niet veranderen:

| Stadium | hp | Rijden | Kogels | Zicht |
| --- | --- | --- | --- | --- |
| **heel** | bovenste derde | nee | stoppen | blokkeert |
| **half** | middelste derde | nee | stoppen | **je kijkt erdoorheen** (ruïne met gaten) |
| **puin** | 0 | ja, als zachte grond (puin) | vliegen erover | open |

- Dat is een kleine wijziging in `shared/vision.js`: een gebouwcel in stadium `half` blokkeert
  het zicht niet meer als `rules.ruins` aan staat. Server en browser rekenen hetzelfde (de `hp`
  staat al in de gedeelde gegevens).
- De bestaande gevaar-regel `facades` (instortende gevels) blijft. Een ingestorte gevel brengt het
  segment direct naar `puin` en geeft het stofwolkeffect.
- Iconische gebouwen bestaan ook uit segmenten, met meer hp (voorstel: Rijksdag 6 per segment,
  Rijkskanselarij 6, pijlers van de Tor 5). Zo gaan ze stuk voor stuk kapot en blijven ze lang
  herkenbaar.
- De flaktoren is een blokkade: onverwoestbaar.
- Dit raakt de gameplay. Laat de eigenaar de waarden eerst zien en wacht op akkoord.

## 4. Weergave

- **Stadia per segment uit één tekening.** Elk iconisch gebouw heeft drie volledige sprites
  (`heel`, `half`, `puin`), exact even groot. Per segment toont de code het stukje van de sprite
  dat bij zijn stadium hoort (een uitsnede op de plek van het segment). Zo kan de Rijksdag
  links nog heel en rechts al puin zijn.
- **Huizenblokken**: `blok-hoek-…` en `blok-recht-…` per stadium, gedraaid naar de straat.
- **Overgang naar een nieuw stadium**: stofwolk, stenen en splinters, kort schudden als het in je
  zicht ligt. Bij `puin` blijft er een paar seconden rook hangen.
- **Straten**: `asfalt` op de gewone straten, `kasseien` op Unter den Linden en de Wilhelmstraße,
  `plein` op de Pariser Platz voor de Tor, `puin` op binnenplaatsen. Stoeprand zoals nu
  (`look.road.curb`).
- **Decor** (alleen weergave, geen regels): verbrande tram en auto's langs de stoep, lantaarnpalen,
  aanplakzuilen, kraters, losse stenen. Vast toeval, niet op kruispunten.
- **Tiergarten**: de kapotte loofbomen en de nieuwe verbrande bomen; kraters.
- **Sfeer**: blijft zoals in `look` (grauw, stof, rook); de rook wordt dikker per ronde (bestaat al).
- Sprites in `public/assets/zomer/berlijn/`. Ontbreekt er een, teken dan de huidige vervanger.

## 5. Werkwijze voor Claude Code

1. Analyse en plan, wacht op akkoord (vooral hoofdstuk 3).
2. Kaartmaker: vaste kenmerken, segmentblokken, `rules.ruins`. `npm run test:gen -- berlijn 10`.
3. Zichtregel en tests voor de drie stadia.
4. Weergave met de sprites uit hoofdstuk 6 (en de terugval als ze er nog niet zijn).
5. Controleren in de browser: `?debug=alles` voor de hele stad, dan normaal spelen en een blok
   openschieten. Meet met `blitzView.bench()`.
6. README, CLAUDE.md, manifest en LEESMIJ bijwerken.

---

## 6. ChatGPT-prompts voor Berlijn

Doe alles in één gesprek. Upload eerst je dennen (stijl) en een screenshot van een zomermap (maat
en detail). Lever de plaatjes in `input/berlijn/`; ik zet ze op maat in `public/assets/zomer/berlijn/`.

### Startprompt
```
I am making top-down sprites for a WWII tank game set in Berlin, April 1945, during the final street battle. The first attached image shows the art style I want: seen exactly from directly above, hand-painted with rich but fine detail, soft light from the top left, a darker outline at the edges, no cast shadow on the ground, transparent background. The second image shows the scale and level of detail of the game map: keep every sprite as fine and as muted in colour as that map. Berlin is war-torn: grey, dusty, sooty, with broken roofs. Never draw flags, swastikas, eagles, signs, text or people. Please keep exactly this style for every image I ask for next. Reply only with "OK" for now.
```

De stijlzin staat al in elke prompt; je hoeft niets aan te vullen.

### Rijksdag → `rijksdag-heel`, `-half`, `-puin` (30 × 20 cellen)
```
Three versions of the Reichstag building in Berlin in 1945, stacked from top to bottom with clear empty space between them, each version exactly the same size and position, each about one and a half times as wide as it is deep. The building seen from directly above: a large rectangular stone building with a flat roof edge, four square corner towers, two inner courtyards, and in the centre the burnt-out dome as a skeleton of steel ribs with no glass. Top: damaged but standing, soot stains, some holes in the roof, the dome skeleton intact. Middle: half destroyed, large parts of the roof collapsed showing charred beams and rubble inside, one corner tower broken, the dome skeleton bent. Bottom: completely destroyed, a low flat field of stone rubble and twisted steel filling the same outline, only the stumps of the corner towers recognisable. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Tall portrait image.
```

### Brandenburger Tor → `tor-heel`, `-half`, `-puin` (48 × 8 cellen)
```
Three versions of the Brandenburg Gate seen from directly above, placed side by side from left to right with clear empty space between them, each version exactly the same size and position, each a long narrow shape about six times as long as it is wide, standing upright in the image (long side vertical). The gate seen from above: a long flat stone roof (attic) resting on six thick pillars, with five passages between the pillars running across the short side, the middle passage slightly wider, and on top in the middle the bronze Quadriga (four horses and a chariot) seen from above as a small dark-green shape. Left: damaged, soot and shell holes in the roof, the Quadriga damaged. Middle: half destroyed, the roof broken open above two passages, stone blocks fallen into the passages, the Quadriga gone. Right: completely destroyed, the roof collapsed into low rubble, only the six pillar stumps standing. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Wide landscape image.
```

### Flaktoren Zoo → `flaktoren` (24 × 24 cellen)
```
The Zoo flak tower in Berlin in 1945 seen from directly above, one single image centred in a square: a massive square concrete tower with a flat roof, a large round gun platform on each of the four corners with a heavy anti-aircraft gun, smaller platforms along the edges, thick grey concrete with soot and shell scars but completely intact. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Square image.
```

### Rijkskanselarij → `kanselarij-heel`, `-half`, `-puin` (40 × 10 cellen)
```
Three versions of a long monumental government building in Berlin in 1945 (the New Reich Chancellery), stacked from top to bottom with clear empty space between them, each version exactly the same size and position, each about four times as long as it is deep. Seen from directly above: a long, severe, flat-roofed stone building with a regular rhythm of roof sections, a slightly raised central section with a courtyard, two short wings at the ends. No symbols of any kind. Top: damaged but standing, soot stains, a few holes in the roof. Middle: half destroyed, the roof collapsed in several sections showing charred beams and rubble. Bottom: completely destroyed, a long low field of stone rubble filling the same outline. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Tall portrait image.
```

### Huizenblok, recht segment → `blok-recht-heel`, `-half`, `-puin` (10 × 8 cellen)
Maak er twee sets van (`blok-recht-a`, `blok-recht-b`) voor variatie.
```
Three versions of the same section of a Berlin apartment block (Mietshaus, five storeys) seen from directly above, placed side by side from left to right with clear empty space between them, each version exactly the same size and position, each slightly wider than it is deep. The street side is at the bottom edge, the courtyard side at the top edge. Seen from above: a dark grey slate and tar roof with two chimneys and a skylight, a thin stone cornice along the street side. Left: damaged, soot, a few missing slates. Middle: half destroyed, the roof caved in showing charred beams and the dark rooms below, broken masonry. Right: completely destroyed, a low flat heap of bricks, plaster and beams filling the same outline. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Wide landscape image.
```

### Huizenblok, hoeksegment → `blok-hoek-heel`, `-half`, `-puin` (8 × 8 cellen)
```
Three versions of the same corner section of a Berlin apartment block (five storeys) seen from directly above, placed side by side from left to right with clear empty space between them, each version exactly the same size and position, each square. The two street sides are the bottom edge and the left edge, the courtyard is towards the top right. Seen from above: a dark grey slate and tar roof with a small corner turret, chimneys, a thin stone cornice along both street sides. Left: damaged, soot, a few missing slates. Middle: half destroyed, the roof caved in showing charred beams, the turret broken. Right: completely destroyed, a low flat heap of bricks and beams filling the same square. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Wide landscape image.
```

### Barricades → `barricade-01..03`, `barricade-kapot` (10 × 3 cellen)
```
A 1 by 4 column of four Berlin street barricades from April 1945, stacked from top to bottom with clear empty space between them, each a long low shape about three times as long as it is wide, lying horizontally: 1) an overturned burnt-out tram car filled with rubble, 2) a wall of paving stones, timber beams and sandbags, 3) a row of steel anti-tank rails driven into the ground with rubble between them, 4) a barricade that has been blown apart, its pieces scattered low and flat. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Tall portrait image.
```

### Straatdecor → `decor-01..09` (2–4 cellen)
```
A 3 by 3 grid of nine small Berlin street objects from 1945, seen from directly above, each different, clear empty space between them: a bent street lamp lying on the ground, a round advertising column (Litfaßsäule) with torn posters, a burnt-out small car, a burnt-out truck cab, a pile of loose bricks, a broken cart, a fallen tree branch with leaves, a pile of paving stones, a small shell crater in asphalt. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Square image.
```

### Verbrande bomen (Tiergarten en Unter den Linden) → `boom-verbrand-01..09`
```
A 3 by 3 grid of nine different burnt and shell-damaged park trees in Berlin 1945, seen from directly above: blackened broken trunks with a few charred bare branches, some with a handful of surviving green leaves, ash and splinters around the base, each clearly different in shape and size, clear empty space between them. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Square image.
```

### Binnenplaats → `binnenplaats-01..06` (decor, 3–5 cellen)
```
A 3 by 2 grid of six small things found in the courtyard of a Berlin apartment block in 1945, seen from directly above, each different, clear empty space between them: a small wooden shed with a broken roof, a row of dustbins, a hand pump with a water trough, a pile of firewood, a small courtyard tree, a heap of household rubble with a mattress. Top-down orthographic view seen exactly from directly above, only roofs and tops visible, no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, muted grey and soot colours, no cast shadow on the ground, no ground, no streets, isolated on a fully transparent background, no flags, no symbols, no text. Wide landscape image.
```

### Plein (Pariser Platz) → `plein` (grondtextuur)
```
Large square grey granite paving slabs of a city square, laid in a straight grid, cracked and dusty, with soot stains, scattered small stone fragments and a few shell scars, seen exactly from directly above, a flat square seamless tileable ground texture for a game, the same density of detail over the whole image, no single large feature, no objects, even flat lighting with no shadows and no light direction, no vignette, no text, square image.
```

### Bruggen
Gebruik voor de Moltkebrug en de andere bruggen de nieuwe slanke **stalen brug** (zomer) uit de
brugprompts. Voor één brug over het kanaal het **stalen wrak**, alsof hij al is opgeblazen
(die is niet begaanbaar; de kaartmaker zorgt dat de andere kanaalbrug wel heel is).

### Controleren
- Zijn de drie stadia exact even groot en op dezelfde plek? Zo niet: *"Same image, but make all three versions exactly the same size and position."*
- Geen vlaggen, symbolen, tekst of mensen.
- Daken, geen gevels van opzij.
- Even fijn en grauw als de rest van de kaart.
