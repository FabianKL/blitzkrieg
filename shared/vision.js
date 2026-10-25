// Zicht en hints (SPEC-blitzkrieg §8 en §9). Puur rekenwerk, zonder browsercode, zodat de
// tests precies hetzelfde controleren als wat de weergave doet. Het verbergen gebeurt in de
// browser van elke speler (er wordt niet valsgespeeld; zo is het het zuinigst).
import * as G from './game.js';
import { HINTS, VISION, FOG } from './config.js';

// Blokkeert deze cel het zicht? Gebouwen, begroeiing en rotsen wel, al het andere niet.
export const blocksSight = (c) => c === G.VEG || c === G.BUILDING || c === G.ROCK;

// Vrije zichtlijn van (x0, y0) naar (x1, y1)? De cellen onder de tanks zelf tellen niet mee
// (skip cellen aan het begin en eind). smokes = [{x, y, r}]: rookvlekken blokkeren ook.
export function lineOfSight(map, x0, y0, x1, y1, smokes = [], skip = G.TANK_R + 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = skip; s <= n - skip; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n);
    if (!G.inBounds(x, y) || blocksSight(map[y * G.W + x])) return false;
  }
  for (const sm of smokes) if (segmentHitsCircle(x0, y0, x1, y1, sm.x, sm.y, sm.r)) return false;
  return true;
}
function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L));
  return Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy) < r;
}

// Ligt (x, y) in de kijkboog van me = {x, y, ang}? ang = rijrichting in radialen (y omlaag);
// zonder richting kijk je rondom.
const coneCos = () => Math.cos(((VISION.coneDegrees / 2) * Math.PI) / 180);
export function inCone(me, x, y) {
  const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
  if (me.ang === undefined || d === 0) return true;
  return (dx * Math.cos(me.ang) + dy * Math.sin(me.ang)) / d >= coneCos();
}

// Ligt (x, y) in mijn zichtveld, los van het venster? Binnen de zichtcirkel zie je rondom; alleen
// in je kijkboog telt de zichtlijn (gebouwen, begroeiing, rotsen en rook ertussen verbergen
// wat erachter ligt), naast en achter je niet. Buiten de cirkel alleen in de kijkboog, met een
// vrije zichtlijn. Dezelfde regel voor tanks, kogels en de schaduw in beeld, zodat wat donker is
// ook echt onzichtbaar is.
export function visibleCell(map, me, x, y, radius, smokes = []) {
  if (!inCone(me, x, y)) return Math.hypot(x - me.x, y - me.y) <= radius;
  return lineOfSight(map, me.x, me.y, x, y, smokes);
}

// Hoe zie ik wat er op (x, y) staat? 'sharp' (scherp: in je zichtveld binnen de zichtcirkel),
// 'contour' (vage contour: in je zichtveld buiten de cirkel, wel in het venster) of null.
// opts = {radius (G.visionRadius), view = {x, y, w, h} in cellen, smokes = [{x, y, r}]}.
export function sightAt(map, me, x, y, { radius, view, smokes = [] }) {
  const d = Math.hypot(x - me.x, y - me.y);
  const inView = x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h;
  if (d > radius && !inView) return null;
  if (!visibleCell(map, me, x, y, radius, smokes)) return null;
  return d <= radius ? 'sharp' : 'contour';
}
// Een tegenstander; een bedekte tank (onderduiken in de storm) geeft niets
export const sightOf = (map, me, other, opts) => (other.buried ? null : sightAt(map, me, other.x, other.y, opts));

// Dekking van een contour op afstand d: net buiten de cirkel FOG.contourAlpha, naar far (de
// rand van het venster) toe aflopend tot 0
export function contourAlpha(d, radius, far) {
  return FOG.contourAlpha * Math.max(0, Math.min(1, 1 - (d - radius) / Math.max(1, far - radius)));
}

// Richtingshint: één van 8 richtingen (0 = boven, met de klok mee) van (dx, dy)
export const DIRECTION_NAMES = ['boven', 'rechtsboven', 'rechts', 'rechtsonder', 'onder', 'linksonder', 'links', 'linksboven'];
export function hintDirection(dx, dy) {
  const a = Math.atan2(dx, -dy); // 0 = boven
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

// Zoeklichten (Oder-front, §10.9): beams bundels vanaf de rechterrand, elk widthT breed, die
// heen en weer zwaaien (één zwaai per sweepSeconds). Server en clients rekenen dezelfde stand
// uit de tijd sinds het begin van het spel (ticks). Geeft per bundel {x0, y0, ang}.
export function searchlightBeams(cfg, ticks) {
  const out = [], t = ticks / G.TICK_RATE;
  for (let k = 0; k < cfg.beams; k++) {
    const y0 = ((k + 0.5) / cfg.beams) * G.H;
    const phase = (t / cfg.sweepSeconds) * Math.PI * 2 + k * 2.1;
    out.push({ x0: G.W - 1, y0, ang: Math.PI + Math.sin(phase) * 0.55 }); // naar links, zwaaiend
  }
  return out;
}
// Ligt (x, y) in een bundel?
export function searchlightAt(cfg, ticks, x, y) {
  const half = (cfg.widthT * G.T) / 2;
  return searchlightBeams(cfg, ticks).some((b) => {
    const dx = x - b.x0, dy = y - b.y0, along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang);
    return along > 0 && Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang)) <= half;
  });
}

// Geluid: alleen binnen gehoorafstand (HINTS.hearingT in T)
export const hearingCells = () => HINTS.hearingT * G.T;
export const canHear = (me, x, y) => Math.hypot(x - me.x, y - me.y) <= hearingCells();

// Welke gebeurtenis geeft een hint, en waar (§8)? Geeft {x, y} of null. Geluiden van een
// tegenstander binnen gehoorafstand (schot, begroeiing/gebouw kapot, krakend ijs), grote
// gebeurtenissen (e.t === 'hint') overal. Zie je de tegenstander scherp, dan geen hint: die
// zijn voor wat je niet ziet. ctx = {me (waar je kijkt, null = dood), self (eigen id),
// seenOf(id) (hoe je die tank nu ziet), posOf(id) ({x, y} van die tank of null)}.
export function hintSource(e, { me, self, seenOf, posOf }) {
  if (!me) return null;
  const src = e.t === 'x' ? e.o : e.i; // bij een inslag: van wie de kogel was
  if (src === undefined || src === self || seenOf(src) === 'sharp') return null;
  if (e.t === 'b' || (e.t === 'x' && e.fell)) return canHear(me, e.x, e.y) ? { x: e.x, y: e.y } : null;
  if (e.t === 'c') {
    const p = posOf(e.i);
    return p && canHear(me, p.x, p.y) ? { x: p.x, y: p.y } : null;
  }
  if (e.t === 'hint') return { x: e.x, y: e.y };
  return null;
}
