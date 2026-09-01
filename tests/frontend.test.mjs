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
  assert.deepEqual(
    app.flagshipFirst([
      { id: 1, name: 'Older product' },
      { id: 2, name: 'Operator Stack', badge: 'FLAGSHIP' },
      { id: 3, name: 'Newer product' },
    ]).map((product) => product.id),
    [2, 1, 3],
  );
  assert.deepEqual(
    app.flagshipFirst([
      { id: 1, name: 'Later', featured: true, featuredOrder: 4 },
      { id: 2, name: 'First', featured: true, featuredOrder: 0 },
      { id: 3, name: 'Regular', badge: 'FLAGSHIP' },
    ]).map((product) => product.id),
    [2, 1, 3],
  );

  assert.deepEqual(app.normalizeGallery(['https://example.com/a.jpg']), [{
    id: 'wall-1',
    url: 'https://example.com/a.jpg',
    alt: 'ShadowGLB visual 1',
  }]);
  assert.deepEqual(app.normalizeGallery([null, '', { nope: true }]), []);
});

test('homepage contact actions accept configurable email, WhatsApp, and public Telegram details', async () => {
  const homepage = await import('../dist/assets/homepage.js');
  const admin = await readFile(new URL('../dist/assets/admin.js', import.meta.url), 'utf8');

  assert.equal(
    homepage.emailInquiryHref('hello@example.co.uk', 'Build enquiry', 'Hello there'),
    'mailto:hello@example.co.uk?subject=Build%20enquiry&body=Hello%20there',
  );
  assert.equal(homepage.normalizeWhatsAppNumber('+44 7700 900-123'), '447700900123');
  assert.equal(homepage.normalizeWhatsAppNumber('07359 468099'), '447359468099');
  assert.equal(
    homepage.whatsappInquiryHref('+44 7700 900-123', 'Hello there'),
    'https://wa.me/447700900123?text=Hello%20there',
  );
  assert.equal(homepage.whatsappInquiryHref('123', 'Hello'), '');
  assert.equal(homepage.normalizeTelegramUrl('https://t.me/shadowintel'), 'https://t.me/shadowintel');
  assert.equal(homepage.normalizeTelegramUrl('https://example.com/not-telegram'), '');
  assert.match(admin, /WhatsApp number/);
  assert.match(admin, /Public Telegram channel/);
  assert.match(admin, /Private Telegram buyer invite/);
  assert.match(admin, /Additional delivery options/);
  assert.match(admin, /Buyer delivery message/);
  assert.match(admin, /Duplicate as draft/);
  assert.match(admin, /Secure delivery ZIP files/);
  assert.match(admin, /Store Copy/);
  assert.match(admin, /Featured/);
  assert.match(admin, /type="email"/);
});

test('homepage prioritizes the product marked as flagship', async () => {
  const homepage = await import('../dist/assets/homepage.js');
  const flagship = homepage.featuredProduct({
    products: [
      { id: 1, name: 'Older product', ptype: 'Playbook' },
      { id: 2, name: 'Operator Stack', ptype: 'Bundle', badge: 'FLAGSHIP' },
    ],
  });

  assert.equal(flagship.id, 2);

  const ordered = homepage.featuredProducts({
    products: [
      { id: 1, name: 'Second', featured: true, featuredOrder: 1 },
      { id: 2, name: 'First', featured: true, featuredOrder: 0 },
      { id: 3, name: 'Hidden', featured: true, featuredOrder: 0, visible: false },
    ],
  });
  assert.deepEqual(ordered.map((product) => product.id), [2, 1]);
});

test('homepage showcase accepts simple title/link pairs and full media entries', async () => {
  const homepage = await import('../dist/assets/homepage.js');

  assert.deepEqual(homepage.parseShowcase([
    'AI UGC OPERATOR',
    'https://example.com/ugc',
    'E-commerce command|https://example.com/store',
  ]), [
    {
      title: 'AI UGC OPERATOR',
      description: '',
      url: '',
      isVideo: false,
      link: 'https://example.com/ugc',
    },
    {
      title: 'E-commerce command',
      description: '',
      url: '',
      isVideo: false,
      link: 'https://example.com/store',
    },
  ]);

  assert.deepEqual(homepage.parseShowcase([
    'Command centre|Live dashboard build|https://cdn.example.com/preview.png|https://example.com/live',
  ]), [{
    title: 'Command centre',
    description: 'Live dashboard build',
    url: 'https://cdn.example.com/preview.png',
    isVideo: false,
    link: 'https://example.com/live',
  }]);
  assert.equal(homepage.parseShowcase(['https://example.com/orphan']).length, 0);
});

test('every catalogue keeps the shared product swipe rail', async () => {
  const appSource = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(appSource, /product-grid is-swipe-rail/);
  assert.match(appSource, /product-grid systems-grid is-swipe-rail/);
  assert.match(appSource, /installRail\(grid, '\.product-card'\)/);
  assert.match(appSource, /dossier-rail/);
  assert.match(styles, /\.product-grid\.is-swipe-rail\s*\{/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /-webkit-overflow-scrolling:\s*touch/);
});
