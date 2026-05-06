// IQAir AirVisual v2 API
// FREE plan: 10 000 запитів/місяць
// Docs: https://api-docs.iqair.com/

const BASE     = 'https://api.airvisual.com/v2';
const CACHE_TTL = 15 * 60 * 1000; // 15 хвилин — свіжий кеш
const CACHE_PFX = 'lntu_iq_';

// ── localStorage helpers ──────────────────────────────────────────────────

function _cacheKey(lat, lon) {
  return `${CACHE_PFX}${(+lat).toFixed(2)}_${(+lon).toFixed(2)}`;
}

function _readCache(lat, lon) {
  try {
    const raw = localStorage.getItem(_cacheKey(lat, lon));
    if (!raw) return { fresh: null, stale: null, ageMin: null };
    const { data, ts } = JSON.parse(raw);
    const age = Date.now() - ts;
    return {
      fresh:  age < CACHE_TTL ? data : null,
      stale:  data,                            // fallback завжди доступний
      ageMin: Math.round(age / 60000),
    };
  } catch { return { fresh: null, stale: null, ageMin: null }; }
}

function _writeCache(lat, lon, data) {
  try {
    localStorage.setItem(_cacheKey(lat, lon), JSON.stringify({ data, ts: Date.now() }));
  } catch { /* localStorage недоступний — ігноруємо */ }
}

// ── API ───────────────────────────────────────────────────────────────────

/**
 * Повертає дані nearest_city.
 * Спочатку перевіряє свіжий кеш (< 15 хв).
 * Якщо кеш застарів — робить запит до API.
 * Якщо API недоступний — повертає застарілий кеш як fallback.
 * Повертає raw d.data: { city, state, country, current: { pollution, weather } }
 */
export async function fetchNearestCity(lat, lon, key) {
  const cache = _readCache(lat, lon);

  // ── Свіжий кеш — повертаємо без API запиту ─────────────────────────────
  if (cache.fresh) return cache.fresh;

  // ── Запит до API ─────────────────────────────────────────────────────────
  try {
    const r = await fetch(`${BASE}/nearest_city?lat=${lat}&lon=${lon}&key=${key}`);
    const d = await r.json();
    if (d.status !== 'success') throw new Error(d.data?.message || 'IQAir error');
    _writeCache(lat, lon, d.data);
    return d.data;
  } catch (err) {
    // ── Fallback: повертаємо застарілий кеш ──────────────────────────────
    if (cache.stale) {
      return { ...cache.stale, _stale: true, _ageMin: cache.ageMin };
    }
    throw err;
  }
}

/**
 * Перевіряє, чи є збережені дані в кеші (будь-якої давності).
 * Повертає { data, ageMin } або null.
 */
export function getCachedCity(lat, lon) {
  const cache = _readCache(lat, lon);
  if (!cache.stale) return null;
  return { data: cache.stale, ageMin: cache.ageMin };
}

/**
 * Дані для конкретного міста (сирий об'єкт data).
 */
export async function fetchCity(city, stateRegion, country = 'Ukraine', key) {
  const r = await fetch(
    `${BASE}/city?city=${encodeURIComponent(city)}&state=${encodeURIComponent(stateRegion)}&country=${encodeURIComponent(country)}&key=${key}`
  );
  const d = await r.json();
  if (d.status !== 'success') throw new Error(d.data?.message || 'IQAir error');
  return d.data;
}
