'use strict';

// Arma la paleta de la cartelera a partir de los colores del logo.
// La pantalla es oscura (se lee mejor de lejos), así que:
//  - el color de acento tiene que verse sobre fondo oscuro;
//  - el fondo del panel es el color de marca oscurecido;
//  - la etiqueta "Apto crédito" usa el segundo color de marca.

const DEFAULTS = { accentColor: '#e4002b', panelColor: '#101418', creditColor: '#1f9d55' };

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function mix(hexA, hexB, weightA) {
  const a = parse(hexA), b = parse(hexB);
  return toHex(a.map((v, i) => v * weightA + b[i] * (1 - weightA)));
}

function luminance(hex) {
  const [r, g, b] = parse(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Aclara un color hasta que tenga contraste suficiente sobre el fondo oscuro.
function readableOnDark(hex) {
  let c = hex;
  for (let i = 0; i < 10 && luminance(c) < 0.12; i++) c = mix(c, '#ffffff', 0.85);
  return c;
}

function themeFromLogo(palette) {
  if (!palette || palette.length === 0) return { ...DEFAULTS };
  const primary = palette[0].hex;
  const secondary = palette[1]?.hex;
  const accentSource = luminance(primary) >= 0.12 || !secondary ? primary : secondary;
  return {
    accentColor: readableOnDark(accentSource),
    panelColor: mix(primary, '#0b0d10', luminance(primary) < 0.05 ? 0.55 : 0.18),
    creditColor: readableOnDark(secondary && secondary !== accentSource ? secondary : primary),
  };
}

module.exports = { themeFromLogo, luminance };
