// Touchbesturing voor tablet en telefoon: een zwevende joystick op de linkerhelft van het
// speelveld, vuren op de rest van het scherm (de knop zit rechtsonder, over de legenda, waar je
// rechterduim ligt) en zelfvernietiging (K) na vasthouden. Alleen voor duimen
// (pointerType 'touch'), dus met muis en toetsenbord verandert er niets; de knoppen verschijnen
// pas bij de eerste aanraking. De invoer gaat via game.touch() naar net.js, net als de toetsen.
// Opmaak in touch.css.
import { stickDirection } from '/shared/game.js';
import { TOUCH } from '/shared/config.js';

function el(className, parent) {
  const e = document.createElement('div');
  e.className = className;
  parent?.append(e);
  return e;
}

export function touchControls(panel, game) {
  const R = TOUCH.stickRadius;
  const layer = el('touch');
  const base = el('touch-stick', layer), knob = el('touch-knob', base);
  const fire = el('touch-fire', layer);
  const sd = el('touch-sd', layer);
  fire.textContent = 'VUUR';
  sd.append(document.createElement('i'), 'K');
  layer.style.setProperty('--stick', `${R}px`);
  layer.style.setProperty('--hold', `${TOUCH.selfDestructMs}ms`);
  // over de hele pagina, niet alleen het speelveld: de vuurknop hoort tegen de rechterrand
  document.body.append(layer);

  let stick = null; // { id, x, y }: duim op de joystick en de plek van de voet
  let dir = [0, 0];
  const firing = new Set(); // duimen op de vuurkant (twee tegelijk mag)
  let sdId = null, sdTimer = 0;
  const send = () => game.touch(dir[0], dir[1], firing.size ? 1 : 0);

  const hits = (elem, e) => {
    const r = elem.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  function place(x, y, kx = 0, ky = 0) {
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }
  // Zonder duim staat de stick vaag linksonder in het veld, als hint waar hij zit;
  // K bovenin het midden van het veld
  function rest() {
    const r = panel.getBoundingClientRect();
    stick = null;
    base.classList.remove('active');
    place(r.left + R * 1.6, r.bottom - R * 1.6);
    sd.style.left = `${r.left + r.width / 2}px`;
    sd.style.top = `${r.top + 8}px`;
  }
  function stopSelfDestruct() {
    clearTimeout(sdTimer);
    sdId = null;
    sd.classList.remove('hold');
  }

  const on = () => document.body.classList.contains('touch-on');
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    if (!on()) { document.body.classList.add('touch-on'); rest(); }
    // de duim blijft van ons, ook buiten het veld (faalt als hij al weg is: dan maakt het niet uit)
    try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* geen actieve pointer meer */ }
    const x = e.clientX, y = e.clientY, field = panel.getBoundingClientRect();
    if (hits(sd, e)) {
      if (sdId !== null) return;
      sdId = e.pointerId;
      sd.classList.add('hold');
      sdTimer = setTimeout(() => { game.selfDestruct(); stopSelfDestruct(); }, TOUCH.selfDestructMs);
    } else if (x < field.left + field.width / 2) {
      if (stick) return; // tweede duim links kaapt de stick niet
      stick = { id: e.pointerId, x, y };
      base.classList.add('active');
      place(x, y);
    } else {
      firing.add(e.pointerId);
      fire.classList.add('active');
      send();
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    const x = e.clientX, y = e.clientY;
    let ox = x - stick.x, oy = y - stick.y;
    const d = Math.hypot(ox, oy);
    // verder dan de straal: de voet schuift mee, zodat terugsturen meteen werkt
    if (d > R) {
      stick.x += ox * (1 - R / d);
      stick.y += oy * (1 - R / d);
      ox *= R / d; oy *= R / d;
    }
    place(stick.x, stick.y, ox, oy);
    const nd = stickDirection(ox / R, oy / R);
    if (nd[0] !== dir[0] || nd[1] !== dir[1]) { dir = nd; send(); }
  });

  const end = (e) => {
    if (stick && e.pointerId === stick.id) { rest(); dir = [0, 0]; send(); }
    if (firing.delete(e.pointerId)) { fire.classList.toggle('active', firing.size > 0); send(); }
    if (e.pointerId === sdId) stopSelfDestruct();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('contextmenu', (e) => { if (on()) e.preventDefault(); }); // lang drukken = geen menu
  new ResizeObserver(() => { if (!stick && on()) rest(); }).observe(panel);
}
