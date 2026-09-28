'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { themeFromLogo, luminance } = require('../src/theme');

test('sin logo usa los colores por defecto', () => {
  assert.equal(themeFromLogo([]).accentColor, '#e4002b');
});

test('logo azul marino y dorado: acento dorado, panel azul oscuro', () => {
  const t = themeFromLogo([{ hex: '#0a2342' }, { hex: '#d4af37' }]);
  assert.equal(t.accentColor, '#d4af37');
  assert.ok(luminance(t.panelColor) < 0.05);
});

test('el acento siempre se lee sobre fondo oscuro', () => {
  const t = themeFromLogo([{ hex: '#001030' }]);
  assert.ok(luminance(t.accentColor) >= 0.12);
});
