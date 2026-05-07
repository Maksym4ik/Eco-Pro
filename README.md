# LNTUEcoWidget

**Аналіз та візуалізація відкритих екологічних даних для Волинської області**

Дипломний проект ЛНТУ (Луцький національний технічний університет).
Інтерактивна карта якості повітря, радіації та погоди з архівом і аналітикою.

---

## Функціональність

- **Карта** — Leaflet.js, темна тема CartoDB, шари: станції, межі регіону, температурна сітка, вітер, радіація, EcoWitt
- **Реальний час** — SaveEcoBot (PM2.5, PM10, AQI, радіація), IQAir, Open-Meteo, EcoWitt ЛНТУ
- **Архів** — перегляд будь-якої збереженої години через date picker
- **Аналітика** — графіки Chart.js за обраний діапазон, 3 вкладки: Якість повітря / Погода / Радіація, мін/сер/макс
- **PDF-експорт** — кнопка ⬇ PDF друкує аналітику через `window.print()`
- **БД** — SQLite (better-sqlite3), щогодинний збір, WAL-режим

---

## Швидкий старт

### Локально

```bash
git clone <repo>
cd eco-pro
npm install
cp .env.example .env   # заповніть ключі
npm start
```

Відкрити: http://localhost:3000

### Docker

```bash
cp .env.example .env   # заповніть ключі
docker compose up -d --build
```

- Виджет: http://localhost/
- Adminer (БД): http://localhost:8080/

---

## Конфігурація `.env`

| Змінна | Опис |
|---|---|
| `IQAIR_KEY` | API-ключ IQAir (airvisual.com) |
| `ECOWITT_APP_KEY` | Application key EcoWitt |
| `ECOWITT_API_KEY` | API key EcoWitt |
| `ECOWITT_MAC` | MAC адреса метеостанції ЛНТУ |
| `NODE_ENV` | `development` або `production` |
| `DB_PATH` | Шлях до SQLite файлу (Docker: `/data/eco_data.db`) |

---

## Джерела даних

| Джерело | Дані | Ключ |
|---|---|---|
| [SaveEcoBot](https://saveecobot.com) | PM2.5, PM10, AQI, гамма-радіація | немає |
| [IQAir](https://www.iqair.com/air-pollution-data-api) | AQI US, PM2.5 (Луцьк) | платний / Free 10k/міс |
| [Open-Meteo](https://open-meteo.com) | Температура, вологість, тиск, вітер | немає |
| [EcoWitt API v3](https://api.ecowitt.net) | Метеостанція ЛНТУ (indoor + outdoor) | потрібен |
| [OSM Nominatim](https://nominatim.openstreetmap.org) | Межі Волинської обл. | немає |

---

## Структура файлів

```
index.html          — весь UI (HTML + CSS + JS, inline)
server.js           — Node.js HTTP-сервер
db.js               — SQLite: схема, запити
collector.js        — щогодинний збір даних
Dockerfile          — Docker-образ на node:20-alpine
docker-compose.yml  — eco-widget + nginx + adminer
nginx/nginx.conf    — reverse proxy, gzip, rate limit
.env.example        — шаблон змінних
```

---

## API-ендпоінти сервера

| Ендпоінт | Опис |
|---|---|
| `GET /api/config` | Ключі з .env для клієнта |
| `GET /api/history?ts=<unix>` | Знімок БД на вказану годину |
| `GET /api/history/timestamps?days=30` | Список доступних годин |
| `GET /api/history/analytics?start=&end=` | Аналітика за діапазон |
| `GET /proxy/saveecobot/<path>` | CORS proxy → SaveEcoBot API |

---

## Adminer — перегляд бази даних

При запуску через Docker, Adminer доступний на порту **8080**:

1. Відкрити http://localhost:8080
2. System: **SQLite 3**
3. Database: `/data/eco_data.db`
4. Username/Password: залишити порожніми

---

## TLS / HTTPS (production)

1. Покладіть `fullchain.pem` та `privkey.pem` в `nginx/certs/`
2. Розкоментуйте HTTPS-блок у `nginx/nginx.conf`
3. Встановіть `server_name your-domain.com`
4. `docker compose restart nginx`

---

## Технології

- **Node.js 20** (ESM), без фреймворків
- **better-sqlite3** — синхронний SQLite
- **Leaflet 1.9.4** — карта
- **Chart.js 4.4.1** — графіки аналітики
- **Docker + Nginx** — деплой
