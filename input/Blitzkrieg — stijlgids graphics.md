# Blitzkrieg — stijlgids graphics

Oct 31, 2026 · @Faab

Met deze gids maak je nieuwe sprites die passen bij wat er al in het spel zit.

## De stijl in het kort

Blitzkrieg ziet eruit als een **handgeschilderd bordspel, recht van bovenaf gezien**: rijk aan detail, licht verweerd, met warme natuurlijke kleuren. Elke sprite volgt dezelfde vijf regels.

| Regel | Wat het betekent |
| --- | --- |
| **Recht van bovenaf** | Orthografisch, een kijkhoek van 90°. Je ziet daken en kruinen, nooit gevels, zijkanten of een horizon. |
| **Licht van linksboven** | De lichte kant van elk object zit linksboven, de donkere rechtsonder. Dat past bij de schaduwen die het spel tekent. |
| **Handgeschilderd** | Geschilderde illustratie met veel detail (schors, dakpannen, schakels), geen pixel art, geen foto, geen strakke vectorvormen. |
| **Donkere rand** | Elk object heeft een iets donkerdere buitenrand, zodat het loskomt van de grond. Bij obstakels is dat belangrijk: je moet zien waar je niet doorheen kunt. |
| **Gebruikt en verweerd** | Modder, roest, stof, mos. Niets is nieuw of glanzend. |

**Kleur.** Teken in natuurlijke, iets gedempte kleuren. De sfeer per map (koud blauw voor Leningrad, stoffig geel voor El Alamein) legt het spel er zelf overheen met een kleurfilter. Daardoor kan dezelfde sprite op meerdere maps.

**Seizoen.** Er zijn drie stijlen: `zomer`, `winter` en `woestijn`. Winter is dezelfde tekening met sneeuw erop, zodat vorm en maat gelijk blijven. Tanks zijn de uitzondering: die zijn in elk seizoen hetzelfde.

**Het referentiebeeld.** De negen besneeuwde dennen zijn de stijlreferentie. Upload ze bij elk nieuw ChatGPT-gesprek.

## Techniek: maten, bestanden en mappen

De vaste maat is **32 pixels per cel**. Een cel is het kleinste vakje van de kaart; een tank is ongeveer 7,6 × 4 cellen. Alle maten hieronder zijn het eindformaat na verwerking. Wat ChatGPT levert, mag groter zijn: ik schaal het terug.

| Soort | Eindmaat (px) | In cellen | Draaipunt | Map |
| --- | --- | --- | --- | --- |
| Boom, palm | 192 × 192 | 6 × 6 | midden | `<stijl>/objects/` |
| Struik, heg, cactus | 128 × 128 | 4 × 4 | midden | `<stijl>/objects/` |
| Rots | 160 × 160 | 5 × 5 | midden | `<stijl>/objects/` |
| Waterplant, oeverplant | 96 × 96 | 3 × 3 | midden | `<stijl>/objects/` |
| Krater | 256 × 256 | 8 × 8 | midden | `<stijl>/objects/` |
| Gebouw | precies het grondvlak | bijv. 6 × 6, 12 × 5 | midden | `<stijl>/buildings/` |
| Basis: muur | 64 hoog, naadloos | 2 dik | — | `<stijl>/bases/` |
| Basis: hoek, deurpost, spul | 96 × 96 | 3 × 3 | midden | `<stijl>/bases/` |
| Brug: begin, midden, eind | 384 hoog | 12 breed | — | `<stijl>/bridges/` |
| Tank, romp | 448 × 448 | 14 × 14 | midden van de romp | `tanks/<naam>/` |
| Rupsstrook | liggend, naadloos | — | — | `tanks/<naam>/` |
| Grondtextuur | 512 × 512, naadloos | 16 × 16 | — | `<stijl>/terrain/` |
| Effect (frames) | 256 per frame | 8 × 8 | midden | `effects/` |

Alles staat in `public/assets/`. `<stijl>` is `zomer`, `winter` of `woestijn`.

**Bestanden**

- Sprites: **PNG met transparante achtergrond**. Grondtexturen: JPG.
- Namen in kleine letters, met streepjes, zonder spaties: `den-03.png`, `huis-rij-half.png`.
- Varianten krijgen een nummer: `-01`, `-02`, … Het spel gebruikt alles wat er staat; meer varianten = minder herhaling.
- Stadia en toestanden als achtervoegsel: `-kapot`, `-heel`, `-half`, `-puin`, `-vol`, `-leeg`.
- Kleine objecten komen ook samen in `objects.png` + `objects.json` (een atlas). Die maak ik bij het verwerken; jij hoeft alleen losse plaatjes te leveren.
- `manifest.json` en `LEESMIJ.md` in `public/assets/` zeggen welk bestand wat is. Die werk ik bij.

**Eén keer tekenen, vaak gebruiken.** Lever per soort minstens 6, liefst 9 varianten. Het spel draait en schaalt ze per plek een beetje, zodat een bos niet uit dezelfde boom lijkt te bestaan.

## Wat het spel zelf doet (dus niet tekenen)

Veel van de sfeer komt uit de code. Teken je dit in de sprite, dan zie je het dubbel of klopt het niet meer.

| Niet in de sprite | Waarom |
| --- | --- |
| Slagschaduw op de grond | Het spel tekent bij elk object een schaduw in dezelfde richting. Schaduw *op* het object zelf mag wel. |
| Grond, gras of sneeuw onder het object | De grond komt uit de grondtextuur van de map. |
| Water onder bruggen en planten | Water is een bewegend effect in het spel. |
| Barsten in ijs | Die komen uit het spel en groeien als er tanks overheen rijden. |
| Emblemen, kruizen, sterren, nummers, tekst | Het spel tekent ze per ploeg en per map over de tank heen. |
| Kleur van de map (blauw, geel, grauw) | Een kleurfilter per map. |
| Mist, zicht, vignet, korrel | Effecten over het hele beeld. |
| Glans en glinstering | Een effect in het spel, vooral op water en ijs. |
| Ploegkleuren | Ploeg C en D zijn een donkerdere tint van A en B. |

## Prompts bouwen

Een goede prompt bestaat altijd uit vier delen, in deze volgorde: **wat** (het object en hoeveel varianten), **hoe het eruitziet** (materiaal, kleur, details, seizoen), **indeling** (raster, ruimte ertussen) en de vaste **stijlzin**.

**Startprompt** — plak deze als eerste in elk nieuw gesprek, met de dennen als bijlage:

```
I am making top-down sprites for a WWII tank game. The attached image shows the art style I want for every sprite in this conversation: seen exactly from directly above, hand-painted with rich detail, soft light from the top left, a darker outline at the edge of each object, no cast shadow on the ground, transparent background. Please keep exactly this style, level of detail and lighting for every image I ask for next. Reply only with "OK" for now.
```

**Vaste stijlzin voor sprites** — achter elke objectprompt:

```
Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge of each object, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Vaste stijlzin voor grondtexturen:**

```
Seen exactly from directly above, a flat square seamless tileable ground texture for a game, the same density of detail over the whole image, no single large feature, no objects, no plants taller than the ground, even flat lighting with no shadows and no light direction, no vignette, no text, square image.
```

**Sjabloon voor een set varianten:**

```
A 3 by 3 grid of nine different [OBJECT], each [UITERLIJK: materiaal, kleur, details, seizoen], each one clearly different in shape and size, clear empty space between all of them. [VASTE STIJLZIN] Square image.
```

**Indelingen die goed werken**

- Varianten: `3 by 3 grid` (9) of `3 by 1 row` (3).
- Stadia of delen: `three versions side by side from left to right` (breed) of `stacked from top to bottom` (lang en smal, zoals een huizenrij of een tank).
- Stroken (muur, rups, brug): `a long straight horizontal strip … the pattern repeats seamlessly from left to right`.
- Effecten: `a sprite sheet, a 4 by 4 grid of 16 frames … read left to right and top to bottom`.
- Altijd: `clear empty space between` — anders kan ik ze niet netjes uitsnijden.

**Winterversie van iets wat je al hebt** (in hetzelfde gesprek):

```
The same image as the previous one, with exactly the same objects, shapes, sizes and positions, but now in deep winter: fresh white snow on all upward-facing surfaces, frost on the edges, the darker details still showing through. Keep the transparent background, no cast shadow, no ground, no text.
```

**Veelgebruikte correcties**

| Probleem | Plak dit |
| --- | --- |
| Schuine kijkhoek | `Redo it seen exactly from directly above, a perfect 90-degree overhead view, no sides visible.` |
| Schaduw op de grond | `Remove all shadows on the ground around the objects; keep only the shading on the objects themselves.` |
| Geen transparantie | `Make the background fully transparent, with nothing around the objects.` |
| Objecten raken elkaar | `Leave clear empty space between all objects so each can be cut out separately.` |
| Te weinig variatie | `Make each one clearly different in shape and size.` |
| Maat verspringt tussen stadia | `Make all versions exactly the same size and position.` |

## Regels per soort sprite

**Begroeiing (bomen, struiken, heggen, cactussen, palmen)**

- Van bovenaf zie je alleen de kruin; de stam hooguit als een vlekje in het midden.
- De kruin is ongeveer rond, zodat hij in elke draaiing past.
- Kapotte variant (`-kapot`) alleen als je die wilt: een stronk met splinters en losse takken. Soorten zonder kapotte variant verdwijnen bij omschieten (nu: zomerden, zomerberk, heg).
- Begroeiing blokkeert zicht en houdt tanks tegen, dus hij moet er dicht uitzien.

**Decoratie (waterplanten, oeverplanten, kraters)**

- Plat en laag: het mag niet lijken alsof je er niet overheen kunt.
- Lichtere rand dan bij obstakels, zodat het in de grond opgaat.

**Rotsen**

- Massief, met een duidelijk donkerdere rand dan de bovenkant.
- Mix van losse blokken, platte platen en groepjes van 2–3 stenen.

**Gebouwen**

- Alleen daken; het dak vult het hele grondvlak, zonder tuin of erf eromheen.
- Altijd drie stadia in één plaatje, even groot en op dezelfde plek: `heel`, `half` (gaten in het dak, verbrande balken) en `puin` (een lage, platte puinhoop zonder staande muren, want over puin kun je rijden).
- Nieuw grondvlak? Meld het, dan past de kaartmaker zich aan.

**Basis, bruggen en andere stroken**

- Muren en rupsen als lange, liggende strook die naadloos herhaalt. Vraag om een vast aantal identieke delen (bijv. 12 schakels).
- Bruggen in drie delen: begin, herhaalbaar midden en eind, alle drie even hoog. Geen water eronder.
- Een wrak is één plaatje met de twee landhoofden en het ingestorte midden.

**Tanks**

- Neus en loop naar rechts, toren recht vooruit.
- Upload altijd een bovenaanzicht van de echte tank, anders verzint ChatGPT details.
- Per tank één plaatje met drie delen onder elkaar: de complete tank, dezelfde tank zonder rupsen, en een rupsstrook.
- Geen emblemen of nummers; geen aparte winterversie.

**Grondtexturen**

- Rustig en egaal belicht, zonder één opvallend ding (geen grote steen, plas of spoor in één richting).
- Sporen alleen in alle richtingen door elkaar, anders zie je de herhaling.
- Liever te saai dan te druk: het spel legt er licht, schaduw en kleur overheen.

**Effecten**

- Frames in een raster, van linksboven naar rechtsonder, elk frame even groot met het effect in het midden.
- Vuur, flitsen en vonken op een **zwarte** achtergrond (het spel laat zwart wegvallen). Rook en stof op transparant.

## Werkwijze en controlelijst

1. **Bedenk wat en waar**: welke soort, welke stijl (zomer, winter, woestijn) en welke map. Is het iets wat het spel nog niet kent (een nieuw gebouw, een nieuwe tank)? Dan is er ook code nodig.
2. **Nieuw ChatGPT-gesprek** per stijl of per tank. Startprompt met de dennen als bijlage.
3. **Prompt** volgens het sjabloon, met de vaste stijlzin erachter.
4. **Controleren** met de lijst hieronder; corrigeer in hetzelfde gesprek.
5. **Opslaan als PNG** in `C:\code\blitzkrieg\input\<soort>\`. De naam maakt niet uit.
6. **Laat Claude het verwerken**: uitsnijden, op maat zetten, naadloos maken, atlas en manifest bijwerken en in `public/assets/` zetten.
7. **Nieuw soort ding?** Laat Claude Code de code aanpassen, met verwijzing naar `manifest.json` en deze gids.
8. **Testen** in het spel met `?zoom=3` (scherpte en randen) en op elke map van die stijl (kleurfilter).

**Controlelijst per plaatje**

- [ ] Recht van bovenaf, geen zijkanten zichtbaar
- [ ] Licht van linksboven
- [ ] Geen schaduw op de grond, geen grond onder het object
- [ ] Transparante achtergrond (vuur: zwart)
- [ ] Donkere buitenrand
- [ ] Ruimte tussen de objecten in het raster
- [ ] Geen tekst, emblemen of nummers
- [ ] Stadia en delen even groot en op dezelfde plek
- [ ] Past in kleur en detail naast de dennen
- [ ] Tanks: neus naar rechts, vormen kloppen met de echte tank
