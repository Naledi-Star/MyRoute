/**
 * Minimal static file server for the exported web build (`npx expo export --platform web`).
 * Dependency free so it can run anywhere: `node scripts/serve-dist.js [port]`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(process.cwd(), 'dist');
const port = Number(process.argv[2] ?? 8090);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

http
  .createServer((request, response) => {
    const url = decodeURIComponent((request.url ?? '/').split('?')[0]);
    let file = path.join(root, url);
    if (!file.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      file = path.join(root, 'index.html');
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, () => console.log(`serving dist on http://localhost:${port}`));
