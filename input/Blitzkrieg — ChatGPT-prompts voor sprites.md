# Blitzkrieg — ChatGPT-prompts voor alle sprites

Oct 26, 2026 · @Faab

Elke prompt hieronder is compleet: kopieer hem in zijn geheel naar ChatGPT. Bestandsnamen en maten sluiten aan op de handleiding en de Claude Code-opdracht.

## Zo gebruik je deze prompts in ChatGPT

Werk **per stijl in één gesprek** (winter, zomer, woestijn, tanks). Dan onthoudt ChatGPT de stijl en passen alle plaatjes bij elkaar.

1. **Begin elk gesprek met je dennen als referentie.** Upload het plaatje met de 9 dennen en plak dit eerst:

```
I am making top-down sprites for a WWII tank game. The attached image shows the art style I want for every sprite in this conversation: seen exactly from directly above, hand-painted with rich detail, soft light from the top left, a darker outline at the edge of each object, no cast shadow on the ground, transparent background. Please keep exactly this style, level of detail and lighting for every image I ask for next. Reply only with "OK" for now.
```

2. **Plak daarna één prompt per keer** uit dit document. Wacht op het plaatje voor je de volgende stuurt.
3. **Klopt iets niet, verbeter dan in hetzelfde gesprek**, bijvoorbeeld: "Same image, but remove the shadow on the ground" of "Same, but seen exactly from above, not from an angle".
4. **Download als PNG** en stuur het hier. Dan snijd ik het uit, zet het op maat en voeg het toe aan de atlas.

**Veelvoorkomende correcties**

| Probleem | Plak dit |
| --- | --- |
| Schuine kijkhoek | `Redo it seen exactly from directly above, a perfect 90-degree overhead view, no sides visible.` |
| Schaduw op de grond | `Remove all shadows on the ground around the objects; keep only the shading on the objects themselves.` |
| Achtergrond niet transparant | `Make the background fully transparent, with nothing around the objects.` |
| Objecten raken elkaar | `Leave clear empty space between all objects so each can be cut out separately.` |
| Te weinig variatie | `Make each one clearly different in shape and size.` |

## Bomen en begroeiing

Een raster van 3 × 3 geeft 9 varianten per keer. De dennen voor de winter heb je al (`den-01..09`).

### Winter

**Berk** (Leningrad) → `winter/objects/berk-01..09`

```
A 3 by 3 grid of nine different bare winter birch trees, each seen as an open, airy crown of thin grey-brown branches spreading out from the centre, patches of fresh snow resting on the thicker branches, a hint of white bark with black marks at the very centre, the crown partly see-through, each tree clearly different in shape and size, clear empty space between all trees. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each tree, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Afgeknapte den** (na een barrage) → `winter/objects/den-kapot-01..03`

```
A 3 by 1 row of three shell-damaged spruce trees, the crown blown off and splintered, a jagged pale wooden stump in the centre with broken branches and scattered dark green needles lying around it, some snow knocked off onto the debris, each one different, clear empty space between them. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Afgeknapte berk** → `winter/objects/berk-kapot-01..03`

```
A 3 by 1 row of three shell-damaged birch trees, the crown broken off, a splintered white birch stump with black marks in the centre and a few snapped grey branches lying around it on patches of snow, each one different, clear empty space between them. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Waterplanten in de winter.** Alleen decoratie: ze blokkeren geen zicht en houden niets tegen. Canvas 96 × 96 px.

**Bevroren riet aan de oever** → `winter/objects/oeverriet-01..09`

```
A 3 by 3 grid of nine different low clumps of frozen reeds and rushes at the edge of a frozen river in winter, each a roughly round clump of broken, bent straw-brown and grey reed stalks lying flat in all directions, frost and small caps of snow on the stalks, low to the ground, each clump clearly different in shape and size, clear empty space between all clumps. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each clump, no cast shadow on the ground, no ground, no ice, isolated on a fully transparent background, no text. Square image.
```

**Ingevroren bladeren in het ijs** (op ijs en bevroren water) → `winter/objects/ijsblad-01..09`

```
A 3 by 3 grid of nine different small groups of dead water lily leaves and pondweed frozen into clear river ice, each a loose group of round dark brown and dull olive leaves seen through a thin milky layer of ice, a few tiny trapped air bubbles and fine frost around them, flat with no height, each group clearly different in shape and size, clear empty space between all groups. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft even light, no cast shadow, no surrounding ice sheet, isolated on a fully transparent background, no text. Square image.
```

### Zomer

**Loofboom** (Grebbeberg, Carentan, Arnhem, Oder, Berlijn) → `zomer/objects/loof-01..09`

```
A 3 by 3 grid of nine different deciduous trees in early summer (oak, beech, lime and apple), each seen as a full round leafy crown with layered clusters of leaves, rich varied greens with lighter, sunlit leaves on the top-left side and deeper green on the bottom-right, each tree clearly different in shape and size, clear empty space between all trees. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each tree, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Heg / bocage** (Carentan) → `zomer/objects/heg-01..09`

```
A 3 by 3 grid of nine dense hedgerow segments from the Normandy bocage, each a roughly round clump of thick tangled shrubs, brambles, hawthorn and small saplings, dark and bright greens mixed with a few white flowers, made so that several clumps placed next to each other form one continuous hedge, clear empty space between all clumps. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each clump, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Den in de zomer** (Barbarossa, Koersk) → `zomer/objects/den-01..09`

```
A 3 by 3 grid of nine different pine and spruce trees in summer, each seen as a round star-shaped crown of dense dark green needles with lighter green new growth at the tips, each tree clearly different in shape and size, clear empty space between all trees. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each tree, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Berk in de zomer** (Barbarossa, Koersk) → `zomer/objects/berk-01..09`

```
A 3 by 3 grid of nine different summer birch trees, each seen as a light, open crown of small fresh bright green leaves on thin branches, a hint of white bark at the centre, the crown slightly see-through, each tree clearly different in shape and size, clear empty space between all trees. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each tree, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Afgeknapte loofboom** → `zomer/objects/loof-kapot-01..03`

```
A 3 by 1 row of three shell-damaged deciduous trees, the crown blown away, a splintered pale wooden trunk in the centre with snapped branches and torn green leaves scattered around it, each one different, clear empty space between them. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Waterplanten in de zomer.** Alleen decoratie: ze blokkeren geen zicht en houden niets tegen. Canvas 96 × 96 px.

**Waterlelies op het water** → `zomer/objects/waterlelie-01..09`

```
A 3 by 3 grid of nine different small groups of water lilies floating flat on the water surface, each a loose cluster of round glossy green lily pads with a notch, a few pads curling up at the edge, some with a white or pale yellow flower, a little green duckweed between the pads, flat with no height, each group clearly different in shape and size, clear empty space between all groups. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each group, no cast shadow, no water, isolated on a fully transparent background, no text. Square image.
```

**Biezen en dotterbloemen aan de oever** → `zomer/objects/oeverplant-01..09`

```
A 3 by 3 grid of nine different low clumps of riverbank plants in early summer, each a roughly round clump of green rushes and sedges with marsh marigolds (small bright yellow flowers among round dark green leaves) and a few forget-me-nots, low and lush, each clump clearly different in shape and size, clear empty space between all clumps. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each clump, no cast shadow on the ground, no ground, no water, isolated on a fully transparent background, no text. Square image.
```

### Woestijn

**Struik** (El Alamein) → `woestijn/objects/struik-01..09`

```
A 3 by 3 grid of nine different dry North African desert shrubs and camel thorn bushes, each a low, sparse, roughly round tangle of dusty olive-green and grey-brown twigs with tiny leaves, a few with small dry yellow flowers, each one clearly different in shape and size, clear empty space between all shrubs. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each shrub, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Kapotte struik** → `woestijn/objects/struik-kapot-01..03`

```
A 3 by 1 row of three desert shrubs destroyed by shellfire, flattened and charred grey-brown twigs scattered outwards from a blackened centre, each one different, clear empty space between them. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Cactus** → `woestijn/objects/cactus-01..09`. Neem een **vijgcactus** (opuntia): die groeit echt in Noord-Afrika. De bekende zuilcactus uit westerns komt alleen in Amerika voor. In het spel is een cactus gewoon begroeiing, net als een struik: hij blokkeert zicht en je kunt hem wegschieten.

```
A 3 by 3 grid of nine different prickly pear cactus clumps (Opuntia) growing in the North African desert, each a low, roughly round cluster of flat oval blue-green pads with small spines, a few pads with red-purple fruits or yellow flowers on the edges, some dry brown pads at the base, each clump clearly different in shape and size, clear empty space between all clumps. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each clump, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Kapotte cactus** → `woestijn/objects/cactus-kapot-01..03`

```
A 3 by 1 row of three prickly pear cactus clumps destroyed by shellfire, torn and scattered blue-green pads lying flat, some split open and wet inside, a few blackened by fire, each one different, clear empty space between them. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

## Rotsen

Rotsen zijn obstakels, dus de rand moet duidelijk donkerder zijn dan het midden. Vraag om een mix van losse blokken en groepjes.

**Winter** → `winter/objects/rots-01..09`

```
A 3 by 3 grid of nine different grey granite boulders and rock outcrops, rough cracked surfaces with sharp edges, a cap of fresh white snow on the top-left side of each rock and a little snow drifted into the cracks, a mix of single large boulders, long flat slabs and clusters of two or three stones, the edge of each rock clearly darker than its top, each one clearly different in shape and size, clear empty space between all rocks. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Zomer** → `zomer/objects/rots-01..09`

```
A 3 by 3 grid of nine different weathered grey-brown boulders and rock outcrops, rounded and cracked surfaces with patches of green moss and pale lichen, small tufts of grass and weeds growing at the base, a mix of single large boulders, long flat slabs and clusters of two or three stones, the edge of each rock clearly darker than its top, each one clearly different in shape and size, clear empty space between all rocks. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

**Woestijn** → `woestijn/objects/rots-01..09`

```
A 3 by 3 grid of nine different sun-bleached sandstone and limestone rocks from the North African desert, warm ochre, pale beige and rust tones, wind-eroded horizontal layers and pits, a little pale sand drifted against one side, a mix of single large rocks, low flat ridges and clusters of two or three stones, the edge of each rock clearly darker than its top, each one clearly different in shape and size, clear empty space between all rocks. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Square image.
```

## Basis

Per stijl vier opdrachten: muurstuk, hoekpaal + deurpost, en de losse spullen. ChatGPT maakt geen echt naadloze strook, dus die maak ik naadloos als je hem stuurt. Vraag daarom om een lange strook: dan is er genoeg om uit te snijden.

### Winter: houten palissade met sneeuw → `winter/bases/`

**Muurstuk** → `muur.png`

```
A long straight horizontal strip of a defensive palisade wall made of thick round pine logs lying side by side along the length of the wall, with bark texture and rope lashings every few logs, a thick layer of fresh white snow along the top of the logs, the strip runs across the full width of the image, about six times as long as it is wide, the pattern looks the same along the whole length so it can be repeated. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along both long edges, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Hoekpaal en deurpost** → `hoek.png`, `deurpost.png`

```
Two objects side by side with clear empty space between them. Left: a thick wooden corner post of a log palisade, seen as a large round cut log end with visible tree rings, bark around the edge and a cap of fresh snow. Right: a slightly smaller gate post of the same palisade, a round log end with an iron hinge band and a cap of snow. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Losse spullen** → `spul-01..06.png`

```
A 3 by 2 grid of six WWII winter supply items for a tank camp, each one separate: a stack of white-painted jerry cans with snow on them, an open wooden ammunition crate with tank shells, three dark green oil drums standing together, a pile of sandbags with snow, a crate covered by a tied white tarp, a small stack of firewood logs. Clear empty space between all items. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each item, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text, no markings. Wide landscape image.
```

### Zomer: zandzakken met houten balken → `zomer/bases/`

**Muurstuk** → `muur.png`

```
A long straight horizontal strip of a military field wall made of stacked burlap sandbags in khaki and olive tones, held in place by horizontal wooden planks and short wooden stakes every few bags, a few tufts of grass growing between the bags, the strip runs across the full width of the image, about six times as long as it is wide, the pattern looks the same along the whole length so it can be repeated. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along both long edges, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Hoekpaal en deurpost** → `hoek.png`, `deurpost.png`

```
Two objects side by side with clear empty space between them. Left: the corner of a sandbag field wall, a round heap of stacked burlap sandbags around a thick wooden post in khaki and olive tones. Right: a gate post of the same wall, a square wooden post with an iron hinge and a few sandbags at its base. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Losse spullen** → `spul-01..06.png`

```
A 3 by 2 grid of six WWII supply items for a tank camp, each one separate: a stack of olive green jerry cans, an open wooden ammunition crate with tank shells, three olive drab oil drums standing together, a pile of khaki sandbags, a crate covered by a tied green canvas tarp, a field radio with a coiled cable. Clear empty space between all items. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each item, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text, no markings. Wide landscape image.
```

### Woestijn: zandzakken met camouflagenet → `woestijn/bases/`

**Muurstuk** → `muur.png`

```
A long straight horizontal strip of a desert military wall made of pale sun-bleached sandbags, with a band of tan and sand-coloured camouflage netting draped along the top and a little drifted sand against the bags, the strip runs across the full width of the image, about six times as long as it is wide, the pattern looks the same along the whole length so it can be repeated. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along both long edges, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Hoekpaal en deurpost** → `hoek.png`, `deurpost.png`

```
Two objects side by side with clear empty space between them. Left: the corner of a desert sandbag wall, a round heap of pale sandbags with a fuel drum filled with sand in the middle and camouflage netting over it. Right: a gate post of the same wall, a sand-filled oil drum with a few sandbags at its base. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Losse spullen** → `spul-01..06.png`

```
A 3 by 2 grid of six WWII desert supply items for a tank camp, each one separate: a stack of sand-coloured jerry cans, an open wooden ammunition crate with tank shells, three rusty fuel drums standing together, a pile of pale sandbags, a crate covered by a tied tan canvas tarp, a coil of barbed wire on wooden stakes. Clear empty space between all items. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each item, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text, no markings. Wide landscape image.
```

## Gebouwen en dorpen

Elk gebouw komt in **één plaatje met drie stadia naast elkaar**: heel, half kapotgeschoten en volledig stuk. Het spel weet per gebouw hoeveel treffers het nog kan hebben (4 in totaal), dus de code kiest zelf het stadium: 4–3 = heel, 2–1 = half kapot, 0 = puin. Puin is in het spel **berijdbaar**, dus het derde stadium moet een lage, platte puinhoop zijn zonder muren die nog overeind staan.

Ik heb als derde gebouw een **windmolen** gekozen. Die past bij Grebbeberg, Normandië en de Russische vlakte, en hij is van ver herkenbaar, net als de kerk.

| Gebouw | Bestand | Grondvlak (cellen) | Canvas per stadium (px) |
| --- | --- | --- | --- |
| Kerk | `kerk.png` | 10 × 15 | 320 × 480 |
| Boerderij | `boerderij.png` | 11 × 10 | 352 × 320 |
| Windmolen | `molen.png` | 10 × 10 | 320 × 320 |
| Woonhuis | `huis-woon.png` | 6 × 6 | 192 × 192 |
| Huizenrij | `huis-rij.png` | 9 × 5 | 288 × 160 |
| Schuur | `huis-schuur.png` | 7 × 9 | 224 × 288 |

Alles komt in `zomer/buildings/` en `winter/buildings/`. Ik snijd de drie stadia los en zet ze op de juiste maat.

**Regels voor gebouwen**

- Het dak (of de puinhoop) **vult het hele grondvlak**. Steekt er iets buiten, dan lijkt het een obstakel waar je gewoon kunt rijden.
- De drie stadia hebben **precies dezelfde maat en plek**, zodat het gebouw niet verspringt als het geraakt wordt.
- Recht van bovenaf: je ziet daken, geen gevels.

### Zomer

Maak ze in je zomergesprek. De winterversie maak je daarna met één vervolgprompt (zie Winter).

**Kerk** → `zomer/buildings/kerk.png`

```
Three versions of the same small stone village church from northern France, placed side by side in a row from left to right with clear empty space between them, each version exactly the same size and position, the church about one and a half times as long as it is wide with the square bell tower at the top end. Left: intact, a steep dark grey slate roof with a ridge along the length, a square stone tower with a pointed slate spire, small dormers and lead gutters. Middle: half destroyed by shellfire, large holes in the roof showing charred wooden rafters, part of the spire broken off, scattered slates and stones on the roof, a few black scorch marks. Right: completely destroyed, a low flat heap of grey stone rubble, broken slates and burnt beams filling the same outline, no walls left standing. Top-down orthographic view seen exactly from directly above, only roofs visible and no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its outline completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Boerderij** → `zomer/buildings/boerderij.png`

```
Three versions of the same farmhouse with an attached barn from the Dutch and northern French countryside, placed side by side in a row from left to right with clear empty space between them, each version exactly the same size and position, the farm almost square, an L-shaped roof with a small enclosed farmyard in the corner. Left: intact, a red-brown clay tile roof on the house and a large thatched roof on the barn, a brick chimney, a small cobbled yard with a cart and a water trough. Middle: half destroyed by shellfire, the thatch partly burnt away showing blackened rafters, holes in the tile roof, broken tiles and straw scattered over the roof and yard, the chimney toppled. Right: completely destroyed, a low flat heap of red bricks, broken tiles, charred straw and burnt beams filling the same outline, no walls left standing. Top-down orthographic view seen exactly from directly above, only roofs visible and no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its outline completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Windmolen** → `zomer/buildings/molen.png`

```
Three versions of the same old brick tower windmill, placed side by side in a row from left to right with clear empty space between them, each version exactly the same size and position, seen as a round building with a conical cap and four long sails. Left: intact, a round dark thatched or wooden cap in the centre, four long lattice sails with canvas forming a large X across the whole square, a low brick wall around the base. Middle: half destroyed by shellfire, two sails broken off and lying beside the mill, the remaining sails torn and bent, a large hole in the cap showing the wooden gears inside. Right: completely destroyed, a low flat round heap of red bricks, splintered sail lattice and burnt beams filling the same outline, no walls left standing. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its square completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Woonhuis** → `zomer/buildings/huis-woon.png`

```
Three versions of the same small square detached village house from northern France, placed side by side in a row from left to right with clear empty space between them, each version exactly the same size and position. Left: intact, a hipped roof of red-brown clay tiles meeting in a point at the centre, one brick chimney, a little moss on the tiles. Middle: half destroyed by shellfire, a large hole in one side of the roof showing broken rafters and the dark room below, loose tiles scattered over the rest of the roof, black scorch marks. Right: completely destroyed, a low flat heap of bricks, broken tiles and splintered wood filling the same square, no walls left standing. Top-down orthographic view seen exactly from directly above, only the roof visible and no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its square completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

**Huizenrij** → `zomer/buildings/huis-rij.png`

```
Three versions of the same short row of three joined village houses, placed one above the other from top to bottom with clear empty space between them, each version exactly the same size and position, each row almost twice as long as it is wide. Top: intact, three gabled roofs side by side in slightly different tile colours (red-brown, dark grey slate, orange), three chimneys, a ridge running along the length of the row. Middle: half destroyed by shellfire, the middle roof caved in showing broken rafters, holes in the other roofs, scattered tiles and bricks. Bottom: completely destroyed, a long low flat heap of bricks, tiles and burnt beams filling the same outline, no walls left standing. Top-down orthographic view seen exactly from directly above, only roofs visible and no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its outline completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Tall portrait image.
```

**Schuur** → `zomer/buildings/huis-schuur.png`

```
Three versions of the same large wooden farm barn, placed side by side in a row from left to right with clear empty space between them, each version exactly the same size and position, the barn somewhat longer than it is wide with the ridge running along the length. Left: intact, a roof of weathered dark wooden planks and patched corrugated iron, a hay hatch at one end, moss along the ridge. Middle: half destroyed by shellfire, part of the roof torn open showing wooden beams and loose hay inside, planks and iron sheets bent and scattered, scorch marks. Right: completely destroyed, a low flat heap of charred planks, twisted iron sheets and burnt hay filling the same outline, nothing left standing. Top-down orthographic view seen exactly from directly above, only the roof visible and no walls seen from the side, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, each version fills its outline completely, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text. Wide landscape image.
```

### Winter

Maak de winterversie direct na de zomerversie, in **hetzelfde gesprek**, met deze vervolgprompt. Dan blijven vorm en maat gelijk:

```
The same image as the previous one, with exactly the same buildings, shapes, sizes and positions, but now in deep winter: a thick layer of fresh white snow on all roofs with the roof ridges, chimneys and tower edges still showing through, icicles along the gutters, snow lying on the rubble in the middle and right versions, the burnt parts dark against the snow. Keep the transparent background, no cast shadow, no ground, no text.
```

Sla de winterversie op onder dezelfde naam in `winter/buildings/`.

## Brandstof en munitie op de kaart

Het spel kent drie plekken waar je brandstof of munitie haalt. Elke plek heeft een **volle** en een **lege** versie. De B- en M-badge met de pulserende ring erboven blijft door de code getekend, dus zet geen letters of symbolen in de plaatjes.

| Wat | Map | Bestanden | Canvas (px) |
| --- | --- | --- | --- |
| Brandstofdepot (stapel jerrycans) | Ardennen | `winter/objects/brandstof-vol.png`, `brandstof-leeg.png` | 192 × 192 |
| Brandstofdepot zomer (vaten en jerrycans) | elke zomermap met brandstofdepots | zomer/objects/brandstof-vol.png, brandstof-leeg.png | 192 × 192 |
| Munitiedepot (rij kisten) | Grebbeberg | `zomer/objects/munitie-depot.png` | 256 × 128 |
| Dropping: krat | Arnhem | `zomer/objects/krat-brandstof.png`, `krat-munitie.png`, `krat-leeg.png` | 128 × 128 |
| Dropping: parachute | Arnhem | `zomer/objects/parachute.png` | 192 × 192 |

De parachute is een apart plaatje: de code legt hem naast een volle krat en haalt hem weg zodra de krat leeg is. Het munitiedepot raakt niet leeg, dus daar is één versie genoeg.

**Brandstofdepot vol** (Ardennen) → `winter/objects/brandstof-vol.png`

```
A WWII fuel dump for a game, seen exactly from directly above: a neat square stack of about twelve olive green jerry cans standing upright in rows on a few wooden planks, some cans with a light dusting of snow on top, a canvas tarp half pulled back from one corner, a coiled fuel hose and a hand pump beside the stack. The whole dump fits in a square and is centred with empty space around it. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Square image.
```

**Brandstofdepot leeg** → `winter/objects/brandstof-leeg.png`

```
The same WWII fuel dump as in the previous image, in exactly the same position and size, but now empty and abandoned: only a few dented jerry cans left, knocked over and lying on their sides with open caps, the wooden planks bare, the tarp crumpled, a dark patch of spilled fuel on the planks, snow on everything. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Square image.
```

**Brandstofdepot vol, zomer** → `zomer/objects/brandstof-vol.png`. Nu gebruikt alleen de Ardennen depots; met deze versie kan elke zomermap ze krijgen (in `config.js`: `scarce: { type: 'fuelDepots' }`).

```
A WWII summer fuel dump for a game, seen exactly from directly above: four olive drab 200-litre fuel drums standing upright in a square, surrounded by a neat stack of about ten olive green jerry cans in rows on wooden pallets, a low ring of khaki sandbags around part of the dump, a camouflage net with a few green leaves draped over one corner, a fuel hose and a hand pump beside the drums, a few tufts of grass at the edges. The whole dump fits in a square and is centred with empty space around it. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Square image.
```

**Brandstofdepot leeg, zomer** → `zomer/objects/brandstof-leeg.png`

```
The same WWII summer fuel dump as in the previous image, in exactly the same position and size, but now empty and abandoned: the fuel drums knocked over and lying on their sides with open caps, only a few dented jerry cans scattered on the bare wooden pallets, the camouflage net torn and crumpled, a dark patch of spilled fuel on the pallets, the sandbags partly collapsed. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Square image.
```

**Munitiedepot** (Grebbeberg, mei 1940) → `zomer/objects/munitie-depot.png`

```
A 1940 army ammunition dump for a game, seen exactly from directly above: a long low row of stacked wooden ammunition crates with rope handles and metal corner fittings, two crates opened showing rows of brass tank shells, a few loose shells in a wooden rack, a canvas tarp partly covering one end, sandbags along one long side. The whole dump is about twice as long as it is wide, laid out from left to right and centred with empty space around it. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Wide landscape image.
```

**Dropping: kratten** (Market Garden) → `zomer/objects/krat-brandstof.png`, `krat-munitie.png`, `krat-leeg.png`

```
A 3 by 1 row of three WWII airborne supply containers that have just landed, seen exactly from directly above, each one separate with clear empty space between them. Left: a long olive green metal airdrop container with its lid open, packed with jerry cans. Middle: the same kind of container with its lid open, packed with wooden ammunition boxes and brass tank shells. Right: the same container opened and empty, lid thrown back, a few loose straps and torn packing inside. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each container, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Wide landscape image.
```

**Dropping: parachute** → `zomer/objects/parachute.png`

```
A collapsed WWII supply parachute lying flat on the ground after landing, seen exactly from directly above: a large crumpled canopy of khaki and white panels in soft folds, its suspension lines gathered together and running off to one side where a container would be attached. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no ground, isolated on a fully transparent background, no markings, no letters, no text. Square image.
```

## Bruggen

Een brug bestaat uit drie delen naast elkaar: begin, middenstuk en eind. De code herhaalt het middenstuk tot de brug lang genoeg is en draait hem in de richting van de weg. Vraag de brug daarom **liggend** (van links naar rechts) en **zonder water eronder**: het water tekent het spel zelf. El Alamein heeft geen bruggen.

**Zomer: stenen dorpsbrug** (Grebbeberg, Carentan, Oder) → `zomer/bridges/steen-begin`, `-midden`, `-eind`

```
Three parts of one old stone road bridge laid out in a horizontal row from left to right, with a small empty gap between the parts: on the left the start of the bridge where the road comes onto it, in the middle one straight section of the bridge deck that can be repeated, on the right the end of the bridge. The deck is grey cobblestone with low stone parapet walls along both long sides, moss in the joints, the road runs from left to right. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along the edges, no water, no riverbank, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

**Zomer: stalen brug** (Arnhem) → `zomer/bridges/staal-begin`, `-midden`, `-eind`

```
Three parts of one WWII steel road bridge laid out in a horizontal row from left to right, with a small empty gap between the parts: on the left the concrete ramp where the road comes onto the bridge, in the middle one straight section of the bridge that can be repeated, on the right the concrete ramp at the other end. The deck is dark asphalt with steel girders, rivets and railings along both long sides, painted dark grey-green with rust streaks, the road runs from left to right. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along the edges, no water, no riverbank, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

**Winter: houten brug met sneeuw** (Leningrad) → `winter/bridges/hout-begin`, `-midden`, `-eind`

```
Three parts of one wooden military bridge in winter laid out in a horizontal row from left to right, with a small empty gap between the parts: on the left the start of the bridge where the road comes onto it, in the middle one straight section of the bridge deck that can be repeated, on the right the end of the bridge. The deck is made of heavy wooden planks laid across the bridge with two tyre tracks pressed into a thin layer of snow, log railings along both long sides with snow on top, the road runs from left to right. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along the edges, no water, no ice, no riverbank, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

**Winter: stenen brug met sneeuw** (Ardennen) → `winter/bridges/steen-begin`, `-midden`, `-eind`

```
Three parts of one old stone road bridge in winter laid out in a horizontal row from left to right, with a small empty gap between the parts: on the left the start of the bridge where the road comes onto it, in the middle one straight section of the bridge deck that can be repeated, on the right the end of the bridge. The deck is grey cobblestone with trampled snow and two dark wheel tracks, low stone parapet walls along both long sides with fresh snow on top, the road runs from left to right. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along the edges, no water, no riverbank, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

**Opgeblazen brug** (per brugsoort; vervang het materiaal) → `<stijl>/bridges/<soort>-wrak`

```
The wreck of a blown-up stone road bridge, laid out horizontally from left to right: the two ends of the bridge still standing on the left and right, the middle collapsed into broken slabs of stone and cobblestone, twisted iron reinforcement bars and scattered rubble with gaps between the pieces, a few blackened scorch marks. Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline along the edges, no water, no riverbank, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

## Tanks

Maak alle tanks in **één apart gesprek**. Upload bij elke tank een bovenaanzicht of bouwtekening van de echte tank (zoek op "\<tank> top view blueprint"), anders verzint ChatGPT details. Vraag **één tank per plaatje**.

**Start van het tankgesprek** (upload je dennen en `sjabloon-tank.png`):

```
I am making top-down sprites for a WWII tank game. The first attached image shows the art style I want: hand-painted with rich detail, soft light from the top left, a darker outline at the edge, no cast shadow, transparent background. The second image is a layout template: every tank must be seen exactly from directly above, pointing to the right, with the middle of the hull in the middle of a square image, the tracks along the top and bottom of the hull, and the gun sticking out to the right. For every tank I ask for next I will attach a top-view reference of the real tank; follow its shape and proportions exactly. Never add markings, crosses, stars, numbers or text, because the game adds those itself. Reply only with "OK" for now.
```

**Na elk plaatje controleren**: geen schuine kijkhoek, het juiste aantal loopwielen, één rechte loop, en niets op de grond.

### Prompts per tank

**Landsverk L-60** (Grebbeberg) → `tanks/landsverk/tank.png`

```
A top-down game sprite of a Swedish Landsverk L-60 light tank from 1940, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its small gun pointing straight to the right. Small boxy riveted hull with a sloped front, a small angular turret slightly offset, narrow tracks on both long sides, engine grilles at the back, tools strapped to the hull. Drab grey-green paint with light wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no stars, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Panzer II** (Grebbeberg) → `tanks/panzer2/tank.png`

```
A top-down game sprite of a German Panzer II Ausf. C light tank from 1940, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its small 20 mm gun pointing straight to the right. Narrow riveted hull, small turret offset to the left side, a commander's cupola, narrow tracks on both long sides, engine deck with grilles at the back, a spare wheel and tools on the hull. Dark grey paint with light dust and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no stars, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**T-34** (Barbarossa, Koersk, Oder, Berlijn) → `tanks/t34/tank.png`

```
A top-down game sprite of a Soviet T-34/76 medium tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its 76 mm gun pointing straight to the right. Wide hull with sloped armour, a hexagonal turret set towards the front with two round roof hatches, wide tracks on both long sides, a large engine deck with grilles and a round exhaust at the back, two external fuel tanks on the rear sides. Dark green paint with mud and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no stars, no slogans, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**T-34 winter** (Leningrad) → `tanks/t34/tank-winter.png`

```
The same Soviet T-34/76 tank as before, in exactly the same position, size and shape, but now painted with a rough, hand-brushed white winter whitewash over the dark green, the green showing through at worn edges, hatches and tracks, a little snow in the corners of the engine deck. Top-down, seen exactly from directly above, pointing to the right, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no markings, no numbers, no stars, no text, isolated on a fully transparent background, square image.
```

**Panzer III** (Barbarossa) → `tanks/panzer3/tank.png`

```
A top-down game sprite of a German Panzer III Ausf. J medium tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its 50 mm gun pointing straight to the right. Box-shaped hull, a central turret with a commander's cupola at the back and side hatches, tracks on both long sides, engine deck with two large hatches and grilles at the back, a storage box on the back of the turret, tools and a jack on the hull. Dark grey paint with dust and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Panzer III woestijn** (El Alamein) → `tanks/panzer3/tank-woestijn.png`

```
The same German Panzer III tank as before, in exactly the same position, size and shape, but now in North African desert colours: sandy tan paint, sun-bleached and dusty, with a stack of jerry cans and a rolled tarp strapped to the engine deck. Top-down, seen exactly from directly above, pointing to the right, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image.
```

**Crusader** (El Alamein) → `tanks/crusader/tank.png`

```
A top-down game sprite of a British Crusader Mk III cruiser tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its 6-pounder gun pointing straight to the right. Long low hull, a flat many-sided turret, tracks on both long sides, a long engine deck with grilles at the back, a sun shield and bedrolls strapped on. Pale sand paint with a disruptive camouflage pattern of blue-grey and dark brown patches, dusty and worn. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no roundels, no numbers, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Panzer IV** (Leningrad, Arnhem, Berlijn) → `tanks/panzer4/tank.png`

```
A top-down game sprite of a German Panzer IV Ausf. H medium tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its long 75 mm gun with muzzle brake pointing straight to the right. Box-shaped hull, a turret with a commander's cupola at the back, armour side skirts (Schürzen) along the hull and around the turret, tracks on both long sides, engine deck with grilles at the back, spare track links on the front. Dark grey paint with dust and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Panzer IV camo** (Carentan) → `tanks/panzer4/tank-camo.png`

```
The same German Panzer IV Ausf. H tank as before, in exactly the same position, size and shape, but now in 1944 Normandy camouflage: dark yellow base paint with wavy olive green and red-brown stripes, a few fresh leafy branches tied onto the hull and turret for camouflage. Top-down, seen exactly from directly above, pointing to the right, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image.
```

**Tiger** (Koersk) → `tanks/tiger/tank.png`

```
A top-down game sprite of a German Tiger I heavy tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its long 88 mm gun with a large muzzle brake pointing straight to the right. Very wide flat box-shaped hull, a large rounded turret with a commander's cupola and a storage box at the back, very wide tracks on both long sides, a big engine deck with round grilles at the back, tow cables along the hull. Dark yellow paint with soft brown camouflage spots, dusty. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Sherman** (Carentan) → `tanks/sherman/tank.png`

```
A top-down game sprite of an American M4A1 Sherman medium tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its 75 mm gun pointing straight to the right. Rounded cast hull, a round turret with a commander's hatch and a loader's hatch, tracks on both long sides, engine deck with grilles at the back, tools, a spare track section and a bedroll on the hull. Olive drab paint with dark green camouflage patches and mud. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no stars, no numbers, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Sherman winter** (Ardennen) → `tanks/sherman/tank-winter.png`

```
The same American Sherman tank as before, in exactly the same position, size and shape, but now painted with a patchy white winter whitewash over the olive drab, the green showing through on edges, hatches and tracks, white bedsheets tied over the turret for camouflage and snow in the corners of the engine deck. Top-down, seen exactly from directly above, pointing to the right, hand-painted illustration style, soft light from the top left, no cast shadow on the ground, no markings, no stars, no numbers, no text, isolated on a fully transparent background, square image.
```

**Cromwell** (Arnhem) → `tanks/cromwell/tank.png`

```
A top-down game sprite of a British Cromwell Mk IV cruiser tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its 75 mm gun pointing straight to the right. Low box-shaped hull, a square slab-sided turret with a storage box on the back, tracks on both long sides, a long engine deck with grilles at the back, bedrolls and jerry cans strapped on. Olive green paint with mud and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no stars, no numbers, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Königstiger** (Ardennen) → `tanks/koenigstiger/tank.png`

```
A top-down game sprite of a German Tiger II (Königstiger) heavy tank with the Henschel turret, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its very long 88 mm gun with muzzle brake pointing straight to the right. Very large sloped hull, a long angular turret, very wide tracks on both long sides, a big engine deck with grilles at the back. White winter whitewash over dark yellow paint, heavily worn so that the yellow shows through on edges and hatches, snow in the corners. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

**Panther** (Oder) → `tanks/panther/tank.png`

```
A top-down game sprite of a German Panther Ausf. G medium tank, seen exactly from directly above, the hull pointing to the right and the turret facing forward with its long 75 mm gun with muzzle brake pointing straight to the right. Long sloped hull, a rounded turret with a commander's cupola, wide tracks on both long sides, a large engine deck with round grilles and two exhausts at the back, tow cables along the hull. Dark grey paint with dust and wear on the edges. Accurate proportions matching the attached top-view reference, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no markings, no numbers, no crosses, no text, isolated on a fully transparent background, square image with the hull centred and empty space around the tank.
```

### Bewegende rupsen (optioneel)

**Romp zonder rupsen** → `tanks/<naam>/tank-romp.png` (na elke tank in hetzelfde gesprek):

```
The same tank as in the previous image, in exactly the same position, size and shape, but with both tracks removed so that only the hull, turret and gun remain, with empty transparent space where the tracks were.
```

**Rupsstrook** (één voor alle tanks) → `tanks/rups.png`

```
A long straight horizontal strip of WWII tank track links, seen exactly from directly above, dark worn steel plates with guide horns and connecting pins, a little dried mud between the links, the strip runs across the full width of the image, about six times as long as it is wide, every link identical so the strip can be repeated. Hand-painted illustration style, soft light from the top left, no cast shadow, isolated on a fully transparent background, no text. Wide landscape image.
```

## Grondtexturen

Grondtexturen zijn **optioneel**: zonder bestanden maakt de code zelf een procedurele textuur. Wil je ze wel maken, houd ze dan rustig en egaal belicht. Het spel mengt ze met elkaar en legt er licht en schaduw overheen, dus een sterk patroon of een duidelijke lichtrichting valt op als herhaling. ChatGPT maakt ze niet perfect naadloos; dat doe ik als je ze stuurt. Elk bestand komt in `<stijl>/terrain/`.

**Vaste zin achter elke grondprompt:**

```
Seen exactly from directly above, a flat square seamless tileable ground texture for a game, the same density of detail over the whole image, no single large feature, no objects, no plants taller than the ground, even flat lighting with no shadows and no light direction, no vignette, no text, square image.
```

| Stijl | Bestand | Prompt (plak de vaste zin erachter) |
| --- | --- | --- |
| winter | `sneeuw.png` | `Fresh snow cover on open ground, soft gentle bumps and wind ripples, very subtle blue-grey shading, a few tiny sparkles.` |
| winter | `aarde.png` | `Frozen dark brown earth with ice crystals, small frozen clods and a few patches of trampled snow.` |
| winter | `ijs.png` | `Thick clear blue-white river ice with frozen air bubbles, faint white cracks and a light dusting of snow.` |
| winter | `weg.png` | `Trampled packed snow on a dirt road, grey-white with brownish slush and faint wheel ruts going in all directions.` |
| winter | `bevroren-grond.png` | `Hard frozen forest ground in the Ardennes in December, a thin icy crust of old wind-blown snow over frozen soil, pale grey-blue and white, with frost-covered dead grass tufts, fallen spruce needles and small frozen stones showing through.` |
| winter | `veen.png` | `Frozen peat bog near Leningrad in winter, dark brown fibrous peat frozen solid with white hoarfrost, patches of thin snow and frozen moss, a few small frozen puddles of grey ice.` |
| winter | `bosweg.png` | `Snow-covered forest road in the Ardennes, packed white snow with deep parallel tank track and tyre ruts going in all directions, dirty grey slush in the ruts and a few spruce needles.` |
| zomer | `gras.png` | `Short green meadow grass with clover, a few small wildflowers and patches of darker grass.` |
| zomer | `aarde.png` | `Freshly churned dark brown soil with small stones, roots and clods, slightly damp.` |
| zomer | `modder.png` | `Wet dark mud with puddles of brown water and deep footprints, glistening.` |
| zomer | `moeras.png` | `Marsh ground of reeds, dark wet soil and small pools of green-brown water with duckweed.` |
| zomer | `kasseien.png` | `Old grey cobblestone road surface of square granite setts in straight rows, moss and dirt in the joints.` |
| zomer | `asfalt.png` | `Old worn dark grey asphalt with small cracks, patches and loose gravel.` |
| zomer | `zandweg.png` | `Packed light brown dirt road surface with fine gravel and small pebbles.` |
| zomer | `puin.png` | `Rubble of broken red bricks, grey plaster, splintered wood and dust from destroyed houses.` |
| zomer | `verbrand.png` | `Burnt black and grey ground with ash, charred grass stalks and small embers gone cold.` |
| woestijn | `zand.png` | `Fine pale golden desert sand with soft wind ripples.` |
| woestijn | `hard.png` | `Hard flat desert ground of cracked pale ochre clay with scattered small stones and gravel.` |
| woestijn | `aarde.png` | `Dug-up desert soil, darker brown-ochre sand with clumps and small stones.` |
| woestijn | `weg.png` | `Desert track of compacted pale sand and fine gravel with faint tyre marks going in all directions.` |
| winter | `rots.png` | `Flat grey granite bedrock between boulders, cracked and weathered, with gravel, small stones and snow filling the cracks and hollows.` |
| zomer | `rots.png` | `Flat grey-brown weathered bedrock between boulders, cracked slabs with gravel, small stones, patches of moss and a few tufts of grass in the cracks.` |
| woestijn | `rots.png` | `Flat sun-bleached sandstone and limestone bedrock, wind-eroded layers and pits, pale ochre and beige, with fine sand and gravel in the hollows.` |

## Effecten

Een effect is een reeks frames in een raster, van linksboven naar rechtsonder. ChatGPT houdt frames niet altijd netjes op elkaar aansluitend. Lukt een reeks niet goed, gebruik dan een gratis effectenset van Kenney.nl of OpenGameArt; de code gebruikt die op dezelfde manier. Alles komt in `public/assets/effects/`.

**Vuur en licht op zwart**: voor explosie, mondingsvuur en vonken is een **zwarte achtergrond** beter dan transparant. Het spel tekent ze met *additive blending*, waarbij zwart vanzelf onzichtbaar wordt en het vuur echt gloeit. Rook en stof wel op transparant.

**Explosie** → `explosie.png` (16 frames)

```
A sprite sheet for a game: a 4 by 4 grid of 16 frames showing one tank explosion from start to finish, seen exactly from directly above, read left to right and top to bottom. Frame 1 a small bright white-yellow flash, frames 2 to 6 a fast expanding ball of orange and yellow fire, frames 7 to 12 the fire breaking up into dark red flames and black smoke, frames 13 to 16 thin grey smoke fading away. The effect stays centred in each frame and is the same scale throughout, every frame the same size with empty space around it. Hand-painted illustration style, on a pure black background, no ground, no text, no grid lines. Square image.
```

**Mondingsvuur** → `mondingsvuur.png` (4 frames)

```
A sprite sheet for a game: a 4 by 1 row of 4 frames of a tank cannon muzzle flash seen exactly from directly above, the flash pointing to the right from the left edge of each frame, frame 1 a sharp bright star-shaped white-yellow flash with side jets, frames 2 to 4 the flash quickly shrinking into orange flame and a puff of grey smoke. The effect starts at the same point in each frame, every frame the same size. Hand-painted illustration style, on a pure black background, no ground, no text, no grid lines. Wide landscape image.
```

**Rookwolk** → `rook.png` (8 frames)

```
A sprite sheet for a game: a 4 by 2 grid of 8 frames of one billowing cloud of dark grey battlefield smoke seen exactly from directly above, read left to right and top to bottom, the cloud slowly growing, swirling and becoming lighter and more transparent until it fades away. The cloud stays centred in each frame, every frame the same size with empty space around it. Soft hand-painted illustration style, isolated on a fully transparent background, no ground, no text, no grid lines. Wide landscape image.
```

**Opspattende grond** (inslag naast een tank) → `inslag-sneeuw.png`, `inslag-aarde.png`, `inslag-zand.png` (8 frames)

```
A sprite sheet for a game: a 4 by 2 grid of 8 frames of a shell impact throwing up [fresh white snow / dark brown earth and clods / pale desert sand], seen exactly from directly above, read left to right and top to bottom, frame 1 a small burst, frames 2 to 4 a ring of spray and chunks flying outwards, frames 5 to 8 the spray settling into a thin fading dust cloud. The effect stays centred in each frame, every frame the same size with empty space around it. Hand-painted illustration style, isolated on a fully transparent background, no ground, no text, no grid lines. Wide landscape image.
```

**Kraters** (blijven liggen na een ontplofte tank) → `<stijl>/objects/krater-01..04`

```
A 2 by 2 grid of four different shell craters seen exactly from directly above, a dark round hole with a raised ring of thrown-up [snow and frozen earth / dark brown soil and grass clods / pale sand and stones] around it, scorch marks and small debris, each crater a different shape, clear empty space between them. Hand-painted illustration style, soft light from the top left, no cast shadow, isolated on a fully transparent background, no text. Square image.
```

Vervang bij de laatste twee het deel tussen `[ ]` door de stijl die je nodig hebt, en maak per stijl een eigen plaatje.
