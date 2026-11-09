// Alle instelbare getallen van het terreinsysteem op één plek (server én browser).
// Pas hier aan tijdens het testen; de rest van de code leest alleen deze tabellen.

// Spel en rondes (§2). Een ronde eindigt zodra er een tank dood is; daarna begint iedereen
// weer in zijn basis met alles vol. Bij 2 spelers wint wie eerst roundsToWin rondes wint,
// bij meer spelers wie eerst killsToWin kills heeft. roundPauseSeconds: even stil tussen
// rondes; gameOverSeconds: zo lang staat de winnaar in beeld, daarna een nieuw spel met
// een nieuwe kaart. Tunnels en andere veranderingen aan de kaart blijven tussen rondes liggen.
export const GAME = { roundsToWin: 3, killsToWin: 5, roundPauseSeconds: 3, gameOverSeconds: 8, maxPlayers: 4 };

// Rondekeuze in de wachtkamer (§2): hoeveel rondes je moet winnen (bij 2 spelers), of het aantal
// kills dat nodig is (bij meer). De host kiest; standaard 3.
export const ROUND_OPTIONS = [1, 2, 3, 5, 7];
export const DEFAULT_ROUNDS = 3;

// Instelbare spelopties in de wachtkamer. De host kan deze veranderen; iedereen speelt met
// dezelfde waarden. Elke sleutel is een vermenigvuldiger of schakelaar; de standaard is altijd
// de "gewone" ervaring. De opties zijn wat de dropdown toont.
export const LOBBY_SETTINGS = {
  stormFreq:  { label: 'Storm',          type: 'select', default: 1,  options: [[0, 'Uit'], [2, 'Langzaam'], [1, 'Normaal'], [0.5, 'Snel']] },
  hazards:    { label: 'Gevaren',        type: 'toggle', default: 1,  options: [[1, 'Aan'], [0, 'Uit']] },
  minimap:    { label: 'Minimap',         type: 'toggle', default: 1,  options: [[1, 'Aan'], [0, 'Uit']] },
  fuelMul:    { label: 'Brandstof',      type: 'select', default: 1,  options: [[0.5, 'Laag'], [1, 'Normaal'], [2, 'Hoog']] },
  shieldMul:  { label: 'Pantser',        type: 'select', default: 1,  options: [[0.5, 'Laag'], [1, 'Normaal'], [2, 'Hoog']] },
  ammoMul:    { label: 'Munitie',        type: 'select', default: 1,  options: [[0.5, 'Laag'], [1, 'Normaal'], [2, 'Hoog']] },
};
// Standaardwaarden als plat object (server en client)
export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(LOBBY_SETTINGS).map(([k, v]) => [k, v.default]),
);

// Tank (§5): voorraden (brandstof in eenheden, pantser en munitie), buiten de basis 1 brandstof per
// idleDrainEvery ticks, fireCooldown ticks tussen schoten, deathDigR: krater als hij ontploft.
// Alle tanks zijn gelijk; per kaart verschilt alleen het uiterlijk.
export const TANK = { fuelMax: 3000, shieldMax: 100, ammoMax: 50, idleDrainEvery: 10, fireCooldown: 4, deathDigR: 12 };
// Bijvullen in de eigen basis: fuel per tick, 1 pantser per armorEvery ticks, 1 munitie per
// ammoEvery ticks (een kaart kan dat uitzetten met refill)
export const REFILL = { fuel: 15, armorEvery: 4, ammoEvery: 6 };
// Mijnen (El Alamein): schade en krater
export const MINES = { damage: 15, digR: 2 };

// Netwerk en klok. tickRate: simulatiestappen per seconde (server en clients). Server: hartslag
// (wie niet antwoordt, wordt afgesloten), max. berichten per seconde per speler en max. grootte.
// Client: renderDelay ticks buffer voor andere tanks, histLen posities om tussen te interpoleren,
// maxPred onbevestigde ticks invoer, smoothMs om correcties weg te werken, messageSeconds:
// zo lang staat een melding van de server in beeld.
export const NET = {
  tickRate: 30, heartbeatMs: 5000, maxMsgsPerSec: 60, maxPayload: 4 * 1024,
  renderDelay: 1, histLen: 12, maxPred: 120, smoothMs: 100, messageSeconds: 6,
};

// Toegang via internet; de geheimen zelf staan uitsluitend in de serveromgeving.
export const AUTH = {
  minPassphraseLength: 16, minSecretLength: 32, sessionMs: 8 * 60 * 60 * 1000,
  failureWindowMs: 60 * 1000, maxFailures: 20, maxBodyBytes: 4096,
  maxCookieLength: 256, nonceBytes: 16,
};

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

// Zicht (§9, met afwijkingen: zie README). De zichtcirkel is de halve hoogte van het beeld;
// het weer (in T, zoals de spec) maakt hem kleiner: defaultT = de volle cirkel, 6 T = de helft.
// Binnen de cirkel zie je rondom. coneDegrees: kijkboog in de rijrichting; alleen daarin
// verbergen gebouwen, begroeiing, rotsen en rook wat erachter ligt, en alleen daarin zie je
// buiten de cirkel nog contouren. minTanks: de kleinste cirkel, in tankbreedtes.
export const VISION = { defaultT: 12, coneDegrees: 130, minTanks: 2 };

// Venster in cellen (de grootste weergave): §6.2, vanuit je basis zie je geen andere basis
export const VIEW_CELLS = { w: 140, h: 96 };

// Richtingshints (§8): gehoorafstand in T, hoe lang een gloed oplicht en dooft (seconden),
// en hoe vaak het stofspoor (Barbarossa) een hint geeft.
export const HINTS = { hearingT: 20, glowSeconds: 3, dustEverySeconds: 10 };

// Zicht (§9) in de weergave: buiten de zichtcirkel steeds vager en donkerder naar de rand
// (fade: donkerte aan de rand van het venster, 0..1; blur: vervaging aan de rand, in pixels),
// buiten je zichtveld (achter gebouwen, begroeiing, rotsen, rook en buiten de kijkboog)
// donkerder (shadow). shadowFalloffT: breedte van de zachte overgang in T-lang naar de
// donkere zone; contourAlpha: dekking van een contour net buiten de cirkel; naar de rand van
// het venster loopt hij af tot 0. debug: ?debug=alles toont alles, alleen op localhost.
export const FOG = { fade: 0.62, shadow: 0.35, blur: 3, contourAlpha: 0.5, shadowFalloffT: 1 };

// Weergave. minimap: minikaart aan of uit (een kaart kan dit overschrijven met minimap: false).
export const DISPLAY = { minimap: true };

// Lokale camerazoom tijdens het spelen: 9 zoomt in, 0 zoomt uit.
export const CAMERA_ZOOM = { default: 2, step: 0.1, min: 0.5, max: 4, indicatorMs: 1500 };

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
//   weather     deeltjes in beeld: 'snow' (SNOW_FX), 'sand' (SAND_FX), 'dust' of null; amount =
//               deeltjes per 100x100 cellen (stof: tijdens een storm stormFactor keer zoveel).
//               Regen komt uit de weerregel rain (RAIN_FX), niet uit look
//   vignette    donkere hoeken van het speelveld (0..1); fogSoft: zo'n deel van de zichtstraal
//               loopt de mist al zacht in (0 = harde rand)
//   iceShine    glinstering op ijs (0..1); shakeOnHit: schudden als je eigen tank geraakt wordt
//   haze        hittewaas in pixels zolang het weer heatHaze heeft (0 = uit)
//   ground      grondshader (public/view/ground-gpu.js): cells = zoveel cellen beslaat één
//               grondtextuur (512 px, getekend op 32 px per cel), tint = hoeveel de textuur naar
//               de klassekleur van de kaart gekleurd wordt (0 = eigen kleur, 1 = klassekleur),
//               contrast = hoeveel van de tekening overblijft (0 = effen, 1 = zoals getekend);
//               een kaart kan met textures: { klasse: naam } een andere textuur uit
//               public/assets/<stijl>/terrain/ kiezen dan manifest.json zegt
//   water       water in de grondshader: deep = donkerte in het diepe (x de waterkleur), depthCells =
//               zoveel cellen van de kant is het diep, shore = zoveel lichter aan de kant, shine =
//               glinstering; golven: waveCells (maat in cellen), waveSpeed (vlekken per seconde),
//               waves (sterkte, 0 = vlak); grillige waterlijn (ook ijs): edgeNoise = hoe ver de lijn
//               hoogstens verschuift (cellen, 0 = glad zoals de cellen), edgeScale = maat van de
//               inhammen (cellen), edgeFine = aandeel van de fijne, rafelige ruis (0..1)
//   ice         ijs: depthCells en deep (donker, diep ijs naar het midden), frost (witte ijzel),
//               sheen (glans), stress (zoveel donkerder en natter in een vak dat bijna breekt);
//               barsten: crackWidth (dikte) en crackGrow (zoveel dikker per barststadium);
//               met een ijstextuur (manifest): texScale (zoveel groter dan de grondtextuur) en
//               texDeep (zoveel donkerder naar het midden); frost en deep gelden dan niet
//   road        wegen (middellijnen uit de kaartmaker): verge = breedte van de berm in cellen,
//               vergeColor (null = de tunnelkleur: modder) en vergeAmount; rijsporen: ruts
//               (donkerte), rutOffset (afstand tot het midden) en rutWidth; smooth = afronding van
//               binnenhoeken, junction = zo ver van een kruising heeft de weg weer een richting;
//               curb = stoeprand in cellen (0 = geen) met curbColor; line = middenstreep (0..1);
//               vergeInside = zoveel cellen loopt de berm de rijbaan op (zachte overgang), edgeNoise
//               = zoveel cellen schuift de rand van de rijbaan heen en weer (rafelig)
//   waterPlants waterplanten langs de oever (public/view/plants-view.js): density = kans per
//               roosterpunt, width = tot zoveel cellen van de waterlijn een waterplant (lelie, ijsblad),
//               reach = tot zo ver zoekt een oeverplant de waterlijn, offset = [van, tot] cellen van de
//               lijn naar de kant (negatief = met de voet in het water), clump = maat van de groepjes
//               (cellen; daartussen open stukken)
//   grain       korrel over het beeld (0..1), in het nabewerkingsfilter samen met grade en vignette
//   objects     bomen en rotsen als sprites (public/view/objects-view.js): rocks = op zo'n deel van de
//               roosterpunten op rots staat een rotsblok (0 = alleen de rotstextuur); rockGround = de
//               blokken liggen op de gewone grond (gras, sneeuw, zand) in plaats van op een grijze
//               rotsplaat (dan rocks 1, zodat het hele rotsveld vol blokken ligt), rockShade = zoveel
//               donkerder is de grond midden in een rotsveld
//   bridge      bruggen (public/view/bridges-view.js): kind = soort sprite ('hout' of 'staal';
//               public/assets/<stijl>/bridges/<soort>-begin|midden|eind|wrak.png), land = zo'n deel
//               van het landhoofd ligt op de oever, height = hoe hoog boven het water (lengte van
//               de schaduw, in cellen per cel schaduwverschuiving)
export const LOOK = {
  ground: { cells: 16, tint: 0.8, contrast: 0.65 },
  water: {
    deep: 0.6, depthCells: 5, shore: 0.22, shine: 0.3, waveCells: 7, waveSpeed: 0.06, waves: 0.3,
    edgeNoise: 1, edgeScale: 6, edgeFine: 0.3,
  },
  ice: { depthCells: 8, deep: 0.55, frost: 0.4, sheen: 0.25, stress: 0.35, crackWidth: 1, crackGrow: 0.45, texScale: 1.5, texDeep: 0.2 },
  road: {
    verge: 2.2, vergeColor: null, vergeAmount: 0.3, ruts: 0.22, rutOffset: 1.8, rutWidth: 0.55,
    smooth: 2.5, junction: 3, curb: 0, curbColor: '#a3a199', line: 0, vergeInside: 0.6, edgeNoise: 0.3,
  },
  bridge: { kind: 'hout', land: 0.33, height: 1.6 },
  objects: { rocks: 1, rockGround: true, rockShade: 0.88 },
  waterPlants: { density: 0.55, width: 2, reach: 3, offset: [-0.3, 0.7], clump: 7 },
  grain: 0.035,
  light: { dx: 0.45, dy: 0.6, alpha: 0.36, blur: 2 },
  grade: { saturation: 0, brightness: 1, contrast: 1, tint: '#ffffff', tintStrength: 0 },
  noise: { scale: 9, strength: 0, octaves: 3 },
  blend: 2.2,
  weather: null, amount: 0, stormFactor: 4,
  vignette: 0.2, fogSoft: 0.15,
  iceShine: 0, shakeOnHit: 0.25,
  haze: 5, // hittewaas (als het weer heatHaze heeft): hoeveel pixels het beeld trilt
};

// Sneeuw in beeld (look.weather 'snow', alleen weergave, public/view/weather-view.js). De sterkte
// s (0..1) komt uit het weer (weerregel drift, in de storm 1) en loopt in rampSeconds naar een nieuwe waarde. Elke vlok
// heeft een diepte z (0 = ver, 1 = dichtbij); [a, b] = van ver naar dichtbij, of van licht naar zwaar.
//   amount   zoveel keer look.amount vlokken per 100x100 cellen bij s = 0 en s = 1 (onder s = 0,1
//            loopt het naar nul); max = plafond
//   stormAmount, stormMax   idem in de sneeuwstorm: zoveel dat je er nauwelijks doorheen kijkt
//   size     doorsnee in CSS-pixels (ver, dichtbij); heavier: zoveel groter bij s = 1
//   alpha    dekking (ver, dichtbij)
//   fall     valsnelheid in cellen/s (ver, dichtbij); heavier: zoveel sneller bij s = 1
//   wind     zijwind in cellen/s bij lichte en zware sneeuw; storm: zijwind in de storm
//   gust     windvlagen: zoveel van de wind erbij of eraf, periode in seconden
//   sway     dwarrelen: uitslag in cellen/s en frequentie in Hz (per vlok ertussen)
//   rampSeconds  zo lang duurt de overgang naar een nieuwe sterkte, en die van en naar de storm
export const SNOW_FX = {
  amount: [4, 28], max: 800,
  stormAmount: 110, stormMax: 3000,
  size: [3.5, 11], heavier: 0.4,
  alpha: [0.6, 0.95],
  fall: [3, 9], fallHeavier: 0.6,
  wind: [0.8, 4], storm: 26,
  gust: { amount: 0.5, seconds: 7 },
  sway: { amount: [0.5, 1.6], hz: [0.3, 1.1] },
  rampSeconds: 3,
};

// Stuifzand in beeld (look.weather 'sand', weather-view.js): korrels en zandwolken. De sterkte s
// komt uit het weer (weerregel drift, in de zandstorm 1). Velden zoals SNOW_FX, en verder:
//   grains   korrels: amount/stormAmount x look.amount per 100x100 cellen; size in CSS-pixels;
//            stretch: zo lang uitgerekt als ze het snelst gaan (bewegingsonscherpte); colors: zandtinten
//   clouds   zandwolken per beeld (calm bij s = 0 en 1, storm); size in cellen; alpha (calm, storm);
//            speed: deel van de wind; pulse: zoveel zwellen ze aan en slinken ze (periode in s)
export const SAND_FX = {
  grains: {
    amount: [14, 55], max: 900, stormAmount: 150, stormMax: 2500,
    size: [2, 4], stretch: 3, alpha: [0.65, 0.95], colors: ['#f6e6c0', '#e6c890', '#7d5732'],
  },
  clouds: { calm: [3, 10], storm: 44, size: [12, 40], alpha: [0.22, 0.62], speed: 0.6, pulse: { amount: 0.15, seconds: 6 }, color: '#b48850' },
  fall: [-0.6, 0.6], wind: [4, 14], storm: 45,
  gust: { amount: 0.4, seconds: 5 },
  sway: { amount: [0.3, 1.2], hz: [0.5, 1.5] },
  rampSeconds: 3,
};

// Regen in beeld (weerregel rain, weather-view.js; verandert niets aan sporen). r = de sterkte (0..1).
//   drops    druppels per 100x100 cellen bij r = 0 en 1, plafond; length/width in CSS-pixels (ver,
//            dichtbij); fall en wind in cellen/s; alpha (ver, dichtbij)
//   splash   spatten per seconde per beeld bij r = 0 en 1; size in cellen (grond, water), life in s
//   curtain  regengordijnen vanaf r = from: aantal bij r = 1, size in cellen (lang, breed), alpha
//   dim      zo donker wordt het bij r = 1 (kleur, dekking)
//   flash    bliksem: kleur en dekking van de flits, shake: zo hard schudt het beeld bij een inslag
export const RAIN_FX = {
  drops: { amount: [60, 900], max: 1400, length: [7, 20], width: [0.9, 1.5], fall: [40, 70], wind: [2, 14], alpha: [0.22, 0.5] },
  splash: { amount: [20, 240], size: [0.7, 1.4], life: [0.35, 0.8], alpha: 0.5 },
  curtain: { from: 0.55, count: 8, size: [70, 22], alpha: 0.12, color: '#9aa6b2', speed: 0.5 },
  dim: { color: '#18202c', alpha: 0.28 },
  flash: { color: '#eef3ff', alpha: 0.6, shake: 0.15 },
  gust: { amount: 0.35, seconds: 6 },
  rampSeconds: 3,
};

// Bomen, struiken, rotsen en kraters als sprites (public/view/objects-view.js), getekend op 32 px
// per cel. step: rooster in cellen (op elk punt hoogstens één object, met vast toeval verschoven;
// lowStep op een kaart met alleen lage begroeiing, zoals heggen; rockStep voor rotsblokken op de grond);
// turn: zoveel radialen draaien ze hoogstens (de tekening heeft licht van linksboven); scale: grootte
// per soort (x de getekende maat), van..tot; tall: soorten die boven de tanks uitsteken (kruinen);
// height: hoe hoog voor de schaduw (cellen verschuiving per cel van look.light); craterSize: krater-
// sprite x de straal van de krater (0,55: ongeveer zo groot als een tank, kleiner dan het gegraven gat). Een tank is ~6,6 cellen: een boomkruin 7–10, een rotsblok 4–6.
// overhang: zoveel cellen mag een kruin of rotsblok over de rand van zijn bos of rotsveld hangen (aan
// de rand worden ze kleiner, hoogstens tot minScale); crown: zo'n deel van de sprite is echt kruin. Welke soorten een kaart heeft: vegetation.sprites in het
// kaartbestand ({soort: aandeel}), anders de soort bij vegetation.type; vegetation.palmCoast: tot zo
// ver van het water wordt begroeiing een palm.
export const OBJECTS = {
  step: 3, lowStep: 2, rockStep: 2, turn: 0.3, craterSize: 0.55, overhang: 1, minScale: 0.45, crown: 0.85,
  scale: {
    den: [1.15, 1.6], berk: [1.05, 1.45], loof: [1.2, 1.65], palm: [1.1, 1.5],
    heg: [0.8, 1.15], struik: [0.8, 1.2], cactus: [0.75, 1.1], rots: [0.8, 1.2],
  },
  tall: ['den', 'berk', 'loof', 'palm'],
  height: { tall: 2.2, low: 0.6 },
};

// De vijf tanks (docs/SPEC-tanks.md). Een kaart kiest er per ploeg één: tanks: { A: 't34', B: 'panther' }.
// Alleen uiterlijk: name en nation op de tankkaart; mini de kleur op de minikaart; hull, mark en
// number alleen voor de getekende tank van de stijl (als de sprites ontbreken; op de sprite komt
// geen embleem of nummer, keuze van de eigenaar). De tekening staat in public/assets/tanks/<sleutel>/.
export const TANKS = {
  landsverk: { name: 'LANDSVERK L-60', nation: 'NEDERLAND', mini: '#f28c1c', hull: '#6a7158', mark: 'triangle' },
  t34: { name: 'T-34/76', nation: 'SOVJET-UNIE', mini: '#e8352b', hull: '#45573a', mark: 'redstar' },
  panther: { name: 'PANTHER', nation: 'DUITSLAND', mini: '#2f7fe8', hull: '#5a5e60', mark: 'number', number: '401' },
  sherman: { name: 'M4A1 SHERMAN', nation: 'VERENIGDE STATEN', mini: '#2fd04a', hull: '#55602f', mark: 'star' },
  comet: { name: 'A34 COMET', nation: 'VERENIGD KONINKRIJK', mini: '#f2b51c', hull: '#5b6040', mark: 'roundel' },
};

// Tanks als sprite (public/world-view.js): per tank in public/assets/tanks/<naam>/ tank.png (compleet)
// en romp.png (zonder rupsen), 448 x 448 px, px pixels per cel, neus naar rechts, draaipunt in het
// midden; rups.png en tank.json voor de twee rupsen die meeschuiven met het rijden. Ploeg C en D
// (variant van A en B) krijgen variantTint: iets donkerder. maxStep: verspringt een tank in één beeld
// verder dan zoveel cellen (opnieuw in de basis), dan schuiven de rupsen niet.
export const TANK_ART = { px: 32, variantTint: 0xb8b8b8, maxStep: 3 };

// De basis als bouwpakket (public/view/base-kit.js), in cellen: wall = dikte van de muur, corner,
// post en item = maat van hoekpaal, deurpost en spullen, items = zoveel spullen binnen langs de muren
export const BASE_KIT = { px: 32, wall: 2, corner: 3, post: 3, item: 3, items: 4 };

// Gebouwen in drie stadia (public/view/buildings-view.js): footprints = grondvlak (cellen) van elk
// getekend gebouw, stages = vanaf zoveel treffers-nog-over is het heel, half, puin (BUILDING.hp = 4),
// height = hoogte voor de schaduw, px = pixels per cel waarvoor de tekening gemaakt is (de sprite wordt
// op het grondvlak geschaald: ~1,7 x de tekening, zodat een huis groter is dan een tank). De kaartmaker gebruikt dezelfde
// grondvlakken voor kerken, boerderijen en dorpshuizen; houses = aandeel woonhuizen en rijhuizen
// (een rijhuis ligt de helft van de keren gedraaid)
export const BUILDINGS = {
  px: 32, height: 2.7, stages: [3, 1, 0], houses: { 'huis-woon': 0.6, 'huis-rij': 0.4 },
  footprints: { kerk: [14, 26], boerderij: [19, 17], 'huis-woon': [10, 10], 'huis-rij': [20, 8] },
  // dorpsgeneratie: gap = cellen tussenruimte, farmGap = tussenruimte boerderijen,
  // farmSpacing = extra cellen tussen boerderijen langs de weg
  gap: 1, farmGap: 3, farmSpacing: 6,
};

// Dingen van gevaren en schaarse middelen als sprite (public/view/hazards-view.js): px = pixels per
// cel; parachute = waar de parachute naast een volle krat ligt (cellen); dropMs = zo lang zakt hij
// neer bij een nieuwe dropping
export const PROPS = { px: 32, parachute: [2.4, -2.2], dropMs: 500 };

// Waterplanten (public/view/plants-view.js): rooster in cellen, grootte (x de getekende maat), px =
// pixels per cel in de tekening; kinds per stijl: soort op het water of ijs en soort op de oever
// (onWater: ook op open water, anders alleen op ijs). De woestijn heeft er geen.
export const WATER_PLANTS = {
  step: 1.5, scale: [0.6, 0.95], px: 32,
  kinds: {
    zomer: { water: 'waterlelie', bank: 'oeverplant', onWater: true },
    winter: { water: 'ijsblad', bank: 'oeverriet', onWater: false },
  },
};

// Rand van de kaart: band = zoveel cellen langs elke rand zijn onbegaanbaar (2 tankbreedtes).
// De rotsrand krijgt sprites; curve maakt de buitenkant donker. De retrokaart houdt zijn eigen rand.
export const EDGE = { band: 11, curve: 1.8, rockStep: 4, rockRows: 2, rockScale: 1.45 };

// Ingesneeuwde (of ondergestoven) eigen tank (public/world-view.js, drawBuried): een hoop over de
// tank. px = pixels per cel in de getekende hoop; length en width = maat in cellen (de tank is ~6,6 x
// 5,2); at = zoveel cellen ligt het midden achter het midden van de tank (de loop steekt eruit);
// turretAt = plek van de toren t.o.v. het midden van de hoop, turret = zoveel schemert hij erdoor
// (0..1); fade = zoveel verbleekt de tank naar de kleur van de hoop; growMs = zo lang groeit hij aan;
// puff = zoveel wolkjes als hij eraf valt
export const BURIAL = { px: 24, length: 7.2, width: 6.2, at: -0.4, turretAt: 0.2, turret: 0.45, fade: 0.55, growMs: 900, puff: 14 };

// Flipbook-effecten (public/view/effects-view.js): sheets = bladen in public/assets/effects/;
// grootte in cellen van een treffer op een tank, een ontploffende tank, de brug en een inslag;
// speed = beelden per tick van Pixi (60/s); impact = inslagblad per stijl; light* = lichtvlekje
// bij schoten en explosies (kleur, dekking, seconden)
export const FX = {
  sheets: ['explosie', 'rook', 'mondingsvuur', 'inslag-aarde', 'inslag-sneeuw', 'inslag-zand'],
  speed: 0.4, muzzle: 3, hit: 4, death: 14, bridge: 18, impactSize: 3.5,
  impact: { zomer: 'inslag-aarde', winter: 'inslag-sneeuw', woestijn: 'inslag-zand' },
  lightColor: 0xffc070, lightAlpha: 0.55, lightLife: 0.25,
};

// Touchbesturing (tablet/telefoon, public/touch.js). deadZone: zo ver (fractie van stickRadius)
// moet je duim schuiven voor de tank rijdt, zodat een rustende duim niet kruipt. stickRadius in
// CSS-pixels: verder slepen telt niet meer (de voet schuift mee). selfDestructMs: zo lang
// vasthouden voor zelfvernietiging, zodat je hem niet per ongeluk raakt.
export const TOUCH = { deadZone: 0.3, stickRadius: 60, selfDestructMs: 1000 };

// Tankkaart in het zijpaneel: een meter knippert onder dit deel van vol (brandstof, pantser, munitie)
export const HUD = { low: { fuel: 0.2, armour: 0.3, ammo: 0.2 } };

// Kogels (§5.8): dig = kogels graven een krater in de grond en stoppen daar (zoals het originele
// Tunneler). Standaard niet: ze vliegen over grond en water tot een tank, begroeiing, gebouw,
// rots of muur. Een kaart kan dit overschrijven met bulletsDig. De krater van een
// exploderende tank blijft altijd.
// speed in cellen per tick, damage in pantser, digR: krater bij inslag in de grond (alleen met dig),
// hitDigR: krater bij een treffer op een tank (alleen met dig).
export const BULLETS = { dig: false, speed: 3, damage: 10, digR: 4, hitDigR: 3 };

// Gebouwen (§5.4): zoveel treffers tot het puin is; daarna wordt de cel de klasse rubble met
// een puinpatroon dat nooit vervaagt.
export const BUILDING = { hp: 4, rubble: 'soft', color: '#8c8a86' };
// Rook die het zicht blokkeert (§9): straal in T, seconden; farm (Grebbeberg, links van de vallei-
// grens valleyX) en city (boven Arnhem, verspreid over spreadT) komen elke everySeconds,
// battle bij elke treffer als het weer battleSmoke heeft (Koersk)
export const SMOKE = {
  farm: { everySeconds: 5, rT: 2.5, seconds: 20, valleyX: 0.55 },
  city: { everySeconds: 4, rT: 2, seconds: 16, spreadT: [20, 12] },
  battle: { rT: 1.5, seconds: 20 },
};
// De brug die kan ontploffen (Market Garden): betongrijs, heel en als brokken in het water
export const BRIDGE = { color: '#8e8c88' };

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
  // IJs: rijdt als een weg, maar geen tunnel; kaarten kunnen rupsensporen aanzetten.
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

// Sporenwisser (storm, regenbui): zolang hij woedt vervagen sporen op klassen met erasable
// fadeFactor keer zo snel en geldt hun minimum niet. Verstuiving (weerregel drift: sneeuw,
// stuifzand) dekt sporen toe, bovenop de gewone fade en zonder minimum, naar de sterkte van nu:
// bij de min van de kaart is een vers spoor (1,0) in drift.lightSeconds dicht, bij de max in
// heavySeconds (daartussen lineair); een storm met onderduiken dekt er stormCover van toe (0,9 =
// na de storm voor 90% dicht). warnSeconds: zo lang van tevoren staat de waarschuwing in beeld.
// burialSeconds: zo lang stilstaan in een storm en je tank is bedekt (§5.7).
export const TRACK_ERASER = {
  fadeFactor: 10, warnSeconds: 5, burialSeconds: 2,
  drift: { lightSeconds: 120, heavySeconds: 45, stormCover: 0.9 },
  snow: { perSecond: 0.05 },
};

// Bliksem (weerregel lightning, alleen beeld), in seconden. Elk vak van `every` seconden heeft
// één inslag tussen firstAt en firstAt + spread (deel van het vak): een flits van `flash`, na
// `gap` een tweede van `second` lang (secondStrength), en tot afterglow een nagloed (glow).
export const LIGHTNING = { firstAt: 0.05, spread: 0.8, flash: 0.08, gap: 0.16, second: 0.06, secondStrength: 0.7, afterglow: 1, glow: 0.25 };

// De kaarten (veldslagen) staan elk in een eigen bestand: zie maps/index.js.
export { MAPS, MAP_MENU, DEFAULT_MAP } from './maps/index.js';
