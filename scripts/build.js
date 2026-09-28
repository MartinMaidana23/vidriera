'use strict';

// Genera la versión estática de la cartelera en dist/ para publicarla en GitHub Pages.
// Consulta Tokko en el momento de construir y deja los datos en dist/data/*.json;
// la API key nunca se copia a los archivos publicados.

const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, loadConfig, rootDir } = require('../src/config');
const { loadData, displayConfig } = require('../src/data');
const { demoPhotoSvg } = require('../src/demo');

async function main() {
  loadDotEnv(path.join(rootDir, '.env'));
  const config = loadConfig();
  const dist = path.join(rootDir, 'dist');

  const data = await loadData(config);
  if (!data.demo && data.properties.length === 0) {
    throw new Error('Tokko no devolvió propiedades para mostrar; se mantiene la versión publicada anterior.');
  }

  fs.rmSync(dist, { recursive: true, force: true });
  fs.cpSync(path.join(rootDir, 'public'), dist, { recursive: true });
  fs.mkdirSync(path.join(dist, 'data'));

  const updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(dist, 'data', 'properties.json'),
    JSON.stringify({ demo: data.demo, updatedAt, error: null, properties: data.properties })
  );
  fs.writeFileSync(path.join(dist, 'data', 'config.json'), JSON.stringify(displayConfig(config, data.agency, data.demo)));

  if (data.demo) {
    const photos = path.join(dist, 'demo', 'photo');
    fs.mkdirSync(photos, { recursive: true });
    for (let i = 0; i < 18; i++) fs.writeFileSync(path.join(photos, `${i}.svg`), demoPhotoSvg(i));
  }

  console.log(`dist/ generado: ${data.properties.length} propiedades (${data.total} en Tokko)${data.demo ? ' [MODO DEMO]' : ''}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
