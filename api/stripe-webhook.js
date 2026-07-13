'use strict';

const { getStripeWebhookSecret } = require('./_lib/env');
const { sendDeliveryEmail } = require('./_lib/email');
const { allowMethods, header, HttpError, readRawBody, sendError, sendJson } = require('./_lib/http');
const { getStoreRow, insertOrderOnce, markDeliveryEmailSent } = require('./_lib/supabase');
const { verifyStripeSignature } = require('./_lib/stripe');
const { findProduct, productDeliveryUrl, productName, validateEmail, validateProductId } = require('./_lib/store');

const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    const rawBody = await readRawBody(req, 2 * 1024 * 1024);
    if (!verifyStripeSignature(rawBody, header(req, 'stripe-signature'), getStripeWebhookSecret())) {
      throw new HttpError(400, 'Invalid Stripe webhook signature.', 'invalid_signature');
    }
    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch (_error) {
      throw new HttpError(400, 'Invalid Stripe webhook payload.', 'invalid_webhook');
    }
    if (!event || typeof event.id !== 'string' || !event.data || !event.data.object) {
      throw new HttpError(400, 'Invalid Stripe webhook payload.', 'invalid_webhook');
    }
    if (!PAID_EVENTS.has(event.type)) {
      sendJson(res, 200, { received: true, handled: false });
      return;
    }

    const session = event.data.object;
    if (session.object !== 'checkout.session' || session.payment_status !== 'paid' || typeof session.id !== 'string') {
      sendJson(res, 200, { received: true, handled: false, reason: 'not_paid' });
      return;
    }
    const productId = validateProductId(session.metadata && session.metadata.product_id);
    const expectedAmount = Number(session.metadata && session.metadata.unit_amount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1 || session.amount_total !== expectedAmount) {
      throw new HttpError(400, 'Stripe order metadata did not match the paid amount.', 'order_mismatch');
    }
    const row = await getStoreRow();
    const product = findProduct(row.data, productId, { includeInactive: true });
    const deliveryUrl = productDeliveryUrl(product);
    const candidateEmail = (session.customer_details && session.customer_details.email) || session.customer_email || null;
    const buyerEmail = validateEmail(candidateEmail) ? candidateEmail.trim().toLowerCase() : null;
    const now = new Date().toISOString();
    const result = await insertOrderOnce({
      stripe_session_id: session.id.slice(0, 255),
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent.slice(0, 255) : null,
      stripe_event_id: event.id.slice(0, 255),
      product_id: productId,
      product_name: productName(product),
      buyer_email: buyerEmail,
      amount_total: session.amount_total,
      currency: String(session.currency || session.metadata.currency || 'gbp').toLowerCase().slice(0, 3),
      status: 'paid',
      delivery_link: deliveryUrl,
      updated_at: now,
    });

    let email = { sent: false, skipped: result.inserted ? 'missing_delivery' : 'duplicate' };
    if (result.inserted && buyerEmail && deliveryUrl) {
      email = await sendDeliveryEmail({ to: buyerEmail, productName: productName(product), deliveryUrl });
      if (email.sent) {
        try { await markDeliveryEmailSent(session.id, new Date().toISOString()); } catch (_error) { /* order remains visible for manual review */ }
      }
    }
    sendJson(res, 200, { received: true, handled: true, duplicate: !result.inserted, emailSent: email.sent });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
