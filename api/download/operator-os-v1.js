'use strict';

const fs = require('fs');
const path = require('path');
const { assertProtectedProductRoute } = require('../_lib/delivery');
const { allowMethods, HttpError, queryParam, sendError } = require('../_lib/http');
const { getStoreRow } = require('../_lib/supabase');
const { retrieveCheckoutSession } = require('../_lib/stripe');
const { findProduct, productDeliveryUrl, validateProductId } = require('../_lib/store');

const DELIVERY_PATH = '/api/download/operator-os-v1';
const PRODUCT_FILE = path.join(__dirname, '..', '_assets', 'operator-os-v1.html');

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
    assertProtectedProductRoute(productDeliveryUrl(product), DELIVERY_PATH);

    const file = fs.readFileSync(PRODUCT_FILE);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="OPERATOR-OS-v1.html"');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(file);
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
