# Pakket F — Spelermodus: 2/3/4 spelers, FFA en teams

## Doel

De host kiest in de wachtkamer hoeveel spelers er meedoen (2, 3 of 4) en, bij 4 spelers,
of het ieder voor zich (FFA) of in teams (2v2) is. De rest van het spel past zich aan:
bases, winnaar, score, spawn, en lobby-UI.

---

## Huidige situatie

| Onderdeel | Huidig gedrag | Bron |
|-----------|--------------|------|
| Max. spelers | Bepaald door `MAP_SIZES[size].maxPlayers` (klein=2, rest=4) | `config.js:67-70` |
| Bases | `generateMap()` krijgt `players` = `MAP_SIZES[size].maxPlayers` | `server.js:177` |
| Slots | `room.tanks[0..3]`, eerste vrije slot | `server.js:576-577` |
| Winnaar (2 sp.) | Rondes: wie als enige leeft wint de ronde; eerst N rondes wint | `game.js:30,36,43` |
| Winnaar (3-4 sp.) | Kills: eerst N kills wint het spel | `game.js:30,43` |
| Ronde-einde | `endRound()` bij elke dode → bij 2 sp. ronde-winnaar, bij 3+ sp. niemand | `server.js:254-269` |
| Lobby-config | `sendConfig()` stuurt `map`, `size`, `rounds`, `settings` | `shell.js:96-108` |
| Spawn | Elk slot krijgt basis `world.bases[t.id]` | `server.js:222-224` |
| Teams | Bestaan niet | — |

---

## Ontwerp

### F1. Nieuwe instellingen

Twee nieuwe velden in het config-bericht van de host naar de server:

- **`playerCount`** (2, 3 of 4) — hoeveel spelers meedoen. Begrensd door
  `MAP_SIZES[size].maxPlayers`. Standaard: `maxPlayers` van de gekozen grootte.
- **`gameMode`** (`'ffa'` of `'teams'`) — alleen relevant bij 4 spelers. Bij 2 of 3 is het
  altijd FFA. Standaard: `'ffa'`.

Deze waarden worden opgeslagen als `room.playerCount` en `room.gameMode`.

### F2. Lobby-UI (`public/shell.js` + `public/index.html`)

**Twee nieuwe dropdowns** in de wachtkamer, naast de bestaande grootte- en rondes-dropdown:

1. **Spelers** — dropdown met opties 2 / 3 / 4 (gefilterd op `maxPlayers` van de gekozen
   grootte). Staat na de grootte-dropdown.
2. **Modus** — dropdown met "Ieder voor zich" / "Teams" — **alleen zichtbaar bij 4 spelers**.
   Bij 2 of 3 spelers is deze verborgen en wordt `'ffa'` gestuurd.

**Gedrag:**
- Als de host de grootte verandert naar "Klein" (max 2), springt de speler-dropdown naar 2
  en wordt de modus-dropdown verborgen.
- `sendConfig()` stuurt `playerCount` en `gameMode` mee.
- Gasten zien de dropdowns als read-only (of niet), net als de andere instellingen.

**Bestanden:**
- `public/index.html` — twee nieuwe `<select>` elementen (id `lobby-players`, `lobby-mode`)
- `public/shell.js` — opbouwen, event-listeners, meesturen in `sendConfig()`
- Het `init`-bericht stuurt `playerCount` en `gameMode` terug zodat gasten de juiste waarde
  zien (`sendInit` in `server.js:318`).

### F3. Server (`server.js`)

**`configure()`** (regel 113):
- Accepteer `playerCount` (2/3/4) en `gameMode` ('ffa'/'teams') uit het cfg-bericht.
- Valideer: `playerCount` ≤ `MAP_SIZES[size].maxPlayers`; `gameMode` = 'teams' alleen als
  `playerCount` = 4.
- Sla op als `room.playerCount` en `room.gameMode`.
- Als er al meer spelers verbonden zijn dan `playerCount`, weiger de wijziging.

**Slot-limiet** (regel 576-577):
- Vervang `slot >= G.MAP_SIZES[room.size].maxPlayers` door
  `slot >= room.playerCount`.

**`makeWorld()`** (regel 177):
- Geef `room.playerCount` door aan `generateMap()` als het aantal bases, in plaats van
  `MAP_SIZES[size].maxPlayers`. Bij teams: `room.playerCount / 2` bases (2 bases voor 2v2).
  **Nee, ook bij teams 4 bases** — elke speler heeft een eigen basis, maar de teams delen
  de win-conditie.

  Eigenlijk: bij teams wil je twee bases (één per team) of vier bases? Dat hangt af van de
  gameplay-keuze:
  - **4 bases, 2 per team**: elke speler spawnt in zijn eigen basis. Teams delen de score.
    Voordeel: meer spreiding, tactischer. Nadeel: complexer.
  - **2 bases, 2 spelers per basis**: teamgenoten spawnen in dezelfde basis.
    Voordeel: simpeler, duidelijker "wij vs. zij". Nadeel: druk in de basis.

  **Voorstel: 2 bases bij teams (2v2).** Twee spelers spawnen in dezelfde basis. Dit is het
  simpelst en past bij het Tunneler-gevoel. `generateMap()` krijgt `players = 2` en slots
  0+2 spawnen in basis 0, slots 1+3 in basis 1.

**`spawn()`** (regel 208):
- Bij teams: `const b = room.world.bases[t.id % 2]` (slot 0,2 → basis 0; slot 1,3 → basis 1).
- Bij FFA: `const b = room.world.bases[t.id]` (ongewijzigd).

**`newWorld()`** (regel 172-):
- Het aantal bases voor `generateMap()`:
  - FFA: `room.playerCount` bases.
  - Teams: `2` bases (één per team).

### F4. Winnaar en score (`shared/game.js`)

**Huidige logica:**
```javascript
scoreMode = (players) => players <= 2 ? 'rounds' : 'kills';
roundWinner = (players) => players.length !== 2 ? -1 : ...;
gameWinner = (players, cfg) => ...find(t => mode === 'rounds' ? t.rounds >= cfg.roundsToWin : t.kills >= cfg.killsToWin);
```

**Gewenste logica:**

| Spelers | Modus | Winnaar |
|---------|-------|---------|
| 2 | FFA | Rondes: wie als enige leeft wint de ronde. Eerst N rondes = spelwinnaar. |
| 3 | FFA | Kills: elke kill telt. Eerst N kills = spelwinnaar. |
| 4 | FFA | Kills: elke kill telt. Eerst N kills = spelwinnaar. |
| 4 | Teams | Rondes: een team wint de ronde als beide tegenstanders dood zijn. Eerst N rondes = spelwinnaar. |

**Wijzigingen:**
- `scoreMode(players, mode)` — voeg `mode` parameter toe:
  ```javascript
  export const scoreMode = (players, mode) =>
    (mode === 'teams' || players <= 2) ? 'rounds' : 'kills';
  ```
- `roundWinner(players, mode)`:
  - FFA, 2 spelers: wie als enige leeft (ongewijzigd).
  - FFA, 3-4 spelers: geen ronde-winnaar (kills tellen, ongewijzigd).
  - Teams: een team wint als beide tegenstanders dood zijn. Speler 0,2 = team 0;
    speler 1,3 = team 1. Winnaar = id van een levende speler van het winnende team
    (of de laagste id van dat team).
    ```javascript
    if (mode === 'teams') {
      const team = [0, 1].map(t => players.filter(p => p.id % 2 === t));
      const dead = team.map(t => t.every(p => !p.alive));
      if (dead[0] && !dead[1]) return team[1][0].id;
      if (dead[1] && !dead[0]) return team[0][0].id;
      return -1;
    }
    ```
- `gameWinner(players, cfg, mode)` — geeft `mode` door aan `scoreMode`.
  Bij teams: de `rounds`-teller zit op de teamgenoten samen. Maar het simpelst is om de
  `rounds` van de ronde-winnaar op te hogen (dat doet de server al in `endRound`). Beide
  teamgenoten krijgen dezelfde `rounds`-teller → na `roundWinner()` hoog je de `rounds`
  van **alle spelers van het winnende team** op.

**`endRound()` in `server.js`** (regel 254):
```javascript
room.roundWinner = G.roundWinner(players, room.gameMode);
if (room.roundWinner >= 0) {
  if (room.gameMode === 'teams') {
    // beide teamgenoten krijgen de ronde
    const winTeam = room.roundWinner % 2;
    for (const t of room.tanks) if (t && t.id % 2 === winTeam) t.rounds++;
  } else {
    room.tanks[room.roundWinner].rounds++;
  }
}
room.winner = G.gameWinner(players, { ...GAME, roundsToWin: room.rounds }, room.gameMode);
```

### F5. Ronde-einde trigger

**Huidig** (server.js:407): `endRound` wordt aangeroepen zodra er een dode bijkomt.

- Bij 2 spelers FFA: 1 dode → ronde voorbij (ongewijzigd).
- Bij 3-4 spelers FFA: elke dode → `endRound`, maar `roundWinner()` geeft -1, dus de
  ronde gaat door. Het spel eindigt via `gameWinner()` bij kills. **Maar**: de huidige code
  roept `endRound()` bij élke dode aan, en `endRound` zet `room.phase = 'pause'` of `'over'`.
  Dat klopt niet voor FFA met 3+ spelers — de ronde moet doorgaan totdat er 1 speler over is
  of iemand genoeg kills heeft.

  **Fix**: `endRound` alleen aanroepen als de ronde echt voorbij is:
  - FFA 2 sp.: 1 van de 2 dood → ronde voorbij.
  - FFA 3-4 sp.: maar 1 levend → ronde voorbij. Of: `gameWinner` geeft een winnaar.
  - Teams: beide spelers van een team dood → ronde voorbij.

  Nieuwe check in de tick-loop (server.js:407):
  ```javascript
  if (live.filter(t => !t.alive).length > deaths) {
    const winner = G.gameWinner(live, { ...GAME, killsToWin: room.kills }, room.gameMode);
    const roundDone = room.gameMode === 'teams'
      ? G.roundWinner(live, 'teams') >= 0
      : live.filter(t => t.alive).length <= 1 || winner >= 0;
    if (roundDone) endRound(room, events);
  }
  ```

### F6. Score-weergave (client)

**`shared/client-sim.js`** en **`public/shell.js`**:
- Het init-bericht bevat `gameMode`. Sla op als `game.gameMode`.
- De score in de tankkaart en de balk: gebruik `scoreMode(players, gameMode)` om te bepalen
  of rondes of kills getoond worden.
- Bij teams: toon "TEAM A" / "TEAM B" bij de tanknaam, of gebruik kleuren. Of: toon de
  team-rondes naast de naam.

**`public/view/side-panel.js`** (tankkaart):
- Bij teams: groepeer de tanks per team. Toon de team-score naast het teamlabel.
- De minikaart toont alleen je eigen tank en basis (ongewijzigd).

### F7. Lobby-beperkingen per map

Sommige maps zijn alleen voor 2 spelers ontworpen (tunneler-maps). Voeg een optioneel veld
`maxPlayers` toe aan het kaartbestand:
```javascript
// tunneler-zomer.js
maxPlayers: 2,
```
De lobby beperkt de speler-dropdown dan tot max. 2 voor die maps. De effectieve maxPlayers
is `Math.min(MAP_SIZES[size].maxPlayers, rules.maxPlayers ?? 4)`.

---

## Bestanden die veranderen

| Bestand | Wat |
|---------|-----|
| `shared/config.js` | `GAME.maxPlayers` referentie; eventueel nieuwe constanten |
| `shared/game.js` | `scoreMode`, `roundWinner`, `gameWinner` krijgen `mode` parameter |
| `server.js` | `configure`, slot-limiet, `spawn`, `endRound`, `makeWorld`, `sendInit` |
| `public/index.html` | Twee nieuwe dropdowns |
| `public/shell.js` | Opbouwen dropdowns, `sendConfig`, init-verwerking |
| `shared/client-sim.js` | `gameMode` opslaan uit init-bericht |
| `public/view/side-panel.js` | Score-weergave bij teams |
| `shared/maps/tunneler-zomer.js` | `maxPlayers: 2` |
| `shared/maps/tunneler-winter.js` | `maxPlayers: 2` |
| `tests/tests.mjs` | Tests voor 3/4 spelers, FFA en teams |

---

## Stappenplan

### Stap 1: Datamodel en validatie
1. Voeg `playerCount` en `gameMode` toe aan `room` in `server.js` (bij `newWorld`).
2. Pas `configure()` aan: accepteer en valideer de nieuwe velden.
3. Pas de slot-limiet aan (regel 576-577).
4. Stuur `playerCount` en `gameMode` mee in `sendInit()`.

### Stap 2: Basis-plaatsing en spawn
1. `makeWorld()`: geef `playerCount` (FFA) of `2` (teams) als bases aan `generateMap()`.
2. `spawn()`: bij teams `bases[t.id % 2]`, bij FFA `bases[t.id]`.

### Stap 3: Winnaar-logica
1. Pas `scoreMode`, `roundWinner`, `gameWinner` aan in `game.js` (met `mode` parameter).
2. Pas `endRound()` in `server.js` aan: team-rondes, ronde-einde trigger.
3. Fix de ronde-einde trigger voor 3-4 spelers FFA (ronde gaat door tot 1 over of kills-doel).

### Stap 4: Lobby-UI
1. Voeg de spelers-dropdown toe aan `index.html` en `shell.js`.
2. Voeg de modus-dropdown toe (verborgen bij <4 spelers).
3. `sendConfig()` stuurt de nieuwe velden mee.
4. Verwerk `playerCount` en `gameMode` uit het init-bericht (gasten).

### Stap 5: Score-weergave
1. Pas de tankkaart aan bij teams (groepering, team-score).
2. Pas de score in de balk aan (rondes of kills, afhankelijk van modus).

### Stap 6: Per-map beperkingen
1. Voeg `maxPlayers: 2` toe aan de tunneler-maps.
2. Beperk de speler-dropdown op basis van de map.

### Stap 7: Testen
1. Tests voor `roundWinner` en `gameWinner` met `mode` parameter.
2. Tests voor 3 en 4 bases in de kaartmaker.
3. Handmatig testen: lobby → 4 spelers FFA, 4 spelers teams, 3 spelers FFA.
4. Controleer dat 2-speler-maps (tunneler) geen 3/4 toestaan.

---

## Aandachtspunten

- **Determinisme**: `scoreMode`, `roundWinner`, `gameWinner` staan in `shared/` en draaien
  op server én client. De `mode` parameter moet meekomen in het init-bericht zodat de client
  dezelfde berekening maakt.
- **Kaartmaker**: `placeBases()` werkt al met variabel aantal bases (1-4). Bij 3 bases
  genereert hij nu al 3 bases met voldoende afstand. Geen wijziging nodig aan `placeBases`
  zelf, alleen aan de aanroep.
- **Respawn bij teams**: als een teamgenoot dood is maar de ronde nog loopt (de andere
  teamgenoot leeft nog), spawnt de dode speler niet opnieuw. De ronde is pas voorbij als
  beide spelers van een team dood zijn.
- **Lobby-instellingen "Rondes"**: bij FFA 3-4 sp. is het eigenlijk "Kills" — de label
  in de lobby moet veranderen: "3 rondes" → "5 kills" (of een apart veld). Of: gebruik
  `ROUND_OPTIONS` voor rondes en `KILL_OPTIONS` voor kills, en wissel de dropdown op basis
  van de modus. Voorstel: de dropdown toont altijd "rondes" bij 2 sp. en teams, en "kills"
  bij FFA 3-4 sp., met passende getallen.
- **Verlaten bij teams**: als een speler het spel verlaat, speelt zijn teamgenoot alleen
  door. De ronde-einde check moet rekening houden met lege slots (een leeg slot telt als
  dood voor het team).
