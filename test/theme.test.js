'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { themeFromLogo, luminance, contrast } = require('../src/theme');

test('sin logo usa los colores por defecto', () => {
  assert.equal(themeFromLogo([]).accentColor, '#e4002b');
});

test('logo monocromático gris carbón y crema (como el de Maidana)', () => {
  const t = themeFromLogo([
    { hex: '#232221', s: 0.03, l: 0.13, share: 0.894 },
    { hex: '#eae8df', s: 0.21, l: 0.9, share: 0.101 },
  ], 1);
  assert.equal(t.panelColor, '#232221');
  assert.equal(t.accentColor, '#eae8df');
  assert.notEqual(t.accentText, '#ffffff'); // texto oscuro sobre la etiqueta crema
  assert.ok(contrast(t.accentText, t.accentColor) >= 4.5);
  assert.equal(t.logoBackground, 'transparent'); // el logo ya tiene su fondo
});

test('logo con colores: acento del color de marca, fondo oscuro', () => {
  const t = themeFromLogo([
    { hex: '#0a2342', s: 0.74, l: 0.15, share: 0.6 },
    { hex: '#d4af37', s: 0.65, l: 0.52, share: 0.3 },
  ], 0.4);
  assert.equal(t.accentColor, '#d4af37');
  assert.ok(luminance(t.panelColor) < 0.05);
  assert.equal(t.logoBackground, '#ffffff'); // logo transparente: recuadro claro
});

test('el acento siempre se lee sobre el fondo', () => {
  const t = themeFromLogo([{ hex: '#001030', s: 1, l: 0.09, share: 1 }]);
  assert.ok(contrast(t.accentColor, t.panelColor) >= 3);
});
