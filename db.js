import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dir, 'eco_data.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -8000');
    db.pragma('temp_store = MEMORY');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL,
      lat    REAL NOT NULL,
      lng    REAL NOT NULL,
      source TEXT NOT NULL,
      UNIQUE(name, source)
    );

    CREATE TABLE IF NOT EXISTS air_readings (
      ts         INTEGER NOT NULL,
      station_id INTEGER NOT NULL REFERENCES stations(id),
      pm25       REAL,
      pm10       REAL,
      aqi        REAL,
      PRIMARY KEY(ts, station_id)
    );

    CREATE TABLE IF NOT EXISTS radiation_readings (
      ts         INTEGER NOT NULL,
      station_id INTEGER NOT NULL REFERENCES stations(id),
      gamma_usv  REAL,
      PRIMARY KEY(ts, station_id)
    );

    CREATE TABLE IF NOT EXISTS weather_readings (
      ts           INTEGER NOT NULL,
      station_id   INTEGER NOT NULL REFERENCES stations(id),
      temp         REAL,
      humidity     REAL,
      pressure     REAL,
      wind_speed   REAL,
      wind_dir     REAL,
      weather_code INTEGER,
      PRIMARY KEY(ts, station_id)
    );

    CREATE TABLE IF NOT EXISTS ecowitt_readings (
      ts           INTEGER PRIMARY KEY,
      temp_out     REAL, hum_out      REAL, dew_point  REAL, feels_like REAL,
      temp_in      REAL, hum_in       REAL,
      wind_speed   REAL, wind_gust    REAL, wind_dir   REAL,
      pressure_rel REAL, pressure_abs REAL,
      solar        REAL, uvi          REAL,
      rain_rate    REAL, rain_daily   REAL,
      soil_temp    REAL, soil_moisture REAL
    );

    CREATE TABLE IF NOT EXISTS grid_readings (
      ts         INTEGER NOT NULL,
      lat        REAL    NOT NULL,
      lng        REAL    NOT NULL,
      temp       REAL,
      humidity   REAL,
      wind_speed REAL,
      wind_dir   REAL,
      PRIMARY KEY(ts, lat, lng)
    );

    CREATE INDEX IF NOT EXISTS idx_air_ts       ON air_readings(ts);
    CREATE INDEX IF NOT EXISTS idx_rad_ts       ON radiation_readings(ts);
    CREATE INDEX IF NOT EXISTS idx_weather_ts   ON weather_readings(ts);
    CREATE INDEX IF NOT EXISTS idx_grid_ts      ON grid_readings(ts);
    CREATE INDEX IF NOT EXISTS idx_air_station  ON air_readings(station_id, ts);
    CREATE INDEX IF NOT EXISTS idx_rad_station  ON radiation_readings(station_id, ts);
    CREATE INDEX IF NOT EXISTS idx_wx_station   ON weather_readings(station_id, ts);
  `);
}

// Округлення до години (Unix seconds)
export function hourTs(d = new Date()) {
  return Math.floor(d.getTime() / 3_600_000) * 3600;
}

// Upsert станції, повертає id
export function upsertStation(name, lat, lng, source) {
  const db = getDb();
  db.prepare(
    'INSERT INTO stations(name,lat,lng,source) VALUES(?,?,?,?) ON CONFLICT(name,source) DO UPDATE SET lat=excluded.lat,lng=excluded.lng'
  ).run(name, lat, lng, source);
  return db.prepare('SELECT id FROM stations WHERE name=? AND source=?').get(name, source).id;
}

// Збереження повітря (air)
export function saveAir(ts, stationId, { pm25 = null, pm10 = null, aqi = null } = {}) {
  getDb().prepare(
    'INSERT OR REPLACE INTO air_readings(ts,station_id,pm25,pm10,aqi) VALUES(?,?,?,?,?)'
  ).run(ts, stationId, pm25, pm10, aqi);
}

// Збереження радіації
export function saveRadiation(ts, stationId, gammaUsv) {
  getDb().prepare(
    'INSERT OR REPLACE INTO radiation_readings(ts,station_id,gamma_usv) VALUES(?,?,?)'
  ).run(ts, stationId, gammaUsv);
}

// Збереження погоди (Open-Meteo per station)
export function saveWeather(ts, stationId, { temp = null, humidity = null, pressure = null, wind_speed = null, wind_dir = null, weather_code = null } = {}) {
  getDb().prepare(
    'INSERT OR REPLACE INTO weather_readings(ts,station_id,temp,humidity,pressure,wind_speed,wind_dir,weather_code) VALUES(?,?,?,?,?,?,?,?)'
  ).run(ts, stationId, temp, humidity, pressure, wind_speed, wind_dir, weather_code);
}

// Збереження EcoWitt
export function saveEcoWitt(ts, data) {
  if (!data) return;
  const d = getDb();
  d.prepare(`INSERT OR REPLACE INTO ecowitt_readings
    (ts,temp_out,hum_out,dew_point,feels_like,temp_in,hum_in,wind_speed,wind_gust,wind_dir,pressure_rel,pressure_abs,solar,uvi,rain_rate,rain_daily,soil_temp,soil_moisture)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(ts,
    data.tempOut ?? null, data.humOut ?? null, data.dewPoint ?? null, data.feelsLike ?? null,
    data.tempIn ?? null, data.humIn ?? null,
    data.windSpeed ?? null, data.windGust ?? null, data.windDir ?? null,
    data.pressureRel ?? null, data.pressureAbs ?? null,
    data.solar ?? null, data.uvi ?? null,
    data.rainRate ?? null, data.rainDaily ?? null,
    data.soilTemp ?? null, data.soilMoisture ?? null
  );
}

// Збереження сітки
export function saveGrid(ts, lat, lng, { temp = null, humidity = null, wind_speed = null, wind_dir = null } = {}) {
  getDb().prepare(
    'INSERT OR REPLACE INTO grid_readings(ts,lat,lng,temp,humidity,wind_speed,wind_dir) VALUES(?,?,?,?,?,?,?)'
  ).run(ts, lat, lng, temp, humidity, wind_speed, wind_dir);
}

// ── Читання даних для певного timestamp ──────────────────────────────────────

export function querySnapshot(ts) {
  const db = getDb();

  const air = db.prepare(`
    SELECT s.name, s.lat, s.lng, s.source, a.pm25, a.pm10, a.aqi
    FROM air_readings a JOIN stations s ON s.id=a.station_id
    WHERE a.ts=?
  `).all(ts);

  const radiation = db.prepare(`
    SELECT s.name, s.lat, s.lng, r.gamma_usv
    FROM radiation_readings r JOIN stations s ON s.id=r.station_id
    WHERE r.ts=?
  `).all(ts);

  const weather = db.prepare(`
    SELECT s.name, s.lat, s.lng, w.temp, w.humidity, w.pressure, w.wind_speed, w.wind_dir, w.weather_code
    FROM weather_readings w JOIN stations s ON s.id=w.station_id
    WHERE w.ts=?
  `).all(ts);

  const ecowitt = db.prepare(
    'SELECT * FROM ecowitt_readings WHERE ts=?'
  ).get(ts) || null;

  const grid = db.prepare(
    'SELECT lat, lng, temp, humidity, wind_speed, wind_dir FROM grid_readings WHERE ts=?'
  ).all(ts);

  return { ts, air, radiation, weather, ecowitt, grid };
}

// Список доступних годинних тімстемпів (для UI)
export function queryAvailableTimestamps(limitDays = 30) {
  const since = hourTs() - limitDays * 86400;
  return getDb().prepare(
    `SELECT DISTINCT ts FROM air_readings WHERE ts>=? ORDER BY ts DESC`
  ).all(since).map(r => r.ts);
}

// Серія даних по станції для аналітики
export function queryStationSeries(stationName, source, startTs, endTs) {
  const db = getDb();
  const st = db.prepare('SELECT id FROM stations WHERE name=? AND source=?').get(stationName, source);
  if (!st) return [];
  return db.prepare(`
    SELECT a.ts, a.pm25, a.pm10, a.aqi, w.temp, w.humidity, w.pressure, w.wind_speed
    FROM air_readings a
    LEFT JOIN weather_readings w ON w.station_id=a.station_id AND w.ts=a.ts
    WHERE a.station_id=? AND a.ts BETWEEN ? AND ?
    ORDER BY a.ts
  `).all(st.id, startTs, endTs);
}

// Всі air-станції за діапазон (тільки pm25/pm10/aqi)
export function queryAllAirSeries(startTs, endTs) {
  return getDb().prepare(`
    SELECT s.name, s.lat, s.lng, s.source, a.ts, a.pm25, a.pm10, a.aqi
    FROM air_readings a
    JOIN stations s ON s.id = a.station_id
    WHERE a.ts BETWEEN ? AND ?
    ORDER BY s.name, a.ts
  `).all(startTs, endTs);
}

// Погода по містах (Open-Meteo) за діапазон
export function queryAllWeatherSeries(startTs, endTs) {
  return getDb().prepare(`
    SELECT s.name, s.lat, s.lng, w.ts, w.temp, w.humidity, w.pressure, w.wind_speed, w.wind_dir
    FROM weather_readings w
    JOIN stations s ON s.id = w.station_id
    WHERE w.ts BETWEEN ? AND ?
    ORDER BY s.name, w.ts
  `).all(startTs, endTs);
}

// EcoWitt серія за діапазон
export function queryEcoWittSeries(startTs, endTs) {
  return getDb().prepare(`
    SELECT ts, temp_out, hum_out, wind_speed, wind_gust, pressure_rel, solar, uvi, rain_daily, soil_temp, soil_moisture
    FROM ecowitt_readings WHERE ts BETWEEN ? AND ? ORDER BY ts
  `).all(startTs, endTs);
}

// Радіація за діапазон (по кожному датчику)
export function queryRadiationSeries(startTs, endTs) {
  return getDb().prepare(`
    SELECT s.name, s.lat, s.lng, r.ts, r.gamma_usv
    FROM radiation_readings r JOIN stations s ON s.id = r.station_id
    WHERE r.ts BETWEEN ? AND ?
    ORDER BY r.ts, s.name
  `).all(startTs, endTs);
}
