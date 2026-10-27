// Browserkant van de verbinding: websocket, toetsenbord, touch en klok.
// Alle spellogica (berichten verwerken, voorspellen, posities) zit in shared/client-sim.js,
// zodat de tests precies dezelfde code gebruiken.
import * as Sim from '/shared/client-sim.js';

// room: welk potje = welke kaart uit config.js; size: kaartgrootte (alleen als het potje leeg is)
export function connect(hooks = {}, { room = 'carentan', size } = {}) {
  const state = Sim.createState();
  state.bytes = 0; // ontvangen bytes, de weergave mag dit resetten
  state.status = 'connecting'; // connecting | playing | full | closed | left
  const setStatus = (s) => { state.status = s; hooks.onStatus?.(s); };

  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?room=${encodeURIComponent(room)}${size ? `&size=${encodeURIComponent(size)}` : ''}`);
  ws.onmessage = (ev) => {
    state.bytes += ev.data.length;
    const msg = JSON.parse(ev.data);
    const now = performance.now();
    if (msg.t === 'init') { Sim.applyInit(state, msg, hooks, now); setStatus('playing'); }
    else if (msg.t === 's') Sim.applyState(state, msg, hooks, now);
    else if (msg.t === 'full') setStatus('full');
  };
  ws.onclose = () => { if (state.status !== 'full' && state.status !== 'left') setStatus('closed'); };

  // ---------- Input: alleen versturen als er iets verandert ----------
  const KEYS = {
    ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'f',
  };
  const held = new Set();
  // Touch (public/touch.js) is een tweede bron met dezelfde letters; blur wist alleen het
  // toetsenbord, want duimen op het scherm blijven liggen als de focus wisselt
  const touchHeld = new Set();
  const has = (k) => held.has(k) || touchHeld.has(k);
  let lastInput = '';
  function sendInput() {
    const dx = (has('r') ? 1 : 0) - (has('l') ? 1 : 0);
    const dy = (has('d') ? 1 : 0) - (has('u') ? 1 : 0);
    const f = has('f') ? 1 : 0;
    const key = `${dx},${dy},${f}`;
    if (key === lastInput || ws.readyState !== 1) return;
    lastInput = key;
    // eigen tank reageert meteen (voorspelling); het volgnummer gaat mee voor de bevestiging
    Sim.advancePrediction(state, performance.now());
    const q = Sim.setInput(state, dx, dy, f);
    ws.send(JSON.stringify({ t: 'in', dx, dy, f, q }));
  }
  // Toets in of uit; ook aangeroepen vanuit een ingebedde weergave (iframe) die de focus heeft
  state.key = (e) => {
    if (e.type === 'blur') { held.clear(); sendInput(); return; }
    // K: zelfvernietiging (niet bij ingedrukt houden herhalen)
    if (e.code === 'KeyK') { e.preventDefault(); if (e.type === 'keydown' && !e.repeat) state.selfDestruct(); return; }
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.type === 'keydown') held.add(k); else held.delete(k);
    sendInput();
  };
  for (const type of ['keydown', 'keyup', 'blur']) addEventListener(type, state.key);
  state.selfDestruct = () => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'sd' })); };
  // Joystick en vuurknop: dx, dy in {-1, 0, 1}, f 0 of 1
  state.touch = (dx, dy, f) => {
    touchHeld.clear();
    if (dx) touchHeld.add(dx > 0 ? 'r' : 'l');
    if (dy) touchHeld.add(dy > 0 ? 'd' : 'u');
    if (f) touchHeld.add('f');
    sendInput();
  };

  // Andere berichten naar de server (wachtkamer: kaart kiezen, starten)
  state.send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  // zelf weggaan (STOP als gast): de server haalt je tank weg, de rest speelt door
  state.leave = () => { setStatus('left'); ws.close(); };

  return state;
}

