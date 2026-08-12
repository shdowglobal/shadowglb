import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('storefront entry bridge cannot create a self-triggering navigation observer', async () => {
  const entry = await readFile(new URL('../dist/assets/entry.js', import.meta.url), 'utf8');

  assert.doesNotMatch(entry, /MutationObserver/);
  assert.match(entry, /window\.location\.assign/);
});

test('frontend route, product grouping, money, and Wall helpers', async () => {
  const app = await import('../dist/assets/app.js');

  assert.equal(app.routeFromPath('/'), 'home');
  assert.equal(app.routeFromPath('/systems/'), 'systems');
  assert.equal(app.routeFromPath('/wall'), 'wall');
  assert.equal(app.routeFromPath('/products/42/'), 'product');
  assert.equal(app.routeFromPath('/checkout/success'), 'success');
  assert.equal(app.routeFromPath('/unknown'), 'not-found');

  assert.equal(app.isSystemsProduct({ ptype: 'System' }), true);
  assert.equal(app.isSystemsProduct({ ptype: 'Template' }), true);
  assert.equal(app.isSystemsProduct({ ptype: 'Playbook' }), false);
  assert.equal(app.formatMoney('29.99'), '£29.99');

  assert.deepEqual(app.normalizeGallery(['https://example.com/a.jpg']), [{
    id: 'wall-1',
    url: 'https://example.com/a.jpg',
    alt: 'ShadowGLB visual 1',
  }]);
  assert.deepEqual(app.normalizeGallery([null, '', { nope: true }]), []);
});
