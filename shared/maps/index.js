// Alle kaarten (veldslagen). Elke kaart staat in een eigen bestand in deze map en is alleen
// gegevens; de regels die erbij horen staan in mapgen.js (kaart maken), weather.js (weer) en
// hazards.js (gevaren, schaarse middelen, meters). Een nieuwe kaart: een bestand erbij, hier
// importeren en in MAPS en MAP_MENU zetten.
//
// Kaarten (SPEC-terrein §6). Elke kaart is een eigen potje. Per kaart:
//   name        naam in beeld; header: titelregel (na 'BLITZKRIEG — '); style: welke weergave
//               (zomer, winter, woestijn); tanks: {A, B} uiterlijk van de ploegen (zie common.js)
//   terrainPercent  {klasse | rock | water | vegetation | building: procent van het speelbare deel}
//   features    vaste kenmerken voor de kaartmaker (mapgen.js): village, road, river, area, ...
//   classes     per terreinklasse {label, color}: naam en kleur in de legenda
//   rocks, water, vegetation, buildings   {label, color, ...}: naam en kleur; vegetation.type (uit VEGETATION),
//               groundAfter: de grond die overblijft als een plant weggeschoten is
//   tunnelColor kleur van een vers spoor
//   hazard, scarce, meter  gevaar, schaars middel en meter (§10, zie hazards.js);
//               refill: {fuel, armor, ammo} false = in de basis niet aangevuld
//   weather     weerregels (§7, zie shared/weather.js): zicht, sporenwisser, onderduiken,
//               terreinveranderingen per ronde (dooi, modder) en vlaggen zoals fog (witte mist)
//   bulletsDig, minimap   overschrijven BULLETS.dig en DISPLAY.minimap voor deze kaart
//   look        uiterlijk in de weergave (kleurfilter, grondtextuur, weer, licht): zie LOOK
//   mines       mijnenvelden (El Alamein)
// Zonder features (alleen retro): classes met één klasse en rocks {count, min, max}.
// De kleuren (SPEC-blitzkrieg §10) zijn voor de weergave; de spelregels gebruiken alleen de klassen.

import retro from './retro.js';
import fallGelb from './fall-gelb.js';
import barbarossa from './barbarossa.js';
import elAlamein from './el-alamein.js';
import leningrad from './leningrad.js';
import koersk from './koersk.js';
import carentan from './carentan.js';
import marketGarden from './market-garden.js';
import ardennen from './ardennen.js';
import seelow from './seelow.js';
import berlijn from './berlijn.js';

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

export const MAPS = {
  retro,
  'fall-gelb': fallGelb,
  barbarossa,
  'el-alamein': elAlamein,
  leningrad,
  koersk,
  carentan,
  'market-garden': marketGarden,
  ardennen,
  seelow,
  berlijn,
};
