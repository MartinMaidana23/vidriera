'use strict';

const { fetchTokkoProperties, normalizeProperty, selectProperties, extractAgency } = require('./tokko');
const { demoRawProperties } = require('./demo');
const { logoColors } = require('./logo-colors');
const { themeFromLogo, textOn } = require('./theme');

// Descarga (o genera en modo demo) y filtra las propiedades a mostrar.
async function loadData(config) {
  const demo = !config.tokkoApiKey;
  const raw = demo ? demoRawProperties() : await fetchTokkoProperties(config.tokkoApiKey);
  const agency = extractAgency(raw);

  const logoUrl = config.display.agencyLogoUrl || agency?.logoUrl;
  let logo = { palette: [], opaqueRatio: 0 };
  if (logoUrl && /^https?:/.test(logoUrl)) {
    try {
      logo = await logoColors(logoUrl);
      console.log(`Colores del logo: ${logo.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join(', ') || '(ninguno)'}`);
    } catch (err) {
      console.error(`No se pudieron leer los colores del logo: ${err.message}`);
    }
  }

  const properties = selectProperties(raw.map(normalizeProperty), config).map(({ webPath, publicUrl, ...p }) => ({
    ...p,
    url: config.websiteUrl ? config.websiteUrl + webPath : publicUrl,
  }));

  return { demo, total: raw.length, properties, agency, theme: themeFromLogo(logo.palette, logo.opaqueRatio) };
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
    demo,
    refreshMinutes: config.refreshMinutes,
  };
}

module.exports = { loadData, displayConfig };
