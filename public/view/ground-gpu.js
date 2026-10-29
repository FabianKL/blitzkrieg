// Grond op de videokaart: één mesh over de hele kaart met een eigen shader, in plaats van de
// kaartschilder die per pixel op de CPU schildert (die blijft achter ?oud=1). De shader rekent per
// schermpixel uit wat er ligt, dus de grond is scherp op elke zoomstand.
//
// De gamestate gaat als drie texturen van 1 pixel per cel naar de videokaart:
//   cells  (nearest) r = celtype, g = terreinklasse, a = kras (0..3) + 128 als het de brug is
//   fields (linear)  r = rots, g = water, b = begroeiing: de vervaagde velden (blurField) voor
//                    ronde randen, bilineair zoals de oude createFieldSampler
//   track  (linear)  r = spoor (trackMix), g = tunnelvorm (1 in een tunnel), b = tunnelrand
//                    (1 in een tunnel met spoor >= 0,5, zoals seenCell: alleen die krijgt een rand)
//   solid  (linear)  r = rots, g = water, b = begroeiing: 1 in zo'n cel. Daarmee loopt de drempel
//                    voor de ronde rand vloeiend van 0,5 (ernaast) naar 0,34 (erin), zodat losse
//                    cellen niet verdwijnen en er geen trapjes op de celgrenzen komen
// Bij graven, vervagen en schade worden alleen de veranderde cellen bijgewerkt en per beeld als
// kleine rechthoeken geüpload (texSubImage2D).
//
// Grondtexturen: per materiaal (de terreinklassen, rots, tunnel, puin) een naadloze textuur
// uit public/assets/<stijl>/terrain/ (manifest.json zegt welke), gekleurd naar de kleur van de
// kaart (LOOK.ground.tint). Ontbreekt er een, dan maakt deze module er een met simplex-ruis.
// Alles komt in één atlas met mipmaps. IJs, water en de vormen zijn procedureel in de shader.
//
// Waar je geen zicht hebt, toont de shader de schone kaart (geen tunnels, sporen of kraters):
// hij leest daarvoor hetzelfde masker als de ijsbarsten (setMask, zie drawSight).
//
// Een stijl geeft de rest met `surface` (zie SURFACE hieronder): rand langs tunnels, rots,
// begroeiing (alleen grond, bladerdek of takjes), oever, basisvloer en splinters.
import * as G from '/shared/game.js';
import { Mesh, MeshGeometry, Shader, BufferImageSource, CanvasSource, Texture, Rectangle } from 'pixi.js';
import { createNoise4D } from 'simplex-noise';
import { trackMix, rgb } from '/render-common.js';
import { loadManifest, loadImage, terrainNames, terrainPath, report } from '/assets.js';

// Materialen: eerst alle terreinklassen (in de volgorde van G.CLASS_NAMES), dan deze drie
const N_CLASS = G.CLASS_NAMES.length;
const MAT = { rock: N_CLASS, tunnel: N_CLASS + 1, rubble: N_CLASS + 2 };
const N_MAT = N_CLASS + 3;
// Kleuren die de shader los krijgt (uCol)
const COL = { tunnel: 0, water: 1, veg: 2, building: 3, bridge: 4, floor: 5, debris: 6, lip: 7, bank: 8, deep: 9, twig: 10 };
const N_COL = 11;
const TEX_SIZE = 512, PAD = 16; // grondtextuur en de rand eromheen in de atlas (tegen naden bij mipmaps)
const PROC_SIZE = 256; // procedurele vervanger (kleiner: wordt bij het laden uitgerekend)
const NOISE_SIZE = 256, NOISE_CYCLES = 8; // ruistextuur: 8 ruisvlekken per zijde, naadloos

// Standaard voor een stijl zonder surface; de stijlen overschrijven dit per veld
const SURFACE = {
  lip: { color: null, shade: 0.6, amount: 1, inner: 1 }, // rand buiten (kleur of verdonkering) en binnen een tunnel
  rock: { edge: 0.5, light: 1.25 }, // donkere omlijning, licht randje linksboven
  veg: 'ground', // 'ground' (alleen grond, bomen in de objectlaag), 'canopy' (bladerdek), 'twigs' (takjes)
  bank: { color: null, shade: 0.62 }, // oever: vaste kleur of de grond verdonkerd
  floor: { color: '#2c2119', grid: 0, tracks: 0, grain: 8 }, // basisvloer: voegen om de grid cellen, bandensporen (verdonkering)
  debris: '#70502e', twig: '#58422a', // splinters in een gat van een plant, takjes van een struik
};
const DEEP_ICE = '#223a52'; // donker, diep ijs

const VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vCell;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vCell = aPosition;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vCell;
out vec4 finalColor;
uniform sampler2D uCells;
uniform sampler2D uFields;
uniform sampler2D uTrack;
uniform sampler2D uSolid;
uniform sampler2D uAtlas;
uniform sampler2D uNoise;
uniform sampler2D uMask;
uniform vec2 uMap;        // kaartmaat in cellen
uniform vec4 uMaskRect;   // waar het zichtmasker ligt (x, y, w, h in cellen)
uniform float uMaskOn;
uniform vec4 uGround;     // cellen per textuur, tint, blend (overgang tussen klassen), contrast
uniform vec4 uGrain;      // look.noise: schaal, sterkte, octaven, -
uniform vec4 uMode;       // begroeiing (0 grond, 1 bladerdek, 2 takjes), oever (verdonkering of 0 = kleur), rotsrand, rotslicht
uniform vec4 uLip;        // tunnelrand: hoeveel, verdonkering (0 = kleur uCol lip), binnenrand, -
uniform vec4 uFloor;      // basisvloer: voegen (cellen), bandensporen, korrel, -
uniform vec4 uDoor;       // midden van de deur per basis (cellen)
uniform vec4 uSlot[${N_MAT}]; // plek in de atlas (u, v, breedte, hoogte); breedte 0 = effen kleur
uniform vec4 uTint[${N_MAT}]; // kleur van de kaart per materiaal
uniform vec4 uMean[${N_MAT}]; // gemiddelde kleur van de textuur
uniform vec4 uCol[${N_COL}];

const int EMPTY = ${G.EMPTY}, DIRT = ${G.DIRT}, ROCK = ${G.ROCK}, WATER = ${G.WATER}, VEG = ${G.VEG};
const int BUILDING = ${G.BUILDING}, WALL = ${G.WALL}, BASE = ${G.BASE};
const int ICE = ${G.CLASS.ice}, MAT_TUNNEL = ${MAT.tunnel}, MAT_ROCK = ${MAT.rock}, MAT_RUBBLE = ${MAT.rubble};

vec2 gX, gY; // afgeleiden van de textuurcoördinaat, buiten de takken uitgerekend (mipmaps)

// korrel per stukje cel: vast toeval, 0..1
float hash(vec2 q) {
  uvec2 u = uvec2(ivec2(floor(q)) + 65536);
  uint h = u.x * 374761393u + u.y * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h & 1023u) / 1023.0;
}
// zachte ruis (simplex, naadloos), ongeveer één vlek per eenheid; 0..1. In g een tweede laag,
// in b dezelfde ruis met look.noise.octaves lagen (fbm, vooraf uitgerekend: één keer lezen)
float nz(vec2 q) { return texture(uNoise, q / ${NOISE_CYCLES}.0).r; }
float fbm(vec2 q) { return texture(uNoise, q / ${NOISE_CYCLES}.0).b * 2.0 - 1.0; }
ivec2 clampCell(ivec2 q) { return clamp(q, ivec2(0), ivec2(uMap) - 1); }
int cellAt(ivec2 q) { return int(texelFetch(uCells, clampCell(q), 0).r * 255.0 + 0.5); }
int clsAt(ivec2 q) { return int(texelFetch(uCells, clampCell(q), 0).g * 255.0 + 0.5); }
bool bridgeAt(ivec2 q) { return (int(texelFetch(uCells, clampCell(q), 0).a * 255.0 + 0.5) & 128) != 0; }
bool blocks(int c, bool rockOnly) { return rockOnly ? c == ROCK : (c == ROCK || c == WATER || c == VEG); }
// afgeronde hoek van een rots-, water- of plantcel: neem het terrein van de buur aan die kant
int fallback(ivec2 ip, vec2 fr, bool rockOnly) {
  int side = cellAt(ip + ivec2(fr.x < 0.5 ? -1 : 1, 0));
  int vert = cellAt(ip + ivec2(0, fr.y < 0.5 ? -1 : 1));
  return !blocks(side, rockOnly) ? side : !blocks(vert, rockOnly) ? vert : DIRT;
}

// Textuur van materiaal i op plek p (cellen), gekleurd naar de kaart
vec3 material(int i, vec2 p) {
  vec4 s = uSlot[i];
  vec3 tint = uTint[i].rgb;
  if (s.z <= 0.0) return tint;
  vec2 tc = p / uGround.x + float(i) * vec2(0.37, 0.61); // elk materiaal een eigen verschuiving
  vec3 tex = textureGrad(uAtlas, s.xy + fract(tc) * s.zw, gX * s.zw, gY * s.zw).rgb;
  vec3 mean = max(uMean[i].rgb, vec3(0.02));
  vec3 rel = mix(vec3(1.0), tex / mean, uGround.w); // tekening, met minder contrast
  return rel * mix(mean, tint, uGround.y); // rond de eigen of de kaartkleur
}
// Terrein: de klassen van de vier dichtstbijzijnde cellen, gemengd op een met ruis verschoven
// plek (zachte, golvende grenzen), plus grote vlekken licht en donker (look.noise)
vec3 groundAt(vec2 p) {
  vec2 w = (texture(uNoise, (p / 2.2 + vec2(3.1, 7.7)) / ${NOISE_CYCLES}.0).rg - 0.5) * 1.4 * uGround.z;
  vec2 q = p - 0.5 + w;
  ivec2 i0 = ivec2(floor(q));
  vec2 t = smoothstep(0.0, 1.0, fract(q));
  int a = clsAt(i0), b = clsAt(i0 + ivec2(1, 0)), c = clsAt(i0 + ivec2(0, 1)), d = clsAt(i0 + ivec2(1, 1));
  vec3 col;
  if (a == b && a == c && a == d) col = material(a, p);
  else {
    vec3 ca = material(a, p);
    vec3 cb = b == a ? ca : material(b, p);
    vec3 cc = c == a ? ca : c == b ? cb : material(c, p);
    vec3 cd = d == a ? ca : d == b ? cb : d == c ? cc : material(d, p);
    col = mix(mix(ca, cb, t.x), mix(cc, cd, t.x), t.y);
  }
  if (uGrain.y > 0.0) {
    float dark = clamp(1.15 - dot(col, vec3(0.3, 0.59, 0.11)), 0.1, 1.0); // vooral op donkere grond
    col *= 1.0 + uGrain.y * dark * fbm(p / uGrain.x);
  }
  return col;
}
// Tunnels en sporen: vage sporen laten stukjes terrein door; een rand langs verse tunnels
vec3 tunnels(vec3 col, vec2 p, vec2 uv, int scar) {
  vec3 t = texture(uTrack, uv).rgb;
  if (t.g > 0.5) {
    float tm = t.r / max(t.g, 0.001);
    float d = hash(p * 8.0) * 0.5 + nz(p * 1.3) * 0.5;
    vec3 tc = material(MAT_TUNNEL, p);
    if (t.b > 0.5 && t.b < 0.66) tc *= uLip.z; // schaduw net binnen de rand
    if (scar == 1 && hash(p * 6.0 + vec2(17.0, 5.0)) < 0.24) tc = uCol[${COL.debris}].rgb; // splinters
    return mix(col, tc, smoothstep(d - 0.1, d + 0.1, tm));
  }
  if (t.b > 0.2) {
    vec3 lip = uLip.y > 0.0 ? col * uLip.y : uCol[${COL.lip}].rgb;
    return mix(col, lip, smoothstep(0.2, 0.5, t.b) * uLip.x);
  }
  return col;
}
vec3 rockAt(vec2 p, float f, float thr) {
  vec3 col = material(MAT_ROCK, p);
  if (f < thr + 0.07) return col * uMode.z;
  if (texture(uFields, (p - vec2(0.33)) / uMap).r < thr) return col * uMode.w;
  return col;
}
vec3 waterAt(vec2 p, float f, float thr) {
  if (f < thr + 0.085) return uMode.y > 0.0 ? groundAt(p) * uMode.y : uCol[${COL.bank}].rgb;
  float k = (sin(p.x * 2.4 + p.y * 0.9 + nz(p / 5.0) * 6.0) * 6.0 + (hash(p * 6.0) - 0.5) * 6.0) / 255.0;
  return uCol[${COL.water}].rgb + k;
}
vec3 vegAt(vec2 p, float f, float thr) {
  if (uMode.x < 0.5) return groundAt(p);
  vec3 v = uCol[${COL.veg}].rgb;
  if (uMode.x < 1.5) { // bladerdek: donkere rand, vlekken licht en donker groen
    float leaf = nz(p * 2.6);
    return v * (f < thr + 0.08 ? 0.6 : leaf > 0.62 ? 1.55 : leaf > 0.4 ? 1.05 : 0.75);
  }
  vec3 g = groundAt(p); // dorre struik: zand met een kluwen takjes
  if (nz(p * 3.5) > 0.5 && f > 0.45) return hash(p * 6.0) > 0.5 ? v : uCol[${COL.twig}].rgb;
  if (f > 0.62) return g * vec3(0.8, 0.78, 0.72);
  return g;
}
// IJs: diepe, donkere plekken, lange stroomstrepen en wat korrel (barsten staan los erboven)
vec3 iceAt(vec2 p) {
  vec3 ice = uTint[ICE].rgb;
  float deep = 0.5 + 0.5 * ((nz(p / 18.0) * 2.0 - 1.0) * 0.7 + (nz(p / 7.8 + 40.0) * 2.0 - 1.0) * 0.3);
  float k = pow(1.0 - deep, 1.6) * 0.62;
  float flow = (nz(vec2(p.x / 40.0, p.y / 2.2)) * 2.0 - 1.0) * 0.035;
  float light = 1.0 + flow + (hash(p * 6.0) - 0.5) * 0.025 + (1.0 - k) * 0.04;
  return mix(ice, uCol[${COL.deep}].rgb, k) * light;
}
// Wak: open water met ijsschotsen en een gebroken ijsrand
vec3 wakAt(vec2 p, float f, float thr) {
  vec3 ice = uTint[ICE].rgb;
  if (f < thr + 0.1) return ice * (1.08 + (hash(p * 6.0) - 0.5) * 0.06);
  float s = nz(p * 1.33);
  if (s > 0.7) return ice * (s < 0.73 ? 0.7 : 0.95 + (hash(p * 6.0) - 0.5) * 0.05);
  return uCol[${COL.water}].rgb + (sin(p.x * 2.4 + p.y * 0.9) * 4.0 + (hash(p * 6.0) - 0.5) * 6.0) / 255.0;
}
// Gebouw: dak met pannenrijen, donkere rand en wat korrel
vec3 roofAt(vec2 p, ivec2 ip, vec2 fr) {
  vec3 b = uCol[${COL.building}].rgb;
  float e = 1.0 / 6.0;
  if ((fr.x < e && cellAt(ip + ivec2(-1, 0)) != BUILDING) || (fr.x > 1.0 - e && cellAt(ip + ivec2(1, 0)) != BUILDING) ||
      (fr.y < e && cellAt(ip + ivec2(0, -1)) != BUILDING) || (fr.y > 1.0 - e && cellAt(ip + ivec2(0, 1)) != BUILDING)) return b * 0.5;
  return b * (fract(p.y * 2.0) < 0.33 ? 0.82 : 1.0) * (0.96 + hash(p * 6.0) * 0.08) * (fract(p.x / 1.5) < 0.11 ? 0.9 : 1.0);
}
// Brug die kan ontploffen (Market Garden): betonplaten met naden en een donkere rand
vec3 bridgeCol(vec2 p, ivec2 ip, vec2 fr) {
  vec3 b = uCol[${COL.bridge}].rgb;
  float e = 1.0 / 6.0;
  if ((fr.x < e && !bridgeAt(ip + ivec2(-1, 0))) || (fr.x > 1.0 - e && !bridgeAt(ip + ivec2(1, 0))) ||
      (fr.y < e && !bridgeAt(ip + ivec2(0, -1))) || (fr.y > 1.0 - e && !bridgeAt(ip + ivec2(0, 1)))) return b * 0.55;
  return b * ((fract(p.x / 2.0) < 0.08 || fract(p.y / 2.0) < 0.08) ? 0.82 : 1.0) * (0.95 + hash(p * 6.0) * 0.1);
}
// Basisvloer en muur (de muur zelf wordt er los overheen getekend)
vec3 floorAt(vec2 p, int c) {
  int b = c >= BASE ? c - BASE : c - WALL;
  vec3 col = uCol[${COL.floor}].rgb + (hash(p * 6.0) - 0.5) * uFloor.z / 255.0;
  if (uFloor.x > 0.0 && (fract(p.x / uFloor.x) < 0.5 / uFloor.x || fract(p.y / uFloor.x) < 0.5 / uFloor.x)) col *= 0.8;
  if (uFloor.y > 0.0 && abs(abs(p.x - uDoor[b]) - 1.6) < 0.35) col *= uFloor.y;
  return col;
}
// Puin van een kapotgeschoten gebouw: blijft altijd liggen
vec3 rubbleAt(vec3 col, vec2 p) {
  if (uSlot[MAT_RUBBLE].z > 0.0) return mix(col, material(MAT_RUBBLE, p), 0.85);
  if (hash(p * 6.0 + vec2(3.0, 9.0)) >= 0.38) return col;
  return uCol[${COL.building}].rgb * (0.6 + hash(p * 6.0 + vec2(1.0)) * 0.55);
}
float maskAt(vec2 p) { return texture(uMask, (p - uMaskRect.xy) / uMaskRect.zw).a; }

void main() {
  vec2 p = vCell;
  gX = dFdx(p / uGround.x); gY = dFdy(p / uGround.x);
  ivec2 ip = ivec2(floor(p));
  vec2 fr = fract(p), uv = p / uMap;
  vec4 cd = texelFetch(uCells, clampCell(ip), 0);
  int own = int(cd.r * 255.0 + 0.5), cls = int(cd.g * 255.0 + 0.5), flags = int(cd.a * 255.0 + 0.5), scar = flags & 3;
  vec3 f = texture(uFields, uv).rgb;
  // in een echte rots/water/plantcel een lagere drempel, zodat losse cellen niet verdwijnen
  vec3 thr = 0.5 - 0.16 * texture(uSolid, uv).rgb;
  float thrR = thr.r, thrW = thr.g, thrV = thr.b;
  int c = own;
  if (f.r >= thrR) c = ROCK;
  else if (own == ROCK) c = fallback(ip, fr, true);
  if (c != ROCK) {
    if (f.g >= thrW) c = WATER;
    else if (f.b >= thrV) c = VEG;
    else if (c == WATER || c == VEG) c = fallback(ip, fr, false);
  }
  if (c == EMPTY) c = DIRT; // of het een tunnel is, zegt de tunnelvorm (zie tunnels)
  bool hidden = uMaskOn > 0.5 && maskAt(p) > 0.5; // geen zicht: de schone kaart
  vec3 col;
  if (cls == ICE && c == DIRT) col = iceAt(p);
  else if (cls == ICE && c == WATER) col = wakAt(p, f.g, thrW);
  else if ((flags & 128) != 0 && c == DIRT) col = bridgeCol(p, ip, fr);
  else if (c == DIRT) { col = groundAt(p); if (!hidden) col = tunnels(col, p, uv, scar); }
  else if (c == ROCK) col = rockAt(p, f.r, thrR);
  else if (c == WATER) col = waterAt(p, f.g, thrW);
  else if (c == VEG) col = vegAt(p, f.b, thrV);
  else if (c == BUILDING) col = roofAt(p, ip, fr);
  else col = floorAt(p, c);
  if (c == DIRT && scar == 2) col = rubbleAt(col, p);
  finalColor = vec4(col, 1.0);
}`;

// Ruistextuur: r en g twee lagen simplex-ruis, b dezelfde als r maar met `octaves` lagen
// (fijner en zwakker), a nog een laag; naadloos doordat de ruis op een torus loopt
function noiseTexture(octaves) {
  const c = document.createElement('canvas');
  c.width = c.height = NOISE_SIZE;
  const g = c.getContext('2d'), img = g.createImageData(NOISE_SIZE, NOISE_SIZE);
  const n4 = [1, 2, 3, 4].map((k) => createNoise4D(G.mulberry32(911 * k)));
  const rad = NOISE_CYCLES / (2 * Math.PI);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const a = (x / NOISE_SIZE) * 2 * Math.PI, b = (y / NOISE_SIZE) * 2 * Math.PI, i = (y * NOISE_SIZE + x) * 4;
      const ca = Math.cos(a) * rad, sa = Math.sin(a) * rad, cb = Math.cos(b) * rad, sb = Math.sin(b) * rad;
      img.data[i] = 128 + 127 * n4[0](ca, sa, cb, sb);
      img.data[i + 1] = 128 + 127 * n4[1](ca, sa, cb, sb);
      img.data[i + 3] = 128 + 127 * n4[3](ca, sa, cb, sb);
      let v = 0, amp = 1, sum = 0;
      for (let o = 0; o < octaves; o++) { // fijnere lagen: 2, 4, 8 keer zoveel vlekken (blijft naadloos)
        const f = 2 ** o;
        v += amp * n4[2](Math.cos(a * f) * rad * f, Math.sin(a * f) * rad * f, Math.cos(b * f) * rad * f, Math.sin(b * f) * rad * f);
        sum += amp; amp *= 0.5;
      }
      img.data[i + 2] = 128 + 127 * (sum ? v / sum : 0);
    }
  }
  g.putImageData(img, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: c, alphaMode: 'no-premultiply-alpha', addressMode: 'repeat', scaleMode: 'linear' }) });
}

// Procedurele grondtextuur (als er geen bestand is): grijze vlekken en korrel rond 0,85, naadloos
function proceduralTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = PROC_SIZE;
  const g = c.getContext('2d'), img = g.createImageData(PROC_SIZE, PROC_SIZE);
  const n4 = createNoise4D(G.mulberry32(seed));
  for (let y = 0; y < PROC_SIZE; y++) {
    for (let x = 0; x < PROC_SIZE; x++) {
      const a = (x / PROC_SIZE) * 2 * Math.PI, b = (y / PROC_SIZE) * 2 * Math.PI, i = (y * PROC_SIZE + x) * 4;
      let v = 0, amp = 0.5, r = 0.7;
      for (let o = 0; o < 4; o++) { v += amp * n4(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r + o * 7, Math.sin(b) * r); amp *= 0.5; r *= 2.1; }
      const k = 210 + v * 70 + ((G.mulberry32(i)() - 0.5) * 18);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Gemiddelde kleur van een afbeelding (0..1), om hem naar de kaartkleur te kunnen kleuren
function meanColor(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data, m = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k];
  return m.map((v) => v / (d.length / 4) / 255);
}

// Eén atlas met alle grondtexturen, elk met een rand van PAD pixels (de textuur loopt door)
function buildAtlas(images) {
  const slot = TEX_SIZE + 2 * PAD, cols = Math.ceil(Math.sqrt(images.length)), rows = Math.ceil(images.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * slot; c.height = rows * slot;
  const g = c.getContext('2d');
  const slots = images.map((img, k) => {
    const ox = (k % cols) * slot, oy = Math.floor(k / cols) * slot;
    g.save();
    g.beginPath(); g.rect(ox, oy, slot, slot); g.clip();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) g.drawImage(img, ox + PAD + i * TEX_SIZE, oy + PAD + j * TEX_SIZE, TEX_SIZE, TEX_SIZE);
    g.restore();
    return [(ox + PAD) / c.width, (oy + PAD) / c.height, TEX_SIZE / c.width, TEX_SIZE / c.height];
  });
  const source = new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', mipmapFilter: 'linear', addressMode: 'clamp-to-edge', maxAnisotropy: 4 });
  return { source, slots };
}

// Texture van 1 pixel per cel, met de ruwe waarden (geen voorvermenigvuldiging met alfa)
function dataTexture(linear) {
  const data = new Uint8Array(G.W * G.H * 4);
  const source = new BufferImageSource({
    resource: data, width: G.W, height: G.H, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha',
    scaleMode: linear ? 'linear' : 'nearest', addressMode: 'clamp-to-edge',
  });
  return { data, source };
}

const vec4s = (n) => ({ value: new Float32Array(n * 4), type: 'vec4<f32>', size: n });
const put = (arr, k, [r, g, b], a = 1) => { arr[k * 4] = r; arr[k * 4 + 1] = g; arr[k * 4 + 2] = b; arr[k * 4 + 3] = a; };
const unit = (hex) => rgb(hex).map((v) => v / 255);

// container: laag waar de mesh in komt; getRenderer(): de Pixi-renderer (of null zolang hij er niet is)
export function createGroundGpu({ container, game, style, getRenderer }) {
  const surface = { ...SURFACE, ...style.surface };
  for (const k of ['lip', 'rock', 'bank', 'floor']) surface[k] = { ...SURFACE[k], ...style.surface?.[k] };
  let noise = noiseTexture(3), octaves = 3;
  const empty = Texture.WHITE.source;
  const uniforms = {
    uMap: { value: new Float32Array([G.W, G.H]), type: 'vec2<f32>' },
    uMaskRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
    uMaskOn: { value: 0, type: 'f32' },
    uGround: { value: new Float32Array(4), type: 'vec4<f32>' },
    uGrain: { value: new Float32Array(4), type: 'vec4<f32>' },
    uMode: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLip: { value: new Float32Array(4), type: 'vec4<f32>' },
    uFloor: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDoor: { value: new Float32Array(4), type: 'vec4<f32>' },
    uSlot: vec4s(N_MAT), uTint: vec4s(N_MAT), uMean: vec4s(N_MAT), uCol: vec4s(N_COL),
  };
  let cells = null, fields = null, track = null, solid = null, mesh = null, atlas = null;
  let src = null; // { pal, fields, rockField, bridgeMask } van de kaart van nu
  let dirty = []; // rechthoeken [x0, y0, x1, y1] die nog naar de videokaart moeten
  let atlasKey = '', loading = 0;
  const swatches = []; // legendavakjes die wachten op de renderer

  // Gegevens van cel i in de drie texturen
  function fill(i) {
    const c = game.map[i], k = i * 4, dug = c === G.EMPTY, tm = dug ? trackMix(game, i) : 0;
    cells.data[k] = c; cells.data[k + 1] = game.terrain[i];
    cells.data[k + 3] = (game.world.scar[i] & 3) | (src.bridgeMask?.[i] ? 128 : 0);
    fields.data[k] = src.rockField[i] * 255; fields.data[k + 1] = src.fields.water[i] * 255; fields.data[k + 2] = src.fields.veg[i] * 255;
    track.data[k] = tm * 255; track.data[k + 1] = dug ? 255 : 0; track.data[k + 2] = dug && tm >= 0.5 ? 255 : 0;
    solid.data[k] = c === G.ROCK ? 255 : 0; solid.data[k + 1] = c === G.WATER ? 255 : 0; solid.data[k + 2] = c === G.VEG ? 255 : 0;
  }
  // Rechthoek bijwerken; dicht bij elkaar liggende rechthoeken worden er één (graven = veel cellen)
  function markRect(x0, y0, x1, y1) {
    if (!cells) return;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(G.W - 1, x1); y1 = Math.min(G.H - 1, y1);
    if (x1 < x0 || y1 < y0) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fill(y * G.W + x);
    for (const r of dirty) {
      if (x0 <= r[2] + 4 && x1 >= r[0] - 4 && y0 <= r[3] + 4 && y1 >= r[1] - 4) {
        r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1);
        return;
      }
    }
    dirty.push([x0, y0, x1, y1]);
  }
  // Rechthoek van de data naar de videokaart, zonder de rest opnieuw te sturen. Pixi houdt bij
  // welke texture waar gebonden is: daarom zetten we alles terug zoals het was.
  function upload(tex, [x0, y0, x1, y1]) {
    const r = getRenderer(), gl = r?.gl, gpu = gl && tex.source._gpuData?.[r.uid];
    if (!gpu || typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) { tex.source.update(); return; }
    const active = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);
    const bound = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, G.W);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1, gl.RGBA, gl.UNSIGNED_BYTE, tex.data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.bindTexture(gl.TEXTURE_2D, bound);
    gl.activeTexture(active);
  }

  // Kleuren en instellingen van de kaart en de stijl naar de shader
  function setColors(pal, bases) {
    const u = uniforms;
    for (let k = 0; k < N_CLASS; k++) put(u.uTint.value, k, pal.cls[k].map((v) => v / 255));
    put(u.uTint.value, MAT.rock, pal.rock.map((v) => v / 255));
    put(u.uTint.value, MAT.tunnel, pal.tunnel.map((v) => v / 255));
    put(u.uTint.value, MAT.rubble, pal.building.map((v) => v / 255));
    const col = (name, c) => put(u.uCol.value, COL[name], c);
    col('tunnel', pal.tunnel.map((v) => v / 255)); col('water', pal.water.map((v) => v / 255));
    col('veg', pal.veg.map((v) => v / 255)); col('building', pal.building.map((v) => v / 255));
    col('bridge', pal.bridge.map((v) => v / 255)); col('floor', unit(surface.floor.color));
    col('debris', unit(surface.debris)); col('lip', unit(surface.lip.color || '#ffffff'));
    col('bank', unit(surface.bank.color || '#000000')); col('deep', unit(DEEP_ICE)); col('twig', unit(surface.twig));
    u.uMode.value.set([{ ground: 0, canopy: 1, twigs: 2 }[surface.veg] ?? 0, surface.bank.color ? 0 : surface.bank.shade, surface.rock.edge, surface.rock.light]);
    u.uLip.value.set([surface.lip.amount, surface.lip.color ? 0 : surface.lip.shade, surface.lip.inner, 0]);
    u.uFloor.value.set([surface.floor.grid, surface.floor.tracks, surface.floor.grain, 0]);
    u.uDoor.value.set([0, 1, 2, 3].map((i) => bases[i]?.dc ?? 0));
  }
  function setLook(look) {
    uniforms.uGround.value.set([look.ground.cells, look.ground.tint, look.blend, look.ground.contrast]);
    uniforms.uGrain.value.set([look.noise.scale, look.noise.strength, look.noise.octaves, 0]);
    if (look.noise.octaves !== octaves) { // de fbm in de ruistextuur opnieuw uitrekenen
      const old = noise;
      octaves = look.noise.octaves;
      noise = noiseTexture(octaves);
      if (mesh) mesh.shader.resources.uNoise = noise.source;
      old.destroy(true);
    }
  }

  // Grondtexturen van deze stijl en kaart laden en tot een atlas maken (op de achtergrond; tot
  // die klaar is, toont de shader effen kaartkleuren)
  async function loadAtlas(mapId) {
    const look = game.rules?.style || 'zomer'; // stijlmap in public/assets/
    const key = `${look}|${mapId}`;
    if (key === atlasKey) return;
    atlasKey = key;
    const run = ++loading, m = await loadManifest();
    const names = { ...terrainNames(m, look, mapId), ...game.rules?.look?.ground?.textures }; // de kaart heeft het laatste woord
    const used = new Set([...new Set(game.terrain), ...Object.keys(game.rules?.classes || {}).map((n) => G.CLASS[n])]);
    const want = [...G.CLASS_NAMES.map((n) => (n === 'ice' ? null : names[n] || null)), names.rock || 'rots', names.tunnel || 'aarde', names.rubble || 'puin'];
    const imgs = await Promise.all(want.map((n) => (n && terrainPath(m, look, n) ? loadImage(m, terrainPath(m, look, n)) : null)));
    if (run !== loading || !mesh) return;
    report.terrain = {};
    const list = [], index = [];
    want.forEach((n, k) => {
      // ijs is helemaal procedureel; klassen die op deze kaart niet (kunnen) liggen: effen kleur
      if (k === G.CLASS.ice || (k < N_CLASS && !used.has(k))) { index.push(-1); return; }
      const name = k < N_CLASS ? G.CLASS_NAMES[k] : Object.keys(MAT).find((key) => MAT[key] === k);
      report.terrain[name] = imgs[k] ? terrainPath(m, look, n) : 'procedureel';
      index.push(list.length);
      list.push(imgs[k] || proceduralTexture(1000 + k));
    });
    const next = buildAtlas(list);
    index.forEach((s, k) => {
      if (s < 0) { put(uniforms.uSlot.value, k, [0, 0, 0], 0); return; }
      put(uniforms.uSlot.value, k, next.slots[s].slice(0, 3), next.slots[s][3]);
      put(uniforms.uMean.value, k, meanColor(list[s]));
    });
    atlas?.destroy();
    atlas = next.source;
    mesh.shader.resources.uAtlas = atlas;
    onAtlas?.();
  }
  let onAtlas = null;

  // Nieuwe kaart (of het weer veranderde het terrein): alles opnieuw
  function load(state) {
    src = state;
    if (!cells || cells.data.length !== G.W * G.H * 4) {
      for (const t of [cells, fields, track, solid]) t?.source.destroy();
      cells = dataTexture(false); fields = dataTexture(true); track = dataTexture(true); solid = dataTexture(true);
      mesh?.destroy();
      mesh = null;
    }
    for (let i = 0; i < G.W * G.H; i++) fill(i);
    for (const t of [cells, fields, track, solid]) t.source.update();
    dirty = [];
    uniforms.uMap.value.set([G.W, G.H]);
    setColors(state.pal, state.bases);
    setLook(state.look);
    if (!mesh) {
      const geometry = new MeshGeometry({
        positions: new Float32Array([0, 0, G.W, 0, G.W, G.H, 0, G.H]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      });
      const shader = Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT, name: 'ground' },
        resources: {
          uCells: cells.source, uFields: fields.source, uTrack: track.source, uSolid: solid.source,
          uAtlas: atlas || empty, uNoise: noise.source, uMask: empty, groundUniforms: uniforms,
        },
      });
      mesh = container.addChild(new Mesh({ geometry, shader }));
    }
    loadAtlas(game.mapId || '');
  }

  // Per beeld: wat veranderd is naar de videokaart
  function update() {
    if (!dirty.length) return;
    for (const r of dirty) for (const t of [cells, fields, track, solid]) upload(t, r);
    dirty = [];
  }
  // Zichtmasker (wit = geen zicht) en waar het ligt; null = overal zicht
  let maskSource = null;
  function setMask(tex, x, y, w, h) {
    uniforms.uMaskOn.value = tex ? 1 : 0;
    if (!tex || !mesh) return;
    uniforms.uMaskRect.value.set([x, y, w, h]);
    if (maskSource !== tex.source) { maskSource = tex.source; mesh.shader.resources.uMask = tex.source; }
  }

  // Legenda: een uitsnede van de grond (n x n cellen vanaf sx, sy), zonder zichtmasker, in een
  // canvas van w x h. Kan pas als de renderer er is: tot dan in de wachtrij (zie flushSwatches).
  function swatch(g, sx, sy, n, after) { swatches.push({ g, sx, sy, n, after }); }
  function flushSwatches() {
    const r = getRenderer();
    if (!r || !mesh || !swatches.length) return;
    const on = uniforms.uMaskOn.value;
    uniforms.uMaskOn.value = 0;
    for (const s of swatches.splice(0)) {
      const c = r.extract.canvas({ target: mesh, frame: new Rectangle(s.sx, s.sy, s.n, s.n), resolution: s.g.canvas.width / s.n });
      s.g.drawImage(c, 0, 0, s.g.canvas.width, s.g.canvas.height);
      s.after?.();
    }
    uniforms.uMaskOn.value = on;
  }

  function destroy() {
    for (const t of [cells, fields, track, solid]) t?.source.destroy();
    atlas?.destroy();
    noise.destroy(true);
  }

  return {
    load, markRect, markCell: (x, y) => markRect(x, y, x, y), update, setMask, setLook, swatch, flushSwatches, destroy,
    set onAtlas(fn) { onAtlas = fn; },
    get mesh() { return mesh; },
  };
}
