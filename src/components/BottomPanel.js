import { renderWeatherChart, renderStationsChart, destroyChart } from './Charts.js';
import { PC, PL, PN, aqiColor, aqiLabel } from '../store/state.js';

const WC = {
  0: '☀️ Ясно',  1: '🌤 Ясно',  2: '⛅ Мінлива', 3: '☁️ Хмарно',
  45: '🌫 Туман', 48: '🌫 Туман', 51: '🌦 Мряка',  53: '🌦 Мряка',
  55: '🌦 Мряка', 61: '🌧 Дощ',   63: '🌧 Дощ',    65: '🌧 Дощ',
  71: '🌨 Сніг',  73: '🌨 Сніг',  80: '🌦 Злива',  81: '🌦 Злива',
  95: '⛈ Гроза', 99: '⛈ Гроза',
};

export class BottomPanel {
  constructor(el, root) {
    this.el       = el;
    this._charts  = {};
    this._fsChart = null;
    this._fsEl    = null;
    this._initFullscreen(root);
  }

  // ── Fullscreen overlay ───────────────────────────────────────────────────
  _initFullscreen(root) {
    const fs = document.createElement('div');
    fs.className = 'eco-fullscreen hidden';
    fs.innerHTML = `
      <div class="eco-fullscreen-header">
        <div class="eco-fullscreen-title" id="eco-fs-title">Графік</div>
        <button class="eco-fullscreen-close" id="eco-fs-close">✕ Закрити</button>
      </div>
      <canvas id="eco-fs-canvas"></canvas>`;
    root.appendChild(fs);
    this._fsEl = fs;

    fs.querySelector('#eco-fs-close').addEventListener('click', () => {
      this._fsChart = destroyChart(this._fsChart);
      fs.classList.add('hidden');
    });
  }

  _openFullscreen(title, renderFn) {
    const fs = this._fsEl;
    if (!fs) return;
    fs.querySelector('#eco-fs-title').textContent = title;
    this._fsChart = destroyChart(this._fsChart);
    fs.classList.remove('hidden');
    // Чекаємо на наступний кадр, щоб canvas мав розміри
    requestAnimationFrame(() => {
      const canvas = fs.querySelector('#eco-fs-canvas');
      if (canvas) this._fsChart = renderFn(canvas);
    });
  }

  // ── Public ───────────────────────────────────────────────────────────────
  render(s) {
    const hasData = s.stations.length
      || s.weatherByCity?.lutsk?.current
      || s.iqairByCity?.lutsk;
    if (!hasData) return;
    this._renderTabs(s);
  }

  // ── Tabs shell ───────────────────────────────────────────────────────────
  _renderTabs(s) {
    const active = this.el.querySelector('.tab.active')?.dataset?.tab || 'air';

    this.el.innerHTML = `
      <div class="pt">
        <div class="tab ${active==='air'?'active':''}" data-tab="air">💨 Повітря</div>
        <div class="tab ${active==='st' ?'active':''}" data-tab="st">📍 Станції</div>
        <div class="tab ${active==='wx' ?'active':''}" data-tab="wx">🌤 Погода</div>
        <div class="tab ${active==='iq' ?'active':''}" data-tab="iq">🟣 IQAir</div>
      </div>
      <div class="pc ${active==='air'?'active':''}" id="tab-air"></div>
      <div class="pc ${active==='st' ?'active':''}" id="tab-st"></div>
      <div class="pc ${active==='wx' ?'active':''}" id="tab-wx"></div>
      <div class="pc ${active==='iq' ?'active':''}" id="tab-iq"></div>`;

    this.el.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        this.el.querySelectorAll('.tab,.pc').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        this.el.querySelector(`#tab-${t.dataset.tab}`).classList.add('active');
      });
    });

    this._renderAir(s);
    this._renderStations(s);
    this._renderWeather(s);
    this._renderIQAir(s);
  }

  // ── Tab: Повітря (по станціях) ────────────────────────────────────────────
  _renderAir(s) {
    const el = this.el.querySelector('#tab-air');
    if (!s.stations.length) { el.innerHTML = '<div class="nd">Немає даних</div>'; return; }

    const activeParams = ['pm25', 'pm10', 'no2', 'o3', 'co', 'so2', 'aqi'].filter(p => s.params.has(p));
    const primaryParam = activeParams[0] || 'pm25';

    const srcBadge = st =>
      st.iqSource  ? `<span class="station-air-src" style="background:#e879f91a;color:#e879f9">IQAir</span>`
      : st.hasReal ? `<span class="station-air-src" style="background:#34d3991a;color:#34d399">OpenAQ</span>`
      :              `<span class="station-air-src" style="background:#f59e0b1a;color:#f59e0b">Модель</span>`;

    const stationBlocks = s.stations.map(st => {
      const chips = activeParams.map(p => {
        const v = st.data[p];
        if (v == null) return '';
        const col  = aqiColor(v, PL[p] || 50);
        const unit = p === 'aqi' ? '' : 'мкг';
        const val  = (+v).toFixed(p === 'aqi' ? 0 : 1);
        return `<div class="param-chip">
          <span class="param-chip-label">${PN[p]}</span>
          <span class="param-chip-val" style="color:${col}">${val}<small style="color:var(--text2);font-weight:400"> ${unit}</small></span>
        </div>`;
      }).join('');

      return `<div class="station-air">
        <div class="station-air-header">
          <span class="station-air-name">📍 ${st.name}</span>
          ${srcBadge(st)}
        </div>
        <div class="station-air-params">${chips || '<span style="color:var(--text2);font-size:11px">Немає активних параметрів</span>'}</div>
      </div>`;
    }).join('');

    el.innerHTML = `${stationBlocks}
      <div class="cw">
        <canvas id="ch-air"></canvas>
        <button class="btn-expand" title="На весь екран">⛶</button>
      </div>`;

    this._charts.air = destroyChart(this._charts.air);
    const canvas = el.querySelector('#ch-air');
    if (canvas) {
      this._charts.air = renderStationsChart(canvas, s.stations, primaryParam, PC, PN);
    }

    el.querySelector('.btn-expand')?.addEventListener('click', () => {
      this._openFullscreen(`${PN[primaryParam]} — усі станції`, c =>
        renderStationsChart(c, s.stations, primaryParam, PC, PN)
      );
    });
  }

  // ── Tab: Станції (таблиця) ───────────────────────────────────────────────
  _renderStations(s) {
    const el = this.el.querySelector('#tab-st');
    if (!s.stations.length) { el.innerHTML = '<div class="nd">Немає даних</div>'; return; }

    const rows = s.stations.map(st => {
      const v = st.data.pm25 || 0;
      const [lbl, cls] = aqiLabel(v, PL.pm25);
      const src = st.iqSource  ? { l: 'IQAir',  c: '#e879f9' }
                : st.hasReal   ? { l: 'OpenAQ', c: '#34d399' }
                :                { l: 'Модель', c: '#f59e0b' };
      const aqiStr = st.data.aqi
        ? `AQI: <b style="color:#e879f9">${Math.round(st.data.aqi)}</b> &nbsp;` : '';

      return `<div class="sr">
        <div><div class="sn">${st.name}</div><div class="sloc">${st.city || ''}</div></div>
        <div style="font-size:11px">${aqiStr}PM2.5: <b style="color:#ef4444">${v.toFixed(1)}</b></div>
        <div class="pill ${cls}">${lbl}</div>
        <div class="pill" style="background:${src.c}1a;color:${src.c}">${src.l}</div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="sl">${rows}</div>`;
  }

  // ── Tab: Погода (3 міста) ────────────────────────────────────────────────
  _renderWeather(s) {
    const el  = this.el.querySelector('#tab-wx');
    const wbc = s.weatherByCity || {};

    if (!Object.values(wbc).some(w => w?.current)) {
      el.innerHTML = '<div class="nd">Метеодані недоступні</div>';
      return;
    }

    const CITIES = [
      { key: 'lutsk', label: 'Луцьк'             },
      { key: 'kovel', label: 'Ковель'             },
      { key: 'kamin', label: 'Камінь-Каширський'  },
    ];

    const sections = CITIES.map(({ key, label }) => {
      const w = wbc[key];
      if (!w?.current) return '';
      const c    = w.current;
      const desc = WC[c.weather_code] || '🌡';

      return `<div class="city-section">
        <div class="city-section-title">📍 ${label}</div>
        <div class="cards-row">
          <div class="dc"><div class="dct">Температура</div>
            <div class="dcv" style="color:#60a5fa">${c.temperature_2m?.toFixed(1)}<span class="dcu">°C</span></div>
            <div class="dcs">${desc}</div></div>
          <div class="dc"><div class="dct">Вологість</div>
            <div class="dcv" style="color:#34d399">${c.relative_humidity_2m}<span class="dcu">%</span></div></div>
          <div class="dc"><div class="dct">Вітер</div>
            <div class="dcv" style="color:#a78bfa">${c.wind_speed_10m?.toFixed(1)}<span class="dcu">м/с</span></div></div>
          <div class="dc"><div class="dct">Тиск</div>
            <div class="dcv" style="color:#fb923c">${c.surface_pressure?.toFixed(0)}<span class="dcu">гПа</span></div></div>
        </div>
      </div>`;
    }).join('');

    const lutskWx = wbc.lutsk;

    el.innerHTML = `${sections}
      <div class="cw">
        <canvas id="ch-wx"></canvas>
        <button class="btn-expand" title="На весь екран">⛶</button>
      </div>`;

    this._charts.wx = destroyChart(this._charts.wx);
    const canvas = el.querySelector('#ch-wx');
    if (canvas && lutskWx?.hourly) {
      this._charts.wx = renderWeatherChart(canvas, lutskWx.hourly);
    }

    el.querySelector('.btn-expand')?.addEventListener('click', () => {
      this._openFullscreen('Погода — Луцьк (добовий прогноз)', c =>
        renderWeatherChart(c, lutskWx?.hourly)
      );
    });
  }

  // ── Tab: IQAir (3 міста) ─────────────────────────────────────────────────
  _renderIQAir(s) {
    const el  = this.el.querySelector('#tab-iq');
    const ibc = s.iqairByCity || {};

    if (!Object.values(ibc).some(v => v)) {
      el.innerHTML = `<div class="nd" style="text-align:left;padding:14px">
        <b style="color:var(--warn)">⚠️ IQAir API не підключено</b><br><br>
        <b>Що дає IQAir:</b><br>
        • AQI в реальному часі (US та CN стандарти)<br>
        • PM2.5, PM10 концентрація<br>
        • Головний забруднювач дня<br>
        • Погода: температура, вологість, тиск, вітер<br><br>
        <b>Як підключити:</b><br>
        1. <a href="https://www.iqair.com/dashboard/api" target="_blank" style="color:var(--accent)">iqair.com/dashboard/api</a><br>
        2. Free план (10k запитів/міс)<br>
        3. Вставити ключ в атрибут <code style="color:var(--warn)">iqair-key="..."</code>
      </div>`;
      return;
    }

    const CITIES = [
      { key: 'lutsk', label: 'Луцьк'            },
      { key: 'kovel', label: 'Ковель'            },
      { key: 'kamin', label: 'Камінь-Каширський' },
    ];

    const sections = CITIES.map(({ key, label }) => {
      const iq = ibc[key];
      if (!iq) {
        return `<div class="city-section">
          <div class="city-section-title">📍 ${label}</div>
          <div class="nd" style="padding:6px 0">Дані відсутні</div>
        </div>`;
      }

      const p      = iq.current?.pollution;
      const w2     = iq.current?.weather;
      const aqiVal = p?.aqius || 0;
      const [lbl, cls] = aqiLabel(aqiVal, 100);

      return `<div class="city-section">
        <div class="city-section-title">📍 ${label}</div>
        <div class="cards-row">
          <div class="dc"><div class="dct">AQI (US)</div>
            <div class="dcv" style="color:#e879f9">${aqiVal}</div>
            <div class="dcs ${cls}">${lbl}</div></div>
          <div class="dc"><div class="dct">PM2.5</div>
            <div class="dcv" style="color:#ef4444">${p?.p2?.conc?.toFixed(1)||'—'}<span class="dcu">мкг/м³</span></div></div>
          <div class="dc"><div class="dct">Забруднювач</div>
            <div class="dcv" style="font-size:14px;color:var(--warn)">${p?.mainus||'—'}</div></div>
          <div class="dc"><div class="dct">Темп / Вологість</div>
            <div class="dcv" style="font-size:13px;color:#60a5fa">${w2?.tp||'—'}°C / ${w2?.hu||'—'}%</div></div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = sections;
  }
}
