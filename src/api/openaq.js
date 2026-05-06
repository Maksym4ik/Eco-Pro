// OpenAQ v3 — потребує API ключ (реєстрація: https://explore.openaq.org/register)
const BASE = 'https://api.openaq.org/v3';

let OPENAQ_KEY = '';
export function setOpenAQKey(key) { OPENAQ_KEY = key; }

function headers() {
  const h = { Accept: 'application/json' };
  if (OPENAQ_KEY) h['X-API-Key'] = OPENAQ_KEY;
  return h;
}

export async function fetchLocations(lat, lng, radius = 130000) {
  const r = await fetch(
    `${BASE}/locations?coordinates=${lat},${lng}&radius=${radius}&limit=25`,
    { headers: headers() }
  );
  if (r.status === 401) throw new Error('openaq_unauthorized');
  if (!r.ok) throw new Error(`openaq_error_${r.status}`);
  const d = await r.json();
  return (d.results || [])
    .map(l => ({
      id:     l.id,
      name:   l.name || l.locality || 'OpenAQ',
      lat:    l.coordinates?.latitude,
      lng:    l.coordinates?.longitude,
      city:   l.locality || '—',
      source: 'openaq',
    }))
    .filter(x => x.lat && x.lng);
}

export async function fetchLatest(locationId) {
  const r = await fetch(`${BASE}/locations/${locationId}/latest`, { headers: headers() });
  if (r.status === 401) throw new Error('openaq_unauthorized');
  if (!r.ok) return null;
  const d = await r.json();
  const out = {};
  for (const m of (d.results || [])) {
    const key = m.parameter?.toLowerCase().replace('.', '');
    if (key) out[key] = m.value;
  }
  return Object.keys(out).length ? out : null;
}
