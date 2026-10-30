// De basis als bouwpakket (alleen weergave): muurstukken, hoekpalen, deurposten en spullen uit
// public/assets/<stijl>/bases/ op de echte cellen van de basis gelegd (findBases: x0..x1, y0..y1
// muur, d0..d1 de deur, boven en onder). Tekent met Canvas 2D in celmaten, zoals style.drawBase;
// world-view.js maakt er één texture per basis van. Ontbreekt een onderdeel, dan tekent de stijl
// de basis zoals vroeger. Maten in BASE_KIT (config.js).
import { BASE_KIT } from '/shared/config.js';
import { hash } from '/render-common.js';
import { loadManifest, loadImage, has, report } from '/assets.js';

const kits = new Map(); // stijl -> Promise<{muur, hoek, deurpost, spul: []} of null>
export function loadBaseKit(style) {
  if (!kits.has(style)) {
    kits.set(style, (async () => {
      const m = await loadManifest(), dir = `${style}/bases/`;
      const names = ['muur', 'hoek', 'deurpost'], spul = [];
      for (let k = 1; has(m, `${dir}spul-${String(k).padStart(2, '0')}.png`); k++) spul.push(`spul-${String(k).padStart(2, '0')}`);
      const imgs = await Promise.all([...names, ...spul].map((n) => (has(m, `${dir}${n}.png`) ? loadImage(m, `${dir}${n}.png`) : null)));
      if (imgs.slice(0, 3).some((i) => !i)) { report.bases = 'getekend (geen bouwpakket)'; return null; }
      report.bases = `${dir} (${spul.length} spullen)`;
      return { muur: imgs[0], hoek: imgs[1], deurpost: imgs[2], spul: imgs.slice(3).filter(Boolean) };
    })());
  }
  return kits.get(style);
}

// Plaatje img gecentreerd op (cx, cy) in cellen, size cellen breed, gedraaid en/of gespiegeld
function put(g, img, cx, cy, size, rot = 0, flipX = false, flipY = false) {
  const h = (size * img.height) / img.width;
  g.save();
  g.translate(cx, cy); g.rotate(rot); g.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  g.drawImage(img, -size / 2, -h / 2, size, h);
  g.restore();
}
// Muur van a tot b (cellen) langs de as door c, horizontaal of verticaal: het muurplaatje herhaald
function wall(g, img, a, b, c, horizontal) {
  if (b <= a) return;
  const th = BASE_KIT.wall, seg = (img.width / img.height) * th; // lengte van één plaatje in cellen
  g.save();
  if (horizontal) g.translate(a, c); else { g.translate(c, a); g.rotate(Math.PI / 2); }
  for (let s = 0; s < b - a; s += seg) {
    const len = Math.min(seg, b - a - s); // laatste stuk afknippen
    g.drawImage(img, 0, 0, (img.width * len) / seg, img.height, s, -th / 2, len, th);
  }
  g.restore();
}

// De hele basis b (findBases) in celmaten
export function drawBaseKit(g, b, kit) {
  const { x0, y0, x1, y1, d0, d1 } = b, mx0 = x0 + 0.5, mx1 = x1 + 0.5, my0 = y0 + 0.5, my1 = y1 + 0.5;
  // spullen binnen langs de zijmuren (vast toeval per basis), niet voor de deuren
  const spots = [[mx0 + 2.4, my0 + 3.2], [mx0 + 2.4, my1 - 3.2], [mx1 - 2.4, my0 + 3.2], [mx1 - 2.4, my1 - 3.2], [mx0 + 2.4, (my0 + my1) / 2], [mx1 - 2.4, (my0 + my1) / 2]];
  const h0 = hash(x0 * 7 + 1, y0 * 13 + 2);
  for (let k = 0; k < Math.min(BASE_KIT.items, spots.length) && kit.spul.length; k++) {
    const [sx, sy] = spots[(h0 + k * 5) % spots.length], h = hash(x0 + k, y0 - k);
    put(g, kit.spul[h % kit.spul.length], sx, sy, BASE_KIT.item, ((h >>> 8) % 4) * (Math.PI / 2));
  }
  // muren: links en rechts heel, boven en onder met de deur ertussen
  wall(g, kit.muur, my0, my1, mx0, false);
  wall(g, kit.muur, my0, my1, mx1, false);
  for (const y of [my0, my1]) {
    wall(g, kit.muur, mx0, d0 - 0.5, y, true);
    wall(g, kit.muur, d1 + 1.5, mx1, y, true);
  }
  // deurposten naast beide deuren (scharnier naar de deur toe), hoekpalen erover
  for (const [y, flipY] of [[my0, false], [my1, true]]) {
    put(g, kit.deurpost, d0 - 0.5, y, BASE_KIT.post, 0, false, flipY);
    put(g, kit.deurpost, d1 + 1.5, y, BASE_KIT.post, 0, true, flipY);
  }
  for (const [x, y] of [[mx0, my0], [mx1, my0], [mx0, my1], [mx1, my1]]) put(g, kit.hoek, x, y, BASE_KIT.corner);
}
