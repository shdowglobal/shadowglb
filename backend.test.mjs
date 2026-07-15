import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parsePriceToMinor,
  sanitizePublicStore,
  validateAdminStoreInput,
  validateCheckoutBody,
} = require('../api/_lib/store.js');
const { getMediaBucket, getSiteUrl, isAdminEmailAllowed, parseAdminEmails } = require('../api/_lib/env.js');
const { verifyStripeSignature } = require('../api/_lib/stripe.js');

test('public store sanitization exposes display data but never checkout or delivery fields', () => {
  const result = sanitizePublicStore({
    pwd: 'legacy-password',
    settings: { email: 'HELLO@example.com', w3key: 'legacy-webhook-key' },
    stats: { earned: 9999 },
    content: {
      title: 'Systems built to win.',
      stripeSecret: 'must-not-leak',
      nested: { deliveryLink: 'https://secret.example/file', eyebrow: 'Operator resources' },
    },
    products: [
      {
        id: 1,
        name: 'Operator Bible',
        price: '29.99',
        deliveryLink: 'https://delivery.example/operator-bible',
        stripeLink: 'https://buy.stripe.com/legacy',
        stripePriceId: 'price_secretish',
        active: true,
      },
      { id: 2, name: 'Draft', price: '9.99', deliveryLink: 'https://delivery.example/draft', active: false },
      { id: 3, name: 'Not configured', price: '9.99', deliveryLink: 'http://insecure.example/file', active: true },
    ],
  }, '2026-07-13T12:00:00.000Z');

  assert.equal(result.updatedAt, '2026-07-13T12:00:00.000Z');
  assert.equal(result.contactEmail, 'hello@example.com');
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].checkoutReady, true);
  assert.equal(result.products[1].checkoutReady, false);
  assert.equal(result.products[0].deliveryLink, undefined);
  assert.equal(result.products[0].stripeLink, undefined);
  assert.equal(result.products[0].stripePriceId, undefined);
  assert.equal(result.content.stripeSecret, undefined);
  assert.equal(result.content.nested.deliveryLink, undefined);
  assert.equal(result.pwd, undefined);
  assert.equal(result.settings, undefined);
  assert.equal(result.stats, undefined);
});

test('Stripe webhook signatures require a matching HMAC and a fresh timestamp', () => {
  const secret = 'whsec_unit_test_only';
  const timestamp = 1_800_000_000;
  const payload = Buffer.from('{"id":"evt_test","type":"checkout.session.completed"}');
  const signature = crypto.createHmac('sha256', secret).update(Buffer.concat([
    Buffer.from(`${timestamp}.`),
    payload,
  ])).digest('hex');
  const header = `t=${timestamp},v1=${'0'.repeat(64)},v1=${signature}`;

  assert.equal(verifyStripeSignature(payload, header, secret, { now: timestamp }), true);
  assert.equal(verifyStripeSignature(Buffer.from('{}'), header, secret, { now: timestamp }), false);
  assert.equal(verifyStripeSignature(payload, header, 'whsec_wrong', { now: timestamp }), false);
  assert.equal(verifyStripeSignature(payload, header, secret, { now: timestamp + 301 }), false);
  assert.equal(verifyStripeSignature(payload, 'malformed', secret, { now: timestamp }), false);
});

test('admin allowlist uses normalized exact email matches only', () => {
  const allowlist = ' Owner@Example.com,staff@example.com; second@example.co.uk ';
  assert.deepEqual(parseAdminEmails(allowlist), ['owner@example.com', 'staff@example.com', 'second@example.co.uk']);
  assert.equal(isAdminEmailAllowed('OWNER@example.com', allowlist), true);
  assert.equal(isAdminEmailAllowed('not-owner@example.com', allowlist), false);
  assert.equal(isAdminEmailAllowed('owner@example.com.attacker.test', allowlist), false);
  assert.equal(isAdminEmailAllowed('', allowlist), false);
  assert.equal(isAdminEmailAllowed('owner@example.com', ''), false);
});

test('preview checkout prefers its Vercel URL and media bucket names are constrained', () => {
  const original = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    SITE_URL: process.env.SITE_URL,
    SUPABASE_MEDIA_BUCKET: process.env.SUPABASE_MEDIA_BUCKET,
  };
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'shadowglb-preview.vercel.app';
    process.env.SITE_URL = 'https://shadowglb.com';
    assert.equal(getSiteUrl(), 'https://shadowglb-preview.vercel.app');

    process.env.VERCEL_ENV = 'production';
    assert.equal(getSiteUrl(), 'https://shadowglb.com');

    process.env.SUPABASE_MEDIA_BUCKET = 'shadowglb-previews_2';
    assert.equal(getMediaBucket(), 'shadowglb-previews_2');
    process.env.SUPABASE_MEDIA_BUCKET = '../unsafe';
    assert.throws(() => getMediaBucket(), /invalid/i);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('checkout and store validation reject ambiguous IDs, prices, emails, and duplicate products', () => {
  assert.deepEqual(validateCheckoutBody({ productId: 42, email: 'Buyer@Example.com' }), {
    productId: '42',
    email: 'buyer@example.com',
  });
  assert.equal(parsePriceToMinor('29.99'), 2999);
  assert.equal(parsePriceToMinor('29.9'), 2990);
  assert.throws(() => parsePriceToMinor('0'), /invalid price/i);
  assert.throws(() => parsePriceToMinor('-1.00'), /invalid price/i);
  assert.throws(() => parsePriceToMinor('1.999'), /invalid price/i);
  assert.throws(() => validateCheckoutBody({ productId: '../secret' }), /productId/i);
  assert.throws(() => validateCheckoutBody({ productId: 'one', email: 'invalid' }), /email/i);
  assert.throws(() => validateAdminStoreInput({
    products: [
      { id: 'same', name: 'One', price: '1.00' },
      { id: 'same', name: 'Two', price: '2.00' },
    ],
  }), /unique/i);
  assert.throws(() => validateAdminStoreInput(JSON.parse('{"products":[],"__proto__":{"polluted":true}}')), /forbidden key/i);
});
