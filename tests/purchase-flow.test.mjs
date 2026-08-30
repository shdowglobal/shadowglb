import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const checkout = require('../api/checkout.js');
const checkoutSession = require('../api/checkout-session.js');
const claimFree = require('../api/claim-free.js');
const stripeWebhook = require('../api/stripe-webhook.js');

function responseRecorder() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: '',
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    end(value = '') { this.body += String(value); },
    json() { return JSON.parse(this.body || '{}'); },
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('server purchase path prices checkout, verifies payment, records delivery, and never trusts the browser', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const calls = [];
  const product = {
    id: 'operator-bible',
    name: 'Operator Bible',
    description: 'A field-tested operating system.',
    price: '29.99',
    currency: 'gbp',
    active: true,
    deliveryLink: 'https://delivery.example/protected/operator-bible',
    deliveryLabel: 'Open the Operator Bible',
    deliveryItems: [{ label: 'Watch the setup', url: 'https://delivery.example/tutorial', type: 'workspace' }],
    deliveryMessage: 'Start with the setup video.',
  };

  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'shadowglb-feature-preview.vercel.app',
      SITE_URL: 'https://shadowglb.example',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon_unit_test',
      SUPABASE_SERVICE_ROLE_KEY: 'service_role_unit_test',
      STRIPE_SECRET_KEY: 'sk_test_unit_only',
      STRIPE_WEBHOOK_SECRET: 'whsec_unit_only',
    });
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    globalThis.fetch = async (url, options = {}) => {
      const href = String(url);
      calls.push({ href, options });
      if (href.startsWith('https://project.supabase.co/rest/v1/shadowgbl_store')) {
        assert.equal(options.headers.apikey, 'service_role_unit_test');
        return jsonResponse([{ id: 'store', data: { products: [product], content: { privateTelegramUrl: 'https://t.me/+buyer-network' } }, updated_at: '2026-07-13T12:00:00.000Z' }]);
      }
      if (href === 'https://api.stripe.com/v1/checkout/sessions') {
        const body = new URLSearchParams(String(options.body));
        assert.equal(body.get('line_items[0][price_data][unit_amount]'), '2999');
        assert.equal(body.get('metadata[product_id]'), product.id);
        assert.equal(body.get('success_url'), 'https://shadowglb-feature-preview.vercel.app/checkout/success/?session_id={CHECKOUT_SESSION_ID}');
        assert.equal(body.has('deliveryLink'), false);
        return jsonResponse({ id: 'cs_test_verified123', url: 'https://checkout.stripe.com/c/pay/cs_test_verified123' });
      }
      if (href === 'https://api.stripe.com/v1/checkout/sessions/cs_test_verified123') {
        return jsonResponse({
          id: 'cs_test_verified123',
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 2999,
          currency: 'gbp',
          customer_details: { email: 'buyer@example.com' },
          metadata: { product_id: product.id, unit_amount: '2999', currency: 'gbp' },
        });
      }
      if (href.startsWith('https://project.supabase.co/rest/v1/shadowgbl_orders')) {
        assert.equal(options.method, 'POST');
        const order = JSON.parse(String(options.body));
        assert.equal(order.product_id, product.id);
        assert.equal(order.amount_total, 2999);
        assert.equal(order.delivery_link, product.deliveryLink);
        return jsonResponse([{ id: 'order-unit-test', ...order }], 201);
      }
      throw new Error(`Unexpected request: ${href}`);
    };

    const checkoutResponse = responseRecorder();
    await checkout({
      method: 'POST',
      headers: {
        origin: 'https://shadowglb-feature-preview.vercel.app',
        host: 'shadowglb-feature-preview.vercel.app',
        'x-forwarded-proto': 'https',
      },
      body: { productId: product.id, price: '0.01', deliveryLink: 'https://attacker.test/file' },
    }, checkoutResponse);
    assert.equal(checkoutResponse.statusCode, 200);
    assert.equal(checkoutResponse.json().url, 'https://checkout.stripe.com/c/pay/cs_test_verified123');

    const sessionResponse = responseRecorder();
    await checkoutSession({ method: 'GET', headers: {}, query: { session_id: 'cs_test_verified123' } }, sessionResponse);
    assert.equal(sessionResponse.statusCode, 200);
    assert.equal(sessionResponse.json().paid, true);
    assert.equal(sessionResponse.json().deliveryUrl, product.deliveryLink);
    assert.equal(sessionResponse.json().delivery.items.length, 3);
    assert.equal(sessionResponse.json().delivery.items[0].label, 'Open the Operator Bible');
    assert.equal(sessionResponse.json().delivery.items[2].url, 'https://t.me/+buyer-network');
    assert.equal(sessionResponse.json().delivery.message, 'Start with the setup video.');

    const event = {
      id: 'evt_checkout_unit_test',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_verified123',
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: 'pi_unit_test',
          amount_total: 2999,
          currency: 'gbp',
          customer_details: { email: 'buyer@example.com' },
          metadata: { product_id: product.id, unit_amount: '2999', currency: 'gbp' },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
      .digest('hex');
    const webhookResponse = responseRecorder();
    await stripeWebhook({
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      rawBody,
    }, webhookResponse);
    assert.equal(webhookResponse.statusCode, 200);
    assert.deepEqual(webhookResponse.json(), {
      received: true,
      handled: true,
      duplicate: false,
      emailSent: false,
    });
    assert.equal(calls.filter((call) => call.href === 'https://api.stripe.com/v1/checkout/sessions').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

test('paid delivery endpoint verifies the Stripe session and streams the exact private ZIP filename', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x53, 0x48, 0x41, 0x44, 0x4f, 0x57]);
  const sha256 = crypto.createHash('sha256').update(zip).digest('hex');
  const product = {
    id: 'operator-stack-v1',
    name: 'SHADOW // OPERATOR STACK V1',
    price: '59',
    active: true,
    deliveryAsset: {
      bucket: 'shadowglb-deliveries',
      path: 'releases/operator-stack-v1/SHADOW_OPERATOR_STACK_V1_FINAL.zip',
      fileName: 'SHADOW_OPERATOR_STACK_V1_FINAL.zip',
      contentType: 'application/zip',
      size: zip.length,
      sha256,
    },
  };
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon_unit_test',
      SUPABASE_SERVICE_ROLE_KEY: 'service_role_unit_test',
      STRIPE_SECRET_KEY: 'sk_test_unit_only',
    });
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.startsWith('https://project.supabase.co/rest/v1/shadowgbl_store')) {
        return jsonResponse([{ id: 'store', data: { products: [product] }, updated_at: '2026-08-30T12:00:00.000Z' }]);
      }
      if (href === 'https://api.stripe.com/v1/checkout/sessions/cs_test_stackpaid') {
        return jsonResponse({
          id: 'cs_test_stackpaid',
          payment_status: 'paid',
          amount_total: 5900,
          metadata: { product_id: product.id, unit_amount: '5900', currency: 'gbp' },
        });
      }
      if (href.includes('/storage/v1/object/shadowglb-deliveries/releases/operator-stack-v1/SHADOW_OPERATOR_STACK_V1_FINAL.zip')) {
        return new Response(zip, { status: 200, headers: { 'content-type': 'application/zip', 'content-length': String(zip.length) } });
      }
      throw new Error(`Unexpected request: ${href}`);
    };

    const headers = new Map();
    const response = {
      statusCode: 200,
      body: Buffer.alloc(0),
      setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
      end(value = '') { this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value)); },
    };
    await checkoutSession({
      method: 'GET',
      headers: {},
      query: { delivery: '1', product_id: product.id, session_id: 'cs_test_stackpaid' },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, zip);
    assert.equal(headers.get('content-type'), 'application/zip');
    assert.equal(headers.get('content-disposition'), 'attachment; filename="SHADOW_OPERATOR_STACK_V1_FINAL.zip"');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

test('Research Operator Lite unlocks separately for free and cannot expose the paid stack', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const asset = (fileName, size, sha256) => ({
    bucket: 'shadowglb-deliveries',
    path: `releases/${fileName}`,
    fileName,
    contentType: 'application/zip',
    size,
    sha256,
  });
  const products = [
    { id: 'research-operator-lite', name: 'SHADOW // RESEARCH OPERATOR LITE', price: '0', active: true, deliveryAsset: asset('SHADOW_RESEARCH_OPERATOR_LITE_FINAL.zip', 5543, 'b'.repeat(64)) },
    { id: 'operator-stack-v1', name: 'SHADOW // OPERATOR STACK V1', price: '59', active: true, deliveryAsset: asset('SHADOW_OPERATOR_STACK_V1_FINAL.zip', 125785, 'a'.repeat(64)) },
  ];
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      SITE_URL: 'https://www.shadowglb.com',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon_unit_test',
      SUPABASE_SERVICE_ROLE_KEY: 'service_role_unit_test',
    });
    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://project.supabase.co/rest/v1/shadowgbl_store')) {
        return jsonResponse([{ id: 'store', data: { products }, updated_at: '2026-08-30T12:00:00.000Z' }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const request = (productId) => ({
      method: 'POST',
      headers: { origin: 'https://www.shadowglb.com', host: 'www.shadowglb.com', 'x-forwarded-proto': 'https' },
      body: { productId },
    });
    const freeResponse = responseRecorder();
    await claimFree(request('research-operator-lite'), freeResponse);
    assert.equal(freeResponse.statusCode, 200);
    assert.equal(freeResponse.json().deliveryUrl, 'https://www.shadowglb.com/api/checkout-session?delivery=1&product_id=research-operator-lite');

    const paidResponse = responseRecorder();
    await claimFree(request('operator-stack-v1'), paidResponse);
    assert.equal(paidResponse.statusCode, 422);
    assert.equal(paidResponse.json().error.code, 'not_free');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});
