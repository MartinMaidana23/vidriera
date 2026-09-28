'use strict';

const TOKKO_BASE = 'https://www.tokkobroker.com/api/v1/property/';
const PAGE_SIZE = 50;
// Tope de seguridad para no recorrer carteras enormes en cada actualización.
const MAX_PAGES = 20;

// Descarga todas las propiedades de la cuenta paginando la API de Tokko.
async function fetchTokkoProperties(apiKey, { fetchImpl = fetch } = {}) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(TOKKO_BASE);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', 'es_ar');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(page * PAGE_SIZE));

    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Tokko respondió ${res.status} ${res.statusText}`);
    }
    const body = await res.json();
    const objects = Array.isArray(body.objects) ? body.objects : [];
    all.push(...objects);

    const total = body.meta?.total_count ?? 0;
    if (objects.length < PAGE_SIZE || all.length >= total) break;
  }
  return all;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convierte una propiedad cruda de Tokko al formato que usa la cartelera.
function normalizeProperty(p) {
  const operations = (p.operations || []).map((op) => {
    const price = (op.prices || []).find((pr) => num(pr.price)) || null;
    return {
      type: op.operation_type || '',
      currency: price?.currency || '',
      price: price ? num(price.price) : null,
      period: price?.period || null,
    };
  });

  // Tokko marca con web_price=false las propiedades con precio "a consultar".
  if (p.web_price === false) {
    for (const op of operations) op.price = null;
  }

  const photos = (p.photos || [])
    .filter((ph) => ph && ph.image && !ph.is_blueprint)
    .sort((a, b) => {
      if (a.is_front_cover !== b.is_front_cover) return a.is_front_cover ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    })
    .map((ph) => ph.image);

  const surface = num(p.total_surface) || num(p.surface) || num(p.roofed_surface);

  return {
    id: p.id,
    code: p.reference_code || '',
    title: cleanText(p.publication_title) || [p.type?.name, p.location?.name].filter(Boolean).join(' en '),
    type: p.type?.name || '',
    address: p.fake_address || p.address || '',
    location: p.location?.short_location || p.location?.name || '',
    operations,
    rooms: num(p.room_amount),
    bedrooms: num(p.suite_amount),
    bathrooms: num(p.bathroom_amount),
    parking: num(p.parking_lot_amount),
    surface,
    roofedSurface: num(p.roofed_surface),
    description: cleanText(p.description).slice(0, 280),
    photos,
    createdAt: p.created_at || null,
  };
}

const OPERATION_ALIASES = {
  venta: 'venta',
  sale: 'venta',
  alquiler: 'alquiler',
  rent: 'alquiler',
  'alquiler temporario': 'alquiler temporario',
  temporario: 'alquiler temporario',
};

// Aplica los filtros y el orden configurados.
function selectProperties(properties, config) {
  const wantedOp = OPERATION_ALIASES[config.operation] || null;

  let result = properties
    .filter((p) => p.photos.length > 0)
    .map((p) => {
      if (!wantedOp) return p;
      return { ...p, operations: p.operations.filter((op) => op.type.toLowerCase() === wantedOp) };
    })
    .filter((p) => !wantedOp || p.operations.length > 0)
    .filter((p) => config.propertyTypes.length === 0 || config.propertyTypes.includes(p.type.toLowerCase()))
    .filter((p) => !config.onlyWithPrice || p.operations.some((op) => op.price));

  const mainPrice = (p) => p.operations.find((op) => op.price)?.price ?? null;
  switch (config.sort) {
    case 'precio_asc':
      result.sort((a, b) => (mainPrice(a) ?? Infinity) - (mainPrice(b) ?? Infinity));
      break;
    case 'precio_desc':
      result.sort((a, b) => (mainPrice(b) ?? -Infinity) - (mainPrice(a) ?? -Infinity));
      break;
    case 'aleatorio':
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      break;
    default:
      result.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  return result.slice(0, config.maxProperties);
}

module.exports = { fetchTokkoProperties, normalizeProperty, selectProperties };
