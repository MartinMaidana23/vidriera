'use strict';

// Arma la paleta de la cartelera a partir de los colores del logo.
// La pantalla es oscura (se lee mejor de lejos), así que:
//  - el fondo del panel es el color oscuro de la marca (o el principal oscurecido);
//  - el acento tiene que verse bien sobre ese fondo;
//  - los textos sobre el acento son claros u oscuros según haga falta.

const DEFAULTS = {
  accentColor: '#e4002b',
  accentText: '#ffffff',
  panelColor: '#101418',
  creditColor: '#1f9d55',
  creditText: '#ffffff',
  logoBackground: '#ffffff',
};

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

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Aclara un color hasta que tenga contraste suficiente sobre el fondo.
function readableOn(hex, background) {
  let c = hex;
  for (let i = 0; i < 12 && contrast(c, background) < 3; i++) c = mix(c, '#ffffff', 0.85);
  return c;
}

function textOn(hex, dark) {
  return contrast('#ffffff', hex) >= contrast(dark, hex) ? '#ffffff' : dark;
}

// El logo se muestra tal cual si tiene fondo propio o si es claro (se lee sobre el fondo
// oscuro); sólo un logo transparente y oscuro necesita un recuadro blanco.
function logoBackground(palette, opaqueRatio) {
  if (opaqueRatio > 0.9) return 'transparent';
  return palette[0] && palette[0].l > 0.5 ? 'transparent' : '#ffffff';
}

// palette: [{ hex, s, l, share }] ordenada por presencia en el logo.
// opaqueRatio: qué parte del logo es opaca (≈1 si el logo tiene fondo propio).
function themeFromLogo(palette, opaqueRatio = 0) {
  if (!palette || palette.length === 0) return { ...DEFAULTS };
  const bg = logoBackground(palette, opaqueRatio);

  const vivid = palette.filter((c) => c.s > 0.25 && c.l > 0.08 && c.l < 0.92);
  const darks = palette.filter((c) => c.l < 0.3);
  const lights = palette.filter((c) => c.l > 0.7);

  let panelColor;
  let accentSource;
  let creditSource;
  if (vivid.length > 0) {
    // Logo con colores: el principal da el acento y un tono oscuro de él, el fondo.
    const primary = vivid[0].hex;
    const secondary = vivid[1]?.hex;
    panelColor = darks[0] ? mix(darks[0].hex, '#0b0d10', 0.7) : mix(primary, '#0b0d10', 0.18);
    accentSource = luminance(primary) >= 0.12 || !secondary ? primary : secondary;
    creditSource = secondary && secondary !== accentSource ? secondary : accentSource;
  } else {
    // Logo monocromático (ej. gris carbón y crema): fondo oscuro de la marca y acento claro.
    panelColor = darks[0] ? darks[0].hex : DEFAULTS.panelColor;
    accentSource = lights[0] ? lights[0].hex : '#ffffff';
    creditSource = accentSource;
  }

  const accentColor = readableOn(accentSource, panelColor);
  const creditColor = readableOn(creditSource, panelColor);
  const dark = mix(panelColor, '#000000', 0.8);
  return {
    accentColor,
    accentText: textOn(accentColor, dark),
    panelColor,
    creditColor,
    creditText: textOn(creditColor, dark),
    logoBackground: bg,
  };
}

module.exports = { themeFromLogo, luminance, contrast, textOn };
