import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(process.cwd(), 'dist');
const port = Number(process.env.PORT || 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json; charset=utf-8'],
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    let target = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(501, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Run with Vercel for live API functions.' }));
      return;
    }
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    } catch {
      target = path.join(root, 'index.html');
    }
    const body = await readFile(target);
    response.writeHead(200, { 'content-type': types.get(path.extname(target)) || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`ShadowGLB preview: http://127.0.0.1:${port}`);
});
