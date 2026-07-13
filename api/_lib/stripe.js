'use strict';

const crypto = require('crypto');
const { getStripeSecretKey } = require('./env');
const { HttpError } = require('./http');
const { fetchWithTimeout } = require('./supabase');

function parseStripeSignatureHeader(value) {
  const parsed = { timestamp: null, signatures: [] };
  for (const part of String(value || '').split(',')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const entry = part.slice(index + 1).trim();
    if (key === 't' && /^\d+$/.test(entry)) parsed.timestamp = Number(entry);
    if (key === 'v1' && /^[a-f0-9]{64}$/i.test(entry)) parsed.signatures.push(entry.toLowerCase());
  }
  return parsed;
}

function constantTimeHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyStripeSignature(rawBody, signatureHeader, secret, options = {}) {
  if (!Buffer.isBuffer(rawBody)) rawBody = Buffer.from(rawBody || '');
  if (typeof secret !== 'string' || !secret) return false;
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || !signatures.length) return false;
  const now = options.now == null ? Math.floor(Date.now() / 1000) : Number(options.now);
  const tolerance = options.tolerance == null ? 300 : Number(options.tolerance);
  if (!Number.isFinite(now) || !Number.isFinite(tolerance) || Math.abs(now - timestamp) > tolerance) return false;
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return signatures.some((signature) => constantTimeHexEqual(signature, expected));
}

async function stripeRequest(path, options = {}) {
  const response = await fetchWithTimeout(`https://api.stripe.com/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: options.body ? options.body.toString() : undefined,
  }, 15000);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch (_error) { payload = {}; }
  if (!response.ok) {
    const message = payload && payload.error && payload.error.message;
    throw new HttpError(502, message || 'Stripe could not process the request.', 'stripe_error');
  }
  return payload;
}

async function createCheckoutSession({ productId, name, description, unitAmount, currency, email, siteUrl }) {
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', currency);
  body.set('line_items[0][price_data][unit_amount]', String(unitAmount));
  body.set('line_items[0][price_data][product_data][name]', String(name).slice(0, 200));
  if (description) body.set('line_items[0][price_data][product_data][description]', String(description).slice(0, 500));
  body.set('metadata[product_id]', productId);
  body.set('metadata[unit_amount]', String(unitAmount));
  body.set('metadata[currency]', currency);
  body.set('payment_intent_data[metadata][product_id]', productId);
  body.set('success_url', `${siteUrl}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`);
  body.set('cancel_url', `${siteUrl}/products/${encodeURIComponent(productId)}/?checkout=cancelled`);
  if (email) body.set('customer_email', email);
  const session = await stripeRequest('/checkout/sessions', { method: 'POST', body });
  if (!session || typeof session.id !== 'string' || typeof session.url !== 'string' || !session.url.startsWith('https://')) {
    throw new HttpError(502, 'Stripe returned an invalid checkout session.', 'stripe_error');
  }
  return session;
}

async function retrieveCheckoutSession(sessionId) {
  if (typeof sessionId !== 'string' || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId) || sessionId.length > 255) {
    throw new HttpError(400, 'A valid Stripe session_id is required.', 'invalid_session_id');
  }
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

module.exports = {
  constantTimeHexEqual,
  createCheckoutSession,
  parseStripeSignatureHeader,
  retrieveCheckoutSession,
  stripeRequest,
  verifyStripeSignature,
};
