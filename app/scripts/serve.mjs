import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname);

  // Healthcheck para el orquestador (Railway/Fly/Coolify/Uptime).
  if (requested === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders });
    res.end('ok');
    return;
  }

  const safe = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const file = path.join(root, safe === '/' ? 'index.html' : safe.slice(1));
  if (!file.startsWith(root)) {
    res.writeHead(403, securityHeaders); res.end('Forbidden'); return;
  }

  const isAsset = /^\/(assets|icons?|favicons?)\//.test(safe) || /\.[a-z0-9]+$/i.test(safe);
  const wantsHTML = (req.headers.accept || '').includes('text/html');

  try {
    if (existsSync(file) && statSync(file).isFile()) {
      const body = await readFile(file);
      const ext = path.extname(file);
      // Assets con hash de Vite: cache agresivo. HTML y SW: siempre fresco.
      const cache = /^\/(assets)\//.test(safe)
        ? 'public, max-age=31536000, immutable'
        : ext === '.html' || safe.endsWith('sw.js') || safe.endsWith('registerSW.js')
          ? 'no-cache'
          : 'public, max-age=3600';
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': cache, ...securityHeaders });
      res.end(body);
      return;
    }
    // SPA fallback SOLO para navegaciones. Un asset faltante es 404, no index.html.
    if (wantsHTML || !isAsset) {
      const body = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...securityHeaders });
      res.end(body);
      return;
    }
    res.writeHead(404, securityHeaders); res.end('Not found');
  } catch {
    res.writeHead(500, securityHeaders); res.end('Build error');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`ZT Gestión escuchando en 0.0.0.0:${port}`));
