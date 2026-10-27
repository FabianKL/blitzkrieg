// De kaart gaat één keer over de lijn (instapbericht): lagen als run-length encoding in base64.

// ---------- Run-length encoding voor de eenmalige kaart-snapshot ----------
export function rleEncode(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return Uint8Array.from(out);
}

// 16-bit lagen (spoor, plantnummers) als bytes: paren [waarde, aantal] van elk 2 bytes,
// little-endian, zodat het overal hetzelfde leest
export function rleEncode16(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let n = 1;
    while (i + n < arr.length && arr[i + n] === arr[i] && n < 65535) n++;
    out.push(arr[i], n);
    i += n;
  }
  const bytes = new Uint8Array(out.length * 2);
  const view = new DataView(bytes.buffer);
  out.forEach((v, k) => view.setUint16(k * 2, v, true));
  return bytes;
}

export function rleDecode16(bytes, len) {
  const out = new Uint16Array(len);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    const v = view.getUint16(i, true), n = view.getUint16(i + 2, true);
    out.fill(v, p, p + n);
    p += n;
  }
  return out;
}

// Bytes <-> base64 (om binaire lagen in het JSON-instapbericht mee te sturen)
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function rleDecode(rle, len) {
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) {
    out.fill(rle[i], p, p + rle[i + 1]);
    p += rle[i + 1];
  }
  return out;
}
