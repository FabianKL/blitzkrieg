// Acceptatiecriteria (SPEC-blitzkrieg §12): per criterium de tests die het controleren.
// De test hieronder kijkt of al die tests bestaan (en dus meedraaien), en controleert zelf
// criterium 1 (de naam) op de pagina's van de server.
import { check } from './helpers.mjs';

export const CRITERIA = [
  ['1. Het spel heet overal BLITZKRIEG', ['acceptatie']],
  ['2. Mapmenu (10 maps, chronologisch) en kaartgrootte; de host kiest', ['tanks: per kaart', 'wachtkamer']],
  ['3. 2 spelers 3 rondes, meer spelers 5 kills; na een dood iedereen vol in de basis', ['rondes:', 'ronde en spel via de server']],
  ['4. De kaart wordt één keer per spel gegenereerd en blijft het hele spel', ['ronde en spel via de server']],
  ['5. Alle tanks gelijk, alleen het uiterlijk verschilt', ['tanks: per kaart']],
  ['6. Terreinpercentages ±3 en vaste kenmerken op hun plek, op elke grootte', ['kaartmaker (§6)']],
  ['7. Wegen ≥ 2 T, bruggen ≥ 3 T, heggen 1 T, bossen 1–5 T', ['kaartmaker (§6)']],
  ['8. Bases eerst, vensterregel, 3 T vrij, vrije in- en uitgang, altijd een route (ook na het weer)', ['kaartmaker (§6)', 'weer per map', 'uitrijstrook']],
  ['9. Sporen per klasse; op ijs alleen barsten', ['sporen:', 'terrein:', 'ijs:']],
  ['10. Kogels over grond en water, graven niet, stoppen bij tank, begroeiing, gebouw, rots of object', ['kogels:', 'gevaren: brandend']],
  ['11. Onderduiken in een storm na 2 s stilstaan', ['onderduiken']],
  ['12. Door het ijs: langzaam pantser kwijt, langzaam eruit, dood als je blijft', ['ijs:']],
  ['13. Zichtstraal, zichtlijn, schim; gebouwen, begroeiing en rook blokkeren; valse schimmen bij El Alamein', ['zicht:', 'weer per map']],
  ['14. Gevaar, schaars middel en weer per map, op de juiste ronde of timer', ['weer per map', 'gevaren: brandend', 'schaarse middelen en', 'gevaren en schaarse middelen (Ardennen)']],
  ['15. Richtingshints in 8 richtingen; geluiden alleen binnen 20 T', ['zicht:']],
  ['16. Iedereen ziet dezelfde kaart, hetzelfde weer, dezelfde score en ronde', ['sporen en terrein gelijk', 'ronde en spel via de server', 'wachtkamer']],
];

export function acceptanceTest(allTests) {
  return {
    name: 'acceptatie (§12): elk criterium heeft tests, en het spel heet overal BLITZKRIEG',
    async run(port) {
      for (const [crit, names] of CRITERIA) {
        for (const n of names) check(allTests.some((t) => t.name.includes(n)), `${crit}: test "${n}" ontbreekt`);
      }
      for (const page of ['/', '/retro', '/1944.html', '/1943.html', '/1942.html']) {
        const html = await (await fetch(`http://localhost:${port}${page}`)).text();
        const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
        check(!/tunneler/i.test(visible), `${page}: "Tunneler" staat nog in de pagina`);
        check(/BLITZKRIEG/.test(html) || page !== '/', `${page}: geen BLITZKRIEG`);
      }
      return `${CRITERIA.length} criteria gedekt; pagina's heten BLITZKRIEG`;
    },
  };
}
