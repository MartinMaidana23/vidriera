'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, loadConfig, rootDir } = require('./src/config');
const { loadCarteleras, loadSources, buildSlides, displayConfig } = require('./src/data');
const { demoPhotoSvg } = require('./src/demo');

loadDotEnv(path.join(rootDir, '.env'));
const config = loadConfig();
const carteleras = loadCarteleras(config);
const demoMode = !config.tokkoApiKey;
const publicDir = path.join(rootDir, 'public');

// Caché en memoria: si Tokko falla, se siguen mostrando los últimos datos obtenidos.
const cache = { sources: null, slides: {}, updatedAt: null, lastError: null, loading: null };

async function refresh() {
  if (cache.loading) return cache.loading;
  cache.loading = (async () => {
    try {
      const sources = await loadSources(config, carteleras);
      const slides = {};
      for (const c of carteleras) slides[c.ruta] = buildSlides(sources, c);
      cache.sources = sources;
      cache.slides = slides;
      cache.updatedAt = new Date().toISOString();
      cache.lastError = null;
      const summary = carteleras.map((c) => `${c.nombre}: ${slides[c.ruta].length}`).join(', ');
      console.log(`[${cache.updatedAt}] ${summary}`);
    } catch (err) {
      cache.lastError = err.message;
      console.error(`[${new Date().toISOString()}] Error al actualizar desde Tokko: ${err.message}`);
    } finally {
      cache.loading = null;
    }
  })();
  return cache.loading;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(publicDir, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// "/credito/data/config.json" -> { cartelera de "credito", resto: "/data/config.json" }
function matchCartelera(pathname) {
  const [, first = '', ...rest] = pathname.split('/');
  const found = carteleras.find((c) => c.ruta && c.ruta === first);
  if (found) return { cartelera: found, rest: '/' + rest.join('/') };
  return { cartelera: carteleras.find((c) => c.ruta === '') || carteleras[0], rest: pathname };
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  if (pathname === '/health') {
    const counts = Object.fromEntries(Object.entries(cache.slides).map(([k, v]) => [k || '/', v.length]));
    sendJson(res, 200, { ok: true, updatedAt: cache.updatedAt, counts, error: cache.lastError });
    return;
  }

  // Sin barra final las rutas relativas de la página no funcionan: /credito -> /credito/
  if (carteleras.some((c) => c.ruta && pathname === `/${c.ruta}`)) {
    res.writeHead(301, { Location: `${pathname}/` }).end();
    return;
  }

  const { cartelera, rest } = matchCartelera(pathname);

  // Mismas rutas que genera scripts/build.js para la versión publicada en GitHub Pages.
  if (rest === '/data/properties.json') {
    if (!cache.updatedAt) await refresh();
    sendJson(res, cache.updatedAt ? 200 : 502, {
      demo: demoMode,
      updatedAt: cache.updatedAt,
      error: cache.lastError,
      properties: cache.slides[cartelera.ruta] || [],
    });
    return;
  }

  if (rest === '/data/config.json') {
    if (!cache.updatedAt) await refresh();
    const s = cache.sources || {};
    sendJson(res, 200, displayConfig(cartelera.config, s.agency, demoMode, s.theme));
    return;
  }

  const demoPhoto = rest.match(/^\/demo\/photo\/(\d+)\.svg$/);
  if (demoPhoto) {
    res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'max-age=86400' });
    res.end(demoPhotoSvg(Number(demoPhoto[1])));
    return;
  }

  serveStatic(res, decodeURIComponent(rest));
});

refresh();
setInterval(refresh, config.refreshMinutes * 60_000).unref();

server.listen(config.port, () => {
  for (const c of carteleras) console.log(`${c.nombre}: http://localhost:${config.port}/${c.ruta}${c.ruta ? '/' : ''}`);
  if (demoMode) console.log('MODO DEMO: no hay TOKKO_API_KEY en .env, se muestran propiedades de ejemplo.');
});
