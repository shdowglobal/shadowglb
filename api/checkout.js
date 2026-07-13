'use strict';

const { getSiteUrl } = require('./_lib/env');
const { allowMethods, assertSameOrigin, HttpError, readJson, sendError, sendJson } = require('./_lib/http');
const { getStoreRow } = require('./_lib/supabase');
const { createCheckoutSession } = require('./_lib/stripe');
const { findProduct, parsePriceToMinor, productDeliveryUrl, productName, validateCheckoutBody, validateCurrency } = require('./_lib/store');

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    const input = validateCheckoutBody(await readJson(req, 32 * 1024));
    const row = await getStoreRow();
    const product = findProduct(row.data, input.productId);
    const name = productName(product);
    const unitAmount = parsePriceToMinor(product.price);
    const currency = validateCurrency(product.currency || 'gbp');
    if (!productDeliveryUrl(product)) {
      throw new HttpError(422, 'This product is not ready for secure delivery.', 'delivery_not_configured');
    }
    const session = await createCheckoutSession({
      productId: input.productId,
      name,
      description: product.description || product.desc || '',
      unitAmount,
      currency,
      email: input.email,
      siteUrl: getSiteUrl(req),
    });
    sendJson(res, 200, { url: session.url, sessionId: session.id });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
