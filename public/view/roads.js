// Wegen voor de grondshader (alleen weergave): de middellijnen uit de kaartmaker (game.roads)
// worden gladgemaakt en per cel omgerekend naar een veld:
//   sd1   afstand tot de rand van de dichtstbijzijnde weg (negatief = op de weg), in cellen
//   sd2   hetzelfde voor de op één na dichtstbijzijnde weg (klein bij een kruising)
//   s     lengte langs de dichtstbijzijnde weg (cellen), voor wat een richting heeft
//   lat   afstand tot het midden van die weg met teken (links negatief), voor de textuur
//   road  klasse van de dichtstbijzijnde weg + 1 (0 = geen weg in de buurt)
//   under klasse + 1 van het terrein naast de weg, voor verharde cellen onder een weg: zo mengt
//         de grond naast de weg met de berm en niet met een blokkerige wegkleur
// De cellen zelf (waar je rijdt) veranderen niet. Een cel op (x, y) ligt in de kaartmaker op
// punt (x, y); in de shader is dat het midden van de cel (x + 0,5, y + 0,5).
import * as G from '/shared/game.js';

export const ROAD_NEAR = -8, ROAD_FAR = 16; // bereik van sd1/sd2 in de texture (cellen)

// Chaikin: elke knik wordt twee punten op 1/4 en 3/4, zodat de lijn rond wordt (eindpunten blijven)
export function chaikin(pts, rounds = 2) {
  let out = pts;
  for (let r = 0; r < rounds; r++) {
    const next = [out[0]];
    for (let k = 0; k < out.length - 1; k++) {
      const [ax, ay] = out[k], [bx, by] = out[k + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

// Het veld voor alle wegen; roads = [{p, w, c}] (zie client-sim)
export function roadField(roads, terrain) {
  const N = G.W * G.H, far = ROAD_FAR;
  const sd1 = new Float32Array(N).fill(far), sd2 = new Float32Array(N).fill(far), s = new Float32Array(N), lat = new Float32Array(N);
  const road = new Uint8Array(N), under = new Uint8Array(N);
  const dr = new Float32Array(N).fill(Infinity), sr = new Float32Array(N), side = new Int8Array(N); // per weg
  roads.forEach((rd) => {
    const pts = chaikin(rd.p, 2), hw = rd.w / 2, reach = hw + far, touched = [];
    let s0 = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(G.W - 1, Math.ceil(Math.max(ax, bx) + reach));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach)), y1 = Math.min(G.H - 1, Math.ceil(Math.max(ay, by) + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
          const d = Math.hypot(x - ax - dx * t, y - ay - dy * t), i = y * G.W + x;
          if (d >= dr[i]) continue;
          if (dr[i] === Infinity) touched.push(i);
          dr[i] = d; sr[i] = s0 + t * len; side[i] = (x - ax) * dy - (y - ay) * dx < 0 ? -1 : 1;
        }
      }
      s0 += len;
    }
    const cls = (G.CLASS[rd.c] ?? G.CLASS.paved) + 1;
    for (const i of touched) {
      const v = dr[i] - hw;
      if (v < sd1[i]) { sd2[i] = sd1[i]; sd1[i] = v; s[i] = sr[i]; lat[i] = dr[i] * side[i]; road[i] = cls; } else if (v < sd2[i]) sd2[i] = v;
      dr[i] = Infinity;
    }
  });
  // terrein naast de weg: vanaf alle cellen die niet verhard zijn naar binnen (breedte eerst)
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  const from = new Uint8Array(N); // klasse + 1 van de dichtstbijzijnde onverharde cel
  for (let i = 0; i < N; i++) if (terrain[i] !== G.CLASS.paved) { from[i] = terrain[i] + 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % G.W, y = (i / G.W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < G.W - 1 ? i + 1 : -1, y > 0 ? i - G.W : -1, y < G.H - 1 ? i + G.W : -1]) {
      if (j >= 0 && !from[j]) { from[j] = from[i]; queue[tail++] = j; }
    }
  }
  for (let i = 0; i < N; i++) if (terrain[i] === G.CLASS.paved && sd1[i] < 3) under[i] = from[i];
  return { sd1, sd2, s, lat, road, under };
}
