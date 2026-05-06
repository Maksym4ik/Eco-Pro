# LNTUEcoWidget — Волинська область

Дипломний проект: **"Аналіз та візуалізація відкритих екологічних даних для Волинської області"**
Університет: ЛНТУ (Луцький національний технічний університет)

## Структура проекту

Проект — одна монолітна сторінка. Весь JS/CSS inline в `index.html`.

```
index.html        ← головний файл (весь код тут)
server.js         ← Node.js сервер: статика + CORS proxy + /api/config
package.json      ← npm start
.env              ← API ключі (не в git)
.env.example      ← шаблон ключів
node_modules/     ← залежності сервера
```

> `src/`, `dist/`, `demo/`, `rollup.config.js` — **видалено**, більше не використовуються.

## Запуск

```bash
npm start
```

Відкрити: http://localhost:3000/

## Архітектура index.html

### CFG — конфіг (ключі з .env)
```js
const CFG = { IQAIR_KEY:'', ECOWITT_APP_KEY:'', ECOWITT_API_KEY:'', ECOWITT_MAC:'' };
// При старті завантажується з /api/config:
fetch('/api/config').then(r=>r.json()).then(d=>{Object.assign(CFG,d);loadAll();}).catch(()=>loadAll());
```

### STATE (S)
```js
const S = {
  params: new Set(['pm25','pm10','aqi','temp','humidity','wind_speed','pressure']),
  layers: new Set(['stations','region','ecowitt']),
  stations: [], radiation: [], sebAir: [], weather: null, iqair: null, ecowitt: null,
  markers: [], circles: [], radMarkers: [], ewMarker: null,
  gridData: [], tempLayer: null, windLayer: null,
  regionLayer: null, volynPoly: null, charts: {}
};
```

### Параметри
```js
const PC = { pm25:'#ef4444', pm10:'#f59e0b', aqi:'#e879f9', temp:'#60a5fa', humidity:'#34d399', wind_speed:'#a78bfa', pressure:'#fb923c' };
const PL = { pm25:25, pm10:50, aqi:100, temp:35, humidity:85, wind_speed:15, pressure:1025 };
const PN = { pm25:'PM2.5', pm10:'PM10', aqi:'AQI', temp:'Температура', humidity:'Вологість', wind_speed:'Вітер', pressure:'Тиск' };
```
Всі 7 параметрів активні за замовчуванням. Параметри мають CSS-тултіпи (`data-tip`).

### Шари карти
- **Станції** — маркери SaveEcoBot + IQAir з попапами
- **Межі регіону** — полігон Волинської обл. (OSM R71064 + локальний fallback)
- **EcoWitt** — маркер ЛНТУ метеостанції (50.7358, 25.3247)
- **Температура** — 20-точкова сітка 4×5 (Open-Meteo, кольорові чіпи)
- **Вітер** — 20-точкова сітка 4×5 (Open-Meteo, SVG стрілки)
- **Радіація** — маркери SaveEcoBot (☢️ gamma nSv/h), фільтровані PIP по Волині

### Функція завантаження `loadAll()`
1. `fetch('/api/config')` → CFG
2. `fetchSaveEcoBot()` → `S.radiation`, `S.sebAir`
3. Фільтрація SaveEcoBot по полігону Волині (ray-casting PIP)
4. Побудова реальних станцій (SaveEcoBot air + IQAir)
5. `Promise.all` → Open-Meteo для кожної станції (lat/lng)
6. `fetchGridForecast()` → 20 точок сітки
7. `fetchEcoWitt()` → ЛНТУ метеостанція
8. `fetchWeather()` → погода для 3 міст (Луцьк, Ковель, Камінь)
9. `fetchIQAir()` → AQI Луцька
10. `fetchOSMRegion()` → OSM межі Волині (async, потім re-filter радіації)
11. Рендер всіх шарів

## API-сервіси

### 1. SaveEcoBot
- **Дані**: PM2.5, PM10, AQI (air), gamma nSv/h (radiation)
- **Proxy**: `/proxy/saveecobot/radiation` → `https://api.saveecobot.com/radiation`
- **Maps**: `/proxy/saveecobot-maps/maps_data.js` → `https://www.saveecobot.com/storage/maps_data.js`
- **Фільтрація**: PIP ray-casting по полігону Волині (OSM R71064 або локальний fallback)
- **Race condition**: при завантаженні `!S.volynPoly||inRegion()`, після OSM — re-filter

### 2. IQAir (AirVisual API v2)
- **Ключ**: `IQAIR_KEY` з `.env`
- **Endpoint**: `GET /v2/nearest_city?lat=50.7472&lon=25.3254&key=`
- **Дані**: AQI (US), PM2.5, температура, вологість, тиск, вітер
- **Обмеження**: 10k запитів/місяць (Free план)
- **Станція**: Луцьк-Центр (50.7472, 25.3254), додається якщо немає SaveEcoBot в радіусі 3км

### 3. Open-Meteo (погода)
- **Безкоштовний, без ключа**
- **Дані**: температура, вологість, тиск, вітер, weather_code
- **Використання**:
  - На кожній станції (lat/lng станції)
  - Сітка 4×5 = 20 точок для шарів температури/вітру
  - 3 міста (Луцьк, Ковель, Камінь-Каширський) для вкладки Погода
- **Сітка**: lat `[50.30,50.70,51.10,51.50]` × lng `[23.80,24.30,24.80,25.30,25.80]`

### 4. EcoWitt API v3
- **Ключі**: `ECOWITT_APP_KEY`, `ECOWITT_API_KEY`, `ECOWITT_MAC` з `.env`
- **Станція**: LNTU (MAC: 24:62:AB:16:E3:68), координати 50.7358, 25.3247
- **Дані**: температура indoor/outdoor, вологість, тиск, вітер, сонячна радіація, UVI, ґрунт
- **Маркер**: зелений 🌿 на карті, шар "EcoWitt ЛНТУ" в панелі шарів

### 5. CartoDB (тайли карти)
- **URL**: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Attribution**: OpenStreetMap + CARTO
- **Безкоштовно, без ключа** (замінено Stadia Maps, яка вимагала auth)

### 6. OSM Nominatim (межі Волині)
- **Запит**: `GET https://nominatim.openstreetmap.org/lookup?osm_ids=R71064&format=geojson&polygon_geojson=1`
- **R71064** — OSM relation Волинської області (~10910 вершин)
- Локальний fallback GeoJSON (~36 точок) — використовується одразу, OSM завантажується async

## server.js

- Статичний файловий сервер
- CORS proxy: `/proxy/<alias>/<path>` → реальний URL
  - `saveecobot` → `https://api.saveecobot.com`
  - `saveecobot-maps` → `https://www.saveecobot.com/storage`
- `/api/config` → читає `.env`, повертає JSON з ключами
- Парсинг `.env` вручну (без dotenv, тільки вбудований `fs`)

## .env

```
IQAIR_KEY=...
ECOWITT_APP_KEY=...
ECOWITT_API_KEY=...
ECOWITT_MAC=24:62:AB:16:E3:68
NODE_ENV=development
```

## Відомі деталі

- **Карта**: `map.setView([51.0, 25.0], 8)` — фіксований центр Волині
- **Дублікати станцій**: `usedNames` Set — другій станції додається `#id` суфікс
- **Симуляція**: прибрана повністю, тільки реальні дані
- **NO₂, O₃, CO, SO₂**: прибрані (немає реальних джерел для Волині)
- **Теплова зона**: прибрана як окремий шар
- **Вкладка "Повітря"**: прибрана з BottomPanel
- **Кнопка оновити**: в хедері (↻)
- **Назва**: LNTUEcoWidget
