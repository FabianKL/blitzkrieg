// Weer (SPEC-blitzkrieg §7). Elke kaart heeft een lijst weerregels (config: weather). Uit de
// ronde en de klok rekenen server en clients zelf uit wat er nu geldt, zonder berichten.
// Een regel:
//   label     naam in beeld (bv. 'Sneeuwstorm')
//   from      {round: n} | {secondsInGame: s} | {secondsInRound: s}; leeg = altijd
//   untilRound  t/m die ronde
//   every, duration   terugkerend: elke `every` seconden, `duration` lang (de bui eindigt op het
//                     moment dat de volgende periode begint)
//   effect    visibility: zichtstraal in T, of {start, end, overSeconds} (oplopend vanaf het
//             begin van de regel); trackEraser: true | 'nearWater' (alleen binnen 3 T van moeras
//             of water); burial: onderduiken; terrain: verandering bij het ingaan (zie
//             game.js applyTerrainChange); drift: {min, max, period, ground}: verstuiving (sneeuw
//             of stuifzand) die tussen min en max (0..1) wisselt, elke period seconden naar een
//             nieuwe sterkte; in een storm met onderduiken is het 1. Bij min is een vers spoor in
//             TRACK_ERASER.drift.lightSeconds dicht, bij max in heavySeconds, en de storm dekt
//             stormCover ervan toe; ground: gewicht per terreinklasse (ontbreekt = 1) (terrain.js
//             fadeStep). rain: {min, max, period}: regen voor in beeld (0..1, verandert niets aan
//             sporen); lightning: {every}: bliksem, gemiddeld elke `every` seconden een flits.
//             En vrije vlaggen voor de kaart (fog, drops, fires, ...)
// scale: alle seconden keer scale (de tests draaien met een snelle klok).
import { TICK_RATE } from './world.js';
import { LIGHTNING, TRACK_ERASER } from './config.js';

// Vast toeval uit een geheel getal (0..1): server en clients krijgen dezelfde waarde
function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Sterkte (verstuiving, regen) na `since` seconden: vloeiend van de ene vaste waarde naar de volgende
export function driftAt(cfg, since, scale = 1) {
  if (cfg.min === cfg.max) return cfg.min;
  const t = Math.max(0, since);
  const u = t / ((cfg.period || 1) * scale), i = Math.floor(u), f = u - i;
  const a = hash01(i), b = hash01(i + 1), s = f * f * (3 - 2 * f);
  let v = cfg.min + (cfg.max - cfg.min) * (a + (b - a) * s);
  // geleidelijke opbouw: drift ramt van min naar het berekende niveau in rampSeconds
  if (cfg.rampSeconds) {
    const ramp = Math.min(1, t / (cfg.rampSeconds * scale));
    v = cfg.min + (v - cfg.min) * ramp;
  }
  return v;
}

// Bliksem (alleen beeld): de tijd is verdeeld in vakken van `every` seconden met in elk vak één
// inslag op een vaste plek (uit de hash), zodat iedereen hem tegelijk ziet. Geeft de flits van nu
// (0..1): een felle flits, een kortere tweede en een korte nagloed (LIGHTNING in config.js).
export function lightningAt(cfg, since, scale = 1) {
  const t = Math.max(0, since) / scale, L = LIGHTNING;
  for (let i = Math.floor(t / cfg.every); i >= 0 && i >= Math.floor(t / cfg.every) - 1; i--) {
    const dt = t - (i + L.firstAt + hash01(i + 7919) * L.spread) * cfg.every;
    if (dt < 0) continue;
    if (dt < L.flash) return 1;
    if (dt >= L.gap && dt < L.gap + L.second) return L.secondStrength;
    if (dt < L.afterglow) return L.glow * (1 - dt / L.afterglow);
  }
  return 0;
}

// Is de regel in deze ronde en op dit moment van kracht? Geeft null of {since, left, warn}:
// since = seconden sinds hij (deze keer) inging, left = seconden tot hij stopt (Infinity),
// warn = hij begint binnen TRACK_ERASER.warnSeconds (alleen terugkerende regels).
// roundPattern: [1, 1, 0] → actief in rondes 1, 2, niet 3, weer 4, 5, niet 6, enz.
// randomEvery: {min, max} → terugkerend met wisselend interval (deterministisch uit hash01)
export function ruleState(rule, round, tGame, tRound, scale = 1) {
  if (rule.untilRound && round > rule.untilRound) return null;
  if (rule.roundPattern && !rule.roundPattern[(round - 1) % rule.roundPattern.length]) return null;
  const f = rule.from || {};
  if (f.round && round < f.round) return null;
  let since;
  if (f.secondsInRound !== undefined) since = tRound - f.secondsInRound * scale;
  else if (f.secondsInGame !== undefined) since = tGame - f.secondsInGame * scale;
  else since = f.round ? tRound : tGame;
  if (since < 0) return null;
  if (rule.randomEvery) return randomRuleState(rule, since, scale);
  if (!rule.every) return { since, left: Infinity, warn: false };
  const every = rule.every * scale, dur = rule.duration * scale, p = since % every, start = every - dur;
  if (p >= start) return { since: p - start, left: every - p, warn: false };
  return { since: null, left: start - p, warn: p >= start - TRACK_ERASER.warnSeconds * scale };
}

// Terugkerend met wisselend interval: elk slot duurt gap + duration, met gap uit hash01
function randomRuleState(rule, since, scale) {
  const { min, max } = rule.randomEvery, dur = rule.duration * scale;
  let t = 0, slot = 0;
  for (; slot < 200; slot++) {
    const gap = (min + (max - min) * hash01(slot + 31337)) * scale;
    if (t + gap + dur > since) {
      // we zitten in dit slot: vóór of tijdens de bui
      if (since >= t + gap) return { since: since - t - gap, left: t + gap + dur - since, warn: false };
      return { since: null, left: t + gap - since, warn: since >= t + gap - TRACK_ERASER.warnSeconds * scale };
    }
    t += gap + dur;
  }
  return null;
}

// Alles wat nu geldt: zichtstraal (de kleinste), sporenwisser, onderduiken, vlaggen, de
// storm voor in beeld ({label, active, warn, secs}) en de regels die nu actief zijn.
export function weatherAt(rules, round, tGame, tRound, scale = 1) {
  const out = { visibility: null, eraser: false, burial: false, drift: 0, driftRate: 0, driftGround: null, rain: 0, lightning: 0, flags: {}, storm: null, active: [] };
  let drift = null, stormSeconds = 0;
  for (const rule of rules?.weather || []) {
    const st = ruleState(rule, round, tGame, tRound, scale);
    if ((rule.every || rule.randomEvery) && st && (st.since !== null || st.warn)) {
      const s = { label: rule.label, active: st.since !== null, warn: st.warn, secs: Math.ceil(st.left) };
      if (!out.storm || (s.active && !out.storm.active)) out.storm = s;
    }
    if (!st || st.since === null) continue;
    out.active.push(rule);
    const e = rule.effect || {};
    let vis = e.visibility;
    if (typeof vis === 'object' && vis) {
      if (vis.pulse) {
        const p = vis.pulse, cycle = (p.thickSeconds + p.clearSeconds) * scale;
        const t = st.since % cycle;
        vis = t < p.thickSeconds * scale
          ? p.thick + (p.clear - p.thick) * (t / (p.thickSeconds * scale))
          : p.clear;
      } else {
        vis = vis.start + (vis.end - vis.start) * Math.min(1, st.since / (vis.overSeconds * scale));
      }
    }
    if (vis !== undefined) out.visibility = out.visibility === null ? vis : Math.min(out.visibility, vis);
    if (e.trackEraser) out.eraser = e.trackEraser === true ? true : e.trackEraser;
    if (e.burial) { out.burial = true; stormSeconds = rule.duration || 0; }
    if (e.drift) { drift = e.drift; out.drift = Math.max(out.drift, driftAt(e.drift, st.since, scale)); }
    if (e.rain) out.rain = Math.max(out.rain, driftAt(e.rain, st.since, scale));
    if (e.lightning) out.lightning = Math.max(out.lightning, lightningAt(e.lightning, st.since, scale));
    for (const [k, v] of Object.entries(e)) if (!OWN.has(k)) out.flags[k] = v;
    if (typeof e.visibility === 'object') out.flags.fogProgress = Math.min(1, st.since / (e.visibility.overSeconds * scale));
  }
  if (drift) Object.assign(out, driftRate(drift, out.drift, out.burial && stormSeconds));
  return out;
}
const OWN = new Set(['visibility', 'trackEraser', 'burial', 'terrain', 'drift', 'rain', 'lightning']);

// Hoeveel van een vol spoor (1,0) de verstuiving per seconde toedekt. Tussen min en max van de
// kaart loopt het van lightSeconds naar heavySeconds tot dicht; de storm (stormSeconds lang) dekt
// stormCover van een vers spoor toe en is voor het beeld sterkte 1.
export function driftRate(cfg, s, stormSeconds) {
  const D = TRACK_ERASER.drift, ground = cfg.ground || null;
  if (stormSeconds) return { drift: 1, driftRate: D.stormCover / stormSeconds, driftGround: ground };
  const k = cfg.max > cfg.min ? Math.min(1, Math.max(0, (s - cfg.min) / (cfg.max - cfg.min))) : 1;
  return { driftRate: 1 / D.lightSeconds + (1 / D.heavySeconds - 1 / D.lightSeconds) * k, driftGround: ground };
}

// Vanuit ticks: game0 = tick waarop het spel begon, round0 = tick waarop de ronde begon
export function weatherAtTick(rules, round, tick, game0, round0, scale = 1) {
  return weatherAt(rules, round, (tick - game0) / TICK_RATE, (tick - round0) / TICK_RATE, scale);
}

// Terreinveranderingen die bij het begin van deze ronde ingaan: regels met een effect.terrain
// die in deze ronde beginnen, of (met everyRound) elke ronde vanaf from.round t/m untilRound
// opnieuw, met stage = hoeveelste keer. Geeft [{change, stage}].
export function terrainChangesAt(rules, round) {
  return (rules?.weather || []).filter((r) => {
    if (!r.effect?.terrain || !r.from?.round) return false;
    if (r.everyRound) return round >= r.from.round && (!r.untilRound || round <= r.untilRound);
    return r.from.round === round;
  }).map((r) => ({ change: r.effect.terrain, stage: round - r.from.round + 1 }));
}
