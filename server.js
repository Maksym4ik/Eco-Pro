// Простий статичний сервер з proxy для API що блокують CORS
// Запуск: npm start (або node server.js)
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Читаємо .env вручну (без залежностей від dotenv)
try {
  const envText = fs.readFileSync(new URL('.env', import.meta.url), 'utf8');
  for (const line of envText.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) { const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim(); if (k && !process.env[k]) process.env[k] = v; }
  }
} catch {}

const PORT = process.env.PORT || 3000;
const __dir = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.map':  'application/json',
};

// Проксі-маршрути: /proxy/<alias>/<path> → реальний URL
const PROXY_MAP = {
  'saveecobot':      'https://api.saveecobot.com',
  'saveecobot-maps': 'https://www.saveecobot.com/storage',
};

function proxyRequest(req, res, targetBase, subPath, redirectCount = 0) {
  if (redirectCount > 5) {
    res.writeHead(502); res.end('Too many redirects'); return;
  }
  const targetUrl = `${targetBase}/${subPath}`;
  const opts = { headers: { Accept: 'application/json', 'User-Agent': 'EcoWidget/1.0' } };
  https.get(targetUrl, opts, upstream => {
    // Слідуємо за редіректами
    if ([301, 302, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
      upstream.resume();
      const loc = upstream.headers.location;
      const parsed = new URL(loc, targetUrl);
      const newBase = `${parsed.protocol}//${parsed.host}`;
      const newPath = parsed.pathname.slice(1) + parsed.search;
      proxyRequest(req, res, newBase, newPath, redirectCount + 1);
      return;
    }
    res.writeHead(upstream.statusCode, {
      'Content-Type': upstream.headers['content-type'] || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=60',
    });
    upstream.pipe(res);
  }).on('error', err => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

function serveStatic(req, res) {
  const rawPath = req.url.split('?')[0];
  const filePath = path.join(__dir, rawPath === '/' ? 'index.html' : rawPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
    res.end();
    return;
  }

  if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      IQAIR_KEY:        process.env.IQAIR_KEY        || '',
      ECOWITT_APP_KEY:  process.env.ECOWITT_APP_KEY  || '',
      ECOWITT_API_KEY:  process.env.ECOWITT_API_KEY  || '',
      ECOWITT_MAC:      process.env.ECOWITT_MAC       || '',
    }));
    return;
  }

  // /proxy/<alias>/...
  const proxyMatch = req.url.match(/^\/proxy\/([^/]+)\/?(.*)/);
  if (proxyMatch) {
    const [, alias, subPath] = proxyMatch;
    const base = PROXY_MAP[alias];
    if (base) { proxyRequest(req, res, base, subPath); return; }
  }

  serveStatic(req, res);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Порт ${PORT} вже зайнятий.`);
    console.error(`   Зупиніть інший сервер: lsof -ti:${PORT} | xargs kill -9`);
    console.error(`   Або використайте інший порт: PORT=3001 npm start\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n✅ EcoWidget сервер запущено`);
  console.log(`   Відкрити: http://localhost:${PORT}`);
  console.log(`   Proxy:    http://localhost:${PORT}/proxy/saveecobot-maps/maps_data.js\n`);
});
