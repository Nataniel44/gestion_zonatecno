import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

const server = http.createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const safe = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  let file = path.join(root, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!existsSync(file) || safe.endsWith('/')) file = path.join(root, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(500); res.end('Build error');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`ZT Gestión escuchando en 0.0.0.0:${port}`));
