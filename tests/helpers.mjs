// Hulpjes voor de tests: een server starten, bots verbinden met exact dezelfde
// clientlogica als de browser (shared/client-sim.js), en een eenvoudige padzoeker.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';
import * as G from '../shared/game.js';
import * as Sim from '../shared/client-sim.js';

export { G, Sim };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TestFailure extends Error {}
export function check(ok, message) {
  if (!ok) throw new TestFailure(message);
}

// Start de server als los proces en wacht tot hij luistert
export function startServer(port, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`server start niet:\n${out}`)), 10000);
    const onData = (d) => {
      out += d;
      if (out.includes('server draait')) { clearTimeout(timer); resolve(proc); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGTERM' || proc.stopping) return; // netjes gestopt door de runner
      console.error(`\n!! server stopte onverwacht (code ${code}):\n${out.split('\n').slice(-25).join('\n')}`);
      reject(new Error('server stopte'));
    });
  });
}

// Alle bots van de lopende test; de runner sluit ze na elke test (ook als die mislukt)
const openBots = new Set();
export async function closeAllBots() {
  for (const b of openBots) b.ws.close();
  await waitFor(() => [...openBots].every((b) => b.closed), 3000);
  openBots.clear();
}

// Een bot: verbinding + client-sim-state. Telt ook gebeurtenissen voor de tests.
export function connectBot(port, room = 'carentan', wsOptions = {}) {
  const ws = new WebSocket(`ws://localhost:${port}/?room=${room}`, wsOptions);
  const state = Sim.createState();
  const bot = {
    ws, state, events: [], acks: 0, closed: false, closeCode: null,
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    input(dx, dy, f = 0) {
      Sim.advancePrediction(state, performance.now());
      const q = Sim.setInput(state, dx, dy, f);
      this.send({ t: 'in', dx, dy, f, q });
    },
    get me() { return state.tanks.get(state.me); },
    close() { ws.close(); },
  };
  openBots.add(bot);
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    const now = performance.now();
    if (msg.t === 'init') Sim.applyInit(state, msg, {}, now);
    else if (msg.t === 's') {
      Sim.applyState(state, msg, { onEvent: (e) => bot.events.push({ ...e, k: msg.k }) }, now);
      if (msg.y) { bot.acks++; bot.lastAck = msg.y; }
    }
  });
  ws.on('close', (code) => { bot.closed = true; bot.closeCode = code; });
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      const t0 = Date.now();
      const wait = () => (state.map ? resolve(bot) : Date.now() - t0 > 5000 ? reject(new Error('geen init')) : setTimeout(wait, 20));
      wait();
    });
    ws.on('error', reject);
  });
}

// Aantal cellen dat verschilt tussen twee kaarten
export function mapDiff(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

// Wacht tot cond() waar is (of de tijd om is); geeft cond() terug
export async function waitFor(cond, ms, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await sleep(step);
  }
  return cond();
}

// Padzoeker (BFS over cellen waar een 7x7 tank vrij van rots/muur past, 4 richtingen).
// Geeft de eerste stap [dx, dy] richting een cel waarvoor goal(x, y) waar is.
export function nextStep(map, from, goal) {
  const fits = (x, y) => {
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      if (!G.inBounds(x + i, y + j) || G.isSolid(map[(y + j) * G.W + x + i])) return false;
    }
    return true;
  };
  const prev = new Int32Array(G.W * G.H).fill(-1);
  const start = from.y * G.W + from.x;
  prev[start] = start;
  const q = [start];
  let end = -1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], cx = cur % G.W, cy = (cur / G.W) | 0;
    if (goal(cx, cy)) { end = cur; break; }
    for (const [ox, oy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + ox, ny = cy + oy, ni = ny * G.W + nx;
      if (G.inBounds(nx, ny) && prev[ni] === -1 && fits(nx, ny)) { prev[ni] = cur; q.push(ni); }
    }
  }
  if (end < 0 || end === start) return [0, 0];
  let n = end;
  while (prev[n] !== start) n = prev[n];
  return [(n % G.W) - from.x, ((n / G.W) | 0) - from.y];
}
