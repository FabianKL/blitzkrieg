// Zicht en hints (SPEC-blitzkrieg §8 en §9). Puur rekenwerk, zonder browsercode, zodat de
// tests precies hetzelfde controleren als wat de weergave doet. Het verbergen gebeurt in de
// browser van elke speler (er wordt niet valsgespeeld; zo is het het zuinigst).
import * as G from './game.js';
import { HINTS } from './config.js';

// Blokkeert deze cel het zicht? Gebouwen en begroeiing wel, al het andere niet.
export const blocksSight = (c) => c === G.VEG || c === G.BUILDING;

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

// Hoe zie ik een tegenstander? 'sharp' (scherp: binnen de zichtstraal en vrije zichtlijn),
// 'ghost' (schim: buiten de straal maar in het venster, vrije zichtlijn) of null (niets).
// Een bedekte tank (onderduiken in de storm) geeft niets. view = {x, y, w, h} in cellen.
export function sightOf(map, me, other, radius, view, smokes = []) {
  if (other.buried) return null;
  const inView = other.x >= view.x && other.x <= view.x + view.w && other.y >= view.y && other.y <= view.y + view.h;
  const d = Math.hypot(other.x - me.x, other.y - me.y);
  if (d > radius && !inView) return null;
  if (!lineOfSight(map, me.x, me.y, other.x, other.y, smokes)) return null;
  return d <= radius ? 'sharp' : 'ghost';
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
