import { state, PC, PL, PN, aqiColor, aqiLabel, simData } from '../store/state.js';
import { Sidebar }     from './Sidebar.js';
import { BottomPanel } from './BottomPanel.js';
import { VOLYN_GEOJSON } from '../data/volyn-geojson.js';
import { STATIONS }      from '../data/stations.js';
import { fetchLocations, fetchLatest, setOpenAQKey } from '../api/openaq.js';
import { fetchForecast, fetchGridForecast } from '../api/openmeteo.js';
import { fetchNearestCity } from '../api/iqair.js';

// ── Сітка для шарів температури/вітру (4×5 = 20 точок по Волині) ──────────
const GRID_POINTS = [];
for (const lat of [50.30, 50.70, 51.10, 51.50]) {
  for (const lng of [23.80, 24.30, 24.80, 25.30, 25.80]) {
    GRID_POINTS.push({ lat, lng });
  }
}

// ── Шари на карті ──────────────────────────────────────────────────────────
let _markers     = [];
let _circles     = [];
let _tempLayer   = null;
let _windLayer   = null;

// ── Колір температури ──────────────────────────────────────────────────────
function tempToColor(t) {
  if (t == null) return '#888';
  if (t < -5)  return '#1e3a8a';
  if (t < 0)   return '#1d4ed8';
  if (t < 5)   return '#0284c7';
  if (t < 10)  return '#0891b2';
  if (t < 15)  return '#10b981';
  if (t < 20)  return '#84cc16';
  if (t < 25)  return '#f59e0b';
  if (t < 30)  return '#ef4444';
  return '#7f1d1d';
}

// SVG-стрілка вітру (повертається CSS-трансформацією)
function windArrowHtml(speed, dir) {
  const op = Math.min(0.3 + speed / 20, 1).toFixed(2);
  return `<div class="wind-arrow-wrap" style="transform:rotate(${dir}deg)">
    <svg width="32" height="32" viewBox="0 0 32 32">
      <polygon points="16,3 22,22 16,18 10,22" fill="rgba(96,165,250,${op})"/>
    </svg>
  </div>`;
}

// ── Web Component entry ────────────────────────────────────────────────────
export function createWidget(shadow, cfg) {
  state.update({ iqairKey: cfg.iqairKey, lang: cfg.lang });
  if (cfg.openaqKey) setOpenAQKey(cfg.openaqKey);

  // Inject Leaflet CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  shadow.prepend(link);

  // ── Layout ────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'eco-root';
  root.innerHTML = `
    <header>
      <button id="sidebar-toggle" title="Сховати/показати панель">☰</button>
      <div class="logo">LNTU <span>Eco Service</span></div>
      <div class="sdot" id="sdot"></div>
      <div class="stext" id="stxt">Завантаження...</div>
      <div class="lupd" id="lupd"></div>
      <button class="header-btn primary" id="hdr-reload">🔄 Оновити</button>
      <button class="header-btn"         id="hdr-export">📥 CSV</button>
    </header>
    <div class="main">
      <div class="sidebar" id="eco-sidebar"></div>
      <div class="mw">
        <div id="eco-map"></div>
        <div class="bp2" id="eco-bottom"></div>
      </div>
    </div>
    <div id="lov"><div class="sp"></div><div style="margin-top:10px;font-size:12px;color:var(--text2)">Завантаження даних...</div></div>`;
  shadow.appendChild(root);

  // ── Sidebar toggle ─────────────────────────────────────────────────────
  const sidebarEl = shadow.getElementById('eco-sidebar');
  shadow.getElementById('sidebar-toggle').addEventListener('click', () => {
    sidebarEl.classList.toggle('hidden');
    root.classList.toggle('sidebar-hidden');
    shadow.getElementById('sidebar-toggle').textContent =
      sidebarEl.classList.contains('hidden') ? '▶' : '☰';
    setTimeout(() => map.invalidateSize(), 260);
  });

  // ── Leaflet Map ────────────────────────────────────────────────────────
  const mapEl = shadow.getElementById('eco-map');
  const map   = L.map(mapEl, { center: [50.95, 25.0], zoom: 9 }); // eslint-disable-line no-undef

  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', { // eslint-disable-line no-undef
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, © OpenStreetMap contributors',
    maxZoom: 20,
  }).addTo(map);

  // ── Регіон Волині: легка заливка (без рамки) ──────────────────────────────
  const REGION_STYLE = { weight: 0, fillColor: '#4f8ef7', fillOpacity: 0.08, interactive: false };

  // Починаємо з локального fallback-полігону (для fitBounds)
  const initRegion = L.geoJSON(VOLYN_GEOJSON, { style: REGION_STYLE }); // eslint-disable-line no-undef
  if (state.layers.has('region')) initRegion.addTo(map);
  map.fitBounds(initRegion.getBounds(), { padding: [20, 20] });
  state.layers._regionLayer = initRegion;

  // Асинхронно підвантажуємо точний контур OSM
  fetch('https://nominatim.openstreetmap.org/lookup?osm_ids=R421866&format=geojson&polygon_geojson=1')
    .then(r => r.json())
    .then(geojson => {
      if (!geojson?.features?.length) return;
      const oldLayer = state.layers._regionLayer;
      const newLayer = L.geoJSON(geojson, { style: REGION_STYLE }); // eslint-disable-line no-undef
      state.layers._regionLayer = newLayer;
      if (map.hasLayer(oldLayer)) {
        map.removeLayer(oldLayer);
        if (state.layers.has('region')) newLayer.addTo(map);
      }
    })
    .catch(() => { /* залишаємо локальний fallback */ });

  // ── Components ────────────────────────────────────────────────────────
  const bottom = new BottomPanel(shadow.getElementById('eco-bottom'), root);
  const sidebar = new Sidebar(sidebarEl, {
    // onRender синхронізує і карту, і нижню панель —
    // щоб дані при зміні годинника/параметрів завжди збігались
    onRender: () => { renderMap(map); bottom.render(state); },
  });

  // ── Header buttons ─────────────────────────────────────────────────────
  shadow.getElementById('hdr-reload').addEventListener('click', () => loadAll(shadow, map, cfg.iqairKey));
  shadow.getElementById('hdr-export').addEventListener('click', () => exportCSV(shadow));

  // ── State subscription ─────────────────────────────────────────────────
  state.subscribe(s => {
    renderMap(map);
    sidebar.render(s);
    bottom.render(s);
  });

  loadAll(shadow, map, cfg.iqairKey);

  // Авто-оновлення кожні 5 хвилин
  const _refreshTimer = setInterval(() => loadAll(shadow, map, cfg.iqairKey), 5 * 60 * 1000);

  return { destroy: () => { map.remove(); clearInterval(_refreshTimer); } };
}

// ── Рендер маркерів і шарів ────────────────────────────────────────────────

function renderMap(map) {
  const s = state;

  _markers.forEach(m => map.removeLayer(m));
  _circles.forEach(c => map.removeLayer(c));
  _markers = []; _circles = [];

  // Регіон
  const rl = s.layers._regionLayer;
  if (rl) {
    s.layers.has('region') ? (map.hasLayer(rl) || rl.addTo(map))
                           : (map.hasLayer(rl) && map.removeLayer(rl));
  }

  // Шар температури
  if (_tempLayer) {
    s.layers.has('temp') ? (map.hasLayer(_tempLayer) || _tempLayer.addTo(map))
                         : (map.hasLayer(_tempLayer) && map.removeLayer(_tempLayer));
  }

  // Шар вітру
  if (_windLayer) {
    s.layers.has('wind') ? (map.hasLayer(_windLayer) || _windLayer.addTo(map))
                         : (map.hasLayer(_windLayer) && map.removeLayer(_windLayer));
  }

  if (!s.layers.has('stations') || !s.stations.length) return;

  const ap  = [...s.params][0] || 'pm25';

  for (const st of s.stations) {
    const v   = st.data[ap] || 0;
    const col = aqiColor(v, PL[ap] || 50);

    if (s.layers.has('heat')) {
      const c = L.circle([st.lat, st.lng], { // eslint-disable-line no-undef
        radius: 9000, color: col, fillColor: col, fillOpacity: .12, weight: 0,
      }).addTo(map);
      _circles.push(c);
    }

    const icon = L.divIcon({ // eslint-disable-line no-undef
      className: '',
      html: `<div style="background:${col};width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.55);box-shadow:0 0 8px ${col}"></div>`,
      iconSize: [13, 13], iconAnchor: [6, 6],
    });
    const mk = L.marker([st.lat, st.lng], { icon }).addTo(map).bindPopup(buildPopup(st), { maxWidth: 270 }); // eslint-disable-line no-undef
    _markers.push(mk);
  }
}

function buildPopup(st) {
  const d = st.data;
  const srcLabel = st.iqSource  ? '<span style="color:#e879f9;font-size:10px">● IQAir</span>'
                 : st.hasReal   ? '<span style="color:#34d399;font-size:10px">● OpenAQ</span>'
                 :                '<span style="color:#f59e0b;font-size:10px">● Модель</span>';
  const fields = [
    ['PM2.5', d.pm25, 'мкг/м³', PL.pm25], ['PM10', d.pm10, 'мкг/м³', PL.pm10],
    ['NO₂',   d.no2,  'мкг/м³', PL.no2],  ['O₃',  d.o3,   'мкг/м³', PL.o3],
    ['CO',    d.co,   'мкг/м³', PL.co],   ['SO₂', d.so2,  'мкг/м³', PL.so2],
    ['AQI',   d.aqi,  '',       PL.aqi],
  ].map(([k, v, u, lim]) => {
    if (v === undefined) return '';
    const [, cls] = aqiLabel(v, lim);
    return `<div class="ppr"><span>${k}</span><span class="ppv ${cls}">${(+v).toFixed(1)} ${u}</span></div>`;
  }).join('');
  return `<div>
    <div class="ppt">📍 ${st.name}</div>
    <div style="margin-bottom:7px;display:flex;justify-content:space-between">${srcLabel}<span style="font-size:10px;color:var(--text2)">${st.city}</span></div>
    ${fields}
    ${d.temp       != null ? `<div class="ppr"><span>🌡 Температура</span><span class="ppv">${d.temp.toFixed(1)}°C</span></div>` : ''}
    ${d.wind_speed != null ? `<div class="ppr"><span>💨 Вітер</span><span class="ppv">${d.wind_speed.toFixed(1)} м/с</span></div>` : ''}
  </div>`;
}

// ── Шари температури і вітру ───────────────────────────────────────────────

function buildTempLayer(gridData, map) {
  if (_tempLayer) { map.removeLayer(_tempLayer); _tempLayer = null; }
  const layer = L.layerGroup(); // eslint-disable-line no-undef
  for (const pt of gridData) {
    if (pt.temp == null) continue;
    const col = tempToColor(pt.temp);
    const icon = L.divIcon({ // eslint-disable-line no-undef
      className: 'temp-label',
      html: `<div class="temp-chip" style="background:${col}">${pt.temp.toFixed(1)}°</div>`,
      iconSize: [50, 22], iconAnchor: [25, 11],
    });
    L.marker([pt.lat, pt.lng], { icon, interactive: false }).addTo(layer); // eslint-disable-line no-undef
  }
  _tempLayer = layer;
  if (state.layers.has('temp')) _tempLayer.addTo(map);
}

function buildWindLayer(gridData, map) {
  if (_windLayer) { map.removeLayer(_windLayer); _windLayer = null; }
  const layer = L.layerGroup(); // eslint-disable-line no-undef
  for (const pt of gridData) {
    if (pt.windSpeed == null) continue;
    const icon = L.divIcon({ // eslint-disable-line no-undef
      className: '',
      html: windArrowHtml(pt.windSpeed, pt.windDir),
      iconSize: [32, 32], iconAnchor: [16, 16],
    });
    L.marker([pt.lat, pt.lng], { icon }) // eslint-disable-line no-undef
      .bindTooltip(`${pt.windSpeed.toFixed(1)} м/с · ${pt.windDir}°`, { direction: 'top', offset: [0, -16] })
      .addTo(layer);
  }
  _windLayer = layer;
  if (state.layers.has('wind')) _windLayer.addTo(map);
}

// ── Головний завантажувач ──────────────────────────────────────────────────

async function loadAll(shadow, map, iqairKey) {
  showLoad(shadow, true);
  setText(shadow, 'stxt', 'Отримання даних...');

  // Паралельне завантаження: погода для 3 міст + IQAir для 3 міст + OpenAQ
  let aqError = null;
  const [
    wxLutsk, wxKovel, wxKamin,
    iqLutsk, iqKovel, iqKamin,
    aqLocs,
  ] = await Promise.all([
    fetchForecast(50.7472, 25.3254).catch(() => null),
    fetchForecast(51.2108, 24.7068).catch(() => null),
    fetchForecast(51.6250, 24.9960).catch(() => null),
    iqairKey ? fetchNearestCity(50.7472, 25.3254, iqairKey).catch(() => null) : null,
    iqairKey ? fetchNearestCity(51.2108, 24.7068, iqairKey).catch(() => null) : null,
    iqairKey ? fetchNearestCity(51.6250, 24.9960, iqairKey).catch(() => null) : null,
    fetchLocations(50.95, 25.0, 130000).catch(e => { aqError = e.message; return []; }),
  ]);

  const weatherByCity = { lutsk: wxLutsk, kovel: wxKovel, kamin: wxKamin };
  const iqairByCity   = { lutsk: iqLutsk, kovel: iqKovel, kamin: iqKamin };

  // Об'єднуємо станції
  const merged = [...STATIONS];
  for (const s of aqLocs) {
    const dup = merged.some(m => Math.abs(m.lat - s.lat) < .04 && Math.abs(m.lng - s.lng) < .04);
    if (!dup) merged.push(s);
  }

  // Завантажуємо вимірювання + будуємо дані станцій
  const stations = [];
  for (const s of merged) {
    let meas = null;
    if (s.id) meas = await fetchLatest(s.id).catch(() => null);

    const base = simData(s, state.hour);

    // Накладаємо IQAir (реальні дані)
    if (s.isLutskCenter && iqLutsk) {
      base.aqi    = iqLutsk.current?.pollution?.aqius   ?? base.aqi;
      base.pm25   = iqLutsk.current?.pollution?.p2?.conc ?? base.pm25;
      base.temp   = iqLutsk.current?.weather?.tp        ?? base.temp;
      base.source = 'iqair';
    }
    if (s.isKovelCenter && iqKovel) {
      base.aqi    = iqKovel.current?.pollution?.aqius   ?? base.aqi;
      base.pm25   = iqKovel.current?.pollution?.p2?.conc ?? base.pm25;
      base.temp   = iqKovel.current?.weather?.tp        ?? base.temp;
      base.source = 'iqair';
    }
    if (s.isKaminCenter && iqKamin) {
      base.aqi    = iqKamin.current?.pollution?.aqius   ?? base.aqi;
      base.pm25   = iqKamin.current?.pollution?.p2?.conc ?? base.pm25;
      base.temp   = iqKamin.current?.weather?.tp        ?? base.temp;
      base.source = 'iqair';
    }

    // Накладаємо Open-Meteo поточні погодні дані
    const cityWx = s.isLutskCenter ? wxLutsk : s.isKovelCenter ? wxKovel : s.isKaminCenter ? wxKamin : wxLutsk;
    if (cityWx?.current) {
      base.temp       = cityWx.current.temperature_2m         ?? base.temp;
      base.humidity   = cityWx.current.relative_humidity_2m   ?? base.humidity;
      base.pressure   = cityWx.current.surface_pressure       ?? base.pressure;
      base.wind_speed = cityWx.current.wind_speed_10m         ?? base.wind_speed;
    }

    const iqSource = !!(
      (s.isLutskCenter && iqLutsk) ||
      (s.isKovelCenter && iqKovel) ||
      (s.isKaminCenter && iqKamin)
    );

    stations.push({ ...s, data: meas ? { ...base, ...meas } : base, hasReal: !!meas, iqSource });
  }

  state.update({
    stations, weatherByCity, iqairByCity,
    weather: wxLutsk, iqair: iqLutsk,
    isLoading: false,
    _simFn: simData,
  });

  setText(shadow, 'lupd', `Оновлено: ${new Date().toLocaleTimeString('uk-UA')}`);

  const iqAny    = iqLutsk || iqKovel || iqKamin;
  const iqStale  = iqAny && [iqLutsk, iqKovel, iqKamin].some(d => d?._stale);
  const iqStatus = !iqAny    ? '⚠️ ключ'
                 : iqStale   ? `🕐 кеш (${[iqLutsk, iqKovel, iqKamin].find(d => d?._stale)?._ageMin ?? '?'} хв)`
                 :              '✅';
  const aqStatus = aqError === 'openaq_unauthorized' ? '⚠️ ключ потрібен'
                 : aqError                           ? '❌ помилка'
                 :                                    '✅';
  setText(shadow, 'stxt', `Станцій: ${stations.length} | IQAir: ${iqStatus} | OpenAQ: ${aqStatus}`);
  showLoad(shadow, false);

  // Завантажуємо сітку для шарів температури/вітру (в фоні)
  fetchGridForecast(GRID_POINTS).then(gridData => {
    state.update({ gridData });
    buildTempLayer(gridData, map);
    buildWindLayer(gridData, map);
  }).catch(() => {});
}

// ── CSV Export ─────────────────────────────────────────────────────────────

function exportCSV(shadow) {
  const s    = state;
  const date = new Date().toISOString().slice(0, 10);
  const h    = String(s.hour).padStart(2, '0');
  const hdr  = ['Станція', 'Місто', 'Джерело', 'PM2.5', 'PM10', 'NO2', 'O3', 'CO', 'SO2', 'AQI', 'Temp', 'Вологість'];
  const rows = s.stations.map(st => {
    const d = st.data;
    const src = st.iqSource ? 'IQAir' : st.hasReal ? 'OpenAQ' : 'Модель';
    return [st.name, st.city || '', src,
      d.pm25?.toFixed(2)||'', d.pm10?.toFixed(2)||'', d.no2?.toFixed(2)||'',
      d.o3?.toFixed(2)||'',   d.co?.toFixed(2)||'',   d.so2?.toFixed(2)||'',
      d.aqi?.toFixed(0)||'',  d.temp?.toFixed(1)||'', d.humidity?.toFixed(0)||''];
  });
  const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `lntu-eco-${date}-${h}h.csv`;
  a.click();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showLoad(shadow, v) { shadow.getElementById('lov')?.classList.toggle('show', v); }
function setText(shadow, id, t) { const el = shadow.getElementById(id); if (el) el.textContent = t; }
