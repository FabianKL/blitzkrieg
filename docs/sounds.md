# Plan: Geluidseffecten met Tone.js

## Context

Blitzkrieg heeft rijke visuele effecten maar nul geluid. Het event-systeem
(`hooks.onEvent(e)` → `world-view.js`) levert al alle triggers; het hintsysteem
(`vision.js`, `hearingT: 20` = 100 cellen) berekent richting en afstand.

Alles via **Tone.js** — één library voor zowel samples als synthese.
Geen Howler.js, geen tussenstap.

## Waarom alleen Tone.js

- Eén audiograaf: alle geluiden (samples + synths) lopen door dezelfde mixbussen,
  effecten en mastercompressor.
- Samples via `Tone.Player` / `Tone.Players`; synthese via `Tone.Synth`,
  `Tone.NoiseSynth`, `Tone.FMSynth`.
- Ruimtelijk geluid via `Tone.Panner` (stereo pan op basis van richting).
- Afstandsdemping via `Tone.Volume` + `Tone.Filter` (dichterbij = luider + helderder).
- Ingebouwde effecten: `Tone.Reverb`, `Tone.Compressor`, `Tone.EQ3`.
- Muzieklogica later: `Tone.Transport`, `Tone.Sequence`, `Tone.Loop`.
- ~150 KB — groter dan Howler, maar vervangt alles en biedt de synthese erbij.

## Architectuur

### Audiograaf

```
Tone.getDestination()
 └─ masterGain ─ Tone.Compressor (limiter, voorkomt clipping)
     ├─ sfxBus ─ Tone.Reverb (kort, 0.3 s) ─ Tone.EQ3
     │   ├─ kanonPool[0..5] ── Tone.Panner   ← snelvuur: 6 spelers roterend
     │   ├─ inslagPool[0..7] ── Tone.Panner   ← veel inslagen tegelijk
     │   ├─ explosiePlayer ── Tone.Panner
     │   ├─ atKanonPlayer ── Tone.Panner
     │   └─ ...eenmalige spelers
     ├─ ambientBus ─ Tone.Volume
     │   ├─ regenPlayer (loop) ─ Tone.Volume (volgt rainShown)
     │   ├─ windPlayer (loop) ─ Tone.Volume (volgt drift/storm)
     │   ├─ vuurPlayer (loop) ─ Tone.Volume (volgt brandoppervlak)
     │   └─ donderPlayer (eenmalig, bij bliksem)
     ├─ synthBus ─ Tone.Volume
     │   ├─ motorSynth ── oscillator + noise + LPF (volgt snelheid)
     │   ├─ sireneSynth ── freq-sweep oscillator
     │   ├─ hintSynth ── korte gefilterde toon + Tone.Panner
     │   └─ uiSynth ── tonen voor pickup, ronde, overwinning
     └─ muziekBus ─ Tone.Volume (later: dynamische sfeerlagen)
```

### Pooling voor snelvuur

`fireCooldown = 4` ticks (30 tps) → **~133 ms** tussen schoten per tank.
Met 4 tanks die tegelijk schieten: tot 30 schoten/seconde.
Kanonschot duurt ~1,5 s → tot 7 overlappende instanties per tank.

**Oplossing**: een pool van `Tone.Player`-instanties die roterend worden gebruikt.
Elke instantie heeft een eigen `Tone.Panner` voor ruimtelijke positionering.

```
kanonPool: 8 Tone.Players (3 varianten × round-robin)
inslagPool: 10 Tone.Players (grond/hard/metaal, style-afhankelijk)
```

Elke `pool.play(variant, pan, volume)` pakt de volgende vrije speler,
stelt pan + volume in, en start. Als er geen vrije speler is, herstart de oudste.

### Ruimtelijk geluid

- **Pan**: `Math.sin(hoekNaarBron)` → −1 (links) tot +1 (rechts)
- **Volume**: `lerp(0, -40, afstand / hoorbereik)` in dB
- **Filter**: `lerp(8000, 800, afstand / hoorbereik)` Hz low-pass cutoff (verre geluiden zijn doffer)
- **Eigen schot/explosie**: altijd vol volume, pan 0 (midden)
- **Hoorbereik**: `hearingCells()` uit `vision.js` (100 cellen standaard, weer kan het verkleinen)
- **Buiten bereik**: geen geluid (consistent met bestaande visuele hints)

### Web Audio unlock

`Tone.start()` moet worden aangeroepen na de eerste gebruikersinteractie.
In `shell.js` bij de eerste klik of toetsaanslag (START, een toets, touch).

---

## Alle geluidseffecten

### Samples (via ElevenLabs → .mp3 → Tone.Player)

#### Tier 1 — Gevecht

| # | Geluid | Event | Pool | Varianten | Details |
|---|--------|-------|------|-----------|---------|
| 1 | Kanonschot | `b` | 8 | 3 | Eigen: vol + pitch ×1,0. Ander: pan + volume + LPF naar afstand. Varianten roteren voor natuurlijk geluid. |
| 2 | Inslag grond | `x` (dig) | 6 | 3 (aarde/sneeuw/zand) | Stijlafhankelijk. Minder prominent dan kanonschot. |
| 3 | Inslag hard | `x` (r=0, rots/muur) | 4 | 2 | Ricochet-ping. |
| 4 | Inslag metaal | `x` (op tank) | 4 | 1 | Metalen klang. Kort. |
| 5 | Tank-explosie | `k` | 2 | 2 | Zware explosie. Langste sample (~3,5 s). Schermschudden is er al. |
| 6 | Mijn-explosie | `m` | 1 | 1 | Alleen El Alamein. Scherpe opwaartse blast. |
| 7 | AT-kanon | `gun` | 2 | 1 | Scherper dan tankschot. Alleen Carentan. |
| 8 | Vegetatie breken | `x` (fell) | 2 | 1 | Hout + bladeren. Subtiel. |

#### Tier 2 — Weer en sfeer (loops)

| # | Geluid | Trigger | Loop | Volume volgt |
|---|--------|---------|------|--------------|
| 9 | Regen | `weather.rain > 0` | ja | `rainShown` (0–1), fade 3 s |
| 10 | Wind | `weather.drift > 0` | ja | `drift` + stormintensiteit |
| 11 | Sneeuwstorm | storm actief (winter) | ja | `stormShown`, fade 3 s |
| 12 | Zandstorm | storm actief (woestijn) | ja | `stormShown`, apart karakter |
| 13 | Donder | bliksem bolt=1 | nee | Eénmalig per flash. Volume naar afstand. |
| 14 | Vuur/brand | `fi` events (Koersk) | ja | Naar aantal brandende cellen in zicht |

#### Tier 3 — Kaartspecifiek

| # | Geluid | Event | Kaart(en) | Pool |
|---|--------|-------|-----------|------|
| 15 | Bom fluiten | `z` / `zi` (vallende bom) | Ardennen, Seelow | 3 |
| 16 | Artillerie-inslag | `zi` / `zb` | Ardennen, Seelow | 3 |
| 17 | Brug-explosie | `bridge` (blown) | Market Garden | 1 |
| 18 | IJs kraken | `c` (passage) | Leningrad | 2 |
| 19 | IJs breken + plons | `w` (hole) | Leningrad | 1 |
| 20 | Gebouw instorten | `fb` / `fc` | Berlijn | 2 |
| 21 | Vliegtuig | `drop` (air drop) | Market Garden | 1 |
| 22 | Zoeklicht-alarm | `sls` (lock-on) | Seelow | 1 |

#### Tier 4 — UI

| # | Geluid | Event |
|---|--------|-------|
| 23 | Pickup | `dropu` / `depu` |

### Synthese (Tone.js, geen sample nodig)

| # | Geluid | Type | Beschrijving |
|---|--------|------|-------------|
| 24 | Tankmotor | `Tone.FMSynth` + `Tone.Noise` → LPF | Continu. Basisfrequentie ~40 Hz (idle) → ~80 Hz (vol gas). Noise voor ruwheid. LPF-cutoff volgt snelheid (200–600 Hz). Rate schaalt met `game.speedMul`. Stopt bij dood, hervat bij respawn. |
| 25 | Rupsbanden | `Tone.Noise('pink')` → bandpass | Continu. Volume + filterfreq volgen snelheid. Nul bij stilstand. Karakter wisselt per terreintype (harder = meer HF). |
| 26 | Barrage-sirene | `Tone.Synth` (sine) met freq-ramp | Bij `z` event. Freq sweept 300→800→300 Hz over 2 s. Herhaalt tot barrage landt. |
| 27 | Richtingshint | `Tone.FMSynth` → `Tone.Panner` | 200 ms ping. Freq ~300 Hz. Pan volgt hintrichting. Triggered door `hintFor(e)`. |
| 28 | Ronde-start | `Tone.PolySynth` | Korte trompet-achtige stoot: twee stijgende noten (C5→E5), 150 ms elk. |
| 29 | Ronde-einde | `Tone.PolySynth` | Twee dalende noten (E5→C5). Rustiger dan start. |
| 30 | Game gewonnen | `Tone.PolySynth` | Kort fanfare-akkoord: C-E-G stijgend, 300 ms totaal. |
| 31 | Lage brandstof/munitie | `Tone.Synth` (square) | Zacht piepje (880 Hz, 80 ms) elke 2 s als voorraad < 15%. |

---

## Implementatie

### Stap 1 — Infra (audio.js + vendor)

- `npm install tone` toevoegen
- `server/server.js`: vendor-entry voor Tone.js
- `public/index.html`: import map uitbreiden
- `public/audio.js` aanmaken: audiograaf, pooling, `Tone.start()` bij eerste interactie
- `shared/config.js`: `SOUND`-constanten (volumes, afstanden, fade-tijden, poolgroottes)
- `public/shell.js`: `audio.onEvent(e, game)` + `audio.update(game, wx, dt)` aanroepen

### Stap 2 — Tier 1: Gevecht (8 geluiden)

Kanonschot (pool ×8, 3 varianten), inslagen (pool ×6, stijlafhankelijk),
tank-explosie, mijn, AT-kanon, vegetatie. + motorsynth en rupsbanden.

### Stap 3 — Tier 2: Weer en sfeer (6 geluiden)

Regen, wind, sneeuwstorm, zandstorm, donder, vuur. Volume-tracking in `audio.update()`.

### Stap 4 — Tier 3: Kaartspecifiek (8 geluiden)

Bom-fluiten, artillerie-inslag, brug-explosie, ijs, gebouw, vliegtuig, zoeklicht-alarm.

### Stap 5 — Tier 4: UI + synth (8 geluiden)

Pickup, ronde-start/-einde, game-gewonnen, richtingshint-ping, lage-voorraad-piep.
Allemaal synthese behalve pickup.

### Later — Muzieklogica

Dynamische sfeerlagen per kaart via `Tone.Transport` en `Tone.Loop`.
Spanning volgt gevechtsactiviteit (schoten/kills in de buurt).

## Te wijzigen bestanden

| Bestand | Wijziging |
|---------|-----------|
| `package.json` | `tone` als dependency |
| `server/server.js` | Vendor-entry voor Tone.js |
| `public/index.html` | Import map: `"tone": "/vendor/tone.mjs"` |
| **`public/audio.js`** | **Nieuw**: audiograaf, pooling, event-dispatch, synths, ambient |
| `public/audio/` | **Nieuw**: .mp3-bestanden |
| `shared/config.js` | `SOUND`-constanten |
| `public/shell.js` | `audio.onEvent(e)` + `audio.update()` aanroepen; `Tone.start()` |
| `public/world-view.js` | Weather/zichtstate doorgeven aan audio |
| `CLAUDE.md` | `tone` toevoegen aan toegestane pakketten |

## Verificatie

- Preview op 3100, `?debug=alles` voor alle tanks zichtbaar.
- **Snelvuur**: snel schieten → schoten overlappen schoon, geen klikken/popping.
- **Ruimtelijk**: andermans schot links/rechts gepand, zachter op afstand.
- **Weer**: Carentan (regen+donder), Ardennen (sneeuw+storm), El Alamein (zand).
- **Motor**: pitch stijgt bij gas geven, stopt bij dood, hervat bij respawn.
- **Mobiel**: geluid start pas na eerste touch (Web Audio policy).
- **Performance**: `blitzView.bench()` vergelijken met en zonder geluid.
