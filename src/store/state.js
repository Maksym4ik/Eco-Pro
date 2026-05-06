// ── Кольори, ліміти, назви параметрів ────────────────────────────────────
export const PC = { pm25: '#ef4444', pm10: '#f59e0b', no2: '#a78bfa', o3: '#34d399', co: '#60a5fa', so2: '#fb923c', aqi: '#e879f9' };
export const PL = { pm25: 25, pm10: 50, no2: 40, o3: 100, co: 10000, so2: 20, aqi: 100 };
export const PN = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO₂', o3: 'O₃', co: 'CO', so2: 'SO₂', aqi: 'AQI' };

// Описи параметрів для тултіпів
export const PP = {
  pm25: 'Дрібні тверді частинки < 2.5 мкм. Проникають у легені, небезпечні для серцево-судинної системи.',
  pm10: 'Тверді частинки < 10 мкм. Викликають алергії та захворювання органів дихання.',
  no2:  'Діоксид азоту. Утворюється при спалюванні палива. Подразнює дихальні шляхи.',
  o3:   'Приземний озон. Утворюється під дією сонця з NO₂. Шкідливий при концентрації > 60 мкг/м³.',
  co:   'Чадний газ. Без кольору та запаху. При вдиханні блокує транспорт кисню кров\'ю.',
  so2:  'Діоксид сірки. Виникає при спалюванні вугілля/нафти. Спричиняє кислотні дощі.',
  aqi:  'Air Quality Index (США). 0–50 добра якість, 51–100 помірна, 101+ шкідлива.',
};

export function aqiColor(v, lim) {
  const r = v / lim;
  if (r < .5)  return '#34d399';
  if (r < 1)   return '#fbbf24';
  if (r < 1.5) return '#f97316';
  if (r < 2)   return '#ef4444';
  return '#7c3aed';
}

export function aqiLabel(v, lim) {
  const r = v / lim;
  if (r < .5) return ['Добра',   'good'];
  if (r < 1)  return ['Помірна', 'moderate'];
  return ['Погана', 'poor'];
}

// ── Симуляція даних (fallback коли немає реальних) ────────────────────────
// Детермінований PRNG — однакова станція + година завжди дає однакове значення
function seededRnd(seed, a, b) {
  // Mulberry32 — fast 32-bit PRNG
  let t = (seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return +(r * (b - a) + a).toFixed(2);
}

export function simData(st, hour = 12) {
  // Унікальний seed для пари (станція, година)
  const base = Math.round((st.lat || 50) * 137.3 + (st.lng || 25) * 97.7) & 0xFFFFFF;
  const seed = (base * 31 + (hour | 0) * 1000003) >>> 0;
  const s2   = (seed * 1664525 + 1013904223) >>> 0;
  const s3   = (s2   * 1664525 + 1013904223) >>> 0;
  const s4   = (s3   * 1664525 + 1013904223) >>> 0;
  const s5   = (s4   * 1664525 + 1013904223) >>> 0;
  const s6   = (s5   * 1664525 + 1013904223) >>> 0;
  const s7   = (s6   * 1664525 + 1013904223) >>> 0;

  const h  = hour;
  const tf = ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) ? 1.45 : 1;
  const nf = (h >= 1 && h <= 5) ? 0.5 : 1;
  const f  = tf * nf;

  const pm25 = seededRnd(seed, 5 * f, 30 * f);
  const pm10 = seededRnd(s2, pm25 * 1.3, pm25 * 2.2);
  const aqi  = Math.round(
    pm25 < 12   ? pm25 * 4.2 :
    pm25 < 35.4 ? 50 + (pm25 - 12) * 2.1 :
                  100 + (pm25 - 35.4) * 1.5
  );
  return {
    pm25, pm10,
    no2:        seededRnd(s3, 4 * f, 40 * f),
    o3:         seededRnd(s4, 20 / f, 85 / f),
    co:         seededRnd(s5, 180 * f, 1100 * f),
    so2:        seededRnd(s6, 0.5, 12 * f),
    temp:       seededRnd(s7, -3, 24),
    humidity:   seededRnd((s7 * 31 + 7) >>> 0, 42, 88),
    pressure:   seededRnd((s7 * 31 + 13) >>> 0, 1000, 1025),
    wind_speed: seededRnd((s7 * 31 + 17) >>> 0, 0.5, 7),
    aqi,
    source: 'sim',
  };
}

// ── Реактивний стан ───────────────────────────────────────────────────────
const _listeners = new Set();

export const state = {
  iqairKey:     '',
  lang:         'uk',
  params:       new Set(['pm25', 'pm10', 'no2', 'o3', 'co', 'so2', 'aqi']),
  layers:       new Set(['stations', 'region', 'heat']),
  hour:         12,
  stations:     [],
  // Погода по містах (для Weather табу)
  weatherByCity: { lutsk: null, kovel: null, kamin: null },
  weather:       null,   // alias = weatherByCity.lutsk
  // IQAir по містах (для IQAir табу)
  iqairByCity:  { lutsk: null, kovel: null, kamin: null },
  iqair:         null,   // alias = iqairByCity.lutsk
  // Сітка для шарів температури/вітру
  gridData:     [],
  isLoading:    false,

  update(partial) {
    Object.assign(this, partial);
    _listeners.forEach(fn => fn(this));
  },

  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
