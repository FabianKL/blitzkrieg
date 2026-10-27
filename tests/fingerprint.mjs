// Kaart-vingerafdruk: zelfde seed = zelfde kaart. Per map en kaartgrootte een hash van alles wat
// de kaartmaker oplevert. De test vergelijkt met tests/fingerprint.json, zodat een verbouwing
// van de kaartmaker niet ongemerkt andere kaarten maakt.
// Bewust een andere kaart? Dan de verwachting bijwerken:  node tests/fingerprint.mjs --write
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../shared/game.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fingerprint.json');
const SEEDS = [1, 77];

function hashWorld(w) {
  const h = createHash('sha1');
  for (const arr of [w.map, w.terrain, w.veg, w.vegHp, w.scar]) h.update(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  h.update(JSON.stringify({ bases: w.bases, mines: w.mines, landmarks: w.landmarks || [] }));
  return h.digest('hex').slice(0, 16);
}

// { 'carentan/middel/1': hash, ... } voor alle maps, groottes en SEEDS
export function fingerprints() {
  const out = {};
  for (const id of Object.keys(G.MAPS)) {
    for (const [size, s] of Object.entries(G.MAP_SIZES)) {
      const { w, h } = G.sizeDims(size);
      G.setMapSize(w, h);
      for (const seed of SEEDS) {
        let v;
        try { v = hashWorld(G.generateMap(seed, G.MAPS[id], s.maxPlayers)); } catch (err) { v = `fout: ${err.message}`; }
        out[`${id}/${size}/${seed}`] = v;
      }
    }
  }
  G.setMapSize(G.BASE_W_CELLS, G.BASE_H_CELLS);
  return out;
}

export const expectedFingerprints = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const fp = fingerprints();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(FILE, JSON.stringify(fp, null, 1) + '\n');
    console.log(`${Object.keys(fp).length} vingerafdrukken geschreven naar tests/fingerprint.json (${Date.now() - t0} ms)`);
  } else {
    const want = expectedFingerprints();
    const diff = Object.keys(fp).filter((k) => fp[k] !== want[k]);
    console.log(diff.length ? `anders: ${diff.join(', ')}` : `alle ${Object.keys(fp).length} kaarten gelijk (${Date.now() - t0} ms)`);
    process.exit(diff.length ? 1 : 0);
  }
}
