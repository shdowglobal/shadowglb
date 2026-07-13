'use strict';

const { allowMethods, HttpError, queryParam, sendError, sendJson } = require('./_lib/http');
const { getStoreRow } = require('./_lib/supabase');
const { retrieveCheckoutSession } = require('./_lib/stripe');
const { findProduct, productDeliveryUrl, productName, validateProductId } = require('./_lib/store');

async function handler(req, res) {
  try {
    allowMethods(req, ['GET']);
    const session = await retrieveCheckoutSession(queryParam(req, 'session_id'));
    if (session.payment_status !== 'paid') {
      throw new HttpError(402, 'Payment has not been confirmed yet.', 'payment_not_confirmed');
    }
    const productId = validateProductId(session.metadata && session.metadata.product_id);
    const expectedAmount = Number(session.metadata && session.metadata.unit_amount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1 || session.amount_total !== expectedAmount) {
      throw new HttpError(409, 'The paid session could not be matched to the order.', 'order_mismatch');
    }
    const row = await getStoreRow();
    const product = findProduct(row.data, productId, { includeInactive: true });
    const deliveryUrl = productDeliveryUrl(product);
    const customerEmail = (session.customer_details && session.customer_details.email) || session.customer_email || null;
    const name = productName(product);
    sendJson(res, 200, {
      paid: true,
      sessionId: session.id,
      product: { id: productId, name },
      deliveryUrl,
      customerEmail,
      order: {
        productId,
        productName: name,
        amountTotal: session.amount_total,
        currency: String(session.currency || session.metadata.currency || 'gbp').toLowerCase(),
        customerEmail,
      },
      delivery: deliveryUrl ? { status: 'ready', url: deliveryUrl } : { status: 'pending', url: null },
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
