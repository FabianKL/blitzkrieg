// Gedeelde spellogica: deze code draait identiek op de server én in de browser.
// Daardoor rekenen beide precies hetzelfde (graven, kogels, kraters) en hoeft de
// kaart nooit per frame over het netwerk.
// Dit is de ingang (import * as G): hij geeft alles door uit world.js (maten, celtypes, tankvorm),
// terrain.js (wat de kaart verandert), movement.js (rijden, kogels), codec.js (kaart over de lijn)
// en mapgen.js (kaart maken). Hier zelf: rondes en score, en het uiterlijk van de ploegen.
import { GAME, TOUCH } from './config.js';
import { DIRS } from './world.js';

export { MAPS, VEGETATION, ICE, GAME, NET, REFILL, T, MAP_SIZES, DEFAULT_SIZE, VISION, MAP_MENU, DEFAULT_MAP, TOUCH } from './config.js';
export * from './world.js';
export * from './terrain.js';
export * from './movement.js';
export * from './codec.js';
export { generateMap } from './mapgen.js';

// Uiterlijk van de 4 tanks op een kaart (§4): ploeg A en B uit de config, C en D als variant.
// Alleen het uiterlijk; alle tanks rijden, schieten en incasseren precies hetzelfde.
export function teamsFor(rules) {
  const t = rules?.tanks;
  if (!t) return null;
  const variant = (spec) => ({ ...spec, name: `${spec.name} II`, variant: true, number: spec.number && String(Number(spec.number) + 100) });
  return [t.A, t.B, variant(t.A), variant(t.B)];
}

// ---------- Spel en rondes (§2) ----------
// Telwijze: bij hoogstens 2 spelers gewonnen rondes, daarboven kills
export const scoreMode = (players) => (players <= 2 ? 'rounds' : 'kills');
// Score die iedereen ziet, volgens de telwijze van nu
export const score = (t, players) => (scoreMode(players) === 'rounds' ? t.rounds : t.kills);

// Wie wint de ronde die net eindigt? players = [{id, alive}]. Alleen bij precies 2 spelers:
// wie als enige nog leeft. Tegelijk dood, of meer spelers (dan tellen kills): niemand (-1).
export function roundWinner(players) {
  if (players.length !== 2) return -1;
  const alive = players.filter((t) => t.alive);
  return alive.length === 1 ? alive[0].id : -1;
}

// Heeft iemand het spel gewonnen? players = [{id, rounds, kills}]. Geeft id of -1.
export function gameWinner(players, cfg = GAME) {
  const mode = scoreMode(players.length);
  const best = players.find((t) => (mode === 'rounds' ? t.rounds >= cfg.roundsToWin : t.kills >= cfg.killsToWin));
  return best ? best.id : -1;
}

// Joystick: verschuiving van de duim (x, y; y omlaag) als fractie van de stickstraal → een van
// de 8 richtingen als [dx, dy], of [0, 0] binnen de dode zone. Elke richting krijgt 45°.
export function stickDirection(x, y) {
  if (Math.hypot(x, y) < TOUCH.deadZone) return [0, 0];
  const sector = (Math.round(Math.atan2(x, -y) / (Math.PI / 4)) + 8) % 8;
  return DIRS[sector].slice();
}
