import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile('dist/index.html', 'utf8');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const destinations = new Set(config.rewrites.map((item) => item.source));

assert.match(html, /id="app"/);
assert.match(html, /\/assets\/app\.js/);
for (const route of ['/systems', '/wall', '/admin', '/products/:path*', '/checkout/success']) {
  assert.ok(destinations.has(route), `Missing Vercel rewrite for ${route}`);
}
console.log('Static shell and production route rewrites verified.');
