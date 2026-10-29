// Bruggen als sprites (alleen weergave): elke brug uit de kaartmaker (game.bridges) is een eigen
// container in de objectlaag, onder de tanks, gedraaid in de richting van de weg erover. Opbouw
// uit drie delen: begin (landhoofd), een herhaald middenstuk en eind. De rijbaan tussen de
// leuningen is precies zo breed als de cellen waar je over rijdt; landhoofden steken de oever op.
// Is een brug opgeblazen (Market Garden, game.bridge.blown), dan ligt er het wrak.
// Sprites uit public/assets/<stijl>/bridges/<soort>-begin|midden|eind|wrak.png; ontbreekt er een,
// dan een getekende vervanger. Schaduw via dezelfde lichtbron als de rest (look.light) in de
// schaduwlaag. Een brug blokkeert het zicht niet: het is alleen een plaatje.
import { Container, Sprite, Texture, ImageSource, Rectangle } from 'pixi.js';
import { loadManifest, loadImage, has, report } from '/assets.js';

const PARTS = ['begin', 'midden', 'eind', 'wrak'];
// Getekende vervanger per soort: rijbaan, leuning en landhoofd (kleuren)
const DRAWN = {
  hout: { deck: '#7a5a3a', seam: '#4e3824', rail: '#5a4028', pier: '#8a8478' },
  steen: { deck: '#9a958c', seam: '#6e6a62', rail: '#b4ada2', pier: '#a29c92' },
  staal: { deck: '#5c6064', seam: '#3c4044', rail: '#6c7a6a', pier: '#a29c92' },
};
const PX = 32; // getekende vervanger: pixels per cel

// layer: onder de tanks (objectlaag), shadowLayer: de schaduwlaag, shadowColor: kleur van de schaduw
export function createBridgeView({ layer, shadowLayer, game, particles, shadowColor }) {
  let parts = null, kindKey = '', built = [], look = null;

  // Getekende vervanger: canvas in de maat van de echte sprites (rijbaan 8 cellen breed)
  function drawn(kind, part) {
    const c = document.createElement('canvas'), d = DRAWN[kind] || DRAWN.steen, deck = 8 * PX, rail = PX * 0.7;
    const len = part === 'midden' ? 4 * PX : part === 'wrak' ? 24 * PX : 6 * PX;
    const tall = part === 'midden' ? deck : deck * 1.4;
    c.width = len; c.height = tall;
    const g = c.getContext('2d'), top = (tall - deck) / 2;
    const land = part === 'begin' ? len * 0.33 : 0, landR = part === 'eind' ? len * 0.33 : 0;
    if (part !== 'midden') { g.fillStyle = d.pier; g.fillRect(land - PX * 0.5, 0, PX, tall); g.fillRect(len - landR - PX * 0.5, 0, PX, tall); }
    g.fillStyle = d.deck; g.fillRect(land, top, len - land - landR, deck);
    g.fillStyle = d.seam; // planken of naden dwars op de rijrichting
    for (let x = land; x < len - landR; x += kind === 'hout' ? PX * 0.5 : PX) g.fillRect(x, top, 2, deck);
    g.fillStyle = d.rail;
    g.fillRect(land, top, len - land - landR, rail); g.fillRect(land, top + deck - rail, len - land - landR, rail);
    if (part === 'wrak') { // middenstuk weg: alleen de twee einden blijven staan
      g.clearRect(len * 0.3, 0, len * 0.4, tall);
      g.fillStyle = d.seam;
      for (let k = 0; k < 7; k++) g.fillRect(len * (0.32 + k * 0.05), top + deck * (0.2 + ((k * 37) % 60) / 100), PX * 1.4, PX * 0.6);
    }
    return c;
  }
  const textureOf = (img) => new Texture({ source: new ImageSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear' }) });

  // Delen van de soort voor deze stijl laden (één keer per stijl en soort)
  async function loadParts(style, kind) {
    const key = `${style}|${kind}`;
    if (key === kindKey) return parts;
    kindKey = key;
    const m = await loadManifest();
    const out = {};
    report.bridges = {};
    for (const part of PARTS) {
      const path = `${style}/bridges/${kind}-${part}.png`, img = has(m, path) ? await loadImage(m, path) : null;
      out[part] = textureOf(img || drawn(kind, part));
      report.bridges[`${kind}-${part}`] = img ? path : 'getekend';
    }
    if (kindKey === key) parts = out;
    return out;
  }

  // Eén brug opbouwen: x langs de brug (cellen, 0 = begin van het water), y dwars erop
  function buildBridge(b, p) {
    const body = new Container(), wreck = new Container();
    const mid = p.midden, k = b.w / mid.height; // cellen per pixel: rijbaan = breedte van de cellen
    const L = Math.hypot(b.z[0] - b.a[0], b.z[1] - b.a[1]), land = look.bridge.land;
    // stuk van het begin en eind dat boven het water komt, hoogstens de helft van de brug
    const part = (tex, fromLeft) => {
      const nat = tex.width, landPx = nat * land, waterPx = Math.min(nat - landPx, (L / 2) / k);
      const frame = fromLeft ? new Rectangle(0, 0, landPx + waterPx, tex.height) : new Rectangle(nat - landPx - waterPx, 0, landPx + waterPx, tex.height);
      return { tex: new Texture({ source: tex.source, frame }), landPx, waterPx };
    };
    const bg = part(p.begin, true), en = part(p.eind, false);
    const lm = mid.width * k, rest = L - (bg.waterPx + en.waterPx) * k, n = Math.max(0, Math.round(rest / lm));
    const sx = L / ((bg.waterPx + en.waterPx) * k + n * lm); // zo veel uitrekken dat alles precies past
    const put = (c, tex, x, w) => {
      const s = c.addChild(new Sprite(tex));
      s.anchor.set(0, 0.5);
      s.position.set(x, 0);
      s.width = w; s.height = tex.height * k;
      return s;
    };
    let x = -bg.landPx * k * sx;
    put(body, bg.tex, x, (bg.landPx + bg.waterPx) * k * sx);
    x += (bg.landPx + bg.waterPx) * k * sx;
    for (let i = 0; i < n; i++) { put(body, mid, x, lm * sx); x += lm * sx; }
    put(body, en.tex, x, (en.landPx + en.waterPx) * k * sx);
    // wrak: één plaatje over de hele brug, landhoofden even ver de oever op als bij de hele brug
    const wk = p.wrak, wl = bg.landPx * k * sx;
    put(wreck, wk, -wl, L + 2 * wl);
    const root = new Container();
    root.addChild(body, wreck);
    root.position.set(b.a[0] + 0.5, b.a[1] + 0.5);
    root.rotation = Math.atan2(b.z[1] - b.a[1], b.z[0] - b.a[0]);
    return { root, body, wreck, b };
  }

  // De brug die kan ontploffen (game.bridge, Market Garden) is de brug waar zijn vak in ligt
  const blastBridge = () => {
    const box = game.bridge?.box;
    if (!box) return null;
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    return built.find(({ b }) => Math.hypot((b.a[0] + b.z[0]) / 2 - cx, (b.a[1] + b.z[1]) / 2 - cy) < 4 + b.w / 2) || null;
  };

  async function load(lookNow) {
    look = lookNow;
    clear();
    const bridges = game.bridges || [];
    if (!bridges.length) return;
    const p = await loadParts(game.rules?.style || 'zomer', look.bridge.kind);
    if (game.bridges !== bridges) return; // intussen een andere kaart
    for (const b of bridges) {
      const one = buildBridge(b, p), shadow = buildBridge(b, p);
      for (const c of [shadow.body, shadow.wreck]) for (const s of c.children) s.tint = shadowColor;
      layer.addChild(one.root);
      shadowLayer.addChild(shadow.root);
      one.shadow = shadow;
      built.push(one);
    }
    setShadow();
    update();
  }
  function setShadow() {
    for (const one of built) {
      const s = one.shadow.root, h = look.bridge.height;
      s.position.set(one.root.x + look.light.dx * h, one.root.y + look.light.dy * h);
      s.alpha = look.light.alpha;
    }
  }
  function clear() {
    for (const one of built) { one.root.destroy({ children: true }); one.shadow.root.destroy({ children: true }); }
    built = [];
  }

  // Per beeld: heel of wrak (de stand komt van de server, iedereen weet hem)
  function update() {
    const blast = blastBridge(), blown = !!game.bridge?.blown;
    for (const one of built) {
      const wrecked = one === blast && blown;
      one.body.visible = one.shadow.body.visible = !wrecked;
      one.wreck.visible = one.shadow.wreck.visible = wrecked;
    }
  }

  // Ontploffing: stof, splinters en een plons, alleen als je de plek ziet (seen(x, y))
  function onBlast(e, seen) {
    update();
    if (!e.blown || !seen(e.x, e.y)) return;
    const kind = look.bridge.kind, bits = kind === 'hout' ? ['#6a4a2c', '#8a6a48', '#4e3824'] : ['#8e8c88', '#6e6a62', '#b4ada2'];
    particles.spawn('chunk', e.x, e.y, 40, { speed: 18, life: 1.1, cols: bits });
    particles.spawn('chunk', e.x, e.y, 30, { speed: 12, life: 0.9, cols: ['#cfe3ee', '#9fc0d4', '#ffffff'] });
    particles.spawn('ring', e.x, e.y, 2, { life: 0.8, r0: 2, r1: 12 });
    particles.spawn('smoke', e.x, e.y, 18, { speed: 5, life: 2.6, r0: 1.5, r1: 8 });
  }

  return {
    load, update, onBlast, setLook(l) { look = l; setShadow(); }, destroy: clear,
    get active() { return built.length > 0; },
  };
}
