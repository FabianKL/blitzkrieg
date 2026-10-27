// Het zijpaneel, op elke kaart hetzelfde (CLAUDE.md): je tankkaart, de minikaart en de legenda.
// De opmaak staat per stijl in styles/*.css; dit vult de elementen uit index.html.
// v = { game, style, at(x, y), flushPainter, en (per kaart anders) pal, bases, bridgeMask,
// painter, objects, cam } uit world-view.js.
import * as G from '/shared/game.js';
import { HUD, TUNNEL } from '/shared/config.js';
import { hash, rgb, R, REFILL_COLORS, paintRefillIcon } from '/render-common.js';

const $ = (id) => document.getElementById(id);

export function createSidePanel(v) {
  const { game, style, at, flushPainter } = v;

  // ---------- Minikaart: 1 pixel per cel, bijgewerkt per veranderde cel ----------
  // Een kaart om te navigeren, op elke map hetzelfde (canvas #mini op de pagina): het terrein in
  // de kleuren van de kaart (zoals de legenda), je eigen basis, je eigen tank en de plekken waar
  // je brandstof of munitie haalt. Geen tunnels of sporen (van niemand), geen andere bases en
  // geen andere tanks: wat gegraven is, toont gewoon het terrein eronder.
  let miniBase = null, minctx = null, miniImg = null;
  let miniDirty = false, lastMini = 0;
  const miniCanvas = $('mini'), miniCtx = miniCanvas?.getContext('2d');
  function makeMini() {
    miniBase = document.createElement('canvas');
    miniBase.width = G.W;
    miniBase.height = G.H;
    minctx = miniBase.getContext('2d');
    miniImg = minctx.createImageData(G.W, G.H);
  }
  const lighten = (c, k) => c.map((x) => x + (255 - x) * k);
  const MINI_TEAM = ['#2fd04a', '#2f7fe8', '#e8352b', '#f2b51c']; // als de stijl geen minikleur heeft
  const miniColor = (id) => style.teams[id]?.mini || MINI_TEAM[id] || '#ffffff';
  function paintMini(x, y) {
    if (!miniCanvas || !G.minimapOn(game.rules)) return;
    const c = at(x, y), idx = y * G.W + x, i = idx * 4;
    const own = c === G.BASE + game.me || c === G.WALL + game.me;
    let col;
    if (own) col = c === G.WALL + game.me ? rgb(miniColor(game.me)) : [240, 236, 222]; // muur in je ploegkleur
    else if (c === G.ROCK) col = v.pal.rock;
    else if (c === G.WATER) col = v.pal.water;
    else if (c === G.VEG) col = (hash(x, y) % 3 ? v.pal.veg : lighten(v.pal.veg, 0.12));
    else if (c === G.BUILDING) col = v.pal.building;
    else if (v.bridgeMask?.[idx]) col = v.pal.bridge;
    else { // grond (ook tunnels en andermans basis): de terreinklasse, met wat korrel
      const k = 0.94 + (hash(x, y) % 100) / 1000;
      col = v.pal.cls[game.terrain[idx]].map((x) => x * k);
    }
    miniImg.data[i] = col[0]; miniImg.data[i + 1] = col[1]; miniImg.data[i + 2] = col[2]; miniImg.data[i + 3] = 255;
    miniDirty = true;
  }
  // Je eigen basis opnieuw kleuren (na het instappen weet je pas welke van jou is)
  let miniMe = -1;
  function paintOwnBase() {
    if (miniMe === game.me) return;
    miniMe = game.me;
    for (const b of v.bases) if (b) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) paintMini(x, y);
  }
  function drawMinimap() {
    const now = performance.now();
    if (!miniCanvas || !game.map || now - lastMini < 100) return;
    lastMini = now;
    const on = G.minimapOn(game.rules);
    if (miniCanvas.hidden === on) {
      miniCanvas.hidden = !on;
      for (const el of document.querySelectorAll('[data-minimap]')) el.hidden = !on;
    }
    if (!on) return;
    paintOwnBase();
    const g = miniCtx, opt = style.minimap || {};
    if (miniDirty) { minctx.putImageData(miniImg, 0, 0); miniDirty = false; }
    const sx = g.canvas.width / G.W, sy = g.canvas.height / G.H, px = 1 / sx; // px: één schermpixel in cellen
    g.setTransform(sx, 0, 0, sy, 0, 0);
    g.imageSmoothingEnabled = opt.smooth ?? true;
    g.drawImage(miniBase, 0, 0);
    opt.overlay?.(g);
    // brandstof en munitie: depots (Ardennen), munitiedepot (Fall Gelb), droppings (Market Garden)
    const icon = (x, y, kind) => {
      const r = 4 * px;
      g.fillStyle = 'rgba(0, 0, 0, 0.75)'; g.fillRect(x - r - px, y - r - px, 2 * r + 2 * px, 2 * r + 2 * px);
      g.fillStyle = REFILL_COLORS[kind]; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      g.fillStyle = 'rgba(0, 0, 0, 0.8)'; // B of M in het vakje
      g.font = `bold ${7 * px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(kind === 'fuel' ? 'B' : 'M', x, y + 0.4 * px);
    };
    for (const [x, y, full] of game.depots) if (full) icon(x, y, 'fuel');
    if (game.ammoDepot) icon(game.ammoDepot[0], game.ammoDepot[1], 'ammo');
    for (const c of game.crates) if (c && c[3]) icon(c[0], c[1], c[2]);
    // je eigen basis: een ring eromheen, zodat je hem altijd terugvindt
    const mine = v.bases[game.me];
    if (mine) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2 * px;
      g.strokeRect(mine.x0 - 3 * px, mine.y0 - 3 * px, mine.x1 - mine.x0 + 1 + 6 * px, mine.y1 - mine.y0 + 1 + 6 * px);
    }
    // wat je in beeld hebt, en je eigen tank (alleen die van jou)
    g.strokeStyle = opt.rect || 'rgba(255, 255, 255, 0.8)'; g.lineWidth = 1.5 * px;
    g.strokeRect(v.cam.x, v.cam.y, v.cam.w, v.cam.h);
    const self = game.tanks.get(game.me);
    if (self?.a && self.rx !== undefined) {
      g.fillStyle = '#000'; g.fillRect(self.rx - 5 * px, self.ry - 5 * px, 10 * px, 10 * px);
      g.fillStyle = miniColor(game.me); g.fillRect(self.rx - 3.5 * px, self.ry - 3.5 * px, 7 * px, 7 * px);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- Legenda (rechts): welke kleur is welk terrein ----------
  // Per kaart opgebouwd uit wat er echt ligt, met de namen uit de kaartinstellingen. Het
  // kleurvakje is een uitsnede van de getekende kaart zelf (met objecten), zodat het er precies
  // zo uitziet als in het spel; ligt iets (nog) niet op de kaart, dan de kleur uit de instellingen.
  const CLASS_LABEL = { paved: 'Verhard', hard: 'Harde grond', normal: 'Grond', soft: 'Zachte grond', marsh: 'Moeras', ford: 'Doorwaadbare plek', ice: 'IJs', burnt: 'Verbrande grond', retro: 'Zand' };
  function buildLegend() {
    const box = $('legend');
    if (!box) return;
    const rules = game.rules || {}, map = game.map, terrain = game.world.terrain;
    const counts = new Map();
    const kindAt = (i) => {
      const v = map[i];
      if (v === G.DIRT) return 'c' + terrain[i];
      return v === G.ROCK ? 'rock' : v === G.WATER ? 'water' : v === G.VEG ? 'veg' : v === G.BUILDING ? 'building' : null;
    };
    for (let i = 0; i < map.length; i++) { const k = kindAt(i); if (k) counts.set(k, (counts.get(k) || 0) + 1); }
    const pct = (s) => `${Math.round(s * 100)}%`; // rijsnelheid (100% = over een weg)
    const rows = [];
    // terreinklassen: eerst in de volgorde van de kaartinstellingen, dan wat er verder ligt
    const names = [...Object.keys(rules.classes || {}), ...G.CLASS_NAMES].filter((n, i, a) => a.indexOf(n) === i);
    for (const n of names) {
      const c = G.CLASS[n], cfg = rules.classes?.[n];
      if (!counts.get('c' + c) && !cfg?.later) continue;
      const cls = G.CLASSES[c];
      rows.push({ kind: 'c' + c, color: v.pal.hex.classes[n], label: cfg?.label || CLASS_LABEL[n] || n,
        note: cls.noTunnel ? `${pct(cls.speed / G.SPEED_ONE)} · geen tunnel` : pct(cls.speed / G.SPEED_ONE) });
    }
    const extra = [
      ['veg', v.pal.hex.veg, rules.vegetation?.label || 'Begroeiing', 'wegschieten'],
      ['building', v.pal.hex.building, rules.buildings?.label || 'Gebouwen', 'wegschieten'],
      ['rock', v.pal.hex.rock, rules.rocks?.label || 'Rots', 'blokkeert'],
      ['water', v.pal.hex.water, rules.water?.label || 'Water', 'geen doorgang'],
    ];
    for (const [kind, color, label, note] of extra) if (counts.get(kind)) rows.push({ kind, color, label, note });
    rows.push({ kind: null, color: v.pal.hex.tunnel, label: 'Tunnel en spoor', note: pct(TUNNEL.speed) });
    // brandstof en munitie halen (zo staan ze op de minikaart: B en M)
    const scarce = rules.scarce?.type;
    if (scarce === 'fuelDepots' || scarce === 'airDrops') rows.push({ icon: 'fuel', label: scarce === 'airDrops' ? 'Dropping: brandstof' : 'Brandstofdepot', note: 'B op kaart en minikaart' });
    if (scarce === 'ammoDepot' || scarce === 'airDrops') rows.push({ icon: 'ammo', label: scarce === 'airDrops' ? 'Dropping: munitie' : 'Munitiedepot', note: 'M op kaart en minikaart' });
    box.replaceChildren(...rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'legend-row';
      const sw = document.createElement('canvas');
      sw.className = 'legend-swatch';
      sw.width = sw.height = 4 * R;
      if (r.icon) paintRefillIcon(sw, r.icon); else paintSwatch(sw, r.kind, r.color, kindAt);
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = r.label;
      const note = document.createElement('span');
      note.className = 'legend-note';
      note.textContent = r.note;
      row.append(sw, name, note);
      return row;
    }));
  }
  // Uitsnede van 4x4 cellen waar alleen dit soort terrein ligt (of een effen vlak): liefst
  // midden in een vlak (6x6 gelijk, het middelste stuk), anders 4x4 (heggen, smalle wegen),
  // anders rond een klein stukje (losse struik); de plek die het dichtst bij het midden ligt
  function paintSwatch(sw, kind, color, kindAt) {
    const g = sw.getContext('2d'), N = 4;
    g.fillStyle = color;
    g.fillRect(0, 0, sw.width, sw.height);
    if (!kind) return;
    const same = (x0, y0, n) => {
      for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) if (kindAt(y * G.W + x) !== kind) return false;
      return true;
    };
    let spot = null;
    for (const n of [N + 2, N, 2]) {
      let best = Infinity;
      for (let y0 = 1; y0 + n < G.H; y0 += 2) {
        for (let x0 = 1; x0 + n < G.W; x0 += 2) {
          if (kindAt(y0 * G.W + x0) !== kind) continue;
          const d = Math.hypot(x0 - G.W / 2, y0 - G.H / 2);
          if (d < best && x0 + (n - N) / 2 >= 0 && y0 + (n - N) / 2 >= 0 && same(x0, y0, n)) { best = d; spot = [x0 + (n - N) / 2, y0 + (n - N) / 2]; }
        }
      }
      if (spot) break;
    }
    if (!spot) return;
    const [sx, sy] = spot;
    flushPainter(v.painter, { x: sx, y: sy, w: N, h: N }); // zorgt dat dat stuk kaart geschilderd is
    v.painter.layer.drawRegion(g, sx, sy, N, N, 0, 0, sw.width, sw.height);
    v.objects?.drawRegion(g, sx, sy, N, N, 0, 0, sw.width, sw.height);
  }
  // ---------- Tankkaart in het zijpaneel (op elke kaart dezelfde, opmaak per stijl in CSS) ----------
  // Naam, zeges en drie meters; alleen bijwerken als er iets veranderd is. Plus de korte tekst van
  // de stijl in het speelveld (je ploeg, hoe lang de mist nog hangt).
  const card = {
    el: $('card'), name: $('card-name'), wins: $('card-wins'), label: $('panel-label'), key: '',
    gauges: ['fuel', 'armour', 'ammo'].map((k) => ({ fill: $(`fill-${k}`), num: $(`num-${k}`), low: HUD.low[k] })),
  };
  function drawCard(now) {
    const txt = style.label?.(now) ?? '';
    if (card.label && card.label.textContent !== txt) card.label.textContent = txt;
    const t = game.tanks.get(game.me);
    if (!t || !card.el) return;
    const name = style.teams[game.me]?.name ?? '';
    const key = `${name},${t.f},${t.s},${t.m},${t.c},${t.a}`;
    if (key === card.key) return;
    card.key = key;
    card.name.textContent = name;
    card.wins.textContent = t.c ?? 0;
    const values = [[(t.f ?? 0) / 100, `${t.f ?? 0}%`], [(t.s ?? 0) / G.SHIELD_MAX, `${t.s ?? 0}`], [(t.m ?? 0) / G.AMMO_MAX, `${t.m ?? 0}`]];
    card.gauges.forEach((g, k) => {
      const [pct, text] = values[k];
      g.fill.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
      g.fill.classList.toggle('low', pct < g.low);
      g.num.textContent = text;
    });
    card.el.classList.toggle('dead', t.a === 0);
  }

  // Nieuwe kaart: minikaart opnieuw opbouwen (alle cellen) en de legenda maken
  function loadMap() {
    makeMini();
    miniMe = -1;
    for (let y = 0; y < G.H; y++) for (let x = 0; x < G.W; x++) paintMini(x, y);
  }
  return { loadMap, paintMini, drawMinimap, buildLegend, drawCard };
}
