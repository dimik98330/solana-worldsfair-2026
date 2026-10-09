import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A local, read-only view of existing evidence; never a replacement chain/API.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const evidencePath = path.join(root, 'docs/evidence/execution-lifecycle-localnet.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run npm run build before preview:ui.');
const state = { ...evidence.state, demo: { ...evidence.state.demo, available: false }, readOnlySnapshot: { capturedAt: evidence.checkedAt, source: 'execution-lifecycle-localnet.json' } };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (!['GET', 'HEAD'].includes(req.method)) return json(403, { error: { code: 'SNAPSHOT_READ_ONLY', message: 'Saved evidence preview is read-only. Use the live test API for operations.' } });
  if (url.pathname === '/api/state') return json(200, state);
  if (url.pathname.startsWith('/api/')) return json(403, { error: { code: 'SNAPSHOT_READ_ONLY', message: 'This local preview reads a saved snapshot only.' } });
  let file;
  try { file = path.resolve(dist, '.' + decodeURIComponent(url.pathname)); } catch { res.writeHead(400); return res.end(); }
  if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file)) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.listen(4180, '127.0.0.1', () => console.log('BondTrace saved localnet snapshot (read-only): http://127.0.0.1:4180'));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
