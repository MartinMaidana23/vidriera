'use strict';

const zlib = require('node:zlib');

// Extrae los colores principales de un logo PNG, sin dependencias externas.

function decodePng(buf) {
  const SIGNATURE = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== SIGNATURE) throw new Error('El logo no es PNG');

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error('Formato de PNG no soportado');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('Tipo de color PNG no soportado');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
    prev = out;
  }

  // Devuelve un iterador de [r, g, b, alpha]
  return function* rgba() {
    for (let i = 0; i < width * height; i++) {
      const o = i * channels;
      if (colorType === 0) yield [pixels[o], pixels[o], pixels[o], 255];
      else if (colorType === 2) yield [pixels[o], pixels[o + 1], pixels[o + 2], 255];
      else if (colorType === 4) yield [pixels[o], pixels[o], pixels[o], pixels[o + 1]];
      else if (colorType === 6) yield [pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]];
      else {
        const idx = pixels[o];
        yield [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255];
      }
    }
  };
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hsl([r, g, b]) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

// Agrupa los píxeles en colores parecidos y devuelve los de marca (sin blancos ni grises),
// ordenados por cuánto aparecen.
function brandColors(rgbaIterator) {
  const buckets = new Map();
  for (const [r, g, b, a] of rgbaIterator()) {
    if (a < 128) continue;
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const colors = [...buckets.values()]
    .map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], n: e.n }))
    .map((c) => ({ ...c, ...hsl(c.rgb) }))
    .filter((c) => c.s > 0.25 && c.l > 0.08 && c.l < 0.92)
    .sort((a, b) => b.n - a.n);

  // Fusiona tonos casi iguales para quedarse con colores distintos entre sí.
  const distinct = [];
  for (const c of colors) {
    const same = distinct.find((d) => Math.min(Math.abs(d.h - c.h), 360 - Math.abs(d.h - c.h)) < 25 && Math.abs(d.l - c.l) < 0.25);
    if (same) same.n += c.n;
    else distinct.push({ ...c });
  }
  return distinct.sort((a, b) => b.n - a.n).map((c) => ({ hex: toHex(c.rgb), l: c.l, share: c.n }));
}

async function logoColors(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Logo: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return brandColors(decodePng(buf));
}

module.exports = { logoColors, decodePng, brandColors };
