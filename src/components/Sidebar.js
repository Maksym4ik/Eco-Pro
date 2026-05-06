import { PP } from '../store/state.js';

// Sidebar — панель фільтрів, шарів, слайдера і легенди
export class Sidebar {
  constructor(el, callbacks = {}) {
    this.el       = el;
    this.onRender = callbacks.onRender || (() => {});
    this._state   = null;
  }

  render(s) {
    this._state = s;

    const paramItems = [
      { p: 'pm25', color: '#ef4444', label: 'PM2.5',       unit: 'мкг/м³' },
      { p: 'pm10', color: '#f59e0b', label: 'PM10',        unit: 'мкг/м³' },
      { p: 'no2',  color: '#a78bfa', label: 'NO₂',         unit: 'мкг/м³' },
      { p: 'o3',   color: '#34d399', label: 'O₃',          unit: 'мкг/м³' },
      { p: 'co',   color: '#60a5fa', label: 'CO',          unit: 'мкг/м³' },
      { p: 'so2',  color: '#fb923c', label: 'SO₂',         unit: 'мкг/м³' },
      { p: 'aqi',  color: '#e879f9', label: 'AQI (IQAir)', unit: 'індекс' },
    ];

    const layerItems = [
      { l: 'stations', color: '#4f8ef7', label: 'Станції'      },
      { l: 'region',   color: '#34d399', label: 'Межі Волині'  },
      { l: 'heat',     color: '#ef4444', label: 'Теплова зона' },
      { l: 'temp',     color: '#f59e0b', label: 'Карта темп.'  },
      { l: 'wind',     color: '#60a5fa', label: 'Карта вітрів' },
    ];

    const today = new Date().toISOString().slice(0, 10);
    const h = s.hour;

    this.el.innerHTML = `
      <div class="ss">
        <div class="st">Параметри</div>
        <div class="fg" id="s-fg">
          ${paramItems.map(({ p, color, label, unit }) => `
            <label class="fi ${s.params.has(p) ? 'active' : ''}" data-p="${p}"${PP[p] ? ` data-tip="${PP[p]}"` : ''}>
              <input type="checkbox" ${s.params.has(p) ? 'checked' : ''}>
              <div class="fd" style="background:${color}"></div>
              <span class="fl">${label}</span>
              <span class="fb">${unit}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="ss">
        <div class="st">Шари</div>
        <div class="fg" id="s-lg">
          ${layerItems.map(({ l, color, label }) => `
            <label class="fi ${s.layers.has(l) ? 'active' : ''}" data-l="${l}">
              <input type="checkbox" ${s.layers.has(l) ? 'checked' : ''}>
              <div class="fd" style="background:${color}"></div>
              <span class="fl">${label}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="ss">
        <div class="st">Дата</div>
        <input type="date" class="di" id="s-date" value="${today}" max="${today}">
        <div class="tw">
          <div class="tv" id="s-tv">${String(h).padStart(2, '0')}:00</div>
          <input type="range" id="s-hs" min="0" max="23" value="${h}">
          <div class="tl"><span>00:00</span><span>23:00</span></div>
        </div>
      </div>

      <div class="ss">
        <div class="st">AQI — Легенда</div>
        <div class="li"><div class="lc" style="background:#34d399"></div>0–50 Добра</div>
        <div class="li"><div class="lc" style="background:#fbbf24"></div>51–100 Помірна</div>
        <div class="li"><div class="lc" style="background:#f97316"></div>101–150 Нездорова для чутл.</div>
        <div class="li"><div class="lc" style="background:#ef4444"></div>151–200 Нездорова</div>
        <div class="li"><div class="lc" style="background:#7c3aed"></div>201+ Небезпечна</div>
      </div>`;

    this._attachEvents(s);
  }

  _attachEvents(s) {
    // Загальний хелпер для toggle-пунктів (label + hidden checkbox)
    // e.preventDefault() блокує браузерний авто-тогл чекбоксу,
    // щоб уникнути подвійного перемикання
    const bindToggle = (selector, onToggle) => {
      this.el.querySelectorAll(selector).forEach(fi => {
        fi.addEventListener('click', e => {
          e.preventDefault();
          const cb = fi.querySelector('input');
          cb.checked = !cb.checked;
          fi.classList.toggle('active', cb.checked);
          onToggle(fi, cb.checked);
          this.onRender();
        });
      });
    };

    // Параметри
    bindToggle('#s-fg .fi', (fi, checked) => {
      const p = fi.dataset.p;
      if (p) { checked ? s.params.add(p) : s.params.delete(p); }
    });

    // Шари
    bindToggle('#s-lg .fi', (fi, checked) => {
      const l = fi.dataset.l;
      if (l) { checked ? s.layers.add(l) : s.layers.delete(l); }
    });

    // Годинний слайдер
    const hs = this.el.querySelector('#s-hs');
    if (hs) {
      hs.addEventListener('input', () => {
        s.hour = +hs.value;
        this.el.querySelector('#s-tv').textContent = `${String(s.hour).padStart(2, '0')}:00`;
        // Перерахувати симуляцію для станцій без реальних даних
        s.stations.forEach(st => {
          if (!st.hasReal && !st.iqSource) st.data = s._simFn(st, s.hour);
        });
        this.onRender();
      });
    }
  }
}
