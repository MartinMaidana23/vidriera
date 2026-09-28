'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, loadConfig, rootDir } = require('./src/config');
const { loadData, displayConfig } = require('./src/data');
const { demoPhotoSvg } = require('./src/demo');

loadDotEnv(path.join(rootDir, '.env'));
const config = loadConfig();
const demoMode = !config.tokkoApiKey;
const publicDir = path.join(rootDir, 'public');

// Caché en memoria: si Tokko falla, se siguen mostrando las últimas propiedades obtenidas.
const cache = { properties: [], agency: null, updatedAt: null, lastError: null, loading: null };

async function refresh() {
  if (cache.loading) return cache.loading;
  cache.loading = (async () => {
    try {
      const data = await loadData(config);
      cache.properties = data.properties;
      cache.agency = data.agency || cache.agency;
      cache.updatedAt = new Date().toISOString();
      cache.lastError = null;
      console.log(`[${cache.updatedAt}] ${cache.properties.length} propiedades cargadas (${data.total} en total)`);
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

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  // Mismas rutas que genera scripts/build.js para la versión publicada en GitHub Pages.
  if (pathname === '/data/properties.json') {
    if (!cache.updatedAt) await refresh();
    sendJson(res, cache.updatedAt ? 200 : 502, {
      demo: demoMode,
      updatedAt: cache.updatedAt,
      error: cache.lastError,
      properties: cache.properties,
    });
    return;
  }

  if (pathname === '/data/config.json') {
    if (!cache.updatedAt) await refresh();
    sendJson(res, 200, displayConfig(config, cache.agency, demoMode));
    return;
  }

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true, updatedAt: cache.updatedAt, count: cache.properties.length, error: cache.lastError });
    return;
  }

  const demoPhoto = pathname.match(/^\/demo\/photo\/(\d+)\.svg$/);
  if (demoPhoto) {
    res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'max-age=86400' });
    res.end(demoPhotoSvg(Number(demoPhoto[1])));
    return;
  }

  serveStatic(res, decodeURIComponent(pathname));
});

refresh();
setInterval(refresh, config.refreshMinutes * 60_000).unref();

server.listen(config.port, () => {
  console.log(`Cartelera en http://localhost:${config.port}`);
  if (demoMode) console.log('MODO DEMO: no hay TOKKO_API_KEY en .env, se muestran propiedades de ejemplo.');
});
