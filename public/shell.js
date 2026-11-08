// De spelpagina (/): verbinding, titelregel, lobby (kaart kiezen, spelers, instellingen) en de
// weergave van de kaart. De stijl (zomer, winter, woestijn) is een tekenmodule in styles/; wisselt
// de host naar een kaart met een andere stijl, dan wordt alleen de weergave vervangen.
import * as G from '/shared/game.js';
import { connect } from '/net.js';
import { touchControls } from '/touch.js';

const $ = (id) => document.getElementById(id);
const NAME_KEY = 'blitzkrieg.naam';
const savedName = (() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } })();

// Berichten gaan door naar de weergave die er nu staat (view.hooks)
let view = null;
const game = connect({
  onMap: (map) => { if (!showView()) view?.hooks.onMap(map); update(); },
  onDig: (x, y) => view?.hooks.onDig(x, y),
  onEvent: (e) => { view?.hooks.onEvent(e); update(); },
  onStatus: (s) => { view?.hooks.onStatus(s); update(); },
}, { room: 'blitzkrieg', name: savedName });
game.visionOverlay = true;
window.blitz = { game }; // voor de console en de tests
touchControls($('panel'), game, $('view'));

// ZICHT AAN/UIT — knoppen in de balk en in de lobby delen dezelfde toggle
const VISION_KEY = 'blitzkrieg.zicht';
try { game.visionOverlay = localStorage.getItem(VISION_KEY) !== 'uit'; } catch { /* geen opslag */ }
const visionBtns = [$('vision'), $('lobby-vision')].filter(Boolean);
const syncVisionLabels = () => {
  const txt = game.visionOverlay ? 'ZICHT AAN' : 'ZICHT UIT';
  for (const b of visionBtns) b.textContent = txt;
};
syncVisionLabels();
for (const btn of visionBtns) btn.addEventListener('click', () => {
  btn.blur();
  game.visionOverlay = !game.visionOverlay;
  try { localStorage.setItem(VISION_KEY, game.visionOverlay ? 'aan' : 'uit'); } catch {}
  syncVisionLabels();
});

// ---------- Lobby ----------
const STYLE_ICON = { zomer: '☀', winter: '❄', woestijn: '🏜' };
const TEAM_COLORS = ['var(--red)', 'var(--gold)', '#4a8a4a', '#6a6aaa'];

// Kaartlijst (eenmalig)
for (const m of G.MAP_MENU) {
  const built = Object.hasOwn(G.MAPS, m.id);
  const rules = G.MAPS[m.id];
  if (rules?.hidden) continue; // verborgen maps (bijv. Berlijn) niet in de lijst
  const icon = STYLE_ICON[rules?.style] || '☀';
  const item = document.createElement('div');
  item.className = `lobby-map-item${built ? '' : ' off'}`;
  item.dataset.id = m.id;
  item.innerHTML = `<span class="si">${icon}</span><span class="yr">${m.year}</span><span class="mn">${m.name}</span>`;
  if (built) item.addEventListener('click', () => { sendConfig(m.id); });
  $('lobby-map-list').append(item);
}

// Grootte-dropdown
for (const [id, s] of Object.entries(G.MAP_SIZES)) {
  $('lobby-size').add(new Option(`${s.label}${s.maxPlayers < G.MAX_PLAYERS ? ` (${s.maxPlayers} sp.)` : ''}`, id));
}
$('lobby-size').addEventListener('change', () => { sendConfig(); $('lobby-size').blur(); });

// Rondes-dropdown
for (const r of G.ROUND_OPTIONS) {
  $('lobby-rounds').add(new Option(`${r} ronde${r > 1 ? 's' : ''}`, r));
}
$('lobby-rounds').addEventListener('change', () => { sendConfig(); $('lobby-rounds').blur(); });

// Instellingen (eenmalig opbouwen)
for (const [key, def] of Object.entries(G.LOBBY_SETTINGS)) {
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.id = `set-${key}`;
  for (const [val, text] of def.options) select.add(new Option(text, String(val)));
  select.value = String(def.default);
  select.addEventListener('change', () => { sendConfig(); select.blur(); });
  label.textContent = def.label + ' ';
  label.append(select);
  $('lobby-settings').append(label);
}

// Naam
$('lobby-naam').value = savedName;
$('lobby-naam').addEventListener('input', () => {
  const name = $('lobby-naam').value.slice(0, 20);
  try { localStorage.setItem(NAME_KEY, name); } catch {}
  game.send({ t: 'naam', name });
});

// START
$('lobby-start').addEventListener('click', () => { game.send({ t: 'start' }); $('lobby-start').blur(); });

// Config naar de server: kaart, grootte, rondes en instellingen
function sendConfig(mapOverride) {
  const settings = {};
  for (const [key, def] of Object.entries(G.LOBBY_SETTINGS)) {
    const el = document.getElementById(`set-${key}`);
    if (el) settings[key] = Number(el.value);
  }
  game.send({
    t: 'cfg',
    map: mapOverride || game.mapId,
    size: $('lobby-size').value,
    rounds: Number($('lobby-rounds').value),
    settings,
  });
}

// ---------- Oude bar-menu's (bewaard voor compatibiliteit, altijd verborgen) ----------
for (const m of G.MAP_MENU) {
  const built = Object.hasOwn(G.MAPS, m.id);
  $('map').add(new Option(`${m.year} · ${m.mission} — ${m.name}${built ? '' : ' (komt nog)'}`, m.id, false, false));
  $('map').options[$('map').options.length - 1].disabled = !built;
}
for (const [id, s] of Object.entries(G.MAP_SIZES)) $('size').add(new Option(`${s.label}${s.maxPlayers < G.MAX_PLAYERS ? ` (${s.maxPlayers} spelers)` : ''}`, id));
$('map').addEventListener('change', () => { sendConfig($('map').value); $('map').blur(); });
$('size').addEventListener('change', () => { sendConfig(); $('size').blur(); });
$('start').addEventListener('click', () => { game.send({ t: 'start' }); $('start').blur(); });

// STOP
$('stop').addEventListener('click', () => {
  $('stop').blur();
  if (game.status === 'left') location.reload();
  else if (game.me === game.host) game.send({ t: 'stop' });
  else game.leave();
});

// Volledig scherm
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
  } catch {}
});
const fullLabel = () => { $('full').querySelector('.label').textContent = fullElement() ? 'SCHERM VERKLEINEN' : 'VOLLEDIG SCHERM'; };
document.addEventListener('fullscreenchange', fullLabel);
document.addEventListener('webkitfullscreenchange', fullLabel);

// ---------- Weergave ----------
let style = '';
function showView() {
  const next = game.rules?.style || 'zomer';
  if (next === style) return false;
  style = next;
  view?.destroy();
  view = null;
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  $('game')?.remove();
  $('panel').prepend(canvas);
  document.body.dataset.style = next;
  import(`/styles/${next}.js`).then((mod) => {
    if (style === next) view = mod.default(game);
  });
  return true;
}

// ---------- Lobby bijwerken ----------
let lastBriefMap = '';

function updateBriefing() {
  if (game.mapId === lastBriefMap) return;
  lastBriefMap = game.mapId;
  const rules = G.MAPS[game.mapId];
  if (!rules) { $('lobby-brief').innerHTML = ''; return; }
  const desc = rules.desc || {};
  const teams = G.teamsFor(rules);
  const tankA = teams?.[0]?.name || '?';
  const tankB = teams?.[1]?.name || '?';

  let h = `<h2>${rules.header || rules.name || ''}</h2>`;
  if (desc.setting) h += `<div class="desc">${esc(desc.setting)}</div>`;

  h += '<div class="st">TERREIN</div>';
  if (desc.terrain) h += `<div class="sb">${esc(desc.terrain)}</div>`;
  h += '<div class="lobby-chips">';
  for (const cls of Object.values(rules.classes || {})) {
    if (!cls.later) h += `<span class="lobby-chip"><span class="lobby-swatch" style="background:${cls.color}"></span>${esc(cls.label)}</span>`;
  }
  if (rules.rocks?.label) h += `<span class="lobby-chip"><span class="lobby-swatch" style="background:${rules.rocks.color}"></span>${esc(rules.rocks.label)}</span>`;
  if (rules.water?.label) h += `<span class="lobby-chip"><span class="lobby-swatch" style="background:${rules.water.color}"></span>${esc(rules.water.label)}</span>`;
  if (rules.vegetation?.label) h += `<span class="lobby-chip"><span class="lobby-swatch" style="background:${rules.vegetation.color}"></span>${esc(rules.vegetation.label)}</span>`;
  h += '</div>';

  h += '<div class="st">WEER</div>';
  if (desc.weather) h += `<div class="sb">${esc(desc.weather)}</div>`;

  if (desc.special) {
    h += '<div class="st">BIJZONDER</div>';
    h += `<div class="sb">${esc(desc.special)}</div>`;
  }

  h += `<div class="st">TANKS</div><div class="sb">${esc(tankA)} vs ${esc(tankB)}</div>`;
  $('lobby-brief').innerHTML = h;
}

function updatePlayers() {
  const el = $('lobby-players');
  let html = '';
  for (const [id] of game.tanks) {
    const name = game.names.get(id) || `Speler ${id + 1}`;
    const isHost = id === game.host;
    html += `<span class="lobby-player"><span class="lobby-dot" style="background:${TEAM_COLORS[id] || TEAM_COLORS[0]}"></span>${isHost ? '★ ' : ''}${esc(name)}</span>`;
  }
  el.innerHTML = html;
}

function syncLobbyControls(isHost) {
  // actieve kaart markeren
  for (const item of $('lobby-map-list').children) {
    item.classList.toggle('active', item.dataset.id === game.mapId);
  }
  // dropdowns syncen met de server
  if ($('lobby-size').value !== game.size) $('lobby-size').value = game.size;
  if ($('lobby-rounds').value !== String(game.rounds)) $('lobby-rounds').value = String(game.rounds);
  const players = game.tanks.size;
  for (const opt of $('lobby-size').options) opt.disabled = G.MAP_SIZES[opt.value].maxPlayers < players && opt.value !== game.size;
  // instellingen syncen
  for (const [key] of Object.entries(G.LOBBY_SETTINGS)) {
    const el = document.getElementById(`set-${key}`);
    const val = game.settings?.[key];
    if (el && val !== undefined && el.value !== String(val)) el.value = String(val);
  }
  // host-klasse: gasten kunnen niets aanpassen
  $('lobby').classList.toggle('host', isHost);
}

// ---------- Titel en status ----------
function update() {
  if (game.status === 'left') { $('stop').textContent = 'OPNIEUW MEEDOEN'; $('stop').hidden = false; $('choose').hidden = true; return; }
  if (!game.mapId) return;
  const rules = game.rules || {}, players = game.tanks.size;
  const isHost = game.me === game.host;
  const inLobby = game.lobby && game.game.phase === 'lobby';

  // lobby of speelveld
  $('lobby').hidden = !inLobby;
  $('view').style.display = inLobby ? 'none' : '';
  $('choose').hidden = true; // bar-menu altijd verborgen, lobby neemt het over

  if (inLobby) {
    updateBriefing();
    updatePlayers();
    syncLobbyControls(isHost);
  }

  // titel
  const size = inLobby ? ` · ${G.MAP_SIZES[game.size]?.label.toLowerCase() ?? game.size}` : '';
  const header = `— ${rules.header || rules.name || ''}`;
  if ($('header').textContent !== header + size) { $('header').textContent = header + size; document.title = `BLITZKRIEG ${header}`; }
  $('header').hidden = false;

  $('stop').hidden = !game.lobby || inLobby || game.status !== 'playing';
  if ($('map').value !== game.mapId) $('map').value = game.mapId;
  if ($('size').value !== game.size) $('size').value = game.size;
  for (const opt of $('size').options) opt.disabled = G.MAP_SIZES[opt.value].maxPlayers < players && opt.value !== game.size;
  if (game.message && game.tick < game.message.until) { $('info').textContent = game.message.text; return; }
  $('info').textContent = '';
}
setInterval(update, 500);

// Simpele HTML-escaping
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
