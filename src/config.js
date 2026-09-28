'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Carga un archivo .env simple (CLAVE=valor) sin dependencias externas.
// Las variables ya definidas en el entorno tienen prioridad.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function int(value, fallback, min = 1) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function list(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  return {
    tokkoApiKey: (env.TOKKO_API_KEY || '').trim(),
    port: int(env.PORT, 3000),
    refreshMinutes: int(env.REFRESH_MINUTES, 15),
    operation: (env.OPERATION || 'todas').trim().toLowerCase(),
    propertyTypes: list(env.PROPERTY_TYPES).map((t) => t.toLowerCase()),
    maxProperties: int(env.MAX_PROPERTIES, 40),
    sort: (env.SORT || 'recientes').trim().toLowerCase(),
    onlyWithPrice: /^(1|true|si|sí|yes)$/i.test(env.ONLY_WITH_PRICE || ''),
    display: {
      slideSeconds: int(env.SLIDE_SECONDS, 12, 3),
      photosPerProperty: int(env.PHOTOS_PER_PROPERTY, 4),
      agencyName: env.AGENCY_NAME || 'Mi Inmobiliaria',
      agencyPhone: env.AGENCY_PHONE || '',
      agencyWebsite: env.AGENCY_WEBSITE || '',
      agencyLogoUrl: env.AGENCY_LOGO_URL || '',
      accentColor: /^#[0-9a-f]{3,8}$/i.test(env.ACCENT_COLOR || '') ? env.ACCENT_COLOR : '#e4002b',
    },
  };
}

module.exports = { loadDotEnv, loadConfig, rootDir: path.resolve(__dirname, '..') };
