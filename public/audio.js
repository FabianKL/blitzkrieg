// Geluidseffecten met Tone.js: audiograaf, pooling, ruimtelijk geluid, synthese en ambiënt.
// shell.js roept init(), onEvent(e, game) en update(game, dt) aan; world-view.js geeft
// weerstanden door via setWeather(). Alle getallen in SOUND (shared/config.js).
// Tone.js wordt als UMD-script geladen in index.html en is beschikbaar als globalThis.Tone.
const Tone = globalThis.Tone;
import { SOUND, HINTS, T, HUD, TANK, FORCED_STORM } from '/shared/config.js';
import { hearingCells } from '/shared/vision.js';

let ready = false;    // Tone.start() is gelukt
let started = false;  // init() is aangeroepen
let disposed = false; // destroy() is aangeroepen

// --- Audiograaf ---
let masterGain, compressor;
let sfxBus, ambientBus, synthBus;
let sfxReverb;

// --- Pools ---
const cannonPool = [];
const impactPool = [];

// --- Synthese ---
let motorSynth, motorNoise, motorFilter, motorGain;
let trackNoise, trackFilter, trackGain;
let hintSynth, hintPanner;
let uiSynth;
let warnOsc, warnGain;

// --- Ambiënt ---
let rainNoise, rainFilter, rainGain;
let windNoise, windFilter, windGain;
let thunderSynth, thunderGain;

// --- Toestand ---
let motorRunning = false;
let lastWarnTime = 0;
let currentStyle = 'zomer';

// Weertoestand (gezet door world-view.js via setWeather)
let wxState = { rain: 0, drift: 0, storm: 0, lightning: false };

// Ruimtelijke berekening: pan en volume naar afstand en hoek
function spatial(me, x, y) {
  if (!me) return null;
  const dx = x - me.x, dy = y - me.y;
  const dist = Math.hypot(dx, dy);
  const range = hearingCells();
  if (dist > range) return null;
  const angle = Math.atan2(dx, -dy); // 0 = boven
  const pan = Math.sin(angle);
  const k = dist / range;
  const vol = lerp(0, -40, k);
  const filter = lerp(SOUND.filterRange[0], SOUND.filterRange[1], k);
  return { pan, vol, filter, dist };
}

function lerp(a, b, k) { return a + (b - a) * Math.min(1, Math.max(0, k)); }
function dbToGain(db) { return Math.pow(10, db / 20); }

// --- Pool: een set Tone.Synth's die roterend worden gebruikt ---
function createSynthPool(bus, count, makeSynth) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const panner = new Tone.Panner(0).connect(bus);
    const filter = new Tone.Filter(8000, 'lowpass').connect(panner);
    const synth = makeSynth().connect(filter);
    pool.push({ synth, panner, filter, busy: 0 });
  }
  pool._idx = 0;
  return pool;
}

function poolPlay(pool, { pan = 0, vol = 0, filter = 8000, note, duration, velocity = 0.8 }) {
  if (!ready || disposed) return;
  let slot = null;
  for (let i = 0; i < pool.length; i++) {
    const j = (pool._idx + i) % pool.length;
    if (Tone.now() > pool[j].busy) { slot = pool[j]; pool._idx = (j + 1) % pool.length; break; }
  }
  if (!slot) { slot = pool[pool._idx]; pool._idx = (pool._idx + 1) % pool.length; }
  slot.panner.pan.value = pan;
  slot.synth.volume.value = vol;
  slot.filter.frequency.value = filter;
  slot.synth.triggerAttackRelease(note || 60, duration || 0.15, undefined, velocity);
  slot.busy = Tone.now() + (duration || 0.15);
}

// --- Initialisatie ---
export function init() {
  if (started) return;
  started = true;

  // Masterketen
  compressor = new Tone.Compressor(-12, 4).toDestination();
  masterGain = new Tone.Gain(dbToGain(SOUND.masterVol)).connect(compressor);

  // Bussen
  sfxReverb = new Tone.Reverb(SOUND.reverbDecay).connect(masterGain);
  sfxReverb.wet.value = 0.2;
  sfxBus = new Tone.Gain(dbToGain(SOUND.sfxVol)).connect(sfxReverb);
  ambientBus = new Tone.Gain(dbToGain(SOUND.ambientVol)).connect(masterGain);
  synthBus = new Tone.Gain(dbToGain(SOUND.synthVol)).connect(masterGain);

  // --- Kanonschot-pool (synthese als placeholder) ---
  for (let i = 0; i < SOUND.pools.cannon; i++) {
    const panner = new Tone.Panner(0).connect(sfxBus);
    const filter = new Tone.Filter(8000, 'lowpass').connect(panner);
    const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.15, sustain: 0, release: 0.3 }).connect(filter);
    const noise = new Tone.Noise('white').connect(env);
    noise.start();
    const osc = new Tone.Oscillator(80, 'sine').connect(env);
    osc.start();
    cannonPool.push({ env, noise, osc, panner, filter, busy: 0, _vol: new Tone.Gain(1).connect(filter) });
    // herverbind door de gain
    noise.disconnect(); osc.disconnect();
    noise.connect(cannonPool[i]._vol); osc.connect(cannonPool[i]._vol);
    env.disconnect(); cannonPool[i]._vol.disconnect();
    cannonPool[i]._vol.connect(env); env.connect(filter);
  }

  // --- Inslag-pool (synthese) ---
  for (let i = 0; i < SOUND.pools.impact; i++) {
    const panner = new Tone.Panner(0).connect(sfxBus);
    const filter = new Tone.Filter(6000, 'lowpass').connect(panner);
    const synth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
    }).connect(filter);
    impactPool.push({ synth, panner, filter, busy: 0 });
  }

  // --- Motorsynthese ---
  motorGain = new Tone.Gain(0).connect(synthBus);
  motorFilter = new Tone.Filter(SOUND.motor.noiseLPF[0], 'lowpass').connect(motorGain);
  motorSynth = new Tone.FMSynth({
    harmonicity: 2, modulationIndex: 1.5,
    oscillator: { type: 'sine' }, modulation: { type: 'square' },
    envelope: { attack: 0.1, decay: 0.2, sustain: 1, release: 0.5 },
    modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 1, release: 0.5 },
  }).connect(motorFilter);
  motorNoise = new Tone.Noise('brown').connect(motorFilter);
  motorNoise.volume.value = -12;

  // --- Rupsbanden ---
  trackGain = new Tone.Gain(0).connect(synthBus);
  trackFilter = new Tone.Filter(SOUND.tracks.bandpass[0], 'bandpass').connect(trackGain);
  trackNoise = new Tone.Noise('pink').connect(trackFilter);

  // --- Richtingshint-synth ---
  hintPanner = new Tone.Panner(0).connect(synthBus);
  hintSynth = new Tone.FMSynth({
    harmonicity: 3, modulationIndex: 2,
    oscillator: { type: 'sine' }, modulation: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
    modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
    volume: -10,
  }).connect(hintPanner);

  // --- UI-synth (ronde, overwinning, pickup) ---
  uiSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.3 },
    volume: -8,
  }).connect(synthBus);

  // --- Lage-voorraad-piepje ---
  warnGain = new Tone.Gain(0).connect(synthBus);
  warnOsc = new Tone.Oscillator(SOUND.lowWarn.hz, 'square').connect(warnGain);
  warnOsc.volume.value = -20;
  warnOsc.start();

  // --- Ambiënt: regen ---
  rainGain = new Tone.Gain(0).connect(ambientBus);
  rainFilter = new Tone.Filter(4000, 'lowpass').connect(rainGain);
  rainNoise = new Tone.Noise('pink').connect(rainFilter);
  rainNoise.volume.value = -6;

  // --- Ambiënt: wind ---
  windGain = new Tone.Gain(0).connect(ambientBus);
  windFilter = new Tone.Filter(800, 'lowpass').connect(windGain);
  windNoise = new Tone.Noise('brown').connect(windFilter);

  // --- Donder ---
  thunderGain = new Tone.Gain(0).connect(ambientBus);
  thunderSynth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 1.5 },
    volume: -4,
  }).connect(thunderGain);
}

// Web Audio unlock: roep aan bij de eerste gebruikersinteractie
export async function unlock() {
  if (ready) return;
  try {
    await Tone.start();
    ready = true;
    // start de continue ruis-bronnen (volume begint op 0)
    motorNoise?.start();
    trackNoise?.start();
    rainNoise?.start();
    windNoise?.start();
  } catch { /* geen audio-ondersteuning */ }
}

// --- Ruimtelijk: pool-achtig schieten ---
function fireCannon(pool, pan, vol, filterHz) {
  if (!ready || disposed) return;
  let slot = null;
  for (let i = 0; i < pool.length; i++) {
    if (Tone.now() > pool[i].busy) { slot = pool[i]; break; }
  }
  if (!slot) slot = pool[0]; // herstart de oudste
  slot.panner.pan.value = pan;
  slot._vol.gain.value = dbToGain(vol);
  slot.filter.frequency.value = filterHz;
  // variatie in pitch
  const pitch = 70 + Math.random() * 20;
  slot.osc.frequency.value = pitch;
  slot.env.triggerAttackRelease(0.2 + Math.random() * 0.1);
  slot.busy = Tone.now() + 0.4;
}

function fireImpact(pool, pan, vol, filterHz, type) {
  if (!ready || disposed) return;
  let slot = null;
  for (let i = 0; i < pool.length; i++) {
    if (Tone.now() > pool[i].busy) { slot = pool[i]; break; }
  }
  if (!slot) slot = pool[0];
  slot.panner.pan.value = pan;
  slot.synth.volume.value = vol;
  slot.filter.frequency.value = filterHz;
  // type beïnvloedt de envelope
  if (type === 'hard') {
    slot.synth.envelope.decay = 0.06;
    slot.filter.frequency.value = Math.min(filterHz, 3000);
  } else if (type === 'metal') {
    slot.synth.envelope.decay = 0.04;
    slot.filter.frequency.value = Math.min(filterHz, 5000);
  } else {
    slot.synth.envelope.decay = 0.12;
  }
  slot.synth.triggerAttackRelease(0.1);
  slot.busy = Tone.now() + 0.15;
}

// --- Explosie (tank dood, mijn, brug) ---
function playExplosion(pan, vol, filterHz, heavy) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const filter = new Tone.Filter(filterHz, 'lowpass').connect(panner);
  const synth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: heavy ? 1.5 : 0.6, sustain: 0, release: heavy ? 1.5 : 0.5 },
    volume: vol,
  }).connect(filter);
  // lage dreun erbij
  const osc = new Tone.Oscillator(heavy ? 35 : 50, 'sine').connect(filter);
  osc.volume.value = vol - 2;
  const oscEnv = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: heavy ? 1.0 : 0.4, sustain: 0, release: heavy ? 0.8 : 0.3 }).connect(filter);
  osc.disconnect(); osc.connect(oscEnv); oscEnv.connect(filter);
  osc.start();
  synth.triggerAttackRelease(heavy ? 2.5 : 0.8);
  oscEnv.triggerAttackRelease(heavy ? 2.0 : 0.5);
  // opruimen na afloop
  setTimeout(() => { synth.dispose(); osc.stop(); osc.dispose(); oscEnv.dispose(); panner.dispose(); filter.dispose(); }, heavy ? 4000 : 2000);
}

// --- Vegetatie breken ---
function playFell(pan, vol, filterHz) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const synth = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 },
    volume: vol - 8,
  }).connect(panner);
  const filter = new Tone.Filter(Math.min(filterHz, 2500), 'lowpass').connect(panner);
  synth.disconnect(); synth.connect(filter); filter.connect(panner);
  synth.triggerAttackRelease(0.25);
  setTimeout(() => { synth.dispose(); panner.dispose(); filter.dispose(); }, 1000);
}

// --- IJs ---
function playIceCrack(pan, vol) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const synth = new Tone.MetalSynth({
    frequency: 200, envelope: { attack: 0.001, decay: 0.2, release: 0.1 },
    harmonicity: 5.1, modulationIndex: 16, resonance: 2000, octaves: 0.5, volume: vol - 4,
  }).connect(panner);
  synth.triggerAttackRelease(0.15);
  setTimeout(() => { synth.dispose(); panner.dispose(); }, 800);
}

function playIceBreak(pan, vol) {
  if (!ready || disposed) return;
  playExplosion(pan, vol - 6, 3000, false);
  playIceCrack(pan, vol + 2);
}

// --- Gebouw ---
function playBuildingHit(pan, vol) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const synth = new Tone.NoiseSynth({
    noise: { type: 'brown' },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.3 },
    volume: vol - 4,
  }).connect(panner);
  synth.triggerAttackRelease(0.3);
  setTimeout(() => { synth.dispose(); panner.dispose(); }, 1200);
}

function playBuildingCollapse(pan, vol) {
  if (!ready || disposed) return;
  playExplosion(pan, vol - 2, 2000, true);
}

// --- Brug-explosie ---
function playBridgeExplosion(pan, vol) {
  if (!ready || disposed) return;
  playExplosion(pan, vol, 6000, true);
}


// --- Vliegtuig ---
function playPlane(pan, vol) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const filter = new Tone.Filter(600, 'lowpass').connect(panner);
  const noise = new Tone.Noise('brown').connect(filter);
  noise.volume.value = vol - 6;
  const osc = new Tone.Oscillator(80, 'sawtooth').connect(filter);
  osc.volume.value = vol - 10;
  noise.start(); osc.start();
  // fade in en uit over 3 seconden
  const gain = new Tone.Gain(0).connect(panner);
  noise.disconnect(); osc.disconnect();
  noise.connect(gain); osc.connect(gain);
  gain.gain.linearRampTo(dbToGain(vol - 4), 1.5, Tone.now());
  gain.gain.linearRampTo(0, 1.5, Tone.now() + 1.5);
  setTimeout(() => { noise.stop(); osc.stop(); noise.dispose(); osc.dispose(); gain.dispose(); panner.dispose(); filter.dispose(); }, 4000);
}

// --- Bom fluiten ---
function playBombWhistle(pan, vol) {
  if (!ready || disposed) return;
  const panner = new Tone.Panner(pan).connect(sfxBus);
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0.3, release: 0.3 },
    volume: vol - 6,
  }).connect(panner);
  const now = Tone.now();
  synth.triggerAttack('C6', now);
  synth.frequency.exponentialRampTo('C3', 1.2, now);
  synth.triggerRelease(now + 1.0);
  setTimeout(() => { synth.dispose(); panner.dispose(); }, 2500);
}

// --- Artillerie-inslag ---
function playArtilleryImpact(pan, vol) {
  if (!ready || disposed) return;
  playExplosion(pan, vol, 4000, true);
}


// --- Donder ---
function playThunder(vol) {
  if (!ready || disposed) return;
  thunderGain.gain.value = dbToGain(vol);
  thunderSynth.triggerAttackRelease(1.5);
}

// --- Pickup ---
function playPickup() {
  if (!ready || disposed) return;
  const now = Tone.now();
  uiSynth.triggerAttackRelease('E5', 0.08, now);
  uiSynth.triggerAttackRelease('A5', 0.08, now + 0.08);
}

// --- Ronde-start ---
function playRoundStart() {
  if (!ready || disposed) return;
  const now = Tone.now();
  uiSynth.triggerAttackRelease('C5', 0.12, now, 0.7);
  uiSynth.triggerAttackRelease('E5', 0.12, now + 0.12, 0.7);
}

// --- Ronde-einde ---
function playRoundEnd() {
  if (!ready || disposed) return;
  const now = Tone.now();
  uiSynth.triggerAttackRelease('E5', 0.12, now, 0.5);
  uiSynth.triggerAttackRelease('C5', 0.15, now + 0.12, 0.5);
}

// --- Game gewonnen ---
function playGameWon() {
  if (!ready || disposed) return;
  const now = Tone.now();
  uiSynth.triggerAttackRelease('C5', 0.1, now, 0.8);
  uiSynth.triggerAttackRelease('E5', 0.1, now + 0.1, 0.8);
  uiSynth.triggerAttackRelease('G5', 0.2, now + 0.2, 0.8);
}

// --- Richtingshint ---
function playHint(pan) {
  if (!ready || disposed) return;
  hintPanner.pan.value = pan;
  hintSynth.triggerAttackRelease('D4', 0.15, undefined, 0.4);
}

// --- Lage-voorraad-piepje ---
function warnBeep() {
  if (!ready || disposed) return;
  const ms = SOUND.lowWarn.ms / 1000;
  warnGain.gain.linearRampTo(0.15, 0.005, Tone.now());
  warnGain.gain.linearRampTo(0, 0.01, Tone.now() + ms);
}

// ============================================================
// Publieke API
// ============================================================

// Verwerk een spelgebeurtenis
export function onEvent(e, game) {
  if (!ready || disposed || !game) return;
  const me = game.tanks.get(game.me);
  const myId = game.me;

  // --- Schot ---
  if (e.t === 'b') {
    if (e.i === myId) {
      fireCannon(cannonPool, 0, 0, 8000);
    } else {
      const s = spatial(me, e.x, e.y);
      if (s) fireCannon(cannonPool, s.pan, s.vol, s.filter);
    }
  }

  // --- Inslag ---
  if (e.t === 'x') {
    const isMine = e.o === myId;
    const s = isMine ? { pan: 0, vol: -6, filter: 6000 } : spatial(me, e.x, e.y);
    if (s) {
      if (e.fell) {
        playFell(s.pan, s.vol, s.filter || 6000);
      } else if (e.building) {
        playBuildingHit(s.pan, s.vol);
      } else if (e.r === 0 && !e.veg) {
        // rots, muur of tankhit: hard/metaal (geen onderscheid in het event)
        fireImpact(impactPool, s.pan, s.vol, s.filter || 6000, 'hard');
      } else {
        fireImpact(impactPool, s.pan, s.vol, s.filter || 6000, 'ground');
      }
    }
  }

  // --- Tank-explosie ---
  if (e.t === 'k') {
    if (e.i === myId) {
      playExplosion(0, 0, 8000, true);
    } else {
      const s = spatial(me, e.x, e.y);
      if (s) playExplosion(s.pan, s.vol, s.filter, true);
      else playExplosion(0, -20, 2000, true); // altijd hoorbaar, maar zacht
    }
  }

  // --- Mijn ---
  if (e.t === 'm') {
    if (e.i === myId) {
      playExplosion(0, 0, 8000, false);
    } else {
      const s = spatial(me, e.x, e.y);
      if (s) playExplosion(s.pan, s.vol, s.filter, false);
    }
  }

  // --- AT-kanon ---
  if (e.t === 'gun') {
    const s = spatial(me, e.x, e.y);
    if (s) fireCannon(cannonPool, s.pan, s.vol - 2, Math.min(s.filter, 5000));
  }

  // --- Brug ---
  if (e.t === 'bridge' && e.blown) {
    const s = spatial(me, e.x, e.y);
    if (s) playBridgeExplosion(s.pan, s.vol);
    else playBridgeExplosion(0, -15);
  }

  // --- IJs ---
  if (e.t === 'c') {
    const t = game.tanks.get(e.i);
    if (t) {
      const s = e.i === myId ? { pan: 0, vol: -4 } : spatial(me, t.x, t.y);
      if (s) playIceCrack(s.pan, s.vol);
    }
  }
  if (e.t === 'w') {
    const s = spatial(me, e.x ?? me?.x ?? 0, e.y ?? me?.y ?? 0);
    if (s) playIceBreak(s.pan, s.vol);
    else playIceBreak(0, -10);
  }

  // --- Gebouw instorten ---
  if (e.t === 'fb' && e.fell) {
    const s = spatial(me, e.x, e.y);
    if (s) playBuildingHit(s.pan, s.vol);
  }
  if (e.t === 'fc') {
    const cx = ((e.box?.[0] ?? 0) + (e.box?.[2] ?? 0)) / 2;
    const cy = ((e.box?.[1] ?? 0) + (e.box?.[3] ?? 0)) / 2;
    const s = spatial(me, cx, cy);
    if (s) playBuildingCollapse(s.pan, s.vol);
  }

  // --- Bommen ---
  if (e.t === 'z' && e.kind === 'bomb') {
    if (e.impacts) {
      for (const imp of e.impacts) {
        const s = spatial(me, imp.x ?? imp[0] ?? 0, imp.y ?? imp[1] ?? 0);
        if (s) setTimeout(() => playBombWhistle(s.pan, s.vol), Math.random() * 500);
      }
    }
  }
  if (e.t === 'zi') {
    const s = spatial(me, e.x, e.y);
    if (s) playArtilleryImpact(s.pan, s.vol);
    else playArtilleryImpact(0, -15);
  }
  if (e.t === 'zb') {
    if (e.craters) {
      for (const c of e.craters) {
        const cx = c[0] ?? c.x, cy = c[1] ?? c.y;
        const s = spatial(me, cx, cy);
        if (s) playArtilleryImpact(s.pan, s.vol);
      }
    }
  }

  // --- Vliegtuig (airdrop) ---
  if (e.t === 'drop') {
    const c = e.c;
    if (c) {
      const s = spatial(me, c.x ?? c[0] ?? 0, c.y ?? c[1] ?? 0);
      if (s) playPlane(s.pan, s.vol);
    }
  }

  // --- Pickup ---
  if (e.t === 'dropu' || e.t === 'depu') {
    if (e.i === myId) playPickup();
  }

  // --- Ronde ---
  if (e.t === 'n') playRoundStart();
  if (e.t === 'r') playRoundEnd();
  if (e.t === 'g') playGameWon();

  // --- Donder (bliksem-bolt via weather) ---
  if (e.t === 'hint' && e.kind === 'light') {
    // zoeklicht-hint, geen geluid
  }

  // --- Richtingshint (via world-view.js: hintFor roept onHint aan) ---
}

// Richtingshint vanuit world-view.js (aparte aanroep, niet via onEvent)
export function onHint(direction) {
  if (!ready || disposed) return;
  const pan = Math.sin(direction * Math.PI / 4);
  playHint(pan);
}

// Weertoestand bijwerken (aangeroepen door world-view.js)
export function setWeather({ rain = 0, drift = 0, storm = 0, lightning = false } = {}) {
  wxState = { rain, drift, storm, lightning };
}

// Elk frame: motor, rupsbanden, ambiënt en waarschuwingen bijwerken
export function update(game, dt) {
  if (!ready || disposed || !game) return;
  const me = game.tanks.get(game.me);
  const phase = game.game?.phase;
  const playing = phase === 'play' || phase === 'roundEnd';

  // --- Motor en rupsbanden ---
  if (me && me.a && playing) {
    const inp = game.input || {};
    const moving = (inp.dx !== 0 || inp.dy !== 0) ? 1 : 0;
    const speedPct = (game.speedPct ?? 100) / 100;
    const targetFreq = lerp(SOUND.motor.idleHz, SOUND.motor.fullHz, moving) * speedPct;
    const targetFilter = lerp(SOUND.motor.noiseLPF[0], SOUND.motor.noiseLPF[1], moving);
    const targetVol = lerp(0.15, 0.4, moving);

    if (!motorRunning) {
      motorRunning = true;
      motorSynth.triggerAttack(targetFreq);
    }
    // geleidelijke verandering
    motorSynth.frequency.linearRampTo(targetFreq, 0.1, Tone.now());
    motorFilter.frequency.linearRampTo(targetFilter, 0.1, Tone.now());
    motorGain.gain.linearRampTo(targetVol, 0.1, Tone.now());

    // rupsbanden: volume en filter naar snelheid
    const trackVol = moving ? lerp(0, 0.2, moving) : 0;
    const trackFilt = lerp(SOUND.tracks.bandpass[0], SOUND.tracks.bandpass[1], moving);
    trackGain.gain.linearRampTo(trackVol, 0.15, Tone.now());
    trackFilter.frequency.linearRampTo(trackFilt, 0.15, Tone.now());
  } else {
    if (motorRunning) {
      motorRunning = false;
      motorSynth.triggerRelease();
      motorGain.gain.linearRampTo(0, 0.3, Tone.now());
      trackGain.gain.linearRampTo(0, 0.3, Tone.now());
    }
  }

  // --- Lage-voorraad-waarschuwing ---
  if (me && me.a && playing) {
    const now = performance.now() / 1000;
    const low = HUD.low;
    const fuelLow = me.fuel / TANK.fuelMax < low.fuel;
    const ammoLow = me.ammo / TANK.ammoMax < low.ammo;
    const armorLow = me.shield / TANK.shieldMax < low.armour;
    if ((fuelLow || ammoLow || armorLow) && now - lastWarnTime > SOUND.lowWarn.intervalSeconds) {
      lastWarnTime = now;
      warnBeep();
    }
  }

  // --- Ambiënt: regen ---
  const targetRain = wxState.rain;
  const rStep = dt / SOUND.fadeSeconds;
  const curRain = rainGain.gain.value;
  const nextRain = curRain + Math.max(-rStep, Math.min(rStep, targetRain * 0.5 - curRain));
  rainGain.gain.linearRampTo(Math.max(0, nextRain), 0.1, Tone.now());
  rainFilter.frequency.linearRampTo(lerp(2000, 6000, targetRain), 0.3, Tone.now());

  // --- Ambiënt: wind ---
  const targetWind = Math.max(wxState.drift, wxState.storm * 0.8);
  const wStep = dt / SOUND.fadeSeconds;
  const curWind = windGain.gain.value;
  const nextWind = curWind + Math.max(-wStep, Math.min(wStep, targetWind * 0.4 - curWind));
  windGain.gain.linearRampTo(Math.max(0, nextWind), 0.1, Tone.now());
  windFilter.frequency.linearRampTo(lerp(400, 1500, targetWind), 0.3, Tone.now());

  // --- Donder bij bliksem ---
  if (wxState.lightning) {
    playThunder(-4);
    wxState.lightning = false;
  }
}

// Stijl veranderd (andere kaart)
export function setStyle(s) { currentStyle = s; }

// Alles opruimen
export function destroy() {
  if (disposed) return;
  disposed = true;
  ready = false;
  motorRunning = false;
  // Tone.js kan niet helemaal opgeschoond worden, maar we stoppen alles
  try {
    motorSynth?.triggerRelease();
    motorNoise?.stop();
    trackNoise?.stop();
    rainNoise?.stop();
    windNoise?.stop();
    warnOsc?.stop();
  } catch { /* al opgeruimd */ }
}
