// Alle instelbare getallen van het terreinsysteem op één plek (server én browser).
// Pas hier aan tijdens het testen; de rest van de code leest alleen deze tabellen.

// Spel en rondes (§2). Een ronde eindigt zodra er een tank dood is; daarna begint iedereen
// weer in zijn basis met alles vol. Bij 2 spelers wint wie eerst roundsToWin rondes wint,
// bij meer spelers wie eerst killsToWin kills heeft. roundPauseSeconds: even stil tussen
// rondes; gameOverSeconds: zo lang staat de winnaar in beeld, daarna een nieuw spel met
// een nieuwe kaart. Tunnels en andere veranderingen aan de kaart blijven tussen rondes liggen.
export const GAME = { roundsToWin: 3, killsToWin: 5, roundPauseSeconds: 3, gameOverSeconds: 8 };

// Maten (SPEC-blitzkrieg §5.1): breedtes in de spec staan in T, de breedte van een tank.
// T is hier in cellen; de tank zelf is 7 lang en 5 breed.
export const T = 5;

// Kaartgroottes (§6.0): factor op breedte en hoogte van middel (400 x 250 cellen).
// Breedtes in T schalen niet mee; posities als fractie van de kaart wel.
export const MAP_SIZES = {
  klein: { label: 'Klein', factor: 0.75, maxPlayers: 2 },
  middel: { label: 'Middel', factor: 1, maxPlayers: 4 },
  groot: { label: 'Groot', factor: 1.5, maxPlayers: 4 },
  extragroot: { label: 'Extra groot', factor: 2, maxPlayers: 4 },
};
export const DEFAULT_SIZE = 'middel';

// Zicht (§9): de zichtstralen in de spec staan in T (standaard 12 T). Met scale worden ze
// kleiner, zodat ze in het venster passen: 12 T x 0.4 = 4.8 T = 24 cellen.
export const VISION = { scale: 0.4, defaultT: 12 };

// Venster in cellen (de grootste weergave): §6.2, vanuit je basis zie je geen andere basis
export const VIEW_CELLS = { w: 140, h: 96 };

// Richtingshints (§8): gehoorafstand in T, hoe lang een gloed oplicht en dooft (seconden),
// en hoe vaak het stofspoor (Barbarossa) een hint geeft.
export const HINTS = { hearingT: 20, glowSeconds: 3, dustEverySeconds: 10 };

// Zicht (§9) in de weergave: buiten de zichtstraal steeds vager en donkerder naar de rand
// (fade: donkerte aan de rand van het venster, 0..1), achter gebouwen en begroeiing donkerder
// (shadow). debug: ?debug=alles in de adresbalk toont alles, alleen op localhost.
export const FOG = { fade: 0.62, shadow: 0.35, ghostAlpha: 0.45 };

// Weergave. minimap: minikaart aan of uit (een kaart kan dit overschrijven met minimap: false).
export const DISPLAY = { minimap: true };

// Uiterlijk per kaart (alleen de weergave, public/world-view.js; de spelregels kijken er niet
// naar). Een kaart overschrijft dit met look: {...}; grade en noise worden per veld gemengd.
//   light       schaduw van tanks, bases, bomen en rotsen: verschuiving in cellen (dx, dy) en
//               donkerte (alpha), blur: zachtheid van de rand in pixels. Eén lichtbron voor alles:
//               licht van linksboven = schaduw naar rechtsonder (positieve dx en dy).
//   grade       kleurfilter over de hele wereld: saturation (-1 grijs .. 0 .. 1 feller),
//               brightness en contrast (1 = gelijk), tint (#rrggbb) met tintStrength (0..1)
//   noise       grondtextuur met simplex-ruis over de terreinkleur: scale (cellen per vlek),
//               strength (0..1, verschil licht/donker), octaves (lagen fijnere ruis)
//   blend       breedte van de zachte overgang tussen terreinklassen (in cellen, ~2 = smal)
//   weather     deeltjes in beeld: 'snow', 'dust', 'rain' of null; amount = deeltjes per
//               100x100 cellen (tijdens een storm stormFactor keer zoveel)
//   vignette    donkere hoeken van het speelveld (0..1); fogSoft: zo'n deel van de zichtstraal
//               loopt de mist al zacht in (0 = harde rand)
//   iceShine    glinstering op ijs (0..1); shakeOnHit: schudden als je eigen tank geraakt wordt
//   haze        hittewaas in pixels zolang het weer heatHaze heeft (0 = uit)
export const LOOK = {
  light: { dx: 0.45, dy: 0.6, alpha: 0.36, blur: 2 },
  grade: { saturation: 0, brightness: 1, contrast: 1, tint: '#ffffff', tintStrength: 0 },
  noise: { scale: 9, strength: 0, octaves: 3 },
  blend: 2.2,
  weather: null, amount: 0, stormFactor: 4,
  vignette: 0.2, fogSoft: 0.15,
  iceShine: 0, shakeOnHit: 0.25,
  haze: 5, // hittewaas (als het weer heatHaze heeft): hoeveel pixels het beeld trilt
};

// Touchbesturing (tablet/telefoon, public/touch.js). deadZone: zo ver (fractie van stickRadius)
// moet je duim schuiven voor de tank rijdt, zodat een rustende duim niet kruipt. stickRadius in
// CSS-pixels: verder slepen telt niet meer (de voet schuift mee). selfDestructMs: zo lang
// vasthouden voor zelfvernietiging, zodat je hem niet per ongeluk raakt.
export const TOUCH = { deadZone: 0.3, stickRadius: 60, selfDestructMs: 1000 };

// Kogels (§5.8): dig = kogels graven een krater in de grond en stoppen daar (zoals het originele
// Tunneler). Standaard niet: ze vliegen over grond en water tot een tank, begroeiing, gebouw,
// rots of muur. Een kaart kan dit overschrijven met bulletsDig. De krater van een
// exploderende tank blijft altijd.
export const BULLETS = { dig: false };

// Gebouwen (§5.4): zoveel treffers tot het puin is; daarna wordt de cel de klasse rubble met
// een puinpatroon dat nooit vervaagt.
export const BUILDING = { hp: 4, rubble: 'soft', color: '#8c8a86' };

// Rijden door een bestaande tunnel: altijd zo snel en zo zuinig, ongeacht het terrein
export const TUNNEL = { speed: 1.0, fuel: 1 };

// Terreinklassen. Per klasse:
//   speed     rijsnelheid bij graven door ongegraven terrein (× maximale tanksnelheid)
//   fuel      brandstof per stap door ongegraven terrein
//   track     hoe zichtbaar het spoor is als een tank er net reed (0..1)
//   fade      zoveel minder zichtbaar per seconde
//   min       lager dan dit zakt het spoor niet
//   erasable  de sporenwisser (storm) kan deze tunnels laten dichtlopen
//   noTunnel  er ontstaat geen tunnel, alleen een spoor (bv. rimpels in moeras)
// Bereikt een spoor 0 (alleen mogelijk als min 0 is), dan loopt de tunnel weer dicht
// en is de cel weer ongegraven. Zo bepaal je per klasse of tunnels blijven of verdwijnen.
// Rots, water en begroeiing zijn geen klasse maar celtypes: daar kan een tank niet in.
export const TERRAIN = {
  paved: { speed: 1.0, fuel: 1, track: 0.1, fade: 0.02, min: 0.0 },
  hard: { speed: 0.8, fuel: 2, track: 0.35, fade: 0.008, min: 0.1 },
  normal: { speed: 0.65, fuel: 2, track: 0.8, fade: 0.003, min: 0.4, erasable: true },
  soft: { speed: 0.45, fuel: 3, track: 1.0, fade: 0.001, min: 0.6, erasable: true },
  marsh: { speed: 0.3, fuel: 4, track: 0.6, fade: 0.1, min: 0.0, noTunnel: true },
  // Doorwaadbare plek in een rivier: heel traag, geen tunnel, rimpels die snel verdwijnen
  ford: { speed: 0.25, fuel: 3, track: 0.6, fade: 0.1, min: 0.0, noTunnel: true },
  // IJs: rijdt als een weg, maar geen tunnel en geen spoor; het enige spoor zijn barsten (ICE)
  ice: { speed: 1.0, fuel: 1, track: 0, fade: 0, min: 0, noTunnel: true },
  // Verbrande grond (Koersk): hard en zwart; nieuwe sporen zijn juist extra duidelijk
  burnt: { speed: 0.8, fuel: 2, track: 1.0, fade: 0.008, min: 0.1 },
  // Retro: het originele Tunneler-zand (halve snelheid, tunnels blijven altijd)
  retro: { speed: 0.5, fuel: 3, track: 1.0, fade: 0, min: 1.0 },
};

// Begroeiing: zoveel treffers tot een plant weg is. Daarna blijft er een permanent gat
// (stronk/puin) in de ondergrond die de kaart aangeeft; dat vervaagt nooit.
// Gaat een plant om, dan verdwijnt ook alle begroeiing binnen clearRadius cellen van de inslag,
// zodat er altijd een doorgang is waar een tank (5 breed, 7 lang) door past: kogels gaan langs
// de lijn van je tank, dus een paar inslagen achter elkaar maken een rechte gang.
export const FELL = { clearRadius: 4 };
export const VEGETATION = {
  pine: { hp: 2 }, // dennenboom
  tree: { hp: 2 }, // loofboom, bosje
  hedge: { hp: 3 }, // heg
  shrub: { hp: 1 }, // dorre struik
  birch: { hp: 2 }, // berk
};

// IJs (bevroren rivier, Leningrad). Het ijs is verdeeld in vakken van block x block cellen
// (ongeveer een tank groot). Elk vak telt hoe vaak een tank erin reed (passCount). Bij elke
// passage breekt het met kans min(1, passCount x breakPerPass). Barsten worden zichtbaar
// vanaf crackStages passages. Breekt het, dan worden het vak en de vakken ernaast een wak:
// een tank die erin zakt rijdt nog maar sinkSpeed, kan er alleen uit (niet dieper in) en
// verliest sinkDamagePerSecond pantser per seconde tot hij weer op het droge staat.
export const ICE = { block: 6, breakPerPass: 0.08, crackStages: [2, 5, 8], sinkSpeed: 0.15, sinkDamagePerSecond: 2 };

// Sporenwisser (sneeuwstorm, zandstorm, ...): zolang hij woedt vervagen sporen op klassen
// met erasable fadeFactor keer zo snel en geldt hun minimum niet. warnSeconds: zo lang van
// tevoren staat de waarschuwing in beeld. burialSeconds: zo lang stilstaan in een storm en je
// tank is bedekt (§5.7).
export const TRACK_ERASER = { fadeFactor: 10, warnSeconds: 5, burialSeconds: 2 };

// Kaarten (SPEC-terrein §6). Elke kaart is een eigen potje. Per kaart:
//   name        naam in beeld; header: titelregel (na 'BLITZKRIEG — '); style: welke weergave
//               (zomer, winter, woestijn); tanks: {A, B} uiterlijk van de ploegen (zie boven)
//   classes     per terreinklasse {label, color, share}: share = aandeel van de vlakken, in volgorde
//               van hard naar zacht. Wegen, moeras en de ondergrond onder planten komen er los bij,
//               dus een klasse zonder share kan toch op de kaart staan (bv. paved via roads).
//   rocks       {label, color, count, min, max: straal in cellen, ridges: aantal geulen met rotsen}
//   water       {label, color, rivers (met doorwaadbare plekken), lakes, canals (met bruggen),
//               dikes: dijkweg (hard) langs kanalen, sea: 'north' = zee langs de bovenrand,
//               marsh: breedte moerasrand langs het water}
//   marshAreas  {count, size}: moerasvlekken met een rand modder (soft)
//   roads       aantal verharde wegen (over rivieren en kanalen ligt dan een brug);
//               zigzag: wegen zigzaggen (loopgraven), coastRoad: weg langs de zee
//   vegetation  {type (uit VEGETATION), label, groundAfter, clumps: aantal planten, size: straal,
//               group: planten per bosje, pattern: 'clumps' of 'hedges' (heggen langs velden)}
//               frozenRiver: bevroren rivier dwars over de kaart {at: hoogte (0..1), width, bridgeAt,
//               bridgeWidth, openings: gaten in de steile noordoever, openingWidth, holes: wakken}
//   vegetation  ... color: kleur van het bladerdek
//   tunnelColor kleur van een vers spoor
//   hazard, scarce  gevaar en schaars middel (§10, zie hazards.js); refill: {fuel, armor, ammo}
//               false = in de basis niet aangevuld
//   weather     weerregels (§7, zie shared/weather.js): zicht, sporenwisser, onderduiken,
//               terreinveranderingen per ronde (dooi, modder) en vlaggen zoals fog (witte mist)
//   buildings   {at: [x, y] als fractie, count, spread: fractie, min, max: zijde in cellen}: losse
//               huizen (voorlopig; de dorpsmodule komt in fase 4)
//   bulletsDig, minimap   overschrijven BULLETS.dig en DISPLAY.minimap voor deze kaart
//   look        uiterlijk in de weergave (kleurfilter, grondtextuur, weer, licht): zie LOOK
//   mines       mijnenvelden (El Alamein)
// Kaarten met terrainPercent en features (§11) gaan via de kaartmaker in mapgen.js:
//   terrainPercent  {klasse | rock | water | vegetation | building: procent van het speelbare deel}
//   features    village {at, size, name, buildings: [min, max], landmark}, road {from, to, width (T)},
//               river {from, to, width (T), frozen, bridges: 'atRoads', fords}
// De kleuren (SPEC-blitzkrieg §10) zijn voor de weergave; de spelregels gebruiken alleen de klassen.
// Terugkerende storm (§7): elke 90 s, 20 s lang; sporenwisser en onderduiken, zichtstraal 4 T
const storm = (label, extra = {}) => ({ label, from: { secondsInGame: 0 }, every: 90, duration: 20, effect: { visibility: 4, trackEraser: true, burial: true }, ...extra });

// Het mapmenu (§3, §10): alle maps in chronologische volgorde. Maps die nog niet in MAPS staan,
// zijn in het menu zichtbaar maar uitgeschakeld.
export const MAP_MENU = [
  { id: 'fall-gelb', year: 1940, mission: 'Fall Gelb', name: 'Grebbeberg' },
  { id: 'barbarossa', year: 1941, mission: 'Barbarossa', name: 'Russische vlakte' },
  { id: 'el-alamein', year: 1942, mission: 'Lightfoot', name: 'El Alamein' },
  { id: 'leningrad', year: 1942, mission: 'Beleg van Leningrad', name: 'Leningrad' },
  { id: 'koersk', year: 1943, mission: 'Zitadelle', name: 'Koersk' },
  { id: 'carentan', year: 1944, mission: 'Overlord', name: 'Carentan' },
  { id: 'market-garden', year: 1944, mission: 'Market Garden', name: 'Arnhem' },
  { id: 'ardennen', year: 1944, mission: 'Wacht am Rhein', name: 'Ardennen' },
  { id: 'seelow', year: 1945, mission: 'Seelower Hoogten', name: 'Oder-front' },
  { id: 'berlijn', year: 1945, mission: 'Val van Berlijn', name: 'Berlijn' },
];
export const DEFAULT_MAP = 'ardennen';

// Tanks per kaart (§4): alle tanks zijn gelijk, alleen het uiterlijk verschilt. Ploeg A en B
// uit de spec; bij 3 of 4 spelers rijden C en D als variant van A en B (ander nummer, iets
// donkerder). mark: 'star' (witte ster), 'redstar', 'number' (alleen een nummer), 'roundel'.
// winter: witte vlekken; camo: kleur van de camouflagevlekken.
const T_SHERMAN = { name: 'SHERMAN', hull: '#55602f', mark: 'star' };
const T_T34 = { name: 'T-34', hull: '#45573a', mark: 'redstar' };

export const MAPS = {
  retro: { name: 'Tunneler', classes: { retro: { share: 1 } }, rocks: { count: 70, min: 3, max: 12 }, bulletsDig: true },

  'fall-gelb': { // §10.1
    name: 'Grebbeberg 1940', style: 'zomer', header: 'FALL GELB — GREBBEBERG · MEI 1940',
    tanks: { A: { name: 'LANDSVERK', hull: '#6a7158', mark: 'triangle' }, B: { name: 'PANZER II', hull: '#4f5356', mark: 'number', number: '211' } },
    terrainPercent: { normal: 39, soft: 17, hard: 10, vegetation: 15, marsh: 7, rock: 4, paved: 8 },
    classes: {
      paved: { label: 'Wegen en het dorp', color: '#c8b48a' },
      hard: { label: 'Droge grond op de heuvel', color: '#9c9462' },
      normal: { label: 'Weilanden', color: '#6d8a3a' },
      soft: { label: 'Natte klei', color: '#6f6446' },
      marsh: { label: 'Drassig', color: '#5c7360' },
    },
    rocks: { label: 'Rotsen op de heuvelflank', color: '#9a9890', in: 'heuvel', size: [0.5, 1.4] },
    water: { label: 'Inundatiewater', color: '#3d5f6f' },
    vegetation: { type: 'tree', label: 'Loofbossen', color: '#2f4a24', groundAfter: 'hard', in: 'heuvel' },
    noPonds: true, // bij de start geen open water
    features: [
      { type: 'area', name: 'vallei', rect: [0, 0, 0.55, 1], classes: { normal: 50, soft: 34, marsh: 16 } },
      { type: 'area', name: 'heuvel', rect: [0.55, 0, 1, 1], classes: { hard: 40, normal: 60 } },
      { type: 'village', at: [0.65, 0.75], size: 0.07, name: 'Rhenen', buildings: [4, 6], landmark: 'kerk', depot: 'ammo' },
      { type: 'road', from: [0, 0.45], to: [0.65, 0.75], width: 2 },
      { type: 'road', from: [0.65, 0.75], to: [1, 0.35], width: 2 },
    ],
    refill: { ammo: false }, // munitie alleen bij het depot in Rhenen
    scarce: { type: 'ammoDepot' },
    look: { grade: { saturation: 0.05, tint: '#fff2d8', tintStrength: 0.08 }, noise: { strength: 0.08 } },
    tunnelColor: '#4a3a22',
    weather: [
      { label: 'Inundatie', from: { round: 2 }, everyRound: true, untilRound: 4, effect: { terrain: { type: 'inundate', valley: [0, 0.55], stages: 3 } } },
      { label: 'Regen', from: { round: 3 }, untilRound: 3, effect: { visibility: 8 } },
      { label: 'Rook van brandende boerderijen', effect: { farmSmoke: true } },
    ],
  },

  barbarossa: { // §10.2
    name: 'Russische vlakte 1941', style: 'zomer', header: 'BARBAROSSA — RUSSISCHE VLAKTE · ZOMER 1941',
    tanks: { A: T_T34, B: { name: 'PANZER III', hull: '#5a5e60', mark: 'number', number: '311' } },
    terrainPercent: { hard: 55, normal: 15, soft: 5, vegetation: 12, paved: 6, rock: 4, water: 3 },
    classes: {
      paved: { label: 'Zandweg en dorp', color: '#b89c6a' },
      hard: { label: 'Droge, harde vlakte', color: '#c2a868' },
      normal: { label: 'Akkers', color: '#8f8a48' },
      soft: { label: 'Zandige plekken (later modder)', color: '#5a4632' },
    },
    rocks: { label: 'Rotsblokken', color: '#8d8a80' },
    water: { label: 'Kleine plassen', color: '#4a6a6a' },
    vegetation: { type: 'birch', label: 'Berkenbossen', color: '#5f7a3a', groundAfter: 'normal' },
    features: [
      { type: 'road', from: [0, 0.5], to: [1, 0.5], width: 2 },
      { type: 'village', at: [0.5, 0.5], size: 0.05, name: 'Dorp', layout: 'row', buildings: [5, 5] },
    ],
    look: { grade: { saturation: -0.05, tint: '#ffe6b8', tintStrength: 0.12 }, noise: { strength: 0.1 }, weather: 'dust', amount: 6 },
    tunnelColor: '#3e3022',
    weather: [
      { label: 'Zomer', untilRound: 2, effect: { visibility: 10, heatHaze: true, dust: true } },
      { label: 'Modderseizoen', from: { round: 3 }, effect: { visibility: 8, mud: true, terrain: { type: 'reclass', from: ['hard', 'normal'], to: 'soft', keepTracks: true } } },
    ],
  },

  'el-alamein': { // §10.3
    name: 'El Alamein 1942', style: 'woestijn', header: 'LIGHTFOOT — EL ALAMEIN · OKTOBER 1942',
    tanks: { A: { name: 'CRUSADER', hull: '#c9b07a', mark: 'roundel', camo: '#7d8a8e' }, B: { name: 'PANZER III', hull: '#c2ac72', mark: 'number', number: '412' } },
    terrainPercent: { soft: 50, hard: 20, paved: 5, rock: 10, water: 10, vegetation: 5 },
    classes: {
      paved: { label: 'Kustweg', color: '#a89c84' },
      hard: { label: 'Rotsige grond', color: '#b39a6a' },
      soft: { label: 'Woestijnzand', color: '#d8bc80' },
    },
    rocks: { label: 'Rotsplateaus', color: '#9a9a96', size: [3.5, 6] },
    water: { label: 'Zee', color: '#2f5f7a' },
    vegetation: { type: 'shrub', label: 'Dorre struiken', color: '#6e6a3c', groundAfter: 'soft' },
    noPonds: true,
    features: [
      { type: 'sea', side: 'north', depth: 0.13 }, // ~10% van het speelbare deel (zonder de rotsrand)
      { type: 'road', from: [0, 0.17], to: [1, 0.17], width: 2, bridges: false },
    ],
    meter: { type: 'sand', label: 'Zandmeter', danger: 60, color: '#d8a040' },
    look: { grade: { saturation: -0.12, contrast: 1.05, tint: '#ffd9a0', tintStrength: 0.18 }, noise: { scale: 12, strength: 0.12 }, weather: 'dust', amount: 14, vignette: 0.35 },
    tunnelColor: '#6e5430',
    weather: [
      { label: 'Hitte', effect: { visibility: 10, heatHaze: true, mirages: true } },
      storm('Zandstorm'),
    ],
    mines: true,
  },

  leningrad: { // §10.4
    name: 'Leningrad 1942', style: 'winter', header: 'BELEG VAN LENINGRAD — LENINGRAD · WINTER 1942',
    tanks: { A: { ...T_T34, winter: true }, B: { name: 'PANZER IV', hull: '#4f5458', mark: 'number', number: '211' } },
    terrainPercent: { soft: 46, hard: 15, ice: 12, rock: 8, vegetation: 12, paved: 5, water: 2 },
    classes: {
      paved: { label: 'Weg en brug', color: '#9a978f' },
      hard: { label: 'Bevroren veen', color: '#8a7e72' }, // spec: #4a3a2e, maar dan zie je tunnels niet
      soft: { label: 'Sneeuw op aarde', color: '#e6ecef' },
      ice: { label: 'Bevroren Neva', color: '#a9c7d6' },
    },
    rocks: { label: 'Steile oever en ruïnes', color: '#8a8f94', in: 'zuid', size: [0.6, 1.4] },
    water: { label: 'Wakken', color: '#1e2e38' },
    vegetation: { type: 'birch', label: 'Berkenbossen', color: '#7d8a74', groundAfter: 'soft' },
    noPonds: true,
    features: [
      { type: 'river', from: [0, 0.45], to: [1, 0.45], width: 5, frozen: true, holes: 2, wiggle: 0.04, bank: { side: 'north', thickness: 1, openings: 3, openingWidth: 3 } },
      { type: 'road', from: [0.7, 0], to: [0.7, 1], width: 2 },
      { type: 'area', name: 'zuid', rect: [0, 0.56, 1, 1], classes: { soft: 75, hard: 25 } },
    ],
    meter: { type: 'heat', label: 'Motorwarmte', start: 100, danger: 0, low: true, color: '#e08a40' },
    look: { light: { dx: 0.5, dy: 0.65, alpha: 0.32, blur: 3 }, grade: { saturation: -0.18, brightness: 0.97, contrast: 1.06, tint: '#d2e2ff', tintStrength: 0.18 }, noise: { scale: 6, strength: 0.3, octaves: 4 }, blend: 3.5, weather: 'snow', amount: 40, vignette: 0.28, fogSoft: 0.25, iceShine: 0.8, shakeOnHit: 0.3 },
    tunnelColor: '#3a2f27',
    weather: [
      { label: 'Winterschemering', from: { secondsInRound: 0 }, effect: { visibility: { start: 12, end: 6, overSeconds: 180 } } },
      storm('Sneeuwjacht', { untilRound: 3 }),
      { label: 'Dooi', from: { round: 4 }, effect: { terrain: { type: 'thaw', pools: [4, 6], poolRadius: 5 }, thawed: true } },
    ],
  },

  koersk: { // §10.5
    name: 'Koersk 1943', style: 'zomer', header: 'ZITADELLE — KOERSK · JULI 1943',
    tanks: { A: T_T34, B: { name: 'TIGER', hull: '#b8a066', mark: 'number', number: '121', camo: '#6b5a3a' } },
    terrainPercent: { normal: 45, hard: 15, soft: 12, paved: 6, rock: 8, vegetation: 8, water: 6 },
    classes: {
      paved: { label: 'Loopgraven', color: '#7a6448' },
      hard: { label: 'Droge steppe', color: '#a89060' },
      normal: { label: 'Graanvelden', color: '#b89a4a' },
      soft: { label: 'Zwarte aarde', color: '#3e3022' },
      marsh: { label: 'Modder (na het onweer)', color: '#4c5440', later: true },
      burnt: { label: 'Verbrand graan', color: '#1c1a17', later: true },
    },
    rocks: { label: "Balka's", color: '#8d8f8c', size: [0.5, 1.2] },
    // de Psel (3 T) is maar ~3% van de kaart; de rest van de 6% water zijn plassen
    water: { label: 'De Psel en plassen', color: '#3d5a66' },
    vegetation: { type: 'tree', label: 'Bosjes', color: '#3f5a2a', groundAfter: 'normal' },
    features: [
      { type: 'river', from: [0.6, 0], to: [1, 0.4], width: 3, bridges: 'atRoads' },
      { type: 'road', from: [0.45, 0.3], to: [0.95, 0.1], width: 2, zigzag: 1.5 }, // loopgraven; deze over de enige brug
      { type: 'road', from: [0.3, 0.55], to: [0.78, 0.6], width: 2, zigzag: 1.5 },
      { type: 'road', from: [0.12, 0.82], to: [0.6, 0.78], width: 2, zigzag: 1.5 },
      { type: 'ridge', from: [0.05, 0.42], to: [0.45, 0.66], width: 1.5, openings: 2, wiggle: 0.5 },
      { type: 'ridge', from: [0.55, 0.92], to: [0.95, 0.7], width: 1.5, openings: 2, wiggle: 0.5 },
    ],
    hazard: { type: 'grainFire', shotChance: 0.1, stormShotChance: 0.03, everySeconds: 120, spreadSeconds: 1, burnSeconds: 15, armorPerSecond: 5, wind: true },
    meter: { type: 'temp', label: 'Motortemperatuur', danger: 100, color: '#e0603a' },
    look: { grade: { saturation: 0.05, tint: '#ffe8c0', tintStrength: 0.1 }, noise: { strength: 0.08 } },
    tunnelColor: '#2e2418',
    weather: [
      { label: 'Zomerhitte', untilRound: 2, effect: { visibility: 12, fires: true, battleSmoke: true } },
      { label: 'Onweer', from: { round: 3 }, effect: { visibility: 8, thunder: true, terrain: { type: 'reclass', from: ['soft'], to: 'marsh' } } },
    ],
  },

  carentan: { // §10.6
    name: 'Carentan 1944', style: 'zomer', header: 'OVERLORD — CARENTAN · JUNI 1944',
    tanks: { A: { ...T_SHERMAN, camo: '#3e4a26' }, B: { name: 'PANZER IV', hull: '#b49a52', mark: 'number', number: '615', camo: '#4d5a2e' } },
    terrainPercent: { normal: 40, marsh: 15, vegetation: 15, paved: 8, hard: 7, soft: 5, water: 6, rock: 4 },
    classes: {
      paved: { label: 'Wegen en dorpsstraten', color: '#8c8a80' },
      hard: { label: 'Dijkweg', color: '#9c8f6c' },
      normal: { label: 'Weilanden', color: '#56702f' },
      soft: { label: 'Modder rond het moeras', color: '#5c4a34' },
      marsh: { label: 'Moeras', color: '#55696c' },
    },
    rocks: { label: 'Rotsen', color: '#8c8a80', size: [0.5, 1] },
    // de Douve en het kanaal hebben een vaste breedte; op een grote kaart vullen plassen de 6% water aan
    water: { label: 'Douve, kanaal en plassen', color: '#1f3440' },
    vegetation: { type: 'hedge', pattern: 'bocage', spacing: 7, label: 'Heggen (bocage)', color: '#23381b', groundAfter: 'normal' },
    features: [
      { type: 'area', name: 'moeras', rect: [0, 0.5, 0.5, 1], classes: { marsh: 60, soft: 22, normal: 18 } },
      { type: 'river', from: [0, 0.92], to: [0.6, 0.92], width: 3, bridges: 'atRoads', wiggle: 0.05 }, // de Douve
      { type: 'river', from: [0.25, 0.5], to: [0.25, 1], width: 2, bridges: 'atRoads', wiggle: 0.04 }, // kanaal
      { type: 'village', at: [0.75, 0.25], size: 0.07, name: 'Carentan', buildings: [5, 7], landmark: 'kerk' },
      { type: 'road', from: [0, 0.72], to: [0.75, 0.25], width: 2, class: 'hard' }, // dijkweg over het moeras
      { type: 'road', from: [0.75, 0.25], to: [1, 0.3], width: 2 },
      { type: 'road', from: [0.75, 0.25], to: [0.78, 0], width: 2 },
      { type: 'road', from: [0.75, 0.25], to: [0.9, 1], width: 2 },
    ],
    hazard: { type: 'atGuns', count: 2, coneDegrees: 45, rangeT: 10, everySeconds: 4, armorLoss: 25, hp: 4 },
    look: { grade: { saturation: -0.05, tint: '#e6f0e0', tintStrength: 0.08 }, noise: { strength: 0.08 }, weather: 'rain', amount: 8 },
    tunnelColor: '#4a3a22',
    weather: [
      { label: 'Ochtendmist', untilRound: 1, effect: { visibility: 4 } },
      { label: 'Wisselend bewolkt', from: { round: 2 }, effect: { visibility: 12 } },
      { label: 'Regenbui', from: { round: 2 }, every: 120, duration: 20, effect: { visibility: 8, trackEraser: 'nearWater' } },
    ],
  },

  'market-garden': { // §10.7
    name: 'Arnhem 1944', style: 'zomer', header: 'MARKET GARDEN — ARNHEM · SEPTEMBER 1944',
    tanks: { A: { name: 'CROMWELL', hull: '#55602f', mark: 'star' }, B: { name: 'PANZER IV', hull: '#5a5e60', mark: 'number', number: '722' } },
    terrainPercent: { normal: 40, soft: 12, hard: 10, water: 12, paved: 8, vegetation: 10, marsh: 5, rock: 3 },
    classes: {
      paved: { label: 'Wegen, brug en stad', color: '#8a7a6a' },
      hard: { label: 'Dijken', color: '#9a8a5a' },
      normal: { label: 'Polders', color: '#6a8a3a' },
      soft: { label: 'Natte klei', color: '#6b5a3e' },
      marsh: { label: 'Uiterwaarden', color: '#5f7258' },
      ford: { label: 'Doorwaadbare plek', color: '#6f8288' },
    },
    rocks: { label: 'Rotsen', color: '#8a8580', size: [0.5, 1] },
    water: { label: 'De Rijn en sloten', color: '#3a5a6a' },
    vegetation: { type: 'tree', pattern: 'rows', label: 'Bomenrijen en boomgaarden', color: '#3f5a2a', groundAfter: 'normal' },
    basesAcross: 0, // bases om en om ten noorden en ten zuiden van de Rijn
    features: [
      { type: 'river', from: [0, 0.4], to: [1, 0.4], width: 5, bridges: 'atRoads', wiggle: 0.03, fords: { klein: 1, middel: 2, groot: 3, extragroot: 3 }, dikes: { floodplain: 1, width: 2 } },
      { type: 'road', from: [0.5, 0], to: [0.5, 1], width: 2 },
      { type: 'village', at: [0.5, 0.24], size: 0.05, name: 'Arnhem', buildings: [5, 8], landmark: 'kerk' },
      { type: 'ditches', rect: [0, 0.56, 1, 1], spacing: 24, damsEvery: 1 },
    ],
    hazard: { type: 'bridgeBlast', armorLoss: 40, chance: 0.1, chanceStep: 0.05 }, // kans per oversteek, +5% na elke oversteek
    scarce: { type: 'airDrops', everySeconds: 30, fuel: 0.4, ammo: 25 },
    refill: { fuel: false, ammo: false },
    look: { noise: { strength: 0.08 } },
    tunnelColor: '#4a3a22',
    weather: [
      { label: 'Helder', untilRound: 2, effect: { visibility: 12, drops: true, citySmoke: true } },
      { label: 'Mist en regen', from: { round: 3 }, effect: { visibility: 8 } },
    ],
  },

  ardennen: { // §10.8
    name: 'Ardennen 1944', style: 'winter', header: 'WACHT AM RHEIN — ARDENNEN · DECEMBER 1944',
    tanks: { A: { ...T_SHERMAN, winter: true }, B: { name: 'KÖNIGSTIGER', hull: '#d8d6cc', mark: 'number', number: '332' } },
    terrainPercent: { soft: 52, hard: 12, vegetation: 18, paved: 8, rock: 6, water: 4 },
    tolerance: { klein: 1, default: 0 }, // klein: wegen (vaste breedte) zijn ~14% verhard, dat gaat van de sneeuw af
    classes: {
      paved: { label: 'Bosweg en Bastogne', color: '#9b9184' },
      hard: { label: 'Bevroren grond', color: '#bccfda' },
      soft: { label: 'Verse sneeuw', color: '#dfe6ea' },
    },
    rocks: { label: 'Rotsblokken', color: '#8d9196' },
    water: { label: 'Bergbeek', color: '#1e3a4a' },
    vegetation: { type: 'pine', label: 'Dennenbossen', color: '#1f3a2a', groundAfter: 'soft' },
    features: [
      { type: 'village', at: [0.5, 0.5], size: 0.17, name: 'Bastogne', buildings: [6, 8], landmark: 'kerk' },
      { type: 'road', from: [0.5, 0.5], to: [0, 0.5], width: 2 },
      { type: 'road', from: [0.5, 0.5], to: [0.5, 0], width: 2 },
      { type: 'road', from: [0.5, 0.5], to: [1, 0.5], width: 2 },
      { type: 'road', from: [0.5, 0.5], to: [0.15, 1], width: 2 },
      { type: 'road', from: [0.5, 0.5], to: [0.85, 1], width: 2 },
      { type: 'river', from: [0, 0.8], to: [1, 0.8], width: 2, bridges: 'atRoads' },
    ],
    look: { grade: { saturation: -0.12, contrast: 1.04, tint: '#d4e2ff', tintStrength: 0.15 }, noise: { scale: 8, strength: 0.1 }, blend: 3, weather: 'snow', amount: 25, vignette: 0.25, fogSoft: 0.2 },
    tunnelColor: '#2b2118',
    weather: [
      { label: 'Dichte mist', from: { secondsInRound: 0 }, untilRound: 2, effect: { visibility: { start: 2, end: 12, overSeconds: 120 }, fog: true } },
      storm('Sneeuwstorm'),
    ],
    hazard: { type: 'forestBarrage', everySeconds: 20, area: 6, warningSeconds: 2, armorLoss: 15 },
    scarce: { type: 'fuelDepots', count: { klein: 2, middel: 2, groot: 3, extragroot: 3 } },
  },

  seelow: { // §10.9
    name: 'Oder-front 1945', style: 'zomer', header: 'SEELOWER HOOGTEN — ODER-FRONT · APRIL 1945',
    tanks: { A: T_T34, B: { name: 'PANTHER', hull: '#5a5e60', mark: 'number', number: '401' } },
    terrainPercent: { soft: 30, marsh: 15, hard: 20, normal: 10, rock: 10, vegetation: 5, water: 6, paved: 4 },
    classes: {
      paved: { label: 'Wegen', color: '#5a5650' },
      hard: { label: 'Heuvelrug', color: '#4a4238' },
      normal: { label: 'Akkers', color: '#3e4a30' },
      soft: { label: 'Natte aarde', color: '#3a3026' },
      marsh: { label: 'Moeras', color: '#2e3a36' },
    },
    rocks: { label: 'Steile helling', color: '#5a5c5e', in: 'heuvelrug', size: [0.6, 1.5] },
    water: { label: 'De Oder en een kanaal', color: '#18242c' },
    vegetation: { type: 'tree', label: 'Bosjes op de heuvel', color: '#2a3a26', groundAfter: 'hard', in: 'heuvelrug' },
    noPonds: true,
    features: [
      { type: 'area', name: 'heuvelrug', rect: [0, 0, 0.33, 1], classes: { hard: 80, normal: 20 } },
      { type: 'area', name: 'dal', rect: [0.5, 0, 1, 1], classes: { soft: 63, marsh: 37 } }, // minder moeras: op grote kaarten neemt de rivier minder van het dal in
      { type: 'river', from: [0.96, 0], to: [0.96, 1], width: 4, bridges: false, wiggle: 0.03 }, // de Oder
      { type: 'river', from: [0.72, 0], to: [0.72, 1], width: 2, bridges: 'atRoads', wiggle: 0.04 }, // kanaal
      { type: 'ridge', from: [0.33, 0], to: [0.33, 1], width: 2, openings: 1, openingWidth: 3, wiggle: 0.15 }, // helling
      { type: 'road', from: [0.3, 0.3], to: [0.88, 0.3], width: 2 },
      { type: 'road', from: [0.3, 0.72], to: [0.88, 0.72], width: 2 },
    ],
    hazard: { type: 'artillery', everySeconds: 60, area: 6, warningSeconds: 3, armorLoss: 30 },
    look: { grade: { saturation: -0.15, brightness: 0.92, tint: '#c8d0e8', tintStrength: 0.12 }, vignette: 0.32 },
    tunnelColor: '#1a1410',
    weather: [
      { label: 'Nacht met zoeklichten', untilRound: 2, effect: { visibility: 4, night: true, searchlights: { beams: 3, widthT: 4, sweepSeconds: 12, visibility: 12 } } },
      { label: 'Dageraad', from: { round: 3 }, effect: { visibility: 8 } },
    ],
  },

  berlijn: { // §10.10
    name: 'Berlijn 1945', style: 'zomer', header: 'VAL VAN BERLIJN — BERLIJN · APRIL 1945',
    tanks: { A: T_T34, B: { name: 'PANZER IV', hull: '#5a5e60', mark: 'number', number: '503' } },
    terrainPercent: { paved: 30, building: 30, soft: 15, normal: 8, vegetation: 5, water: 7, rock: 5 },
    classes: {
      paved: { label: 'Straten en pleinen', color: '#7a7670' },
      soft: { label: 'Puin', color: '#9a8f80' },
      normal: { label: 'Parken', color: '#4a5a3a' },
    },
    buildings: { color: '#8c8a86' },
    rocks: { label: 'Betonnen bunkers', color: '#6c6c68', size: [0.6, 1.2] },
    water: { label: 'Spree en Landwehrkanaal', color: '#2a3a44' },
    vegetation: { type: 'tree', label: 'Parkbomen', color: '#3a4a2a', groundAfter: 'normal', in: 'park' },
    noPonds: true,
    features: [
      // spec: Spree 3 T en kanaal 2 T, maar dan is het water ~12% in plaats van 7%; daarom iets smaller
      { type: 'river', from: [0, 0.35], to: [1, 0.35], width: 2, bridges: 2, wiggle: 0.03 }, // Spree
      { type: 'river', from: [0, 0.7], to: [1, 0.7], width: 1.5, bridges: 2, wiggle: 0.03 }, // Landwehrkanaal
      { type: 'park', at: [0.3, 0.5], size: 0.15, name: 'Tiergarten' },
      { type: 'city', block: [8, 12], street: 2 },
    ],
    // De beschermde zones rond 4 bases (3 T vrij, §6.2) beslaan ~13% van de stad en daar mogen geen
    // huizen staan; met 4 spelers haalt Berlijn daardoor ~25% gebouwen. Op de kleine kaart passen de
    // bases niet tussen de rivieren en nemen ze nog meer van de stad (~20% gebouwen). Ruimere marge (procentpunt).
    tolerance: { klein: 13, default: 8 },
    hazard: { type: 'facades', chancePerSecond: 0.05, armorLoss: 10, rammingLoss: 25, collapseAfterHits: 3, collapseSeconds: 3, collapseLoss: 25, dustSeconds: 10 },
    refill: { armor: false }, // pantser wordt tijdens een ronde niet hersteld
    look: { grade: { saturation: -0.3, contrast: 1.05, tint: '#e8e0d8', tintStrength: 0.1 }, weather: 'dust', amount: 5, vignette: 0.32 },
    tunnelColor: '#2a2420',
    weather: [
      { label: 'Rook boven de stad', untilRound: 1, effect: { visibility: 12 } },
      { label: 'Dichtere rook', from: { round: 2 }, untilRound: 2, effect: { visibility: 8 } },
      { label: 'Dikke rook en regen', from: { round: 3 }, effect: { visibility: 6 } }, // geen metro (op verzoek)
    ],
  },
};
