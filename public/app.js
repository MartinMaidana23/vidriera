'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const photoEls = Array.prototype.slice.call(document.querySelectorAll('.photo'));

  // Recarga completa periódica para que la TV no acumule memoria después de días prendida.
  const FULL_RELOAD_MS = 6 * 60 * 60 * 1000;
  const startedAt = Date.now();

  let config = { slideSeconds: 12, photosPerProperty: 4, refreshMinutes: 15 };
  let properties = [];
  let pending = null;          // lista nueva que se aplica al terminar la propiedad actual
  let index = -1;
  let photoLayer = 0;
  let timers = [];

  // ---------- Escalado del lienzo 1920x1080 ----------
  function fit() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------- Reloj ----------
  function tick() {
    $('clock').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  setInterval(tick, 10_000);
  tick();

  // ---------- Formato ----------
  const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

  function formatPrice(op, p) {
    if (!op || !op.price) return '<span class="consult">Consultar precio</span>';
    const currency = op.currency === 'ARS' ? '$' : op.currency;
    const prefix = op.from ? `<span class="price-from">${escapeHtml(p.fromLabel || 'Desde')}</span>` : '';
    const isRent = /alquiler/i.test(op.type);
    const suffix = isRent ? '<small>por mes</small>' : '';
    return `${prefix}${currency} ${fmt.format(op.price)}${suffix}`;
  }

  const ICONS = {
    rooms: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 3v10M3 13h9"/></svg>',
    bedrooms: '<svg viewBox="0 0 24 24"><path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>',
    bathrooms: '<svg viewBox="0 0 24 24"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V5a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/></svg>',
    surface: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3zM3 9h4M3 15h4M9 3v4M15 3v4"/></svg>',
    parking: '<svg viewBox="0 0 24 24"><path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></svg>',
    delivery: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    amenities: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/></svg>',
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function featuresHtml(p) {
    const items = [];
    const add = (icon, value, label) => {
      if (value) items.push(`<li>${ICONS[icon]}<span><b>${escapeHtml(value)}</b> ${label}</span></li>`);
    };
    if (p.kind === 'development') {
      const rooms = p.roomsMin && (p.roomsMin === p.roomsMax ? `${p.roomsMin}` : `${p.roomsMin} a ${p.roomsMax}`);
      add('rooms', rooms, p.roomsMax === 1 ? 'ambiente' : 'ambientes');
      add('delivery', p.delivery && `Entrega ${p.delivery}`, '');
      add('amenities', (p.amenities || []).join(' · '), '');
      return items.join('');
    }
    add('surface', p.surface && `${fmt.format(p.surface)} m²`, '');
    add('rooms', p.rooms, p.rooms === 1 ? 'ambiente' : 'ambientes');
    add('bedrooms', p.bedrooms, p.bedrooms === 1 ? 'dormitorio' : 'dormitorios');
    add('bathrooms', p.bathrooms, p.bathrooms === 1 ? 'baño' : 'baños');
    add('parking', p.parking, p.parking === 1 ? 'cochera' : 'cocheras');
    return items.slice(0, 4).join('');
  }

  // ---------- QR ----------
  // Arma el SVG a mano (en vez de usar el del generador) para controlar el tamaño en cualquier TV.
  function renderQr(url) {
    const box = $('qr-box');
    if (!url || typeof window.qrcode !== 'function') {
      box.hidden = true;
      return;
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += 'M' + c + ' ' + r + 'h1v1h-1z';
      }
    }
    $('qr').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n +
      '" shape-rendering="crispEdges"><path fill="#000" d="' + path + '"/></svg>';
    box.hidden = false;
  }

  // ---------- Imágenes ----------
  function preload(src) {
    return new Promise((resolve) => {
      const img = new Image();
      const done = (ok) => resolve(ok ? src : null);
      img.onload = () => done(true);
      img.onerror = () => done(false);
      setTimeout(() => done(false), 15_000);
      img.src = src;
    });
  }

  function showPhoto(src, seconds) {
    photoLayer = 1 - photoLayer;
    const next = photoEls[photoLayer];
    const prev = photoEls[1 - photoLayer];
    next.style.setProperty('--photo-seconds', `${seconds + 1}s`);
    next.src = src;
    next.classList.remove('visible');
    void next.offsetWidth; // reinicia la animación
    next.classList.add('visible');
    prev.classList.remove('visible');
  }

  // ---------- Rotación ----------
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  async function nextSlide() {
    clearTimers();

    if (pending) {
      properties = pending;
      pending = null;
      index = -1;
    }
    if (Date.now() - startedAt > FULL_RELOAD_MS) {
      location.reload();
      return;
    }
    if (properties.length === 0) {
      showOverlay('No hay propiedades para mostrar.');
      timers.push(setTimeout(nextSlide, 30_000));
      return;
    }

    // Busca la próxima propiedad cuya primera foto cargue bien.
    let p = null;
    let photos = [];
    for (let tries = 0; tries < properties.length && !p; tries++) {
      index = (index + 1) % properties.length;
      const candidate = properties[index];
      const first = await preload(candidate.photos[0]);
      if (first) {
        p = candidate;
        photos = candidate.photos.slice(0, config.photosPerProperty);
      }
    }
    if (!p) {
      showOverlay('No se pudieron cargar las fotos. Reintentando…');
      timers.push(setTimeout(nextSlide, 30_000));
      return;
    }

    render(p, photos);
  }

  function render(p, photos) {
    const panel = $('panel');
    const slideMs = config.slideSeconds * 1000;
    const photoMs = slideMs / photos.length;

    panel.classList.add('hidden');
    timers.push(setTimeout(() => {
      const op = p.operations[0];
      $('op').textContent = op ? op.type : '';
      $('type').textContent = p.type;
      $('title').textContent = p.title;
      $('location').textContent = [p.address, p.location].filter(Boolean).join(' · ');
      $('price').innerHTML = formatPrice(op, p);
      $('features').innerHTML = featuresHtml(p);
      $('features').className = p.kind === 'development' ? 'features single' : 'features';
      $('description').textContent = p.description;
      $('code').textContent = p.code ? `Cód. ${p.code}` : '';
      renderQr(p.url);
      $('credit').textContent = p.stamp || '';
      $('credit').hidden = !p.stamp;
      panel.classList.remove('hidden');
    }, 450));

    // Puntos indicadores de fotos
    $('photo-count').innerHTML = photos.length > 1 ? photos.map(() => '<span></span>').join('') : '';
    const dots = Array.prototype.slice.call($('photo-count').children);

    photos.forEach((src, i) => {
      timers.push(setTimeout(async () => {
        const ok = i === 0 ? src : await preload(src);
        if (!ok) return; // si una foto falla, queda la anterior
        showPhoto(ok, photoMs / 1000);
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
      }, i * photoMs));
    });

    // Barra de progreso
    const bar = $('progress');
    bar.style.transition = 'none';
    bar.style.width = '0';
    void bar.offsetWidth;
    bar.style.transition = `width ${slideMs}ms linear`;
    bar.style.width = '100%';

    hideOverlay();
    timers.push(setTimeout(nextSlide, slideMs));
  }

  // ---------- Overlay de estado ----------
  function showOverlay(text) {
    $('overlay-text').textContent = text;
    $('overlay').classList.remove('gone');
  }

  function hideOverlay() {
    $('overlay').classList.add('gone');
  }

  // Oscurece un color #rrggbb (factor 0 = negro, 1 = igual)
  function shade(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      const s = Math.round(v * factor).toString(16);
      return s.length < 2 ? '0' + s : s;
    });
    return '#' + ch.join('');
  }

  // ---------- Datos ----------
  async function getJson(url) {
    const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  async function loadConfig() {
    config = Object.assign({}, config, await getJson('data/config.json'));
    const root = document.documentElement.style;
    if (config.accentColor) root.setProperty('--accent', config.accentColor);
    if (config.accentText) root.setProperty('--accent-text', config.accentText);
    if (config.creditColor) root.setProperty('--credit', config.creditColor);
    if (config.creditText) root.setProperty('--credit-text', config.creditText);
    if (config.logoBackground) root.setProperty('--logo-bg', config.logoBackground);
    if (config.panelColor) {
      root.setProperty('--panel-bg', config.panelColor);
      root.setProperty('--footer-bg', shade(config.panelColor, 0.55));
    }
    $('agency-name').textContent = config.agencyName;
    $('agency-phone').textContent = config.agencyPhone;
    $('agency-web').textContent = config.agencyWebsite;
    $('demo').hidden = !config.demo;
    if (config.agencyLogoUrl) {
      const logo = $('logo');
      logo.onload = function () { logo.parentNode.className += ' has-logo'; };
      logo.src = config.agencyLogoUrl;
      logo.hidden = false;
      if (config.logoBackground === 'transparent') logo.className += ' transparent';
      $('overlay-logo').src = config.agencyLogoUrl;
      $('overlay-logo').hidden = false;
    }
    if (config.isoUrl) {
      $('iso').src = config.isoUrl;
      $('iso').hidden = false;
    }
  }

  async function loadProperties() {
    try {
      const data = await getJson('data/properties.json');
      return data.properties || [];
    } catch (err) {
      console.error('No se pudieron obtener las propiedades:', err);
      return null; // se mantiene la lista actual
    }
  }

  async function start() {
    while (true) {
      try {
        await loadConfig();
        break;
      } catch (err) {
        showOverlay('Sin conexión con el servidor. Reintentando…');
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }

    let list = await loadProperties();
    while (!list) {
      showOverlay('No se pudo conectar con el CRM. Reintentando…');
      await new Promise((r) => setTimeout(r, 30_000));
      list = await loadProperties();
    }
    properties = list;
    nextSlide();

    setInterval(async () => {
      const fresh = await loadProperties();
      if (fresh) pending = fresh;
    }, config.refreshMinutes * 60_000);
  }

  start();
})();
