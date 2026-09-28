'use strict';

const { fetchTokkoProperties, normalizeProperty, selectProperties, extractAgency } = require('./tokko');
const { demoRawProperties } = require('./demo');

// Descarga (o genera en modo demo) y filtra las propiedades a mostrar.
async function loadData(config) {
  const demo = !config.tokkoApiKey;
  const raw = demo ? demoRawProperties() : await fetchTokkoProperties(config.tokkoApiKey);
  return {
    demo,
    total: raw.length,
    properties: selectProperties(raw.map(normalizeProperty), config),
    agency: extractAgency(raw),
  };
}

// Configuración que recibe la pantalla. Lo que esté en .env tiene prioridad;
// si falta, se usan los datos de la sucursal cargados en Tokko.
function displayConfig(config, agency, demo) {
  const d = config.display;
  const a = agency || {};
  return {
    ...d,
    agencyName: d.agencyName || a.name || 'Mi Inmobiliaria',
    agencyPhone: d.agencyPhone || a.phone || '',
    agencyWebsite: d.agencyWebsite || a.email || '',
    agencyLogoUrl: d.agencyLogoUrl || a.logoUrl || '',
    demo,
    refreshMinutes: config.refreshMinutes,
  };
}

module.exports = { loadData, displayConfig };
