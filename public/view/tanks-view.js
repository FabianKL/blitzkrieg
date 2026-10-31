// Tanks in beeld (docs/SPEC-tanks.md): per tank één container die meedraait, met twee rupsen
// (TilingSprite, rups.png) en daarboven de romp (romp.png); de spatborden van de romp vallen zo over
// de rupsen. De rupsen schuiven mee met het rijden en draaien. De schaduw is tank.png.
// Ontbreken romp, rups of tank.json, dan tank.png als één plaatje; ontbreekt die ook, dan de
// getekende tank van de stijl (texture van world-view.js). Alleen weergave: niets uit shared/ verandert.
import { Container, Sprite, TilingSprite, Texture, ImageSource } from 'pixi.js';
import { TANK_ART } from '/shared/config.js';
import { loadManifest, loadImage, has } from '/assets.js';

const PX = TANK_ART.px;

// Texture met mipmaps, zodat een draaiende of verkleinde tank niet flikkert; de rupsstrook herhaalt
const mipmapped = (img, repeat) => new Texture({ source: new ImageSource({
  resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', addressMode: repeat ? 'repeat' : 'clamp-to-edge',
}) });

export function createTankView({ layer, shadows, shadow, report }) {
  let art = []; // per ploeg { tank, romp, rups, json, tint } of undefined
  let artKey = '';
  const sprites = new Map(); // id -> { body, shadow, parts, single, tracks, last }

  // Plaatjes van de tanks op deze kaart (specs uit G.teamsFor): per tank één keer geladen
  async function load(specs, key) {
    if (key === artKey) return;
    artKey = key;
    const m = await loadManifest(), out = [], cache = new Map();
    report.tanks = {};
    for (let id = 0; id < specs.length; id++) {
      const name = specs[id]?.sprite, dir = `tanks/${name}/`;
      if (!name || !has(m, dir + 'tank.png')) continue;
      if (!cache.has(name)) cache.set(name, (async () => {
        const [tank, romp, rups] = await Promise.all(['tank.png', 'romp.png', 'rups.png'].map((f) => loadImage(m, dir + f)));
        const json = has(m, dir + 'tank.json') ? await fetch(`/assets/${dir}tank.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
        const full = romp && rups && json?.tracks?.length;
        return tank && { tank: mipmapped(tank), romp: full && mipmapped(romp), rups: full && mipmapped(rups, true), json: full && json };
      })());
      const a = await cache.get(name);
      if (!a) continue;
      out[id] = { ...a, tint: specs[id].variant ? TANK_ART.variantTint : 0xffffff };
      report.tanks['ABCD'[id]] = a.romp ? `${dir}romp.png + rups.png` : `${dir}tank.png`;
    }
    if (artKey === key) { art = out; for (const s of sprites.values()) s.parts = null; }
  }

  // Inhoud van de container: romp met rupsen (a), of één plaatje (s.single: tank.png of de getekende tank)
  function build(s, a) {
    for (const c of s.body.removeChildren()) c.destroy();
    s.tracks = []; s.single = null;
    if (a?.romp) {
      for (const tr of a.json.tracks) {
        const h = tr.width * PX, rups = new TilingSprite({ texture: a.rups, width: (tr.x1 - tr.x0) * PX, height: h });
        rups.position.set(tr.x0 * PX, (tr.y - tr.width / 2) * PX);
        rups.tileScale.set(1, h / a.rups.height);
        s.body.addChild(rups);
        s.tracks.push({ sprite: rups, y: tr.y, wrap: a.rups.width / PX });
      }
      const romp = s.body.addChild(new Sprite(a.romp));
      romp.anchor.set(0.5);
    } else {
      s.single = s.body.addChild(new Sprite());
      s.single.anchor.set(0.5);
    }
    s.parts = a?.romp ? a : 'single';
  }

  function sprite(id) {
    let s = sprites.get(id);
    if (!s) {
      s = { body: layer.addChild(new Container()), shadow: shadows.addChild(new Sprite()), parts: null, single: null, tracks: [], last: null };
      s.body.scale.set(1 / PX);
      s.shadow.anchor.set(0.5); s.shadow.tint = shadow.color; s.shadow.alpha = shadow.alpha;
      sprites.set(id, s);
    }
    return s;
  }

  // Rupsen: de afgelegde weg in de rijrichting (verplaatsing geprojecteerd op de hoek) plus het
  // draaien (hoekverschil x afstand tot het midden; links en rechts tegen elkaar in). Het bovenste
  // deel van een rups loopt ten opzichte van de romp mee in de rijrichting. Een sprong (opnieuw in
  // de basis) of een dode tank: niets.
  function moveTracks(s, t) {
    const last = s.last;
    s.last = { x: t.rx, y: t.ry, ang: t.ang };
    if (!last || !t.a || !s.tracks.length) return;
    const dx = t.rx - last.x, dy = t.ry - last.y;
    if (Math.hypot(dx, dy) > TANK_ART.maxStep) return;
    const d = dx * Math.cos(t.ang) + dy * Math.sin(t.ang), turn = Math.atan2(Math.sin(t.ang - last.ang), Math.cos(t.ang - last.ang));
    for (const tr of s.tracks) {
      tr.offset = ((tr.offset ?? 0) + d - tr.y * turn) % tr.wrap;
      tr.sprite.tilePosition.x = tr.offset * PX;
    }
  }

  // Alle tanks eerst verbergen; show zet de tanks die je ziet weer aan
  function begin() {
    for (const s of sprites.values()) s.body.visible = s.shadow.visible = false;
  }
  // Tank t (ploeg id) tekenen; fallback() geeft [texture, px] van de getekende tank als er geen
  // sprite is. Geeft { body, shadow } terug (voor de ingesneeuwde tank).
  function show(id, t, fallback, shadowAt) {
    const s = sprite(id), a = art[id];
    const [tex, px] = a ? [a.tank, PX] : fallback();
    if (s.parts !== (a?.romp ? a : 'single')) build(s, a);
    if (s.single) { s.single.texture = tex; s.single.scale.set(PX / px); }
    moveTracks(s, t);
    s.body.visible = s.shadow.visible = true;
    s.body.position.set(t.rx + 0.5, t.ry + 0.5);
    s.body.rotation = t.ang;
    s.body.tint = a?.tint ?? 0xffffff;
    s.shadow.texture = tex; s.shadow.scale.set(1 / px); s.shadow.rotation = t.ang;
    s.shadow.position.set(t.rx + 0.5 + shadowAt.dx, t.ry + 0.5 + shadowAt.dy);
    return s;
  }
  // Niet in beeld: bij de volgende keer niet opschuiven over de tussenliggende afstand
  function forget(id) {
    const s = sprites.get(id);
    if (s) s.last = null;
  }
  function setShadowAlpha(alpha) {
    for (const s of sprites.values()) s.shadow.alpha = alpha;
  }
  return { load, begin, show, forget, setShadowAlpha };
}
