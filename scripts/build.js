'use strict';

// Genera la versión estática de las carteleras en dist/ para publicarlas en GitHub Pages.
// Consulta Tokko en el momento de construir y deja los datos de cada cartelera en
// dist/<ruta>/data/*.json; la API key nunca se copia a los archivos publicados.

const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, loadConfig, rootDir } = require('../src/config');
const { loadCarteleras, loadSources, buildSlides, displayConfig } = require('../src/data');
const { demoPhotoSvg } = require('../src/demo');

async function main() {
  loadDotEnv(path.join(rootDir, '.env'));
  const config = loadConfig();
  if (process.env.CI && !config.tokkoApiKey) {
    throw new Error('Falta el secreto TOKKO_API_KEY en GitHub; no se publica el modo demo.');
  }
  const carteleras = loadCarteleras(config);
  const sources = await loadSources(config, carteleras);
  if (sources.rawProperties.length === 0) {
    throw new Error('Tokko no devolvió propiedades; se mantiene la versión publicada anterior.');
  }

  const dist = path.join(rootDir, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  const updatedAt = new Date().toISOString();

  for (const cartelera of carteleras) {
    const out = path.join(dist, cartelera.ruta);
    fs.cpSync(path.join(rootDir, 'public'), out, { recursive: true });
    fs.mkdirSync(path.join(out, 'data'), { recursive: true });

    const slides = buildSlides(sources, cartelera);
    fs.writeFileSync(
      path.join(out, 'data', 'properties.json'),
      JSON.stringify({ demo: sources.demo, updatedAt, error: null, properties: slides })
    );
    fs.writeFileSync(
      path.join(out, 'data', 'config.json'),
      JSON.stringify(displayConfig(cartelera.config, sources.agency, sources.demo, sources.theme))
    );

    if (sources.demo) {
      const photos = path.join(out, 'demo', 'photo');
      fs.mkdirSync(photos, { recursive: true });
      for (let i = 0; i < 18; i++) fs.writeFileSync(path.join(photos, `${i}.svg`), demoPhotoSvg(i));
    }
    console.log(`/${cartelera.ruta}${cartelera.ruta ? '/' : ''} ${cartelera.nombre}: ${slides.length} placas`);
  }

  console.log(`dist/ generado (${sources.rawProperties.length} propiedades y ${sources.rawDevelopments.length} emprendimientos en Tokko)${sources.demo ? ' [MODO DEMO]' : ''}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
