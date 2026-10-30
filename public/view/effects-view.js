// Flipbook-effecten (alleen weergave): explosie, rook, mondingsvuur en inslagen uit
// public/assets/effects/<naam>.json + .png (PixiJS-spritesheet met animations), naast de bestaande
// deeltjes. Plus een klein lichtvlekje op de grond bij schoten en explosies. De weergave roept ze
// alleen aan als het effect te zien mag zijn ("effecten verraden niets"). Ontbreekt een blad, dan
// doet play() niets en blijven alleen de deeltjes. Maten en snelheden in FX (config.js).
import { FX } from '/shared/config.js';
import { AnimatedSprite, Sprite, Texture, ImageSource, Spritesheet } from 'pixi.js';
import { loadManifest, loadImage, has, report } from '/assets.js';

// layer: effectlaag (boven de tanks); lights: laag voor de lichtvlekjes (additief); soft: zachte vlek
export function createEffectView({ layer, lights, soft }) {
  const sheets = {}; // naam -> {frames: [Texture], anchor}
  const live = []; // lopende lichtvlekjes {s, t0, life, a}
  const pool = []; // vrije AnimatedSprites per blad: naam -> []
  let loading = null;

  function load() {
    loading ||= (async () => {
      const m = await loadManifest();
      report.effects = {};
      for (const name of FX.sheets) {
        const png = `effects/${name}.png`;
        if (!has(m, png)) { report.effects[name] = 'deeltjes'; continue; }
        const [data, img] = await Promise.all([fetch(`/assets/effects/${name}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null), loadImage(m, png)]);
        if (!data || !img) { report.effects[name] = 'deeltjes'; continue; }
        const sheet = new Spritesheet(new Texture({ source: new ImageSource({ resource: img, scaleMode: 'linear' }) }), data);
        await sheet.parse();
        const frames = sheet.animations[name] || Object.values(sheet.textures);
        const first = Object.values(data.frames)[0];
        sheets[name] = { frames, anchor: first?.anchor || { x: 0.5, y: 0.5 }, size: first.frame.w };
        report.effects[name] = png;
      }
    })();
    return loading;
  }

  // Effect `name` op (x, y), size = breedte in cellen, rot = draaiing, add = additief (vuur)
  function play(name, x, y, { size = 3, rot = 0, add = false, speed = FX.speed, delay = 0 } = {}) {
    const sh = sheets[name];
    if (!sh) return false;
    const start = () => {
      const free = (pool[name] ||= []);
      const s = free.pop() || layer.addChild(new AnimatedSprite(sh.frames));
      s.anchor.set(sh.anchor.x, sh.anchor.y);
      s.loop = false; s.animationSpeed = speed; s.visible = true;
      s.blendMode = add ? 'add' : 'normal';
      s.position.set(x, y); s.rotation = rot; s.scale.set(size / sh.size);
      s.onComplete = () => { s.visible = false; s.stop(); free.push(s); };
      s.gotoAndPlay(0);
    };
    if (delay) setTimeout(start, delay); else start();
    return true;
  }
  // Lichtvlekje: kleur, straal in cellen, levensduur in seconden
  function light(x, y, r, color = FX.lightColor, life = FX.lightLife) {
    const s = lights.addChild(new Sprite(soft));
    s.anchor.set(0.5); s.blendMode = 'add'; s.tint = color;
    s.position.set(x, y); s.width = s.height = 2 * r;
    live.push({ s, t0: performance.now(), life: life * 1000, a: FX.lightAlpha });
  }
  // Per beeld: lichtvlekjes laten uitdoven
  function update(now) {
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k], p = (now - l.t0) / l.life;
      if (p >= 1) { l.s.destroy(); live.splice(k, 1); continue; }
      l.s.alpha = l.a * (1 - p) * (1 - p);
    }
  }
  function destroy() {
    for (const l of live) l.s.destroy();
    live.length = 0;
  }

  return { load, play, light, update, destroy, has: (name) => !!sheets[name] };
}
