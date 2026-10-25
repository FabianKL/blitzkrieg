// De spelpagina (/): verbinding, titelregel, mapmenu en kaartgrootte (§3).
// De weergave van de kaart (zomer, winter, woestijn) draait in een iframe en gebruikt deze
// verbinding via window.blitz; wisselt de host naar een kaart met een andere weergave, dan
// wordt alleen het iframe vervangen en blijft iedereen verbonden.
import * as G from '/shared/game.js';
import { connect } from '/net.js';

const $ = (id) => document.getElementById(id);
const STYLE_PAGES = { zomer: '/1944.html', winter: '/1943.html', woestijn: '/1942.html' };
const PHASES = { lobby: 'wachtkamer', play: 'spel bezig', pause: 'tussen twee rondes', over: 'spel uit' };

// Berichten gaan door naar de weergave die nu in het iframe staat
let viewHooks = {};
const game = connect({
  onMap: (map) => { viewHooks.onMap?.(map); showView(); update(); },
  onDig: (x, y) => viewHooks.onDig?.(x, y),
  onEvent: (e) => { viewHooks.onEvent?.(e); update(); },
  onStatus: (s) => { viewHooks.onStatus?.(s); update(); },
}, { room: 'blitzkrieg' });
window.blitz = { game, setHooks: (h) => { viewHooks = h; } };

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

// ---------- Weergave ----------
let page = '';
function showView() {
  const style = game.rules?.style || 'zomer';
  if (STYLE_PAGES[style] === page) return;
  page = STYLE_PAGES[style];
  viewHooks = {}; // de oude weergave verdwijnt; de nieuwe meldt zich aan als hij geladen is
  $('view').src = page;
}

// ---------- Titel en status ----------
function update() {
  if (!game.mapId) return;
  const rules = game.rules || {}, players = game.tanks.size;
  const isHost = game.me === game.host, inLobby = game.lobby && game.game.phase === 'lobby';
  const header = `— ${rules.header || rules.name || ''}`;
  if ($('header').textContent !== header) { $('header').textContent = header; document.title = `BLITZKRIEG ${header}`; }
  if ($('map').value !== game.mapId) $('map').value = game.mapId;
  if ($('size').value !== game.size) $('size').value = game.size;
  // alleen de host kiest (ook tijdens een spel: dan begint er meteen een nieuw spel op die kaart);
  // klein kan niet met te veel spelers
  $('map').disabled = $('size').disabled = !isHost;
  for (const opt of $('size').options) opt.disabled = G.MAP_SIZES[opt.value].maxPlayers < players && opt.value !== game.size;
  $('start').hidden = !(isHost && inLobby);
  const host = game.host < 0 ? '—' : game.host === game.me ? 'jij' : `speler ${game.host + 1}`;
  if (game.message && game.tick < game.message.until) { $('info').textContent = game.message.text; return; }
  $('info').innerHTML = `${PHASES[game.game.phase] || ''} · ronde <b>${game.game.round}</b> · spelers <b>${players}/${G.MAP_SIZES[game.size]?.maxPlayers ?? G.MAX_PLAYERS}</b> · host <b>${host}</b>`;
}
setInterval(update, 500); // spelers die in- en uitstappen
