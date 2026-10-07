import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/artifacts/demo/bondtrace-product-demo.mp4', ['artifacts/demo/bondtrace-product-demo.mp4', 'video/mp4']],
  ['/artifacts/demo/poster.png', ['artifacts/demo/poster.png', 'image/png']],
  ['/artifacts/demo/bondtrace-product-demo.en.srt', ['artifacts/demo/bondtrace-product-demo.en.srt', 'text/plain; charset=utf-8']],
  ['/artifacts/demo/bondtrace-product-demo.en.vtt', ['artifacts/demo/bondtrace-product-demo.en.vtt', 'text/vtt; charset=utf-8']],
  ['/docs/evidence/browser-cycle-localnet.json', ['docs/evidence/browser-cycle-localnet.json', 'application/json']],
  ['/docs/evidence/full-smoke-localnet.json', ['docs/evidence/full-smoke-localnet.json', 'application/json']],
]);
const port = Number(process.env.BONDTRACE_SUBMISSION_PORT ?? 5180);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
http.createServer((req, res) => {
  const item = files.get(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  if (!['GET', 'HEAD'].includes(req.method ?? '') || !item) { res.writeHead(404); res.end(); return; }
  const file = path.resolve(item[0]);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const size = fs.statSync(file).size;
  const headers = { 'content-type': item[1], 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' };
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!match) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return; }
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return; }
    headers['content-range'] = `bytes ${start}-${end}/${size}`; status = 206;
  }
  headers['content-length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Submission preview: http://127.0.0.1:${port}`));
