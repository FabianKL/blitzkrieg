// De spelpagina (/): verbinding, titelregel, mapmenu en kaartgrootte (§3), en de weergave van de
// kaart. De stijl van de kaart (zomer, winter, woestijn) is een tekenmodule in styles/; wisselt
// de host naar een kaart met een andere stijl, dan wordt alleen de weergave vervangen en blijft
// iedereen verbonden.
import * as G from '/shared/game.js';
import { connect } from '/net.js';
import { touchControls } from '/touch.js';

const $ = (id) => document.getElementById(id);

// Berichten gaan door naar de weergave die er nu staat (view.hooks)
let view = null;
const game = connect({
  onMap: (map) => { if (!showView()) view?.hooks.onMap(map); update(); },
  onDig: (x, y) => view?.hooks.onDig(x, y),
  onEvent: (e) => { view?.hooks.onEvent(e); update(); },
  onStatus: (s) => { view?.hooks.onStatus(s); update(); },
}, { room: 'blitzkrieg' });
game.visionOverlay = true;
window.blitz = { game }; // voor de console en de tests
touchControls($('panel'), game, $('view'));

// ZICHT AAN/UIT: het zichtveld in beeld (mist, schaduw, vervaging). Uit ziet de kaart er helder
// uit; wat je niet kunt zien blijft verborgen. De weergave leest game.visionOverlay elk frame.
// Per browser onthouden (later naar een instellingenmenu).
const VISION_KEY = 'blitzkrieg.zicht';
try { game.visionOverlay = localStorage.getItem(VISION_KEY) !== 'uit'; } catch { /* geen opslag: standaard aan */ }
const visionLabel = () => { $('vision').textContent = game.visionOverlay ? 'ZICHT AAN' : 'ZICHT UIT'; };
visionLabel();
$('vision').addEventListener('click', () => {
  $('vision').blur();
  game.visionOverlay = !game.visionOverlay;
  try { localStorage.setItem(VISION_KEY, game.visionOverlay ? 'aan' : 'uit'); } catch { /* niet bewaard */ }
  visionLabel();
});

// ---------- Menu's ----------
for (const m of G.MAP_MENU) {
  const built = Object.hasOwn(G.MAPS, m.id);
  $('map').add(new Option(`${m.year} · ${m.mission} — ${m.name}${built ? '' : ' (komt nog)'}`, m.id, false, false));
  $('map').options[$('map').options.length - 1].disabled = !built;
}
for (const [id, s] of Object.entries(G.MAP_SIZES)) $('size').add(new Option(`${s.label}${s.maxPlayers < G.MAX_PLAYERS ? ` (${s.maxPlayers} spelers)` : ''}`, id));

const sendConfig = () => game.send({ t: 'cfg', map: $('map').value, size: $('size').value });
$('map').addEventListener('change', () => { sendConfig(); $('map').blur(); });
$('size').addEventListener('change', () => { sendConfig(); $('size').blur(); });
$('start').addEventListener('click', () => { game.send({ t: 'start' }); $('start').blur(); });
// STOP: de host stopt het spel (iedereen terug naar de wachtkamer), een gast stapt uit.
// Na het uitstappen wordt dezelfde knop "opnieuw meedoen".
$('stop').addEventListener('click', () => {
  $('stop').blur();
  if (game.status === 'left') location.reload();
  else if (game.me === game.host) game.send({ t: 'stop' });
  else game.leave();
});

// Volledig scherm (tablet/telefoon): de hele spelpagina, op Android ook liggend vastzetten.
// iPhone kent dit niet; daar (en op de iPad) werkt "Zet op beginscherm" via het manifest.
const root = document.documentElement;
const requestFull = root.requestFullscreen || root.webkitRequestFullscreen;
const fullElement = () => document.fullscreenElement || document.webkitFullscreenElement;
$('full').hidden = !requestFull;
$('full').addEventListener('click', async () => {
  $('full').blur();
  if (fullElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  try {
    await requestFull.call(root);
    await screen.orientation?.lock?.('landscape');
  } catch { /* niet toegestaan (bv. desktop of iPad): dan gewoon zonder vastzetten */ }
});
// het opschrift volgt de werkelijke toestand, ook als je met Esc of een gebaar uit volledig scherm gaat
const fullLabel = () => { $('full').querySelector('.label').textContent = fullElement() ? 'SCHERM VERKLEINEN' : 'VOLLEDIG SCHERM'; };
document.addEventListener('fullscreenchange', fullLabel);
document.addEventListener('webkitfullscreenchange', fullLabel);

// ---------- Weergave ----------
// Andere stijl dan nu: oude weergave opruimen, nieuw canvas, stijlmodule laden en starten (die
// tekent dan zelf de kaart die er al is). Geeft true als de weergave vervangen wordt.
let style = '';
function showView() {
  const next = game.rules?.style || 'zomer';
  if (next === style) return false;
  style = next;
  view?.destroy();
  view = null;
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  $('game')?.remove(); // het oude canvas (als de renderer het niet al weghaalde)
  $('panel').prepend(canvas);
  document.body.dataset.style = next;
  import(`/styles/${next}.js`).then((mod) => {
    if (style === next) view = mod.default(game); // intussen niet alweer gewisseld
  });
  return true;
}

// ---------- Titel en status ----------
function update() {
  if (game.status === 'left') { $('stop').textContent = 'OPNIEUW MEEDOEN'; $('stop').hidden = false; $('choose').hidden = true; return; }
  if (!game.mapId) return;
  const rules = game.rules || {}, players = game.tanks.size;
  const isHost = game.me === game.host, inLobby = game.lobby && game.game.phase === 'lobby';
  // alleen de host kiest, en alleen in de wachtkamer; de rest (en de host tijdens het spel) ziet de titel
  const choosing = isHost && inLobby;
  const size = inLobby ? ` · ${G.MAP_SIZES[game.size]?.label.toLowerCase() ?? game.size}` : '';
  const header = `— ${rules.header || rules.name || ''}`;
  if ($('header').textContent !== header + size) { $('header').textContent = header + size; document.title = `BLITZKRIEG ${header}`; }
  $('header').hidden = choosing;
  $('choose').hidden = !choosing;
  $('stop').hidden = !game.lobby || inLobby || game.status !== 'playing';
  if ($('map').value !== game.mapId) $('map').value = game.mapId;
  if ($('size').value !== game.size) $('size').value = game.size;
  // klein kan niet met te veel spelers
  for (const opt of $('size').options) opt.disabled = G.MAP_SIZES[opt.value].maxPlayers < players && opt.value !== game.size;
  if (game.message && game.tick < game.message.until) { $('info').textContent = game.message.text; return; }
  $('info').textContent = '';
}
setInterval(update, 500); // spelers die in- en uitstappen
