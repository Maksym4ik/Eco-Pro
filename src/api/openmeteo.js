// Open-Meteo — без API ключа, архів з 1940р.

export async function fetchForecast(lat, lng) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',  lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('current', [
    'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m',
    'wind_direction_10m', 'surface_pressure', 'weather_code',
  ].join(','));
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,wind_speed_10m');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('timezone', 'Europe/Kyiv');
  const r = await fetch(url);
  return r.json();
}

// Архівні дані — для часового слайдера
export async function fetchArchive(lat, lng, date) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude',   lat);
  url.searchParams.set('longitude',  lng);
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date',   date);
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure');
  url.searchParams.set('timezone', 'Europe/Kyiv');
  const r = await fetch(url);
  return r.json();
}

// Сітка прогнозів для шарів температури та вітру
// points: [{ lat, lng, label }, ...]
// Повертає масив { lat, lng, label, temp, windSpeed, windDir }
export async function fetchGridForecast(points) {
  const lats = points.map(p => p.lat.toFixed(3)).join(',');
  const lngs = points.map(p => p.lng.toFixed(3)).join(',');
  const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Europe%2FKyiv`;
  const r = await fetch(url);
  const d = await r.json();
  // Open-Meteo повертає масив, якщо кілька координат
  const results = Array.isArray(d) ? d : [d];
  return results.map((item, i) => ({
    ...points[i],
    temp:      item.current?.temperature_2m,
    windSpeed: item.current?.wind_speed_10m,
    windDir:   item.current?.wind_direction_10m,
  }));
}
