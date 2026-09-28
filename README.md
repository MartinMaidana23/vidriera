# Vidriera — Cartelera virtual de propiedades

Cartelera a pantalla completa para una TV horizontal (16:9) en la vidriera de la inmobiliaria.
Toma las propiedades de **Tokko Broker** y las va rotando: fotos con transición, operación,
precio, ambientes, dormitorios, baños, superficie y datos de contacto de la inmobiliaria.

- Sin dependencias: sólo necesita **Node.js 18 o superior**.
- La API key de Tokko queda en el servidor, nunca llega al navegador de la TV.
- Si Tokko no responde, sigue mostrando las últimas propiedades que obtuvo.
- Se actualiza sola (cada 15 minutos por defecto) sin cortar la rotación.

## Puesta en marcha

```bash
cp .env.example .env     # completar TOKKO_API_KEY y los datos de la inmobiliaria
npm start
```

Abrir `http://localhost:3000` en el navegador de la TV y ponerlo en pantalla completa (F11).

Sin `TOKKO_API_KEY` arranca en **modo demo** con propiedades de ejemplo, útil para ver el diseño.

### ¿Dónde está la API key de Tokko?

En Tokko Broker: **Configuración → Permisos → API key** (hace falta un usuario administrador).

## Configuración (`.env`)

| Variable | Qué hace | Por defecto |
|---|---|---|
| `TOKKO_API_KEY` | API key de Tokko Broker | (vacío = demo) |
| `PORT` | Puerto del servidor | `3000` |
| `REFRESH_MINUTES` | Cada cuánto se vuelven a pedir las propiedades | `15` |
| `OPERATION` | `todas`, `venta`, `alquiler`, `alquiler temporario` | `todas` |
| `PROPERTY_TYPES` | Tipos separados por coma, ej. `Departamento,Casa,PH` | todos |
| `MAX_PROPERTIES` | Máximo de propiedades en la rotación | `40` |
| `SORT` | `recientes`, `precio_asc`, `precio_desc`, `aleatorio` | `recientes` |
| `ONLY_FEATURED` | Sólo las propiedades destacadas en la web en Tokko | `false` |
| `ONLY_WITH_PRICE` | Omitir las que tienen precio "a consultar" | `false` |
| `SLIDE_SECONDS` | Segundos por propiedad | `12` |
| `PHOTOS_PER_PROPERTY` | Fotos que rotan por propiedad | `4` |
| `AGENCY_NAME`, `AGENCY_PHONE`, `AGENCY_WEBSITE` | Pie de pantalla | datos de la sucursal en Tokko |
| `AGENCY_LOGO_URL` | URL del logo (o dejar `public/logo.png` y poner `/logo.png`) | logo de la sucursal en Tokko |
| `ACCENT_COLOR` | Color principal | `#e4002b` |

Sólo se muestran propiedades con al menos una foto. Si en Tokko una propiedad tiene
"mostrar precio en la web" desactivado, aparece como **Consultar precio**.

## Publicación en GitHub Pages (recomendado para Smart TV)

La cartelera se publica sola en `https://<usuario>.github.io/vidriera/` y se actualiza
con los datos de Tokko cada 15 minutos, sin tener una computadora prendida.
La tarea está en `.github/workflows/cartelera.yml` (ahí también se configura qué mostrar).

Configuración única en GitHub:

1. **Settings → Secrets and variables → Actions → New repository secret**:
   nombre `TOKKO_API_KEY`, valor la API key de Tokko. Queda secreta: no se publica.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → Cartelera → Run workflow** para la primera publicación.

Localmente, `npm run build` genera la misma versión estática en `dist/`.

## En la TV

Opciones habituales:

- **Mini PC / notebook** conectada a la TV corriendo `npm start` y Chrome en modo kiosco:
  `chrome --kiosk --noerrdialogs --disable-infobars http://localhost:3000`
- **Smart TV / Chromecast / TV box**: correr el servidor en una PC de la red (o en un hosting)
  y abrir `http://IP-DEL-SERVIDOR:3000` en el navegador del dispositivo.

La página se recarga sola cada 6 horas para funcionar estable varios días seguidos.

## Estructura

```
server.js         Servidor HTTP local: datos + archivos estáticos + caché
scripts/build.js  Genera la versión estática para GitHub Pages
src/data.js       Carga y filtrado de datos (compartido por server y build)
src/tokko.js      Cliente de la API de Tokko, normalización y filtros
src/config.js     Lectura de .env
src/demo.js       Datos e imágenes de ejemplo para el modo demo
public/           Cartelera (HTML, CSS y JS del navegador)
test/             Tests (`npm test`)
```

Rutas: `data/properties.json`, `data/config.json` y, en el servidor local, `/health`.
