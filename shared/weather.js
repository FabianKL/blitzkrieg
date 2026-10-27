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
//             game.js applyTerrainChange); en vrije vlaggen voor de kaart (fog, drops, fires, ...)
// scale: alle seconden keer scale (de tests draaien met een snelle klok).
import { TICK_RATE } from './world.js';
import { TRACK_ERASER } from './config.js';

// Is de regel in deze ronde en op dit moment van kracht? Geeft null of {since, left, warn}:
// since = seconden sinds hij (deze keer) inging, left = seconden tot hij stopt (Infinity),
// warn = hij begint binnen TRACK_ERASER.warnSeconds (alleen terugkerende regels).
export function ruleState(rule, round, tGame, tRound, scale = 1) {
  if (rule.untilRound && round > rule.untilRound) return null;
  const f = rule.from || {};
  if (f.round && round < f.round) return null;
  let since;
  if (f.secondsInRound !== undefined) since = tRound - f.secondsInRound * scale;
  else if (f.secondsInGame !== undefined) since = tGame - f.secondsInGame * scale;
  else since = f.round ? tRound : tGame;
  if (since < 0) return null;
  if (!rule.every) return { since, left: Infinity, warn: false };
  const every = rule.every * scale, dur = rule.duration * scale, p = since % every, start = every - dur;
  if (p >= start) return { since: p - start, left: every - p, warn: false };
  return { since: null, left: start - p, warn: p >= start - TRACK_ERASER.warnSeconds * scale };
}

// Alles wat nu geldt: zichtstraal (de kleinste), sporenwisser, onderduiken, vlaggen, de
// storm voor in beeld ({label, active, warn, secs}) en de regels die nu actief zijn.
export function weatherAt(rules, round, tGame, tRound, scale = 1) {
  const out = { visibility: null, eraser: false, burial: false, flags: {}, storm: null, active: [] };
  for (const rule of rules?.weather || []) {
    const st = ruleState(rule, round, tGame, tRound, scale);
    if (rule.every && st && (st.since !== null || st.warn)) {
      const s = { label: rule.label, active: st.since !== null, warn: st.warn, secs: Math.ceil(st.left) };
      if (!out.storm || (s.active && !out.storm.active)) out.storm = s;
    }
    if (!st || st.since === null) continue;
    out.active.push(rule);
    const e = rule.effect || {};
    let vis = e.visibility;
    if (typeof vis === 'object' && vis) vis = vis.start + (vis.end - vis.start) * Math.min(1, st.since / (vis.overSeconds * scale));
    if (vis !== undefined) out.visibility = out.visibility === null ? vis : Math.min(out.visibility, vis);
    if (e.trackEraser) out.eraser = e.trackEraser === true ? true : e.trackEraser;
    if (e.burial) out.burial = true;
    for (const [k, v] of Object.entries(e)) if (!['visibility', 'trackEraser', 'burial', 'terrain'].includes(k)) out.flags[k] = v;
    if (typeof e.visibility === 'object') out.flags.fogProgress = Math.min(1, st.since / (e.visibility.overSeconds * scale));
  }
  return out;
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
