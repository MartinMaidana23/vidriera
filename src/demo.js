'use strict';

// Propiedades de ejemplo con la misma forma que devuelve la API de Tokko.
// Se usan cuando no hay TOKKO_API_KEY configurada.

const PALETTES = [
  ['#1d3557', '#457b9d', '#a8dadc'],
  ['#264653', '#2a9d8f', '#e9c46a'],
  ['#3d405b', '#81b29a', '#f2cc8f'],
  ['#22223b', '#4a4e69', '#c9ada7'],
  ['#283618', '#606c38', '#dda15e'],
  ['#003049', '#d62828', '#fcbf49'],
];

// Ilustración SVG simple de una fachada, para no depender de imágenes externas.
function demoPhotoSvg(n) {
  const [dark, mid, light] = PALETTES[n % PALETTES.length];
  const floors = 2 + (n % 5);
  const windows = [];
  for (let f = 0; f < floors; f++) {
    for (let w = 0; w < 4; w++) {
      windows.push(
        `<rect x="${560 + w * 110}" y="${800 - (f + 1) * 120}" width="70" height="80" rx="4" fill="${light}" opacity="${0.55 + ((f + w + n) % 3) * 0.15}"/>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <circle cx="${1250 - (n % 4) * 120}" cy="200" r="90" fill="#fff" opacity="0.35"/>
  <rect x="520" y="${800 - floors * 120 - 40}" width="480" height="${floors * 120 + 40}" fill="${dark}"/>
  ${windows.join('\n  ')}
  <rect x="0" y="800" width="1600" height="200" fill="${dark}" opacity="0.85"/>
  <text x="800" y="930" font-family="sans-serif" font-size="44" fill="#fff" opacity="0.6" text-anchor="middle">Foto de ejemplo ${n + 1}</text>
</svg>`;
}

const SAMPLES = [
  ['Departamento', 'Venta', 'USD', 145000, 'Palermo', 'Gorriti 4800', 3, 2, 1, 78, 70, 'Luminoso 3 ambientes con balcón al frente, cocina integrada y amenities.'],
  ['Casa', 'Venta', 'USD', 320000, 'Olivos', 'Av. Maipú 2100', 5, 3, 2, 240, 180, 'Casa en dos plantas con jardín, pileta y quincho. Ideal familia.'],
  ['PH', 'Alquiler', 'ARS', 650000, 'Villa Crespo', 'Thames 300', 3, 2, 1, 95, 75, 'PH al frente sin expensas, terraza propia con parrilla.'],
  ['Departamento', 'Alquiler', 'ARS', 480000, 'Caballito', 'Av. Rivadavia 5400', 2, 1, 1, 48, 45, 'Monoambiente divisible a estrenar, a metros del subte A.'],
  ['Local', 'Venta', 'USD', 210000, 'Belgrano', 'Av. Cabildo 1800', null, null, 1, 120, 120, 'Local a la calle con vidriera amplia y depósito. Excelente ubicación comercial.'],
  ['Departamento', 'Venta', 'USD', 98000, 'Almagro', 'Medrano 900', 2, 1, 1, 42, 40, 'Dos ambientes reciclado a nuevo, apto crédito.'],
];

function demoRawProperties() {
  return SAMPLES.map(([type, op, currency, price, location, address, rooms, bedrooms, baths, total, roofed, desc], i) => ({
    id: 900000 + i,
    reference_code: `DEMO${String(i + 1).padStart(3, '0')}`,
    publication_title: `${type} ${rooms ? `${rooms} ambientes ` : ''}en ${location}`,
    type: { name: type },
    fake_address: address,
    location: { name: location, short_location: `Capital Federal | ${location}` },
    operations: [{ operation_type: op, prices: [{ currency, price, period: op === 'Alquiler' ? 'mensual' : null }] }],
    web_price: i !== 1,
    room_amount: rooms,
    suite_amount: bedrooms,
    bathroom_amount: baths,
    parking_lot_amount: i % 2,
    total_surface: total,
    roofed_surface: roofed,
    description: desc,
    photos: [0, 1, 2].map((k) => ({
      image: `/demo/photo/${i * 3 + k}.svg`,
      is_front_cover: k === 0,
      order: k,
    })),
    created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
  }));
}

module.exports = { demoRawProperties, demoPhotoSvg };
