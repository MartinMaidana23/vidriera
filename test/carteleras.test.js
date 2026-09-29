'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { loadCarteleras, buildSlides } = require('../src/data');
const { normalizeDevelopment, normalizeProperty, deliveryLabel } = require('../src/tokko');

function tmpJson(obj) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cart-')), 'carteleras.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

const photo = [{ image: 'a.jpg', order: 0 }];
const prop = (id, extra) => ({ id, reference_code: `P${id}`, type: { name: 'Casa' }, operations: [{ operation_type: 'Venta', prices: [{ currency: 'USD', price: 100000 }] }], photos: photo, ...extra });

test('cada cartelera tiene sus propios filtros', () => {
  const file = tmpJson({ carteleras: [
    { ruta: '', soloDestacadas: true },
    { ruta: 'credito', soloAptoCredito: true },
    { ruta: 'emprendimientos', tipo: 'emprendimientos', excluir: ['QUO Maschwitz'] },
  ] });
  const [dest, cred, emp] = loadCarteleras(loadConfig({}), file);
  const sources = {
    rawProperties: [
      prop(1, { is_starred_on_web: true }),
      prop(2, { credit_eligible: 'Apto crédito' }),
      prop(3, {}),
      prop(4, { development: { id: 10 }, room_amount: 2, operations: [{ operation_type: 'Venta', prices: [{ currency: 'USD', price: 30000 }] }] }),
      prop(5, { development: { id: 10 }, room_amount: 3, operations: [{ operation_type: 'Venta', prices: [{ currency: 'USD', price: 45000 }] }] }),
    ],
    rawDevelopments: [
      { id: 10, name: 'Solara', photos: photo, web_url: 'https://web/d/10' },
      { id: 11, name: 'QUO Maschwitz', photos: photo },
    ],
  };
  assert.deepEqual(buildSlides(sources, dest).map((p) => p.id), [1]);
  const credit = buildSlides(sources, cred);
  assert.deepEqual(credit.map((p) => p.id), [2]);
  assert.equal(credit[0].stamp, '✓ Apto crédito');

  const devs = buildSlides(sources, emp);
  assert.deepEqual(devs.map((d) => d.name), ['Solara']);
  assert.equal(devs[0].operations[0].price, 30000);
  assert.equal(devs[0].operations[0].from, true);
  assert.equal(devs[0].units, 2);
  assert.equal(devs[0].url, 'https://web/d/10');
});

test('rutas inválidas en carteleras.json dan error claro', () => {
  assert.throws(() => loadCarteleras(loadConfig({}), tmpJson({ carteleras: [{ ruta: 'Con Espacios' }] })), /ruta inválida/);
});

test('emprendimiento: financiación, amenities y entrega', () => {
  const units = [normalizeProperty(prop(1, { development: { id: 7 }, type: { name: 'Terreno' } }))];
  const d = normalizeDevelopment({
    id: 7, name: 'Altos', photos: photo, financing_details: '30% y 36 cuotas', construction_date: '2027-10-01',
    tags: [{ name: 'Parrilla', type: 3 }, { name: 'En construcción', type: 3 }, { name: 'Pileta Comunitaria', type: 3 }],
  }, units, { now: new Date('2026-09-29') });
  assert.equal(d.stamp, 'Financiación: 30% y 36 cuotas');
  assert.deepEqual(d.amenities, ['Pileta', 'Parrilla']);
  assert.equal(d.delivery, 'Octubre 2027');
  assert.equal(d.type, 'Lotes');
});

test('una fecha de entrega vencida no se anuncia', () => {
  const now = new Date('2026-09-29');
  assert.equal(deliveryLabel('2025-12-01', now), '');
  assert.equal(deliveryLabel('2026-09-01', now), 'Septiembre 2026');
  assert.equal(deliveryLabel(null, now), '');
});
