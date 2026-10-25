// Alle instelbare getallen van het terreinsysteem op één plek (server én browser).
// Pas hier aan tijdens het testen; de rest van de code leest alleen deze tabellen.

// Spel en rondes (§2). Een ronde eindigt zodra er een tank dood is; daarna begint iedereen
// weer in zijn basis met alles vol. Bij 2 spelers wint wie eerst roundsToWin rondes wint,
// bij meer spelers wie eerst killsToWin kills heeft. roundPauseSeconds: even stil tussen
// rondes; gameOverSeconds: zo lang staat de winnaar in beeld, daarna een nieuw spel met
// een nieuwe kaart. Tunnels en andere veranderingen aan de kaart blijven tussen rondes liggen.
export const GAME = { roundsToWin: 3, killsToWin: 5, roundPauseSeconds: 3, gameOverSeconds: 8, maxPlayers: 4 };

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
// donkerder (shadow). contourAlpha: dekking van een contour net buiten de cirkel; naar de
// rand van het venster loopt hij af tot 0. debug: ?debug=alles toont alles, alleen op localhost.
export const FOG = { fade: 0.62, shadow: 0.35, blur: 3, contourAlpha: 0.5 };

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

// De kaarten (veldslagen) staan elk in een eigen bestand: zie maps/index.js.
export { MAPS, MAP_MENU, DEFAULT_MAP } from './maps/index.js';

