// Gebouwen in drie stadia (alleen weergave): heel, half en puin uit
// public/assets/<stijl>/buildings/<naam>-heel|half|puin.png, op 32 px per cel, precies het grondvlak.
// Een gebouw krijgt een sprite als zijn grondvlak past bij een van de getekende gebouwen
// (BUILDINGS.footprints in config.js, ook 90 graden gedraaid); anders blijft het dak uit de
// grondshader. Het stadium volgt uit world.vegHp van dat gebouw (BUILDINGS.stages). Bij een nieuw
// stadium: stof, stenen en splinters, alleen als je het ziet. Het puin vervangt het puinpatroon van
// de grondshader op die cellen (ground.setRubbleCover).
import * as G from '/shared/game.js';
import { BUILDINGS } from '/shared/config.js';
import { Sprite, Texture, ImageSource } from 'pixi.js';
import { loadManifest, loadImage, has, report } from '/assets.js';

const STAGES = ['heel', 'half', 'puin'];

// layer: onder de tanks; shadows: schaduwlaag; shadowColor; particles: voor stof en stenen
export function createBuildingView({ layer, shadows, game, particles, shadowColor }) {
  let list = [], look = null, gen = 0;
  const textures = new Map(); // pad -> Promise<Texture of null>
  const texture = (m, path) => {
    if (!textures.has(path)) {
      textures.set(path, has(m, path) ? loadImage(m, path).then((img) => img && new Texture({ source: new ImageSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear' }) })) : Promise.resolve(null));
    }
    return textures.get(path);
  };
  const stageOf = (hp) => STAGES.findIndex((_, k) => hp >= BUILDINGS.stages[k]);

  // Alle gebouwen van de kaart: per id de cellen (ook als het al puin is, zolang de cel het id nog weet)
  function findBuildings() {
    const box = new Map();
    for (let i = 0; i < game.map.length; i++) {
      if (game.map[i] !== G.BUILDING) continue;
      const id = game.world.veg[i] - 1, x = i % G.W, y = (i / G.W) | 0;
      const b = box.get(id) || { id, x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0, cells: 0 };
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
      b.sx += x + 0.5; b.sy += y + 0.5; b.cells++;
      box.set(id, b);
    }
    return [...box.values()].map((b) => ({ ...b, cx: b.sx / b.cells, cy: b.sy / b.cells }));
  }
  // Welk getekend gebouw past op dit grondvlak (en gedraaid of niet)
  function match(w, h, cells, roadside) {
    for (const [name, [fw, fh]] of Object.entries(BUILDINGS.footprints)) {
      if (w === fw && h === fh) return { name, turned: false };
      if (w === fh && h === fw) return { name, turned: true };
    }
    const rowArea = BUILDINGS.footprints['huis-rij'].reduce((a, b) => a * b, 1);
    if (roadside && Math.abs(cells - rowArea) <= 24) return { name: 'huis-rij', turned: false };
    return null;
  }
  function streetRotation(b) {
    let best = null;
    for (const road of game.roads || []) {
      for (let i = 0; i < road.p.length - 1; i++) {
        const [ax, ay] = road.p[i], [bx, by] = road.p[i + 1], dx = bx - ax, dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        if (!lengthSq) continue;
        const t = Math.max(0, Math.min(1, ((b.cx - ax) * dx + (b.cy - ay) * dy) / lengthSq));
        const x = ax + t * dx, y = ay + t * dy, distance = Math.hypot(b.cx - x, b.cy - y);
        if (!best || distance < best.distance) best = { x, y, dx, dy, distance };
      }
    }
    if (!best) return null;
    let angle = Math.atan2(best.dy, best.dx);
    const towardRoadX = best.x - b.cx, towardRoadY = best.y - b.cy;
    if (-Math.sin(angle) * towardRoadX + Math.cos(angle) * towardRoadY < 0) angle += Math.PI;
    return angle;
  }

  async function load(lookNow, ground) {
    look = lookNow;
    clear();
    const run = ++gen, style = game.rules?.style || 'zomer', m = await loadManifest();
    const roadside = game.rules?.features?.some((f) => f.type === 'village' && f.layout === 'roadside');
    const found = findBuildings(), used = {}, cover = new Uint8Array(G.W * G.H);
    for (const b of found) {
      const fit = match(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.cells, roadside);
      if (!fit) continue;
      const tex = await Promise.all(STAGES.map((s) => texture(m, `${style}/buildings/${fit.name}-${s}.png`)));
      if (run !== gen) return;
      if (tex.some((t) => !t)) continue;
      const make = (container) => {
        const s = container.addChild(new Sprite(tex[0]));
        s.anchor.set(0.5);
        s.position.set(b.cx, b.cy);
        const angle = roadside && fit.name === 'huis-rij' ? streetRotation(b) : null;
        s.rotation = angle ?? (fit.turned ? Math.PI / 2 : 0);
        [s.width, s.height] = BUILDINGS.footprints[fit.name]; // op het grondvlak geschaald (de tekening kan kleiner zijn)
        return s;
      };
      const body = make(layer), shadow = make(shadows);
      shadow.tint = shadowColor; shadow.alpha = look.light.alpha;
      shadow.position.x += look.light.dx * BUILDINGS.height; shadow.position.y += look.light.dy * BUILDINGS.height;
      list.push({ ...b, tex, body, shadow, stage: -1 });
      used[fit.name] = (used[fit.name] || 0) + 1;
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) cover[y * G.W + x] = 1;
    }
    report.buildings = Object.keys(used).length ? used : 'dak uit de grondshader (geen grondvlak past of geen sprites)';
    ground.setRubbleCover(cover);
    update(() => false);
  }
  function clear() {
    for (const b of list) { b.body.destroy(); b.shadow.destroy(); }
    list = [];
  }

  // Per beeld: stadium uit de treffers die het gebouw nog kan hebben; seen(x, y) voor de effecten
  function update(seen) {
    for (const b of list) {
      const st = stageOf(game.world.vegHp[b.id] ?? 0);
      if (st === b.stage) continue;
      const first = b.stage < 0;
      b.stage = st;
      b.body.texture = b.shadow.texture = b.tex[st];
      b.shadow.visible = st < 2; // puin werpt geen schaduw
      const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2;
      if (!first && seen(cx, cy)) {
        particles.spawn('smoke', cx, cy, 10, { speed: 4, life: 2, r0: 1.5, r1: 6 });
        particles.spawn('chunk', cx, cy, 24, { speed: 12, life: 0.8, cols: ['#8c8a86', '#6e6a62', '#a8a49a', '#6a4a2c'] });
      }
    }
  }

  return { load, update, destroy: clear };
}
