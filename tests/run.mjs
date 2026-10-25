// npm test: start een testserver (vaste kaart) en draait alle tests.
// Eén test draaien: npm test -- mijnen   (filter op een woord uit de naam)
// Tests zonder server (run() zonder poort: kaartmaker, regels, zicht, ...) rekenen alleen; die
// lopen tegelijk in een paar worker-threads, terwijl de servertests (die vooral wachten) één
// voor één in deze draad lopen.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { startServer, sleep, closeAllBots, TestFailure } from './helpers.mjs';
import { tests } from './tests.mjs';

const usesServer = (t) => t.run.length > 0; // async run(port)
const WORKERS = 2;

async function runOne(t, port) {
  const t0 = Date.now();
  try {
    const info = await t.run(port);
    return { name: t.name, ok: true, text: `  ✓ ${info ?? 'ok'} (${((Date.now() - t0) / 1000).toFixed(1)} s)` };
  } catch (err) {
    return { name: t.name, ok: false, text: `  ✗ ${err instanceof TestFailure ? err.message : err.stack}` };
  }
}
const report = (r) => process.stdout.write(`… ${r.name}\n${r.text}\n`);

if (!isMainThread) {
  // worker: de tests zonder server uit workerData (namen), uitslag per test terug
  for (const name of workerData) parentPort.postMessage(await runOne(tests.find((t) => t.name === name)));
} else {
  const PORT = Number(process.env.TEST_PORT) || 3999; // TEST_PORT: om twee runs naast elkaar te draaien
  const filter = process.argv[2]?.toLowerCase();
  const selected = tests.filter((t) => !filter || t.name.toLowerCase().includes(filter));
  const pure = selected.filter((t) => !usesServer(t)), withServer = selected.filter(usesServer);
  let failed = 0;
  const count = (r) => { report(r); if (!r.ok) failed++; };

  // tests zonder server, verdeeld over de workers
  const workers = [];
  for (let k = 0; k < Math.min(WORKERS, pure.length); k++) {
    const names = pure.filter((_, i) => i % WORKERS === k).map((t) => t.name);
    workers.push(new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: names });
      w.on('message', count);
      w.on('error', reject);
      w.on('exit', resolve);
    }));
  }

  if (withServer.length) {
    // roundsToWin 2: een heel spel is in twee kills uit te spelen
    // weer 20x zo snel (storm elke 4,5 s): de weertests hoeven niet minuten te wachten
    const server = await startServer(PORT, { TUNNELER_SEED: '12345', TUNNELER_ROUNDS_TO_WIN: '2', TUNNELER_WEATHER_SCALE: '0.05' });
    for (const t of withServer) {
      count(await runOne(t, PORT));
      await closeAllBots(); // ook na een mislukte test: geen achterblijvers in het potje
      await sleep(300); // potje laten leeglopen: volgende test begint met een verse kaart
    }
    server.kill();
  }
  await Promise.all(workers);
  console.log(failed ? `\n${failed} van ${selected.length} tests mislukt` : `\nalle ${selected.length} tests geslaagd`);
  process.exit(failed ? 1 : 0);
}
