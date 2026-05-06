// Charts.js — Chart.js обгортка для темної теми (Chart — CDN глобал)

const GRID_COLOR  = '#1a2030';
const TICK_COLOR  = '#4a5568';
const LEGEND_CLR  = '#8b98b0';

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: LEGEND_CLR, font: { size: 10 }, boxWidth: 10 } },
    },
    scales: {
      x: { ticks: { color: TICK_COLOR, font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: GRID_COLOR } },
      y: { ticks: { color: TICK_COLOR, font: { size: 9 } }, grid: { color: GRID_COLOR } },
    },
  };
}

// Графік якості повітря — погодинна симуляція за добу
export function renderAirChart(canvas, avgs, active, PC, PN) {
  if (!canvas) return null;
  const hrs = Array.from({ length: 24 }, (_, i) => i);
  /* eslint-disable no-undef */
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hrs.map(h => `${h}:00`),
      datasets: active.map(p => ({
        label: PN[p],
        data: hrs.map(h => {
          const f = ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) ? 1.4 : (h <= 5 ? 0.5 : 1);
          return +(avgs[p] * f * (0.8 + Math.random() * 0.4)).toFixed(1);
        }),
        borderColor: PC[p],
        backgroundColor: PC[p] + '1a',
        tension: 0.4, fill: false, pointRadius: 1, borderWidth: 2,
      })),
    },
    options: baseOptions(),
  });
  /* eslint-enable no-undef */
}

// Графік погоди — дані з Open-Meteo hourly
export function renderWeatherChart(canvas, hourly) {
  if (!canvas || !hourly) return null;
  const hrs   = (hourly.time || []).map(t => t.slice(11, 16));
  const temps = hourly.temperature_2m || [];
  const hum   = hourly.relative_humidity_2m || [];

  const opts = baseOptions();
  opts.scales.y1 = { position: 'right', ticks: { color: '#34d399', font: { size: 9 } }, grid: { drawOnChartArea: false } };
  opts.scales.y.ticks = { color: '#60a5fa', font: { size: 9 } };

  /* eslint-disable no-undef */
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hrs,
      datasets: [
        { label: 'Темп °C',      data: temps, borderColor: '#60a5fa', backgroundColor: '#60a5fa1a', tension: 0.4, fill: true,  pointRadius: 0, borderWidth: 2, yAxisID: 'y'  },
        { label: 'Вологість %',  data: hum,   borderColor: '#34d399', tension: 0.4,                 fill: false, pointRadius: 0, borderWidth: 2, yAxisID: 'y1' },
      ],
    },
    options: opts,
  });
  /* eslint-enable no-undef */
}

// Стовпчастий графік — поточні значення параметру по станціях
export function renderStationsChart(canvas, stations, param, PC, PN) {
  if (!canvas || !stations.length) return null;
  const opts = baseOptions();
  opts.plugins.legend = { display: false };
  opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 40, font: { size: 9 } };
  /* eslint-disable no-undef */
  return new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: stations.map(st => st.name.split('—')[1]?.trim() || st.name.split(' ')[0]),
      datasets: [{
        label: PN[param] || param,
        data:  stations.map(st => +(st.data[param] ?? 0).toFixed(1)),
        backgroundColor: (PC[param] || '#4f8ef7') + '55',
        borderColor:     PC[param] || '#4f8ef7',
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: opts,
  });
  /* eslint-enable no-undef */
}

export function destroyChart(chart) {
  if (chart) { chart.destroy(); }
  return null;
}
