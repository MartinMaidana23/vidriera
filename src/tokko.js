'use strict';

const TOKKO_API = 'https://www.tokkobroker.com/api/v1/';
const PAGE_SIZE = 50;
// Tope de seguridad para no recorrer carteras enormes en cada actualización.
const MAX_PAGES = 20;
const MIN_REAL_PRICE = 1000;

// Descarga todas las propiedades de la cuenta paginando la API de Tokko.
// Tokko a veces responde 5xx por unos segundos: se reintenta antes de dar error.
async function fetchWithRetry(url, fetchImpl, retryDelaysMs) {
  for (let attempt = 0; ; attempt++) {
    let res = null;
    let error = null;
    try {
      res = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      error = err;
    }
    const retriable = error || res.status >= 500 || res.status === 429;
    if (!retriable || attempt >= retryDelaysMs.length) {
      if (error) throw error;
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
  }
}

// Descarga todos los objetos de un listado de la API (property, development) paginando.
async function fetchTokkoList(resource, apiKey, { fetchImpl = fetch, retryDelaysMs = [5_000, 15_000, 30_000] } = {}) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${resource}/`, TOKKO_API);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', 'es_ar');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(page * PAGE_SIZE));

    const res = await fetchWithRetry(url, fetchImpl, retryDelaysMs);
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

const fetchTokkoProperties = (apiKey, opts) => fetchTokkoList('property', apiKey, opts);
const fetchTokkoDevelopments = (apiKey, opts) => fetchTokkoList('development', apiKey, opts);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "G.B.A. Zona Norte | Escobar | Belen De Escobar" -> "Belen De Escobar, Escobar"
function shortLocation(location) {
  const parts = String(location?.short_location || location?.full_location || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    // Regiones demasiado generales para una vidriera de barrio
    .filter((s, i, arr) => arr.length === 1 || !/^(argentina|g\.?b\.?a\.?\b|capital federal)/i.test(s));
  if (parts.length === 0) return location?.name || '';
  return parts.slice(-2).reverse().filter((s, i, arr) => arr.indexOf(s) === i).join(', ');
}

function sortPhotos(photos) {
  return (photos || [])
    .filter((ph) => ph && ph.image && !ph.is_blueprint)
    .sort((a, b) => {
      if (a.is_front_cover !== b.is_front_cover) return a.is_front_cover ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    })
    .map((ph) => ph.image);
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
  // Los precios simbólicos (USD 1, USD 16...) también se muestran como "a consultar".
  for (const op of operations) {
    if (p.web_price === false || (op.price && op.price < MIN_REAL_PRICE)) op.price = null;
  }

  const photos = sortPhotos(p.photos);

  const surface = num(p.total_surface) || num(p.surface) || num(p.roofed_surface);

  return {
    id: p.id,
    // Algunos códigos traen el del portal pegado: "MMD-183::ZP-M-565" -> "MMD-183"
    code: String(p.reference_code || '').split('::')[0],
    featured: Boolean(p.is_starred_on_web),
    title: cleanText(p.publication_title) || [p.type?.name, p.location?.name].filter(Boolean).join(' en '),
    type: p.type?.name || '',
    address: p.fake_address || p.address || '',
    location: shortLocation(p.location),
    operations,
    rooms: num(p.room_amount),
    bedrooms: num(p.suite_amount),
    bathrooms: num(p.bathroom_amount),
    parking: num(p.parking_lot_amount),
    surface,
    roofedSurface: num(p.roofed_surface),
    description: cleanText(p.description).slice(0, 280),
    creditEligible: /^apto/i.test(String(p.credit_eligible || '')),
    stamp: /^apto/i.test(String(p.credit_eligible || '')) ? '✓ Apto crédito' : '',
    developmentId: p.development?.id || null,
    publicUrl: p.public_url || '',
    // Parte final de la URL de la web de la inmobiliaria (sitio web de Tokko):
    // /p/8448707-Local-en-Alquiler-en-Belen-De-Escobar-Sarmiento-al-400
    webPath: `/p/${p.id}-${slugify([p.type?.name, 'en', p.operations?.[0]?.operation_type, 'en', p.location?.name, p.fake_address || p.address].filter(Boolean).join(' '))}`,
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
    .filter((p) => !config.onlyFeatured || p.featured)
    .filter((p) => !config.onlyCreditEligible || p.creditEligible)
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

// Amenities que vale la pena anunciar, en orden de importancia (nombre de etiqueta en Tokko -> texto).
const AMENITIES = [
  { label: 'Pileta', tags: ['pileta', 'pileta comunitaria', 'pileta descubierta', 'pileta cubierta'] },
  { label: 'Gimnasio', tags: ['gimnasio'] },
  { label: 'SUM', tags: ['sum'] },
  { label: 'Solarium', tags: ['solarium'] },
  { label: 'Parrilla', tags: ['parrilla', 'zona de parrillas', 'parrilla techada', 'parrilla individual en departamento'] },
  { label: 'Seguridad', tags: ['seguridad 24hs', 'seguridad'] },
  { label: 'Club House', tags: ['club house'] },
  { label: 'Cancha de fútbol', tags: ['cancha de futbol'] },
  { label: 'Espacios verdes', tags: ['zonas verdes', 'area recreativa'] },
  { label: 'Ascensor', tags: ['ascensor'] },
];

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const UNIT_PLURALS = { departamento: 'Departamentos', terreno: 'Lotes', local: 'Locales', casa: 'Casas',
  oficina: 'Oficinas', cochera: 'Cocheras', ph: 'PH', 'galpón': 'Galpones' };

function comparable(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// "2028-10-01" -> "Octubre 2028" (sólo si la fecha no pasó: una entrega vencida no se anuncia)
function deliveryLabel(date, now = new Date()) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!m) return '';
  const year = Number(m[1]), month = Number(m[2]);
  if (year * 12 + month < now.getFullYear() * 12 + now.getMonth() + 1) return '';
  return `${MONTHS[month - 1]} ${year}`;
}

// Convierte un emprendimiento de Tokko en una "placa" de la cartelera, resumiendo sus
// unidades a la venta (propiedades de Tokko vinculadas al emprendimiento).
function normalizeDevelopment(d, units, { now } = {}) {
  const own = units.filter((u) => u.developmentId === d.id);

  // Precio "desde": el menor de las unidades, en la moneda que más usan.
  const prices = own.flatMap((u) => u.operations.filter((op) => op.price).map((op) => op));
  const byCurrency = {};
  for (const op of prices) (byCurrency[op.currency] = byCurrency[op.currency] || []).push(op.price);
  const currency = Object.keys(byCurrency).sort((a, b) => byCurrency[b].length - byCurrency[a].length)[0];
  const minPrice = currency ? Math.min(...byCurrency[currency]) : null;

  const rooms = own.map((u) => u.rooms).filter(Boolean);
  const typeCounts = {};
  for (const u of own) typeCounts[u.type] = (typeCounts[u.type] || 0) + 1;
  const mainUnitType = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a])[0];

  const tagNames = (d.tags || []).map((t) => comparable(t.name));
  const amenities = AMENITIES.filter((a) => a.tags.some((t) => tagNames.includes(t)))
    .map((a) => a.label)
    .slice(0, 3);
  const financing = cleanText(d.financing_details);

  const unitsLabel = mainUnitType && UNIT_PLURALS[comparable(mainUnitType)];
  return {
    kind: 'development',
    id: d.id,
    name: d.name || '',
    code: String(d.reference_code || '').split('::')[0],
    featured: Boolean(d.is_starred_on_web),
    title: cleanText(d.name) || cleanText(d.publication_title),
    type: unitsLabel || d.type?.name || '',
    // Los precios de las unidades de los emprendimientos son anticipos.
    fromLabel: 'Anticipo desde',
    address: String(d.fake_address || d.address || '').trim(),
    location: shortLocation(d.location),
    operations: [{ type: 'Desarrollos en pozo', currency: currency || '', price: minPrice, period: null, from: true }],
    units: own.length,
    roomsMin: rooms.length ? Math.min(...rooms) : null,
    roomsMax: rooms.length ? Math.max(...rooms) : null,
    delivery: deliveryLabel(d.construction_date, now),
    amenities,
    description: cleanText(d.description || d.publication_title).slice(0, 280),
    creditEligible: false,
    stamp: financing ? `Financiación: ${financing}` : '',
    url: d.web_url || '',
    photos: sortPhotos(d.photos),
    createdAt: null,
  };
}

function selectDevelopments(developments, config) {
  const excluded = (config.exclude || []).map(comparable);
  return developments
    .filter((d) => d.photos.length > 0)
    .filter((d) => !excluded.includes(comparable(d.name)))
    .filter((d) => !config.onlyFeatured || d.featured)
    .slice(0, config.maxProperties);
}

// Datos de la inmobiliaria tomados de la sucursal (branch) que más propiedades tiene.
function extractAgency(rawProperties) {
  const counts = new Map();
  for (const p of rawProperties) {
    if (!p.branch?.id) continue;
    const entry = counts.get(p.branch.id) || { branch: p.branch, n: 0 };
    entry.n++;
    counts.set(p.branch.id, entry);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) return null;
  const b = top.branch;
  return {
    name: b.display_name || b.name || '',
    phone: formatPhone(b.phone_area, b.phone),
    email: b.email || '',
    logoUrl: b.logo || '',
  };
}

// ("348", "4312950") -> "(348) 431-2950"
function formatPhone(area, number) {
  const n = String(number || '').replace(/\D/g, '');
  if (!n) return '';
  const pretty = n.length > 4 ? `${n.slice(0, -4)}-${n.slice(-4)}` : n;
  const a = String(area || '').replace(/\D/g, '');
  return a ? `(${a}) ${pretty}` : pretty;
}

module.exports = {
  fetchTokkoProperties,
  fetchTokkoDevelopments,
  normalizeProperty,
  normalizeDevelopment,
  selectProperties,
  selectDevelopments,
  extractAgency,
  deliveryLabel,
};
