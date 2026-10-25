// PixiJS-hulpjes voor de wereldweergave (world-view.js): vaste texturen, tegelsprites, deeltjes
// en tekstlabels. Alles hier tekent alleen; wat er getekend moet worden komt uit de gamestate.
import { Container, Sprite, Texture, CanvasSource, Text } from 'pixi.js';

// ---------- Texturen ----------
// Texture van een canvas; update() na tekenen op dat canvas zet hem opnieuw op de videokaart
export const textureOf = (canvas) => new Texture({ source: new CanvasSource({ resource: canvas }) });

// Eenmalig met Canvas 2D getekende texture (cirkels, verlopen, ...)
export function drawnTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return textureOf(c);
}

const S = 64; // maat van de vaste texturen in pixels
export const TEX = {
  // volle cirkel (wolken, vuur)
  disc: drawnTexture(S, S, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.fill(); }),
  // zachte vlek: in het midden vol, naar de rand helemaal weg (rook, schim)
  soft: drawnTexture(S, S, (g) => {
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
  }),
  ring: drawnTexture(S, S, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); g.stroke(); }),
  // lichtflits: wit-geel hart, oranje rand
  flash: drawnTexture(S, S, (g) => {
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, 'rgba(255, 236, 170, 1)'); r.addColorStop(0.5, 'rgba(255, 150, 50, 0.6)'); r.addColorStop(1, 'rgba(255, 90, 20, 0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
  }),
  // verloop van vol (links) naar leeg (rechts): richtingshints
  fadeX: drawnTexture(S, 4, (g) => {
    const l = g.createLinearGradient(0, 0, S, 0);
    l.addColorStop(0, 'rgba(255,255,255,1)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 0, S, 4);
  }),
  white: Texture.WHITE,
};

// Kleur als 'r, g, b' (zoals in de stijlen) naar een getal voor tint
export const tintOf = (s) => { const [r, g, b] = s.split(',').map(Number); return (r << 16) | (g << 8) | b; };

// ---------- Tegelsprites ----------
// Een laag van tegelcanvassen (createTileCanvases) als sprites in een container. Elk frame:
// gewijzigde tegels opnieuw uploaden en alleen de tegels in beeld zichtbaar maken.
// Met shadows (een container) krijgt elke tegel een schaduw: dezelfde texture in één kleur,
// verschoven (zie shadow()).
export function createTileSprites(container, R, TILE, shadows = null) {
  let layer = null;
  const sprites = [], shade = [];
  let dx = 0, dy = 0, color = 0, alpha = 0;
  const place = (t) => shade[t]?.position.set(sprites[t].x + dx, sprites[t].y + dy);
  return {
    use(next) {
      for (const s of container.removeChildren()) s.destroy({ texture: true, textureSource: true });
      for (const s of shadows?.removeChildren() || []) s.destroy();
      sprites.length = shade.length = 0;
      layer = next;
    },
    shadow(x, y, c, a) {
      dx = x; dy = y; color = c; alpha = a;
      for (let t = 0; t < shade.length; t++) if (shade[t]) { place(t); shade[t].tint = color; shade[t].alpha = alpha; }
    },
    sync(cam) {
      if (!layer) return;
      for (const t of layer.takeChanged()) {
        let s = sprites[t];
        if (!s) {
          s = sprites[t] = new Sprite(textureOf(layer.list[t]));
          s.position.set((t % layer.TILES_X) * TILE, Math.floor(t / layer.TILES_X) * TILE);
          s.scale.set(1 / R);
          container.addChild(s);
          if (shadows) {
            const h = shade[t] = shadows.addChild(new Sprite(s.texture));
            h.scale.set(1 / R); h.tint = color; h.alpha = alpha;
            place(t);
          }
        } else s.texture.source.update();
      }
      const x0 = cam.x - TILE - 2, x1 = cam.x + cam.w, y0 = cam.y - TILE - 2, y1 = cam.y + cam.h;
      sprites.forEach((s, t) => {
        if (!s) return;
        s.visible = s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
        if (shade[t]) shade[t].visible = s.visible;
      });
    },
  };
}

// ---------- Deeltjes ----------
// Soorten: flash, ring, fire, spark (licht), chunk (brokjes), en wolken (kleur per weergave).
// clouds: {soort: 'r, g, b'}, bv. { smoke: '74, 70, 62', dust: '226, 200, 150' }.
// Elk deeltje is een sprite uit een voorraad; dode deeltjes gaan terug in de voorraad.
const LIGHT = new Set(['fire', 'spark', 'flash']);
export function createParticles(clouds, cloudAlpha = {}) {
  const layer = new Container(), list = [];
  const groups = {}, pools = {};
  for (const kind of [...Object.keys(clouds), 'chunk', 'ring', 'fire', 'spark', 'flash']) {
    groups[kind] = layer.addChild(new Container());
    pools[kind] = [];
  }
  const texOf = { chunk: TEX.white, ring: TEX.ring, fire: TEX.disc, spark: TEX.white, flash: TEX.flash };
  function sprite(kind) {
    const s = pools[kind].pop() || groups[kind].addChild(new Sprite(texOf[kind] || TEX.disc));
    s.visible = true;
    if (LIGHT.has(kind)) s.blendMode = 'add';
    if (kind === 'spark') s.anchor.set(0, 0.5); else s.anchor.set(0.5);
    return s;
  }
  return {
    layer,
    spawn(kind, x, y, n, o) {
      if (!groups[kind]) return; // soort die deze weergave niet kent
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = (0.25 + Math.random() * 0.75) * (o.speed || 0);
        const life = (0.6 + Math.random() * 0.4) * o.life;
        const p = {
          kind, x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          ttl: life, max: life, r0: o.r0 ?? 0.4, r1: o.r1 ?? 0.4, rot: Math.random() * 6, s: sprite(kind),
        };
        const col = o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : null;
        p.s.tint = kind in clouds ? tintOf(clouds[kind]) : kind === 'ring' ? 0xfff0d2 : col || 0xffffff;
        list.push(p);
      }
    },
    update(dt) {
      // bijwerken; dode deeltjes in één keer opruimen (geen splice per deeltje)
      let w = 0;
      for (const p of list) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const drag = Math.pow(p.kind in clouds ? 0.5 : 0.06, dt);
        p.vx *= drag; p.vy *= drag;
        p.ttl -= dt;
        if (p.ttl <= 0) { p.s.visible = false; pools[p.kind].push(p.s); continue; }
        list[w++] = p;
        const k = p.ttl / p.max, r = p.r1 + (p.r0 - p.r1) * k, s = p.s; // k: 1 -> 0
        s.position.set(p.x, p.y);
        if (p.kind in clouds) { s.width = s.height = 2 * r; s.alpha = (cloudAlpha[p.kind] ?? 0.45) * k; }
        else if (p.kind === 'chunk') { s.width = 0.7; s.height = 0.5; s.rotation = p.rot + (1 - k) * 4; s.alpha = 1; }
        else if (p.kind === 'ring') { s.width = s.height = 2 * r; s.alpha = 0.8 * k; }
        else if (p.kind === 'spark') {
          s.width = Math.hypot(p.vx, p.vy) * 0.03; s.height = 0.22;
          s.rotation = Math.atan2(-p.vy, -p.vx); s.alpha = k;
        } else { s.width = s.height = 2 * r; s.alpha = k; } // fire, flash
      }
      list.length = w;
    },
  };
}

// ---------- Voorraad sprites ----------
// Voor dingen waarvan er per frame een wisselend aantal is (kogels, schimmen, rook, hints):
// begin(), dan next() per ding, dan end() verbergt wat over is.
export function spritePool(container, tex, setup = (s) => s.anchor.set(0.5)) {
  const all = [];
  let used = 0;
  return {
    begin() { used = 0; },
    next() {
      let s = all[used];
      if (!s) { s = all[used] = container.addChild(new Sprite(tex)); setup(s); }
      s.visible = true;
      used++;
      return s;
    },
    end() { for (let k = used; k < all.length; k++) all[k].visible = false; },
  };
}

// CSS-kleur 'rgba(r, g, b, a)' of '#rrggbb' naar een Pixi-vulling {color, alpha}
export function rgba(css) {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return { color: css, alpha: 1 };
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  return { color: (r << 16) | (g << 8) | b, alpha: a };
}

// ---------- Tekstlabel met donkere achtergrond (schermpixels) ----------
export function createLabel(layer) {
  const box = layer.addChild(new Sprite(TEX.white));
  const text = layer.addChild(new Text({ text: '', style: { fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12, fill: 0xf0e6c8 } }));
  let pad = 0, h = 0;
  return {
    // tekst en uiterlijk: size (px), pad (binnenmarge), h (hoogte), color, bg, alpha (achtergrond)
    set(str, o) {
      box.visible = text.visible = true;
      if (text.text !== str) text.text = str;
      if (text.style.fontSize !== o.size) text.style.fontSize = o.size;
      const color = o.color ?? 0xf0e6c8;
      if (text.style.fill !== color) text.style.fill = color;
      box.tint = o.bg ?? 0x100c08; box.alpha = o.alpha ?? 0.7;
      pad = o.pad; h = o.h;
      box.width = text.width + pad * 2; box.height = h;
    },
    // linksboven van het label
    at(x, y) {
      box.position.set(x, y);
      text.position.set(Math.round(x + pad), Math.round(y + (h - text.height) / 2));
    },
    hide() { box.visible = text.visible = false; },
    get width() { return text.width + pad * 2; },
  };
}
