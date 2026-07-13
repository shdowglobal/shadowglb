'use strict';

const { authenticateAdmin } = require('../_lib/auth');
const { allowMethods, queryParam, sendError, sendJson } = require('../_lib/http');
const { listOrders } = require('../_lib/supabase');

function integerParam(req, name, fallback, minimum, maximum) {
  const raw = queryParam(req, name);
  if (raw == null || raw === '') return fallback;
  const number = Number(raw);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function presentOrder(row) {
  return {
    id: row.id,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeEventId: row.stripe_event_id,
    productId: row.product_id,
    productName: row.product_name,
    buyerEmail: row.buyer_email,
    amountTotal: row.amount_total,
    currency: row.currency,
    status: row.status,
    deliveryLink: row.delivery_link,
    deliveryEmailSentAt: row.delivery_email_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handler(req, res) {
  try {
    allowMethods(req, ['GET']);
    await authenticateAdmin(req, res);
    const limit = integerParam(req, 'limit', 50, 1, 100);
    const offset = integerParam(req, 'offset', 0, 0, 1000000);
    const rows = await listOrders(limit, offset);
    sendJson(res, 200, { orders: rows.map(presentOrder), limit, offset });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
