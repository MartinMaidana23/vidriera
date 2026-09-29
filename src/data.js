'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  fetchTokkoProperties,
  fetchTokkoDevelopments,
  normalizeProperty,
  normalizeDevelopment,
  selectProperties,
  selectDevelopments,
  extractAgency,
} = require('./tokko');
const { demoRawProperties } = require('./demo');
const { rootDir } = require('./config');
const { logoColors, analyzeLogo, decodePng } = require('./logo-colors');
const { themeFromLogo, textOn } = require('./theme');

// Lee carteleras.json y arma la configuración completa de cada cartelera
// (la general de .env más los filtros propios). Sin archivo, hay una sola cartelera con lo de .env.
function loadCarteleras(config, file = path.join(rootDir, 'carteleras.json')) {
  if (!fs.existsSync(file)) return [{ ruta: '', nombre: 'Cartelera', tipo: 'propiedades', config }];
  const { carteleras } = JSON.parse(fs.readFileSync(file, 'utf8'));
  return carteleras.map((c) => {
    const ruta = String(c.ruta || '').replace(/^\/+|\/+$/g, '');
    if (!/^[a-z0-9-]*$/.test(ruta)) throw new Error(`carteleras.json: ruta inválida "${c.ruta}" (usar minúsculas, números y guiones)`);
    return {
      ruta,
      nombre: c.nombre || ruta || 'Cartelera',
      tipo: c.tipo === 'emprendimientos' ? 'emprendimientos' : 'propiedades',
      config: {
        ...config,
        onlyFeatured: Boolean(c.soloDestacadas),
        onlyCreditEligible: Boolean(c.soloAptoCredito),
        onlyWithPrice: c.conPrecio ?? config.onlyWithPrice,
        operation: String(c.operacion || config.operation).toLowerCase(),
        propertyTypes: Array.isArray(c.tipos) ? c.tipos.map((t) => String(t).toLowerCase()) : config.propertyTypes,
        sort: String(c.orden || config.sort).toLowerCase(),
        maxProperties: Number(c.maximo) > 0 ? Number(c.maximo) : config.maxProperties,
        exclude: Array.isArray(c.excluir) ? c.excluir : [],
        splitSurfaces: Boolean(c.superficiesSeparadas),
      },
    };
  });
}

async function readLogo(logoUrl) {
  if (!logoUrl) return { palette: [], opaqueRatio: 0 };
  try {
    const logo = /^https?:/.test(logoUrl)
      ? await logoColors(logoUrl)
      : analyzeLogo(decodePng(fs.readFileSync(path.join(rootDir, 'public', logoUrl.replace(/^\/+/, '')))));
    console.log(`Colores del logo: ${logo.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join(', ') || '(ninguno)'}`);
    return logo;
  } catch (err) {
    console.error(`No se pudieron leer los colores del logo: ${err.message}`);
    return { palette: [], opaqueRatio: 0 };
  }
}

// Descarga de Tokko todo lo que necesitan las carteleras (una sola vez para todas).
async function loadSources(config, carteleras) {
  const demo = !config.tokkoApiKey;
  const needsDevelopments = carteleras.some((c) => c.tipo === 'emprendimientos');
  const [rawProperties, rawDevelopments] = demo
    ? [demoRawProperties(), []]
    : await Promise.all([
      fetchTokkoProperties(config.tokkoApiKey),
      needsDevelopments ? fetchTokkoDevelopments(config.tokkoApiKey) : [],
    ]);
  const agency = extractAgency(rawProperties);
  const logo = await readLogo(config.display.agencyLogoUrl || agency?.logoUrl);
  return {
    demo,
    rawProperties,
    rawDevelopments,
    agency,
    theme: themeFromLogo(logo.palette, logo.opaqueRatio),
  };
}

// Las placas (propiedades o emprendimientos) que muestra una cartelera.
function buildSlides(sources, cartelera) {
  const { config } = cartelera;
  const units = sources.rawProperties.map(normalizeProperty);
  if (cartelera.tipo === 'emprendimientos') {
    return selectDevelopments(sources.rawDevelopments.map((d) => normalizeDevelopment(d, units)), config);
  }
  return selectProperties(units, config).map(({ webPath, publicUrl, developmentId, ...p }) => ({
    ...p,
    url: config.websiteUrl ? config.websiteUrl + webPath : publicUrl,
  }));
}

// Configuración que recibe la pantalla. Lo que esté en .env tiene prioridad;
// si falta, se usan los datos de la sucursal cargados en Tokko y los colores del logo.
function displayConfig(config, agency, demo, theme) {
  const d = config.display;
  const a = agency || {};
  const t = theme || themeFromLogo([]);
  return {
    ...d,
    agencyName: d.agencyName || a.name || 'Mi Inmobiliaria',
    agencyPhone: d.agencyPhone || a.phone || '',
    agencyWebsite: d.agencyWebsite || a.email || '',
    agencyLogoUrl: d.agencyLogoUrl || a.logoUrl || '',
    accentColor: d.accentColor || t.accentColor,
    accentText: d.accentColor ? textOn(d.accentColor, '#111111') : t.accentText,
    panelColor: d.panelColor || t.panelColor,
    creditColor: d.creditColor || t.creditColor,
    creditText: d.creditColor ? textOn(d.creditColor, '#111111') : t.creditText,
    logoBackground: t.logoBackground,
    splitSurfaces: Boolean(config.splitSurfaces),
    demo,
    refreshMinutes: config.refreshMinutes,
  };
}

module.exports = { loadCarteleras, loadSources, buildSlides, displayConfig };
