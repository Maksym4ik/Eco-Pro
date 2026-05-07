// Серверний збирач даних — щогодини завантажує всі API та зберігає в SQLite
import https from 'https';
import http from 'http';
import { hourTs, upsertStation, saveAir, saveRadiation, saveWeather, saveEcoWitt, saveGrid } from './db.js';

// ── Конфіг (читається з process.env) ────────────────────────────────────────
function cfg() {
  return {
    IQAIR_KEY:       process.env.IQAIR_KEY       || '',
    ECOWITT_APP_KEY: process.env.ECOWITT_APP_KEY || '',
    ECOWITT_API_KEY: process.env.ECOWITT_API_KEY || '',
    ECOWITT_MAC:     process.env.ECOWITT_MAC      || '',
  };
}

// ── Волинський полігон (fallback) ────────────────────────────────────────────
const VOLYN_POLY = [[
  [23.530,51.627],[23.580,51.640],[23.650,51.648],[23.710,51.660],[23.790,51.652],
  [23.850,51.647],[23.920,51.655],[24.000,51.660],[24.080,51.650],[24.150,51.643],
  [24.230,51.635],[24.310,51.628],[24.390,51.638],[24.470,51.643],[24.550,51.635],
  [24.630,51.628],[24.710,51.618],[24.790,51.625],[24.870,51.635],[24.950,51.628],
  [25.040,51.618],[25.120,51.610],[25.200,51.618],[25.290,51.610],[25.370,51.600],
  [25.450,51.608],[25.530,51.598],[25.620,51.590],[25.710,51.575],[25.820,51.562],
  [25.920,51.548],[26.000,51.535],[26.030,51.515],[26.010,51.492],[25.980,51.468],
  [25.970,51.440],[25.990,51.415],[26.010,51.388],[26.000,51.360],[25.970,51.332],
  [25.940,51.305],[25.960,51.278],[25.980,51.250],[25.960,51.222],[25.920,51.195],
  [25.890,51.168],[25.860,51.140],[25.830,51.112],[25.800,51.085],[25.760,51.058],
  [25.720,51.030],[25.680,51.003],[25.630,50.978],[25.580,50.952],[25.530,50.928],
  [25.470,50.905],[25.410,50.882],[25.350,50.860],[25.290,50.840],[25.220,50.820],
  [25.160,50.800],[25.090,50.782],[25.020,50.765],[24.950,50.748],[24.870,50.733],
  [24.790,50.720],[24.710,50.708],[24.630,50.698],[24.540,50.688],[24.460,50.672],
  [24.380,50.658],[24.300,50.645],[24.210,50.630],[24.120,50.618],[24.040,50.608],
  [23.960,50.600],[23.870,50.592],[23.790,50.588],[23.700,50.590],[23.620,50.595],
  [23.550,50.605],[23.490,50.620],[23.450,50.640],[23.420,50.668],[23.408,50.700],
  [23.400,50.732],[23.395,50.765],[23.395,50.798],[23.398,50.832],[23.402,50.865],
  [23.410,50.898],[23.418,50.930],[23.428,50.963],[23.440,50.995],[23.453,51.028],
  [23.465,51.060],[23.473,51.092],[23.478,51.125],[23.480,51.158],[23.482,51.190],
  [23.488,51.222],[23.495,51.255],[23.500,51.288],[23.503,51.320],[23.505,51.352],
  [23.508,51.385],[23.510,51.417],[23.513,51.450],[23.518,51.482],[23.523,51.515],
  [23.527,51.548],[23.530,51.580],[23.530,51.627],
]];

function pip(lat, lng, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
function inVolyn(lat, lng) { return VOLYN_POLY.some(p => pip(lat, lng, p)); }

// ── HTTP helper ──────────────────────────────────────────────────────────────
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'EcoWidget/1.0', Accept: 'application/json', ...options.headers } }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return fetchUrl(res.headers.location, options).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
  });
}

// ── Сітка Open-Meteo (4×5 = 20 точок) ──────────────────────────────────────
const GRID_LATS = [50.30, 50.70, 51.10, 51.50];
const GRID_LNGS = [23.80, 24.30, 24.80, 25.30, 25.80];

// ── Відомі станції (для асоціації SaveEcoBot з назвою міста) ────────────────
const KNOWN = [
  { name:'Луцьк — Центр',     lat:50.7472, lng:25.3254, city:'Луцьк' },
  { name:'Луцьк — Вокзал',    lat:50.7280, lng:25.3220, city:'Луцьк' },
  { name:'Луцьк — Промзона',  lat:50.7600, lng:25.3800, city:'Луцьк' },
  { name:'Луцьк — Теремно',   lat:50.7750, lng:25.3600, city:'Луцьк' },
  { name:'Ковель',             lat:51.2108, lng:24.7068, city:'Ковель' },
  { name:'Нововолинськ',       lat:51.2320, lng:24.1600, city:'Нововолинськ' },
  { name:'Володимир',          lat:50.8480, lng:24.3230, city:'Володимир' },
  { name:'Рожище',             lat:50.9140, lng:25.2720, city:'Рожище' },
  { name:'Горохів',            lat:50.5010, lng:24.7780, city:'Горохів' },
  { name:'Камінь-Каширський',  lat:51.6250, lng:24.9960, city:'Камінь-Каширський' },
  { name:'Ківерці',            lat:50.6960, lng:25.4610, city:'Ківерці' },
  { name:'Локачі',             lat:50.7390, lng:24.6280, city:'Локачі' },
];

function km(a, b) {
  const R=6371, p=Math.PI/180, dl=(b.lat-a.lat)*p, dn=(b.lng-a.lng)*p;
  return R*2*Math.asin(Math.sqrt(Math.sin(dl/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dn/2)**2));
}

// ── Збирачі ──────────────────────────────────────────────────────────────────

async function collectSaveEcoBot(ts) {
  try {
    const d = await fetchUrl('https://www.saveecobot.com/storage/maps_data.js', {
      headers: { Referer: 'https://www.saveecobot.com/' }
    });
    if (!d?.devices) return;

    const volyn = d.devices.filter(s => {
      const lat = parseFloat(s.a), lng = parseFloat(s.n);
      return !isNaN(lat) && !isNaN(lng) && inVolyn(lat, lng);
    });

    const usedNames = new Set();
    for (const s of volyn) {
      const lat = parseFloat(s.a), lng = parseFloat(s.n);

      // Радіація
      if (s.gamma != null) {
        const name = `RAD-${s.i}`;
        const sid = upsertStation(name, lat, lng, 'saveecobot');
        saveRadiation(ts, sid, parseFloat(s.gamma) / 1000);
      }

      // Повітря (тільки свіжі датчики)
      if (s.pm25 != null && s.old === 0) {
        let near = KNOWN[0], nearD = Infinity;
        for (const k of KNOWN) { const d = km(k, {lat,lng}); if (d<nearD) { nearD=d; near=k; } }
        const base = nearD < 8 ? near.name : `SaveEcoBot #${s.i}`;
        const name = usedNames.has(base) ? `${base} #${s.i}` : base;
        usedNames.add(name);
        const sid = upsertStation(name, lat, lng, 'saveecobot');
        saveAir(ts, sid, { pm25: parseFloat(s.pm25), pm10: s.pm10!=null?parseFloat(s.pm10):null, aqi: s.aqi??null });
      }
    }
    console.log(`[collector] SaveEcoBot: ${volyn.length} пристроїв у Волині збережено`);
  } catch (e) {
    console.warn('[collector] SaveEcoBot error:', e.message);
  }
}

async function collectIQAir(ts) {
  const key = cfg().IQAIR_KEY;
  if (!key) return;
  try {
    const d = await fetchUrl(`https://api.airvisual.com/v2/nearest_city?lat=50.7472&lon=25.3254&key=${key}`);
    if (!d?.data) return;
    const p = d.data.current?.pollution || {};
    const w = d.data.current?.weather || {};
    const sid = upsertStation('Луцьк — IQAir', 50.7472, 25.3254, 'iqair');
    saveAir(ts, sid, { pm25: p.p2??null, aqi: p.aqius??null });
    saveWeather(ts, sid, { temp: w.tp??null, humidity: w.hu??null, pressure: w.pr??null, wind_speed: w.ws??null, wind_dir: w.wd??null });
    console.log('[collector] IQAir: збережено');
  } catch (e) {
    console.warn('[collector] IQAir error:', e.message);
  }
}

async function collectOpenMeteoStation(ts, name, lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code&forecast_days=1&timezone=Europe%2FKyiv`;
    const d = await fetchUrl(url);
    if (!d?.current) return;
    const c = d.current;
    const sid = upsertStation(name, lat, lng, 'openmeteo');
    saveWeather(ts, sid, {
      temp: c.temperature_2m ?? null,
      humidity: c.relative_humidity_2m ?? null,
      pressure: c.surface_pressure ?? null,
      wind_speed: c.wind_speed_10m ?? null,
      wind_dir: c.wind_direction_10m ?? null,
      weather_code: c.weather_code ?? null,
    });
  } catch (e) {
    console.warn(`[collector] OpenMeteo ${name} error:`, e.message);
  }
}

async function collectGrid(ts) {
  const points = [];
  for (const lat of GRID_LATS) for (const lng of GRID_LNGS) points.push({ lat, lng });

  // Батчимо в 5 паралельних запитів
  const chunk = 5;
  for (let i = 0; i < points.length; i += chunk) {
    const batch = points.slice(i, i + chunk);
    await Promise.all(batch.map(async ({ lat, lng }) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=Europe%2FKyiv`;
        const d = await fetchUrl(url);
        if (!d?.current) return;
        const c = d.current;
        saveGrid(ts, lat, lng, {
          temp: c.temperature_2m ?? null,
          humidity: c.relative_humidity_2m ?? null,
          wind_speed: c.wind_speed_10m ?? null,
          wind_dir: c.wind_direction_10m ?? null,
        });
      } catch {}
    }));
  }
  console.log(`[collector] Grid: ${points.length} точок збережено`);
}

async function collectEcoWitt(ts) {
  const { ECOWITT_APP_KEY, ECOWITT_API_KEY, ECOWITT_MAC } = cfg();
  if (!ECOWITT_APP_KEY || !ECOWITT_API_KEY || !ECOWITT_MAC) return;
  try {
    const params = new URLSearchParams({
      application_key: ECOWITT_APP_KEY,
      api_key: ECOWITT_API_KEY,
      mac: ECOWITT_MAC,
      call_back: 'all',
      temp_unitid: '1', pressure_unitid: '5', wind_speed_unitid: '7',
      rainfall_unitid: '12', solar_irradiance_unitid: '16',
    });
    const d = await fetchUrl(`https://api.ecowitt.net/api/v3/device/real_time?${params}`);
    if (d?.code !== 0) return;
    const o = d.data || {};
    const fv = (obj, k) => obj?.[k]?.value !== undefined ? parseFloat(obj[k].value) : null;
    saveEcoWitt(ts, {
      tempOut: fv(o.outdoor,'temperature'), humOut: fv(o.outdoor,'humidity'),
      dewPoint: fv(o.outdoor,'dew_point'), feelsLike: fv(o.outdoor,'feels_like'),
      tempIn: fv(o.indoor,'temperature'), humIn: fv(o.indoor,'humidity'),
      windSpeed: fv(o.wind,'wind_speed'), windGust: fv(o.wind,'wind_gust'),
      windDir: fv(o.wind,'wind_direction'),
      pressureRel: fv(o.pressure,'relative'), pressureAbs: fv(o.pressure,'absolute'),
      solar: fv(o.solar_and_uvi,'solar'), uvi: fv(o.solar_and_uvi,'uvi'),
      rainRate: fv(o.rainfall,'rain_rate'), rainDaily: fv(o.rainfall,'daily'),
      soilTemp: fv(o.soil_ch1,'soiltemp'), soilMoisture: fv(o.soil_ch1,'soilmoisture'),
    });
    console.log('[collector] EcoWitt: збережено');
  } catch (e) {
    console.warn('[collector] EcoWitt error:', e.message);
  }
}

// ── Головна функція збору ────────────────────────────────────────────────────
export async function collect() {
  const ts = hourTs();
  console.log(`[collector] Старт збору: ${new Date(ts * 1000).toISOString()}`);

  const cityPoints = [
    { name:'Луцьк',             lat:50.7472, lng:25.3254 },
    { name:'Ковель',            lat:51.2108, lng:24.7068 },
    { name:'Камінь-Каширський', lat:51.6250, lng:24.9960 },
    { name:'Нововолинськ',      lat:51.2320, lng:24.1600 },
    { name:'Володимир',         lat:50.8480, lng:24.3230 },
  ];

  await Promise.all([
    collectSaveEcoBot(ts),
    collectIQAir(ts),
    collectEcoWitt(ts),
    ...cityPoints.map(p => collectOpenMeteoStation(ts, p.name, p.lat, p.lng)),
    collectGrid(ts),
  ]);

  console.log(`[collector] Збір завершено`);
}

// ── Планувальник: запуск щогодини + одразу при старті ───────────────────────
export function startScheduler() {
  collect().catch(e => console.error('[collector] Помилка першого збору:', e));

  // Запускаємо на початку кожної нової години
  const msToNextHour = () => {
    const now = Date.now();
    return 3_600_000 - (now % 3_600_000);
  };

  const scheduleNext = () => {
    setTimeout(() => {
      collect().catch(e => console.error('[collector] Помилка збору:', e));
      scheduleNext();
    }, msToNextHour());
  };

  scheduleNext();
  console.log(`[collector] Планувальник активний — наступний збір через ${Math.round(msToNextHour()/60000)} хв`);
}
