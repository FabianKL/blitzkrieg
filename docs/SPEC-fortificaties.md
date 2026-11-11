# Specificatie: bunkers en fortificaties

Lees eerst `CLAUDE.md`. Alle werkafspraken gelden: Nederlands, alle getallen in `shared/config.js`
of `shared/maps/<map>.js`, `shared/` deterministisch (toeval alleen via de kaartseed of `server/hazards.js`),
preview op poort 3100, `npm test` en `npm run test:gen -- "" 10` na wijzigingen aan de kaartmaker.

## Doel
Elke map krijgt een paar historisch passende fortificaties die het spelen veranderen: ze geven
dekking, dwingen een route af of vormen een gevaar. Er komen zo min mogelijk nieuwe regels: elke
fortificatie valt in één van vier **rollen**.

## 1. De vier rollen

| Rol | Rijden | Kogels | Zicht | Kapot te schieten | Bouwt op |
| --- | --- | --- | --- | --- | --- |
| **Blokkade** | nee | stoppen | blokkeert | nee | `ROCK` |
| **Dekking** | nee | stoppen | blokkeert | ja, na `hp` treffers puin (berijdbaar) | `BUILDING` + 3 stadia |
| **Versperring** | nee | vliegen erover | kijk erover | soms (zie per type) | **nieuw celtype `LOW`** |
| **Gevaar** | nee | stoppen | blokkeert | ja, na `hp` treffers | `BUILDING` + gedrag zoals `atGuns` |

### Nieuw celtype `LOW` (versperring)
- Onbegaanbaar voor tanks, maar kogels vliegen erover en het zicht gaat erover (zoals water).
- Tunnels kunnen er niet doorheen.
- Optioneel kapot te schieten (`hp` per type; 0 = onverwoestbaar). Kapot = de cel wordt grond van
  de klasse eronder; tekening naar de `-kapot`-sprite of weg.
- Opnemen in `shared/vision.js` (blokkeert niet), de kogelregel (geen botsing), de bewegingsregel
  (wel botsing), de minikaart (eigen kleur) en de legenda.

### Gevaar
- Gebruik het mechanisme van het bestaande antitankgeschut (`atGuns` in `server/hazards.js`): plaatsing
  op de server, een kijkboog, bereik, interval, pantserverlies, `hp`, zichtbaar na het eerste schot.
- Nu kan een map maar één `hazard` hebben. Fortificaties met een gevaar komen daarom in een eigen
  lijst `fortifications` en mogen naast de bestaande `hazard` van de map bestaan.
- Een vernietigd gevaar wordt dekking-puin (berijdbaar).

## 2. Typen

Maat in cellen (32 px per cel in de sprite). Waarden voor `hp`, bereik enz. zijn voorstellen en
horen in `config.js` (`FORTIFICATIONS`).

| Type (`id`) | Omschrijving | Rol | Maat | hp | Sprites |
| --- | --- | --- | --- | --- | --- |
| `kazemat` | Nederlandse betonnen kazemat / groepsschuilplaats (Grebbelinie), half ingegraven, ronde koepel | Dekking | 8 × 8 | 8 | heel, half, puin |
| `dzot` | Sovjet-houtbunker: boomstammen met aarde en gras erop, schietgat | Dekking | 8 × 7 | 5 | heel, half, puin |
| `sangar` | Stenen muurtje met zandzakken in een halve cirkel (woestijn) | Dekking | 7 × 5 | 3 | heel, half, puin |
| `loopgraafbunker` | Houten bunker in een loopgraaf met zandzakken | Dekking | 8 × 6 | 5 | heel, half, puin |
| `pillbox` | Betonnen pillbox (DOT) met schietgaten | Blokkade | 7 × 7 | – | heel |
| `westwall` | Grote betonnen Westwall-bunker, deels begroeid | Blokkade | 12 × 9 | – | heel |
| `drakentanden` | Rij betonnen piramides (Höckerlinie), 2–3 rijen dik | Versperring | 2 × 2 per tand | 0 | tand-01..04 |
| `egels` | Tsjechische egels (gekruiste stalen balken) | Versperring | 3 × 3 per egel | 4 | egel-01..03, egel-kapot |
| `prikkeldraad` | Rol prikkeldraad op houten palen, strook | Versperring | strook, 2 breed | 1 | strook, kapot |
| `tankgracht` | Antitankgracht: diepe greppel met schuine wanden | Versperring | strook, 4 breed | 0 | strook (naadloos) |
| `barricade` | Straatbarricade: puin, balken, omgekiepte tram | Versperring | 10 × 3 | 3 | 3 varianten, kapot |
| `tobruk` | Duits rond betonnen MG-nest (Ringstand) | Gevaar | 5 × 5 | 4 | heel, puin |
| `flak` | Luchtafweerkanon in een ring van zandzakken | Gevaar | 8 × 8 | 4 | heel, puin |
| `pak` | Ingegraven antitankkanon (88 mm) met zandzakken | Gevaar | 9 × 7 | 4 | heel, puin |

**Gevaar-instellingen** (voorstel, per type in config): `tobruk` bereik 8 T, boog 90°, elke 2 s,
10 pantser; `flak` en `pak` bereik 12 T, boog 45°, elke 4 s, 25 pantser. Een gevaar schiet alleen
op een tank die het volgens de normale zichtregel kan zien.

## 3. Per map

| Map | Fortificaties (aantal bij middel) |
| --- | --- |
| Grebbeberg | `kazemat` × 4 langs de heuvelvoet, `prikkeldraad` × 2 stroken |
| Russische vlakte | `dzot` × 3, `egels` × 2 rijen |
| El Alamein | `sangar` × 4, `prikkeldraad` × 3 stroken (rond de mijnenvelden) |
| Leningrad | `pillbox` × 3 op de zuidoever, `dzot` × 2 |
| Koersk | `tankgracht` × 1 lange strook met 2 overgangen, `egels` × 2 rijen, `pak` × 1 |
| Carentan | `tobruk` × 2 in de heggen (naast het bestaande antitankgeschut) |
| Arnhem | `flak` × 2 bij de stad, `prikkeldraad` × 2 |
| Ardennen | `drakentanden` × 1 lange rij (Westwall) met 3 doorgangen, `westwall` × 2 |
| Oder-front | `loopgraafbunker` × 3 op de heuvelrug, `pak` × 1 |
| Berlijn | `barricade` × 6 op kruispunten (zie `SPEC-berlijn.md`) |

Aantallen schalen met de kaartgrootte (zoals `scaled()` bij gebouwen): klein ×0,75, groot ×1,5,
extra groot ×2.

## 4. Configuratie
In `shared/maps/<map>.js` een lijst naast `features`:
```js
fortifications: [
  { type: 'kazemat', count: 4, in: 'heuvel', facing: 'west' },
  { type: 'prikkeldraad', count: 2, length: [20, 35] },
  { type: 'drakentanden', from: [0.2, 0.1], to: [0.3, 0.9], rows: 2, gaps: 3 },
]
```
- `count` of `from`/`to` (lijn in fracties van de kaart, zoals wegen).
- `in`: optionele zone (bestaande zones zoals `heuvel`, `park`).
- `facing`: richting van schietgaten en kijkboog van een gevaar (anders naar het midden van de kaart).
- Maten, hp en gevaar-instellingen in `config.js` onder `FORTIFICATIONS[type]`.

## 5. Kaartmaker (`shared/mapgen.js`)
- Fortificaties worden geplaatst **na** de vaste kenmerken en **vóór** het opvullen van het terrein.
- Niet in de beschermde zone rond een basis (§6.2) en niet in de uitrijstrook.
- Niet op wegen, bruggen of water, behalve `barricade` (alleen op straten) en `tankgracht`
  (snijdt door wegen, maar laat daar een overgang van minstens 2 T).
- Een rij (`drakentanden`, `egels`, `prikkeldraad`, `tankgracht`) laat altijd gaten van minstens
  **7 cellen** (tankbreedte + marge), volgens `gaps`.
- Daarna moet `connectBases` nog altijd een route tussen alle bases vinden; lukt dat niet, dan
  wordt de fortificatie die in de weg ligt een gat breder of weggelaten.
- Deterministisch uit de kaartseed. De posities gaan mee in de kaartgegevens naar de browser.
- Een gevaar wordt op de server geplaatst (`server/hazards.js`) op een plek die de kaartmaker reserveert.

## 6. Weergave
- Sprites in `public/assets/<stijl>/fortifications/<type>-…png`, zelfde regels als gebouwen
  (`heel`, `half`, `puin`; varianten `-01`…). Ontbreekt een sprite, teken dan een eenvoudige
  vervanger in de stijlkleur.
- Dekking: stadium uit de resterende `hp` (zoals gebouwen: bovenste derde heel, middelste half,
  0 puin).
- Versperring van het type `LOW`: lichte schaduw, lager dan gebouwen (het spel ziet ze als laag).
- Gevaar: mondingsvuur en geluid via de bestaande effecten en richtingshints; onzichtbaar zolang
  het niet gezien is, zoals het antitankgeschut.
- Minikaart: blokkade en dekking als gebouw, versperring als dunne lijn, gevaar niet tonen.
- Legenda: alleen de typen die op de map staan, met hun rol in één woord.

## 7. Tests
- Per rol een test in `tests/`: tank botst, kogel stopt of vliegt over, zicht wel of niet geblokkeerd,
  hp en stadia, gevaar schiet alleen bij zicht.
- `npm run test:gen -- "" 10`: alle maps blijven verbonden, gaten zijn minstens 7 cellen.

## Bijlage: ChatGPT-prompts voor de sprites
Werk per stijl in één gesprek met de startprompt en de dennen als referentie (zie de stijlgids).
Achter elke prompt de vaste stijlzin:
```
Top-down orthographic view seen exactly from directly above, game sprite, hand-painted illustration style, soft light from the top left, a slightly darker outline at the edge, no cast shadow on the ground, no ground, isolated on a fully transparent background, no text.
```

**Dekking in drie stadia** (vervang `[BUNKER]`):
```
Three versions of the same [BUNKER], placed side by side from left to right with clear empty space between them, each version exactly the same size and position. Left: intact. Middle: half destroyed by shellfire, chunks broken off, cracks, holes, scorch marks. Right: completely destroyed, a low flat heap of rubble filling the same outline, nothing left standing.
```

| `[BUNKER]` | Invullen |
| --- | --- |
| kazemat | `1940 Dutch concrete casemat of the Grebbe line, a low rounded grey concrete dome half buried in grassy earth, a narrow firing slit facing left, moss on the concrete` |
| dzot | `Soviet log bunker (DZOT): a low square roof of heavy round logs covered with earth and grass tufts, a dark firing slit facing left, a few sandbags at the entrance` |
| sangar | `North African desert sangar: a half-circle wall of piled pale stones topped with sandbags, open at the back, sand drifted against it` |
| loopgraafbunker | `German field bunker in a trench: a low roof of timber beams and earth with sandbags around it, a short trench leading to its entrance` |

**Blokkade** (één versie):
```
A single [BUNKER], centred in a square image with empty space around it.
```
`pillbox`: `Soviet concrete pillbox (DOT), a low hexagonal grey concrete block with three dark firing slits, chipped edges, snow in winter version` · `westwall`: `large German Westwall concrete bunker, flat grey roof with an armoured observation cupola, partly overgrown with moss and small shrubs`.

**Versperringen**:
```
A 2 by 2 grid of four different concrete dragon's teeth anti-tank obstacles (Höcker), each a square concrete pyramid with a flat top, weathered grey concrete with moss at the base, clear empty space between them. Square image.
```
```
A 3 by 1 row of three Czech hedgehog anti-tank obstacles made of three crossed rusty steel beams, each slightly different, clear empty space between them. Wide image.
```
```
A long straight horizontal strip of coiled barbed wire on wooden stakes, two loose rolls side by side, the pattern repeats seamlessly from left to right, about eight times as long as it is wide. Wide image.
```
```
A long straight horizontal strip of an anti-tank ditch: a deep earth trench with sloping walls, dark at the bottom, loose earth along both edges, the pattern repeats seamlessly from left to right, about four times as long as it is wide. Wide image.
```

**Gevaar** (twee versies: heel en puin):
```
Two versions of the same [GEVAAR] side by side with clear empty space between them, exactly the same size and position. Left: intact and manned-looking but without people. Right: destroyed, a low heap of broken concrete or sandbags and twisted metal.
```
`tobruk`: `German Tobruk ring stand, a small round concrete pit with a machine gun on a ring mount pointing left` · `flak`: `German 20 mm flak gun on a cross-shaped mount inside a ring of sandbags, gun pointing left` · `pak`: `German 88 mm anti-tank gun dug in behind a horseshoe of sandbags, long barrel pointing left`.

Winterversie: daarna in hetzelfde gesprek de bekende winterprompt (sneeuw op alle bovenkanten).
