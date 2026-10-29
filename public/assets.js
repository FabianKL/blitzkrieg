// Sprites en texturen uit public/assets/ (zie assets/LEESMIJ.md). Eén plek die laadt wat er is
// en zegt wat er ontbreekt; wat ontbreekt, tekent de weergave zoals vroeger.
// manifest.json is de bron: een bestand dat er niet in staat, wordt niet opgevraagd (dus geen
// 404's in de console). Per ontbrekende map komt er één regel in de console.
const ROOT = '/assets/';

let manifest = null; // Promise met het manifest (of null)
export function loadManifest() {
  manifest ||= fetch(ROOT + 'manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((m) => {
      if (!m) console.info('assets: geen manifest.json, alles wordt getekend zoals vroeger');
      return m;
    });
  return manifest;
}

export const has = (m, path) => !!m?.files?.[path];

const missingDirs = new Set();
function noteMissing(path) {
  const dir = path.slice(0, path.lastIndexOf('/'));
  if (missingDirs.has(dir)) return;
  missingDirs.add(dir);
  console.info(`assets: (deels) niets in ${dir}/, daar wordt de oude tekening gebruikt`);
}

// Afbeelding uit het manifest, of null als hij er niet is (één keer geladen, daarna onthouden)
const images = new Map();
export function loadImage(m, path) {
  if (!has(m, path)) { noteMissing(path); return Promise.resolve(null); }
  if (!images.has(path)) {
    images.set(path, new Promise((done) => {
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = () => { noteMissing(path); done(null); };
      img.src = ROOT + path;
    }));
  }
  return images.get(path);
}

// Welke grondtextuur bij welke klasse hoort (en rock, tunnel, rubble): per stijl, met
// uitzonderingen per kaart. Geeft { klasse: naam }.
export function terrainNames(m, style, mapId) {
  const t = m?.terrain || {};
  return { ...(t.perStyle?.[style] || {}), ...(t.perMap?.[mapId] || {}) };
}
// Pad van grondtextuur `name`: eerst in de eigen stijl, anders uit een andere stijl die hem wel
// heeft (de winter heeft geen eigen puin), anders null
export function terrainPath(m, style, name) {
  const ext = m?.terrain?.format || 'jpg';
  for (const st of [style, 'zomer', 'winter', 'woestijn']) {
    const p = `${st}/terrain/${name}.${ext}`;
    if (has(m, p)) return p;
  }
  return null;
}

// Wat er per onderdeel gebruikt wordt: { onderdeel: { naam: pad of 'procedureel' } }. In de
// console: blitzView.assets()
export const report = {};
