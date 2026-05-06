# EcoWidget — Волинська область

Дипломний проект: **"Аналіз та візуалізація відкритих екологічних даних для Волинської області"**
Університет: ЛНТУ (Луцький національний технічний університет)

## Архітектура

Два паралельних файли — одна й та сама функціональність:

| Файл | Тип | Призначення |
|------|-----|-------------|
| `index.html` | Standalone монолітна сторінка | Головний демо-файл, весь JS inline |
| `src/` + `dist/` | Web Component `<eco-widget>` | Embedded-версія для вбудовування |

> **Важливо**: Більшість роботи відбувається в `index.html`. Зміни в `src/` потребують збірки (`npm run build`). Щоб подивитись компонентну версію — `demo/index.html`.

## Запуск

```bash
npm run serve      # статичний сервер на :3000
npm run dev        # rollup watch (для src/ версії)
npm run build      # збірка dist/
```

Відкрити: http://localhost:3000/index.html

## API-сервіси

### 1. IQAir (AirVisual API v2)
- **Файл**: `src/api/iqair.js`, inline в `index.html`
- **Ключ**: `4c7a00ca-ae1a-4b43-8e7b-c3ae0051b725` (в `.env` і в `index.html` CFG)
- **Ліміт**: 10k запитів/місяць (Free план)
- **Дані**: AQI (US/CN), PM2.5, PM10, температура, вологість, тиск, вітер
- **Endpoint**: `GET /v2/nearest_city?lat=&lon=&key=`
- **Кеш**: localStorage, TTL 15 хвилин (src версія)
- **⚠️ Баг**: В `index.html` рядок 271 навмисно блокує ключ: `if(CFG.IQAIR_KEY === '4c7a00ca...')return null;` — треба видалити цю перевірку

### 2. OpenAQ v3
- **Файл**: `src/api/openaq.js`, inline в `index.html`
- **Ключ**: не налаштований (без ключа — 401 помилка)
- **Реєстрація**: https://explore.openaq.org/register
- **Дані**: локації станцій в радіусі від координат, останні вимірювання
- **Endpoints**: `GET /v3/locations`, `GET /v3/locations/{id}/latest`

### 3. Open-Meteo (погода)
- **Файл**: `src/api/openmeteo.js`
- **Безкоштовний, без ключа**
- **Дані**: поточна погода, прогноз, архів з 1940р.
- **Покриття**: 3 міста (Луцьк, Ковель, Камінь-Каширський) + сітка 4×5 для карти

### 4. Stadia Maps (тайли карти)
- **⚠️ Проблема**: URL без API ключа → 401 Invalid Authentication
- **Поточний URL**: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png`
- **Рішення**: замінити на CartoDB Dark Matter (безкоштовно, без auth):
  `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- Attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>`

### 5. Nominatim / OSM (межі Волині)
- **Запит**: `GET https://nominatim.openstreetmap.org/lookup?osm_ids=R421866&format=geojson&polygon_geojson=1`
- **R421866** — OSM relation ID Волинської області
- Є локальний fallback GeoJSON (в обох файлах, різні полігони)

### 6. Saveecobot (радіація) — **ПОТРІБНО ДОДАТИ**
- Дані радіаційного фону в Волинській області
- API: https://api.saveecobot.com/radiation
- Безкоштовний публічний API

### 7. EcoWitt (метеостанція ЛНТУ) — **ПОТРІБНО ДОДАТИ**
- Сайт: https://www.ecowitt.net/home/index?id=65950
- Датчики: температура indoor/outdoor, вологість, тиск, вітер, сонячна радіація, UVI, ґрунт
- API: EcoWitt Application API (потребує реєстрації та ключа)
- Станція: **LNTU** (Луцький НТУ)

## Станції (STATIONS)

12 вручну визначених точок без реальних OpenAQ ID:
- Луцьк (4 точки), Ковель, Нowowолинськ, Володимир, Рожище, Горохів, Камінь-Каширський, Ківерці, Локачі
- `isLutskCenter`, `isKovelCenter`, `isKaminCenter` — прапори для IQAir nearest_city

## Симуляція даних

Коли реальних даних немає — `simData()`:
- `index.html`: `Math.random()` — дійсно рандомні (змінюються при кожному виклику)
- `src/store/state.js`: Mulberry32 PRNG з seed = f(lat, lng, hour) — детерміновані

## Відомі проблеми (TODO)

1. **Мапа 401** — замінити Stadia Maps → CartoDB Dark Matter
2. **IQAir не підключається** — видалити хибну перевірку ключа в `index.html:271`
3. **Повітря — рандомайз** — після фікса IQAir + додати OpenAQ ключ
4. **Межі Волині** — перевірити R421866 в OSM; локальні полігони відрізняються
5. **Saveecobot** — додати API-модуль і шар на карті (радіація)
6. **EcoWitt** — додати API-модуль і вкладку в BottomPanel

## Структура src/

```
src/
  index.js              # Web Component реєстрація
  components/
    Map.js              # Leaflet карта, loadAll(), renderMap()
    Sidebar.js          # Ліва панель (параметри, шари, слайдер)
    BottomPanel.js      # Нижня панель (вкладки: Повітря, Станції, Погода, IQAir)
    Charts.js           # Chart.js обгортки
  api/
    iqair.js            # IQAir API + localStorage кеш
    openaq.js           # OpenAQ v3 API
    openmeteo.js        # Open-Meteo API (погода + сітка)
  data/
    stations.js         # Статичний список 12 станцій
    volyn-geojson.js    # Локальний fallback-полігон Волині (~36 точок)
  store/
    state.js            # Реактивний стан + simData() + кольори/ліміти
  styles/
    widget.css          # Стилі Shadow DOM
```

## Ключі / ENV

```
IQAIR_KEY=4c7a00ca-ae1a-4b43-8e7b-c3ae0051b725
NODE_ENV=development
```

OpenAQ ключ поки не налаштований (потрібна реєстрація).
