'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProperty, selectProperties, fetchTokkoProperties, extractAgency } = require('../src/tokko');
const { loadConfig } = require('../src/config');
const { demoRawProperties } = require('../src/demo');

const raw = {
  id: 1,
  reference_code: 'ABC123',
  publication_title: '<b>Depto</b> 3 amb&nbsp;Palermo',
  type: { name: 'Departamento' },
  fake_address: 'Gorriti 4800',
  location: { name: 'Belen De Escobar', short_location: 'G.B.A. Zona Norte | Escobar | Belen De Escobar' },
  operations: [
    { operation_type: 'Venta', prices: [{ currency: 'USD', price: 145000 }] },
    { operation_type: 'Alquiler', prices: [{ currency: 'ARS', price: 0 }] },
  ],
  room_amount: 3,
  suite_amount: 2,
  bathroom_amount: 1,
  total_surface: '78.00',
  photos: [
    { image: 'b.jpg', order: 1 },
    { image: 'plano.jpg', order: 0, is_blueprint: true },
    { image: 'a.jpg', order: 2, is_front_cover: true },
  ],
};

test('normaliza una propiedad de Tokko', () => {
  const p = normalizeProperty(raw);
  assert.equal(p.title, 'Depto 3 amb Palermo');
  assert.equal(p.code, 'ABC123');
  assert.equal(p.surface, 78);
  assert.equal(p.location, 'Belen De Escobar, Escobar');
  assert.deepEqual(p.photos, ['a.jpg', 'b.jpg']);
  assert.deepEqual(p.operations[0], { type: 'Venta', currency: 'USD', price: 145000, period: null });
  assert.equal(p.operations[1].price, null);
});

test('web_price=false oculta el precio', () => {
  const p = normalizeProperty({ ...raw, web_price: false });
  assert.ok(p.operations.every((op) => op.price === null));
});

test('filtra por operación, tipo y precio', () => {
  const props = demoRawProperties().map(normalizeProperty);
  const base = loadConfig({});

  const rentals = selectProperties(props, { ...base, operation: 'alquiler' });
  assert.ok(rentals.length > 0);
  assert.ok(rentals.every((p) => p.operations.every((op) => op.type === 'Alquiler')));

  const houses = selectProperties(props, { ...base, propertyTypes: ['casa'] });
  assert.ok(houses.every((p) => p.type === 'Casa'));

  const priced = selectProperties(props, { ...base, onlyWithPrice: true });
  assert.ok(priced.every((p) => p.operations.some((op) => op.price)));

  const asc = selectProperties(props, { ...base, sort: 'precio_asc', operation: 'venta' });
  const prices = asc.map((p) => p.operations[0].price).filter(Boolean);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

  assert.equal(selectProperties(props, { ...base, maxProperties: 2 }).length, 2);
});

test('descarta propiedades sin fotos', () => {
  const p = normalizeProperty({ ...raw, photos: [] });
  assert.equal(selectProperties([p], loadConfig({})).length, 0);
});

test('pagina la API de Tokko hasta total_count', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url.searchParams.get('offset'));
    const offset = Number(url.searchParams.get('offset'));
    const count = offset === 0 ? 50 : 10;
    return {
      ok: true,
      json: async () => ({ meta: { total_count: 60 }, objects: Array.from({ length: count }, (_, i) => ({ id: offset + i })) }),
    };
  };
  const all = await fetchTokkoProperties('KEY', { fetchImpl: fakeFetch });
  assert.equal(all.length, 60);
  assert.deepEqual(calls, ['0', '50']);
});

test('informa errores HTTP de Tokko', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized' });
  await assert.rejects(fetchTokkoProperties('MAL', { fetchImpl: fakeFetch }), /401/);
});

test('toma los datos de la inmobiliaria de la sucursal de Tokko', () => {
  const branch = { id: 7, display_name: 'Maidana propiedades', phone_area: '348', phone: '4312950', email: 'info@x.com', logo: 'logo.png' };
  const agency = extractAgency([{ branch }, { branch }, { branch: { id: 8, name: 'Otra' } }]);
  assert.deepEqual(agency, { name: 'Maidana propiedades', phone: '(348) 431-2950', email: 'info@x.com', logoUrl: 'logo.png' });
  assert.equal(extractAgency([{}]), null);
});
