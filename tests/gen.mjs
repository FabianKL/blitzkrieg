// npm run test:gen — de grote generatietest (§13): elke map met features 100 keer, op alle vier
// de kaartgroottes en met 2, 3 en 4 spelers (voor zover de grootte dat toelaat).
// Eén map: npm run test:gen -- ardennen ; minder seeds: npm run test:gen -- ardennen 10
import * as G from '../shared/game.js';
import { checkGeneratedMap } from './gen-checks.mjs';
import { TestFailure } from './helpers.mjs';

const [only, n = '100'] = process.argv.slice(2);
const ids = Object.keys(G.MAPS).filter((id) => G.MAPS[id].features && (!only || id === only));
let failed = 0, runs = 0;
const perMap = {};
const t0 = Date.now();
for (const id of ids) {
  for (const [size, s] of Object.entries(G.MAP_SIZES)) {
    const { w, h } = G.sizeDims(size);
    G.setMapSize(w, h);
    for (const players of [2, 3, 4].filter((p) => p <= s.maxPlayers)) {
      for (let seed = 1; seed <= Number(n); seed++) {
        runs++;
        try {
          checkGeneratedMap(id, G.generateMap(seed * 104729 + players, G.MAPS[id], players), players, size);
        } catch (err) {
          failed++;
          perMap[id] = (perMap[id] || 0) + 1;
          if (failed <= 40) console.log(`  ✗ seed ${seed}: ${err instanceof TestFailure ? err.message : err.stack}`);
        }
      }
      console.log(`${id} ${size} ${players} spelers: klaar (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
}
for (const [id, k] of Object.entries(perMap)) console.log(`  ${id}: ${k} afgekeurd`);
console.log(failed ? `\n${failed} van ${runs} kaarten afgekeurd` : `\nalle ${runs} kaarten goed`);
process.exit(failed ? 1 : 0);
