// Weer in beeld (alleen weergave): sneeuw (ronde vlokken), stuifzand (korrels en zandwolken) en
// regen (druppels, spatten, regengordijnen, donkerder lucht en bliksem). De sterktes komen uit het
// weer (shared/weather.js: drift, rain, lightning) en lopen in beeld vloeiend naar een nieuwe
// waarde; de storm zwelt aan en neemt af (stormShown, ook voor de waas van world-view.js).
// Alles staat in cellen in één laag boven mist en schaduw (anders zie je het weer juist in de mist
// niet), met dezelfde camera als de wereld. Getallen in SNOW_FX, SAND_FX en RAIN_FX (config.js).
// Effecten verraden niets: plekken en momenten zijn willekeurig, of (bliksem) voor iedereen gelijk.
import * as G from '/shared/game.js';
import { SNOW_FX, SAND_FX, RAIN_FX } from '/shared/config.js';
import { Container, Sprite } from 'pixi.js';
import { TEX, tintOf, spritePool } from '/pixi-scene.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const wrap = (v, lo, len) => lo + ((((v - lo) % len) + len) % len);
const toward = (v, target, step) => v + Math.max(-step, Math.min(step, target - v));
const pick = (list) => list[(Math.random() * list.length) | 0];
// windvlagen: twee sinussen door elkaar, zodat alle deeltjes samen aanzwellen en afnemen
const gustAt = (cfg, t) => 1 + cfg.amount * (0.6 * Math.sin((t * 2 * Math.PI) / cfg.seconds) + 0.4 * Math.sin((t * 2 * Math.PI) / (cfg.seconds * 0.37)));
const hex = (c) => tintOf(c.startsWith('#') ? `${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}` : c);

// layer: container in L.ui; world: de wereldcontainer (voor de camera); lookOf(): uiterlijk van de
// kaart van nu (wisselt met de kaart);
// stormOf(): de storm van nu (eraserInfo); onThunder(shake): een inslag (het beeld schudt even)
export function createWeatherView({ layer, world, game, lookOf, stormOf, onThunder }) {
  const part = () => layer.addChild(new Container());
  const dimSprite = layer.addChild(new Sprite(TEX.white));
  const back = part(), front = part(), splashLayer = part();
  const flashSprite = layer.addChild(new Sprite(TEX.white));
  const clouds = spritePool(back, TEX.soft), flakes = spritePool(front, TEX.flake), drops = spritePool(front, TEX.drop);
  const rings = spritePool(splashLayer, TEX.ring);
  dimSprite.tint = hex(RAIN_FX.dim.color); flashSprite.tint = hex(RAIN_FX.flash.color);

  const motes = [], blobs = [], rainDrops = [], curtains = [], splashes = [];
  let driftShown = 0, stormShown = 0, rainShown = 0, flashShown = 0, lastBolt = 0, splashDebt = 0;

  // Deeltjes in het beeld houden: wat eruit waait, komt aan de andere kant terug
  function keep(list, n, cam, make) {
    while (list.length < n) list.push({ x: cam.x + Math.random() * cam.w, y: cam.y + Math.random() * cam.h, z: Math.random(), ph: Math.random() * 6.3, sw: Math.random(), ...make() });
  }
  const sway = (F, f, t) => lerp(F.sway.amount[0], F.sway.amount[1], f.sw) * Math.sin(t * 2 * Math.PI * lerp(F.sway.hz[0], F.sway.hz[1], f.sw) + f.ph);

  // Sneeuw: ronde vlokken op drie dieptes; hoe harder het sneeuwt, hoe meer, groter en sneller
  function snow(cam, t, dt, px) {
    const F = SNOW_FX, s = driftShown, area = (lookOf().amount * cam.w * cam.h) / 10000;
    const calm = Math.min(F.max, area * lerp(F.amount[0], F.amount[1], s) * Math.min(1, s / 0.1));
    const n = Math.round(lerp(calm, Math.min(F.stormMax, area * F.stormAmount), stormShown));
    keep(motes, n, cam, () => ({}));
    const wind = lerp(lerp(F.wind[0], F.wind[1], s), F.storm, stormShown) * gustAt(F.gust, t);
    for (let k = 0; k < n; k++) {
      const f = motes[k], depth = 0.5 + f.z; // dichtbij waait en valt sneller (parallax)
      f.x = wrap(f.x + (wind * depth + sway(F, f, t)) * dt, cam.x - 2, cam.w + 4);
      f.y = wrap(f.y + lerp(F.fall[0], F.fall[1], f.z) * (1 + F.fallHeavier * s) * dt, cam.y - 2, cam.h + 4);
      const p = flakes.next();
      p.tint = 0xffffff; p.rotation = 0; p.alpha = lerp(F.alpha[0], F.alpha[1], f.z);
      p.position.set(f.x, f.y);
      p.width = p.height = lerp(F.size[0], F.size[1], f.z) * (1 + F.heavier * s) * px;
    }
  }

  // Stuifzand: snelle korrels (iets uitgerekt naar hun snelheid) en grote zandwolken die meedrijven
  function sand(cam, t, dt, px) {
    const F = SAND_FX, R = F.grains, C = F.clouds, s = driftShown, area = (lookOf().amount * cam.w * cam.h) / 10000;
    const calm = Math.min(R.max, area * lerp(R.amount[0], R.amount[1], s) * Math.min(1, s / 0.1));
    const n = Math.round(lerp(calm, Math.min(R.stormMax, area * R.stormAmount), stormShown));
    keep(motes, n, cam, () => ({ col: hex(pick(R.colors)) }));
    const wind = lerp(lerp(F.wind[0], F.wind[1], s), F.storm, stormShown) * gustAt(F.gust, t);
    const stretch = 1 + (R.stretch - 1) * clamp01(wind / F.storm);
    for (let k = 0; k < n; k++) {
      const f = motes[k], depth = 0.5 + f.z;
      f.col ??= hex(pick(R.colors));
      const vx = wind * depth, vy = lerp(F.fall[0], F.fall[1], f.sw) + sway(F, f, t);
      f.x = wrap(f.x + vx * dt, cam.x - 2, cam.w + 4);
      f.y = wrap(f.y + vy * dt, cam.y - 2, cam.h + 4);
      const p = flakes.next(), size = lerp(R.size[0], R.size[1], f.z) * px;
      p.tint = f.col; p.alpha = lerp(R.alpha[0], R.alpha[1], f.z);
      p.position.set(f.x, f.y); p.rotation = Math.atan2(vy, vx);
      p.width = size * stretch; p.height = size;
    }
    // zandwolken: tussen de stormen een paar ijle slierten, in de storm tientallen
    const m = Math.round(lerp(lerp(C.calm[0], C.calm[1], s) * Math.min(1, s / 0.1), C.storm, stormShown));
    keep(blobs, m, cam, () => ({ size: lerp(C.size[0], C.size[1], Math.random()), a: 0.6 + 0.4 * Math.random() }));
    for (let k = 0; k < m; k++) {
      const b = blobs[k], margin = b.size;
      b.x = wrap(b.x + wind * C.speed * (0.7 + 0.6 * b.z) * dt, cam.x - margin, cam.w + 2 * margin);
      b.y = wrap(b.y + sway(F, b, t) * 0.3 * dt, cam.y - margin, cam.h + 2 * margin);
      const p = clouds.next(), grow = 1 + C.pulse.amount * Math.sin((t * 2 * Math.PI) / C.pulse.seconds + b.ph);
      p.tint = hex(C.color); p.rotation = 0;
      p.alpha = lerp(C.alpha[0], C.alpha[1], stormShown) * b.a;
      p.position.set(b.x, b.y); p.width = b.size * grow * 1.6; p.height = b.size * grow;
    }
  }

  // Regen: druppels (korte streepjes), spatten, gordijnen bij zware regen, en donkerder
  function rain(cam, t, dt, px) {
    const F = RAIN_FX, D = F.drops, r = rainShown, area = (cam.w * cam.h) / 10000;
    const n = Math.round(Math.min(D.max, area * lerp(D.amount[0], D.amount[1], r) * Math.min(1, r / 0.05)));
    keep(rainDrops, n, cam, () => ({}));
    const wind = lerp(D.wind[0], D.wind[1], r) * gustAt(F.gust, t);
    for (let k = 0; k < n; k++) {
      const f = rainDrops[k], vx = wind * (0.6 + 0.4 * f.z), vy = lerp(D.fall[0], D.fall[1], f.z);
      f.x = wrap(f.x + vx * dt, cam.x - 2, cam.w + 4);
      f.y = wrap(f.y + vy * dt, cam.y - 2, cam.h + 4);
      const p = drops.next();
      p.alpha = lerp(D.alpha[0], D.alpha[1], f.z) * Math.min(1, r * 3);
      p.position.set(f.x, f.y); p.rotation = Math.atan2(vy, vx) - Math.PI / 2;
      p.width = lerp(D.width[0], D.width[1], f.z) * px;
      p.height = lerp(D.length[0], D.length[1], f.z) * (0.7 + 0.6 * r) * px;
    }
    // spatten: kringetjes op willekeurige plekken, op water groter en langer
    const S = F.splash;
    splashDebt += lerp(S.amount[0], S.amount[1], r) * Math.min(1, r / 0.05) * dt;
    for (; splashDebt >= 1; splashDebt--) {
      const x = cam.x + Math.random() * cam.w, y = cam.y + Math.random() * cam.h;
      const water = G.inBounds(x | 0, y | 0) && game.map?.[(y | 0) * G.W + (x | 0)] === G.WATER;
      splashes.push({ x, y, age: 0, life: water ? S.life[1] : S.life[0], size: water ? S.size[1] : S.size[0] });
    }
    let w = 0;
    for (const sp of splashes) {
      sp.age += dt;
      if (sp.age >= sp.life) continue;
      splashes[w++] = sp;
      const k = sp.age / sp.life, p = rings.next();
      p.position.set(sp.x, sp.y); p.width = p.height = sp.size * (0.3 + 0.7 * k); p.alpha = S.alpha * (1 - k);
    }
    splashes.length = w;
    // regengordijnen: grote ijle grijze banen die met de wind over het beeld trekken
    const Cu = F.curtain, m = Math.round(Cu.count * clamp01((r - Cu.from) / (1 - Cu.from)));
    keep(curtains, m, cam, () => ({}));
    const ang = Math.atan2(D.fall[0], wind);
    for (let k = 0; k < m; k++) {
      const c = curtains[k], margin = Cu.size[0];
      c.x = wrap(c.x + wind * Cu.speed * dt, cam.x - margin, cam.w + 2 * margin);
      c.y = wrap(c.y + D.fall[0] * Cu.speed * 0.2 * dt, cam.y - margin, cam.h + 2 * margin);
      const p = clouds.next();
      p.tint = hex(Cu.color); p.alpha = Cu.alpha * (0.6 + 0.4 * c.z) * clamp01((r - Cu.from) * 4);
      p.position.set(c.x, c.y); p.rotation = ang + Math.PI / 2;
      p.width = Cu.size[1] * (0.7 + 0.6 * c.sw); p.height = Cu.size[0];
    }
  }

  // Een rechthoek over het hele beeld (donkerder lucht, bliksem)
  const cover = (sprite, cam, alpha) => {
    sprite.visible = alpha > 0.002;
    if (!sprite.visible) return;
    sprite.position.set(cam.x - 4, cam.y - 4); sprite.width = cam.w + 8; sprite.height = cam.h + 8; sprite.alpha = alpha;
  };

  return {
    get stormShown() { return stormShown; },
    update(cam, now, dt) {
      const wx = game.weather || {}, t = now / 1000;
      driftShown = toward(driftShown, wx.drift || 0, dt / SNOW_FX.rampSeconds);
      stormShown = toward(stormShown, stormOf()?.active ? 1 : 0, dt / SNOW_FX.rampSeconds);
      rainShown = toward(rainShown, wx.rain || 0, dt / RAIN_FX.rampSeconds);
      layer.scale.set(cam.Z); layer.position.copyFrom(world.position);
      const px = (devicePixelRatio || 1) / cam.Z; // CSS-pixels naar cellen
      clouds.begin(); flakes.begin(); drops.begin(); rings.begin();
      const kind = lookOf().weather;
      if (kind === 'snow') snow(cam, t, dt, px);
      else if (kind === 'sand') sand(cam, t, dt, px);
      if (rainShown > 0.001 || splashes.length) rain(cam, t, dt, px);
      clouds.end(); flakes.end(); drops.end(); rings.end();
      // bliksem: de flits komt uit het weer (voor iedereen gelijk), bij een nieuwe inslag schudt het even
      const bolt = wx.lightning || 0;
      if (bolt === 1 && lastBolt < 1) onThunder?.(RAIN_FX.flash.shake);
      lastBolt = bolt;
      flashShown = Math.max(bolt, flashShown - dt * 8);
      cover(dimSprite, cam, RAIN_FX.dim.alpha * rainShown * (1 - flashShown));
      cover(flashSprite, cam, RAIN_FX.flash.alpha * flashShown);
    },
  };
}
