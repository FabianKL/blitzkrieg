// npm test: start een testserver (vaste kaart) en draait alle tests.
// Eén test draaien: npm test -- mijnen   (filter op een woord uit de naam)
import { startServer, sleep, closeAllBots, TestFailure } from './helpers.mjs';
import { tests } from './tests.mjs';

const PORT = Number(process.env.TEST_PORT) || 3999; // TEST_PORT: om twee runs naast elkaar te draaien
const filter = process.argv[2]?.toLowerCase();
const selected = tests.filter((t) => !filter || t.name.toLowerCase().includes(filter));

// roundsToWin 2: een heel spel is in twee kills uit te spelen
// weer 20x zo snel (storm elke 4,5 s): de weertests hoeven niet minuten te wachten
const server = await startServer(PORT, { TUNNELER_SEED: '12345', TUNNELER_ROUNDS_TO_WIN: '2', TUNNELER_WEATHER_SCALE: '0.05' });
let failed = 0;
for (const t of selected) {
  const t0 = Date.now();
  process.stdout.write(`… ${t.name}\n`);
  try {
    const info = await t.run(PORT);
    console.log(`  ✓ ${info ?? 'ok'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${err instanceof TestFailure ? err.message : err.stack}`);
  }
  await closeAllBots(); // ook na een mislukte test: geen achterblijvers in het potje
  await sleep(300); // potje laten leeglopen: volgende test begint met een verse kaart
}
server.kill();
console.log(failed ? `\n${failed} van ${selected.length} tests mislukt` : `\nalle ${selected.length} tests geslaagd`);
process.exit(failed ? 1 : 0);
